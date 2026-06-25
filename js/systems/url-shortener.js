/* ============================================================
   url-shortener.js — URL Shortener system definition
   ============================================================ */
(function () {
  const { fmt, fmtB, drawArch } = window.SS;

  window.SS.register('url-shortener', {
    name: 'URL Shortener',
    icon: '🔗',
    params: {
      dau:    { label: 'Daily active users', options: ['1M', '10M', '100M', '500M', '1B'], values: [1e6, 10e6, 100e6, 500e6, 1e9], def: 2 },
      wpct:   { label: 'Write % (new URLs)', options: ['1%', '5%', '10%', '20%', '50%'], values: [0.01, 0.05, 0.10, 0.20, 0.50], def: 1 },
      urlLen: { label: 'Avg long URL length', options: ['100B', '500B', '1KB', '2KB'], values: [100, 500, 1000, 2000], def: 1 },
      ttl:    { label: 'URL TTL (years)', options: ['1yr', '3yr', '5yr', '10yr', '∞'], values: [1, 3, 5, 10, 100], def: 2 },
    },

    compute(p) {
      const dau = p.dau.v;
      const rps = Math.round(dau * 100 / 86400);
      const writes = Math.round(rps * p.wpct.v), reads = rps - writes, peak = rps * 5;
      const urlsPerDay = dau * p.wpct.v, totalUrls = urlsPerDay * 365 * p.ttl.v;
      const bpr = p.urlLen.v + 30, totalStorage = totalUrls * bpr;
      const cacheMem = totalUrls * 0.2 * bpr;
      const dbNodes = Math.max(1, Math.ceil(totalStorage / (500 * 1e9)));
      return {
        dau, rps, reads, writes, peak, urlsPerDay, totalUrls, totalStorage, cacheMem, dbNodes, urlLen: p.urlLen.v, ttl: p.ttl.v, wpct: p.wpct.v,
        bottleneck: reads > 500000 ? `Read path at ${fmt(reads)} RPS — add CDN + cache tier in front of DB` : null
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.rps), lbl: 'Avg RPS', cls: 'accent' },
        { val: fmt(c.writes) + '/s', lbl: 'Writes', cls: 'amber' },
        { val: fmtB(c.totalStorage), lbl: 'Total storage', cls: 'teal' },
        { val: fmtB(c.cacheMem), lbl: 'Cache size', cls: 'green' },
        { val: c.dbNodes, lbl: 'DB shards', cls: 'purple' },
      ];
    },

    steps(c, p) {
      return [
        { title: 'Clarify scope', summary: 'Core decisions', body: `<table class="metrics-table">
          <tr><td>Core operations</td><td>Shorten URL + Redirect</td></tr>
          <tr><td>Short key length</td><td>7 chars (base62) = 3.5T possibilities</td></tr>
          <tr><td>Read:write ratio</td><td class="hl">${Math.round((1 - c.wpct) / c.wpct)}:1 (read-heavy)</td></tr>
          <tr><td>Custom aliases?</td><td>Yes — user-defined short codes</td></tr>
          <tr><td>Analytics?</td><td>Click counts, geo, referrer</td></tr>
        </table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.reads)} reads + ${fmt(c.writes)} writes/s`, body: `<div class="formula-box">
total_rps = DAU × 100 req/day ÷ 86,400 = <span class="r">${fmt(c.rps)}</span><br>
reads = total × (1 - write%) = <span class="r">${fmt(c.reads)}</span><br>
writes = total × write% = <span class="r">${fmt(c.writes)}</span></div>
<table class="metrics-table">
  <tr><td>Read RPS (redirects)</td><td class="hl">${fmt(c.reads)}</td></tr>
  <tr><td>Write RPS (new URLs)</td><td class="warn">${fmt(c.writes)}</td></tr>
  <tr><td>New URLs / day</td><td>${fmt(c.urlsPerDay)}</td></tr>
  <tr><td>Peak RPS <span class="tag tag-amber">×5</span></td><td class="warn">${fmt(c.peak)}</td></tr>
</table>` },
        { title: 'Storage estimation', summary: `${fmtB(c.totalStorage)} over ${c.ttl}yr`, body: `<div class="formula-box">
URLs = ${fmt(c.urlsPerDay)}/day × 365 × ${c.ttl}yr = <span class="v">${fmt(c.totalUrls)}</span><br>
bytes/record = ${c.urlLen}B URL + 7B key + 23B meta = <span class="v">${c.urlLen + 30}B</span><br>
total = <span class="r">${fmtB(c.totalStorage)}</span></div>
<table class="metrics-table">
  <tr><td>Total URLs stored</td><td class="hl">${fmt(c.totalUrls)}</td></tr>
  <tr><td>Bytes per record</td><td>${c.urlLen + 30} B</td></tr>
  <tr><td>Total DB storage</td><td class="hl">${fmtB(c.totalStorage)}</td></tr>
  <tr><td>DB shards (500GB each)</td><td class="good">${c.dbNodes}</td></tr>
</table>` },
        { title: 'Cache layer (Pareto)', summary: `${fmtB(c.cacheMem)} · 80% hit rate`, body: `<div class="formula-box">
Hot URLs = top 20% gets 80% of traffic (Pareto)<br>
cache = 20% × ${fmt(c.totalUrls)} × ${c.urlLen + 30}B = <span class="r">${fmtB(c.cacheMem)}</span></div>
<table class="metrics-table">
  <tr><td>Cache strategy</td><td>Redis LRU</td></tr>
  <tr><td>Hot URL set (20%)</td><td>${fmt(c.totalUrls * 0.2)}</td></tr>
  <tr><td>Cache memory needed</td><td class="hl">${fmtB(c.cacheMem)}</td></tr>
  <tr><td>Expected hit rate</td><td class="good">~80%</td></tr>
</table>` },
        { title: 'ID generation', summary: 'Counter + base62 (best)', body: `<table class="metrics-table">
  <tr><td>Base62 charset</td><td>a-z A-Z 0-9 = 62 chars</td></tr>
  <tr><td>7-char keyspace</td><td>62^7 = 3.5 trillion URLs</td></tr>
  <tr><td>Option A: Counter+base62</td><td class="hl">No collisions. Range-allocate.</td></tr>
  <tr><td>Option B: Hash+truncate</td><td>MD5 → first 7 chars, retry on collision</td></tr>
  <tr><td>Option C: Snowflake ID</td><td>Distributed, time-ordered</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Best choice: Distributed counter + base62</div>
<div class="info-box-body">Pre-allocate counter ranges (e.g. 1000 IDs) to each API server, no coordination on the hot path. Convert to base62 for the 7-char short key.</div></div>` },
      ];
    },

    arch(c) {
      return drawArch([
        { id: 'client', x: 110, y: 14, w: 140, h: 34, label: 'Client', color: '#6366f1' },
        { id: 'cdn', x: 45, y: 76, w: 270, h: 34, label: 'CDN (popular redirects)', color: '#f59e0b' },
        { id: 'api', x: 85, y: 140, w: 190, h: 34, label: 'API Servers', color: '#6366f1' },
        { id: 'cache', x: 45, y: 204, w: 115, h: 34, label: 'Redis Cache', color: '#14b8a6' },
        { id: 'db', x: 185, y: 204, w: 135, h: 34, label: `DB (${c.dbNodes} shards)`, color: c.dbNodes > 3 ? '#ef4444' : '#14b8a6' },
        { id: 'kgen', x: 85, y: 272, w: 190, h: 34, label: 'Key Generator', color: '#a855f7' },
      ], [
        { from: 'client', to: 'cdn', label: '' },
        { from: 'cdn', to: 'api', label: 'miss' },
        { from: 'api', to: 'cache', label: 'read' },
        { from: 'api', to: 'db', label: 'write' },
        { from: 'api', to: 'kgen', label: 'new URL' },
      ]);
    },

    components() {
      return [
        { icon: '🗄️', name: 'Cassandra / DynamoDB', best: true, reason: 'Wide-column, horizontally scalable. Perfect for key→value lookup. ~1ms reads. Native TTL for expiry. Linear write scale.', stats: ['<1ms read', 'Linear scale', 'Native TTL', 'No SPOF'] },
        { icon: '⚡', name: 'Redis (cache)', best: true, reason: 'LRU cache on top of DB. Pareto: cache 20% of URLs to serve 80% of traffic. Use Redis Cluster to scale memory.', stats: ['~80% hit rate', 'LRU evict', '<0.5ms', 'Cluster'] },
        { icon: '🐘', name: 'PostgreSQL', best: false, reason: 'Works at smaller scale with indexing. Becomes a bottleneck above ~500K RPS without manual sharding.', stats: ['Easy ops', 'ACID', 'Hard to shard'] },
      ];
    },

    tradeoffs() {
      return [
        { algo: 'Hash + truncate', pro: 'Stateless, simple', con: 'Collision handling required' },
        { algo: 'Counter + base62', pro: 'Zero collisions, ordered', con: 'Counter coordination overhead' },
        { algo: 'Snowflake ID', pro: 'Distributed, time-ordered', con: 'More complex infrastructure' },
      ];
    },

    tips: [
      '7 base62 chars = 3.5 trillion URLs — mention this; it shows you reasoned about the keyspace',
      '301 (permanent, browser caches) vs 302 (temporary, logs every hit) redirect — discuss the tradeoff',
      'CDN at the edge for popular URLs completely bypasses your stack — a huge scaling lever',
      'Separate read replicas for the redirect path — read:write ratio is extremely skewed',
      'Bloom filter to reject invalid short codes without hitting the DB at all',
    ],
  });
})();
