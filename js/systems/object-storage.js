/* ============================================================
   object-storage.js — Object Storage (S3-compatible)
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('object-storage', {
    name: 'Object Storage',
    icon: '📦',
    params: {
      uploadsPerDay: { label: 'Uploads per day',    options: ['1K','100K','10M','1B'],         values: [1e3,1e5,1e7,1e9],    def: 2 },
      objSize:       { label: 'Avg object size',    options: ['10 KB','1 MB','50 MB','1 GB'],  values: [1e4,1e6,5e7,1e9],    def: 1 },
      rwRatio:       { label: 'Read : Write ratio', type: 'select',
        options: ['1:1 (balanced)','10:1 (read-heavy)','100:1 (CDN origin)','1,000:1 (hot asset)'],
        values: [1,10,100,1000], def: 1 },
      retention:     { label: 'Retention period',   options: ['1 yr','5 yr','10 yr','50 yr'],  values: [1,5,10,50],          def: 1 },
    },

    compute(p) {
      const uploadsPerDay = p.uploadsPerDay.v, objSize = p.objSize.v;
      const rwRatio = p.rwRatio.v, retention = p.retention.v;
      const writeQps    = uploadsPerDay / 86400;
      const readQps     = writeQps * rwRatio;
      const totalObjs   = uploadsPerDay * 365 * retention;
      const totalStorage = totalObjs * objSize;
      const writeBw     = writeQps * objSize * 8;
      const readBw      = readQps * objSize * 8;
      const chunkServers = Math.max(1, Math.ceil(totalStorage / 100e12));
      const metaBytes   = totalObjs * 200;
      const metaDbNodes = Math.max(1, Math.ceil(metaBytes / 1e12));
      return {
        uploadsPerDay, objSize, rwRatio, retention,
        writeQps, readQps, totalObjs, totalStorage,
        writeBw, readBw, chunkServers, metaBytes, metaDbNodes,
        bottleneck: totalObjs > 1e12
          ? `${fmt(totalObjs)} objects overwhelms single metadata DB. Shard metadata by bucket+key prefix across ${Math.ceil(totalObjs/1e12)} DB shards.`
          : readBw > 10e9
          ? `Read bandwidth (${fmtBw(readBw)}) requires CDN layer in front to offload origin.`
          : null,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.readQps),         lbl: 'Read QPS',        cls: 'accent' },
        { val: fmtB(c.totalStorage),   lbl: 'Total storage',   cls: 'teal' },
        { val: fmt(c.totalObjs),        lbl: 'Objects stored',  cls: 'amber' },
        { val: c.chunkServers,          lbl: 'Chunk servers',   cls: 'purple' },
        { val: c.metaDbNodes,           lbl: 'Metadata DB nodes', cls: 'green' },
      ];
    },

    steps(c) {
      return [
        { title: 'Clarify scope', summary: '5 design axes', body: `<table class="metrics-table">
  <tr><td>Object size range</td><td>1 B – 5 TB (multi-part above 5 GB)</td></tr>
  <tr><td>Bucket namespace</td><td>Global unique bucket names</td></tr>
  <tr><td>Consistency model</td><td>Read-after-write for PUT; eventual for LIST</td></tr>
  <tr><td>Durability target</td><td class="warn">11 nines (3 AZ erasure coding)</td></tr>
  <tr><td>Access control</td><td>Bucket policies + pre-signed URLs</td></tr>
</table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.writeQps)} write → ${fmt(c.readQps)} read QPS`, body: `<div class="formula-box">
writeQps = uploads/day ÷ 86,400<br>
= <span class="v">${fmt(c.uploadsPerDay)}</span> ÷ 86,400 = <span class="r">${fmt(c.writeQps)}</span> QPS<br>
readQps = writeQps × ${c.rwRatio}:1 ratio = <span class="r">${fmt(c.readQps)}</span></div>
<table class="metrics-table">
  <tr><td>Write QPS</td><td>${fmt(c.writeQps)}</td></tr>
  <tr><td>Read QPS (${c.rwRatio}:1 ratio)</td><td class="hl">${fmt(c.readQps)}</td></tr>
  <tr><td>Write bandwidth</td><td>${fmtBw(c.writeBw)}</td></tr>
  <tr><td>Read bandwidth</td><td class="hl">${fmtBw(c.readBw)}</td></tr>
</table>` },
        { title: 'Storage estimation', summary: `${fmtB(c.totalStorage)} across ${c.chunkServers} servers`, body: `<div class="formula-box">
totalObjs = uploads/day × 365 × retention_years<br>
= <span class="v">${fmt(c.uploadsPerDay)}</span> × 365 × <span class="v">${c.retention}</span> = <span class="r">${fmt(c.totalObjs)}</span><br>
totalStorage = objects × size = <span class="r">${fmtB(c.totalStorage)}</span></div>
<table class="metrics-table">
  <tr><td>Total objects</td><td class="hl">${fmt(c.totalObjs)}</td></tr>
  <tr><td>Total storage</td><td class="hl">${fmtB(c.totalStorage)}</td></tr>
  <tr><td>Per chunk server (100 TB)</td><td>${c.chunkServers} servers</td></tr>
  <tr><td>Erasure coding overhead</td><td>~1.5× raw → ${fmtB(c.totalStorage*1.5)}</td></tr>
</table>` },
        { title: 'Metadata layer', summary: `${fmt(c.totalObjs)} objects → ${c.metaDbNodes} DB nodes`, body: `<div class="formula-box">
metadata per object ≈ 200 B (key, size, ETag, ACL, timestamps)<br>
total metadata = <span class="v">${fmt(c.totalObjs)}</span> × 200 B = <span class="r">${fmtB(c.metaBytes)}</span><br>
DB nodes = ceil(${fmtB(c.metaBytes)} ÷ 1 TB) = <span class="r">${c.metaDbNodes}</span></div>
<table class="metrics-table">
  <tr><td>Metadata per object</td><td>~200 B</td></tr>
  <tr><td>Total metadata</td><td class="hl">${fmtB(c.metaBytes)}</td></tr>
  <tr><td>Metadata DB nodes</td><td class="hl">${c.metaDbNodes}</td></tr>
  <tr><td>Metadata store</td><td>Cassandra (Dynamo-style) or PostgreSQL</td></tr>
</table>` },
        { title: 'Data placement', summary: 'Erasure coding + 3-AZ spread', body: `<table class="metrics-table">
  <tr><td>Durability strategy</td><td>Reed-Solomon (6+3) across AZs</td></tr>
  <tr><td>Replication alternative</td><td>3× full copy (simpler, costlier)</td></tr>
  <tr><td>Object ID scheme</td><td>bucket+key → consistent-hash → chunk server</td></tr>
  <tr><td>Large object</td><td class="warn">Multipart upload (5 MB–5 TB parts)</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const metaHot = c.totalObjs > 1e12;
      return drawArch([
        { id: 'cli',   x: 115, y: 14,  w: 130, h: 34, label: 'Client / SDK',          color: '#2BA07E' },
        { id: 'api',   x: 75,  y: 76,  w: 210, h: 34, label: 'API Gateway (REST / S3 protocol)', color: '#2BA07E' },
        { id: 'meta',  x: 55,  y: 140, w: 250, h: 34, label: `Metadata Service (${c.metaDbNodes} nodes)`, color: metaHot ? '#ef4444' : '#14b8a6' },
        { id: 'chunk', x: 35,  y: 204, w: 290, h: 34, label: `Chunk Servers (${c.chunkServers})`,  color: '#a855f7' },
        { id: 'cdn',   x: 85,  y: 272, w: 190, h: 34, label: 'CDN (reads)', color: '#14b8a6', dim: c.rwRatio < 10 },
      ], [
        { from: 'cli',   to: 'api' },
        { from: 'api',   to: 'meta',  label: 'lookup' },
        { from: 'api',   to: 'chunk', label: 'stream' },
        { from: 'chunk', to: 'cdn',   label: 'serve' },
      ]);
    },

    components() {
      return [
        { icon: '📦', name: 'MinIO',      best: true,  reason: 'S3-compatible, open-source, runs on commodity hardware. Same API as S3; easy migration.',          stats: ['S3-compatible','Erasure coding','Multi-site'] },
        { icon: '☁️', name: 'AWS S3',     best: false, reason: '11-nines durability, managed, tight AWS integration. Cost-prohibitive at massive scale vs self-hosted.', stats: ['11 nines','Managed','Expensive at PB+'] },
        { icon: '📋', name: 'Cassandra',  best: false, reason: 'Best for the metadata layer: high write throughput, tunable consistency, row TTL for lifecycle policies.', stats: ['Metadata store','High writes','TTL support'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Replication (3×)',      pro: 'Simple, fast reads from any replica',  con: '3× storage cost; impractical at PB scale' },
        { algo: 'Erasure coding (6+3)',  pro: '~1.5× overhead, high durability',      con: 'Read requires reconstructing from 6 shards; slower for small objects' },
        { algo: 'Pre-signed URLs',       pro: 'CDN / browser uploads directly',       con: 'Expiry management complexity; leaked URL = data breach' },
      ];
    },

    tips: [
      'Separate metadata from data: metadata lookups should hit a fast KV store (Cassandra), never the chunk servers',
      'Pre-signed URLs for uploads: client uploads directly to storage — your servers never touch the bytes',
      'Multipart upload for objects > 100 MB: enables parallel transfers and resume on failure',
      'Set lifecycle policies early: auto-transition cold objects to cheaper storage classes (Glacier / Nearline) after 90 days',
      'Content-addressable storage (CAS) using object hash as ID allows automatic deduplication at the write path',
    ],
  });
})();
