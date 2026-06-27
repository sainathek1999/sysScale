/* ============================================================
   social-graph.js — Social Graph + News Feed
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('social-graph', {
    name: 'Social Graph',
    icon: '🔗',
    params: {
      dau:            { label: 'Daily active users',     options: ['1M','10M','100M','1B'],     values: [1e6,1e7,1e8,1e9],   def: 2 },
      avgConnections: { label: 'Avg connections / user', options: ['50','200','1K','5K'],       values: [50,200,1000,5000],  def: 1 },
      feedWrites:     { label: 'Feed writes / DAU / day', options: ['1','5','20','100'],        values: [1,5,20,100],        def: 1 },
      traversalDepth: { label: 'Suggestion depth',       type: 'select',
        options: ['1-hop (direct)','2-hop (friends of friends)','3-hop (discovery)'],
        values: [1,2,3], def: 1 },
    },

    compute(p) {
      const dau = p.dau.v, avgConn = p.avgConnections.v;
      const feedWritesPerDay = p.feedWrites.v, depth = p.traversalDepth.v;
      const totalUsers     = dau * 10;
      const totalEdges     = totalUsers * avgConn / 2;
      const edgeStorageBytes = totalEdges * 16;
      const graphNodes     = Math.max(1, Math.ceil(edgeStorageBytes / 100e9));
      const feedWritesPerSec = (dau * feedWritesPerDay) / 86400;
      const feedWriteAmp   = feedWritesPerSec * avgConn;
      const feedReadQps    = dau * 10 / 86400;
      const traversalFanout = Math.min(1e12, Math.pow(avgConn, depth));
      return {
        dau, avgConn, feedWritesPerDay, depth,
        totalUsers, totalEdges, edgeStorageBytes, graphNodes,
        feedWritesPerSec, feedWriteAmp, feedReadQps, traversalFanout,
        bottleneck: feedWriteAmp > 1e6
          ? `Fan-out on write ${fmt(feedWriteAmp)} ops/s — adopt fan-out on read (pull) for high-follower users (celebrities).`
          : feedReadQps > 1e5
          ? `Feed read QPS (${fmt(feedReadQps)}) — pre-compute and cache feed in Redis per user.`
          : null,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.totalEdges),      lbl: 'Graph edges',         cls: 'accent' },
        { val: fmt(c.feedWriteAmp),    lbl: 'Feed writes/s (amp)', cls: c.feedWriteAmp > 1e6 ? 'amber' : 'teal' },
        { val: fmt(c.feedReadQps),     lbl: 'Feed reads/s',        cls: 'green' },
        { val: c.graphNodes,           lbl: 'Graph DB nodes',      cls: 'purple' },
        { val: fmtB(c.edgeStorageBytes), lbl: 'Edge storage',      cls: 'amber' },
      ];
    },

    steps(c) {
      return [
        { title: 'Clarify scope', summary: '4 key design axes', body: `<table class="metrics-table">
  <tr><td>Directed vs undirected</td><td>Directed (follow) vs bidirectional (friend)</td></tr>
  <tr><td>Feed model</td><td class="warn">Fan-out-on-write vs fan-out-on-read</td></tr>
  <tr><td>Celeb problem</td><td>Users with 1M+ followers need separate path</td></tr>
  <tr><td>Consistency</td><td>Eventual — feed can lag 1–5 seconds</td></tr>
</table>` },
        { title: 'Graph sizing', summary: `${fmt(c.totalEdges)} edges · ${fmtB(c.edgeStorageBytes)}`, body: `<div class="formula-box">
total_users = DAU × 10 (registered/active ratio)<br>
= <span class="v">${fmt(c.dau)}</span> × 10 = <span class="r">${fmt(c.totalUsers)}</span><br>
total_edges = users × avg_connections ÷ 2 = <span class="r">${fmt(c.totalEdges)}</span><br>
edge_storage = edges × 16 B = <span class="r">${fmtB(c.edgeStorageBytes)}</span></div>
<table class="metrics-table">
  <tr><td>Registered users</td><td>${fmt(c.totalUsers)}</td></tr>
  <tr><td>Avg connections</td><td>${fmt(c.avgConn)}</td></tr>
  <tr><td>Total graph edges</td><td class="hl">${fmt(c.totalEdges)}</td></tr>
  <tr><td>Edge storage</td><td class="hl">${fmtB(c.edgeStorageBytes)}</td></tr>
</table>` },
        { title: 'Feed write amplification', summary: `${fmt(c.feedWritesPerSec)} posts/s → ${fmt(c.feedWriteAmp)} writes/s`, body: `<div class="formula-box">
posts_per_sec = DAU × writes/user/day ÷ 86,400<br>
= <span class="v">${fmt(c.dau)}</span> × <span class="v">${c.feedWritesPerDay}</span> ÷ 86,400 = <span class="r">${fmt(c.feedWritesPerSec)}</span> posts/s<br>
fan_out = posts/s × avg_followers = <span class="r">${fmt(c.feedWriteAmp)}</span> writes/s</div>
<table class="metrics-table">
  <tr><td>Posts per second</td><td>${fmt(c.feedWritesPerSec)}</td></tr>
  <tr><td>Avg followers</td><td>${fmt(c.avgConn)}</td></tr>
  <tr><td>Fan-out writes/s</td><td class="${c.feedWriteAmp > 1e6 ? 'warn' : 'hl'}">${fmt(c.feedWriteAmp)}</td></tr>
  <tr><td>Strategy</td><td>${c.feedWriteAmp > 1e6 ? 'Hybrid: write for normal, read for celebrities' : 'Fan-out on write (pre-compute)'}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Celebrity problem</div><div class="info-box-body">A user with 10M followers posting once = 10M write operations. Separate these accounts into a "pull list" — their posts are fetched at read time and merged with the pre-computed feed.</div></div>` },
        { title: 'Graph traversal', summary: `${c.depth}-hop fanout: ${fmt(c.traversalFanout)} nodes`, body: `<div class="formula-box">
traversal_nodes = avg_connections ^ depth<br>
= ${fmt(c.avgConn)}<sup>${c.depth}</sup> = <span class="r">${fmt(c.traversalFanout)}</span></div>
<table class="metrics-table">
  <tr><td>Traversal depth</td><td>${c.depth}-hop</td></tr>
  <tr><td>Nodes visited</td><td class="hl">${fmt(c.traversalFanout)}</td></tr>
  <tr><td>Graph DB type</td><td>${c.graphNodes > 3 ? 'Sharded adjacency list (Cassandra)' : 'Neo4j / JanusGraph'}</td></tr>
  <tr><td>Caching</td><td>Common 2-hop results in Redis</td></tr>
</table>` },
        { title: 'Feed storage', summary: `${fmt(c.feedReadQps)} read QPS · Redis cache`, body: `<table class="metrics-table">
  <tr><td>Feed read QPS</td><td class="hl">${fmt(c.feedReadQps)}</td></tr>
  <tr><td>Feed cache</td><td>Redis sorted set (score=timestamp)</td></tr>
  <tr><td>Feed depth cached</td><td>Top 200 posts per user</td></tr>
  <tr><td>Graph DB nodes</td><td>${c.graphNodes} nodes (100 GB edges each)</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const fanoutHot = c.feedWriteAmp > 1e6;
      return drawArch([
        { id: 'api',    x: 115, y: 14,  w: 130, h: 34, label: 'API Servers',              color: '#2BA07E' },
        { id: 'graph',  x: 55,  y: 76,  w: 250, h: 34, label: `Graph DB (${c.graphNodes} nodes)`, color: '#14b8a6' },
        { id: 'fanout', x: 55,  y: 140, w: 250, h: 34, label: 'Feed Fan-out Service',    color: fanoutHot ? '#ef4444' : '#f59e0b' },
        { id: 'feed',   x: 35,  y: 204, w: 290, h: 34, label: 'Feed Cache (Redis sorted sets)', color: '#14b8a6' },
        { id: 'blob',   x: 85,  y: 272, w: 190, h: 34, label: 'Post / Media Store',      color: '#a855f7', dim: true },
      ], [
        { from: 'api',    to: 'graph',  label: 'follow/unfollow' },
        { from: 'api',    to: 'fanout', label: 'new post' },
        { from: 'fanout', to: 'feed',   label: 'push to followers' },
        { from: 'api',    to: 'feed',   label: 'read feed' },
        { from: 'api',    to: 'blob',   label: 'media upload' },
      ]);
    },

    components() {
      return [
        { icon: '🐘', name: 'Cassandra (adjacency)', best: true,  reason: 'Model edges as rows: (user_id → [follower_id, ...]) with wide rows. Linear scalability, sub-10ms reads, no joins needed.', stats: ['Linear scale','No joins','Wide rows'] },
        { icon: '🔴', name: 'Redis (feed cache)',    best: true,  reason: 'Sorted set per user (ZRANGEBYSCORE) for timeline. O(log N) insert and range queries on timestamp score.', stats: ['Sorted sets','O(log N)','Sub-ms'] },
        { icon: '🕸️', name: 'Neo4j',               best: false, reason: 'Native graph with Cypher. Excellent for deep traversal. Single-machine limit makes it impractical above 10B edges.', stats: ['Cypher query','Deep traversal','Single-node'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Fan-out on write (push)', pro: 'O(1) feed read — feed pre-built',           con: 'Catastrophic at high-follower count (celebrity problem)' },
        { algo: 'Fan-out on read (pull)',  pro: 'No write amplification at all',              con: 'O(N) read — merge N timelines on every request; slow at scale' },
        { algo: 'Hybrid (push + pull)',    pro: 'Push for normal users, pull for celebrities', con: 'Complex routing logic; must classify "celebrity" dynamically' },
      ];
    },

    tips: [
      'Store edges as adjacency lists (Cassandra wide row), not as a real graph DB — you need sharding more than you need Cypher at scale',
      'Pre-compute the feed on write (fan-out), store only post IDs in Redis sorted set — hydrate post data at read time from cache',
      'Define celebrity threshold at design time (e.g., > 10K followers → pull path). Route at write time, not read time',
      '2-hop friend suggestions: precompute and cache aggressively — real-time BFS at 2 hops on a billion-node graph is impractical',
      'Feed truncation: cap each user\'s pre-computed feed at 200–500 items. Older items fetched on scroll from object store, not from the hot Redis feed',
    ],
  });
})();
