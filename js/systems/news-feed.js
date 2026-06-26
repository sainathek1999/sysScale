/* ============================================================
   news-feed.js — Social News Feed (Twitter/Instagram-like)
   ============================================================ */
(function () {
  const { fmt, fmtB, drawArch } = window.SS;

  const AVG_POST_BYTES = 350;    // tweet/post average
  const MEDIA_BYTES    = 300e3;  // avg image (compressed JPEG)
  const TIMELINE_POSTS = 200;    // posts cached per user timeline
  const CACHE_ENTRY_B  = 450;    // serialized post in cache
  const REPLICATION    = 3;

  window.SS.register('news-feed', {
    name: 'News Feed',
    icon: '📰',

    params: {
      dau:          { label: 'Daily active users',      options: ['1M','10M','100M','500M','1B'],       values: [1e6,10e6,100e6,500e6,1e9],  def: 2 },
      postsPerDay:  { label: 'Posts per user / day',    options: ['0.1','0.5','1','2','5'],             values: [0.1,0.5,1,2,5],             def: 2 },
      avgFollowers: { label: 'Avg followers / user',    options: ['50','200','500','2K','10K'],          values: [50,200,500,2000,10000],      def: 1 },
      celebPct:     { label: 'Celebrity users (>1M f)', options: ['0%','0.001%','0.01%','0.1%'],        values: [0,0.00001,0.0001,0.001],    def: 1 },
      mediaPct:     { label: 'Posts with media',        options: ['10%','30%','50%','70%','90%'],       values: [0.1,0.3,0.5,0.7,0.9],      def: 2 },
      fanout:       { label: 'Fanout model',            type: 'select',
                      options: ['Push on write (eager)', 'Pull on read (lazy)', 'Hybrid'],              def: 2 },
    },

    compute(p) {
      const dau          = p.dau.v;
      const postsPerDay  = p.postsPerDay.v;
      const avgFollowers = p.avgFollowers.v;
      const celebPct     = p.celebPct.v;
      const mediaPct     = p.mediaPct.v;
      const fanoutModel  = p.fanout.i; // 0=push, 1=pull, 2=hybrid

      // Write QPS
      const writesPerDay = dau * postsPerDay;
      const writeQPS     = writesPerDay / 86400;
      const peakWriteQPS = writeQPS * 3;

      // Read QPS (timeline fetches) — users read ~5–10× more than they write
      const readQPS      = writeQPS * 8;
      const peakReadQPS  = readQPS * 5;

      // Fanout writes (push model): each post → write to N follower timelines
      const fanoutWPS    = writeQPS * avgFollowers; // writes per second

      // Celebrity fanout storm
      const celebrities   = dau * celebPct;
      const celebFollowers = 2e6; // assume ~2M followers each
      const celebFanoutWPS = celebrities * postsPerDay * celebFollowers / 86400;

      // Storage
      const avgPostBytes    = AVG_POST_BYTES + mediaPct * MEDIA_BYTES;
      const postsPerDayAll  = writesPerDay;
      const dailyPostBytes  = postsPerDayAll * avgPostBytes;
      const yearlyStorage   = dailyPostBytes * 365 * REPLICATION;

      // Timeline cache (Redis sorted set per user)
      const cacheEntries    = dau * TIMELINE_POSTS;
      const cacheSizeBytes  = cacheEntries * CACHE_ENTRY_B;

      // DB writes
      const dbWriteQPS = fanoutModel === 0
        ? fanoutWPS          // push: write to every follower's timeline
        : fanoutModel === 1
        ? peakWriteQPS       // pull: just write the post, reads compute timeline
        : writeQPS + fanoutWPS * 0.1; // hybrid: push to most, pull for celebrities

      // Bottleneck
      let bottleneck = null;
      if (celebPct > 0 && fanoutModel === 0) {
        bottleneck = `Celebrity fanout storm: ${fmt(celebrities)} users with ~2M followers each. Push fanout → ${fmt(celebFanoutWPS)} extra DB writes/sec. Use hybrid model: push to <1M followers, pull for celebrities.`;
      } else if (dbWriteQPS > 200000) {
        bottleneck = `DB write QPS ${fmt(dbWriteQPS)}/s exceeds single-node capacity. Partition timeline table by user_id, use Cassandra (50K writes/node) → need ${fmt(Math.ceil(dbWriteQPS / 50000))} nodes minimum.`;
      }

      return {
        dau, postsPerDay, avgFollowers, celebPct, mediaPct, fanoutModel,
        writeQPS, peakWriteQPS, readQPS, peakReadQPS,
        writesPerDay, fanoutWPS, celebFanoutWPS, celebrities,
        avgPostBytes, dailyPostBytes, yearlyStorage,
        cacheSizeBytes, dbWriteQPS,
        bottleneck,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.peakWriteQPS) + '/s',  lbl: 'Peak write QPS',   cls: 'accent' },
        { val: fmt(c.peakReadQPS)  + '/s',  lbl: 'Peak read QPS',    cls: 'teal'   },
        { val: fmt(c.fanoutWPS)    + '/s',  lbl: 'Fanout writes/s',  cls: 'amber'  },
        { val: fmtB(c.cacheSizeBytes),       lbl: 'Timeline cache',   cls: 'purple' },
        { val: fmtB(c.yearlyStorage),        lbl: 'Storage / year',   cls: 'green'  },
      ];
    },

    steps(c, p) {
      const modelNames = ['Push on write', 'Pull on read', 'Hybrid'];
      return [
        {
          title: 'Clarify scope',
          summary: '6 key decisions',
          body: `<table class="metrics-table">
            <tr><td>Feed type</td><td class="hl">Chronological or ranked?</td></tr>
            <tr><td>Fanout model</td><td>${modelNames[c.fanoutModel]}</td></tr>
            <tr><td>Write:read ratio</td><td>~1:8 (reads dominate)</td></tr>
            <tr><td>Consistency model</td><td>Eventually consistent (OK)</td></tr>
            <tr><td>Media storage</td><td>Blob store (S3) + CDN</td></tr>
            <tr><td>Celebrity definition</td><td>Users with >1M followers</td></tr>
          </table>`,
        },
        {
          title: 'Traffic estimation',
          summary: `${fmt(c.peakWriteQPS)}/s writes · ${fmt(c.peakReadQPS)}/s reads`,
          body: `<div class="formula-box">
write_QPS = DAU × posts/day ÷ 86,400 = <span class="v">${fmt(c.dau)}</span> × <span class="v">${c.postsPerDay}</span> ÷ 86,400 = <span class="r">${fmt(c.writeQPS)}/s</span><br>
peak_write = avg × 3 = <span class="r">${fmt(c.peakWriteQPS)}/s</span><br>
read_QPS = write × 8 = <span class="r">${fmt(c.readQPS)}/s</span>  →  peak = <span class="r">${fmt(c.peakReadQPS)}/s</span></div>
<table class="metrics-table">
  <tr><td>Daily active users</td><td>${fmt(c.dau)}</td></tr>
  <tr><td>Posts per user / day</td><td>${c.postsPerDay}</td></tr>
  <tr><td>Posts generated / day</td><td>${fmt(c.writesPerDay)}</td></tr>
  <tr><td>Avg write QPS</td><td>${fmt(c.writeQPS)}/s</td></tr>
  <tr><td>Peak write QPS (×3)</td><td class="hl">${fmt(c.peakWriteQPS)}/s</td></tr>
  <tr><td>Peak read QPS (×8 × 5)</td><td class="hl">${fmt(c.peakReadQPS)}/s</td></tr>
</table>`,
        },
        {
          title: 'Fanout & timeline generation',
          summary: `${fmt(c.fanoutWPS)}/s fanout writes`,
          body: `<div class="formula-box">
fanout_writes/s = write_QPS × avg_followers<br>
&nbsp;&nbsp;= <span class="v">${fmt(c.writeQPS)}/s</span> × <span class="v">${fmt(c.avgFollowers)}</span> = <span class="r">${fmt(c.fanoutWPS)}/s</span></div>
<table class="metrics-table">
  <tr><td>Fanout model</td><td class="hl">${modelNames[c.fanoutModel]}</td></tr>
  <tr><td>Avg followers / user</td><td>${fmt(c.avgFollowers)}</td></tr>
  <tr><td>Fanout writes / sec</td><td class="warn">${fmt(c.fanoutWPS)}/s</td></tr>
  <tr><td>Celebrity users (>${1e6 < 1e9 ? '1M' : '1B'} followers)</td><td>${fmt(c.celebrities)}</td></tr>
  <tr><td>Celebrity fanout storm</td><td class="warn">${fmt(c.celebFanoutWPS)}/s</td></tr>
  <tr><td>Effective DB writes/sec</td><td class="hl">${fmt(c.dbWriteQPS)}/s</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Push vs Pull vs Hybrid</div>
<div class="info-box-body"><strong>Push (eager):</strong> on post, write to every follower's timeline in Redis. Fast reads (O(1)), but O(N) writes. Celebrity with 100M followers → 100M cache writes per post.<br>
<strong>Pull (lazy):</strong> timeline is computed at read time by merging followees' feeds. No fanout, but slow reads (O(N) DB lookups).<br>
<strong>Hybrid:</strong> push to regular users (&lt;1M followers), pull for celebrities. Most production systems (Twitter, Instagram) use this.</div></div>`,
        },
        {
          title: 'Storage estimation',
          summary: `${fmtB(c.dailyPostBytes)}/day · ${fmtB(c.yearlyStorage)}/year`,
          body: `<div class="formula-box">
avg_post_bytes = text + media_pct × media_size<br>
&nbsp;&nbsp;= <span class="v">350 B</span> + <span class="v">${(c.mediaPct*100).toFixed(0)}%</span> × 300 KB = <span class="r">${fmtB(c.avgPostBytes)}</span><br>
daily_storage = posts/day × avg_bytes = <span class="r">${fmtB(c.dailyPostBytes)}</span></div>
<table class="metrics-table">
  <tr><td>Avg post size (text)</td><td>350 B</td></tr>
  <tr><td>Media per post (${(c.mediaPct*100).toFixed(0)}%)</td><td>${fmtB(c.mediaPct * 300e3)}</td></tr>
  <tr><td>Avg post size (blended)</td><td>${fmtB(c.avgPostBytes)}</td></tr>
  <tr><td>Daily posts</td><td>${fmt(c.writesPerDay)}</td></tr>
  <tr><td>Daily storage</td><td class="hl">${fmtB(c.dailyPostBytes)}</td></tr>
  <tr><td>Yearly (×365 ×3 replication)</td><td class="warn">${fmtB(c.yearlyStorage)}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Media vs metadata split</div>
<div class="info-box-body">Store media (images/video) in object store (S3) — append-only, cheap. Store post metadata (text, author, timestamp, media_url) in DB. CDN serves media globally, DB serves metadata. Never store binary in SQL.</div></div>`,
        },
        {
          title: 'Caching strategy',
          summary: `${fmtB(c.cacheSizeBytes)} Redis for timelines`,
          body: `<div class="formula-box">
timeline_cache = DAU × 200 posts × 450 B/entry<br>
&nbsp;&nbsp;= <span class="v">${fmt(c.dau)}</span> × 200 × 450 B = <span class="r">${fmtB(c.cacheSizeBytes)}</span></div>
<table class="metrics-table">
  <tr><td>Timeline entries per user</td><td>200 posts</td></tr>
  <tr><td>Cache entry size</td><td>~450 B</td></tr>
  <tr><td>Total timeline cache</td><td class="hl">${fmtB(c.cacheSizeBytes)}</td></tr>
  <tr><td>Redis capacity (per node)</td><td>~100 GB</td></tr>
  <tr><td>Redis nodes needed</td><td>${Math.max(1, Math.ceil(c.cacheSizeBytes / 100e9))}</td></tr>
  <tr><td>Cache structure</td><td>Sorted Set (score = timestamp)</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Redis sorted set for timelines</div>
<div class="info-box-body"><code>ZADD timeline:{user_id} {timestamp} {post_id}</code> — O(log N) insert, O(log N + K) range fetch. Cap at 800 entries with <code>ZREMRANGEBYRANK</code> on insert. Very old posts fetched from Cassandra (cold path).</div></div>`,
        },
      ];
    },

    arch(c) {
      const dbHot = c.dbWriteQPS > 100000;
      return drawArch([
        { id: 'clients',  x: 75,  y: 10,  w: 210, h: 34, label: `Users (${fmt(c.dau)} DAU)`,            color: '#6366f1' },
        { id: 'api',      x: 75,  y: 74,  w: 210, h: 34, label: 'API Gateway / Load Balancer',           color: '#6366f1' },
        { id: 'feed-svc', x: 20,  y: 140, w: 150, h: 34, label: 'Feed Service',                          color: '#6D28D9' },
        { id: 'fanout',   x: 190, y: 140, w: 150, h: 34, label: 'Fanout Worker',                         color: dbHot ? '#ef4444' : '#f59e0b' },
        { id: 'redis',    x: 20,  y: 206, w: 150, h: 34, label: `Timeline Cache (Redis)`,                 color: '#14b8a6' },
        { id: 'db',       x: 190, y: 206, w: 150, h: 34, label: 'Post DB (Cassandra)',                    color: dbHot ? '#ef4444' : '#22c55e' },
        { id: 'media',    x: 75,  y: 272, w: 210, h: 34, label: 'Media Store (S3 + CDN)',                 color: '#22c55e' },
      ], [
        { from: 'clients',  to: 'api',      label: 'HTTPS' },
        { from: 'api',      to: 'feed-svc', label: 'read' },
        { from: 'api',      to: 'fanout',   label: 'write' },
        { from: 'feed-svc', to: 'redis',    label: 'timeline' },
        { from: 'fanout',   to: 'redis',    label: 'push' },
        { from: 'fanout',   to: 'db',       label: 'store' },
        { from: 'db',       to: 'media',    label: 'media_url' },
      ]);
    },

    components() {
      return [
        {
          icon: '🗃️', name: 'Cassandra (post storage)', best: true,
          reason: 'Wide-column store optimised for time-series append writes. Partition key = user_id, clustering key = created_at DESC gives free chronological fetch. Linear horizontal scale.',
          stats: ['50K writes/node', 'AP (tunable)', 'Time-series', 'No JOINs'],
        },
        {
          icon: '⚡', name: 'Redis (timeline cache)', best: true,
          reason: 'Sorted sets with Unix timestamp as score give O(log N) insert and O(log N + K) paginated range reads. Cap timeline to 800 entries; backfill older posts from Cassandra.',
          stats: ['100K ops/s', 'ZADD O(logN)', '~100GB/node', 'TTL eviction'],
        },
        {
          icon: '🔀', name: 'Kafka (fanout queue)', best: false,
          reason: 'Decouple write path from fanout. Post service publishes to Kafka; fanout workers consume and push to follower timelines. Backpressure handled naturally.',
          stats: ['1M msgs/s', 'Async fanout', 'Replay', 'Ordered'],
        },
        {
          icon: '🌐', name: 'CDN (media delivery)', best: false,
          reason: 'Images and videos are immutable after upload — ideal CDN candidates. 90%+ cache-hit ratio. Offloads origin S3, reduces latency from ~200ms to <20ms globally.',
          stats: ['<20ms p99', '>90% hit rate', 'Immutable', 'Edge PoPs'],
        },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Push on write',   pro: 'O(1) feed read — pre-computed timeline',                    con: 'O(N) writes per post; celebrity storm' },
        { algo: 'Pull on read',    pro: 'No fanout write cost; simple write path',                   con: 'O(N) DB reads per timeline fetch; high latency' },
        { algo: 'Hybrid',          pro: 'Push for normal users, pull for celebrities — best of both', con: 'Complex logic; need to classify users' },
        { algo: 'Ranked feed',     pro: 'Engagement-driven; users see relevant content',             con: 'ML inference at read time adds latency' },
        { algo: 'Cassandra',       pro: 'Linear scale, fast time-series writes, AP',                 con: 'No JOINs, eventual consistency, schema rigid' },
      ];
    },

    tips: [
      'Lead with the celebrity (Justin Bieber) problem — it shows you understand fanout at scale. Instagram uses hybrid: push to <1M followers, pull for mega-celebrities',
      'Redis sorted set is the canonical timeline store: ZADD timeline:{uid} {ts} {post_id}. O(log N) insert, O(log N+K) range fetch, cap with ZREMRANGEBYRANK',
      'The read:write ratio (~8:1) means reads are the bottleneck, not writes. Cache aggressively — a stale feed for 30 seconds is fine',
      'Media is immutable after upload. CDN cache-hit rates of 90%+ mean you slash origin bandwidth and latency. Store only the metadata URL in the DB',
      'Cassandra partitions by user_id, clusters by created_at DESC — zero sorting cost at read. Design schema for your access patterns first, then fit Cassandra around it',
      'Fanout workers are stateless consumers — scale them independently. Kafka gives you replay for backfilling cold timelines after a cache eviction',
    ],
  });
})();
