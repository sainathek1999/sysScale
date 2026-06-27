/* ============================================================
   modules-interview.js — 5 Interview-track modules, full content
   ============================================================ */
(function () {
  window.SS = window.SS || {};
  window.SS.MODULES = window.SS.MODULES || {};

  window.SS.MODULES['interview'] = [

    /* ── 1 ── The 5-Step Framework ───────────────────────────── */
    {
      id: 'interview-framework',
      title: 'The 5-Step Framework',
      track: 'interview',
      difficulty: 'beginner',
      readingMins: 8,
      keyPoints: [
        'Spend exactly 5 minutes clarifying requirements before drawing a single box — interviewers penalize candidates who design the wrong thing correctly.',
        'State your assumptions out loud as you make them; an interviewer who hears your reasoning can correct a wrong assumption early instead of watching you go down a dead end.',
        'Capacity estimation is not about accuracy — it is about demonstrating that you know which numbers matter and can sanity-check your architecture choices.',
        'Draw the high-level design first (boxes and arrows only), then ask "which component should we deep-dive?" before going deeper on your own.',
        'Name the tradeoff when you make every design decision: "I am choosing consistency over availability here because the use case is financial transactions."',
        'Reserve the last 5 minutes to summarize what you built, what you would do next, and one thing you deliberately left out.',
      ],
      quiz: [
        {
          q: 'An interviewer asks you to "design YouTube." What is the first thing you should do?',
          opts: [
            'Draw the architecture diagram immediately to show initiative',
            'Ask clarifying questions: what scale, which features, read vs write ratio?',
            'Start capacity estimation with daily active users',
            'Propose using microservices vs monolith',
          ],
          answer: 1,
          explanation: '"Design YouTube" is deliberately vague. Jumping straight to a solution is the most common mistake. Spend the first 5 minutes asking about scale (millions vs billions of users?), scope (upload only or recommendations too?), and any non-functional requirements like latency or durability. This shapes every downstream decision.',
        },
        {
          q: 'You are 20 minutes into a 45-minute interview and the interviewer has not steered you anywhere. What should you do?',
          opts: [
            'Continue your current deep-dive until time is up',
            'Ask "Should I go deeper here, or would you like to move on to another component?"',
            'Jump to the database schema without prompting',
            'Start listing all possible edge cases',
          ],
          answer: 1,
          explanation: 'Interviewers often let candidates self-direct to see how they manage time. Explicitly asking for guidance shows self-awareness and respects the interviewer\'s agenda. It also surfaces what they actually want to evaluate, which may be different from what you have been focusing on.',
        },
        {
          q: 'What is the main purpose of the capacity estimation step?',
          opts: [
            'To prove you can do arithmetic quickly',
            'To pick exact hardware specifications for production',
            'To constrain the design space and reveal which components need scaling strategies',
            'To impress the interviewer with large numbers',
          ],
          answer: 2,
          explanation: 'Capacity estimation tells you whether you need caching, sharding, or a CDN — before you draw any boxes. If reads are 1000x writes, the architecture looks completely different than a balanced workload. The numbers do not need to be exact; the order of magnitude matters.',
        },
        {
          q: 'When should you mention monitoring and alerting in a system design interview?',
          opts: [
            'Only if the interviewer specifically asks about it',
            'Never — it is outside the scope of system design',
            'Proactively, when summarizing the design — treat it as a first-class component',
            'Only after fully designing every other component',
          ],
          answer: 2,
          explanation: 'Senior engineers at Google, Meta, and Amazon treat observability as non-negotiable. Mentioning metrics, tracing, and alerting proactively signals production maturity. Even one sentence — "I would instrument this service with latency histograms and error-rate alerts" — differentiates you from candidates who treat monitoring as an afterthought.',
        },
      ],
      relatedSystems: ['url-shortener', 'rate-limiter'],
      content: `
<h2>Why a framework beats winging it</h2>
<p>System design interviews reward structured thinking over domain knowledge. An interviewer would rather see a candidate who methodically works through an unfamiliar problem than one who happens to have designed that exact system before. The 5-step framework gives you a repeatable skeleton that works for any problem — from a URL shortener to a distributed file system.</p>

<h2>The 5 steps and their time budgets</h2>
<table class="metrics-table">
  <tr><td>Step 1 — Clarify requirements</td><td class="hl">0–5 min</td></tr>
  <tr><td>Step 2 — Capacity estimation</td><td class="hl">5–10 min</td></tr>
  <tr><td>Step 3 — High-level design</td><td class="hl">10–20 min</td></tr>
  <tr><td>Step 4 — Deep dive</td><td class="hl">20–35 min</td></tr>
  <tr><td>Step 5 — Summarize tradeoffs</td><td class="hl">35–40 min</td></tr>
</table>

<h2>Step 1: Clarify requirements (5 minutes)</h2>
<p>Do not start designing. Ask questions. The problem statement is always underspecified by design — the interviewer wants to see that you notice ambiguity. Aim for four categories of questions:</p>
<div class="info-box">
  <div class="info-box-title">What to ask in every interview</div>
  <div class="info-box-body"><strong>Users:</strong> Who uses this? Internal teams, consumers, third-party developers?<br><strong>Scale:</strong> How many DAU? What is the expected peak QPS?<br><strong>Features:</strong> Which features are in scope for today? What can we ignore?<br><strong>Non-functional:</strong> Is consistency or availability more important? What is the latency target?</div>
</div>
<p>Say out loud: <em>"I am going to assume 100 million DAU and a read-heavy workload — roughly 10:1 reads to writes. Does that sound right?"</em> This forces alignment before you invest time in a direction.</p>

<h2>Step 2: Capacity estimation (5 minutes)</h2>
<p>Back-of-the-envelope math reveals which components will be under stress. You are looking for the order of magnitude, not an exact answer.</p>
<div class="formula-box">RPS = <span class="v">DAU</span> × <span class="v">events/user/day</span> ÷ <span class="v">86,400 s/day</span></div>
<p>Common pitfall: skipping estimation because "it feels like a waste of time." Estimation tells you whether you need one database or ten, one region or four. It is the foundation every downstream decision rests on.</p>

<h2>Step 3: High-level design (10 minutes)</h2>
<p>Draw boxes and arrows only — no implementation details yet. A canonical starting point: client, load balancer, app servers, cache, database, and any async queues. Name the components but keep descriptions to one sentence each. Once you have the skeleton, say: <em>"I will pause here and check — does this direction look right before I go deeper?"</em></p>

<h2>Step 4: Deep dive (15 minutes)</h2>
<p>Ask the interviewer which component to focus on, or pick the hardest one yourself if they defer. Common deep-dive targets are the database schema, the caching strategy, the write path under load, or the failure recovery mechanism. This is where senior candidates earn their offers — by reasoning about edge cases, failure modes, and scaling inflection points.</p>

<h2>Step 5: Summarize tradeoffs (5 minutes)</h2>
<p>Do not just recap what you drew. Name every tradeoff you made: <em>"I chose eventual consistency on the user profile cache, which means a user might see stale data for up to 60 seconds after an update — acceptable for this use case."</em> Then mention what you would do next if you had more time: sharding strategy, geo-replication, or a more sophisticated rate-limiting approach.</p>

<div class="info-box">
  <div class="info-box-title">Common mistake at each step</div>
  <div class="info-box-body">
    Step 1: Asking too few questions or accepting "just design Twitter" at face value.<br>
    Step 2: Skipping estimation entirely — this is a red flag at senior levels.<br>
    Step 3: Going too deep too fast; losing the interviewer in implementation details.<br>
    Step 4: Solving problems the interviewer did not prioritize; ignoring hints.<br>
    Step 5: Running out of time and never summarizing — the last impression matters.
  </div>
</div>
`,
    },

    /* ── 2 ── Numbers to Know ────────────────────────────────── */
    {
      id: 'numbers-to-know',
      title: 'Numbers Every Engineer Must Know',
      track: 'interview',
      difficulty: 'beginner',
      readingMins: 7,
      keyPoints: [
        'L1 cache is ~100x faster than RAM; RAM is ~1000x faster than SSD — always know which storage tier your hot data lives in.',
        'A single MySQL instance handles roughly 1,000–5,000 writes/second; Redis can handle 100,000+ ops/second — cache when reads dominate.',
        'There are 86,400 seconds in a day, ~2.5 million in a month, and ~31.5 million in a year — memorize these for traffic math.',
        'Peak traffic is typically 2–10x average — always design for peak, not average, when sizing caches and connection pools.',
        'A single Kafka partition can sustain ~100 MB/s write throughput; for fan-out workloads, partition count is your primary scaling lever.',
        'Network RTT within a data center is ~0.5 ms; cross-region (US East to EU) is ~80 ms — this gap drives every replication and caching decision.',
      ],
      quiz: [
        {
          q: 'A service receives 50 million DAU, each user performing 5 reads per day. What is the average read RPS?',
          opts: [
            'About 290 RPS',
            'About 2,900 RPS',
            'About 29,000 RPS',
            'About 290,000 RPS',
          ],
          answer: 1,
          explanation: '50M × 5 = 250M reads/day. 250M ÷ 86,400 ≈ 2,894 RPS. Always divide by 86,400 to convert daily counts to per-second rates. At this scale a single well-tuned app server handles it, but you would add a cache layer to protect the database from the read amplification.',
        },
        {
          q: 'You need to store 1 billion user records, each averaging 1 KB. How much storage is required?',
          opts: [
            '1 GB',
            '100 GB',
            '1 TB',
            '10 TB',
          ],
          answer: 2,
          explanation: '1 billion × 1 KB = 1 terabyte. Knowing storage arithmetic instantly tells you whether a single-node Postgres instance is viable (a few TB is fine) or whether you need distributed storage like Cassandra or a sharded MySQL setup. Always add a 3x replication factor — so plan for 3 TB of raw storage.',
        },
        {
          q: 'Which latency number is most important to know when choosing between in-process cache vs Redis?',
          opts: [
            'L1 cache latency (~1 ns)',
            'RAM access latency (~100 ns) vs network hop to Redis (~500 µs)',
            'SSD random read latency (~100 µs)',
            'DNS resolution latency (~20 ms)',
          ],
          answer: 1,
          explanation: 'An in-process cache (e.g. a Java HashMap) reads from RAM in nanoseconds. A Redis call requires a network round trip to a remote server — typically 0.5 ms on a LAN. For hot data accessed thousands of times per request, that 5,000x difference means in-process cache is always faster. Use Redis when you need shared state across many app server instances.',
        },
        {
          q: 'Your service averages 10,000 RPS. The PM says traffic spikes 5x during a major product launch. What should you size your system for?',
          opts: [
            '10,000 RPS — just scale up reactively during the launch',
            '15,000 RPS — 50% headroom is enough',
            '50,000 RPS — design for the 5x peak',
            '100,000 RPS — always add another 2x safety buffer on top of the peak',
          ],
          answer: 2,
          explanation: 'Always design and load-test at peak traffic, not average. Auto-scaling helps but has a spin-up lag (1–3 minutes for new EC2 instances). Pre-scaling before a known event is standard practice at Amazon and Meta. The 2x safety buffer (option D) would be appropriate if the peak multiplier were uncertain, but here you have a concrete 5x number.',
        },
      ],
      relatedSystems: ['distributed-cache', 'url-shortener'],
      content: `
<h2>Why numbers matter in interviews</h2>
<p>System design interviews are not trivia contests about exact specifications. But candidates who internalize orders of magnitude reason faster, catch their own mistakes, and appear credible to interviewers who actually build these systems. Think of these numbers as unit conversions — once memorized, they become automatic.</p>

<h2>Latency numbers (the hierarchy of storage)</h2>
<table class="metrics-table">
  <tr><td>L1 cache reference</td><td class="hl">~1 ns</td></tr>
  <tr><td>L2 cache reference</td><td class="hl">~4 ns</td></tr>
  <tr><td>RAM access</td><td class="hl">~100 ns</td></tr>
  <tr><td>SSD random read</td><td class="hl">~100 µs (100,000 ns)</td></tr>
  <tr><td>HDD random seek</td><td class="hl">~10 ms (10,000,000 ns)</td></tr>
  <tr><td>Intra-datacenter network round trip</td><td class="hl">~0.5 ms</td></tr>
  <tr><td>Cross-continental network round trip</td><td class="hl">~80–150 ms</td></tr>
</table>
<p>The key insight: RAM is 1,000x faster than SSD, which is 100x faster than HDD. Every caching layer in a well-designed system exists to serve reads from a faster tier instead of the slower one beneath it.</p>

<h2>Throughput benchmarks (single node)</h2>
<table class="metrics-table">
  <tr><td>Redis (reads)</td><td class="hl">~100,000 ops/s</td></tr>
  <tr><td>Redis (writes)</td><td class="hl">~80,000 ops/s</td></tr>
  <tr><td>MySQL (writes, indexed)</td><td class="hl">~1,000–5,000 writes/s</td></tr>
  <tr><td>Kafka (per partition write)</td><td class="hl">~100 MB/s</td></tr>
  <tr><td>Nginx (HTTP requests)</td><td class="hl">~50,000 req/s</td></tr>
</table>

<h2>Time constants</h2>
<div class="formula-box">
  1 day = <span class="v">86,400</span> seconds &nbsp;|&nbsp;
  1 month ≈ <span class="v">2.5 million</span> seconds &nbsp;|&nbsp;
  1 year ≈ <span class="v">31.5 million</span> seconds
</div>

<h2>Traffic math: the one formula you always use</h2>
<div class="formula-box">
  Average RPS = <span class="v">DAU</span> × <span class="v">events/user/day</span> ÷ <span class="v">86,400</span>
</div>
<p>Example: Twitter-scale — 200M DAU × 10 reads/user/day ÷ 86,400 ≈ 23,000 RPS average. Apply a peak multiplier of 3x to get the sizing target: ~70,000 RPS at peak.</p>

<h2>Storage constants</h2>
<table class="metrics-table">
  <tr><td>Average tweet / short text record</td><td class="hl">~280 bytes</td></tr>
  <tr><td>Average user metadata record</td><td class="hl">~1 KB</td></tr>
  <tr><td>Compressed photo (JPEG)</td><td class="hl">~300 KB</td></tr>
  <tr><td>1-minute video (720p, compressed)</td><td class="hl">~50 MB</td></tr>
  <tr><td>1 billion rows × 1 KB</td><td class="hl">= 1 TB</td></tr>
</table>

<h2>Peak multipliers</h2>
<div class="info-box">
  <div class="info-box-title">Design for peak, not average</div>
  <div class="info-box-body">Consumer apps typically see 2–3x peak/average. Live events (Super Bowl, product launches) spike 5–10x. Always state your multiplier explicitly: "I am sizing for 5x average, giving us approximately 115,000 RPS, which I will round to 100,000 for clean math." Rounding to clean numbers is expected and encouraged — it shows you know estimation is about magnitude, not precision.</div>
</div>
`,
    },

    /* ── 3 ── Common Mistakes ────────────────────────────────── */
    {
      id: 'common-mistakes',
      title: 'Top 10 System Design Mistakes',
      track: 'interview',
      difficulty: 'beginner',
      readingMins: 9,
      keyPoints: [
        'Jumping to a solution before clarifying requirements is the single most common disqualifying mistake — it signals you build without understanding.',
        'Ignoring failure modes is a senior-level red flag; any component you draw can crash, and interviewers expect you to address that.',
        'A single-point of failure in your design (one DB, one broker, no replication) shows you have not thought about production realities.',
        'Over-engineering at the start (microservices, event sourcing, CQRS for a toy scale) wastes interview time and obscures your reasoning.',
        'Not explaining your decisions out loud is career-limiting — the interviewer cannot give you credit for thoughts they cannot hear.',
        'Ignoring CAP theorem when choosing a database tells an interviewer you may not understand the fundamental constraint of distributed systems.',
      ],
      quiz: [
        {
          q: 'A candidate draws a beautiful architecture but uses a single MySQL instance with no replication. What is the most important problem?',
          opts: [
            'MySQL is the wrong database choice',
            'There is a single point of failure — any DB crash takes down the entire system',
            'The schema was not shown',
            'The candidate should have used NoSQL',
          ],
          answer: 1,
          explanation: 'A single database instance with no replication or failover is a single point of failure — one hardware failure or network partition takes the entire product offline. The fix is a primary-replica setup with automatic failover, or a managed service like Amazon RDS Multi-AZ. The database choice (MySQL vs NoSQL) is secondary to the availability gap.',
        },
        {
          q: 'A candidate spends 30 minutes designing a microservices mesh with service discovery, circuit breakers, and distributed tracing for a URL shortener handling 100 RPS. What went wrong?',
          opts: [
            'They chose the wrong tracing library',
            'They over-engineered for the scale — 100 RPS fits comfortably on a monolith with one database',
            'Microservices are always wrong for URL shorteners',
            'They forgot to mention load balancing',
          ],
          answer: 1,
          explanation: 'Over-engineering is a maturity signal going the wrong direction. A URL shortener at 100 RPS needs one app server and one database — full stop. Microservices introduce operational overhead (service discovery, distributed tracing, network hops) that is only justified at scale. Always match your architecture to the stated requirements, and mention that you would evolve the design as load grows.',
        },
        {
          q: 'During a design discussion, you realize your proposed solution has a race condition in the write path. What should you do?',
          opts: [
            'Hope the interviewer does not notice and continue',
            'Immediately pivot to a different problem area',
            'Call it out explicitly and explain how you would fix it — e.g., optimistic locking or a database transaction',
            'Say the race condition is rare enough to ignore',
          ],
          answer: 2,
          explanation: 'Calling out your own issues before the interviewer does is a strong positive signal. It shows you think about correctness and edge cases. Interviewers at top companies explicitly look for candidates who can identify their own design flaws and reason about mitigations. Hiding problems or hoping they go unnoticed often results in a no-hire decision.',
        },
        {
          q: 'You are designing a social media feed and choose Cassandra for its write throughput. The interviewer asks why not use PostgreSQL. What is the best answer?',
          opts: [
            'Cassandra is just better for everything',
            'PostgreSQL cannot handle any write load',
            'Cassandra trades strong consistency for high write throughput and horizontal scalability — acceptable for a feed where eventual consistency is fine, but PostgreSQL would be my choice if we needed relational joins or strong consistency',
            'I prefer Cassandra because it is more modern',
          ],
          answer: 2,
          explanation: 'Every database choice is a tradeoff, not a winner. Cassandra offers AP guarantees (available and partition-tolerant) at the cost of consistency. Explaining the CAP tradeoff you are making, and when you would make the opposite choice, shows mastery. Interviewers are testing your reasoning, not your brand loyalty.',
        },
      ],
      relatedSystems: ['url-shortener', 'rate-limiter'],
      content: `
<h2>Why candidates fail system design interviews</h2>
<p>Most failures are not about technical ignorance — they are about communication, structure, and maturity anti-patterns that experienced engineers have learned to avoid. The good news: every mistake on this list is fixable before your next interview.</p>

<h2>The 10 most common mistakes</h2>

<table class="metrics-table">
  <tr><td class="warn">1. Jumping to a solution</td><td class="hl">No req. gathering</td></tr>
  <tr><td class="warn">2. Skipping capacity estimation</td><td class="hl">Blind sizing</td></tr>
  <tr><td class="warn">3. Ignoring failure modes</td><td class="hl">No resilience thinking</td></tr>
  <tr><td class="warn">4. Single point of failure</td><td class="hl">Zero fault tolerance</td></tr>
  <tr><td class="warn">5. No observability mention</td><td class="hl">Not production-aware</td></tr>
  <tr><td class="warn">6. Not clarifying requirements</td><td class="hl">Designing the wrong thing</td></tr>
  <tr><td class="warn">7. Over-engineering</td><td class="hl">Complexity mismatch</td></tr>
  <tr><td class="warn">8. Ignoring CAP trade-offs</td><td class="hl">No distributed systems depth</td></tr>
  <tr><td class="warn">9. Silent problem-solving</td><td class="hl">Interviewer cannot evaluate</td></tr>
  <tr><td class="warn">10. Not asking for feedback</td><td class="hl">Missed course-correction</td></tr>
</table>

<h2>Mistake 1: Jumping to a solution</h2>
<p>Saying "I would use microservices and Kafka" within 60 seconds of hearing the problem is a red flag. Interviewers at Google and Meta literally write this down as a negative signal. Spend the first 5 minutes asking questions. You cannot design the right system until you know what scale, what consistency model, and which features are in scope.</p>

<h2>Mistake 3: Ignoring failure modes</h2>
<p>Every component you draw can fail. The database crashes. The cache becomes inconsistent. The message queue backs up. Strong candidates proactively ask: "What happens when this component goes down?" Weak candidates never bring it up. For every critical component, state your redundancy strategy: read replicas, multi-AZ deployments, or a dead-letter queue for failed messages.</p>

<h2>Mistake 7: Over-engineering</h2>
<div class="info-box">
  <div class="info-box-title">Match your architecture to the stated scale</div>
  <div class="info-box-body">A URL shortener at 1,000 RPS does not need Kafka, Kubernetes, or a service mesh. A single Go or Python app server with a PostgreSQL primary and one read replica handles this comfortably. Over-engineering wastes interview time and signals that you reach for complexity instead of simplicity. Start simple and say: "I would evolve this to microservices if write throughput exceeded 50,000 RPS and team size crossed 20 engineers."</div>
</div>

<h2>Mistake 8: Ignoring CAP trade-offs</h2>
<p>When you choose a database, you are implicitly choosing a point on the CAP triangle. Cassandra and DynamoDB choose availability and partition tolerance, accepting eventual consistency. HBase and Zookeeper choose consistency and partition tolerance. PostgreSQL in single-node mode is CA (no partition tolerance). Name the trade-off out loud every time you name a storage technology.</p>

<h2>Mistake 9: Silent problem-solving</h2>
<p>This is the hardest mistake to fix because it feels natural to think quietly. But the interviewer can only evaluate what they hear. If you are choosing between Redis and Memcached, say why out loud. If you are estimating 50,000 RPS, show the math. Silence is a void the interviewer fills with uncertainty about whether you actually know what you are doing.</p>

<div class="formula-box">Think out loud → Interviewer hears your reasoning → <span class="v">Credit awarded</span></div>

<h2>Mistake 10: Never asking for feedback</h2>
<p>At the 30-minute mark, pause and ask: <em>"Does this direction make sense to you, or is there an aspect you would like to focus on?"</em> This is not weakness — it is collaborative engineering. You invite course-correction before you spend 10 more minutes going the wrong direction, and it mirrors how real design reviews work.</p>
`,
    },

    /* ── 4 ── Advanced Talking Points ───────────────────────── */
    {
      id: 'advanced-talking-points',
      title: 'Advanced Talking Points That Win Offers',
      track: 'interview',
      difficulty: 'advanced',
      readingMins: 10,
      keyPoints: [
        'Active-active multi-region deployments avoid single-region failure but require conflict resolution strategies — knowing the difference between active-active and active-passive separates senior candidates.',
        'Blue-green and canary deployments are the industry standard for zero-downtime releases; being able to describe the rollback mechanism shows production experience.',
        'The three pillars of observability — metrics, distributed traces, and structured logs — should be mentioned together, not just "logging."',
        'SLI (what you measure), SLO (your target), SLA (contractual commitment) is the vocabulary Google SRE invented and every interview panel expects you to know.',
        'Graceful degradation means the system partially degrades under failure rather than failing completely — always identify what your system\'s degraded mode looks like.',
        'Data migration strategy (dual-write, backfill, shadow reads, cutover) is one of the hardest operational problems and a powerful topic to raise proactively.',
      ],
      quiz: [
        {
          q: 'What is the key operational difference between active-active and active-passive multi-region deployments?',
          opts: [
            'Active-active has two databases; active-passive has one',
            'In active-active all regions serve traffic simultaneously and require conflict resolution; in active-passive the secondary only serves traffic on failover',
            'Active-passive is always faster',
            'Active-active only works with NoSQL databases',
          ],
          answer: 1,
          explanation: 'Active-active means both regions process writes concurrently, which reduces latency for global users but requires a conflict resolution strategy when the same record is written in two regions at once (e.g., last-write-wins or vector clocks). Active-passive is simpler — the secondary is hot-standby only — but users on the passive side get higher latency. Knowing this tradeoff is a staff-level signal.',
        },
        {
          q: 'A team wants to release a new checkout flow to 1% of users before full rollout. What deployment strategy does this describe?',
          opts: [
            'Blue-green deployment',
            'Canary release',
            'Rolling deployment',
            'Feature toggle',
          ],
          answer: 1,
          explanation: 'A canary release routes a small percentage of traffic (1–5%) to the new version, monitors error rates and latency, then gradually increases the percentage. Blue-green swaps between two full environments with an instant cutover. Rolling deployments replace instances one-by-one. Feature toggles are code-level flags, not deployment strategies. Canary is the safest option when you cannot afford widespread user impact.',
        },
        {
          q: 'An SLO states: "99.9% of API calls will complete in under 200ms, measured over a rolling 30-day window." What does exceeding this SLO consume?',
          opts: [
            'CPU quota',
            'Error budget',
            'Rate limit tokens',
            'Cache TTL',
          ],
          answer: 1,
          explanation: 'Every SLO comes with an error budget — the allowed amount of failure before the SLO is breached. At 99.9% uptime, you have 43.8 minutes of downtime per month as your error budget. When you burn through it, SRE teams freeze new feature releases until reliability is restored. This concept, from the Google SRE book, is expected knowledge at L5+ interviews.',
        },
        {
          q: 'You need to migrate a 10TB production database from MySQL to Cassandra without downtime. What is the safest strategy?',
          opts: [
            'Take a snapshot, restore to Cassandra, flip DNS',
            'Dual-write to both stores, backfill historical data, shadow-read from Cassandra, validate, then cut over reads',
            'Stop the service, migrate the data, restart',
            'Use a Cassandra plugin that automatically replicates from MySQL',
          ],
          answer: 1,
          explanation: 'Zero-downtime database migrations require dual-write (writes go to both old and new stores simultaneously), a historical backfill job to copy existing data, and a shadow-read phase where you compare results from both stores before trusting the new one. Only after validation do you cut over reads and eventually stop writing to the old store. The stop-and-restore approach (option A) causes downtime proportional to data size.',
        },
      ],
      relatedSystems: ['cdn', 'social-graph'],
      content: `
<h2>What separates a good candidate from a great one</h2>
<p>At the senior and staff engineer level, everyone designs a working system. The differentiation comes from production awareness — the vocabulary and instincts that come from shipping software at scale and living through incidents. These talking points are the ones that make interviewers lean forward.</p>

<h2>Geo-distribution: active-active vs active-passive</h2>
<p>Multi-region is not just about disaster recovery. Active-active means every region simultaneously serves traffic and accepts writes. This cuts latency for users far from your primary datacenter but introduces write conflict scenarios: what if the same user profile is updated in US-East and EU-West at the same millisecond?</p>
<table class="metrics-table">
  <tr><td>Active-active</td><td class="hl">All regions serve writes; needs conflict resolution</td></tr>
  <tr><td>Active-passive</td><td class="hl">Secondary region is read-only or standby only</td></tr>
  <tr><td>Conflict resolution strategies</td><td class="hl">Last-write-wins, vector clocks, CRDTs</td></tr>
</table>
<p>Mention CRDTs (Conflict-free Replicated Data Types) if you are designing a collaborative editing system. They allow concurrent writes to merge automatically without coordination.</p>

<h2>Zero-downtime deployments</h2>
<div class="formula-box">
  Blue-Green: flip <span class="v">load balancer</span> between two identical environments &nbsp;|&nbsp;
  Canary: route <span class="v">1–5%</span> of traffic to new version, ramp up on success
</div>
<p>The rollback story matters: blue-green rollback is one DNS flip (seconds). Canary rollback is a traffic weight change (also seconds). Rolling deployment rollback is more complex — you must roll forward or accept a mixed-version period. Name your rollback SLA: "We can roll back within 60 seconds if error rate exceeds 1% on the canary."</p>

<h2>Observability: the three pillars</h2>
<div class="info-box">
  <div class="info-box-title">Metrics + Traces + Logs</div>
  <div class="info-box-body"><strong>Metrics</strong> tell you that something is wrong (p99 latency spiked to 2 seconds). <strong>Distributed traces</strong> tell you where it is wrong (the slow span is inside the payment service's DB call). <strong>Structured logs</strong> tell you what happened (the exact query, the error message, the user ID). You need all three — metrics alone leave you blind in an incident.</div>
</div>
<p>Name the stack: Prometheus + Grafana for metrics, Jaeger or AWS X-Ray for traces, Elasticsearch or Loki for logs. Or just say: "I would use a managed observability platform like Datadog so the team focuses on product instead of tooling."</p>

<h2>SLIs, SLOs, and SLAs</h2>
<table class="metrics-table">
  <tr><td>SLI — Service Level Indicator</td><td class="hl">What you measure (e.g. p99 latency)</td></tr>
  <tr><td>SLO — Service Level Objective</td><td class="hl">Your target (e.g. p99 &lt; 200 ms over 30 days)</td></tr>
  <tr><td>SLA — Service Level Agreement</td><td class="hl">Contractual commitment with penalties</td></tr>
  <tr><td>Error budget</td><td class="hl">Allowed failures before SLO is breached</td></tr>
</table>

<h2>Graceful degradation</h2>
<p>For every critical dependency you draw, ask: "What does the system do when this is unavailable?" Strong answers name a specific degraded mode: serve cached data, return a default/empty response, disable non-critical features, or queue work for later processing. Weak answers assume all dependencies are always up.</p>

<h2>Capacity planning</h2>
<p>Mention a growth model: "Assuming 20% month-over-month growth, this design hits its database write ceiling in approximately 14 months — at that point we would shard by user ID. I would set a threshold alert at 60% capacity utilization to trigger the migration planning process with enough runway."</p>
`,
    },

    /* ── 5 ── Mock Interview Breakdown ───────────────────────── */
    {
      id: 'mock-breakdown',
      title: 'Mock Interview: Design a URL Shortener',
      track: 'interview',
      difficulty: 'intermediate',
      readingMins: 12,
      keyPoints: [
        'Use the URL shortener as your universal warm-up problem — it is simple enough to complete in 35 minutes but rich enough to surface every skill: hashing, caching, database choice, and scaling.',
        'The core design challenge is generating unique short codes at high write throughput without collisions, without a centralized counter becoming a bottleneck.',
        'Read-to-write ratio is the most important constraint: URL shorteners are massively read-heavy (100:1 or more), which drives the entire caching strategy.',
        'A 7-character base62 code gives 62^7 ≈ 3.5 trillion unique URLs — always calculate this out loud to show you understand the key space.',
        'When the interviewer asks about analytics (click tracking), this is a fork: synchronous writes kill latency, so propose an async pipeline (Kafka → Flink → data warehouse).',
        'Handling expired and custom (vanity) URLs are the two most common follow-up curveballs — have a concrete answer ready for both.',
      ],
      quiz: [
        {
          q: 'The interviewer asks: "How do you generate a unique 7-character short code?" What is the strongest answer?',
          opts: [
            'Use a database auto-increment ID converted to base62',
            'Generate a random UUID and take the first 7 characters',
            'Use MD5 of the long URL, take the first 7 characters, retry on collision in the DB',
            'Let the user pick their own code every time',
          ],
          answer: 0,
          explanation: 'A database auto-increment ID converted to base62 guarantees uniqueness without collision checks, is fast, and produces short readable codes. The collision risk with random generation (option B or C) requires retry logic and becomes problematic as the table fills up. A global counter can become a bottleneck, so at massive scale you would pre-generate batches of IDs per application server.',
        },
        {
          q: 'The interviewer says: "The redirect endpoint is getting 200,000 RPS. How do you scale it?" What is the best first step?',
          opts: [
            'Shard the database by short code',
            'Add a read replica to the database',
            'Cache the short-code-to-long-URL mapping in Redis with a high TTL',
            'Migrate from MySQL to Cassandra',
          ],
          answer: 2,
          explanation: 'URL lookups are almost perfectly cacheable — the mapping never changes once created. A Redis cache with a 24-hour TTL absorbs over 99% of reads, reducing database load from 200,000 RPS to a few hundred cache misses. Adding read replicas (option B) helps but does not give you the 100x improvement that caching does. Always reach for cache before reaching for more database horsepower.',
        },
        {
          q: 'The interviewer pushes back: "Your design has a single Redis instance. What happens if it goes down?" What do you say?',
          opts: [
            '"That is unlikely, so it is an acceptable risk."',
            '"We would use Redis Sentinel or Redis Cluster for automatic failover, and the application would fall back to the database if the cache is unavailable — with rate limiting to protect the DB from sudden load."',
            '"We would add a second database as a backup."',
            '"We would restart Redis manually and accept 5 minutes of downtime."',
          ],
          answer: 1,
          explanation: 'The correct answer names a concrete HA solution (Redis Sentinel or Cluster) and a graceful degradation path (fall back to DB with rate limiting). Saying a failure is unlikely is always wrong — interviewers ask specifically because they want to see how you handle failure. Cache-aside with a fallback to the source of truth is the standard pattern.',
        },
        {
          q: 'At minute 38 of the interview, the interviewer asks: "What would you improve if you had more time?" What is the best response?',
          opts: [
            '"Nothing — I think the design is complete."',
            '"I would add more features like QR codes and browser plugins."',
            '"I would address: geo-distributed caching for lower redirect latency globally, a dedicated analytics pipeline to avoid write amplification on the hot path, and an automated expiration job using a TTL index."',
            '"I would rewrite the whole thing in Rust for performance."',
          ],
          answer: 2,
          explanation: 'A strong closing answer names specific engineering improvements that address real scaling constraints you identified during the interview — not feature additions or technology rewrites. Geo-distributed caching, an async analytics pipeline, and TTL-based expiration are all grounded in production concerns that naturally arise from the design. This shows you can think beyond the whiteboard.',
        },
      ],
      relatedSystems: ['url-shortener', 'distributed-cache'],
      content: `
<h2>The URL shortener: your canonical interview problem</h2>
<p>Every engineer preparing for system design interviews should practice the URL shortener until they can deliver it cold, in 35 minutes, while narrating every decision. It is simple enough to complete in one session but rich enough to demonstrate hashing, caching, database design, scaling strategy, and failure handling. Treat this walkthrough as your script.</p>

<h2>Minute 0–5: Clarify requirements</h2>
<p>Do not draw anything. Ask out loud:</p>
<div class="info-box">
  <div class="info-box-title">What to say at minute 1</div>
  <div class="info-box-body">
    "Before I start designing, I want to make sure I understand the scope. A few questions: Are we building this for public use like bit.ly, or internal tooling? What is the expected scale — roughly how many URLs are created per day and how many redirect requests per day? Do we need custom aliases? Do URLs expire? Do we need click analytics?"
  </div>
</div>
<p>Write down the answers. If the interviewer says "100M URLs created per day and 10B redirects per day," you now know the read-to-write ratio is 100:1, which determines your entire architecture.</p>

<h2>Minute 5–10: Capacity estimation</h2>
<div class="formula-box">
  Writes: <span class="v">100M/day</span> ÷ 86,400 ≈ <span class="v">1,160 writes/s</span><br>
  Reads: <span class="v">10B/day</span> ÷ 86,400 ≈ <span class="v">115,000 reads/s</span>
</div>
<p>Say out loud: "This is massively read-heavy at about 100:1. That means caching the redirect lookup is the single most important architectural decision. Now for storage: if each URL record is 500 bytes and we create 100M per day, that is 50 GB/day or about 18 TB per year. We will need to plan for that growth."</p>
<div class="formula-box">
  Short code key space: base62 (a-z, A-Z, 0-9) → 62<sup>7</sup> ≈ <span class="v">3.5 trillion</span> unique codes
</div>
<p>Say: "A 7-character base62 code gives us 3.5 trillion possible URLs — more than enough. I will go with 7 characters."</p>

<h2>Minute 10–20: High-level design</h2>
<p>Draw this on the whiteboard and narrate as you go:</p>
<table class="metrics-table">
  <tr><td>Client</td><td class="hl">Browser or mobile app</td></tr>
  <tr><td>Load balancer</td><td class="hl">Routes /create and /redirect traffic</td></tr>
  <tr><td>URL shortener service</td><td class="hl">Stateless app servers (scale horizontally)</td></tr>
  <tr><td>Redis cache</td><td class="hl">short_code → long_url, TTL 24 hours</td></tr>
  <tr><td>MySQL / PostgreSQL</td><td class="hl">Source of truth: (short_code, long_url, created_at, expires_at)</td></tr>
  <tr><td>ID generator service</td><td class="hl">Flicker-style distributed ID generation</td></tr>
</table>
<p>The redirect path: client hits /r/{code} → app server checks Redis → if miss, queries DB → caches result → returns 301/302 redirect. Narrate this flow explicitly — interviewers want to hear you trace data through your own design.</p>

<h2>Minute 20–35: Deep dive — the write path and code generation</h2>
<p>The hardest part is generating unique short codes without a central bottleneck. Walk through the options and pick one:</p>
<div class="info-box">
  <div class="info-box-title">Code generation strategies</div>
  <div class="info-box-body">
    <strong>Option A — Hash + truncate:</strong> MD5(long_url), take first 7 chars, base62-encode. Risk: collisions require a retry loop.<br><br>
    <strong>Option B — Auto-increment ID:</strong> Database auto-increment converted to base62. Guaranteed unique. Single DB becomes bottleneck at &gt;10K writes/s.<br><br>
    <strong>Option C — Pre-generated ID pool:</strong> A separate service pre-generates millions of unique IDs and stores them in a "key DB." App servers pull a batch of 1,000 IDs on startup. No hot-path DB write. Best for high write throughput.
  </div>
</div>
<p>Say: "I will go with Option B for simplicity at current scale, and call out that we would move to pre-generated ID batching if writes exceeded 10,000/second."</p>

<h2>Minute 35–40: Summarize tradeoffs and next steps</h2>
<p>Say: "To summarize — I designed a URL shortener with a Redis caching layer absorbing 99%+ of redirect reads, a stateless app tier that scales horizontally, and a MySQL database as the source of truth with an auto-increment ID converted to base62 for uniqueness. The main tradeoffs I made: I chose 301 permanent redirects for better browser caching at the cost of losing analytics after the first visit — for analytics I would move to 302 and log async via Kafka. I chose eventual consistency on the cache, meaning a deleted URL could still redirect for up to 24 hours. If I had more time, I would design the analytics pipeline, add geo-distributed Redis for lower redirect latency globally, and implement a TTL-indexed cleanup job for expired URLs."</p>
`,
    },

  ];
})();
