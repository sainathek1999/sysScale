/* ============================================================
   modules-storage.js — 5 Storage track modules, full content
   ============================================================ */
(function () {
  window.SS = window.SS || {};
  window.SS.MODULES = window.SS.MODULES || {};

  window.SS.MODULES['storage'] = [
    /* ── 1 ── SQL Internals ───────────────────────────────── */
    {
      id: 'sql-internals',
      title: 'SQL Internals',
      track: 'storage',
      difficulty: 'intermediate',
      readingMins: 15,
      keyPoints: [
        'B-tree indexes support O(log n) point lookups and range scans; hash indexes support O(1) point lookups but cannot serve range queries.',
        'MVCC (Multi-Version Concurrency Control) allows readers and writers to proceed concurrently by keeping multiple row versions — Postgres and MySQL InnoDB both use MVCC.',
        'WAL (Write-Ahead Log) ensures crash recovery: changes are written to the log before the data files, so a crashed DB replays the WAL on restart without data loss.',
        'Isolation levels trade anomaly prevention for concurrency: Read Committed prevents dirty reads; Repeatable Read prevents non-repeatable reads; Serializable prevents phantoms but is slowest.',
        'Connection pooling (PgBouncer, HikariCP) is mandatory at scale — Postgres forks a process per connection, and >300–500 direct connections degrade performance significantly.',
        'A read replica can absorb 70–90% of total DB traffic for read-heavy workloads, but replication lag of 10–200ms means stale reads are possible and writes cannot be distributed.',
      ],
      quiz: [
        {
          q: 'A query SELECT * FROM orders WHERE customer_id = 42 does a full sequential scan on a 100M-row table. What is the single most effective fix?',
          opts: [
            'Add more RAM to the database server',
            'Create a B-tree index on customer_id',
            'Switch to a NoSQL database',
            'Increase the connection pool size',
          ],
          answer: 1,
          explanation: 'A B-tree index on customer_id turns a full table scan (O(n)) into an index range scan (O(log n) + result rows). Adding RAM or connections does not change the query plan. NoSQL migration is a much larger change that doesn\'t address the root problem.',
        },
        {
          q: 'Transaction A reads a bank balance of $500. Transaction B then deducts $200 and commits. Transaction A reads again in the same transaction and sees $500. What anomaly is present and what isolation level prevents it?',
          opts: [
            'Dirty read — prevented by Read Committed',
            'Non-repeatable read — prevented by Repeatable Read',
            'Phantom read — prevented by Serializable',
            'Lost update — prevented by Read Committed',
          ],
          answer: 1,
          explanation: 'A non-repeatable read occurs when the same row is read twice in a transaction and the value changes between reads because another transaction committed in between. Repeatable Read isolation prevents this by locking the rows read or using MVCC snapshots for the duration of the transaction.',
        },
        {
          q: 'A Postgres server crashes mid-write. On restart, it replays the WAL. Which ACID property does this guarantee?',
          opts: [
            'Atomicity — the transaction either fully applied or is rolled back',
            'Consistency — constraints are always satisfied',
            'Isolation — concurrent transactions do not interfere',
            'Durability — committed data survives crashes',
          ],
          answer: 3,
          explanation: 'WAL replay guarantees Durability: all committed transactions are recoverable even after a crash. The WAL is written to durable storage before the data pages, so committed transactions are never lost. Atomicity is also enforced by WAL (incomplete transactions are rolled back on replay).',
        },
        {
          q: 'Your Postgres primary is at 95% CPU due to a write-heavy feature. You add 3 read replicas. Does this help?',
          opts: [
            'Yes — replicas distribute all database traffic',
            'Yes — replicas take over half the writes via replication',
            'No — read replicas absorb reads only; writes still go to the primary',
            'No — read replicas increase primary CPU due to replication overhead',
          ],
          answer: 2,
          explanation: 'Read replicas receive a copy of writes via the replication stream but only serve read queries from clients. All client writes still funnel through the single primary. To reduce write load, you need sharding, a write queue, or a CQRS pattern that batches writes.',
        },
      ],
      relatedSystems: ['url-shortener', 'key-value-store'],
      content: `
<h2>How B-tree indexes work</h2>
<p>Every relational database defaults to B-tree indexes. A B-tree is a self-balancing tree where each node holds multiple sorted keys and pointers to child nodes. A lookup traverses from root to leaf in O(log n) steps — for 100M rows with a tree of height ~26, that's 26 page reads instead of 100M.</p>
<div class="formula-box">B-tree height ≈ log<sub>B</sub>(n)<br>For 100M rows, branching factor 200:<br><span class="v">height ≈ log₂₀₀(100,000,000) ≈ 4 levels</span></div>
<table class="metrics-table">
  <tr><td><strong>B-tree</strong></td><td class="hl">Point lookup + range scan. Default for equality and range predicates.</td></tr>
  <tr><td><strong>Hash index</strong></td><td>O(1) point lookup. No range support. Used in Postgres hash indexes, MySQL MEMORY tables.</td></tr>
  <tr><td><strong>GIN / full-text</strong></td><td class="hl">Inverted index for array/JSONB/text containment queries.</td></tr>
  <tr><td><strong>BRIN</strong></td><td>Block-range index for naturally ordered data (timestamps). Tiny size, approximate.</td></tr>
</table>
<p><strong>Index selectivity matters:</strong> an index on a boolean column with 50/50 split is useless — the planner will prefer a seq scan. High-cardinality columns (user_id, email) benefit most from B-tree indexes.</p>

<h2>Query planning</h2>
<p>The query planner uses statistics (column histograms, row counts, correlation) to choose the cheapest execution plan. Run <code>EXPLAIN ANALYZE</code> to see what the planner chose and actual vs estimated row counts. When estimates are wildly off, run <code>ANALYZE</code> to refresh statistics.</p>
<div class="info-box">
  <div class="info-box-title">Index-only scans</div>
  <div class="info-box-body">If all columns in a query are covered by the index, Postgres can answer the query without touching the heap (data file) at all — called a covering index or index-only scan. Design composite indexes with the most selective column first, and include frequently projected columns to enable index-only scans.</div>
</div>

<h2>MVCC: concurrency without locking reads</h2>
<p>MVCC (Multi-Version Concurrency Control) keeps multiple versions of each row. Readers see the version that was current when their transaction started; writers create new versions. This means <strong>readers never block writers and writers never block readers</strong>.</p>
<table class="metrics-table">
  <tr><td>Read locks needed</td><td class="hl">None — readers see a consistent snapshot</td></tr>
  <tr><td>Dead tuple overhead</td><td>Old row versions accumulate — requires VACUUM to reclaim space</td></tr>
  <tr><td>Snapshot isolation</td><td class="hl">Each transaction sees the DB as of its start time</td></tr>
</table>

<h2>ACID and isolation levels</h2>
<p>ACID guarantees that transactions are Atomic (all-or-nothing), Consistent (constraints preserved), Isolated (concurrent transactions don't interfere), and Durable (committed data survives failures). Isolation is the most nuanced — weaker levels allow anomalies in exchange for higher concurrency:</p>
<table class="metrics-table">
  <tr><td><strong>Read Uncommitted</strong></td><td>Dirty reads allowed. Practically never used.</td></tr>
  <tr><td><strong>Read Committed</strong></td><td class="hl">Default in Postgres/Oracle. Prevents dirty reads. Non-repeatable reads possible.</td></tr>
  <tr><td><strong>Repeatable Read</strong></td><td class="hl">Same rows read twice return same values. Phantom reads still possible in some DBs.</td></tr>
  <tr><td><strong>Serializable</strong></td><td>Full serial equivalence. Highest consistency, lowest throughput.</td></tr>
</table>

<h2>Write-Ahead Logging (WAL)</h2>
<p>Before any data page is modified on disk, the change is appended to the WAL (a sequential log file). If the server crashes mid-write, on restart the DB replays the WAL from the last checkpoint, recovering all committed transactions and rolling back incomplete ones. Sequential WAL writes are also far faster than random data-page writes — this is why writes are fast even on spinning disks.</p>

<h2>Connection pooling</h2>
<p>Postgres forks a new OS process per client connection. Each process consumes ~5–10 MB RAM. With 1,000 direct connections, you've used 5–10 GB just on connection overhead, and context-switching degrades throughput. The fix: a connection pooler like PgBouncer sits between your app servers and Postgres, multiplexing hundreds of app connections into a small pool (typically 10–100) of real database connections.</p>
<div class="formula-box">1,000 app servers × 10 threads each = <span class="v">10,000 app connections</span><br>PgBouncer pool → <span class="v">50 Postgres connections</span><br>Result: 200× reduction in DB connection overhead</div>
`,
    },

    /* ── 2 ── NoSQL Landscape ─────────────────────────────── */
    {
      id: 'nosql-landscape',
      title: 'NoSQL Landscape',
      track: 'storage',
      difficulty: 'intermediate',
      readingMins: 14,
      keyPoints: [
        'Document stores (MongoDB, Firestore) embed related data in one document — no joins needed; ideal when the data access pattern is known and hierarchical.',
        'Wide-column stores (Cassandra, DynamoDB) distribute rows by partition key and sort within a partition by clustering key — model your primary key around your query, not your entity.',
        'Key-value stores (Redis, DynamoDB as KV) provide O(1) lookup by key with no secondary indexes unless explicitly supported — best for caching, sessions, and leaderboards.',
        'Graph databases (Neo4j) traverse relationships in O(1) per hop via pointer-based adjacency lists — SQL JOINs across a deep graph degrade exponentially.',
        'Time-series databases (InfluxDB, TimescaleDB, Prometheus) use LSM-tree storage and time-based partitioning for high-throughput append-only writes and fast time-range queries.',
        'Default to a relational DB unless you have identified a specific performance or data-model bottleneck — NoSQL makes some queries fast by making others impossible.',
      ],
      quiz: [
        {
          q: 'You\'re building a fraud detection system that must find all transactions connected to a suspicious account within 3 hops. Which database type handles this most efficiently?',
          opts: [
            'Relational DB with recursive CTEs',
            'Document store with nested arrays',
            'Graph database (Neo4j)',
            'Wide-column store with composite keys',
          ],
          answer: 2,
          explanation: 'Graph databases traverse relationships in O(1) per hop using pointer-based adjacency lists — 3-hop traversal is just 3 pointer dereferences per node. A recursive SQL query on the same data requires multiple self-joins, degrading to O(n²) or worse as the graph grows.',
        },
        {
          q: 'A Cassandra table uses partition key user_id and clustering key created_at DESC. You query for the 20 most recent events for user 42. Is this efficient?',
          opts: [
            'No — Cassandra cannot sort within a partition',
            'No — user_id is too low-cardinality a partition key',
            'Yes — all events for user 42 are co-located on one partition, sorted by time',
            'Yes — but only if you have a secondary index on created_at',
          ],
          answer: 2,
          explanation: 'Cassandra co-locates all rows with the same partition key on the same set of nodes, sorted by the clustering key. Fetching the top-20 newest events is a single partition read with a LIMIT — extremely fast. This is exactly the design Cassandra\'s data model encourages.',
        },
        {
          q: 'A startup stores user profiles in MongoDB with nested reviews arrays. Queries filter by reviews.rating > 4 but are slow at 10M documents. What\'s the fix?',
          opts: [
            'Migrate to a relational database',
            'Create a multikey index on the reviews.rating field',
            'Add more MongoDB nodes',
            'Flatten the reviews into a separate collection',
          ],
          answer: 1,
          explanation: 'MongoDB supports multikey indexes on array fields — creating an index on reviews.rating makes the filter an index scan instead of a collection scan. This is a common MongoDB performance pattern: index any field you filter on, including nested array fields.',
        },
        {
          q: 'Your IoT platform ingests 500,000 sensor readings per second. Each reading has a timestamp, device_id, and metric value. Best database type?',
          opts: [
            'Document store — flexible schema for varying sensor types',
            'Relational DB — ACID guarantees for sensor data',
            'Time-series DB (InfluxDB / TimescaleDB)',
            'Graph DB — model sensors as nodes and readings as edges',
          ],
          answer: 2,
          explanation: 'Time-series databases use LSM-tree storage (fast sequential writes), automatic time-based partitioning, and columnar compression for repeated metric types. They are purpose-built for this workload and can ingest millions of events/sec with far less storage than a general-purpose DB.',
        },
      ],
      relatedSystems: ['key-value-store', 'url-shortener'],
      content: `
<h2>Why NoSQL exists</h2>
<p>Relational databases optimise for flexible query patterns and data integrity. NoSQL databases make a different bet: if you know your access pattern upfront, you can design a data model that makes that pattern extremely fast — while accepting that other patterns become hard or impossible. Understanding this trade-off is what separates a 5-star system design answer from a 3-star one.</p>

<h2>Document stores</h2>
<p>Documents (JSON/BSON) embed all related data in a single object. Reading a user profile with their addresses and preferences is one document fetch — no joins. This is ideal when a single entity view dominates reads.</p>
<table class="metrics-table">
  <tr><td><strong>Examples</strong></td><td>MongoDB, Firestore, Couchbase, DynamoDB (in document mode)</td></tr>
  <tr><td>Schema</td><td class="hl">Flexible — different documents can have different fields</td></tr>
  <tr><td>Joins</td><td>No native joins — embed or use application-level lookup</td></tr>
  <tr><td>Best for</td><td class="hl">User profiles, product catalogs, CMS, event logs</td></tr>
  <tr><td>Avoid when</td><td>Highly relational data with many-to-many relationships</td></tr>
</table>

<h2>Wide-column stores</h2>
<p>Wide-column stores (also called column-family databases) distribute data by a partition key. All rows with the same partition key live together on the same node, sorted by a clustering key. Design your primary key to answer your most common query directly — this is the fundamental Cassandra design principle.</p>
<div class="formula-box">Primary Key = <span class="v">Partition Key</span> + Clustering Key<br>Partition Key → determines which node<br>Clustering Key → sort order within partition<br><br>Query: SELECT * WHERE partition_key = X ORDER BY clustering_key</div>
<table class="metrics-table">
  <tr><td><strong>Examples</strong></td><td>Cassandra, HBase, Google Bigtable, ScyllaDB</td></tr>
  <tr><td>Write throughput</td><td class="hl">Extremely high — LSM-tree, append-only writes</td></tr>
  <tr><td>Query flexibility</td><td>Low — can only filter efficiently on partition and clustering keys</td></tr>
  <tr><td>Best for</td><td class="hl">Time-series data, activity feeds, messaging history, IoT</td></tr>
</table>

<h2>Key-value stores</h2>
<p>The simplest NoSQL model: a hash map with a key and an opaque value blob. Lookups are O(1). No secondary indexes unless the store builds them. Redis extends this with rich data structures: sorted sets (leaderboards), streams (event logs), pub/sub, and atomic operations like INCR.</p>
<table class="metrics-table">
  <tr><td><strong>Examples</strong></td><td>Redis, Memcached, DynamoDB (KV mode), etcd</td></tr>
  <tr><td>Throughput</td><td class="hl">Redis: ~100K–500K ops/s single node</td></tr>
  <tr><td>Best for</td><td class="hl">Sessions, caching, rate limiting, leaderboards, pub/sub</td></tr>
</table>

<h2>Graph databases</h2>
<p>Graph DBs store entities (nodes) and relationships (edges) as first-class objects with direct pointer references. Traversing a relationship is following a pointer — O(1) per hop. SQL needs a JOIN for each hop, which is O(n) per level of depth. For recommendation engines, fraud detection, and social graphs, this difference is decisive.</p>

<h2>Time-series databases</h2>
<p>TSDBs are optimised for append-only timestamped data. They automatically shard by time window, compress repeated values with delta encoding, and support downsampling (aggregate old data into hourly/daily buckets). Queries like "average CPU for host X over the last 6 hours" are native and fast.</p>
<table class="metrics-table">
  <tr><td><strong>Examples</strong></td><td>InfluxDB, TimescaleDB (Postgres extension), Prometheus, Druid</td></tr>
  <tr><td>Write pattern</td><td class="hl">Append-only, high ingest rate (millions of events/sec)</td></tr>
  <tr><td>Query pattern</td><td class="hl">Time-range aggregations, downsampling, last-value lookups</td></tr>
</table>

<h2>The decision framework</h2>
<div class="formula-box">Unknown query patterns → <span class="v">Relational (Postgres/MySQL)</span><br>Hierarchical entity, one access pattern → <span class="v">Document (MongoDB)</span><br>Time-ordered per-entity events → <span class="v">Wide-column (Cassandra)</span><br>Simple fast lookups, caching → <span class="v">Key-value (Redis)</span><br>Relationship traversal, social/fraud → <span class="v">Graph (Neo4j)</span><br>Timestamped metrics, IoT → <span class="v">Time-series (InfluxDB)</span></div>
<div class="info-box">
  <div class="info-box-title">Interview tip</div>
  <div class="info-box-body">Never say "I'd use MongoDB because NoSQL is more scalable." Explain the specific access pattern, why it doesn't fit a relational model, and what the NoSQL database's data model directly enables. Interviewers deduct points for cargo-cult NoSQL choices.</div>
</div>
`,
    },

    /* ── 3 ── Caching Deep Dive ───────────────────────────── */
    {
      id: 'caching-deep-dive',
      title: 'Caching Deep Dive',
      track: 'storage',
      difficulty: 'intermediate',
      readingMins: 13,
      keyPoints: [
        'Cache-aside (lazy loading): app reads cache first; on a miss, reads the DB and writes to cache. Most common pattern — but cold starts expose the DB to miss storms.',
        'Write-through: writes go to cache and DB synchronously — no stale data, but every write incurs full DB latency even on cache hits.',
        'Write-behind (write-back): writes land in cache, DB updated asynchronously — lowest write latency, but data loss risk if the cache node fails before flushing.',
        'LRU eviction is optimal for workloads with temporal locality; LFU is better for skewed access where popular items should survive spikes in new data.',
        'Thundering herd: when a cache key expires, many concurrent requests miss simultaneously and flood the DB. Fix: probabilistic early expiration or a per-key mutex (cache lock).',
        'Redis is single-threaded for commands (no lock contention), supports rich data types (sorted sets, streams, bitmaps), and offers optional persistence (RDB snapshots + AOF log).',
      ],
      quiz: [
        {
          q: 'A cached homepage expires at exactly midnight. 50,000 users are active and all hit the site simultaneously. What problem occurs and what\'s the fix?',
          opts: [
            'Cache poisoning — sanitize inputs before caching',
            'Thundering herd — all requests miss cache and hammer the DB; fix with a per-key mutex or probabilistic early expiration',
            'Cache eviction storm — switch from LRU to LFU',
            'Write-back failure — use write-through instead',
          ],
          answer: 1,
          explanation: 'When a hot key expires simultaneously for all requesters, every request fires a DB query at the same moment — this is the thundering herd. A per-key mutex ensures only one request rebuilds the cache while others wait for the result. Probabilistic Early Recomputation (PER) pre-recomputes the cache slightly before expiry, eliminating the simultaneous miss entirely.',
        },
        {
          q: 'You use write-through caching. A cache update fails after the DB write succeeds. What is the resulting state and how do you recover?',
          opts: [
            'DB is stale, cache is fresh — re-read from cache',
            'DB is fresh, cache is stale — next read will serve stale data until TTL expires or an explicit invalidation',
            'Both DB and cache are corrupted — restore from backup',
            'The transaction is automatically rolled back',
          ],
          answer: 1,
          explanation: 'Write-through does not make cache and DB updates atomic. The DB succeeded, but the cache holds the old value. Until the TTL expires or you explicitly invalidate the cache key, reads will serve stale data. Fix: treat cache write failures as a signal to immediately delete (invalidate) the key rather than leaving the stale value.',
        },
        {
          q: 'You need a distributed rate limiter shared across 100 app servers — a user can make max 100 requests per minute. What Redis feature implements this?',
          opts: [
            'Redis SET with NX and EX flags for atomic set-if-not-exists',
            'Redis INCR with TTL — atomic increment, expire the key after 60s, reject if count > 100',
            'Redis Pub/Sub to broadcast the request count to all servers',
            'Redis LPUSH to maintain a list of request timestamps',
          ],
          answer: 1,
          explanation: 'INCR is atomic in Redis — it increments the integer value at a key and returns the new count in a single operation. Set the key\'s TTL to 60 seconds on first creation. If INCR returns > 100, reject the request. This is a fixed-window rate limiter. For a precise sliding window, use a Redis sorted set with timestamp scores.',
        },
        {
          q: 'When should you choose Memcached over Redis?',
          opts: [
            'When you need persistence across server restarts',
            'When you need sorted sets or pub/sub functionality',
            'When you need simple string caching with the highest possible multi-threaded read concurrency and lowest memory overhead',
            'When you need TTL-based key expiration',
          ],
          answer: 2,
          explanation: 'Memcached is multi-threaded (Redis is single-threaded per shard) and has a simpler, more memory-efficient implementation for pure key-value string caching. Facebook historically used Memcached for its CDN-like L2 cache at massive scale because of its predictable performance. If you need persistence, data structures, transactions, or pub/sub, Redis is the choice.',
        },
      ],
      relatedSystems: ['url-shortener', 'rate-limiter'],
      content: `
<h2>Cache-aside (lazy loading)</h2>
<p>The most widely used caching pattern. The application code is responsible for checking the cache, fetching from the DB on a miss, and populating the cache. The DB is the source of truth; the cache is a best-effort acceleration layer.</p>
<div class="formula-box">Read: Check cache → <span class="v">HIT: return cached value</span><br>         → MISS: read DB → write to cache → return value<br><br>Write: Update DB → <span class="v">Invalidate (delete) cache key</span></div>
<p><strong>Trade-offs:</strong> Simple to implement. Cache only holds data that was actually requested. Cold start = all misses. Stale data risk if cache invalidation is missed after writes.</p>

<h2>Write-through</h2>
<p>Every write goes to both the cache and the database synchronously before the write is confirmed to the client. The cache is always warm and consistent with the DB.</p>
<table class="metrics-table">
  <tr><td>Stale data</td><td class="hl">None — cache and DB always in sync</td></tr>
  <tr><td>Write latency</td><td>Higher — must write to DB on every write, even for cache hits</td></tr>
  <tr><td>Cache churn</td><td>Writes that are never read waste cache space</td></tr>
  <tr><td>Best for</td><td class="hl">Read-heavy, write-occasionally; financial data; recently-written-then-read patterns</td></tr>
</table>

<h2>Write-behind (write-back)</h2>
<p>Writes land in the cache only. The DB is updated asynchronously by a background process. This gives the lowest write latency but introduces a durability window during which a cache failure loses unflushable writes.</p>
<div class="info-box">
  <div class="info-box-title">When write-behind is acceptable</div>
  <div class="info-box-body">Write-behind is appropriate for high-velocity counters (view counts, likes), recommendation signal collection, and analytics events where losing a small window of writes is acceptable. Never use it for financial transactions or authoritative state.</div>
</div>

<h2>Read-through</h2>
<p>Like cache-aside but the cache library/layer handles the DB fallback automatically — the application always talks to the cache. The cache fetches from the DB on miss, populates itself, and returns the result. This simplifies application code at the cost of less control over eviction and invalidation.</p>

<h2>Eviction policies</h2>
<table class="metrics-table">
  <tr><td><strong>LRU</strong> (Least Recently Used)</td><td class="hl">Evicts the key not accessed for the longest time. Best for temporal locality — recent data is reused. Default in Redis.</td></tr>
  <tr><td><strong>LFU</strong> (Least Frequently Used)</td><td class="hl">Evicts the least-accessed key over time. Better when popular items should stay regardless of recency. Available in Redis 4+.</td></tr>
  <tr><td><strong>FIFO</strong></td><td>Evicts the oldest inserted key. Simple, poor hit rate for most workloads.</td></tr>
  <tr><td><strong>TTL-based</strong></td><td>Keys expire after a fixed duration. Simple; combine with LRU for memory limits.</td></tr>
</table>

<h2>Thundering herd and cache stampede</h2>
<p>When a popular key expires, many concurrent requests simultaneously miss and race to rebuild it. Each fires a DB query — suddenly the DB receives 10,000 queries for the same row at the same time.</p>
<div class="formula-box">Fix 1: <span class="v">Mutex per key</span> — first miss acquires a lock and rebuilds; others wait<br>Fix 2: <span class="v">Probabilistic Early Recomputation</span> — recompute before expiry with probability proportional to time-to-expiry<br>Fix 3: <span class="v">Jittered TTL</span> — TTL = base ± random(0, 30s) to spread expirations</div>

<h2>Redis vs Memcached</h2>
<table class="metrics-table">
  <tr><td><strong>Redis</strong></td><td class="hl">Single-threaded commands, rich data types (sorted sets, streams, hashes, bitmaps), persistence (RDB/AOF), Lua scripting, cluster mode</td></tr>
  <tr><td><strong>Memcached</strong></td><td>Multi-threaded, simple string KV only, no persistence, lower memory overhead per key</td></tr>
  <tr><td>Throughput (single node)</td><td class="hl">Redis: ~100–500K ops/s; Memcached: ~1M ops/s for simple GETs</td></tr>
  <tr><td>Choose Redis when</td><td class="hl">You need sorted sets (leaderboards), pub/sub, Lua transactions, or persistence</td></tr>
  <tr><td>Choose Memcached when</td><td>Pure string caching at very high concurrency, minimal memory overhead matters most</td></tr>
</table>

<h2>CDN caching</h2>
<p>CDN caches are cache-aside at the edge — the CDN PoP stores a copy of the response keyed by URL + Vary headers. Cache-Control and Surrogate-Control headers control TTL. For APIs, include <code>Cache-Control: public, max-age=60, stale-while-revalidate=30</code> to allow background revalidation without blocking the user.</p>
`,
    },

    /* ── 4 ── Sharding & Partitioning ────────────────────── */
    {
      id: 'sharding-partitioning',
      title: 'Sharding & Partitioning',
      track: 'storage',
      difficulty: 'intermediate',
      readingMins: 14,
      keyPoints: [
        'Range sharding splits data by value range (user_id 1–1M on shard 1) — enables efficient range queries but creates write hotspots when writes concentrate on the current range (e.g., time-series data).',
        'Hash sharding distributes rows by hash(key) % N — even load distribution but range queries must scatter to all shards (fan-out) and then gather (merge) results.',
        'Consistent hashing places nodes and keys on a virtual ring — adding or removing a node moves only K/N keys, not all keys; used in Cassandra token ranges and cache clusters.',
        'The hotspot (whale) problem: a single entity (celebrity, viral product) generates disproportionate traffic to one shard. Fix: add a random suffix to the key (key#0 … key#9) and scatter writes across sub-shards.',
        'Resharding is the most operationally painful database operation — requires migrating data while serving live traffic. Use double-write or a logical shard layer to avoid downtime.',
        'Cross-shard queries (joins or aggregations spanning multiple shards) must scatter to all shards and gather results in the application — O(shards) queries instead of O(1). Design your shard key to make the most common queries shard-local.',
      ],
      quiz: [
        {
          q: 'You shard a time-series events table by date (range sharding). All writes for today land on one shard. What is this problem called, and what\'s the fix?',
          opts: [
            'Cache stampede — add TTL jitter to write operations',
            'Write hotspot — use a composite shard key such as hash(user_id) XOR date to distribute writes across shards',
            'Replication lag — switch to synchronous replication',
            'Phantom read — use Serializable isolation',
          ],
          answer: 1,
          explanation: 'Range-sharding by time causes all current writes to funnel to the shard that owns today\'s range — a classic write hotspot. Adding a hash component to the shard key (e.g., hash(user_id) mod N combined with the date bucket) distributes writes evenly while still allowing time-range queries within a bounded scatter.',
        },
        {
          q: 'A Cassandra cluster uses consistent hashing across 6 nodes. You add a 7th node. Approximately what percentage of data is redistributed?',
          opts: [
            '100% — all keys are rehashed',
            '~50% — half the keys shift',
            '~14% (1/7) — only the keys that map to the new node\'s token range',
            '0% — consistent hashing requires no data movement',
          ],
          answer: 2,
          explanation: 'Consistent hashing places nodes at random points on a ring. A new node takes ownership of the token range between itself and the previous node — approximately 1/(N+1) of the total keyspace. With 6 nodes adding a 7th, ~1/7 ≈ 14% of keys move. Standard modulo sharding would require rehashing 100% of keys.',
        },
        {
          q: 'A social network shards tweets by tweet_id. A query for "all tweets by user_id=42" is issued. What\'s the performance problem?',
          opts: [
            'No problem — tweet_id is a good shard key for user queries',
            'The query must scatter to all shards to find user 42\'s tweets, then merge results — O(shards) queries',
            'The query will fail — cross-shard joins are unsupported',
            'The user\'s tweets will be lost — they must be on the same shard as the user',
          ],
          answer: 1,
          explanation: 'Sharding by tweet_id distributes tweets randomly across shards. To find all tweets by user 42, the system must query every shard in parallel (scatter), then merge the results (gather). At thousands of shards this is expensive. The fix: maintain a secondary index (user_id → [tweet_ids]) on a separate lookup shard, or shard by user_id if user-centric reads dominate.',
        },
        {
          q: 'You need to migrate from 4 database shards to 8 shards with zero downtime. What strategy minimises risk?',
          opts: [
            'Stop all writes, migrate data, then restart — the fastest approach',
            'Double-write: write to both old and new shard layouts during migration, backfill existing data, then atomically cut over reads',
            'Create the new shards and let replication sync them overnight',
            'Use a blue-green deployment: clone all 4 shards into 8 new shards, then switch DNS',
          ],
          answer: 1,
          explanation: 'Double-write ensures no writes are lost during the migration window. New writes go to both the old (4-shard) and new (8-shard) layouts. A backfill job migrates existing data. Once the backfill is complete and the new layout is verified, reads are cut over to the new shards, and finally double-writing is stopped. This is the standard zero-downtime resharding playbook.',
        },
      ],
      relatedSystems: ['key-value-store', 'url-shortener'],
      content: `
<h2>Why sharding exists</h2>
<p>A single database server has a hard ceiling: disk IOPS, RAM, and CPU are bounded by the physical machine. Sharding (horizontal partitioning) splits the dataset across multiple machines so each node owns a subset of the data. Reads and writes for a key are routed to exactly the shard that owns that key.</p>

<h2>Range sharding</h2>
<p>Divide the keyspace into contiguous ranges. Shard 1 owns keys 1–1,000,000; shard 2 owns 1,000,001–2,000,000; and so on. Range queries (give me all orders from November) touch only the shards in the relevant range.</p>
<table class="metrics-table">
  <tr><td>Range queries</td><td class="hl">Fast — touch only the shards in the range</td></tr>
  <tr><td>Write distribution</td><td class="warn">Hotspots when writes cluster on one range (e.g., auto-increment IDs, timestamps)</td></tr>
  <tr><td>Rebalancing</td><td>Manual range splits when a shard grows too large</td></tr>
  <tr><td>Best for</td><td>Analytics tables with time-range query patterns (partition by month)</td></tr>
</table>

<h2>Hash sharding</h2>
<p>Apply a hash function to the key and take modulo N. <code>shard = hash(key) % N</code>. This distributes writes evenly regardless of key distribution patterns.</p>
<table class="metrics-table">
  <tr><td>Write distribution</td><td class="hl">Even — hash distributes uniformly</td></tr>
  <tr><td>Range queries</td><td class="warn">Fan-out to all shards — expensive at scale</td></tr>
  <tr><td>Adding a shard</td><td class="warn">Changes N → rehashes most keys → massive data migration</td></tr>
  <tr><td>Best for</td><td>Point lookups by a high-cardinality key (user_id, session_id)</td></tr>
</table>

<h2>Consistent hashing</h2>
<p>Place both servers and keys on a virtual ring (hash space 0 to 2³²). Each key is owned by the first server clockwise from its hash position. When a server is added, it takes ownership of a portion of its predecessor's range — only K/N keys move.</p>
<div class="formula-box">Ring: [0 ──── Node A ──── Node B ──── Node C ──── 2³²]<br>Key X hashes to position → served by <span class="v">first node clockwise</span><br>Add Node D → only D's clockwise predecessor loses keys to D<br>~<span class="v">1/(N+1)</span> keys reassigned</div>
<p>Virtual nodes (vnodes): each physical server claims multiple positions on the ring, smoothing load imbalances. Cassandra assigns 128–256 vnodes per server by default.</p>

<h2>The hotspot problem</h2>
<p>Even with hash sharding, a single "whale" key (a celebrity's profile, a viral post) can generate millions of reads/writes to one shard. Options:</p>
<div class="formula-box">Viral key: "user:12345"<br>Add suffix: "user:12345#0" … "user:12345#9"<br>→ writes scatter across <span class="v">10 sub-shards</span><br>→ reads must fan-out and aggregate (application merges)</div>

<h2>Secondary indexes on sharded data</h2>
<p>A secondary index on a non-shard key requires a scatter-gather: the index must either be maintained on every shard (local index) or on a dedicated global index shard (global index). Global indexes are consistent but become a bottleneck. Local indexes are fast to write but require scatter-gather to query.</p>

<h2>Cross-shard queries</h2>
<p>JOINs and aggregations across shards are expensive: fan-out to all shards, each returns partial results, the application (or a coordinator) merges them. Design principles to avoid this:</p>
<table class="metrics-table">
  <tr><td>Co-locate related data</td><td class="hl">Shard by the entity that's always in the WHERE clause (user_id, tenant_id)</td></tr>
  <tr><td>Denormalise</td><td class="hl">Embed the join data in the primary document (trade write cost for read simplicity)</td></tr>
  <tr><td>Global lookup table</td><td>Maintain a mapping of secondary key → shard + primary key on a small unsharded service</td></tr>
</table>
<div class="info-box">
  <div class="info-box-title">Instagram's shard approach</div>
  <div class="info-box-body">Instagram shards Postgres by user_id using a logical shard layer (they call it a "shard map"). All data for one user — photos, follows, likes — lives on the same shard. Cross-user queries (e.g., mutual friends) are handled by the application layer, not the DB. This design makes single-user reads extremely fast and avoids cross-shard joins on the hot path.</div>
</div>
`,
    },

    /* ── 5 ── Search Internals ────────────────────────────── */
    {
      id: 'search-internals',
      title: 'Search Internals',
      track: 'storage',
      difficulty: 'intermediate',
      readingMins: 13,
      keyPoints: [
        'An inverted index maps each unique term to a posting list (sorted list of document IDs containing that term) — the data structure that makes full-text search fast.',
        'TF-IDF scores documents by term frequency × inverse document frequency; common words like "the" have near-zero IDF and score close to zero regardless of frequency.',
        'BM25 (Best Match 25) extends TF-IDF with term saturation (diminishing returns for repeated terms) and field-length normalization — Elasticsearch\'s default ranker since v5.0.',
        'Tokenization pipeline: lowercasing → stop-word removal → stemming (run/running/ran → "run") → n-gram generation. Each stage expands or contracts the term vocabulary.',
        'Elasticsearch distributes an index across primary shards; each search fans out to all relevant shards in parallel and the coordinating node merges top-N results.',
        'Fuzzy search uses Levenshtein edit-distance — fuzziness=1 matches any term 1 insertion/deletion/substitution away; apply only to short user queries (≤5 chars) due to CPU cost.',
      ],
      quiz: [
        {
          q: 'A search for "running" returns zero results, but documents containing "run" and "ran" exist in the index. What is missing from the indexing pipeline?',
          opts: [
            'Stop-word removal — "running" is a common word',
            'Stemming or lemmatization — all forms of "run" must map to the same root token',
            'BM25 ranking — TF-IDF would find the results',
            'Sharding — the documents are on a different shard',
          ],
          answer: 1,
          explanation: 'Without stemming, "running", "run", and "ran" are three different tokens in the index. A stemmer (e.g., Porter stemmer) reduces them all to "run" at index time and query time, so the search matches all forms. Lemmatization achieves the same with linguistic accuracy rather than heuristic suffix stripping.',
        },
        {
          q: 'An Elasticsearch index has 5 primary shards and 1 replica each (10 shards total). A user searches for "distributed systems". How many shards process the query?',
          opts: [
            '1 — the coordinating node routes to the shard containing the key',
            '5 — the query fans out to all 5 primary shards (or their replicas) in parallel',
            '10 — all shards including replicas process the query',
            '2 — Elasticsearch always queries 2 shards by default',
          ],
          answer: 1,
          explanation: 'Elasticsearch fans out the search to all primary shards (or one replica each for read balance). Each shard returns its local top-N hits. The coordinating node merges and re-ranks these results to produce the global top-N. Total: 5 shard queries in parallel, regardless of replica count.',
        },
        {
          q: 'Why does TF-IDF assign a near-zero relevance score to the term "the" even when it appears 100 times in a document?',
          opts: [
            '"The" is removed by the tokenizer before indexing',
            'TF-IDF caps term frequency at 10',
            'IDF for "the" is ≈ log(total_docs / total_docs) ≈ 0 since "the" appears in virtually every document',
            'BM25 suppresses common words at query time',
          ],
          answer: 2,
          explanation: 'IDF = log(N / df) where N is total documents and df is documents containing the term. If "the" appears in 99% of documents, IDF ≈ log(1.01) ≈ 0.01. Multiplying any TF by 0.01 gives a near-zero score. This is the self-correcting property of IDF — it penalises terms that carry no discriminating information.',
        },
        {
          q: 'You\'re building an autocomplete feature: typing "sys" should instantly return "system", "syscall", "syslog". What indexing technique enables this without wildcard scans?',
          opts: [
            'BM25 with fuzziness=2',
            'Edge n-gram tokenizer — at index time, "system" generates tokens "s", "sy", "sys", "syst", "syste", "system"',
            'Inverted index on the full term only',
            'Prefix trie stored in application memory',
          ],
          answer: 1,
          explanation: 'An edge n-gram tokenizer generates all prefixes of each term at index time. Typing "sys" becomes an exact-match query for the token "sys", which hits the inverted index directly — no expensive wildcard scan. This is the standard Elasticsearch autocomplete pattern: use edge n-grams on the index-side analyzer and the standard analyzer on the search-side.',
        },
      ],
      relatedSystems: ['url-shortener'],
      content: `
<h2>The inverted index</h2>
<p>A traditional database index maps a row ID to its field values. A search index inverts this: it maps each unique term to the list of documents containing it. This posting list is sorted by document ID, enabling fast intersection (AND) and union (OR) of term lists using merge algorithms.</p>
<div class="formula-box">Term: "distributed" → [doc1, doc4, doc7, doc12, …]<br>Term: "systems"     → [doc1, doc3, doc7, doc19, …]<br><br>Query: "distributed AND systems"<br>→ merge posting lists → <span class="v">[doc1, doc7, …]</span></div>
<p>Posting lists are stored compressed on disk (delta-encoded VByte or PForDelta). For a billion-document index, "the" might have a 500 MB posting list — compression is critical.</p>

<h2>TF-IDF and BM25</h2>
<p>Once we know which documents contain the query terms, we need to rank them by relevance. TF-IDF is the foundational formula:</p>
<div class="formula-box">TF(t, d) = occurrences of term t in document d<br>IDF(t)   = log( N / df(t) ) — rarer terms score higher<br><br>Score(d, q) = Σ <span class="v">TF(t,d) × IDF(t)</span> for each term t in query q</div>
<p>BM25 improves TF-IDF in two ways: (1) <strong>saturation</strong> — the score increase per additional occurrence diminishes (the 100th "java" barely matters); (2) <strong>length normalization</strong> — a short document with 2 mentions of "java" ranks higher than a 10,000-word document with 5 mentions.</p>
<table class="metrics-table">
  <tr><td>TF-IDF weakness</td><td>Linear TF — more occurrences always helps, no saturation</td></tr>
  <tr><td>BM25 k₁ parameter</td><td class="hl">Controls saturation — k₁=1.2 is common; higher k₁ means less saturation</td></tr>
  <tr><td>BM25 b parameter</td><td class="hl">Controls length normalization — b=0.75 is the Elasticsearch default</td></tr>
  <tr><td>In practice</td><td class="hl">BM25 outperforms TF-IDF on most benchmark datasets — it is the Elasticsearch/Solr default</td></tr>
</table>

<h2>Tokenization pipeline</h2>
<p>Raw text must be converted to searchable tokens at both index time and query time. The pipeline must match — if the indexer lowercases and stems, the query analyzer must too, or queries will never match indexed tokens.</p>
<table class="metrics-table">
  <tr><td>Lowercasing</td><td class="hl">"Java" → "java". Enables case-insensitive search.</td></tr>
  <tr><td>Stop-word removal</td><td>"the", "a", "is" removed. Reduces index size ~30%.</td></tr>
  <tr><td>Stemming</td><td class="hl">"running", "runs", "ran" → "run". Increases recall.</td></tr>
  <tr><td>Lemmatization</td><td class="hl">Linguistically accurate stemming ("better" → "good"). Slower, more accurate.</td></tr>
  <tr><td>N-grams</td><td>"search" → "sea", "ear", "arc", "rch". Enables partial-word matching.</td></tr>
  <tr><td>Edge n-grams</td><td class="hl">"search" → "s", "se", "sea", "sear", … Powers autocomplete.</td></tr>
</table>

<h2>Elasticsearch architecture</h2>
<p>An Elasticsearch index is divided into primary shards (the horizontal scale unit) and replica shards (copies for HA and read scale). Every document is routed to a shard by <code>hash(_id) % num_shards</code>. The shard count is fixed at index creation — plan capacity upfront or use index aliases + reindexing to resize.</p>
<div class="info-box">
  <div class="info-box-title">The coordinator node pattern</div>
  <div class="info-box-body">When a search request arrives, any node can act as the coordinating node. It fans out the query to all relevant shards in parallel (scatter phase). Each shard returns its local top-N hits with scores. The coordinator merges and re-ranks to produce the global top-N (gather phase). For a query hitting 20 shards returning top-10 each, the coordinator must merge 200 results and re-rank to find the best 10.</div>
</div>

<h2>Fuzzy search</h2>
<p>Fuzzy search uses Levenshtein edit distance to match terms within N edits of the query term. Elasticsearch <code>fuzziness: AUTO</code> applies fuzziness=0 for 1–2 char terms, fuzziness=1 for 3–5 chars, and fuzziness=2 for 6+ chars. This catches typos like "sysytem" → "system".</p>
<table class="metrics-table">
  <tr><td>Fuzziness=1</td><td class="hl">Matches 1 insertion, deletion, substitution, or transposition</td></tr>
  <tr><td>Fuzziness=2</td><td>Much broader match — increases recall but also noise</td></tr>
  <tr><td>Performance</td><td class="warn">Fuzzy queries are expensive — each fuzzy term expands to many candidate terms in the posting list. Use only on short query strings.</td></tr>
</table>

<h2>Relevance tuning</h2>
<p>Raw BM25 scores are often insufficient for production. Common tuning levers: field boosting (title matches worth 3× body matches), function score (boost by recency, popularity, or business rules), query-time boosting (exact phrase match scores higher than token match), and learning-to-rank (ML model trained on click signals). In interviews, mention that relevance tuning is iterative — you need click/dwell-time signals to evaluate ranking quality.</p>
<div class="formula-box">Final Score = <span class="v">BM25(query, doc)</span><br>           × recency_boost(doc.published_at)<br>           × popularity_boost(doc.click_rate)<br>           + exact_phrase_bonus</div>
`,
    },
  ];
})();
