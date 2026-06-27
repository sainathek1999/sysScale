/* ============================================================
   cdn.js — Content Delivery Network
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('cdn', {
    name: 'CDN',
    icon: '🌍',
    params: {
      originBw:    { label: 'Origin egress',        options: ['100 Mbps','1 Gbps','10 Gbps','100 Gbps'], values: [100e6,1e9,10e9,100e9], def: 1 },
      hitRate:     { label: 'Cache hit rate',       options: ['50%','70%','90%','99%'],     values: [0.50,0.70,0.90,0.99],             def: 2 },
      pops:        { label: 'PoP count (edge DCs)', options: ['10','50','100','300'],        values: [10,50,100,300],                   def: 1 },
      contentLib:  { label: 'Content library size', options: ['100 GB','1 TB','10 TB','1 PB'], values: [100e9,1e12,10e12,1e15],        def: 1 },
    },

    compute(p) {
      const originBw = p.originBw.v, hitRate = p.hitRate.v;
      const pops = p.pops.v, contentLib = p.contentLib.v;
      const totalEgress   = originBw / (1 - hitRate);
      const originLoad    = totalEgress * (1 - hitRate);
      const edgeBwPerPop  = totalEgress / pops;
      const serversPerPop = Math.max(1, Math.ceil(edgeBwPerPop / 1e9));
      const totalServers  = serversPerPop * pops;
      const edgeDiskPerPop = Math.ceil((contentLib * hitRate) / pops);
      return {
        originBw, hitRate, pops, contentLib,
        totalEgress, originLoad, edgeBwPerPop, serversPerPop, totalServers, edgeDiskPerPop,
        bottleneck: hitRate < 0.70
          ? `Low cache hit rate (${Math.round(hitRate*100)}%) — ${fmtBw(originLoad*8)} hitting origin. Add cache-control headers and warm the edge.`
          : originLoad > 10e9
          ? `Origin still absorbs ${fmtBw(originLoad*8)}. Add shield tier (single origin-facing cache region).`
          : null,
      };
    },

    metrics(c) {
      return [
        { val: fmtBw(c.totalEgress * 8), lbl: 'Total egress',      cls: 'accent' },
        { val: Math.round(c.hitRate*100) + '%', lbl: 'Cache hit rate', cls: c.hitRate < 0.7 ? 'amber' : 'green' },
        { val: c.pops,                     lbl: 'Edge PoPs',         cls: 'teal' },
        { val: c.totalServers,             lbl: 'Edge servers',      cls: 'purple' },
        { val: fmtBw(c.originLoad * 8),   lbl: 'Origin load',       cls: c.originLoad > 1e9 ? 'amber' : 'green' },
      ];
    },

    steps(c) {
      return [
        { title: 'Clarify scope', summary: '4 CDN design axes', body: `<table class="metrics-table">
  <tr><td>Asset types</td><td>Static (images, JS, CSS) + HLS video segments</td></tr>
  <tr><td>Cache invalidation</td><td>Versioned URLs (immutable) + Purge API</td></tr>
  <tr><td>Origin protocol</td><td>HTTPS + HTTP/2 push</td></tr>
  <tr><td>Anycast routing</td><td class="warn">BGP anycast → nearest PoP</td></tr>
</table>` },
        { title: 'Traffic sizing', summary: `${fmtBw(c.totalEgress * 8)} total · ${Math.round(c.hitRate*100)}% hit`, body: `<div class="formula-box">
total_egress = origin_bw ÷ (1 - hit_rate)<br>
= <span class="v">${fmtBw(c.originBw * 8)}</span> ÷ <span class="v">${(1-c.hitRate).toFixed(2)}</span> = <span class="r">${fmtBw(c.totalEgress * 8)}</span><br>
origin_load = total × (1 - hit_rate) = <span class="r">${fmtBw(c.originLoad * 8)}</span></div>
<table class="metrics-table">
  <tr><td>Total client egress</td><td class="hl">${fmtBw(c.totalEgress * 8)}</td></tr>
  <tr><td>Cache hit rate</td><td>${Math.round(c.hitRate*100)}%</td></tr>
  <tr><td>Origin load (misses)</td><td class="hl">${fmtBw(c.originLoad * 8)}</td></tr>
  <tr><td>Edge absorbs</td><td class="good">${fmtBw((c.totalEgress - c.originLoad) * 8)}</td></tr>
</table>` },
        { title: 'Edge server sizing', summary: `${c.totalServers} servers across ${c.pops} PoPs`, body: `<div class="formula-box">
edge_bw_per_pop = total_egress ÷ pops<br>
= <span class="v">${fmtBw(c.totalEgress * 8)}</span> ÷ <span class="v">${c.pops}</span> = <span class="r">${fmtBw(c.edgeBwPerPop * 8)}</span><br>
servers_per_pop = ceil(edge_bw ÷ 1 Gbps/server) = <span class="r">${c.serversPerPop}</span></div>
<table class="metrics-table">
  <tr><td>Edge BW per PoP</td><td class="hl">${fmtBw(c.edgeBwPerPop * 8)}</td></tr>
  <tr><td>Servers per PoP</td><td>${c.serversPerPop}</td></tr>
  <tr><td>Total edge servers</td><td class="hl">${c.totalServers}</td></tr>
  <tr><td>Per-server NIC</td><td>10 Gbps (bonded)</td></tr>
</table>` },
        { title: 'Edge storage', summary: `${fmtB(c.edgeDiskPerPop)} per PoP`, body: `<div class="formula-box">
edge_cache_per_pop = (content_lib × hit_rate) ÷ pops<br>
= (<span class="v">${fmtB(c.contentLib)}</span> × <span class="v">${c.hitRate}</span>) ÷ <span class="v">${c.pops}</span> = <span class="r">${fmtB(c.edgeDiskPerPop)}</span></div>
<table class="metrics-table">
  <tr><td>Content library</td><td>${fmtB(c.contentLib)}</td></tr>
  <tr><td>Cached fraction</td><td>${Math.round(c.hitRate*100)}%</td></tr>
  <tr><td>Edge disk per PoP</td><td class="hl">${fmtB(c.edgeDiskPerPop)}</td></tr>
  <tr><td>Disk type</td><td>NVMe SSD for hot + HDD for warm tier</td></tr>
</table>` },
        { title: 'Cache strategy', summary: 'Versioned URLs + purge API', body: `<table class="metrics-table">
  <tr><td>Immutable assets</td><td>Cache-Control: max-age=31536000, immutable</td></tr>
  <tr><td>HTML/API responses</td><td>s-maxage=60, stale-while-revalidate=300</td></tr>
  <tr><td>Invalidation</td><td>File fingerprinting preferred; purge API for emergencies</td></tr>
  <tr><td>Origin shield</td><td class="warn">Single region as origin guard → reduces origin load 10–100×</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const lowHit = c.hitRate < 0.70;
      const shieldNeeded = c.originLoad > 5e9;
      return drawArch([
        { id: 'user',   x: 115, y: 14,  w: 130, h: 34, label: 'End Users (Anycast)',        color: '#2BA07E' },
        { id: 'edge',   x: 55,  y: 76,  w: 250, h: 34, label: `Edge PoPs (${c.pops} × ${c.serversPerPop} servers)`, color: lowHit ? '#ef4444' : '#14b8a6' },
        { id: 'shield', x: 85,  y: 140, w: 190, h: 34, label: 'Origin Shield (1 region)',  color: shieldNeeded ? '#f59e0b' : '#2BA07E', dim: !shieldNeeded },
        { id: 'origin', x: 85,  y: 204, w: 190, h: 34, label: 'Origin Servers',            color: '#a855f7' },
        { id: 'store',  x: 85,  y: 272, w: 190, h: 34, label: 'Object Store / DB',         color: '#14b8a6', dim: true },
      ], [
        { from: 'user',   to: 'edge',   label: 'BGP anycast' },
        { from: 'edge',   to: 'shield', label: 'miss' },
        { from: 'shield', to: 'origin', label: 'miss' },
        { from: 'origin', to: 'store' },
      ]);
    },

    components() {
      return [
        { icon: '🌍', name: 'Cloudflare',  best: true,  reason: '300+ PoPs, anycast, DDoS protection, Workers at edge for dynamic caching. Industry-leading hit rates.', stats: ['300+ PoPs','DDoS mitigation','Edge compute'] },
        { icon: '☁️', name: 'AWS CloudFront', best: false, reason: 'Tight S3/EC2 integration. Fewer PoPs than Cloudflare. Best when already on AWS stack.', stats: ['AWS native','Lambda@Edge','~60 PoPs'] },
        { icon: '⚡', name: 'Fastly',       best: false, reason: 'Varnish-based, instant purge (<150ms), best for real-time content like news. API-driven cache control.', stats: ['Instant purge','VCL control','Low TTL'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Long TTL (immutable)',   pro: 'Maximum cache efficiency, zero origin load for repeat visits', con: 'Any update requires deploy + URL change (fingerprinting)' },
        { algo: 'Short TTL + revalidate', pro: 'Always-fresh content without invalidation',    con: 'Every client sends conditional requests; origin still sees traffic' },
        { algo: 'Origin shield',          pro: 'Collapses N PoP misses into 1 origin request', con: 'Adds 1 network hop; slight latency increase for misses' },
      ];
    },

    tips: [
      'URL fingerprinting (file.abc123.js) is the only reliable cache-busting strategy — purge APIs have race conditions',
      'Set stale-while-revalidate for HTML pages: serve stale immediately, revalidate in background — best of both freshness and speed',
      'Origin shield is free latency insurance: collapse all PoP misses to one region before they hit your origin',
      'Cache-Control: private vs public controls whether CDN stores the response — forgetting "public" causes 0% hit rate on shared assets',
      'Log CDN cache status headers (HIT/MISS/BYPASS) — a hit rate below 80% on static assets is a config issue, not a scale issue',
    ],
  });
})();
