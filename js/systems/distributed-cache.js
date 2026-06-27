/* ============================================================
   distributed-cache.js — Distributed Cache (Redis Cluster)
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('distributed-cache', {
    name: 'Distributed Cache',
    icon: '⚡',
    params: {
      dau:         { label: 'Daily active users',  options: ['1M','10M','100M','1B'],      values: [1e6,1e7,1e8,1e9],          def: 1 },
      readQps:     { label: 'Read QPS',            options: ['10K','100K','1M','10M'],     values: [1e4,1e5,1e6,1e7],          def: 1 },
      cacheSize:   { label: 'Total cache size',    options: ['1 GB','10 GB','100 GB','1 TB'], values: [1e9,1e10,1e11,1e12],    def: 1 },
      objSize:     { label: 'Avg object size',     options: ['100 B','1 KB','10 KB','100 KB'], values: [100,1e3,1e4,1e5],      def: 1 },
      replication: { label: 'Replication factor',  type: 'select',
        options: ['No replication (1×)','Standard (3×)','High-HA (5×)'], values: [1,3,5], def: 1 },
    },

    compute(p) {
      const qps = p.readQps.v, cacheSize = p.cacheSize.v;
      const objSize = p.objSize.v, repl = p.replication.v;
      const keyCount = Math.round(cacheSize / objSize);
      const NODE_MEM = 16e9;
      const primaries = Math.max(1, Math.ceil(cacheSize / NODE_MEM));
      const totalNodes = primaries * repl;
      const maxOps = primaries * 100000;
      const writeQps = Math.ceil(qps * 0.1);
      const readBw = qps * objSize * 8;
      const missQps = Math.ceil(qps * 0.2);
      return {
        qps, writeQps, keyCount, primaries, totalNodes, cacheSize, objSize, repl,
        readBw, missQps, maxOps,
        bottleneck: qps > maxOps
          ? `Read QPS (${fmt(qps)}) exceeds cluster capacity (${fmt(maxOps)} ops/s). Scale to ${Math.ceil(qps/100000)} primaries.`
          : null,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.qps),        lbl: 'Read QPS',      cls: 'accent' },
        { val: fmt(c.missQps),    lbl: 'Cache miss/s',  cls: 'amber' },
        { val: fmt(c.keyCount),   lbl: 'Cached keys',   cls: 'teal' },
        { val: c.totalNodes,      lbl: 'Redis nodes',   cls: 'purple' },
        { val: fmtBw(c.readBw),   lbl: 'Read BW',       cls: 'green' },
      ];
    },

    steps(c) {
      return [
        { title: 'Clarify scope', summary: '5 design axes', body: `<table class="metrics-table">
  <tr><td>Cache strategy</td><td>Cache-aside (lazy loading)</td></tr>
  <tr><td>Eviction policy</td><td>allkeys-lru (evict on full)</td></tr>
  <tr><td>Consistency model</td><td>Eventual — stale reads OK</td></tr>
  <tr><td>TTL strategy</td><td>Per-key TTL + max-memory</td></tr>
  <tr><td>Hot-key handling</td><td class="warn">Local replica + jittered expiry</td></tr>
</table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.qps)} read → ${fmt(c.writeQps)} write QPS`, body: `<div class="formula-box">
readQps = DAU × requests/user/day ÷ 86,400<br>
writeQps = readQps × <span class="v">0.10</span> (10% write ratio)<br>
miss QPS = readQps × <span class="v">0.20</span> (assumed 80% hit rate)<br>
→ origin absorbs <span class="r">${fmt(c.missQps)}</span> req/s on miss</div>
<table class="metrics-table">
  <tr><td>Read QPS</td><td class="hl">${fmt(c.qps)}</td></tr>
  <tr><td>Write QPS (10%)</td><td>${fmt(c.writeQps)}</td></tr>
  <tr><td>Cache miss QPS (20%)</td><td class="warn">${fmt(c.missQps)}</td></tr>
  <tr><td>Read bandwidth</td><td class="hl">${fmtBw(c.readBw)}</td></tr>
</table>` },
        { title: 'Cache sizing', summary: `${fmtB(c.cacheSize)} → ${fmt(c.keyCount)} keys`, body: `<div class="formula-box">
keys = cacheSize ÷ avg_object_size<br>
&nbsp;&nbsp;= <span class="v">${fmtB(c.cacheSize)}</span> ÷ <span class="v">${fmtB(c.objSize)}</span> = <span class="r">${fmt(c.keyCount)}</span></div>
<table class="metrics-table">
  <tr><td>Total cache capacity</td><td class="hl">${fmtB(c.cacheSize)}</td></tr>
  <tr><td>Avg object size</td><td>${fmtB(c.objSize)}</td></tr>
  <tr><td>Cached key count</td><td class="hl">${fmt(c.keyCount)}</td></tr>
  <tr><td>Hot key set (80/20 rule)</td><td>${fmt(c.keyCount * 0.2)} keys</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Pareto principle</div><div class="info-box-body">20% of keys get 80% of traffic. Size your cache for the hot set, not the full dataset.</div></div>` },
        { title: 'Eviction & memory', summary: `allkeys-lru + max-memory ${fmtB(c.cacheSize)}`, body: `<table class="metrics-table">
  <tr><td>Redis max-memory policy</td><td>allkeys-lru</td></tr>
  <tr><td>Key expiry</td><td>TTL per entry + background sweep</td></tr>
  <tr><td>Memory fragmentation</td><td>~1.2× overhead → budget ${fmtB(c.cacheSize * 1.2)}</td></tr>
  <tr><td>Thundering herd</td><td class="warn">Jitter TTL ±10% to stagger</td></tr>
</table>` },
        { title: 'Node count & replication', summary: `${c.primaries} primary → ${c.totalNodes} total`, body: `<div class="formula-box">
primaries = ceil(cacheSize ÷ 16 GB per node) = <span class="r">${c.primaries}</span><br>
total = primaries × ${c.repl}× replication = <span class="r">${c.totalNodes}</span><br>
max ops = ${c.primaries} × 100K = <span class="r">${fmt(c.maxOps)}</span> ops/s</div>
<table class="metrics-table">
  <tr><td>Redis node memory</td><td>16 GB</td></tr>
  <tr><td>Primary nodes</td><td class="hl">${c.primaries}</td></tr>
  <tr><td>Replica factor</td><td>${c.repl}×</td></tr>
  <tr><td>Total Redis instances</td><td class="good">${c.totalNodes}</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const ol = c.qps > c.maxOps;
      return drawArch([
        { id: 'cli',   x: 115, y: 14,  w: 130, h: 34, label: 'Clients',                  color: '#2BA07E' },
        { id: 'lb',    x: 85,  y: 76,  w: 190, h: 34, label: 'Load Balancer',             color: '#2BA07E' },
        { id: 'proxy', x: 55,  y: 140, w: 250, h: 34, label: 'Cache Client / Proxy',      color: '#14b8a6' },
        { id: 'redis', x: 35,  y: 204, w: 290, h: 34, label: `Redis Cluster (${c.totalNodes})`, color: ol ? '#ef4444' : '#14b8a6' },
        { id: 'db',    x: 85,  y: 272, w: 190, h: 34, label: 'Origin Database',           color: '#a855f7', dim: true },
      ], [
        { from: 'cli',   to: 'lb' },
        { from: 'lb',    to: 'proxy' },
        { from: 'proxy', to: 'redis', label: 'GET/SET' },
        { from: 'proxy', to: 'db',    label: 'miss →' },
      ]);
    },

    components() {
      return [
        { icon: '⚡', name: 'Redis Cluster', best: true, reason: 'Atomic operations via Lua, sub-ms P99, native TTL and clustering. 100K+ ops/s per primary node. Industry standard.',  stats: ['<1ms P99','100K ops/s','Lua atomics','Cluster mode'] },
        { icon: '📦', name: 'Memcached',    best: false, reason: 'Higher raw throughput, multi-threaded. No built-in replication, no persistence, no sorted sets.', stats: ['No replication','No persistence','Faster raw'] },
        { icon: '☕', name: 'Hazelcast',    best: false, reason: 'Java-native distributed map with JVM embedding. Powerful but operationally heavier than Redis.',  stats: ['JVM overhead','Embedded option'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Cache-aside',    pro: 'Only loads what is read',        con: 'Cold start — first request always misses' },
        { algo: 'Write-through',  pro: 'Cache always consistent',        con: 'Write latency added on every mutation' },
        { algo: 'Write-behind',   pro: 'Fastest writes (async to DB)',   con: 'Data loss window if node crashes before flush' },
      ];
    },

    tips: [
      'Never cache mutable aggregates without a TTL — stale counts silently accumulate',
      'Set maxmemory-policy allkeys-lru so Redis self-evicts on pressure; without it, writes fail',
      'Use Redis SCAN not KEYS in production — KEYS blocks the event loop on large keyspaces',
      'Hot key problem: a single key at 1M QPS saturates one shard. Solution: replicate to N local shards and hash {key}-{rand(N)}',
      'Monitor hit rate with INFO stats; below 80% means either the cache is undersized or wrong keys are cached',
    ],
  });
})();
