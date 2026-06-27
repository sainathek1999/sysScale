/* ============================================================
   web-crawler.js — Distributed Web Crawler
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('web-crawler', {
    name: 'Web Crawler',
    icon: '🕷️',
    params: {
      frontier:   { label: 'URL frontier size',    options: ['10M','100M','1B','10B'],       values: [1e7,1e8,1e9,1e10],    def: 2 },
      freshness:  { label: 'Crawl freshness',      options: ['Daily','Weekly','Monthly','Yearly'], values: [1,7,30,365],    def: 1 },
      pageSize:   { label: 'Avg page size',        options: ['50 KB','200 KB','500 KB','2 MB'],   values: [5e4,2e5,5e5,2e6], def: 1 },
      politeness: { label: 'Politeness delay',     type: 'select',
        options: ['1 s (aggressive)','5 s (standard)','30 s (gentle)'], values: [1,5,30], def: 1 },
    },

    compute(p) {
      const frontier = p.frontier.v, freshnessDays = p.freshness.v;
      const pageSize = p.pageSize.v, politeness = p.politeness.v;
      const pagesPerDay = frontier / freshnessDays;
      const crawlRps    = pagesPerDay / 86400;
      const bandwidth   = crawlRps * pageSize * 8; // bits/s
      const dnsRps      = crawlRps;
      const threads     = Math.ceil(crawlRps * politeness);
      const workers     = Math.max(1, Math.ceil(threads / 500));
      const urlStorage  = frontier * 50;  // 50 bytes per URL entry
      const bloomFilterMem = frontier * 10 / 8; // ~10 bits per entry
      const pageIndexPerDay = crawlRps * 86400 * pageSize * 0.15; // 15% after compression
      return {
        frontier, freshnessDays, pageSize, politeness,
        pagesPerDay, crawlRps, bandwidth, dnsRps,
        threads, workers, urlStorage, bloomFilterMem, pageIndexPerDay,
        bottleneck: dnsRps > 5000
          ? `DNS resolution rate (${fmt(dnsRps)}/s) is the bottleneck. Deploy a dedicated DNS resolver fleet with aggressive caching.`
          : workers > 500
          ? `Fetcher fleet needs ${workers} workers. Distribute across regions and use async I/O (not one thread per connection).`
          : null,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.crawlRps),    lbl: 'Pages/s',        cls: 'accent' },
        { val: fmtBw(c.bandwidth), lbl: 'Fetch bandwidth', cls: 'amber' },
        { val: fmt(c.dnsRps),      lbl: 'DNS lookups/s',  cls: c.dnsRps > 5000 ? 'amber' : 'teal' },
        { val: c.workers,          lbl: 'Crawler workers', cls: 'purple' },
        { val: fmtB(c.urlStorage), lbl: 'URL frontier DB', cls: 'green' },
      ];
    },

    steps(c) {
      return [
        { title: 'Clarify scope', summary: '4 key axes', body: `<table class="metrics-table">
  <tr><td>Crawl target</td><td>Public web (robots.txt compliance)</td></tr>
  <tr><td>Priority algorithm</td><td>PageRank + freshness score</td></tr>
  <tr><td>Deduplication</td><td>URL canonical + content hash</td></tr>
  <tr><td>Storage output</td><td class="warn">Blob store (S3) + search index</td></tr>
</table>` },
        { title: 'URL frontier estimation', summary: `${fmt(c.frontier)} URLs · ${c.freshnessDays}d cycle`, body: `<div class="formula-box">
crawl rate = frontier ÷ freshness_days ÷ 86,400<br>
= <span class="v">${fmt(c.frontier)}</span> ÷ <span class="v">${c.freshnessDays}</span> ÷ 86,400 = <span class="r">${fmt(c.crawlRps)}</span> pages/s<br>
DNS lookups/s ≈ crawl rate = <span class="r">${fmt(c.dnsRps)}</span>/s</div>
<table class="metrics-table">
  <tr><td>Frontier size</td><td class="hl">${fmt(c.frontier)} URLs</td></tr>
  <tr><td>Recrawl period</td><td>${c.freshnessDays} days</td></tr>
  <tr><td>Pages per day</td><td>${fmt(c.pagesPerDay)}</td></tr>
  <tr><td>Required crawl rate</td><td class="hl">${fmt(c.crawlRps)} pages/s</td></tr>
</table>` },
        { title: 'Fetching & politeness', summary: `${c.workers} workers · ${c.politeness}s delay`, body: `<div class="formula-box">
concurrent_connections = crawl_rate × politeness_delay<br>
= <span class="v">${fmt(c.crawlRps)}</span> × <span class="v">${c.politeness}</span>s = <span class="r">${fmt(c.threads)}</span> concurrent<br>
workers = ceil(${fmt(c.threads)} ÷ 500 async conns) = <span class="r">${c.workers}</span></div>
<table class="metrics-table">
  <tr><td>Politeness delay</td><td>${c.politeness}s per domain</td></tr>
  <tr><td>Concurrent connections</td><td class="hl">${fmt(c.threads)}</td></tr>
  <tr><td>Worker nodes</td><td class="hl">${c.workers}</td></tr>
  <tr><td>Download bandwidth</td><td>${fmtBw(c.bandwidth)}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">robots.txt compliance</div><div class="info-box-body">Parse robots.txt per domain before crawling. Cache the result per-domain, not per-URL. Honor Crawl-delay directive where present.</div></div>` },
        { title: 'URL deduplication', summary: `Bloom filter: ${fmtB(c.bloomFilterMem)}`, body: `<div class="formula-box">
bloom filter: m bits ≈ n × 10 bits (for 1% FPR)<br>
m = <span class="v">${fmt(c.frontier)}</span> × 10 bits = <span class="r">${fmtB(c.bloomFilterMem)}</span></div>
<table class="metrics-table">
  <tr><td>URL fingerprint store</td><td>${fmtB(c.urlStorage)} (50 B/URL)</td></tr>
  <tr><td>Bloom filter size</td><td class="hl">${fmtB(c.bloomFilterMem)} in memory</td></tr>
  <tr><td>False positive rate</td><td>~1% (acceptable — re-crawl catches)</td></tr>
  <tr><td>Content dedup</td><td>SimHash on extracted text</td></tr>
</table>` },
        { title: 'Storage', summary: `${fmtB(c.pageIndexPerDay)}/day index`, body: `<table class="metrics-table">
  <tr><td>Raw page store</td><td>${fmtBw(c.bandwidth)} → S3</td></tr>
  <tr><td>Compressed index / day</td><td class="hl">${fmtB(c.pageIndexPerDay)}</td></tr>
  <tr><td>URL frontier DB</td><td>${fmtB(c.urlStorage)}</td></tr>
  <tr><td>Priority queue</td><td>Redis sorted set or Cassandra</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const dnsHot = c.dnsRps > 5000;
      return drawArch([
        { id: 'sched', x: 85,  y: 14,  w: 190, h: 34, label: 'Scheduler / Frontier',     color: '#2BA07E' },
        { id: 'fetch', x: 55,  y: 76,  w: 250, h: 34, label: `Fetcher Fleet (${c.workers} nodes)`, color: '#14b8a6' },
        { id: 'dns',   x: 145, y: 140, w: 110, h: 34, label: 'DNS Resolvers',             color: dnsHot ? '#ef4444' : '#f59e0b' },
        { id: 'parse', x: 75,  y: 204, w: 210, h: 34, label: 'HTML Parser + SimHash',     color: '#a855f7' },
        { id: 'store', x: 55,  y: 272, w: 250, h: 34, label: 'Blob Store + Index',        color: '#14b8a6' },
      ], [
        { from: 'sched', to: 'fetch', label: 'URLs' },
        { from: 'fetch', to: 'dns',   label: 'resolve' },
        { from: 'fetch', to: 'parse', label: 'HTML' },
        { from: 'parse', to: 'store', label: 'index' },
        { from: 'parse', to: 'sched', label: 'new URLs' },
      ]);
    },

    components() {
      return [
        { icon: '🗄️', name: 'URL Frontier (Redis)', best: true, reason: 'Sorted set for priority queue (score = priority). Partitioned by URL hash across cluster for parallelism.', stats: ['O(log N) enqueue','Partitioned','Sub-ms'] },
        { icon: '🌸', name: 'Bloom Filter',         best: true, reason: 'In-memory deduplication at frontier: skip already-crawled URLs without hitting the DB on every URL.', stats: ['O(1) lookup','10 bits/entry','~1% FPR'] },
        { icon: '📦', name: 'S3 / Object Store',   best: false, reason: 'Raw page storage — cheap, durable. Separate from the search index (Elasticsearch / Lucene) built on top.', stats: ['Cheap at scale','Content archive'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'BFS traversal',       pro: 'Good coverage of high-authority pages',      con: 'Very wide frontier — hard to prioritize freshness' },
        { algo: 'PageRank priority',   pro: 'Crawls important pages first',               con: 'Biased toward established sites; misses new content' },
        { algo: 'Freshness-first',     pro: 'Keeps news / real-time content current',     con: 'Constantly re-crawls same popular pages' },
      ];
    },

    tips: [
      'URL normalization is critical: lowercase scheme+host, sort query params, strip utm_* — prevents crawling the same page 10× with different URLs',
      'DNS is almost always the bottleneck at scale. Cache DNS aggressively (TTL=1hr) and run your own resolver fleet',
      'Politeness per domain, not per IP. One domain may have thousands of IPs — hammer all of them if you only check IPs',
      'Use a priority queue scored by (importance × freshness_factor). Top news pages should recrawl every hour; deep archive pages once a year',
      'robots.txt parsing is a single point of failure — cache aggressively but re-fetch daily and never crawl a domain where robots.txt is unreachable',
    ],
  });
})();
