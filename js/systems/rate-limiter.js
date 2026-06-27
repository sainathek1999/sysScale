/* ============================================================
   rate-limiter.js — Rate Limiter system definition
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('rate-limiter', {
    name: 'Rate Limiter',
    icon: '🚦',
    params: {
      dau:  { label: 'Daily active users', options: ['1M', '10M', '100M', '500M', '1B'], values: [1e6, 10e6, 100e6, 500e6, 1e9], def: 2 },
      rpd:  { label: 'Requests / user / day', options: ['10', '100', '500', '1K', '5K'], values: [10, 100, 500, 1000, 5000], def: 2 },
      algo: { label: 'Algorithm', type: 'select', options: ['Token bucket', 'Sliding window log', 'Fixed window counter'], def: 0 },
    },

    compute(p) {
      const dau = p.dau.v, rpd = p.rpd.v;
      const rps = Math.round(dau * rpd / 86400), peak = rps * 5;
      const algoData = [
        { bpk: 20, label: 'Token bucket', desc: '1 key/user storing {tokens, refill_ts}. Allows bursts up to bucket size. Industry standard for API limiting.' },
        { bpk: 5000, label: 'Sliding window log', desc: 'Sorted set of timestamps. Most accurate — no edge burst problem. ~250× more memory than token bucket.' },
        { bpk: 16, label: 'Fixed window counter', desc: '1 int + TTL per user. Cheapest option. Known 2× burst problem at window boundaries.' },
      ][p.algo.i];
      const mem = dau * algoData.bpk;
      const bwIn = peak * 500 * 8, bwOut = peak * 200 * 8;
      const redisNodes = Math.max(1, Math.ceil(peak * 2 / 100000));
      return {
        dau, rpd, rps, peak, algo: algoData, mem, bwIn, bwOut,
        redisNodes, redisTotal: redisNodes * 3,
        bottleneck: peak * 2 > 500000 ? `Redis at ${fmt(peak * 2)} ops/s — shard across ${redisNodes} primaries with consistent hashing` : null
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.rps), lbl: 'Avg RPS', cls: 'accent' },
        { val: fmt(c.peak), lbl: 'Peak RPS', cls: 'amber' },
        { val: fmtB(c.mem), lbl: 'Redis memory', cls: 'teal' },
        { val: c.redisTotal, lbl: 'Redis instances', cls: 'purple' },
        { val: fmtBw(c.bwIn), lbl: 'Inbound BW', cls: 'green' },
      ];
    },

    steps(c, p) {
      return [
        { title: 'Clarify scope', summary: '5 key decisions', body: `<table class="metrics-table">
          <tr><td>Where does limiting happen?</td><td>API Gateway (centralized)</td></tr>
          <tr><td>Granularity</td><td>Per user + per IP + per endpoint</td></tr>
          <tr><td>Storage backend</td><td>Redis — sub-ms, atomic INCR</td></tr>
          <tr><td>Consistency model</td><td>Eventual — soft limits OK</td></tr>
          <tr><td>Throttle response</td><td class="warn">HTTP 429 + Retry-After</td></tr>
        </table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.rps)} avg → ${fmt(c.peak)} peak RPS`, body: `<div class="formula-box">
RPS = DAU × req/user/day ÷ 86,400<br>
&nbsp;&nbsp;= <span class="v">${fmt(c.dau)}</span> × <span class="v">${c.rpd}</span> ÷ 86,400 = <span class="r">${fmt(c.rps)}</span><br>
Peak = avg × 5 = <span class="r">${fmt(c.peak)}</span></div>
<table class="metrics-table">
  <tr><td>DAU</td><td class="hl">${fmt(c.dau)}</td></tr>
  <tr><td>Requests / user / day</td><td>${c.rpd}</td></tr>
  <tr><td>Average RPS</td><td class="hl">${fmt(c.rps)}</td></tr>
  <tr><td>Peak RPS <span class="tag tag-amber">×5</span></td><td class="warn">${fmt(c.peak)}</td></tr>
</table>` },
        { title: 'Storage estimation', summary: `${fmtB(c.mem)} · ${c.algo.label}`, body: `<div class="formula-box">
keys = DAU (1 per user)<br>
bytes/key = <span class="v">${c.algo.bpk}B</span> (${c.algo.label})<br>
total = <span class="v">${fmt(c.dau)}</span> × <span class="v">${c.algo.bpk}B</span> = <span class="r">${fmtB(c.mem)}</span></div>
<table class="metrics-table">
  <tr><td>Keys in Redis</td><td>${fmt(c.dau)}</td></tr>
  <tr><td>Bytes per key</td><td>${c.algo.bpk >= 1000 ? fmtB(c.algo.bpk) : c.algo.bpk + ' B'}</td></tr>
  <tr><td>Total Redis memory</td><td class="hl">${fmtB(c.mem)}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">${c.algo.label}</div><div class="info-box-body">${c.algo.desc}</div></div>` },
        { title: 'Bandwidth estimation', summary: `${fmtBw(c.bwIn)} in / ${fmtBw(c.bwOut)} out`, body: `<div class="formula-box">BW = peak RPS × payload × 8 bits</div>
<table class="metrics-table">
  <tr><td>Avg request size</td><td>500 B</td></tr>
  <tr><td>Avg response (429 / pass-through)</td><td>200 B</td></tr>
  <tr><td>Inbound bandwidth</td><td class="hl">${fmtBw(c.bwIn)}</td></tr>
  <tr><td>Outbound bandwidth</td><td class="hl">${fmtBw(c.bwOut)}</td></tr>
</table>` },
        { title: 'Node count & replication', summary: `${c.redisNodes} primary → ${c.redisTotal} total`, body: `<div class="formula-box">
ops/s = peak RPS × 2 (read + INCR)<br>
nodes = ceil(<span class="v">${fmt(c.peak * 2)}</span> ÷ 100,000) = <span class="r">${c.redisNodes}</span><br>
total (3× replication) = <span class="r">${c.redisTotal}</span></div>
<table class="metrics-table">
  <tr><td>Single Redis throughput</td><td>~100K ops/s</td></tr>
  <tr><td>Ops per request</td><td>2 (check + increment)</td></tr>
  <tr><td>Primary nodes needed</td><td class="hl">${c.redisNodes}</td></tr>
  <tr><td>Total instances (3× repl)</td><td class="good">${c.redisTotal}</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const ol = c.peak > 200000;
      return drawArch([
        { id: 'client', x: 115, y: 14, w: 130, h: 34, label: 'Clients', color: '#2BA07E' },
        { id: 'gw', x: 85, y: 76, w: 190, h: 34, label: 'API Gateway', color: '#2BA07E' },
        { id: 'rl', x: 85, y: 140, w: 190, h: 34, label: 'Rate Limiter', color: '#14b8a6' },
        { id: 'redis', x: 45, y: 204, w: 270, h: 34, label: `Redis Cluster (${c.redisTotal})`, color: ol ? '#ef4444' : '#14b8a6' },
        { id: 'svc', x: 85, y: 272, w: 190, h: 34, label: 'Upstream Service', color: '#a855f7' },
      ], [
        { from: 'client', to: 'gw', label: '' },
        { from: 'gw', to: 'rl', label: 'every req' },
        { from: 'rl', to: 'redis', label: 'INCR+TTL' },
        { from: 'rl', to: 'svc', label: 'allow/429' },
      ]);
    },

    components() {
      return [
        { icon: '⚡', name: 'Redis', best: true, reason: 'Atomic INCR, sub-ms latency, native TTL. Single node handles 100K+ ops/s. Use Redis Cluster for sharding beyond that.', stats: ['<1ms P99', '100K ops/s', 'Atomic INCR', 'TTL native'] },
        { icon: '📦', name: 'Memcached', best: false, reason: "Faster raw throughput but no Lua scripting — can't atomically read-then-increment in one round-trip.", stats: ['No Lua', 'No atomic RW'] },
        { icon: '💻', name: 'In-process', best: false, reason: 'Zero latency but state is per-instance — breaks immediately with multiple gateway nodes.', stats: ['Zero latency', 'Not distributed'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Token bucket', pro: 'Handles bursts gracefully', con: 'Slightly complex refill logic' },
        { algo: 'Sliding window log', pro: 'Perfectly accurate', con: `High memory (${fmtB(5000 * c.dau)})` },
        { algo: 'Fixed window counter', pro: 'Minimal memory', con: '2× burst at window boundary' },
      ];
    },

    tips: [
      'Use Lua EVAL for atomic check-and-increment — prevents the race between GET and INCR',
      'Set key TTL = window size so keys self-expire and memory stays bounded automatically',
      'Return X-RateLimit-Remaining + X-RateLimit-Reset headers so clients back off intelligently',
      'Multi-datacenter: local Redis per region with eventual sync — never cross-region on the hot path',
      'Separate burst_size from rate in token bucket — lets batch clients accumulate tokens overnight',
    ],
  });
})();
