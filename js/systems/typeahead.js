/* ============================================================
   typeahead.js — Search Typeahead system definition
   ============================================================ */
(function () {
  const { fmt, fmtB, drawArch } = window.SS;

  window.SS.register('typeahead', {
    name: 'Search Typeahead',
    icon: '🔍',
    params: {
      dau:       { label: 'Daily active users', options: ['1M', '10M', '100M', '500M', '1B'], values: [1e6, 10e6, 100e6, 500e6, 1e9], def: 2 },
      qpSession: { label: 'Queries / session', options: ['5', '10', '20', '50'], values: [5, 10, 20, 50], def: 1 },
      corpus:    { label: 'Indexed terms', options: ['1M', '10M', '100M', '1B'], values: [1e6, 10e6, 100e6, 1e9], def: 1 },
    },

    compute(p) {
      const dau = p.dau.v, queriesDay = dau * 3 * p.qpSession.v;
      const rps = Math.round(queriesDay / 86400), peak = rps * 5;
      const keystrokeRps = rps * 4, trieMemory = p.corpus.v * 50, redisMemory = p.corpus.v * 30;
      const backendRps = Math.round(keystrokeRps * 0.25);
      return {
        dau, queriesDay, rps, peak, keystrokeRps, trieMemory, redisMemory, backendRps, corpus: p.corpus.v, qpSession: p.qpSession.v,
        bottleneck: keystrokeRps > 1e6 ? `${fmt(keystrokeRps)} keystroke RPS — cache aggressively at CDN + browser to protect the backend` : null
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.rps), lbl: 'Search RPS', cls: 'accent' },
        { val: fmt(c.keystrokeRps), lbl: 'Keystroke RPS', cls: 'amber' },
        { val: fmtB(c.trieMemory), lbl: 'Trie memory', cls: 'teal' },
        { val: '75%', lbl: 'Cache hit', cls: 'green' },
        { val: fmt(c.backendRps), lbl: 'Backend RPS', cls: 'purple' },
      ];
    },

    steps(c, p) {
      return [
        { title: 'Clarify scope', summary: 'Query & ranking', body: `<table class="metrics-table">
          <tr><td>Suggestions returned</td><td>Top 10 per prefix</td></tr>
          <tr><td>Latency target</td><td class="hl">&lt; 100ms P99</td></tr>
          <tr><td>Ranking signal</td><td>Search frequency + recency</td></tr>
          <tr><td>Personalization</td><td>Global first, user history after</td></tr>
          <tr><td>Index update cadence</td><td>Async, ~10min lag acceptable</td></tr>
        </table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.keystrokeRps)} keystrokes/s`, body: `<div class="formula-box">
queries/day = ${fmt(c.dau)} × 3 sessions × ${c.qpSession} = <span class="v">${fmt(c.queriesDay)}</span><br>
query_rps = <span class="v">${fmt(c.rps)}</span><br>
keystroke_rps = rps × 4 chars/query = <span class="r">${fmt(c.keystrokeRps)}</span></div>
<table class="metrics-table">
  <tr><td>Queries / day</td><td>${fmt(c.queriesDay)}</td></tr>
  <tr><td>Query RPS</td><td>${fmt(c.rps)}</td></tr>
  <tr><td>Keystroke RPS (×4)</td><td class="warn">${fmt(c.keystrokeRps)}</td></tr>
  <tr><td>Peak (×5)</td><td class="warn">${fmt(c.peak * 4)}</td></tr>
</table>` },
        { title: 'Storage — trie + Redis', summary: `${fmtB(c.trieMemory + c.redisMemory)} total`, body: `<div class="formula-box">
trie = ${fmt(c.corpus)} terms × 50B/node = <span class="r">${fmtB(c.trieMemory)}</span><br>
redis top-K = ${fmt(c.corpus)} prefixes × 30B = <span class="r">${fmtB(c.redisMemory)}</span></div>
<table class="metrics-table">
  <tr><td>Indexed corpus</td><td>${fmt(c.corpus)} terms</td></tr>
  <tr><td>Trie memory</td><td class="hl">${fmtB(c.trieMemory)}</td></tr>
  <tr><td>Redis top-K cache</td><td class="hl">${fmtB(c.redisMemory)}</td></tr>
  <tr><td>Total</td><td class="good">${fmtB(c.trieMemory + c.redisMemory)}</td></tr>
</table>` },
        { title: 'Caching strategy', summary: '75% hit · 3 layers', body: `<table class="metrics-table">
  <tr><td>L1: Browser cache</td><td class="hl">100ms TTL, per-prefix key</td></tr>
  <tr><td>L2: CDN per prefix</td><td class="hl">5min TTL, collapses keystrokes</td></tr>
  <tr><td>L3: Redis sorted sets</td><td>ZREVRANGE top-K, 1hr TTL</td></tr>
  <tr><td>Overall hit rate</td><td class="good">~75%</td></tr>
  <tr><td>Backend RPS after cache</td><td>${fmt(c.backendRps)}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Cache the prefix, not the full query</div>
<div class="info-box-body">Cache "app", "appl", "apple" as separate keys. Most users type the same popular prefixes — this collapses millions of keystrokes into a tiny cache keyspace.</div></div>` },
        { title: 'Top-K tracking', summary: 'Count-Min Sketch + heap', body: `<table class="metrics-table">
  <tr><td>Algorithm</td><td class="hl">Count-Min Sketch (streaming)</td></tr>
  <tr><td>Memory vs exact counting</td><td>1000× less, ~2% error</td></tr>
  <tr><td>Trending queries</td><td>Sliding window, last 1hr</td></tr>
  <tr><td>Batch aggregation</td><td>MapReduce / Spark daily → update trie</td></tr>
  <tr><td>Trie update cadence</td><td>Rebuilt every 10min via Kafka stream</td></tr>
</table>` },
      ];
    },

    arch(c) {
      return drawArch([
        { id: 'client', x: 100, y: 10, w: 160, h: 34, label: 'Browser / App', color: '#2BA07E' },
        { id: 'cdn', x: 60, y: 72, w: 240, h: 34, label: 'CDN (prefix cache)', color: '#f59e0b' },
        { id: 'api', x: 80, y: 136, w: 200, h: 34, label: 'Typeahead API', color: c.keystrokeRps > 1e6 ? '#ef4444' : '#2BA07E' },
        { id: 'redis', x: 45, y: 200, w: 120, h: 34, label: 'Redis top-K', color: '#14b8a6' },
        { id: 'trie', x: 195, y: 200, w: 130, h: 34, label: 'Trie Service', color: '#a855f7' },
        { id: 'kafka', x: 80, y: 264, w: 200, h: 34, label: 'Kafka (query log)', color: '#f59e0b' },
        { id: 'agg', x: 80, y: 328, w: 200, h: 34, label: 'Aggregation Service', color: '#22c55e' },
      ], [
        { from: 'client', to: 'cdn', label: '' },
        { from: 'cdn', to: 'api', label: 'miss' },
        { from: 'api', to: 'redis', label: 'top-K' },
        { from: 'api', to: 'trie', label: 'prefix' },
        { from: 'api', to: 'kafka', label: 'log' },
        { from: 'kafka', to: 'agg', label: 'count' },
      ]);
    },

    components() {
      return [
        { icon: '🌲', name: 'Trie (in-memory)', best: true, reason: 'O(L) lookup where L=query length. Store pre-ranked top-10 at each node. Whole trie fits in RAM for 100M terms. Shard by first 2 chars.', stats: ['O(L) lookup', 'In-memory', 'Pre-ranked', 'Shard by prefix'] },
        { icon: '⚡', name: 'Redis sorted sets', best: true, reason: 'ZREVRANGE for top-K per prefix. Simple, real-time updates. Use as L3 cache in front of the trie service.', stats: ['ZREVRANGE O(log n)', 'Real-time', 'Easy ops', 'TTL'] },
        { icon: '📊', name: 'Count-Min Sketch', best: true, reason: 'Approximate frequency counting in O(1) memory. Track trending in real-time. Feed results async to the trie rebuilder.', stats: ['~2% error', '1000× less RAM', 'O(1) update', 'Streaming'] },
      ];
    },

    tradeoffs() {
      return [
        { algo: 'Trie in-memory', pro: 'Fastest possible O(L) lookup', con: 'Memory grows with corpus' },
        { algo: 'Elasticsearch', pro: 'Full-text, fuzzy matching', con: '10× higher latency than trie' },
        { algo: 'Redis sorted sets', pro: 'Simple, real-time ranking', con: 'Prefix explosion at scale' },
      ];
    },

    tips: [
      'Client debounce 100ms — wait for a pause before sending. Cuts backend load 5-10× with no UX cost',
      'Shard trie by first 2 chars (26²=676 shards max). Consistent hashing routes each prefix correctly',
      'Store top-10 at each trie node on write — never traverse to leaves on read. Pre-computed ranking',
      'Count-Min Sketch: 5 hash functions × 2000 counters ≈ 10KB, handles billions of queries accurately',
      'Typo tolerance: Levenshtein distance-1 on last character only — covers most real typos cheaply',
    ],
  });
})();
