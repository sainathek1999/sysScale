/* ============================================================
   payment.js — Payment Processing System
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('payment', {
    name: 'Payment System',
    icon: '💳',
    params: {
      tps:              { label: 'Transactions / second', options: ['10','100','1K','10K'],          values: [10,100,1e3,1e4],      def: 1 },
      fraudLatency:     { label: 'Fraud check SLA',       type: 'select',
        options: ['100 ms (relaxed)','50 ms (standard)','20 ms (strict)'], values: [100,50,20], def: 1 },
      idempotencyWindow:{ label: 'Idempotency window',    options: ['1 min','1 hr','24 hr','7 day'], values: [60,3600,86400,604800], def: 2 },
      auditRetention:   { label: 'Audit log retention',   options: ['1 yr','5 yr','7 yr','10 yr'],  values: [1,5,7,10],            def: 1 },
    },

    compute(p) {
      const tps = p.tps.v, fraudLatency = p.fraudLatency.v;
      const idempotencyWindow = p.idempotencyWindow.v, auditRetention = p.auditRetention.v;
      const dbIops          = tps * 3;
      const dbNodes         = Math.max(1, Math.ceil(dbIops / 10000));
      const idempotencyKeys = tps * idempotencyWindow;
      const idempotencyMem  = idempotencyKeys * 128;
      const auditBytesPerSec = tps * 500;
      const auditTotal      = auditBytesPerSec * 86400 * 365 * auditRetention;
      const fraudCacheHit   = fraudLatency <= 50;
      return {
        tps, fraudLatency, idempotencyWindow, auditRetention,
        dbIops, dbNodes, idempotencyKeys, idempotencyMem,
        auditBytesPerSec, auditTotal, fraudCacheHit,
        bottleneck: dbIops > 50000
          ? `DB IOPS (${fmt(dbIops)}) exceeds single cluster capacity. Shard by payment method or merchant ID.`
          : idempotencyMem > 100e9
          ? `Idempotency key store (${fmtB(idempotencyMem)}) too large for Redis. Persist to Cassandra with TTL.`
          : null,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.tps),               lbl: 'TPS',                 cls: 'accent' },
        { val: c.fraudLatency + ' ms',   lbl: 'Fraud SLA',           cls: c.fraudLatency <= 50 ? 'green' : 'amber' },
        { val: fmt(c.idempotencyKeys),   lbl: 'Idempotency keys',    cls: 'teal' },
        { val: c.dbNodes,                lbl: 'DB nodes',            cls: 'purple' },
        { val: fmtB(c.auditTotal),       lbl: 'Audit log total',     cls: 'amber' },
      ];
    },

    steps(c) {
      return [
        { title: 'Clarify scope', summary: '5 critical constraints', body: `<table class="metrics-table">
  <tr><td>Consistency model</td><td class="warn">Strong — double-charge = catastrophic</td></tr>
  <tr><td>Idempotency</td><td>Required — retries must be safe</td></tr>
  <tr><td>Fraud detection</td><td>Synchronous, inline, < ${c.fraudLatency} ms</td></tr>
  <tr><td>Regulatory</td><td>PCI-DSS Level 1, SOX (7-yr audit)</td></tr>
  <tr><td>Currency handling</td><td>Integer cents only — never float</td></tr>
</table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.tps)} TPS → ${fmt(c.dbIops)} DB IOPS`, body: `<div class="formula-box">
db_iops = tps × 3 (read balance, debit ledger, credit ledger)<br>
= <span class="v">${fmt(c.tps)}</span> × 3 = <span class="r">${fmt(c.dbIops)}</span> IOPS<br>
db_nodes = ceil(${fmt(c.dbIops)} ÷ 10K IOPS/node) = <span class="r">${c.dbNodes}</span></div>
<table class="metrics-table">
  <tr><td>Transactions/s</td><td class="hl">${fmt(c.tps)}</td></tr>
  <tr><td>DB IOPS (3 per txn)</td><td class="hl">${fmt(c.dbIops)}</td></tr>
  <tr><td>DB nodes required</td><td>${c.dbNodes}</td></tr>
  <tr><td>Consistency level</td><td class="warn">SERIALIZABLE</td></tr>
</table>` },
        { title: 'Idempotency', summary: `${fmt(c.idempotencyKeys)} keys · ${fmtB(c.idempotencyMem)}`, body: `<div class="formula-box">
keys = tps × window_seconds<br>
= <span class="v">${fmt(c.tps)}</span> × <span class="v">${c.idempotencyWindow}</span>s = <span class="r">${fmt(c.idempotencyKeys)}</span><br>
memory = keys × 128 B = <span class="r">${fmtB(c.idempotencyMem)}</span></div>
<table class="metrics-table">
  <tr><td>Idempotency window</td><td>${c.idempotencyWindow}s</td></tr>
  <tr><td>Active keys</td><td class="hl">${fmt(c.idempotencyKeys)}</td></tr>
  <tr><td>Key store size</td><td>${fmtB(c.idempotencyMem)}</td></tr>
  <tr><td>Implementation</td><td>${c.idempotencyMem > 100e9 ? 'Cassandra (TTL)' : 'Redis (TTL)'}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Idempotency key design</div><div class="info-box-body">Client generates a UUID per payment attempt. Server stores outcome keyed by UUID. Retry returns same stored result — prevents double-charge on timeout retries.</div></div>` },
        { title: 'Fraud detection', summary: `${c.fraudLatency} ms SLA · ML + rules`, body: `<table class="metrics-table">
  <tr><td>Rules engine</td><td>&lt; 5 ms (velocity checks, blocklists)</td></tr>
  <tr><td>ML model inference</td><td>${c.fraudCacheHit ? '< 20 ms (cached features)' : '< 80 ms (real-time features)'}</td></tr>
  <tr><td>Feature store</td><td>Redis (precomputed user spending patterns)</td></tr>
  <tr><td>Total SLA</td><td class="${c.fraudLatency <= 50 ? 'good' : 'warn'}">${c.fraudLatency} ms budget</td></tr>
</table>` },
        { title: 'Audit & compliance', summary: `${fmtB(c.auditBytesPerSec)}/s → ${fmtB(c.auditTotal)} total`, body: `<div class="formula-box">
audit_rate = tps × 500 B per record<br>
= <span class="v">${fmt(c.tps)}</span> × 500 = <span class="r">${fmtB(c.auditBytesPerSec)}/s</span><br>
total_${c.auditRetention}yr = rate × 86,400 × 365 × ${c.auditRetention} = <span class="r">${fmtB(c.auditTotal)}</span></div>
<table class="metrics-table">
  <tr><td>Audit record rate</td><td>${fmtB(c.auditBytesPerSec)}/s</td></tr>
  <tr><td>Retention period</td><td>${c.auditRetention} years (PCI + SOX)</td></tr>
  <tr><td>Total audit storage</td><td class="hl">${fmtB(c.auditTotal)}</td></tr>
  <tr><td>Storage tier</td><td>WORM (write-once) → cold storage</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const dbHot = c.dbIops > 50000;
      return drawArch([
        { id: 'cli',   x: 115, y: 14,  w: 130, h: 34, label: 'Client / Merchant SDK',     color: '#2BA07E' },
        { id: 'api',   x: 55,  y: 76,  w: 250, h: 34, label: 'Payment API (idempotency gate)', color: '#2BA07E' },
        { id: 'fraud', x: 55,  y: 140, w: 250, h: 34, label: `Fraud Engine (${c.fraudLatency}ms SLA)`, color: '#f59e0b' },
        { id: 'db',    x: 35,  y: 204, w: 290, h: 34, label: `Ledger DB (${c.dbNodes} nodes · SERIALIZABLE)`, color: dbHot ? '#ef4444' : '#14b8a6' },
        { id: 'audit', x: 75,  y: 272, w: 210, h: 34, label: 'Audit Log (WORM)',           color: '#a855f7' },
      ], [
        { from: 'cli',   to: 'api',   label: 'idempotency key' },
        { from: 'api',   to: 'fraud', label: 'score request' },
        { from: 'fraud', to: 'db',    label: 'commit txn' },
        { from: 'db',    to: 'audit', label: 'append' },
      ]);
    },

    components() {
      return [
        { icon: '🏦', name: 'CockroachDB',   best: true,  reason: 'Serializable isolation, distributed ACID, geo-partitioning by user region. Handles ledger consistency without 2PC coordination.', stats: ['Serializable','Geo-partition','ACID'] },
        { icon: '🐘', name: 'PostgreSQL',     best: false, reason: 'Gold standard for ACID ledgers. Needs manual sharding at high TPS. Use with PgBouncer for connection pooling.',       stats: ['True ACID','Mature','Single-node shards'] },
        { icon: '⚡', name: 'Redis (idempotency)', best: false, reason: 'Perfect for idempotency key store with TTL. SETNX ensures exactly-once key creation atomically.', stats: ['SETNX atomic','TTL support','Sub-ms'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Synchronous fraud check', pro: 'Block fraudulent charge immediately',       con: 'Adds latency to every transaction; must be < 100ms or customer feels it' },
        { algo: 'Async fraud review',      pro: 'Zero impact on payment latency',           con: 'Funds may already be settled before fraud is detected' },
        { algo: 'Two-phase commit (2PC)',  pro: 'Atomic multi-resource transactions',        con: 'Blocks on coordinator failure; performance degrades non-linearly' },
      ];
    },

    tips: [
      'Never use float for money. Store in integer cents (or smallest currency unit). 0.1 + 0.2 = 0.30000000000000004 in IEEE 754',
      'Idempotency keys are not optional — any retry without them risks double-charging; make the key a required API field',
      'Saga pattern over distributed transactions: split payment into steps (reserve, capture, settle) with compensating actions on failure',
      'Ledger design: immutable append-only records only. Never UPDATE a transaction row — only INSERT new records (double-entry bookkeeping)',
      'PCI-DSS scope creep: anything that touches raw card data is in scope. Tokenize early via a vault service to minimize scope surface',
    ],
  });
})();
