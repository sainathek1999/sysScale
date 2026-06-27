(function () {
  window.SS = window.SS || {};

  window.SS.REQUIREMENTS = {

    /* ------------------------------------------------------------------ */
    'rate-limiter': {
      functional: [
        'Throttle requests per client (user ID, IP, or API key) at configurable rates per second/minute/day',
        'Return HTTP 429 with Retry-After header when a client exceeds its quota',
        'Support multiple rule tiers (e.g., free tier 100 req/min, paid tier 10 000 req/min)',
        'Allow burst headroom above sustained rate (e.g., 2× sustained rate for ≤5 s)',
        'Provide a real-time quota-status endpoint so clients can self-throttle',
        'Propagate rule changes to all nodes within ≤30 s without a rolling restart',
      ],
      assumptions: [
        'Will limits be enforced at a centralized API gateway or as a sidecar per microservice?',
        'Should the system fail-open (allow all traffic) or fail-closed (block all) when the backing store is unavailable?',
        'Is per-user rate limiting sufficient, or do we also need per-endpoint or per-tenant limits?',
        'Do we need distributed enforcement across multiple data centers, or is per-region enforcement acceptable?',
        'What is the expected burst pattern — smooth traffic or highly spiky (e.g., flash sales)?',
      ],
      outOfScope: [
        'Authentication and authorization — assumed handled upstream by an identity service',
        'DDoS mitigation at the network layer (L3/L4) — handled by cloud provider or WAF',
        'Business-logic quota enforcement (e.g., API credit billing) — separate billing service',
      ],
      consistency: 'AP — slight over-counting across nodes is acceptable; a brief window where a client can exceed its limit by ~5% is far preferable to adding synchronization latency to every request',
      latencySLO: 'P99 < 5 ms added latency — rate limiter sits in the hot path of every API call; even 10 ms overhead compounds to 100 ms on a page that fires 10 parallel requests',
      readWrite: 'Write-heavy — every inbound request triggers at least one Redis INCR or ZADD; reads (quota-status endpoint) are a small fraction < 1%',
      apis: [
        'POST /check  { clientId, endpoint, cost? } → { allowed: bool, remaining: int, retryAfterMs: int }',
        'GET  /limits/:clientId → { rules: [{ scope, limit, windowSecs, algorithm }] }',
        'PUT  /limits/:clientId  { rules: [...] } → 204  (admin only)',
        'GET  /health → { status: "ok", redisLatencyMs: float }',
      ],
      writePath: 'Client → API Gateway → Rate Limiter sidecar (Redis MULTI/EXEC: INCR key + EXPIRE) → compare result to limit → allow or return 429',
      readPath: 'GET /limits/:clientId → Rate Limiter service → Redis HGETALL → format and return remaining quota',
      designDecisions: [
        {
          title: 'Rate Limiting Algorithm',
          problem: 'Need per-user request tracking with minimal memory overhead and atomic operations across distributed nodes.',
          options: [
            { name: 'Token bucket', pro: '20 bytes/user; handles bursts natively; constant memory per user', con: 'Slight boundary-burst exploitation possible near window edges (~5% overage)' },
            { name: 'Sliding window log', pro: 'Perfectly accurate at window boundaries; zero burst exploitation', con: '~5 KB/user at 100 req/min — 250× more memory than token bucket' },
          ],
          choice: 'Token bucket',
          rationale: 'At 100M users, sliding window log requires 500 GB Redis memory vs 2 GB for token bucket. The ~5% boundary overage is acceptable for most APIs — choose sliding window only when boundary fairness is a hard SLA.',
        },
        {
          title: 'Counter Storage',
          problem: 'Choosing between in-process counters (fast, zero network) and centralized Redis (exact global counts, ~1 ms RTT).',
          options: [
            { name: 'In-process counter', pro: 'Sub-millisecond; zero network hops per request', con: 'N× over-counting across N replicas — clients can exceed limits by 10× on 10 replicas' },
            { name: 'Centralized Redis', pro: 'Exact global counts; 1 ms RTT fits within the 5 ms P99 SLO', con: 'Single point of failure; one network round-trip on every request' },
          ],
          choice: 'Centralized Redis',
          rationale: '1 ms Redis RTT stays within the 5 ms SLO, and in-process counters allow N× over-counting which defeats the purpose of rate limiting at any meaningful scale.',
        },
        {
          title: 'Atomic Redis Operation',
          problem: 'Atomically incrementing a counter, checking the limit, and setting expiry in one round-trip to avoid race conditions.',
          options: [
            { name: 'Lua script', pro: 'Single atomic round-trip: INCR + compare + EXPIRE in one call; no intermediate state exposed', con: 'Scripts must be loaded/cached on Redis; harder to debug than standard commands' },
            { name: 'MULTI/EXEC', pro: 'Standard Redis commands; straightforward to reason about', con: 'Two round-trips required; at 500 K ops/s the extra RTT costs ~50 ms aggregate latency per second' },
          ],
          choice: 'Lua script',
          rationale: 'At 500 K ops/s, eliminating one round-trip saves ~50 ms aggregate latency per second. Lua runs atomically on the Redis primary with no intermediate state visible to other commands.',
        },
      ],
      failureModes: [
        {
          scenario: 'Redis primary outage',
          impact: 'Rate limiting stops — all requests bypass the limiter; abuse window opens; paid API quotas are unenforced',
          mitigation: 'Circuit breaker trips after 3 consecutive Redis timeouts; switch to in-memory per-replica approximation; fail-open for user-facing services, fail-closed for paid APIs',
          recovery: 'Redis Sentinel promotes a replica within 30 s; circuit breaker resets; in-memory counters are discarded and global counts restart from zero',
        },
        {
          scenario: 'Clock skew across scheduler nodes',
          impact: 'Sliding window accuracy degrades — nodes disagree on the current time bucket; users are unfairly throttled or allowed to over-consume',
          mitigation: 'Enforce NTP across all nodes; cross-check with Redis server time via the TIME command; drift > 100 ms triggers an alert before it affects window accuracy',
          recovery: 'NTP sync corrects drift automatically; restart any node with extreme skew to force a fresh NTP sync',
        },
        {
          scenario: 'Hot-key thundering herd on a single API key',
          impact: 'One popular API key hammers a single Redis shard; that shard CPU-saturates and P99 latency spikes for all keys on it',
          mitigation: 'Partition counters by {clientId + time_bucket} across multiple Redis keys and SUM them on read; this spreads load across multiple shards',
          recovery: 'Traffic redistributes once the hot key is partitioned; partial counts are summed correctly at read time with no data loss',
        },
      ],
      monitoring: [
        '429 rate as % of total requests — alert if > 5% sustained over 1 min (indicates either a misconfigured limit or an abuse spike)',
        'Redis P99 command latency — alert if > 2 ms (leaves headroom for 5 ms total SLO)',
        'Rate-limiter error rate (Redis timeouts + connection refused) — alert at > 0.1% to catch fail-open situations before they become widespread abuse windows',
      ],
    },

    /* ------------------------------------------------------------------ */
    'url-shortener': {
      functional: [
        'Generate a short code (6–8 chars) for any submitted long URL and return the short link',
        'Redirect clients from the short URL to the original URL with HTTP 301/302 in < 10 ms',
        'Support custom aliases (e.g., sysscale.io/launch) with collision detection',
        'Expire links after a configurable TTL (hours → years) or on-demand deletion',
        'Track click analytics: timestamp, referrer, country, device type per short link',
        'Provide a dashboard showing click counts and geo breakdown per link',
      ],
      assumptions: [
        'What is the expected read-to-write ratio? (Typically 100:1 — redirects far outnumber link creations)',
        'Do we need real-time analytics or is a 1-hour lag acceptable for the dashboard?',
        'Should short codes be unpredictable (security through obscurity) or sequential (simpler generation)?',
        'Is multi-tenancy needed (per-user link namespaces) or a single global namespace?',
        'What happens when the destination URL is unreachable — should we validate on creation or only at redirect time?',
      ],
      outOfScope: [
        'Malicious URL scanning (link-safety checking) — delegate to a third-party safe-browsing API',
        'Link preview cards / Open Graph scraping — separate enrichment service',
        'QR code generation — can be handled client-side from the short URL string',
      ],
      consistency: 'AP for redirects — serving a stale cached URL for up to 60 s is acceptable; CP for link creation — we must never issue the same short code twice, so writes go through a single-primary DB with a unique index',
      latencySLO: 'P99 < 10 ms for redirects (user is waiting for page load; every ms matters); P99 < 500 ms for link creation (async flow, human interaction)',
      readWrite: '100:1 read-heavy — 100 M redirects/day vs 1 M new links/day; redirect path must be served from cache (Redis hit rate target ≥ 99%)',
      apis: [
        'POST /links  { longUrl, alias?, ttlDays? } → { shortUrl, code, expiresAt }',
        'GET  /:code → HTTP 302 Location: longUrl  (core redirect, served at CDN edge)',
        'GET  /links/:code/stats → { clicks: int, clicksByDay: [...], topCountries: [...] }',
        'DELETE /links/:code → 204  (owner or admin only)',
        'GET  /links?userId=&page= → paginated list of user\'s links',
      ],
      writePath: 'POST /links → API server → generate 7-char Base62 hash (MD5(longUrl+salt) mod 62^7 with collision retry) → INSERT INTO links (code, long_url, expires_at) → cache code→longUrl in Redis with TTL → return shortUrl',
      readPath: 'GET /:code → CDN edge (cache hit → 302 immediately) → on miss: Redis lookup (< 1 ms) → on miss: PostgreSQL read replica → 302 redirect → async Kafka event for analytics',
      designDecisions: [
        'Hash-based vs counter-based ID: MD5+Base62 is stateless and horizontally scalable but has ~0.01% collision rate at 1 B links requiring retry logic; a distributed counter (Snowflake-style) is monotonic and collision-free but introduces a coordination service — use hash with retry for simplicity, counter for predictable IDs',
        '301 vs 302 redirect: 301 (permanent) lets browsers cache the redirect indefinitely — near-zero server load for repeat visits but makes analytics unreliable (browser never re-hits the server); 302 (temporary) logs every click but adds server RTT — choose 302 for analytics, optionally serve 301 after N clicks for popular links',
        'Separate analytics write path: writing analytics synchronously in the redirect adds 5–20 ms DB latency; instead emit a Kafka event from the redirect handler and let a consumer batch-write to ClickHouse — keeps redirect at < 10 ms while still capturing 100% of clicks',
      ],
      failureModes: [
        'Cache (Redis) outage: redirects fall through to PostgreSQL read replicas; at 100 K RPS this saturates a single Postgres instance in seconds — pre-provision read replicas and set connection pool limits; auto-expire Redis keys with jitter to prevent cold-start stampede after recovery',
        'Hash collision: two different long URLs produce the same 7-char code; detect with a SELECT before INSERT and retry with a salted hash or append a random suffix — at 1 B links the birthday-problem probability per insertion is ~0.01%, so ≤ 2 retries covers 99.99% of cases',
        'Analytics Kafka consumer lag: if the consumer falls behind, clicks are not yet visible in the dashboard but are durably stored in Kafka; alert if consumer lag > 100 K events (≈ 1 min at typical throughput); do not block the redirect path on analytics',
      ],
      monitoring: [
        'Redirect P99 latency split by cache-hit vs cache-miss — cache-miss P99 should be < 50 ms; if cache-hit P99 rises above 5 ms, Redis is under memory pressure',
        'Cache hit rate — alert if < 99%; popular links should be warm; a drop indicates Redis eviction (increase maxmemory or shard Redis)',
        'Link creation error rate (collision retries > 2, DB timeouts) — alert at > 0.5% of creations; sustained collisions indicate the code space is filling up and code length should increase from 7 to 8 chars',
      ],
    },

    /* ------------------------------------------------------------------ */
    'chat-service': {
      functional: [
        'Deliver 1-to-1 and group messages (up to 500 members) with < 100 ms P99 end-to-end latency',
        'Persist message history indefinitely and support pagination for loading older messages',
        'Show real-time presence (online/offline/last-seen) and typing indicators',
        'Support delivery receipts: sent, delivered, read (double-tick pattern)',
        'Fan out group messages to all online members via persistent WebSocket connections',
        'Queue messages for offline members and deliver on reconnect',
      ],
      assumptions: [
        'What is the expected group size limit — 500 members like WhatsApp or 100 K like Slack channels?',
        'Do we need end-to-end encryption (client-side keys) or transport-only TLS?',
        'Should message history be searchable, or is chronological retrieval sufficient?',
        'Is multi-device support required (same account on phone + laptop simultaneously)?',
        'What media types must be supported: text only, or images/video/files as well?',
      ],
      outOfScope: [
        'Media storage and transcoding — handled by a separate object-storage service (S3-compatible)',
        'Content moderation / spam filtering — separate ML pipeline consuming from the message Kafka topic',
        'Voice and video calling — separate WebRTC signaling service',
      ],
      consistency: 'AP with causal ordering — messages must appear in causal order within a conversation but strict global ordering across all conversations is unnecessary; use logical clocks (Lamport timestamps) per conversation to order concurrent messages',
      latencySLO: 'P99 < 100 ms sender-to-receiver on the same continent; offline delivery < 30 s after reconnect; typing indicator delivery < 300 ms (human perception threshold for "live")',
      readWrite: 'Roughly 1:5 read:write during active conversations; historically read-heavy when loading message history; write path (new messages) is latency-critical, read path (history) is throughput-critical',
      apis: [
        'WS  /chat/ws?token=  — persistent connection; JSON frames: { type: "msg"|"ack"|"typing"|"presence", ... }',
        'POST /conversations  { memberIds: [], name? } → { conversationId, members }',
        'POST /conversations/:id/messages  { text, mediaUrl? } → { messageId, sentAt }',
        'GET  /conversations/:id/messages?before=&limit=50 → [{ messageId, senderId, text, sentAt, status }]',
        'GET  /users/:id/presence → { status: "online"|"offline", lastSeen: ISO8601 }',
      ],
      writePath: 'Sender WS frame → Chat Server (stateful, holds WS connections) → write to Cassandra (conversations table, ordered by message_id) → publish to Kafka topic per conversation → Fan-out service reads Kafka → pushes to recipient Chat Servers via internal pub/sub → recipients receive WS push',
      readPath: 'GET /messages?before= → Chat API → Cassandra query (partition key = conversationId, clustering key = message_id DESC LIMIT 50) → return sorted page',
      designDecisions: [
        'Fan-out on send vs fan-out on read for group chats: fan-out on send (write to each member\'s inbox immediately) gives O(1) read but O(members) write — at 500 members × 1 M msg/day = 500 M writes/day; fan-out on read stores one copy but requires O(members) reads when loading; use fan-out on send for small groups (≤ 500), fan-out on read for large channels (> 500)',
        'Cassandra vs PostgreSQL for message storage: Cassandra\'s wide-row model (partition = conversationId, clustering = message_id) gives O(1) paginated reads with no JOIN; PostgreSQL needs an index scan + join — at 10 K messages/s Cassandra sustains 100 K writes/s per node vs ~10 K for Postgres; choose Cassandra for chat at scale',
        'Presence via heartbeat vs WebSocket lifecycle: tracking presence from WS connect/disconnect events misses app-backgrounded state (mobile OS keeps socket alive); instead require clients to send a heartbeat every 30 s and mark offline after 45 s of silence — adds 45 s lag to offline detection but avoids ghost-online status',
      ],
      failureModes: [
        'Chat server crash drops in-flight WS connections: clients must implement exponential backoff reconnect (1 s → 2 s → 4 s … cap 60 s) with a session token to resume without re-auth; messages sent during disconnect are buffered in the client and re-sent after reconnect with idempotency key',
        'Kafka consumer lag (fan-out service): if fan-out falls behind, message delivery is delayed but not lost; alert if lag > 10 K events (≈ 5 s at peak); scale consumer group horizontally — Kafka partitions by conversationId to preserve per-conversation ordering',
        'Cassandra node failure: Cassandra replicates with RF=3 and quorum writes (QUORUM = 2/3 nodes); losing one node still allows writes and reads; losing two nodes in the same partition causes write unavailability — mitigate with multi-AZ replica placement',
      ],
      monitoring: [
        'End-to-end message latency (sender send → receiver receive, measured via client instrumentation) — alert if P99 > 100 ms',
        'WebSocket connection count per chat server — alert if > 100 K connections per instance (exhausts file descriptors; add a new server)',
        'Cassandra write P99 latency — alert if > 10 ms; a rising trend indicates compaction pressure or a hot partition (large group receiving all writes to one node)',
      ],
    },

    /* ------------------------------------------------------------------ */
    'notifications': {
      functional: [
        'Send push (APNs/FCM), email (SMTP/SES), and SMS (Twilio/SNS) notifications from a single unified API',
        'Fan out a single event to potentially millions of recipients (e.g., a breaking-news alert)',
        'Retry failed deliveries with exponential backoff — at-least-once delivery guarantee',
        'Respect user preferences (per-channel opt-out, quiet hours, frequency caps)',
        'Deduplicate: never deliver the same logical notification twice to the same recipient',
        'Track delivery status per channel per recipient and expose a status query API',
      ],
      assumptions: [
        'What is the maximum fan-out size for a single event — thousands of users or tens of millions?',
        'Should notifications be prioritized (critical security alerts vs marketing emails)?',
        'Do we need templating support (personalized variables per recipient) or pre-rendered content?',
        'Is real-time delivery (< 5 s) required for all channels, or is email allowed to be eventually consistent (minutes)?',
        'What is the expected unsubscribe and preference lookup volume — will it create a hot read path?',
      ],
      outOfScope: [
        'Notification content creation / copywriting — handled by product teams via the template service',
        'A/B testing of notification copy — separate experimentation platform that calls this service',
        'In-app notification banners rendered inside the UI — front-end concern using WebSockets or SSE',
      ],
      consistency: 'AP — it is acceptable to deliver a notification up to 30 s late or to deduplicate on the recipient side; durability matters more than strict ordering: use Kafka with replication factor 3 so no notification is dropped on broker failure',
      latencySLO: 'P99 < 5 s for push notifications (user is waiting on their phone); P99 < 5 min for email (email is async by convention); P99 < 30 s for SMS (time-sensitive but slower than push)',
      readWrite: 'Write-heavy on ingestion (events fan out to millions of write operations per notification job); read path (delivery status checks) is a small fraction driven by support tooling',
      apis: [
        'POST /notifications  { eventType, recipients: [userId], templateId, data: {} } → { jobId }',
        'GET  /notifications/:jobId/status → { sent: int, delivered: int, failed: int, pending: int }',
        'GET  /notifications/:jobId/failures → [{ userId, channel, reason, retries }]',
        'PUT  /users/:id/preferences  { channels: { push: bool, email: bool, sms: bool }, quietHours: {} } → 204',
        'POST /notifications/:jobId/cancel → 204  (stops unstarted fan-out batches)',
      ],
      writePath: 'POST /notifications → API server validates & writes job to PostgreSQL → publishes jobId to Kafka "notification-jobs" topic → Fan-out workers consume, expand recipient list in batches of 1 000 → per-recipient tasks written to per-channel Kafka topics (push/email/sms) → channel workers consume, check user preferences, call APNs/FCM/SES/Twilio → write delivery receipt to Cassandra',
      readPath: 'GET /status/:jobId → API server → Cassandra aggregate query (GROUP BY status) → return counts; for failures query failures table with secondary index on jobId',
      designDecisions: [
        'Fan-out at enqueue time vs at send time: enqueuing one message per recipient at job creation (push-based) lets each worker operate independently and enables per-recipient preference filtering early in the pipeline; a pull model (workers query the recipient list at send time) simplifies the queue but creates a read hotspot on the recipient DB at scale — use push fan-out for jobs with < 10 M recipients, chunked batch fan-out for larger',
        'Channel-specific queues: multiplexing all channels on one queue means a slow SMS provider (Twilio throttles at 100 msg/s by default) blocks push notifications — separate Kafka topics per channel allow independent scaling and backpressure; push channel can scale to 500 K/s, email to 10 K/s, SMS to 1 K/s independently',
        'Deduplication key design: idempotency key = SHA256(jobId + userId + channel); store in Redis with TTL = 24 h; worker checks before sending — Redis SET NX (set if not exists) provides atomic check-and-set; 24 h TTL covers all reasonable retry windows without unbounded memory growth',
      ],
      failureModes: [
        'APNs/FCM provider outage: exponential backoff with jitter (1 s, 2 s, 4 s … cap 1 h); after 6 retries over 4 h mark as permanently failed; alert the on-call engineer if > 1% of push deliveries fail within a 5-min window — could indicate an app certificate expiry',
        'Fan-out worker crash mid-job: Kafka consumer offset is committed only after a batch is fully enqueued to channel topics; a crash causes at-most one batch to be re-processed — deduplication Redis key prevents double-delivery; jobs are resumable from the last committed offset',
        'Preference store unavailability: fail-open and deliver the notification (a user missing a notification is worse than delivering an unwanted one in most products); log the preference lookup failure for audit; never cache preferences with infinite TTL — use 5-min TTL to limit stale data window',
      ],
      monitoring: [
        'End-to-end push delivery latency (event ingested → APNs/FCM accepted) — alert if P99 > 5 s; rising latency indicates worker under-provisioning or provider throttling',
        'Per-channel delivery failure rate — alert if > 1% for push (may indicate bad device tokens that should be pruned), > 2% for SMS (provider issue), > 0.5% for email (domain reputation problem)',
        'Kafka consumer lag per channel topic — alert if lag > 100 K events; fan-out workers need to scale horizontally to consume faster than the ingest rate',
      ],
    },

    /* ------------------------------------------------------------------ */
    'typeahead': {
      functional: [
        'Return the top-k (k = 5–10) autocomplete suggestions for any typed prefix within 50 ms',
        'Rank suggestions by relevance score (query frequency, recency, personalisation signals)',
        'Support incremental character-by-character lookups — each keystroke is a new request',
        'Update the suggestion corpus from logged search queries in near-real-time (< 1 h lag)',
        'Handle multilingual queries (Unicode prefixes) and typo-tolerant fuzzy matching',
        'Serve zero-result prefixes gracefully (fall back to popular global suggestions)',
      ],
      assumptions: [
        'Should suggestions be globally ranked (same for all users) or personalised per user session?',
        'What is the vocabulary size — millions of unique query terms or a bounded product catalog?',
        'Do we need fuzzy/spell-correction matching or exact prefix matching only?',
        'Is the 50 ms SLO measured server-side or end-to-end (including network from the client)?',
        'How frequently does the corpus change — real-time trending topics or a daily batch rebuild?',
      ],
      outOfScope: [
        'Full-text search of results — typeahead returns suggestion strings, not result documents',
        'Spell-check / grammar correction beyond single-character edit distance — separate NLP service',
        'Personalisation model training — offline ML pipeline feeds pre-computed user affinity scores',
      ],
      consistency: 'AP — serving a suggestion that was popular 30 min ago is entirely acceptable; corpus updates propagate with eventual consistency via a background rebuild pipeline; no user-visible correctness requirement',
      latencySLO: 'P99 < 50 ms server-side (client-side total including network target is < 100 ms); suggestions must be debounced client-side at 150 ms to avoid overwhelming the server on fast typists',
      readWrite: 'Extremely read-heavy — ~1 000:1 (every keystroke = one read; corpus writes happen once per aggregation batch per term); read path must be served from in-memory structures, not disk',
      apis: [
        'GET /suggest?q=pre&k=10&locale=en → { suggestions: [{ term, score, metadata? }] }',
        'POST /corpus/ingest  { queries: [{ term, count, timestampHour }] } → 202  (batch ingestion, internal)',
        'DELETE /corpus/term/:term → 204  (content moderation removal, propagates within 5 min)',
        'GET /health → { trieSizeBytes: int, terms: int, buildAgeMs: int }',
      ],
      writePath: 'Search query logged → aggregation pipeline (Spark/Flink) counts queries per term per hour → batch job writes top-N terms with scores to Redis sorted sets (ZADD) and rebuilds in-memory trie → atomic trie swap (double-buffering) so reads never block',
      readPath: 'GET /suggest?q=pre → Typeahead service reads from in-memory trie (O(prefix_len) lookup) → retrieves top-k node from sorted candidate list → optional re-rank with personalisation scores from a Redis hash → return JSON in < 5 ms server processing time',
      designDecisions: [
        'Trie vs inverted index: a trie gives O(prefix_len) exact-prefix lookup and fits entirely in RAM for 1 M terms at ~50 MB (avg 5 chars × 10 bytes/node); an Elasticsearch inverted index is I/O-efficient for billions of documents but adds 20–50 ms per query due to segment merging — use trie for sub-50 ms SLO, inverted index only when the vocabulary exceeds available RAM (> 100 M unique terms)',
        'Client-side debounce and caching: without debouncing, a user typing "search" fires 6 requests in ~300 ms; with 150 ms debounce it fires 1–2; additionally caching responses in the browser (LRU, 50-entry cap) means backspacing re-uses cached results with zero network cost — reduces server RPS by ~60%',
        'Single global trie vs sharded by first character: a single trie is simpler but becomes a single-threaded bottleneck above ~50 K QPS; sharding by first character (26 shards for a-z) distributes load linearly with no cross-shard coordination needed for prefix lookup — each shard handles a disjoint prefix namespace',
      ],
      failureModes: [
        'Trie rebuild failure: if the batch pipeline fails, the trie becomes stale; serve from the last-known-good trie (double-buffered) for up to 24 h before alerting; queries still get results, just not trending terms from the last hour',
        'Memory exhaustion from unbounded vocabulary: malicious users can inject rare query strings that inflate the trie; cap the vocabulary to the top 10 M terms by score and discard long-tail terms during build; enforce max term length (e.g., 100 chars) to prevent degenerate path lengths',
        'Hot-prefix thundering herd (e.g., everyone types "corona" during a news event): a single prefix node can receive 50 K QPS; add a per-prefix in-process LRU cache (10 ms TTL) at the typeahead service to coalesce identical concurrent lookups',
      ],
      monitoring: [
        'Suggestion API P99 latency — alert if > 30 ms server-side (leaves 20 ms headroom before SLO breach); a sudden spike indicates trie rebuild is holding the lock',
        'Corpus build age (seconds since last successful trie swap) — alert if > 3 600 s (1 h); staleness means trending topics are not surfaced',
        'Zero-result prefix rate — alert if > 5% of requests return 0 suggestions; indicates corpus is too small or a build failure has left the trie empty',
      ],
    },

    /* ------------------------------------------------------------------ */
    'zoom': {
      functional: [
        'Support real-time video/audio calls with up to 1 000 participants in a single session',
        'Mix and route media via a Selective Forwarding Unit (SFU) — do not decode/re-encode at the server',
        'Provide signaling for session negotiation (offer/answer), participant join/leave, and mute events',
        'Enable screen sharing alongside camera video with adaptive bitrate based on network conditions',
        'Record sessions to cloud storage on demand with < 30 s start latency',
        'Support chat, reactions, and hand-raise as low-bandwidth side-channel data during calls',
      ],
      assumptions: [
        'What is the maximum participants per call — 100 (meeting), 1 000 (webinar), or 50 000 (broadcast/livestream)?',
        'Should the SFU be deployed globally at the edge (low latency) or centrally (simpler ops)?',
        'Is end-to-end encryption for media required, or is transport-level TLS sufficient?',
        'Do we need breakout rooms, which require splitting a session into sub-sessions mid-call?',
        'What recording format is required (MP4, raw RTP dump) and how long must recordings be retained?',
      ],
      outOfScope: [
        'Calendar integration and meeting scheduling — separate scheduling service',
        'Meeting transcription and translation — separate ML pipeline consuming the recording stream',
        'Billing per meeting-minute — separate billing service metering events from the signaling server',
      ],
      consistency: 'AP — media delivery is inherently best-effort (UDP); control-plane events (join/leave/mute) are eventually consistent with < 500 ms propagation to all participants; slightly stale participant lists are acceptable',
      latencySLO: 'P99 glass-to-glass video latency < 150 ms (ITU-T G.114 recommendation for conversational quality); signaling (join/leave) < 300 ms; recording start < 30 s',
      readWrite: 'Write-dominated during calls — each participant sends 1–5 Mbps of RTP media; the SFU forwards N×M streams where N = senders, M = receivers; read (RTCP feedback, signal control) is a small fraction',
      apis: [
        'POST /meetings  { hostId, scheduledAt?, maxParticipants } → { meetingId, joinUrl, signalingToken }',
        'WS  /signal?meetingId=&token=  — WebSocket for SDP offer/answer, ICE candidates, control events',
        'POST /meetings/:id/recording/start → { recordingId } (recording begins within 30 s)',
        'POST /meetings/:id/recording/stop  → { recordingUrl, durationSecs }',
        'GET  /meetings/:id/participants → [{ userId, displayName, audioMuted, videoMuted, joinedAt }]',
      ],
      writePath: 'Participant media (RTP over UDP) → TURN/STUN relay if NAT traversal needed → SFU server (receives all streams, selects layers via Simulcast, forwards to subscribers) → RTP to each subscriber; Signaling events (JSON) flow over the WebSocket signaling server → broadcast to session participants',
      readPath: 'GET /participants → Signaling server in-memory session state → JSON response; Recording playback: GET recording URL → CDN edge → MP4 stream from object storage',
      designDecisions: [
        'SFU vs MCU: an MCU (Multipoint Control Unit) decodes all streams and re-encodes a composite — high video quality but O(participants) CPU cost per call; an SFU (Selective Forwarding Unit) forwards compressed RTP without decoding — O(participants²) bandwidth at the SFU but near-zero CPU per stream; at 1 000 participants an MCU would need ~1 000 CPU cores per session, SFU needs ~10 Gbps forwarding capacity — SFU is the only viable choice above 10 participants',
        'Simulcast for adaptive quality: each sender transmits 3 spatial layers (e.g., 1080p/360p/180p) simultaneously; the SFU selects which layer to forward to each subscriber based on their reported downlink bandwidth (REMB/TWCC); this avoids per-subscriber transcoding while still adapting to poor networks — 3× sender bandwidth cost is far cheaper than server-side transcoding',
        'Geo-distributed SFU cascade: a single SFU cluster adds 100–200 ms RTT for intercontinental participants; instead deploy regional SFU clusters and cascade media between them via a backbone inter-SFU link; each participant connects to the nearest SFU, which cascades only the active-speaker stream to remote SFUs — reduces cross-region bandwidth by ~80% in large calls',
      ],
      failureModes: [
        'SFU server crash mid-call: clients detect the lost WebSocket connection within 5 s (keepalive timeout) and reconnect to a backup SFU in the same region; media is paused for ~5 s during failover; implement session state replication between primary and standby SFU so participants do not need to re-negotiate SDP',
        'NAT traversal failure (TURN server unavailable): ~15% of WebRTC calls fail without TURN when both peers are behind symmetric NAT; TURN relays all media at full bandwidth cost (~2 Mbps/participant); deploy TURN servers in multiple regions with DNS failover; budget 2 Mbps × peak concurrent users for TURN bandwidth',
        'Recording pipeline overload: on-demand recording adds a "recording bot" participant that receives all streams; if the bot host is CPU-saturated it drops frames, causing gaps in recordings; pre-provision dedicated recording servers separate from SFU; use a queue to serialize recording-start requests and reject when capacity is full',
      ],
      monitoring: [
        'P99 glass-to-glass latency (measured via RTCP round-trip time reported by clients) — alert if > 150 ms; a spike indicates TURN relay congestion or inter-SFU cascade latency',
        'Packet loss rate per session (from RTCP receiver reports) — alert if > 1% sustained; triggers automatic quality downgrade to lower simulcast layer; > 5% indicates a network path problem',
        'Active session count and SFU CPU utilization — alert if CPU > 70% (SFU is stateful and cannot shed load gracefully; must pre-scale before peak hours)',
      ],
    },

    /* ------------------------------------------------------------------ */
    'news-feed': {
      functional: [
        'Display a ranked, personalized feed of posts from accounts a user follows',
        'Support infinite scroll with cursor-based pagination (no page numbers)',
        'Reflect new posts in the feed within 30 s of publication (near-real-time)',
        'Rank posts by a relevance score combining recency, engagement, and affinity',
        'Support media posts (images, videos) alongside text, with lazy-loading URLs',
        'Allow users to hide, mute, or report individual feed items',
      ],
      assumptions: [
        'What is the maximum number of accounts a user can follow — 5 000 (Twitter-style) or unlimited (Facebook-style)?',
        'Should celebrities (> 1 M followers) use the same fan-out mechanism as regular users?',
        'Is the ranking model static (rule-based) or ML-driven with per-user feature vectors?',
        'Do we need to support multiple feed surfaces (home feed, profile feed, trending feed)?',
        'What is the acceptable staleness for the feed — real-time (< 5 s) or near-real-time (< 30 s)?',
      ],
      outOfScope: [
        'Post creation and media upload — handled by a separate posts service',
        'Follow/unfollow graph mutations — handled by the social-graph service',
        'Recommendation of accounts to follow — separate ML recommendation service',
      ],
      consistency: 'AP — a user missing a post for up to 30 s is acceptable; feeds are assembled from eventually consistent materialized views; strict consistency would require synchronous writes to every follower\'s inbox which is prohibitively expensive for high-follower accounts',
      latencySLO: 'P99 < 200 ms to serve the first page of the feed (20 posts); users perceive latency > 300 ms as sluggish; post publication to feed visibility < 30 s',
      readWrite: '10:1 read-heavy — users browse feeds far more often than they post; write path (fan-out) is expensive in terms of I/O multiplier; read path must be served from a pre-materialized inbox',
      apis: [
        'GET  /feed?userId=&cursor=&limit=20 → { posts: [...], nextCursor, freshness: ISO8601 }',
        'POST /feed/hide  { userId, postId } → 204',
        'POST /feed/refresh  { userId } → 202  (triggers async re-rank for this user)',
        'GET  /feed/post/:postId → { post, rank_score, why_shown: string }  (debug/transparency)',
      ],
      writePath: 'User publishes post → Posts service writes to DB → emits "new-post" Kafka event → Fan-out service consumes: for regular users (< 10 K followers) writes postId into each follower\'s Redis sorted-set inbox (ZADD score=rank_score); for celebrities (> 10 K followers) writes only to a hot-post index, not individual inboxes',
      readPath: 'GET /feed → Feed service reads follower\'s Redis sorted-set inbox (ZREVRANGE by score, paginated by cursor) → merges with celebrity hot-post index → fetches post hydration data from Posts cache → applies user hide/mute filters → sort and return top-20',
      designDecisions: [
        'Fan-out on write vs fan-out on read: fan-out on write pre-materializes the feed in each follower\'s inbox sorted set — O(1) read, O(followers) write per post; for a user with 10 M followers a single post triggers 10 M Redis ZADDs in ~10 s burst; fan-out on read assembles the feed at query time — O(followees) per read; hybrid: fan-out on write for regular users, fan-out on read for celebrities, merge at read time',
        'Cursor-based pagination vs offset: LIMIT/OFFSET on a sorted set degrades as O(offset + page_size) — page 100 of a 2 000-item feed requires scanning 2 000 items; Redis ZRANGEBYSCORE with a score cursor is always O(log N + page_size) regardless of depth — required for infinite scroll performance',
        'Ranking score design: a simple score = (likes × 3 + comments × 5 + shares × 10) / age_hours^1.5 decays engagement over time and can be computed at fan-out time and stored as the sorted-set score; a full ML ranking model (user affinity × content quality × context) gives better relevance but requires real-time feature serving infrastructure — start with formula-based, migrate to ML when retention data justifies the infra cost',
      ],
      failureModes: [
        'Fan-out storm from a viral post: if a post from a 10 M follower account goes viral, fan-out workers try to ZADD to 10 M Redis keys simultaneously; rate-limit fan-out workers to 100 K writes/s and queue excess in Kafka; feed freshness degrades to minutes during the storm but durability is preserved',
        'Redis inbox eviction: if Redis runs low on memory it evicts sorted-set members; a user\'s feed may become empty until the next fan-out; mitigate by capping inbox size at 1 000 items per user (ZREMRANGEBYRANK to trim oldest) and alerting when Redis memory > 80%',
        'Follower count inconsistency (social-graph and fan-out out of sync): if the social-graph service delays a "follow" event to the fan-out service, the new follower misses posts for up to 30 s; on first-follow, back-fill the last 50 posts from the followed user\'s timeline into the new follower\'s inbox',
      ],
      monitoring: [
        'Feed read P99 latency — alert if > 200 ms; drill into Redis sorted-set read time vs post hydration time to find the bottleneck',
        'Fan-out lag (time from post creation to last follower\'s inbox write) — alert if P95 > 30 s; indicates fan-out workers are under-provisioned',
        'Feed freshness (age of the newest post in a randomly sampled user\'s feed) — alert if median freshness > 5 min; indicates the pipeline is significantly behind',
      ],
    },

    /* ------------------------------------------------------------------ */
    'ride-sharing': {
      functional: [
        'Match a rider\'s trip request to a nearby available driver within 10 s',
        'Continuously update driver locations at 4 s intervals and serve the nearest-K query in < 100 ms',
        'Calculate ETA and fare estimate before the rider confirms the trip',
        'Track the trip state machine: requested → matched → en-route → in-trip → completed → settled',
        'Provide real-time location sharing between matched rider and driver during the trip',
        'Handle driver cancellations with automatic re-matching to the next-nearest driver',
      ],
      assumptions: [
        'What geographic market — single city (millions of trips/day) or global (different traffic models per region)?',
        'Is surge pricing needed, and should it be computed in real-time or updated every few minutes?',
        'How precise must ETA be — ±1 min accuracy requires a live traffic feed integration?',
        'Do we need to support carpooling (multiple riders in one vehicle) or only point-to-point trips?',
        'Should driver location updates be stored for analytics/replay or discarded after trip completion?',
      ],
      outOfScope: [
        'Payment processing — handled by the payment service with idempotent charge after trip completion',
        'Driver background check and onboarding — separate compliance service',
        'Navigation turn-by-turn for drivers — integrated via a third-party mapping SDK',
      ],
      consistency: 'AP for location updates (stale by 4 s is fine) and CP for matching (a driver must not be matched to two riders simultaneously — requires compare-and-swap on driver status)',
      latencySLO: 'Driver location write P99 < 50 ms (high-frequency updates must not back-pressure the driver app); nearest-driver query P99 < 100 ms; match confirmation P99 < 500 ms',
      readWrite: 'Write-heavy during trips — 1 M active drivers × 4 s location updates = 250 K writes/s; read: nearest-driver spatial queries ~100 K/s; both paths must be served from in-memory geospatial index',
      apis: [
        'POST /trips  { riderId, pickupLat, pickupLng, dropoffLat, dropoffLng } → { tripId, estimatedFare, etaMinutes }',
        'POST /trips/:id/confirm → { driverId, driverEta, driverLat, driverLng }',
        'PUT  /drivers/:id/location  { lat, lng, heading, speed, status } → 204  (driver heartbeat)',
        'GET  /trips/:id → { state, driverLocation, etaMinutes, route }',
        'POST /trips/:id/cancel  { reason } → 204',
      ],
      writePath: 'Driver app → PUT /location → Location service → write to Redis GEO key (GEOADD city:drivers driverId lat lng) with 8 s expiry → asynchronously write to time-series DB (InfluxDB) for analytics',
      readPath: 'POST /trips/confirm → Matching service → GEORADIUS city:drivers lat lng 5km ASC COUNT 10 → filter available drivers → score by ETA + acceptance rate + rating → send push to top driver → await accept/decline → confirm match with CAS on driver.status (idle → matched)',
      designDecisions: [
        'Geospatial index: Redis GEO (wraps a sorted set with Geohash-encoded scores) gives GEORADIUS in O(N+log M) where N = results, M = total drivers in city; PostGIS with spatial index is O(log M) but adds 5–20 ms DB round-trip; Redis GEO in-memory is < 1 ms — use Redis GEO for the hot matching path, sync asynchronously to PostGIS for analytics',
        'Supply-demand matching algorithm: simple nearest-driver (pure distance) ignores traffic and creates clustering near popular pickup zones; ETA-based matching (distance ÷ speed via road network) is more accurate but requires a routing API call per candidate (~50 ms); batch ETA estimation (Google Maps Distance Matrix API) for top-10 candidates adds 100 ms but improves match quality by 20% — ETA-based matching wins at scale',
        'Driver status as a distributed lock: if two ride requests race to match the same driver, both may attempt to update driver.status = matched simultaneously; use a Redis SETNX ("set if not exists") as a distributed lock on driverId for 10 s during the match handshake; losing requester gets re-queued to find the next available driver',
      ],
      failureModes: [
        'Location service overload: at 250 K GEOADD/s a single Redis instance tops out at ~100 K ops/s; shard by city (each city = one Redis cluster); hottest cities (NYC, SF) may need further sharding by geohash quadrant; use Redis Cluster with slot-based routing',
        'Driver goes offline mid-trip: detect via missed heartbeat (no location update for > 12 s); alert the rider, attempt to call driver via phone integration; if unreachable after 60 s mark the trip as abandoned and initiate a re-match or refund flow',
        'Match timeout (no driver accepts within 30 s): expand search radius (2 km → 5 km → 10 km) on each retry; if no match after 3 retries over 90 s, return "no drivers available" to rider; log for surge pricing signal — unmatched requests indicate supply shortage',
      ],
      monitoring: [
        'Match rate (trips matched / trips requested) — alert if < 90%; a drop indicates supply shortage, a regional outage, or a matching bug',
        'Location write P99 latency — alert if > 50 ms; indicates Redis shard is overloaded',
        'ETA prediction error (predicted vs actual arrival time at pickup) — alert if P50 error > 2 min; indicates the routing model or traffic data is stale',
      ],
    },

    /* ------------------------------------------------------------------ */
    'job-scheduler': {
      functional: [
        'Accept cron-expression-based and one-off job schedules and trigger execution at the correct time',
        'Distribute jobs to a worker pool with at-least-once execution guarantee',
        'Support job dependencies (job B starts only after job A completes successfully)',
        'Provide retry logic with configurable max attempts and backoff strategy per job type',
        'Expose a UI and API to inspect job status, history, and failure reasons',
        'Prevent duplicate concurrent runs of the same job (idempotency guard)',
      ],
      assumptions: [
        'What is the expected job volume — hundreds of jobs per minute or millions of fine-grained tasks?',
        'Should the scheduler guarantee exactly-once execution (complex, requires 2PC) or is at-least-once acceptable (simpler)?',
        'What is the maximum acceptable trigger delay — sub-second for payments or 30 s for batch ETL?',
        'Do we need priority queues (urgent jobs run ahead of low-priority batch jobs)?',
        'Should the system handle long-running jobs (hours) or only short tasks (seconds to minutes)?',
      ],
      outOfScope: [
        'Job business logic — this scheduler is a generic trigger system; the job payload is executed by external workers',
        'Result storage beyond pass/fail status — job outputs are written by workers to their own storage',
        'Workflow orchestration with complex DAGs — use Apache Airflow; this covers simpler dependency chains',
      ],
      consistency: 'CP for job triggering — a job must be triggered exactly once per schedule tick; an under-trigger (missed job) is worse than a brief scheduling delay; use a distributed lock (ZooKeeper / etcd) on the scheduler leader to prevent duplicate triggers',
      latencySLO: 'Job trigger delay (scheduled time vs actual dispatch) P99 < 1 s for high-priority jobs; P99 < 30 s for batch jobs; job status visible in UI within 5 s of state change',
      readWrite: 'Write-heavy on the queue (every trigger = one enqueue + state writes); read-heavy on the status/UI path as operators and downstream services poll for completion',
      apis: [
        'POST /jobs  { name, cron?, runAt?, payload: {}, maxRetries, backoffSecs, priority } → { jobId }',
        'GET  /jobs/:id → { state: "pending"|"running"|"success"|"failed", attempts, lastRunAt, nextRunAt }',
        'POST /jobs/:id/trigger → 202  (immediate one-off trigger, bypasses schedule)',
        'DELETE /jobs/:id → 204  (cancels future runs; in-flight run is not interrupted)',
        'GET  /jobs?state=failed&page= → paginated failed job list with error details',
      ],
      writePath: 'Scheduler leader (elected via etcd) polls job DB every 1 s for due jobs → acquires row-level lock (SELECT FOR UPDATE SKIP LOCKED) → enqueues jobId to per-priority Kafka topic → updates job.state = "dispatched" → Worker consumes from Kafka → executes payload → writes result back (success/failure) → scheduler updates state and schedules next run',
      readPath: 'GET /jobs/:id → Job API → PostgreSQL (job_runs table indexed on jobId, DESC run_at) → return last 10 run records with status and error message',
      designDecisions: [
        'Database-backed schedule vs in-memory cron: in-memory cron (e.g., Quartz) is fast but loses schedule state on restart; storing schedules in PostgreSQL with "next_run_at" column enables resumable scheduling, easy inspection, and horizontal scaling; poll with SELECT FOR UPDATE SKIP LOCKED to distribute trigger work across multiple scheduler instances without double-firing',
        'At-least-once vs exactly-once: exactly-once requires 2PC between the job queue and the job DB — complex and slow; at-least-once is simpler: write to the queue, then update DB, retry on crash; make workers idempotent (use jobRunId as an idempotency key) so duplicate deliveries are safe — recommended approach for 99% of use cases',
        'Priority queues: a single FIFO queue starves urgent jobs behind a large batch backlog; use separate Kafka topics per priority (high/normal/low) with dedicated consumer groups; high-priority topic gets 10× more worker threads than low-priority; job classification is set at registration time and cannot be changed per-trigger',
      ],
      failureModes: [
        'Scheduler leader crash: a new leader is elected by etcd lease expiry within 10–15 s; during this window no new jobs are dispatched but already-enqueued jobs continue executing on workers; "next_run_at" in the DB ensures the new leader picks up from the correct schedule with no missed ticks',
        'Worker crash mid-job: the Kafka message is not acked; after the consumer session timeout (default 30 s) the message is re-delivered to another worker; if the job is not idempotent this causes duplicate side effects — enforce idempotency keys in all worker implementations',
        'Clock skew between scheduler nodes: two scheduler nodes with 500 ms clock skew may both fire a job in the same second; the SELECT FOR UPDATE lock prevents this — whichever node wins the DB lock is the sole trigger; NTP must keep skew < 1 s to avoid lock contention',
      ],
      monitoring: [
        'Trigger delay (scheduled_at vs actual dispatch_at) histogram — alert if P99 > 5 s; indicates the scheduler is falling behind (increase polling frequency or scale out schedulers)',
        'Failed job rate by job type — alert if > 1% for any critical job type; page the on-call engineer with the job name and error message',
        'Queue depth per priority — alert if high-priority queue depth > 100 (jobs are backlogged); indicates workers are under-provisioned for the current load',
      ],
    },

    /* ------------------------------------------------------------------ */
    'distributed-cache': {
      functional: [
        'Provide GET/SET/DEL with O(1) average latency (< 1 ms P99) over a distributed in-memory key-value store',
        'Support TTL-based expiry, LRU/LFU eviction policies, and explicit invalidation',
        'Distribute keys across N nodes using consistent hashing to minimize key remapping on node add/remove',
        'Replicate each shard to one or more read replicas for high availability and read scale-out',
        'Handle hot keys (single key receiving > 10% of total traffic) without overwhelming one node',
        'Provide atomic operations: INCR, CAS (compare-and-swap), and multi-key MGET for efficiency',
      ],
      assumptions: [
        'Is the cache a write-around (application writes to DB only), write-through (writes to cache + DB), or write-back (writes to cache, async flush to DB)?',
        'What is the expected working set size — does it fit in RAM, or do we need a tiered (RAM + SSD) cache?',
        'Is the cache the authoritative data source (cache-as-SOR) or a read-aside cache that can always fall back to the origin DB?',
        'What happens on cache miss — is the origin DB able to absorb the full request rate, or do we need a cache stampede guard?',
        'What eviction policy is acceptable — LRU for recency-biased access patterns or LFU for frequency-biased?',
      ],
      outOfScope: [
        'Persistent durable storage — this cache is lossy; durability belongs to the origin DB',
        'Full-text search on cached values — use a search index service for that',
        'Cross-datacenter replication with conflict resolution — global cache consistency requires CRDTs, which is out of scope here',
      ],
      consistency: 'AP — cache is a performance layer; cache miss → fall back to DB with at most one additional DB round-trip; write-invalidation ensures eventual consistency with a maximum stale window equal to the key TTL',
      latencySLO: 'P99 < 1 ms for GET/SET on a local-AZ cache node (in-process network latency within AWS AZ is ~0.1 ms); P99 < 5 ms for cross-AZ reads; cache misses fall through to DB which must handle the miss rate without overloading',
      readWrite: 'Typically 10:1 to 100:1 read-heavy; the ratio that makes caching worthwhile — if write rate is high relative to reads, write-invalidation churn causes low hit rates and caching provides little benefit',
      apis: [
        'GET  /cache/:key → { value: bytes, ttlMs: int, hit: bool }',
        'SET  /cache/:key  { value: bytes, ttlMs } → 204',
        'DEL  /cache/:key → 204',
        'MGET /cache/multi  { keys: [] } → { results: [{key, value, hit}] }',
        'CAS  /cache/:key  { expected: bytes, new: bytes, ttlMs } → { success: bool }',
      ],
      writePath: 'App writes to origin DB → (write-invalidate pattern) app calls DEL /cache/:key → cache node removes the key → next GET results in a cache miss → DB is queried → value populated back into cache with TTL',
      readPath: 'App calls GET /cache/:key → consistent hash routes to the owning shard → in-memory O(1) hashtable lookup → cache hit: return value (< 1 ms); cache miss: app queries origin DB → app calls SET /cache/:key with result → subsequent reads are cache hits',
      designDecisions: [
        'Consistent hashing vs modular hashing: modular hashing (key % N) remaps ~100% of keys when N changes (node add/remove); consistent hashing remaps only 1/N keys on average — at 1 000 nodes, adding one node remaps 0.1% of keys vs 99.9% for modular; virtual nodes (150 vnodes per physical node) balance load within 5% standard deviation',
        'Local replica reads vs primary reads: routing all reads to the primary maximizes consistency but creates a single-node bottleneck for hot shards; routing reads to replicas adds < 1 ms replication lag but gives 2–3× read throughput; use replica reads for cacheable data where 1 s staleness is acceptable',
        'Hot-key mitigation: a single viral key (e.g., a celebrity\'s profile) can saturate one shard at 100 K QPS while others are idle; solutions: (1) local in-process L1 cache in each app server for the top-100 hot keys (10 ms TTL) — eliminates network entirely for hot reads; (2) key replication (store hot_key_0 through hot_key_15 and randomly pick a replica) — spreads load across 16 nodes; local L1 cache is simpler and covers 80% of hot-key scenarios',
      ],
      failureModes: [
        'Cache stampede (thundering herd) on cold start or TTL expiry: all app servers simultaneously query the DB for the same key → DB overload; mitigate with probabilistic early reactivation (recompute 10% of the time before TTL expiry, so one early write refreshes the cache) or a distributed lock (only one worker refreshes while others wait on the cache)',
        'Shard failure: with RF=1 (no replica), a shard failure causes a cache miss storm for all keys on that shard; the origin DB must handle the burst; pre-provision DB with headroom for 100% cache miss scenario for the lost shard\'s key space (~1/N of total traffic), or use RF=2 with a standby replica promoted in < 30 s',
        'Memory pressure and unexpected eviction: if the working set grows beyond maxmemory, LRU eviction removes keys that are still frequently accessed, causing miss-rate spikes; monitor memory usage and alert at 75% capacity to allow time for scaling (adding nodes or increasing instance size)',
      ],
      monitoring: [
        'Cache hit rate — alert if < 95% (for a well-warmed cache in steady state); a sudden drop indicates a mass invalidation, key pattern change, or eviction storm',
        'P99 GET/SET latency — alert if > 1 ms; indicates either network congestion, CPU pressure on a shard, or lock contention on a hot key',
        'Eviction count per second — alert if > 1 000 evictions/s; means the cache is undersized for the working set; keys are being evicted before they expire naturally, reducing effective hit rate',
      ],
    },

    /* ------------------------------------------------------------------ */
    'message-queue': {
      functional: [
        'Accept producer messages and durably store them until consumed, with configurable retention (hours to months)',
        'Deliver messages to consumer groups with at-least-once semantics and offset-based resumption after failure',
        'Support topic partitioning for parallelism — N consumers in a group process N partitions concurrently',
        'Guarantee message ordering within a partition; no cross-partition ordering guarantee',
        'Allow consumers to replay messages from any offset (useful for re-processing or debugging)',
        'Support message schemas and schema evolution via a schema registry to prevent consumer breakage',
      ],
      assumptions: [
        'What is the expected throughput — megabytes/s (Kafka) or thousands of messages/s (SQS/RabbitMQ)?',
        'Is exactly-once delivery required, or is at-least-once with idempotent consumers sufficient?',
        'What is the maximum acceptable consumer lag before alerting — seconds for real-time pipelines, hours for batch?',
        'Do messages have a priority — should urgent messages jump the queue ahead of batch messages?',
        'What is the message retention requirement — 7 days (Kafka default), 30 days, or indefinite cold storage?',
      ],
      outOfScope: [
        'Message routing based on content/headers — use a message router or rules engine on top of this queue',
        'Request-reply (RPC over queue) patterns — use a dedicated RPC framework; queues are one-directional',
        'Dead-letter queue management UI — separate ops tooling that reads from the DLQ topic',
      ],
      consistency: 'CP for durability — messages must be durably committed to the leader and at least one replica before the producer receives an ack (acks=all in Kafka); a producer receiving an ack should never see its message lost, even if the leader crashes immediately after',
      latencySLO: 'Producer P99 publish latency < 5 ms (synchronous with acks=all and batch.size tuning); consumer end-to-end latency (producer publish → consumer receive) P99 < 100 ms for real-time topics',
      readWrite: 'Write-heavy from producers; append-only sequential writes on the partition log are near disk-speed (1–2 GB/s per disk); consumers read sequentially via OS page cache — reads are effectively in-memory if lag is small',
      apis: [
        'POST /topics  { name, partitions: int, replicationFactor: int, retentionHours: int } → { topicId }',
        'POST /topics/:name/messages  { key?: bytes, value: bytes, headers?: {} } → { partition: int, offset: long }',
        'GET  /topics/:name/messages?partition=&offset=&limit=100 → [{ offset, key, value, timestamp }]',
        'POST /consumer-groups  { name, topics: [] } → { groupId }',
        'GET  /consumer-groups/:name/lag → [{ topic, partition, consumerOffset, logEndOffset, lag }]',
      ],
      writePath: 'Producer (batched, configurable linger.ms) → Leader broker for partition → append to partition log file (sequential write) → replicate to ISR followers (acks=all waits for all in-sync replicas) → leader sends ack to producer → consumer polls leader (or follower with fetch.min.bytes) → processes messages → commits offset to __consumer_offsets topic',
      readPath: 'Consumer poll(max.wait.ms=500) → broker checks partition log from last committed offset → serves batch via zero-copy sendfile() syscall (bypasses user space) → consumer processes and commits offset',
      designDecisions: [
        'Partition count: too few partitions limits parallelism (consumer count ≤ partition count per group); too many partitions increases metadata overhead and leader election cost during rebalance; rule of thumb: partitions = max_consumers × 2, capped at 1 000 per topic; for a throughput of 1 GB/s with 100 MB/s per partition, use 10 partitions',
        'acks=0 vs acks=1 vs acks=all: acks=0 (fire-and-forget) gives lowest latency but any broker crash loses messages; acks=1 (leader only) loses messages if leader crashes before replication; acks=all (all ISR replicas) is durable but adds ~2 ms for intra-broker replication — use acks=all for financial/critical data, acks=1 for clickstream where occasional loss is acceptable',
        'Consumer push vs pull: a push model (broker pushes to consumer) requires the broker to track consumer capacity and can overwhelm slow consumers; Kafka\'s pull model lets consumers fetch at their own rate with back-pressure handled naturally — a slow consumer just increases lag without dropping messages; pull also enables efficient batching (fetch.min.bytes = 1 MB reduces round-trips by 10×)',
      ],
      failureModes: [
        'Broker leader failure: ZooKeeper/KRaft detects via heartbeat timeout (default 30 s); a new leader is elected from the ISR; producers retry with the updated metadata; unacknowledged in-flight messages may be re-sent (at-least-once); ISR must have ≥ 2 members (min.insync.replicas = 2) to prevent data loss during leader election',
        'Consumer group rebalance storm: every time a consumer joins or leaves, all consumers in the group pause processing during rebalance (stop-the-world); at 100 consumers a rebalance can take 30 s; mitigate with static group membership (group.instance.id) — consumers rejoin their assigned partitions without triggering a full rebalance',
        'Log compaction blocking consumers: compaction merges old log segments and can temporarily spike disk I/O; consumers reading compacted partitions may experience 10–50 ms fetch latency spikes; isolate compacted topics to dedicated brokers or schedule compaction during off-peak hours',
      ],
      monitoring: [
        'Consumer lag per (group, topic, partition) — alert if lag > consumer-group SLA (e.g., > 10 000 events for a real-time pipeline); lag is the primary signal that consumers are slower than producers',
        'Under-replicated partitions count — alert if > 0; a partition with fewer ISR replicas than min.insync.replicas means acks=all writes will start failing',
        'Producer error rate (timeouts, NotLeaderForPartition) — alert if > 0.1%; indicates broker instability or network partition',
      ],
    },

    /* ------------------------------------------------------------------ */
    'web-crawler': {
      functional: [
        'Discover and download web pages starting from a seed URL set and following links recursively',
        'Respect robots.txt and crawl-delay directives per domain',
        'Deduplicate URLs so each page is crawled at most once per recrawl cycle',
        'Schedule periodic recrawls with frequency proportional to page change rate',
        'Store raw HTML and extracted metadata (URL, HTTP status, content hash, crawled_at) durably',
        'Scale to crawl 1 billion pages per month (~400 pages/s sustained)',
      ],
      assumptions: [
        'Is this a focused crawler (specific domains or topics) or a broad web crawler (entire internet)?',
        'How do we handle JavaScript-rendered pages — headless browser (10× slower) or HTML-only?',
        'What politeness policy — maximum N requests per domain per second across all crawler nodes?',
        'Should we prioritize high-PageRank pages or crawl in breadth-first order?',
        'What is the recrawl frequency — news sites need hourly recrawls, static pages monthly?',
      ],
      outOfScope: [
        'Content indexing and search ranking — this service produces raw HTML; a separate indexer parses and indexes it',
        'Link analysis (PageRank computation) — separate graph analytics job consuming the crawled link graph',
        'Content extraction (NLP, entity recognition) — separate ML pipeline',
      ],
      consistency: 'AP — crawling the same URL twice is wasteful but not catastrophic; strict deduplication across all crawler nodes uses a distributed Bloom filter (false-positive rate 0.1% is acceptable); missing a page (false negative in dedup) would require a restart of the affected shard',
      latencySLO: 'Crawl throughput: P50 page download < 500 ms, timeout at 10 s; DNS resolution cached per domain for 5 min; sustained throughput of 400 pages/s across the cluster',
      readWrite: 'Write-heavy on the URL frontier queue and raw HTML store; reads are domain-level (robots.txt cache, crawl delay) and dedup lookups (Bloom filter); I/O is dominated by network fetches to external servers',
      apis: [
        'POST /seeds  { urls: [], priority: "high"|"normal" } → { queuedCount: int }  (admin: inject seed URLs)',
        'GET  /crawl-status → { pendingUrls: int, crawledToday: int, errorRate: float }',
        'GET  /pages/:urlHash → { url, htmlStoragePath, httpStatus, contentHash, crawledAt }',
        'POST /domains/:domain/block → 204  (stops crawling a domain, e.g., for legal reasons)',
        'GET  /domains/:domain/stats → { pagesCrawled, crawlDelayMs, lastRobotsFetch }',
      ],
      writePath: 'Crawler worker fetches URL from frontier queue (Kafka topic "url-frontier") → DNS resolve → HTTP GET with User-Agent and If-None-Match (conditional fetch) → parse robots.txt if not cached → on 200: store raw HTML to object storage (S3) → extract all href links → normalize and deduplicate URLs against Bloom filter → push new URLs to Kafka "url-frontier" → write crawl record to Cassandra',
      readPath: 'Indexer reads crawl records from Cassandra (scan by crawled_at range) → fetches HTML from S3 by storage path → parses and indexes content',
      designDecisions: [
        'Bloom filter vs hash set for dedup: a hash set of 10 B URLs (8 bytes each) requires 80 GB RAM; a Bloom filter at 0.1% false-positive rate requires only ~14 bits/element = 17.5 GB — 4.5× smaller; false positives cause occasional skipped pages (acceptable); use a distributed Redis Bloom filter (RedisBloom module) sharded across nodes',
        'Politeness: per-domain crawl delay: without throttling a single crawler at 400 pages/s would hammer one domain with thousands of QPS; store last_crawl_time per domain in Redis and enforce a minimum crawl delay (1 s by default, or as specified in robots.txt Crawl-delay); use a per-domain priority queue in the frontier sorted by (last_crawl_time + crawl_delay) to schedule polite re-visits',
        'Frontier queue: a simple FIFO Kafka queue gives no control over priority or politeness; instead use a multi-bucket frontier: high-priority (news, sitemaps) → normal → low-priority; within each bucket, use a Redis ZSET sorted by scheduled_next_crawl_at so workers can pick only due URLs without spinning on the queue',
      ],
      failureModes: [
        'Crawler node crash with URLs in-flight: URLs consumed from Kafka but not yet stored will be re-delivered after the consumer session times out (30 s); re-crawling a page is safe — content hash deduplication at the indexer prevents duplicate index entries',
        'Target server returns 429 / rate-limit: back off exponentially per domain (2× delay up to 1 h); write the URL back to the frontier with a future scheduled_at timestamp; alert if > 10% of fetches to a single domain are 429s (may indicate our IP is being blocked)',
        'Object storage (S3) outage: raw HTML cannot be written; worker buffers up to 100 MB locally before blocking; crawler throughput drops to zero within seconds of S3 unavailability; fail fast and drain the Kafka consumer group — do not ack messages that cannot be stored; resume from Kafka offset after S3 recovery',
      ],
      monitoring: [
        'Crawl throughput (pages/s) — alert if < 300 pages/s (25% below target); indicates worker starvation, DNS failure, or S3 write bottleneck',
        'Fetch error rate by HTTP status (4xx, 5xx, timeout) — alert if timeout rate > 5%; indicates network issues or aggressive blocking by target servers',
        'Frontier queue depth — alert if > 10 B URLs (frontier is growing faster than we\'re crawling; add more worker nodes)',
      ],
    },

    /* ------------------------------------------------------------------ */
    'object-storage': {
      functional: [
        'Store and retrieve arbitrary binary objects (bytes to terabytes) identified by a bucket + key',
        'Support multipart upload for objects > 5 MB to enable resumable uploads and parallel upload segments',
        'Provide strong read-after-write consistency: a GET immediately after a PUT must return the new object',
        'Replicate data across at least 3 availability zones with 11 nines (99.999999999%) durability',
        'Support versioning so previous versions of an object can be restored',
        'Enforce access control via bucket policies (IAM-style) and pre-signed URLs for temporary access',
      ],
      assumptions: [
        'What is the expected object size distribution — primarily small objects (< 1 MB) or large files (> 100 MB)?',
        'Is cross-region replication needed, or is single-region multi-AZ sufficient for durability?',
        'What is the expected GET-to-PUT ratio — read-heavy (media serving) or write-heavy (log archival)?',
        'Do we need lifecycle policies (auto-transition to cold storage after 30 days, delete after 1 year)?',
        'Is server-side encryption required at rest, and who manages the keys (service-managed or customer-managed KMS)?',
      ],
      outOfScope: [
        'Content delivery / caching at the edge — handled by the CDN layer in front of object storage',
        'Database-style queries on object metadata — use a search index or Athena-style S3 Select',
        'Block storage (EBS-style, random reads/writes) — object storage is optimized for sequential large I/O',
      ],
      consistency: 'CP for read-after-write within a region — after a successful PUT response the object must be immediately readable; achieves this via synchronous replication to all three AZ replicas before returning success; cross-region replication is eventually consistent (seconds to minutes)',
      latencySLO: 'P99 PUT < 100 ms for objects < 1 MB (first-byte-in to last-byte-written-and-acked); P99 GET first-byte-latency < 50 ms; large object throughput ≥ 5 GB/s aggregate across the cluster',
      readWrite: 'Typically 10:1 to 100:1 read-heavy for media use cases (upload once, serve millions of times); write-heavy for log/backup use cases; design must handle both with separate read and write paths',
      apis: [
        'PUT  /buckets/:bucket/:key  (body = object bytes, Content-MD5 header) → 200 { ETag, versionId }',
        'GET  /buckets/:bucket/:key?versionId= → object bytes (streaming)',
        'DELETE /buckets/:bucket/:key?versionId= → 204',
        'POST /buckets/:bucket/:key?uploads → { uploadId }  (initiate multipart)',
        'PUT  /buckets/:bucket/:key?partNumber=N&uploadId= → { ETag }  (upload part)',
        'POST /buckets/:bucket/:key?uploadId=  { parts: [{partNumber, ETag}] } → 200 { key, ETag }  (complete multipart)',
      ],
      writePath: 'Client PUT → API Gateway → Metadata service (check bucket ACL, generate object_id) → Data service chunks object into 4 MB blocks → Reed-Solomon erasure coding (10+4 coding: 10 data blocks + 4 parity blocks survive any 4 node failures) → writes 14 shards to 14 storage nodes across 3 AZs → on 10/14 acks returns 200 to client → metadata (bucket, key, block_map) written to metadata DB',
      readPath: 'Client GET → API Gateway → Metadata service (lookup object_id → block_map) → Data service fetches 10 of 14 shards in parallel (fastest-10-respond pattern) → reconstructs original bytes → streams to client',
      designDecisions: [
        'Erasure coding (10+4) vs 3-way replication: 3-way replication stores 3× the data (300% overhead); erasure coding 10+4 stores 1.4× the data (140% overhead) with the same fault tolerance (tolerates any 4 failures) — at 1 exabyte of user data, EC saves 1.6 EB of storage; trade-off: reconstruction on read requires 10 parallel shard fetches (adds ~5 ms) vs 1 direct read with replication',
        'Metadata storage: object metadata (bucket, key, block_map, ACL) is frequently updated (writes per PUT, deletes, versioning) and queried (GET, LIST); relational DB (PostgreSQL) with a B-tree index on (bucket, key) handles < 10 B objects well; above 100 B objects use a distributed KV store (RocksDB-backed) with range scans for LIST operations',
        'Multipart upload design: a 10 GB upload over a 100 Mbps connection takes ~800 s; if the connection drops at 799 s the entire upload is lost without multipart; multipart allows uploading in 5 MB parts with independent retry; parts are stored as temporary objects and assembled on CompleteMultipartUpload — the assembly is server-side concatenation of erasure-coded blocks, not data re-upload',
      ],
      failureModes: [
        'Storage node failure: with 10+4 erasure coding the system tolerates 4 simultaneous node failures; on node failure, the data service detects missing shards via health-check, fetches surviving shards, reconstructs missing shards, and writes them to a replacement node (background reconstruction) — 1 TB at 1 GB/s reconstruction speed takes ~17 min; alert when any shard is missing; block new writes if < 10 of 14 shards are available',
        'Metadata DB overload: LIST /bucket operations (listing all keys in a bucket) require a full range scan for large buckets (> 1 B objects); implement pagination (continuation-token based) with a maximum of 1 000 keys per page; rate-limit LIST operations per bucket per minute to prevent scan abuse',
        'Bit rot (silent data corruption): storage media can flip bits over time; detect by storing a per-block checksum (SHA-256) alongside each shard; validate on every read; periodic background scrubbing (read all shards, verify checksums) detects and repairs bit rot before it causes data loss',
      ],
      monitoring: [
        'Durability indicator: count of objects with fewer than 10 intact shards — must always be 0; alert immediately on any degraded object',
        'PUT/GET P99 latency split by object size bucket (< 1 KB, 1 KB–1 MB, > 1 MB) — alert if any bucket rises above SLO; large-object latency spikes indicate network congestion',
        'Storage utilization per node — alert if any node > 80% full; the cluster must begin rebalancing (moving shards to less-full nodes) before nodes hit 90% to prevent write failures',
      ],
    },

    /* ------------------------------------------------------------------ */
    'cdn': {
      functional: [
        'Cache and serve static assets (images, JS, CSS, videos) from edge nodes geographically close to end users',
        'Reduce origin server load by serving ≥ 95% of requests from cache (cache hit ratio target)',
        'Support cache invalidation: a cache-bust request must propagate to all edge nodes within 30 s',
        'Route requests to the nearest edge node using Anycast DNS or GeoDNS with latency-based routing',
        'Support byte-range requests for video streaming (partial content, HTTP 206)',
        'Provide SSL termination at the edge and support custom domains with auto-provisioned TLS certificates',
      ],
      assumptions: [
        'Is the content primarily static (long TTL, e.g., versioned JS bundles) or dynamic / personalized (short or no TTL)?',
        'What is the expected cache hit ratio — 95%+ for public assets or lower for user-specific content?',
        'Do we need streaming video support with ABR (Adaptive Bitrate Streaming / HLS, DASH)?',
        'Is edge-side logic needed (e.g., A/B testing, authentication) or is this a pure caching layer?',
        'What geographies must be covered — North America only, or global with edge nodes in APAC and EMEA?',
      ],
      outOfScope: [
        'Origin server implementation — CDN is a caching layer; origin is a separate service',
        'DDoS mitigation beyond rate-limiting at the edge — requires specialized scrubbing infrastructure',
        'Edge compute / serverless (Cloudflare Workers-style) — this scope is limited to caching',
      ],
      consistency: 'AP — serving stale content for up to TTL seconds is acceptable for static assets; on explicit invalidation, propagate the purge to all edge nodes within 30 s (eventual consistency with a tight window)',
      latencySLO: 'Edge cache hit P99 < 20 ms (serving from local SSD in the same city as the user); cache miss (origin fetch + cache fill) P99 < 200 ms; TLS handshake P99 < 50 ms (session resumption via session tickets)',
      readWrite: 'Extremely read-heavy — 99%+ reads (edge serves cached content); writes occur only on cache-fill (cache miss) and invalidation; design optimizes for read throughput (100 Gbps+ per edge node)',
      apis: [
        'GET  /:path  (standard HTTP GET served at edge, Cache-Control / Surrogate-Control headers respected)',
        'POST /cdn/purge  { urls: [], tags: [] } → { jobId, estimatedPropagationMs: 30000 }  (admin)',
        'GET  /cdn/purge/:jobId → { propagatedEdges: int, totalEdges: int, done: bool }',
        'PUT  /cdn/rules  { origin, pathPatterns: [], ttlSecs, headers: {} } → 204  (cache behavior config)',
        'GET  /cdn/analytics?edge=&from=&to= → { requestCount, hitRate, bytesServed, p99LatencyMs }',
      ],
      writePath: 'Origin receives a content update → admin calls POST /cdn/purge with affected URLs → purge service publishes purge events to a Kafka topic → each edge node subscribes and evicts matching cache entries → edge nodes confirm eviction; next cache miss triggers a fresh origin fetch',
      readPath: 'User DNS query → GeoDNS returns edge node IP nearest to user → user TLS + HTTP/2 request to edge → edge checks local disk cache (nginx proxy_cache) → cache hit: serve from SSD (< 5 ms); cache miss: edge fetches from origin shield (a mid-tier regional cache) → origin shield hit or forward to origin → cache fill → serve response',
      designDecisions: [
        'Origin shield (mid-tier cache): without an origin shield, N edge nodes each independently fetch from the origin on a cache miss — at 1 000 edge nodes and a popular asset, the origin receives 1 000 simultaneous miss requests; an origin shield is a regional aggregation layer that collapses all misses from a region into a single origin fetch, reducing origin load by 100–1 000×',
        'Cache key design: default cache key = URL; but if the same URL serves different content based on cookies, User-Agent, or Accept-Language, the cache must vary on those headers (Vary header); over-broad Vary (e.g., Vary: Cookie) destroys the hit rate — only vary on headers that actually change the response; use surrogate keys (cache tags) to group related assets for bulk invalidation without URL enumeration',
        'TTL strategy for versioned vs unversioned assets: versioned assets (bundle.abc123.js) can have TTL = 1 year (immutable) and never need invalidation; unversioned assets (logo.png) should have TTL = 5 min with a surrogate key for instant invalidation on update; using content-hash versioning at the build step eliminates the need for invalidation entirely for static assets',
      ],
      failureModes: [
        'Edge node failure: GeoDNS detects via health-check failure and stops routing to the failed node within 30 s; users are temporarily routed to the next-nearest edge (slightly higher latency); the failed node\'s cache is cold when it recovers, causing a miss burst — origin shield absorbs this',
        'Cache poisoning: if a malformed request causes incorrect content to be cached and served to other users; mitigate by (1) validating response Content-Type matches the requested resource type, (2) stripping client-specific headers (Cookie) from the cache key, (3) not caching 3xx redirects with dynamic Location headers without careful inspection',
        'Thundering herd on cache expiry: multiple edge nodes simultaneously expire a popular asset and all request origin at the same second; mitigate with stale-while-revalidate (serve stale for 5 s while one background request refreshes the cache) and request coalescing (only one inflight origin request per cache key per edge node)',
      ],
      monitoring: [
        'Cache hit ratio per edge node — alert if < 90% for any node; drill into which path patterns are causing misses (may indicate missing caching rules or excessive query string variation)',
        'Edge node P99 TTFB (time-to-first-byte) — alert if > 20 ms for cache hits; indicates SSD or CPU pressure on that node',
        'Origin request rate — alert if rising faster than new content publish rate; indicates a drop in cache hit ratio that is increasing origin load',
      ],
    },

    /* ------------------------------------------------------------------ */
    'payment': {
      functional: [
        'Process payment charges and refunds with exactly-once semantics — never double-charge a user',
        'Support multiple payment methods: card (via Stripe/Adyen), bank transfer, wallet balance',
        'Maintain an immutable double-entry ledger for all money movements with full audit trail',
        'Provide idempotent APIs: retrying a timed-out request must not create duplicate charges',
        'Handle distributed failures via 2PC or saga pattern across the order service and ledger',
        'Enforce PCI-DSS compliance: no raw card data stored; tokenize at capture and store only tokens',
      ],
      assumptions: [
        'Are we building a payment gateway (handling card networks directly) or integrating with Stripe/Adyen as the processor?',
        'What is the expected transaction volume — thousands per second (high-scale) or hundreds per minute?',
        'Is multi-currency support needed, and should FX conversion happen in-service or via a third-party FX rate feed?',
        'What is the dispute / chargeback flow — automated or manual review?',
        'What is the acceptable window for payment reconciliation — real-time or end-of-day batch?',
      ],
      outOfScope: [
        'Fraud detection scoring — a separate ML fraud service returns a risk score before the charge is submitted',
        'Tax calculation — separate tax service (Avalara / TaxJar) computes tax amount before payment',
        'Merchant onboarding and KYC — separate compliance and identity-verification service',
      ],
      consistency: 'CP — money cannot be lost or double-counted; all ledger writes use serializable isolation (PostgreSQL SERIALIZABLE or FOR UPDATE); we accept higher write latency (50–100 ms) to guarantee correctness; there is no AP trade-off acceptable for financial data',
      latencySLO: 'P99 < 500 ms for charge (includes card network round-trip ~200 ms); P99 < 100 ms for balance read; idempotency key lookup P99 < 10 ms (Redis)',
      readWrite: 'Roughly balanced — each charge creates 2–4 ledger rows (double-entry); each read (balance, history) queries those rows; read-heavy during business hours (users checking balances), write-heavy during checkout flows',
      apis: [
        'POST /charges  { idempotencyKey, userId, amountCents, currency, paymentMethodToken, orderId } → { chargeId, status: "succeeded"|"pending"|"failed" }',
        'POST /charges/:id/refund  { idempotencyKey, amountCents? } → { refundId, status }',
        'GET  /charges/:id → { chargeId, status, amountCents, currency, createdAt, ledgerEntries: [...] }',
        'GET  /users/:id/balance → { amountCents, currency, lastUpdatedAt }',
        'GET  /users/:id/transactions?from=&to=&cursor= → paginated ledger history',
      ],
      writePath: 'POST /charges → check idempotency key in Redis (SETNX) → if key exists return cached response; else → BEGIN SERIALIZABLE TX → lock user account row (SELECT FOR UPDATE) → call card processor API (Stripe) → on success INSERT ledger entries (debit user, credit platform) → COMMIT → store result in Redis idempotency cache (TTL 24 h) → return response',
      readPath: 'GET /balance → read from PostgreSQL read replica (acceptable: up to 1 s stale) → SUM of credit - debit ledger entries for userId → cache in Redis for 5 s (write-invalidate on each charge)',
      designDecisions: [
        'Idempotency key design: clients generate a UUID v4 per charge attempt and send it in the header; the server stores {idempotency_key → response} in Redis with 24 h TTL using SETNX; if the key already exists, return the stored response without re-charging; this makes all charge retries safe regardless of whether the original request succeeded, failed, or timed out — the single most important design decision in payments',
        'Saga vs 2PC for distributed transactions: 2PC (two-phase commit) locks resources across services until the coordinator commits — a coordinator crash leaves all participants in uncertain state; Saga decomposes the transaction into local steps with compensating actions (e.g., if order creation fails after charge succeeds, issue an automatic refund) — Saga has no distributed lock and is more resilient; use Saga with a compensating refund action for the charge-order flow',
        'Double-entry ledger: every money movement creates at least two ledger rows (debit one account, credit another) so that the sum of all rows always equals zero — an invariant that immediately catches bugs; store as immutable append-only rows with account_id, amount_cents (positive = credit, negative = debit), transaction_id, and created_at; never UPDATE or DELETE ledger rows — corrections are additional offsetting entries with a reference to the original transaction',
      ],
      failureModes: [
        'Card processor timeout: the HTTP call to Stripe times out at 10 s; we don\'t know if the charge succeeded at Stripe; retry with the same idempotency key (Stripe also supports idempotency keys) — if the charge went through, Stripe returns the original response; if not, it processes it now; never retry without the idempotency key or you risk double-charging',
        'Database primary failure during COMMIT: the transaction may be in-doubt (committed on primary but replica not yet caught up, or rolled back); on recovery, query the processor API to determine charge status and reconcile the ledger accordingly; this is why the idempotency key is stored in Redis BEFORE calling the processor — on re-entry, if Redis has the key, we know the processor call already happened',
        'Overselling (negative balance): without a balance lock, two concurrent requests can both read a user\'s balance as $100 and both charge $90, resulting in -$80; prevent with SELECT FOR UPDATE on the account row inside the serializable transaction — row-level locking limits throughput per account but is necessary for correctness; high-volume accounts (merchants) get dedicated shards',
      ],
      monitoring: [
        'Charge success rate by payment method — alert if < 99.5% for cards (industry norm is > 99%); a drop indicates card processor issues or a spike in declines (fraud or expired cards)',
        'Ledger balance consistency check: every hour run SUM(amount_cents) across the entire ledger — must equal 0 (double-entry invariant); alert immediately on any non-zero result',
        'Idempotency key collision rate — alert if > 0.01% of charges arrive with a key that already has a different amount/user combination (indicates client-side key reuse bug that could silently return wrong cached responses)',
      ],
    },

    /* ------------------------------------------------------------------ */
    'social-graph': {
      functional: [
        'Store directed follow relationships (A follows B) and undirected friend relationships at scale (billions of edges)',
        'Answer "does user A follow user B?" in < 10 ms (hot path for feed fan-out and content visibility)',
        'Retrieve a user\'s follower list and following list with pagination',
        'Support second-degree connections: "followers of followers" traversal for PYMK (People You May Know)',
        'Propagate follow/unfollow events to downstream consumers (feed service, notification service) via Kafka',
        'Handle celebrity nodes: accounts with 100 M+ followers must not become read hotspots',
      ],
      assumptions: [
        'Is the graph directed (Twitter follow model) or undirected (Facebook friend model), or both?',
        'What is the maximum fan-out depth for recommendations — 2 hops or 3 hops?',
        'What is the read-to-write ratio for graph lookups? (Typically 1 000:1 — queries outnumber follows/unfollows by orders of magnitude)',
        'Do we need mutual-friend intersection queries (users who both A and B follow)?',
        'What is the max expected followers per node — millions (Instagram) or hundreds of millions (public figures)?',
      ],
      outOfScope: [
        'Graph analytics at scale (community detection, clustering coefficients) — run offline on a graph analytics engine (Neo4j / Spark GraphX)',
        'Content visibility rules beyond follow relationships (e.g., block lists, close-friends) — separate privacy-policy service',
        'Social recommendations (collaborative filtering) — separate ML recommendation service using the graph as input',
      ],
      consistency: 'AP — a 1–5 s lag between a follow event and its visibility in follower lists is acceptable; the is-following check (used in feed fan-out) must be consistent within 5 s to avoid serving posts to unfollowed users; use Redis cache with 5 s TTL backed by an eventually consistent graph store',
      latencySLO: 'P99 < 10 ms for is-following check (hot path); P99 < 50 ms for get-followers/get-following (first page); P99 < 500 ms for PYMK traversal (2 hops, acceptable as a background operation)',
      readWrite: '1 000:1 read-heavy — every piece of content checks the follow graph for visibility; follows/unfollows are relatively rare; the read path must be served from a cache or denormalized adjacency store',
      apis: [
        'POST /follows  { followerId, followeeId } → { edgeId, createdAt }',
        'DELETE /follows  { followerId, followeeId } → 204',
        'GET  /users/:id/followers?cursor=&limit=100 → { followers: [userId], nextCursor }',
        'GET  /users/:id/following?cursor=&limit=100 → { following: [userId], nextCursor }',
        'GET  /users/:followerId/follows/:followeeId → { follows: bool, since: ISO8601|null }',
        'GET  /users/:id/pymk?limit=20 → { suggestions: [{ userId, mutualFollowers: int }] }',
      ],
      writePath: 'POST /follows → write edge to Graph DB (followerId, followeeId, created_at) → invalidate Redis cache for followerId\'s following list and followeeId\'s follower list → publish "follow" event to Kafka (consumed by feed service for fan-out, notification service for push alert)',
      readPath: 'GET /follows/:id → check Redis (SISMEMBER following:{followerId} followeeId) → cache hit: return in < 1 ms; cache miss: query Graph DB or adjacency list table in Cassandra → populate Redis set (SADD following:{followerId} followeeId, TTL 60 s) → return',
      designDecisions: [
        'Adjacency list vs adjacency matrix: a matrix of 1 B users requires 1 B × 1 B bits = 125 PB — impossible; adjacency lists store only actual edges (~4 B edges for Twitter-scale at 8 bytes each = 32 GB) and are the universal choice; within adjacency lists, use a relational table for small follow counts and a wide-row Cassandra table (partition = userId, clustering = followeeId) for large fan-out queries with O(1) pagination',
        'Dedicated graph DB vs relational: Neo4j gives natural graph traversal syntax (Cypher) and O(hops) traversal without full-table scans, but struggles above 10 B edges due to memory requirements; a relational follows(follower_id, followee_id, created_at) table with composite index handles 100 B edges efficiently for 1-hop queries but makes 2-hop PYMK queries expensive (nested loop join); use Cassandra for the hot adjacency list and Neo4j or SparkGraphX offline for multi-hop analytics',
        'Celebrity (high-follower) node handling: querying the follower list of a node with 100 M followers is O(100 M) — a range scan that locks the Cassandra partition; never paginate the full list in a single query; instead, for fan-out purposes, maintain a separate "celebrities" table and use fan-out on read (pull their posts at read time rather than pushing to 100 M inboxes); for the is-following check, cache the celebrity\'s following list in a Redis Bloom filter (1% false-positive rate, ~12 MB for 100 M entries)',
      ],
      failureModes: [
        'Cache cold start after Redis flush: all is-following checks fall through to Cassandra; at 1 M QPS this saturates a small Cassandra cluster in seconds; warm the cache from a Cassandra snapshot on startup; rate-limit cache-miss DB queries with a semaphore (max 10 K concurrent fallback reads)',
        'Follow event lost in Kafka: if the Kafka producer fails to publish the "follow" event, the feed service never fans out the new followee\'s posts; use Kafka producer with acks=all and retry; additionally run a periodic reconciliation job that compares the graph DB follow table with the feed service\'s fan-out log and backfills any missing events',
        'Adjacency list partition hotspot: a write-heavy partition (a celebrity being followed 10 000 times/s) can saturate a Cassandra node; write to multiple replica partitions using a salt suffix (following:{userId}_0 through following:{userId}_15) and union the results on read — spreads writes across 16 nodes',
      ],
      monitoring: [
        'Is-following check P99 latency — alert if > 10 ms; indicates Redis cache miss rate is too high or Cassandra is under load',
        'Follow/unfollow event Kafka consumer lag (feed and notification services) — alert if > 10 K events; a stale follow relationship can cause posts to appear in (or disappear from) feeds incorrectly',
        'Redis memory for adjacency sets — alert if > 80% capacity; adjacency sets for high-follower users can be large; evict least-recently-used sets first and fall back to Cassandra on miss',
      ],
    },

  };
})();
