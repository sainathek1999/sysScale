/* ============================================================
   modules-foundations.js — 7 Foundations modules, full content
   ============================================================ */
(function () {
  window.SS = window.SS || {};
  window.SS.MODULES = window.SS.MODULES || {};

  window.SS.MODULES['foundations'] = [
    /* ── 1 ── How the Internet Works ─────────────────────── */
    {
      id: 'internet-basics',
      title: 'How the Internet Works',
      track: 'foundations',
      difficulty: 'beginner',
      readingMins: 8,
      keyPoints: [
        'DNS resolution adds ~20–120ms of cold-start latency — always mention DNS caching in high-read designs.',
        'HTTP/2 multiplexes requests over a single TCP connection; HTTP/3 moves to QUIC (UDP) to eliminate head-of-line blocking.',
        'A CDN reduces latency by serving content from a PoP near the user — typical reduction: 200ms → 20ms for static assets.',
        'TCP three-way handshake costs 1.5 RTTs before the first byte. TLS adds another 1–2 RTTs on top.',
        'Interviewers expect you to mention DNS, CDN, load balancer, and web/app/DB tiers in every system overview.',
      ],
      quiz: [
        {
          q: 'A user in Tokyo requests a page from a US-based server. What reduces their latency the most?',
          opts: ['Switching from HTTP to HTTPS', 'Using a CDN with a Tokyo PoP', 'Increasing server RAM', 'Using WebSockets instead of HTTP'],
          answer: 1,
          explanation: 'A CDN PoP in Tokyo serves cached content locally, slashing the 150ms+ round-trip to the US down to single-digit milliseconds.',
        },
        {
          q: 'Which statement about DNS is most relevant in a system design interview?',
          opts: [
            'DNS TTL is always 24 hours',
            'DNS runs on TCP port 443',
            'DNS resolution can be cached by browsers and OS — design with TTL trade-offs in mind',
            'Each DNS lookup costs exactly 1ms',
          ],
          answer: 2,
          explanation: 'TTL-based caching is the key design lever. Short TTL = faster propagation on change, but higher DNS server load. Long TTL = better performance but slower rollouts.',
        },
        {
          q: 'What does HTTP/2 multiplexing solve compared to HTTP/1.1?',
          opts: [
            'It removes the need for TLS',
            'Multiple requests share one TCP connection — eliminating HTTP-level head-of-line blocking',
            'It compresses all images automatically',
            'It removes DNS lookups',
          ],
          answer: 1,
          explanation: 'HTTP/1.1 requires a new connection per request (or serial pipelining). HTTP/2 streams multiple requests in parallel on a single connection.',
        },
        {
          q: 'In a typical request path: User → DNS → CDN → Load Balancer → App → DB, which step most often becomes the bottleneck at scale?',
          opts: ['DNS resolution', 'CDN layer', 'The database', 'TLS handshake'],
          answer: 2,
          explanation: 'The database is almost always the first bottleneck. It\'s stateful (can\'t be trivially scaled horizontally) and slow I/O compared to in-memory app servers.',
        },
      ],
      relatedSystems: ['url-shortener'],
      content: `
<h2>The request journey</h2>
<p>Every system design interview begins with a user making a request. Understanding that journey — from keyboard to database and back — gives you the vocabulary to reason about latency, failure modes, and scale.</p>
<p>A typical request path looks like this:</p>
<div class="formula-box">User → <span class="v">DNS</span> → <span class="v">CDN</span> → <span class="v">Load Balancer</span> → <span class="v">App Server</span> → <span class="v">Database</span></div>
<p>Each hop adds latency and introduces a potential failure point. Engineers who think in hops design better systems.</p>

<h2>DNS: the phone book of the internet</h2>
<p>Before any TCP connection is made, the client must resolve a hostname to an IP address. DNS is hierarchical: the OS cache is checked first, then the resolver cache, then the authoritative nameserver.</p>
<table class="metrics-table">
  <tr><td>OS/browser cache hit</td><td class="hl">~0ms</td></tr>
  <tr><td>Resolver cache hit</td><td class="hl">~1–5ms</td></tr>
  <tr><td>Full recursive DNS lookup</td><td class="hl">~20–120ms</td></tr>
</table>
<p><strong>Interview relevance:</strong> DNS is not a concern for most in-interview designs, but you should mention that a DNS change (e.g. failover to backup region) propagates slowly based on TTL. Services like AWS Route 53 allow health-check-driven routing and latency-based routing.</p>

<h2>TCP: reliable but expensive</h2>
<p>TCP requires a three-way handshake before data can flow: SYN → SYN-ACK → ACK. This costs 1 full round trip. TLS 1.2 adds 2 more RTTs; TLS 1.3 reduces this to 1. HTTP/3's QUIC protocol moves to UDP and bakes TLS in, achieving 0-RTT reconnect for returning clients.</p>
<div class="info-box">
  <div class="info-box-title">Why this matters</div>
  <div class="info-box-body">Mobile users on high-latency networks (300ms RTT) spend 600ms just on TCP+TLS before the first byte arrives. This is why QUIC exists and why connection pooling to your database matters so much — eliminating repeated handshakes is a huge win.</div>
</div>

<h2>HTTP versions at a glance</h2>
<table class="metrics-table">
  <tr><td>HTTP/1.1</td><td>One request per TCP connection, pipelining limited</td></tr>
  <tr><td>HTTP/2</td><td class="hl">Multiplexing — N requests over 1 TCP connection</td></tr>
  <tr><td>HTTP/3 / QUIC</td><td class="hl">UDP-based, 0-RTT reconnect, no head-of-line blocking</td></tr>
</table>

<h2>CDNs: geography beats compute</h2>
<p>A Content Delivery Network places servers (Points of Presence, PoPs) in cities worldwide. When a user requests a static asset (image, CSS, JS, or even API response), the CDN PoP responds from its cache — skipping the transatlantic round-trip entirely.</p>
<table class="metrics-table">
  <tr><td>Without CDN (Tokyo → US-East)</td><td>~180ms RTT</td></tr>
  <tr><td>With CDN (Tokyo PoP, cache hit)</td><td class="hl">~8ms RTT</td></tr>
</table>
<p>CDNs also absorb DDoS traffic, reducing load on your origin servers. Major providers: Cloudflare, Fastly, AWS CloudFront, Akamai.</p>

<h2>The five-layer mental model</h2>
<p>In system design interviews, map every request to these five tiers and explain what each one does:</p>
<table class="metrics-table">
  <tr><td>1. DNS / CDN</td><td>Resolve and cache at the edge</td></tr>
  <tr><td>2. Load Balancer</td><td>Distribute traffic across app servers</td></tr>
  <tr><td>3. App Servers</td><td>Stateless compute; scale horizontally</td></tr>
  <tr><td>4. Cache Layer</td><td>Redis/Memcached in front of the DB</td></tr>
  <tr><td>5. Database</td><td>The source of truth; scale carefully</td></tr>
</table>
`,
    },

    /* ── 2 ── APIs & Protocols ────────────────────────────── */
    {
      id: 'apis-protocols',
      title: 'APIs & Protocols',
      track: 'foundations',
      difficulty: 'beginner',
      readingMins: 10,
      keyPoints: [
        'REST is stateless, cacheable, and widely understood — default choice unless you have a specific reason to switch.',
        'GraphQL eliminates over-fetching; ideal for mobile clients with variable data needs. Comes with N+1 query risk.',
        'gRPC uses Protocol Buffers (binary), is ~7× faster than JSON REST for high-throughput internal services.',
        'WebSockets are full-duplex, persistent connections — use for real-time bidirectional (chat, live collab, gaming).',
        'SSE (Server-Sent Events) is one-way server→client push — simpler than WebSockets for live feeds/notifications.',
        'Long polling is a compatibility hack; prefer WebSockets or SSE on modern stacks.',
      ],
      quiz: [
        {
          q: 'A real-time multiplayer game needs the server to push position updates to all clients 30 times/second. Best protocol?',
          opts: ['REST/HTTP polling every 33ms', 'GraphQL subscriptions', 'WebSockets (full-duplex persistent)', 'Server-Sent Events'],
          answer: 2,
          explanation: 'WebSockets maintain a persistent connection and support server→client push at high frequency with minimal overhead. SSE is one-way only; REST polling at 30Hz is impractical at scale.',
        },
        {
          q: 'A mobile app displays a feed where different screens need different subsets of user data. What\'s the main benefit of GraphQL here?',
          opts: [
            'GraphQL is faster than REST',
            'Clients request exactly the fields they need — eliminating over-fetching',
            'GraphQL works without a schema',
            'GraphQL automatically caches all responses',
          ],
          answer: 1,
          explanation: 'REST returns fixed shapes — a mobile home screen gets the same payload as a desktop profile page. GraphQL lets each client specify exactly what it needs.',
        },
        {
          q: 'You\'re designing an internal service-to-service API that processes 50,000 RPS with strict latency SLAs. Best choice?',
          opts: ['REST with JSON', 'gRPC with Protocol Buffers', 'GraphQL', 'SOAP/XML'],
          answer: 1,
          explanation: 'gRPC uses binary Protocol Buffers (smaller payload, faster serialization) and HTTP/2 multiplexing. It\'s the standard for high-throughput internal microservices at Google, Netflix, and others.',
        },
        {
          q: 'Which HTTP status code should a rate limiter return when a client exceeds their quota?',
          opts: ['400 Bad Request', '401 Unauthorized', '429 Too Many Requests', '503 Service Unavailable'],
          answer: 2,
          explanation: '429 is the correct status. It should include a Retry-After header indicating when the client can retry. 503 implies the service itself is down, not that the client has been throttled.',
        },
      ],
      relatedSystems: ['rate-limiter', 'chat-service'],
      content: `
<h2>REST: the default</h2>
<p>REST (Representational State Transfer) maps HTTP verbs to CRUD operations over resources. It's stateless — each request carries all the context needed to process it. This makes REST servers trivially horizontally scalable.</p>
<div class="formula-box"><span class="v">GET</span>    /users/42         → fetch user 42<br><span class="v">POST</span>   /users            → create user<br><span class="v">PUT</span>    /users/42         → replace user 42<br><span class="v">PATCH</span>  /users/42         → partial update<br><span class="v">DELETE</span> /users/42         → remove user</div>
<p><strong>When REST wins:</strong> Public APIs, simple CRUD, when HTTP caching matters, when broad client compatibility is required.</p>
<p><strong>REST's weakness:</strong> Over-fetching (getting more fields than needed) and under-fetching (needing multiple round-trips to assemble a UI view).</p>

<h2>GraphQL: client-driven queries</h2>
<p>GraphQL is a query language for APIs where the client specifies exactly which fields it needs. One endpoint, one request, precise payload.</p>
<div class="formula-box">POST /graphql<br>{ user(id: 42) { name, email, posts { title } } }</div>
<p><strong>When GraphQL wins:</strong> Mobile-first products with heterogeneous screens; rapid frontend iteration; aggregating multiple microservices behind one gateway.</p>
<div class="info-box">
  <div class="info-box-title">The N+1 problem</div>
  <div class="info-box-body">Naïve GraphQL resolvers issue one DB query per child field. Requesting 100 users with their posts fires 101 queries. Solve with <strong>DataLoader</strong> (batch + cache resolver calls). Always mention this trade-off in interviews.</div>
</div>

<h2>gRPC: binary speed for internal services</h2>
<p>gRPC uses HTTP/2 for transport and Protocol Buffers for serialization. Payloads are ~3–10× smaller than equivalent JSON, and serialization is ~6× faster. It supports streaming RPCs natively.</p>
<table class="metrics-table">
  <tr><td>REST + JSON serialization</td><td>~100μs / 10KB payload</td></tr>
  <tr><td>gRPC + Protobuf</td><td class="hl">~15μs / 1.5KB payload</td></tr>
  <tr><td>Schema enforcement</td><td class="hl">Compile-time via .proto files</td></tr>
</table>
<p><strong>When gRPC wins:</strong> Service-to-service in microservices architectures; streaming (server/client/bidirectional); polyglot teams where strict contracts matter.</p>

<h2>Real-time protocols</h2>
<table class="metrics-table">
  <tr><td><strong>Long Polling</strong></td><td>Client holds connection open until server has data. Server responds, client immediately re-connects. High overhead at scale — avoid.</td></tr>
  <tr><td><strong>SSE</strong></td><td class="hl">HTTP/1.1 stream. One-way: server → client. Ideal for live feeds, dashboards, notifications. Uses standard HTTP — firewall friendly.</td></tr>
  <tr><td><strong>WebSocket</strong></td><td class="hl">Full-duplex over a single TCP connection. Use for: chat, multiplayer games, collaborative editing, live trading. Stateful — needs sticky sessions or pub/sub backend.</td></tr>
</table>

<h2>Status codes that matter in system design</h2>
<table class="metrics-table">
  <tr><td>200 OK</td><td>Standard success</td></tr>
  <tr><td>201 Created</td><td>Resource created (POST)</td></tr>
  <tr><td>204 No Content</td><td>Success, no body (DELETE)</td></tr>
  <tr><td>400 Bad Request</td><td>Client error — invalid input</td></tr>
  <tr><td>401 Unauthorized</td><td>Missing/invalid credentials</td></tr>
  <tr><td>403 Forbidden</td><td>Authenticated but not allowed</td></tr>
  <tr><td>404 Not Found</td><td>Resource doesn't exist</td></tr>
  <tr><td><strong>429 Too Many Requests</strong></td><td class="hl">Rate limit exceeded — include Retry-After header</td></tr>
  <tr><td>500 Internal Server Error</td><td>Server bug</td></tr>
  <tr><td><strong>503 Service Unavailable</strong></td><td class="hl">Overloaded or in maintenance — include Retry-After</td></tr>
</table>

<h2>Interview decision tree</h2>
<p>When asked how clients talk to your system, walk through this logic:</p>
<div class="formula-box">Real-time bidirectional? → <span class="v">WebSocket</span><br>Server push only (feed/notif)? → <span class="v">SSE</span><br>Mobile, varying data needs? → <span class="v">GraphQL</span><br>Internal high-throughput? → <span class="v">gRPC</span><br>Everything else? → <span class="v">REST</span></div>
`,
    },

    /* ── 3 ── Scaling Fundamentals ────────────────────────── */
    {
      id: 'scaling-fundamentals',
      title: 'Scaling Fundamentals',
      track: 'foundations',
      difficulty: 'beginner',
      readingMins: 12,
      keyPoints: [
        'Vertical scaling (bigger box) is fast and simple but has a hard ceiling and a single point of failure.',
        'Horizontal scaling (more boxes) requires stateless services — move session state to Redis, not in-memory.',
        'The Scale Cube: X-axis = clone, Y-axis = decompose by function, Z-axis = split by data range/key.',
        'The bottleneck shifts: 1 server → load balancer → database → cache miss → network. Follow the bottleneck.',
        'Rule of thumb: 1 mid-tier server handles ~1,000–5,000 RPS for typical web workloads.',
        'Stateless > stateful: stateless services can be replaced, added, or removed without coordination.',
      ],
      quiz: [
        {
          q: 'Your app works fine at 100 RPS but crashes at 10,000 RPS. You\'ve added more app servers behind a load balancer but the problem persists. Most likely culprit?',
          opts: [
            'You need a faster programming language',
            'The database is the bottleneck — app servers are stateless and scaled fine',
            'The load balancer is too slow',
            'Your DNS TTL is too short',
          ],
          answer: 1,
          explanation: 'When horizontal app scaling stops helping, the bottleneck has shifted to the database. Fix: add read replicas, caching, or shard the database.',
        },
        {
          q: 'What breaks when you scale app servers horizontally without addressing session state?',
          opts: [
            'Database connections fail',
            'Users get logged out or see stale data because session is stored in one server\'s memory',
            'CPU usage doubles',
            'TLS certificates expire faster',
          ],
          answer: 1,
          explanation: 'In-memory sessions are tied to one server. User hits server A → session created. Next request hits server B → no session → logged out. Fix: store sessions in Redis or use stateless JWTs.',
        },
        {
          q: 'Which scaling dimension does "splitting a monolith into separate User Service and Order Service" represent on the Scale Cube?',
          opts: ['X-axis (cloning)', 'Y-axis (functional decomposition)', 'Z-axis (data partitioning)', 'None of the above'],
          answer: 1,
          explanation: 'Y-axis scaling splits by function/service. X-axis is running multiple identical copies. Z-axis splits the data itself (e.g., users A-M on shard 1, N-Z on shard 2).',
        },
        {
          q: 'A startup is handling 500 RPS and expects 10× growth in 6 months. What\'s the most pragmatic scaling approach?',
          opts: [
            'Immediately shard the database into 16 shards',
            'Rewrite in a faster language',
            'Add caching layer + read replicas; keep the monolith until you hit the next bottleneck',
            'Move to serverless functions immediately',
          ],
          answer: 2,
          explanation: 'Premature optimization is the root of many engineering disasters. Cache + read replicas typically buys 5–20× capacity. Shard only when you\'ve exhausted those options.',
        },
      ],
      relatedSystems: ['url-shortener', 'rate-limiter'],
      content: `
<h2>Why scaling is the core interview topic</h2>
<p>System design interviews are fundamentally about scale. An interviewer who asks you to design Twitter isn't testing if you know what a database is — they're testing whether you can reason about the failure modes that appear when millions of users hit your system simultaneously.</p>
<p>Scaling thinking starts with one question: <strong>where is the bottleneck?</strong></p>

<h2>Vertical vs horizontal scaling</h2>
<table class="metrics-table">
  <tr><td><strong>Vertical (scale up)</strong></td><td>Bigger server: more CPU, RAM, faster disk</td></tr>
  <tr><td>Ceiling</td><td>~192 cores, ~24TB RAM today</td></tr>
  <tr><td>Cost curve</td><td>Superlinear — doubling resources costs 3–5× more</td></tr>
  <tr><td>Failure mode</td><td class="warn">Single point of failure — one machine, one crash</td></tr>
  <tr><td><strong>Horizontal (scale out)</strong></td><td>More servers, distribute the load</td></tr>
  <tr><td>Ceiling</td><td class="hl">Effectively infinite (add more machines)</td></tr>
  <tr><td>Requirement</td><td class="hl">Stateless services (session state external)</td></tr>
  <tr><td>Failure mode</td><td>Individual machines fail; system survives</td></tr>
</table>

<h2>The stateless requirement</h2>
<p>Horizontal scaling only works if servers don't hold local state that other servers need. A user's HTTP session stored in Server A's memory can't be read by Server B. Solutions:</p>
<div class="formula-box">Sessions → <span class="v">Redis</span> (shared, in-memory)<br>Auth state → <span class="v">JWTs</span> (signed token, no server state)<br>Files → <span class="v">S3 / Object store</span> (not local disk)</div>

<h2>The Scale Cube</h2>
<p>The AKF Scale Cube describes three independent dimensions of scaling:</p>
<table class="metrics-table">
  <tr><td><strong>X-axis: Clone</strong></td><td class="hl">Run N identical copies behind a load balancer. Easiest — horizontal scaling.</td></tr>
  <tr><td><strong>Y-axis: Decompose</strong></td><td class="hl">Split by function: User Service, Order Service, Payment Service. Each scales independently. This is microservices.</td></tr>
  <tr><td><strong>Z-axis: Shard</strong></td><td class="hl">Split the dataset: users A–M on shard 1, N–Z on shard 2. Each shard handles a subset of data.</td></tr>
</table>

<h2>The bottleneck cascade</h2>
<p>As you add capacity, the bottleneck doesn't disappear — it moves. Learn to follow it:</p>
<div class="formula-box">1 server → CPU-bound<br>Add app servers → <span class="v">DB becomes bottleneck</span><br>Add DB read replicas → <span class="v">Write bottleneck emerges</span><br>Add cache → <span class="v">Cache miss becomes hot path</span><br>Shard DB → <span class="v">Cross-shard queries hurt</span><br>Add queue → <span class="v">Consumer throughput limits</span></div>

<h2>Capacity rules of thumb</h2>
<table class="metrics-table">
  <tr><td>1 mid-tier app server</td><td class="hl">~1,000–5,000 RPS (simple reads)</td></tr>
  <tr><td>1 Postgres instance</td><td class="hl">~5,000–10,000 simple reads/s</td></tr>
  <tr><td>1 Redis instance</td><td class="hl">~100,000–500,000 ops/s</td></tr>
  <tr><td>Network throughput per server</td><td>~10 Gbps (1.25 GB/s) typical</td></tr>
</table>
<div class="info-box">
  <div class="info-box-title">Interview tip</div>
  <div class="info-box-body">When you calculate that your service needs 50,000 RPS, don't just say "add more servers." Tell the interviewer: <em>"At ~2,000 RPS per server, I need ~25 app servers. The database will become the bottleneck first, so I'd add a caching layer to offload 80% of reads."</em></div>
</div>

<h2>Auto-scaling and cloud-native patterns</h2>
<p>Modern systems use dynamic scaling — adding and removing servers based on observed load. Key insight for interviews: auto-scaling adds servers in 1–3 minutes. If you expect a sudden 10× spike (Black Friday, a viral tweet), you must pre-scale or use a queue to absorb the burst.</p>
`,
    },

    /* ── 4 ── Load Balancers ──────────────────────────────── */
    {
      id: 'load-balancers',
      title: 'Load Balancers',
      track: 'foundations',
      difficulty: 'beginner',
      readingMins: 10,
      keyPoints: [
        'L4 LB routes by IP/TCP — fast, low overhead, no HTTP awareness. Use for raw throughput.',
        'L7 LB routes by HTTP content (URL, headers, cookies) — enables A/B testing, path-based routing, SSL termination.',
        'Round-robin is fair but ignores server state; Least Connections routes to the least-busy server.',
        'Sticky sessions tie a user to a specific server — breaks horizontal scaling benefits; prefer Redis for session storage.',
        'Health checks (every 5–30s) detect dead servers; traffic is rerouted within 1–2 health-check intervals.',
        'The load balancer itself is a SPOF — run two in active-passive or active-active with a floating IP (keepalived).',
      ],
      quiz: [
        {
          q: 'Your service has 3 app servers: Server A at 80% CPU, B at 10%, C at 60%. Which algorithm routes the next request to B?',
          opts: ['Round-robin', 'Random', 'Least Connections', 'IP Hash'],
          answer: 2,
          explanation: 'Least Connections routes to the server with the fewest active connections — a proxy for available capacity. B has 10% CPU, so it likely has the fewest active requests.',
        },
        {
          q: 'You need to route /api/v1/* to a legacy microservice and /api/v2/* to a new service. Which load balancer type enables this?',
          opts: ['L4 (TCP)', 'L7 (HTTP)', 'DNS round-robin', 'Anycast routing'],
          answer: 1,
          explanation: 'L7 load balancers read HTTP request content (URL paths, headers, host names) and can route to different backend pools based on that content. L4 operates at the TCP level and has no HTTP awareness.',
        },
        {
          q: 'A user\'s checkout session is stored in the app server\'s memory. What happens when the load balancer routes their next request to a different server?',
          opts: [
            'The session transfers automatically',
            'Session is lost — user sees empty cart or gets logged out',
            'The database is queried to restore the session',
            'Nothing — sessions are stateless by definition',
          ],
          answer: 1,
          explanation: 'This is the sticky-session problem. The fix: store the session in a shared cache (Redis) instead of the server\'s local memory, making servers stateless and interchangeable.',
        },
        {
          q: 'You\'re designing a globally distributed service. What technique routes users to the geographically nearest data center?',
          opts: ['Round-robin DNS', 'Anycast + BGP routing', 'L7 load balancing by IP', 'Consistent hashing'],
          answer: 1,
          explanation: 'Anycast assigns the same IP to multiple servers worldwide. BGP routing automatically directs each user to the topologically nearest data center. CDNs and DNS providers like Cloudflare use anycast extensively.',
        },
      ],
      relatedSystems: ['rate-limiter', 'url-shortener'],
      content: `
<h2>What load balancers actually do</h2>
<p>A load balancer sits in front of a pool of servers and distributes incoming requests across them. Beyond distribution, modern L7 load balancers handle SSL termination, health checking, request routing, A/B testing, and rate limiting. They are the front door of every scaled system.</p>

<h2>L4 vs L7: choose your layer</h2>
<table class="metrics-table">
  <tr><td><strong>L4 (Transport Layer)</strong></td><td>Routes at TCP/UDP level. Sees IP + port only.</td></tr>
  <tr><td>Speed</td><td class="hl">Extremely fast — minimal processing</td></tr>
  <tr><td>Awareness</td><td>Cannot see HTTP headers, cookies, or URLs</td></tr>
  <tr><td>Use case</td><td>Raw TCP throughput, database proxies, game servers</td></tr>
  <tr><td><strong>L7 (Application Layer)</strong></td><td>Routes based on HTTP content</td></tr>
  <tr><td>Speed</td><td>Slightly slower — must parse HTTP</td></tr>
  <tr><td>Awareness</td><td class="hl">Sees URL path, Host header, cookies, content type</td></tr>
  <tr><td>Use case</td><td class="hl">Path-based routing, A/B testing, SSL offload, WAF</td></tr>
</table>
<p><strong>Examples:</strong> AWS NLB (L4), AWS ALB (L7), NGINX (L7), HAProxy (both).</p>

<h2>Balancing algorithms</h2>
<table class="metrics-table">
  <tr><td><strong>Round-robin</strong></td><td>Requests cycle sequentially: A → B → C → A → …</td></tr>
  <tr><td><strong>Weighted round-robin</strong></td><td class="hl">Heavier servers get proportionally more traffic</td></tr>
  <tr><td><strong>Least Connections</strong></td><td class="hl">Route to the server with fewest active connections. Best for variable request durations.</td></tr>
  <tr><td><strong>IP Hash</strong></td><td>Hash client IP → same server every time (sticky-like)</td></tr>
  <tr><td><strong>Consistent Hashing</strong></td><td class="hl">Add/remove servers with minimal request reassignment. Used in distributed caches.</td></tr>
</table>

<h2>Health checks</h2>
<p>The LB periodically pings each backend (typically <code>GET /health</code> every 5–30s). Three consecutive failures removes the server from the pool; recovery re-adds it. This means a crashed server takes up to 3× interval (15–90s) to be removed.</p>
<div class="info-box">
  <div class="info-box-title">Design implication</div>
  <div class="info-box-body">During a rolling deploy, old servers briefly serve alongside new ones. Ensure your API is backwards-compatible. If not, drain old servers before deploying (graceful shutdown).</div>
</div>

<h2>SSL termination</h2>
<p>L7 LBs decrypt HTTPS at the edge, then forward plain HTTP to backend servers. Benefits: backends don't need TLS certs; certificate management is centralised; LB can inspect and route based on request content.</p>

<h2>The load balancer itself as a SPOF</h2>
<p>If your single load balancer dies, everything dies. Solution: run two LBs in active-passive mode with a virtual/floating IP. Tools: AWS provides this automatically; on-prem use keepalived + VRRP.</p>
<div class="formula-box">Primary LB ←→ Heartbeat ←→ Secondary LB<br>      ↓                            ↓<br>   [Active]              [Standby — takes over on failure]</div>

<h2>Global load balancing</h2>
<p>At global scale, DNS-based load balancing (AWS Route 53 latency-based routing) or Anycast routing directs users to the nearest region. This is distinct from in-datacenter LBs — it operates at the DNS or IP routing layer.</p>
`,
    },

    /* ── 5 ── CAP Theorem ─────────────────────────────────── */
    {
      id: 'cap-theorem',
      title: 'CAP Theorem',
      track: 'foundations',
      difficulty: 'beginner',
      readingMins: 8,
      keyPoints: [
        'CAP says: pick Consistency or Availability during a network Partition — you can\'t have all three simultaneously.',
        'Network partitions WILL happen — so the real choice is CP vs AP.',
        'CP systems (HBase, ZooKeeper, Consul) reject requests rather than serve stale data.',
        'AP systems (Cassandra, DynamoDB, CouchDB) continue serving — potentially returning stale data.',
        'PACELC extends CAP: even without partitions, trade-offs exist between latency and consistency.',
        'Never claim you need a "CA" system in an interview — partitions are not optional in distributed systems.',
      ],
      quiz: [
        {
          q: 'During a network partition, an AP system will:',
          opts: [
            'Reject all requests until the partition heals',
            'Continue serving requests, potentially returning stale data',
            'Automatically replicate to a new primary',
            'Switch to synchronous replication',
          ],
          answer: 1,
          explanation: 'AP systems prioritise Availability — they continue to serve requests even when nodes can\'t communicate. This means some reads may return stale (old) data until consistency is restored after the partition heals.',
        },
        {
          q: 'Which database is classified as CP?',
          opts: ['Cassandra', 'DynamoDB', 'ZooKeeper', 'CouchDB'],
          answer: 2,
          explanation: 'ZooKeeper is CP: it uses the Zab consensus protocol and will reject reads/writes on minority partitions to maintain consistency. Cassandra and DynamoDB are AP (tunable consistency). CouchDB is AP.',
        },
        {
          q: 'PACELC extends CAP by adding what additional trade-off?',
          opts: [
            'Performance vs Availability Consistency Elasticity Latency Concurrency',
            'Even without partitions, latency and consistency are in tension',
            'Partition tolerance vs Availability is the only trade-off',
            'CAP only applies to SQL databases',
          ],
          answer: 1,
          explanation: 'PACELC says: during a Partition, choose Availability or Consistency (like CAP). Else (normal operation), choose Latency or Consistency. Low-latency writes usually mean async replication = eventual consistency.',
        },
        {
          q: 'A financial payment service processes money transfers. Which CAP property should never be sacrificed?',
          opts: ['Availability', 'Partition Tolerance', 'Consistency', 'All three can be sacrificed safely'],
          answer: 2,
          explanation: 'Money transfers require consistency — you cannot show different balances to different nodes (split-brain scenario). Banks use CP systems (or distributed transactions) and accept reduced availability during failures.',
        },
      ],
      relatedSystems: ['key-value-store'],
      content: `
<h2>The theorem in one sentence</h2>
<p>In a distributed system, you can guarantee at most two of: <strong>Consistency</strong>, <strong>Availability</strong>, and <strong>Partition Tolerance</strong>. Since network partitions cannot be prevented, the real choice is always between Consistency and Availability.</p>
<div class="formula-box">Consistency (C): Every read returns the most recent write<br>Availability (A): Every request gets a response (not an error)<br>Partition Tolerance (P): System continues during network partition<br><br><span class="v">P is not optional → choose C or A</span></div>

<h2>What a partition actually is</h2>
<p>A network partition is any communication failure between nodes — a dropped packet, a dead switch, a cloud AZ going dark. These happen in every distributed system, several times per year in production. Claiming you don't need partition tolerance means you're building a single-node system.</p>

<h2>CP systems: consistency over availability</h2>
<p>CP systems reject requests (return errors) on minority-partition nodes rather than serve potentially stale data. If a node can't communicate with a quorum, it says "I don't know" rather than guess.</p>
<table class="metrics-table">
  <tr><td><strong>Examples</strong></td><td>ZooKeeper, HBase, Consul, etcd, MongoDB (w/ majority writes)</td></tr>
  <tr><td><strong>Behaviour during partition</strong></td><td class="hl">Returns error on minority nodes; majority continues normally</td></tr>
  <tr><td><strong>Use cases</strong></td><td>Leader election, distributed locks, financial transactions, config management</td></tr>
</table>

<h2>AP systems: availability over consistency</h2>
<p>AP systems keep responding during partitions but may serve stale data on some nodes. After the partition heals, nodes reconcile and converge — this is eventual consistency.</p>
<table class="metrics-table">
  <tr><td><strong>Examples</strong></td><td>Cassandra, DynamoDB, CouchDB, DNS, most caches</td></tr>
  <tr><td><strong>Behaviour during partition</strong></td><td class="hl">Continues serving; conflicting writes resolved post-partition</td></tr>
  <tr><td><strong>Use cases</strong></td><td>Shopping carts, social feeds, DNS, user profiles, IoT data</td></tr>
</table>
<div class="info-box">
  <div class="info-box-title">Tunable consistency</div>
  <div class="info-box-body">Cassandra lets you tune per-request: <code>ONE</code>, <code>QUORUM</code>, <code>ALL</code>. With <code>QUORUM</code> reads + <code>QUORUM</code> writes on a 3-node cluster, you get consistent reads at the cost of one extra hop. This is the real-world nuance interviewers want to hear.</div>
</div>

<h2>PACELC: the full picture</h2>
<p>CAP only considers partitions. PACELC adds the partition-free case:</p>
<div class="formula-box">If Partition → choose A or C<br>Else (normal) → choose <span class="v">Latency</span> or <span class="v">Consistency</span></div>
<p>Synchronous replication = strong consistency, higher write latency. Async replication = lower write latency, eventual consistency. Most high-throughput systems choose latency (async) and accept eventual consistency.</p>

<h2>Interview application</h2>
<p>When designing any system, explicitly state your CAP choice and justify it:</p>
<table class="metrics-table">
  <tr><td>Bank transfers</td><td class="hl">CP — data loss is worse than downtime</td></tr>
  <tr><td>User profile reads</td><td class="hl">AP — showing a stale avatar is acceptable</td></tr>
  <tr><td>Distributed lock / leader election</td><td class="hl">CP — split-brain is catastrophic</td></tr>
  <tr><td>Shopping cart</td><td class="hl">AP — Amazon famously chose availability here</td></tr>
</table>
`,
    },

    /* ── 6 ── Consistency Models ──────────────────────────── */
    {
      id: 'consistency-models',
      title: 'Consistency Models',
      track: 'foundations',
      difficulty: 'intermediate',
      readingMins: 12,
      keyPoints: [
        'Strong consistency = linearizability: reads always reflect the latest acknowledged write.',
        'Eventual consistency: all replicas converge to the same value — given no new writes.',
        'Read-your-writes: after writing, your subsequent reads see that write. Critical for user-facing features.',
        'Monotonic reads: once you see a value, you never see an older version. Prevents "time travel" in feeds.',
        'Causal consistency: causally related operations appear in order. Unrelated ops may reorder.',
        'Most practical systems use session-level consistency guarantees (read-your-writes + monotonic reads) via client-affinity or session tokens.',
      ],
      quiz: [
        {
          q: 'A user posts a photo on Instagram, then immediately refreshes their feed and doesn\'t see it. Which consistency guarantee was violated?',
          opts: ['Strong consistency', 'Read-your-writes consistency', 'Monotonic reads', 'Causal consistency'],
          answer: 1,
          explanation: 'Read-your-writes (also called "read-my-writes") guarantees that after a user writes data, their subsequent reads see that write. Instagram\'s actual solution: route the user\'s reads to the replica that just accepted their write.',
        },
        {
          q: 'A user sees 150 likes on a post. On the next refresh, they see 140 likes. Which consistency model was violated?',
          opts: ['Read-your-writes', 'Monotonic reads', 'Causal consistency', 'Strong consistency'],
          answer: 1,
          explanation: 'Monotonic reads guarantee that once you see a value V, all subsequent reads return V or a newer value. Reading 150 then 140 is time-travel backwards — a monotonic reads violation.',
        },
        {
          q: 'Which consistency model is the strongest (hardest to implement)?',
          opts: ['Eventual consistency', 'Causal consistency', 'Linearizability (strong consistency)', 'Monotonic reads'],
          answer: 2,
          explanation: 'Linearizability guarantees that operations appear to execute atomically at a single point in real time. It requires coordination across replicas on every operation — extremely expensive at scale.',
        },
        {
          q: 'You\'re building a distributed counter for "number of views" on a video (YouTube-style). Which consistency model is appropriate?',
          opts: [
            'Linearizability — must be exact at all times',
            'Eventual consistency — approximate counts are fine; convergence happens in seconds',
            'Read-your-writes — each user must see their own view counted',
            'Causal consistency',
          ],
          answer: 1,
          explanation: 'YouTube shows approximate view counts (sometimes delayed by seconds or minutes). Eventual consistency is perfect here — it\'s highly scalable and the small staleness is acceptable.',
        },
      ],
      relatedSystems: ['key-value-store', 'notifications'],
      content: `
<h2>The consistency spectrum</h2>
<p>Consistency models define the rules about what value a read operation returns after one or more writes in a distributed system. The stronger the consistency, the higher the latency cost — you need more coordination between replicas.</p>
<div class="formula-box">Strongest: <span class="v">Linearizability</span><br>          ↓ Sequential Consistency<br>          ↓ Causal Consistency<br>          ↓ Read-your-writes / Monotonic reads<br>Weakest:  <span class="r">Eventual Consistency</span></div>

<h2>Linearizability (strong consistency)</h2>
<p>The gold standard. Every operation appears to take effect atomically at a single point in real time. If Write(x=5) completes at time T, any Read(x) at time T+ε returns 5 — across any node in the cluster.</p>
<table class="metrics-table">
  <tr><td>Requires</td><td>Coordination on every write (2-phase commit, Raft, Paxos)</td></tr>
  <tr><td>Cost</td><td class="warn">High latency, low throughput — 1 round trip per write to quorum</td></tr>
  <tr><td>Use when</td><td class="hl">Financial balances, distributed locks, leader election</td></tr>
  <tr><td>Examples</td><td>Google Spanner (TrueTime), etcd, ZooKeeper</td></tr>
</table>

<h2>Causal consistency</h2>
<p>Causally related operations appear in order on all nodes. If Write A causes Write B (e.g., user posts, then edits their post), all readers see A before B. Unrelated writes may appear in any order.</p>
<p>This is significantly cheaper than linearizability — nodes track causal dependencies (vector clocks or hybrid logical clocks) rather than a global wall-clock ordering.</p>

<h2>Session guarantees (most practical)</h2>
<p>Real production systems often guarantee just these two within a session:</p>
<table class="metrics-table">
  <tr><td><strong>Read-your-writes</strong></td><td class="hl">After you write, your reads see that write. Other users may not yet. Implemented by: routing your reads to the same replica that accepted your write, or using version tokens.</td></tr>
  <tr><td><strong>Monotonic reads</strong></td><td class="hl">Once you see value V, future reads return V or something newer. Prevents "time-traveling" backwards in your view.</td></tr>
</table>
<div class="info-box">
  <div class="info-box-title">Facebook's approach</div>
  <div class="info-box-body">When you post to Facebook, your read traffic is temporarily pinned to the master MySQL for ~20 seconds via a "read-my-writes" sticky cookie. After that, reads go to the cache/replica tier. This implements read-your-writes cheaply.</div>
</div>

<h2>Eventual consistency</h2>
<p>If no new writes are issued, all replicas will eventually converge to the same value. No guarantees on how long convergence takes (milliseconds in practice; seconds to minutes in failure scenarios).</p>
<table class="metrics-table">
  <tr><td>Throughput</td><td class="hl">Very high — writes don't block on replica sync</td></tr>
  <tr><td>Latency</td><td class="hl">Very low write latency</td></tr>
  <tr><td>Risk</td><td class="warn">Conflicting concurrent writes need resolution (last-write-wins, CRDTs, application-level merge)</td></tr>
  <tr><td>Good for</td><td>DNS, social feeds, product views, shopping carts, IoT telemetry</td></tr>
</table>

<h2>Conflict resolution strategies</h2>
<p>When two concurrent writes conflict in an eventually-consistent system:</p>
<table class="metrics-table">
  <tr><td><strong>Last-Write-Wins (LWW)</strong></td><td>Higher timestamp wins. Simple, lossy. Cassandra default.</td></tr>
  <tr><td><strong>Multi-Value (MV)</strong></td><td>Store both values; let application resolve. DynamoDB model.</td></tr>
  <tr><td><strong>CRDTs</strong></td><td class="hl">Conflict-free Replicated Data Types — mathematically guaranteed to merge without conflicts. Counters, sets, ordered lists. Used in Riak, Redis CRDB.</td></tr>
</table>

<h2>Choosing the right model</h2>
<div class="formula-box">Money / Locks / Config → <span class="v">Linearizability</span><br>Social posts / Comments → <span class="v">Causal consistency</span><br>User-facing writes → <span class="v">Read-your-writes</span><br>Metrics / Counters / Feeds → <span class="r">Eventual consistency</span></div>
`,
    },

    /* ── 7 ── Replication Strategies ──────────────────────── */
    {
      id: 'replication',
      title: 'Replication Strategies',
      track: 'foundations',
      difficulty: 'intermediate',
      readingMins: 10,
      keyPoints: [
        'Single-leader: one node accepts all writes, replicas get a copy. Simple, widely used (MySQL, Postgres).',
        'Multi-leader: multiple nodes accept writes. Useful for multi-region active-active. Hard to implement correctly — conflicts must be resolved.',
        'Leaderless (Dynamo-style): clients write to W nodes and read from R nodes; consistency with W+R>N (quorum).',
        'Synchronous replication = zero data loss, but write latency includes the replica round-trip.',
        'Async replication = low latency, but failover may lose the last N seconds of writes.',
        'Replication lag is real — design your reads to handle it (read-from-primary for fresh data, or accept staleness).',
      ],
      quiz: [
        {
          q: 'With N=3 replicas, W=2 (write quorum), R=2 (read quorum) in Dynamo-style replication, how many node failures can you tolerate while maintaining consistency?',
          opts: ['0', '1', '2', '3'],
          answer: 1,
          explanation: 'W+R=4 > N=3, so quorums overlap by 1 node — reads always see the latest write. With 1 node failed (2 remaining), you can still satisfy W=2 and R=2. With 2 failed you cannot reach quorum.',
        },
        {
          q: 'Your primary database is in US-East and a replica is in EU-West (100ms RTT). You use synchronous replication. What\'s the minimum write latency for a user in US-East?',
          opts: ['<1ms (local only)', '~50ms', '~200ms (100ms × 2 for the round-trip to EU)', '~1s'],
          answer: 2,
          explanation: 'Synchronous replication waits for the replica to acknowledge. The primary must send the write to EU-West (100ms) and receive the ACK back (100ms) = ~200ms minimum write latency before confirming to the client.',
        },
        {
          q: 'Which replication topology is most susceptible to write conflicts?',
          opts: ['Single-leader', 'Multi-leader', 'Leaderless with quorum', 'Async single-leader'],
          answer: 1,
          explanation: 'Multi-leader allows concurrent writes to different leaders. If the same record is written to two leaders simultaneously, there\'s a conflict that must be resolved. Single-leader serialises all writes through one node, preventing this.',
        },
        {
          q: 'A read replica is 3 seconds behind the primary (replication lag). A user updates their email and immediately reads their profile. What might they see?',
          opts: [
            'Always the new email — replicas are consistent',
            'The old email — the replica hasn\'t received the write yet',
            'An error — the replica refuses stale reads',
            'A random value',
          ],
          answer: 1,
          explanation: 'Async replication lag means the replica may not have the latest write. The user sees their old email — a read-your-writes violation. Fix: route the user\'s read to the primary (or the same replica that got the write) for a brief window after writes.',
        },
      ],
      relatedSystems: ['key-value-store'],
      content: `
<h2>Why replication exists</h2>
<p>Replication keeps copies of your data on multiple nodes. The goals: <strong>durability</strong> (survive a disk failure), <strong>availability</strong> (serve reads when the primary is down), and <strong>read scalability</strong> (distribute read load across replicas).</p>

<h2>Single-leader replication</h2>
<p>One designated leader accepts all writes. Changes flow to followers asynchronously (or synchronously). Reads can go to followers for scale.</p>
<div class="formula-box">Client → <span class="v">Leader</span> (writes)<br>Leader → Follower 1, Follower 2, … (replication stream)<br>Client → <span class="v">Follower</span> (reads)</div>
<table class="metrics-table">
  <tr><td>Write conflicts</td><td class="hl">None — single write path</td></tr>
  <tr><td>Read scalability</td><td class="hl">High — add followers to spread read load</td></tr>
  <tr><td>Write scalability</td><td class="warn">Limited by single leader throughput</td></tr>
  <tr><td>Failover</td><td>Promote a follower; requires leader election</td></tr>
  <tr><td>Examples</td><td>MySQL, PostgreSQL, MongoDB (replica sets)</td></tr>
</table>

<h2>Sync vs async replication</h2>
<table class="metrics-table">
  <tr><td><strong>Synchronous</strong></td><td>Leader waits for follower ACK before confirming write to client</td></tr>
  <tr><td>Data loss on failover</td><td class="hl">Zero — follower is always up-to-date</td></tr>
  <tr><td>Write latency</td><td class="warn">Increased by follower RTT (can be 100ms+ for geo-distributed)</td></tr>
  <tr><td><strong>Asynchronous</strong></td><td>Leader confirms write immediately; replication happens in background</td></tr>
  <tr><td>Data loss on failover</td><td class="warn">Up to replication lag (seconds of writes)</td></tr>
  <tr><td>Write latency</td><td class="hl">Low — no waiting for follower</td></tr>
</table>
<p>Most production systems use semi-synchronous: sync to 1 follower, async to the rest. This gives durability (1 sync copy) without the latency of waiting for all followers.</p>

<h2>Multi-leader replication</h2>
<p>Multiple nodes accept writes. Changes replicate between all leaders. Required for active-active multi-region setups — you want writes to land at the nearest datacenter, not cross an ocean for every write.</p>
<div class="info-box">
  <div class="info-box-title">The conflict problem</div>
  <div class="info-box-body">User A in US and User B in EU both update the same record simultaneously. Two conflicting writes land at two different leaders. The system must detect and resolve the conflict. Strategies: last-write-wins (lossy), application-level merge, CRDTs. CouchDB and AWS DynamoDB Global Tables use multi-leader.</div>
</div>

<h2>Leaderless replication (Dynamo-style)</h2>
<p>No leader — clients write to any node (or all nodes). Consistency controlled by quorum: write to W nodes, read from R nodes. If W + R > N, at least one node in every read-set overlaps the write-set.</p>
<div class="formula-box">N = total replicas<br>W = write quorum (nodes that must ACK)<br>R = read quorum (nodes to read from)<br><br><span class="v">W + R > N</span> → consistent reads<br><br>Common: N=3, W=2, R=2 → tolerate 1 failure</div>
<table class="metrics-table">
  <tr><td>Write conflicts</td><td class="warn">Possible — versioning + last-write-wins or merge</td></tr>
  <tr><td>Availability</td><td class="hl">Very high — no leader election needed</td></tr>
  <tr><td>Tunable consistency</td><td class="hl">Adjust W and R per request (Cassandra, Riak)</td></tr>
  <tr><td>Examples</td><td>Amazon Dynamo, Cassandra, Riak, Voldemort</td></tr>
</table>

<h2>Replication lag and its consequences</h2>
<p>Async replication means followers can be seconds behind the leader. This causes:</p>
<table class="metrics-table">
  <tr><td>Read-your-writes violation</td><td>User writes, immediately reads replica → sees old data</td></tr>
  <tr><td>Monotonic reads violation</td><td>Different replicas at different offsets → time-travel reads</td></tr>
  <tr><td>Inconsistent secondary indexes</td><td>DB writes replicate; index updates lag → index miss</td></tr>
</table>
<p><strong>Design pattern:</strong> For the first N seconds after a user write, route their reads to the primary. Route all other reads to replicas. Many frameworks (Rails, Django) support this via sticky reads.</p>
`,
    },
  ];
})();
