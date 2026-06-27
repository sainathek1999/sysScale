/* ============================================================
   modules-patterns.js — 6 Patterns modules, full content
   ============================================================ */
(function () {
  window.SS = window.SS || {};
  window.SS.MODULES = window.SS.MODULES || {};

  window.SS.MODULES['patterns'] = [
    /* ── 1 ── Consistent Hashing ─────────────────────────── */
    {
      id: 'consistent-hashing',
      title: 'Consistent Hashing',
      track: 'patterns',
      difficulty: 'intermediate',
      readingMins: 10,
      keyPoints: [
        'Modular hashing (key % N) remaps ~91% of keys when one node is added — consistent hashing remaps only ~1/N keys on any membership change.',
        'The hash ring maps both nodes and keys onto a circle [0, 2³²); a key is owned by the first node encountered walking clockwise from its hash position.',
        'Virtual nodes (vnodes): each physical server gets 100–256 positions on the ring, smoothing load distribution and reducing hot spots.',
        'When a node is added, only keys between it and its predecessor move. When removed, its keys shift to the next clockwise node.',
        'Cassandra uses 256 vnodes per node by default; DynamoDB and Memcached (ketama) also rely on consistent hashing for partition routing.',
        'Replication: walk clockwise N hops for RF=N replicas; vnode-aware strategies skip vnodes belonging to already-chosen physical nodes.',
      ],
      quiz: [
        {
          q: 'A Memcached cluster uses modular hashing (key % 10) across 10 nodes. You add one node (now key % 11). Roughly what percentage of cached keys are invalidated?',
          opts: ['~10%', '~50%', '~91%', '~100%'],
          answer: 2,
          explanation: 'With modular hashing, changing N from 10 to 11 remaps every key where key%10 ≠ key%11 — which is approximately (N-1)/N ≈ 91% of keys. This causes a cache miss storm against the database. Consistent hashing limits the remapping to ~1/N ≈ 10% of keys.',
        },
        {
          q: 'A consistent hashing ring has nodes A, B, C evenly spaced. Node D is inserted between A and B. Which keys move, and where do they go?',
          opts: [
            'All keys redistribute evenly across A, B, C, D',
            'Keys in range (A, D] that previously mapped to B now map to D',
            'Keys in range (D, B] that previously mapped to A now map to D',
            'No keys move — only new writes are directed to D',
          ],
          answer: 1,
          explanation: 'Before insertion, keys in (A, D] were served by B (the first clockwise node). After inserting D between A and B, those keys now route to D. Only B loses a subset of its keys — all other nodes are completely unaffected.',
        },
        {
          q: 'Without virtual nodes, a consistent hashing ring with 3 physical nodes can be badly unbalanced. Why?',
          opts: [
            'Consistent hashing does not support fewer than 16 nodes',
            'Hash collisions increase sharply at small node counts',
            'Three arbitrary positions on a 2³² ring rarely divide the keyspace into equal thirds — one node may own 50%+ by chance',
            'Virtual nodes are required for the clockwise-walk algorithm to terminate',
          ],
          answer: 2,
          explanation: 'With only 3 positions on a 2³² ring, the gaps are unlikely to be equal thirds. One node can end up responsible for half the keyspace by random chance. Virtual nodes (100–256 per server) use the law of large numbers to even out the distribution statistically.',
        },
        {
          q: 'Cassandra has replication factor RF=3. A key hashes to position P on the ring. Where are the 3 replicas placed?',
          opts: [
            'On the 3 nodes with the lowest current load',
            'On the primary node and 2 randomly selected nodes',
            'On the first 3 distinct physical nodes encountered walking clockwise from P',
            'On 3 nodes in the same rack as the coordinator',
          ],
          answer: 2,
          explanation: 'Cassandra\'s NetworkTopologyStrategy walks clockwise from the key\'s hash position, placing each replica on the next distinct physical node (vnodes belonging to an already-chosen physical node are skipped). This guarantees all RF replicas land on separate machines.',
        },
      ],
      relatedSystems: ['distributed-cache', 'message-queue'],
      content: `
<h2>The problem with modular hashing</h2>
<p>The naive approach to distributing keys across N servers is <code>server = hash(key) % N</code>. This works until cluster membership changes. Add or remove one node and N changes — nearly every key remaps to a different server.</p>
<table class="metrics-table">
  <tr><td>10 → 11 nodes (add one, modular hash)</td><td class="warn">~91% of keys remapped</td></tr>
  <tr><td>10 → 9 nodes (remove one, modular hash)</td><td class="warn">~89% of keys remapped</td></tr>
  <tr><td>Add one node (consistent hashing)</td><td class="hl">~1/N keys remapped (~10%)</td></tr>
</table>
<p>For a cache tier, remapping 91% of keys means a <strong>cache miss storm</strong> — every remapped key simultaneously falls through to the database.</p>

<h2>The hash ring</h2>
<p>Consistent hashing maps both <strong>nodes</strong> and <strong>keys</strong> onto the same circular integer space — a ring from 0 to 2³²−1. Each node is placed at one or more positions. Each key is placed at a position, then served by the <strong>first node encountered walking clockwise</strong> from that position.</p>
<div class="formula-box">hash(key) → position on ring<br>Walk clockwise → first node found = <span class="v">responsible node</span><br><br>Add node X between A and B:<br>→ Keys in (A, X] move from B to X<br>→ All other keys unchanged</div>
<p>When a node is added, only the keys in the arc between its predecessor and itself need to move. When removed, its keys shift to the next clockwise neighbor. In both cases <strong>only 1/N of keys move on average</strong>.</p>

<h2>Virtual nodes (vnodes)</h2>
<p>With 3 physical nodes on a 2³² ring, one node may own half the keyspace by chance. <strong>Virtual nodes</strong> solve this by assigning each physical server multiple positions — typically 100–256 tokens.</p>
<table class="metrics-table">
  <tr><td>Physical nodes only (3 servers)</td><td class="warn">Up to 50%+ keyspace skew possible</td></tr>
  <tr><td>256 vnodes per server</td><td class="hl">Each server owns ≈33% ± a few percent</td></tr>
  <tr><td>New server added (with vnodes)</td><td class="hl">Takes ~1/N keys from every existing node evenly</td></tr>
</table>
<p>Vnodes also improve failure handling. When a node dies, its ~256 ring positions each shift to the next clockwise neighbor — spreading the extra load across many distinct servers rather than one.</p>

<h2>Replication on the ring</h2>
<p>For replication factor RF=3, place replicas on the <strong>next 3 distinct physical nodes clockwise</strong> from the key's position. Combined with vnodes, this ensures replicas land on physically separate machines even when many vnodes are interspersed.</p>
<div class="formula-box">Key at position P → walk clockwise:<br>Replica 1: first distinct physical node<br>Replica 2: <span class="v">second distinct physical node</span><br>Replica 3: <span class="v">third distinct physical node</span></div>

<h2>Real-world usage</h2>
<table class="metrics-table">
  <tr><td><strong>Apache Cassandra</strong></td><td>256 vnodes/node; Murmur3 hash; configurable replication strategy</td></tr>
  <tr><td><strong>Amazon DynamoDB</strong></td><td>Internal consistent hashing for partition routing; transparent to users</td></tr>
  <tr><td><strong>Memcached (ketama)</strong></td><td class="hl">160 vnodes/server; used by Facebook and Twitter for cache sharding</td></tr>
  <tr><td><strong>Akamai CDN</strong></td><td>Karger et al. (1997) invented consistent hashing specifically for CDN design</td></tr>
</table>
<div class="info-box">
  <div class="info-box-title">Interview talking point</div>
  <div class="info-box-body">Don't just say "use consistent hashing." Explain <em>why</em>: modular hashing causes cache miss storms on node changes; consistent hashing limits remapping to 1/N keys; vnodes even out the distribution. Cite Cassandra or Memcached ketama as concrete examples.</div>
</div>
`,
    },

    /* ── 2 ── Leader Election ─────────────────────────────── */
    {
      id: 'leader-election',
      title: 'Leader Election',
      track: 'patterns',
      difficulty: 'intermediate',
      readingMins: 12,
      keyPoints: [
        'Leader election ensures exactly one node is the coordinator at any time — prevents conflicting concurrent writes and split-brain scenarios.',
        'Raft: followers time out (150–300ms randomized) and become candidates; a candidate wins by receiving votes from N/2+1 nodes; term numbers increment per election.',
        'Paxos is mathematically proven but notoriously hard to implement correctly; Raft was designed to be understandable and is now the dominant choice (etcd, CockroachDB, Consul).',
        'ZooKeeper leader election uses ephemeral sequential znodes; the node holding the lowest sequence number is leader; all others watch their direct predecessor.',
        'etcd (Raft-based, used by Kubernetes) issues leader leases with a TTL of 5–10s; typical failover time is 5–30s after leader death.',
        'Fencing tokens (monotonically increasing numbers issued per lease) prevent a zombie old leader from corrupting storage after a new leader is elected.',
      ],
      quiz: [
        {
          q: 'A 5-node Raft cluster loses 2 nodes simultaneously. Can the remaining 3 nodes elect a new leader?',
          opts: [
            'No — any node failure makes the cluster unavailable',
            'Yes — 3 of 5 satisfies the N/2+1 = 3 quorum requirement',
            'No — Raft requires all N nodes to participate in a vote',
            'Yes — but only if one of the failed nodes was the previous leader',
          ],
          answer: 1,
          explanation: 'Raft requires a majority (N/2+1) to elect a leader. In a 5-node cluster N/2+1 = 3. With 3 nodes remaining, quorum is reachable and a new leader can be elected. Losing 3 nodes would leave only 2 — below quorum — and the cluster would stall on new writes.',
        },
        {
          q: 'What is a fencing token and why is it necessary?',
          opts: [
            'A cryptographic signature to authenticate leader messages to followers',
            'A monotonically increasing number that storage systems use to reject writes from stale leaders',
            'A network packet that physically fences old leaders off the network segment',
            'A circuit breaker that prevents followers from accepting out-of-order log entries',
          ],
          answer: 1,
          explanation: 'A leader may be delayed (e.g., a GC pause) and still believe it holds a valid lease when a new leader is elected. Without fencing, both the old and new leader could write concurrently — split-brain. A fencing token (epoch number) is sent with every write; the storage layer rejects any write with a token older than the highest it has seen.',
        },
        {
          q: 'In ZooKeeper leader election, three nodes create: /election/n-001, /election/n-002, /election/n-003. Node n-001 (the leader) crashes. What happens?',
          opts: [
            'All nodes immediately re-run election by creating new znodes',
            'n-002 detects n-001\'s deletion (it was watching n-001), sees it now holds the lowest ID, and becomes leader',
            'A random node between n-002 and n-003 is chosen by ZooKeeper',
            'ZooKeeper refuses to elect a new leader until n-001 recovers',
          ],
          answer: 1,
          explanation: 'ZooKeeper leader election uses the "watch predecessor" pattern. Each node watches the znode with the sequence number directly below its own. When n-001\'s ephemeral znode is deleted on crash, n-002\'s watcher fires. n-002 checks that it now holds the lowest sequence number and declares itself leader — no thundering herd of re-elections.',
        },
        {
          q: 'What is "split-brain" in the context of distributed leader election?',
          opts: [
            'When database shards lose data during a rebalance operation',
            'When two nodes simultaneously believe they are the leader, both accepting writes independently',
            'When followers disagree on log entries due to delayed replication',
            'When a ZooKeeper ensemble loses its stored data after a crash',
          ],
          answer: 1,
          explanation: 'Split-brain occurs when a network partition causes each side to elect its own leader. Both accept writes, leading to divergent state. Preventing split-brain requires quorum: a leader must be acknowledged by N/2+1 nodes, so only the majority partition can have an active leader at any time.',
        },
      ],
      relatedSystems: ['distributed-cache', 'message-queue'],
      content: `
<h2>Why leader election is needed</h2>
<p>Many distributed systems need a single coordinator: the primary database node that accepts writes, the Kafka partition leader, the job scheduler that dispatches work. Without coordination, multiple nodes may simultaneously act as leader — creating conflicting writes, data corruption, or split-brain.</p>
<p>A correct leader election protocol guarantees two properties: <strong>safety</strong> (at most one leader at any time) and <strong>liveness</strong> (a new leader is elected within a bounded time after a failure).</p>

<h2>Raft consensus</h2>
<p>Raft is the most widely implemented consensus algorithm today (etcd, CockroachDB, TiKV, Consul). It decomposes the problem into three sub-problems: leader election, log replication, and safety.</p>
<div class="formula-box">States: <span class="v">Follower</span> → <span class="v">Candidate</span> → <span class="v">Leader</span><br><br>1. Follower times out (150–300ms randomized timer)<br>2. Increments its term, votes for itself, broadcasts RequestVote<br>3. Wins if majority (N/2+1) vote YES in this term<br>4. Sends heartbeats every ~50ms to reset follower timers</div>
<table class="metrics-table">
  <tr><td>Election timeout</td><td class="hl">150–300ms (randomized to avoid split votes)</td></tr>
  <tr><td>Quorum required</td><td class="hl">N/2 + 1 nodes</td></tr>
  <tr><td>Term number</td><td class="hl">Monotonically increasing epoch; higher term supersedes lower</td></tr>
  <tr><td>Max tolerable failures</td><td>⌊(N−1)/2⌋ — e.g., 2 of 5 nodes, 1 of 3 nodes</td></tr>
</table>

<h2>Paxos</h2>
<p>Paxos (Lamport, 1989) was the first proven consensus algorithm. It runs in two phases: <strong>Prepare/Promise</strong> (a proposer gets a majority to promise to accept its proposal) and <strong>Accept/Accepted</strong> (the proposer commits the value). Multi-Paxos skips Phase 1 for a stable leader, amortizing its cost.</p>
<div class="info-box">
  <div class="info-box-title">Paxos vs Raft</div>
  <div class="info-box-body">Paxos is elegant but notoriously hard to implement for real systems — corner cases in leader changes and log holes are poorly specified. Raft was designed explicitly to be understandable, with sequential logs and explicit membership change protocols. Ongaro & Ousterhout's 2014 user study showed Raft was significantly easier to reason about. New projects choose Raft; older systems (Zookeeper's Zab, Google Chubby) predate it.</div>
</div>

<h2>ZooKeeper vs etcd</h2>
<table class="metrics-table">
  <tr><td><strong>ZooKeeper</strong></td><td>Uses Zab protocol; Java-based; ephemeral + sequential znodes for election</td></tr>
  <tr><td>Election pattern</td><td>Create /election/n-XXXXXX; watch predecessor; lowest ID wins</td></tr>
  <tr><td>Used by</td><td>Kafka (broker/controller), HBase, Hadoop YARN</td></tr>
  <tr><td><strong>etcd</strong></td><td class="hl">Uses Raft; Go-based; simple key-value API; used by Kubernetes</td></tr>
  <tr><td>Election API</td><td class="hl">Campaign() / Resign() with TTL-based leases</td></tr>
  <tr><td>Typical failover</td><td class="hl">5–30 seconds (lease expiry + election round)</td></tr>
</table>

<h2>Fencing tokens and epoch numbers</h2>
<p>A slow leader (e.g., stuck in a GC pause) can outlive its lease. A new leader is elected while the old one is still alive. Without fencing, the zombie old leader resumes after the pause and writes to storage — corrupting state.</p>
<div class="formula-box">Leader A elected → fencing token = <span class="v">42</span><br>A enters GC pause; lease expires at T+10s<br>Leader B elected → fencing token = <span class="v">43</span><br>A wakes at T+12s, sends write with token = 42<br>Storage: 42 &lt; 43 (highest seen) → <span class="v">write rejected</span></div>
<p>The storage layer tracks the highest fencing token it has seen and rejects any write carrying a lower token. This is the only reliable way to protect against zombie leaders; process-level checks alone are insufficient.</p>

<h2>Split-brain prevention</h2>
<p>Split-brain — two simultaneous leaders — is prevented by requiring a quorum. If a cluster is partitioned into two halves, only the side with N/2+1 nodes can elect a leader. The minority partition returns errors until the partition heals.</p>
<table class="metrics-table">
  <tr><td>3-node cluster, 1 failure</td><td class="hl">2 remaining = majority → new leader elected</td></tr>
  <tr><td>3-node cluster, 2 failures</td><td class="warn">1 remaining = minority → cluster stalls, returns errors</td></tr>
  <tr><td>5-node cluster, 2 failures</td><td class="hl">3 remaining = majority → new leader elected</td></tr>
</table>
`,
    },

    /* ── 3 ── Distributed Transactions ───────────────────── */
    {
      id: 'distributed-transactions',
      title: 'Distributed Transactions',
      track: 'patterns',
      difficulty: 'intermediate',
      readingMins: 14,
      keyPoints: [
        '2PC (Two-Phase Commit): coordinator broadcasts Prepare → cohorts vote YES/NO → coordinator broadcasts Commit or Abort. If all vote YES the transaction commits.',
        '2PC is a blocking protocol: if the coordinator crashes after Prepare but before Commit, cohorts are stuck holding locks indefinitely — they cannot proceed alone.',
        '3PC adds a Pre-Commit phase to break 2PC\'s blocking problem but cannot handle network partitions and is rarely used in practice.',
        'Saga pattern: each service runs a local transaction and publishes an event; compensating transactions undo completed steps on failure — no distributed lock is held.',
        'Choreography sagas react to events autonomously (decentralized); Orchestration sagas use a central coordinator (AWS Step Functions, Temporal) — easier to observe and debug.',
        'Google Spanner achieves external consistency globally using TrueTime (GPS + atomic clocks), bounding clock uncertainty to ~7ms and using commit-wait to order transactions.',
      ],
      quiz: [
        {
          q: 'In 2PC, the coordinator sends Prepare to all cohorts and receives YES from every one. The coordinator then crashes before sending Commit. What state are the cohorts in?',
          opts: [
            'They time out and automatically commit — the YES vote was a promise to commit',
            'They time out and automatically abort — to ensure safety by default',
            'They are stuck in the "prepared" state, holding locks indefinitely, unable to proceed without the coordinator',
            'They elect one cohort as a new coordinator and complete the commit',
          ],
          answer: 2,
          explanation: 'This is the fundamental flaw of 2PC — it is a blocking protocol. A cohort that voted YES has written to its WAL and locked resources, but it cannot unilaterally commit or abort without the coordinator\'s instruction. If the coordinator never recovers, those locks are held forever, blocking concurrent transactions on those rows.',
        },
        {
          q: 'A checkout saga has 3 steps: (1) Reserve inventory, (2) Charge payment, (3) Create order record. Step 2 (payment) fails. Which compensating transactions execute?',
          opts: [
            'Compensation for step 3 only — it ran after the failure',
            'Compensation for step 1 only — it completed successfully and must be undone',
            'Compensations for steps 1 and 2 — both must be reversed',
            'No compensating transactions — the saga aborts cleanly with no side effects',
          ],
          answer: 1,
          explanation: 'Compensating transactions undo already-completed steps. Step 1 (reserve inventory) succeeded — its compensation is "release the reservation." Step 2 failed mid-execution — the payment processor handles its own rollback, and no saga compensation is needed. Step 3 never ran — nothing to compensate. Only step 1\'s compensation triggers.',
        },
        {
          q: 'What is the key trade-off when choosing the Saga pattern over 2PC for a multi-service transaction?',
          opts: [
            'Sagas are faster but provide zero atomicity — any step can be skipped',
            'Sagas avoid distributed locks but only provide eventual consistency — intermediate states are transiently visible to other services',
            'Sagas require more total network messages than 2PC across all participants',
            'Sagas work only with choreography; orchestration requires 2PC',
          ],
          answer: 1,
          explanation: 'In a saga, each local transaction commits immediately and becomes visible to other services. If a later step fails, compensating transactions run — but there is a window where partial state is observable (e.g., inventory is reserved but order does not yet exist). 2PC prevents this by holding locks until all participants commit, at the cost of availability and latency.',
        },
        {
          q: 'Google Spanner provides external consistency across globally distributed datacenters. What technology makes this possible?',
          opts: [
            'Two-phase commit with a global lock manager in a single master datacenter',
            'Eventual consistency with conflict-free replicated data types (CRDTs)',
            'TrueTime — GPS and atomic clock-based API that bounds current-time uncertainty to ~7ms, enabling globally ordered commit timestamps',
            'Synchronous Paxos run across all datacenters for every transaction commit',
          ],
          answer: 2,
          explanation: 'TrueTime is Spanner\'s clock API that returns an interval [earliest, latest] bounding the true current time. Before committing, Spanner waits out the uncertainty window (commit-wait, typically 7–14ms). This guarantees every transaction\'s commit timestamp is strictly after all causally prior transactions — across all global replicas — without a global lock manager.',
        },
      ],
      relatedSystems: ['payment', 'ride-sharing'],
      content: `
<h2>The distributed transaction problem</h2>
<p>In a monolith, a database transaction provides atomicity — all changes commit or none do. In microservices, an operation like "checkout" spans multiple services (Inventory, Payment, Orders), each with its own database. There is no built-in mechanism to make all three atomic together. This is the distributed transaction problem.</p>

<h2>Two-Phase Commit (2PC)</h2>
<p>2PC is the classic protocol. A coordinator node drives two phases:</p>
<div class="formula-box"><span class="v">Phase 1 — Prepare:</span><br>Coordinator → all cohorts: "Can you commit this transaction?"<br>Each cohort: locks resources, writes intent to WAL, replies YES or NO<br><br><span class="v">Phase 2 — Commit / Abort:</span><br>All YES → Coordinator → all: "Commit"<br>Any NO  → Coordinator → all: "Abort"</div>
<table class="metrics-table">
  <tr><td>Atomicity</td><td class="hl">Guaranteed — all commit or all abort</td></tr>
  <tr><td>Latency</td><td class="warn">2 × RTT minimum; cross-region adds 200–400ms per transaction</td></tr>
  <tr><td>Blocking on coordinator crash</td><td class="warn">Cohorts hold locks indefinitely — a single crashed coordinator stalls the system</td></tr>
  <tr><td>Throughput</td><td class="warn">Low — all participants must be reachable and responsive simultaneously</td></tr>
</table>

<h2>Why 2PC is avoided at scale</h2>
<p>2PC's blocking nature is its fatal flaw for high-availability microservices. Any participant going slow (GC pause, network hiccup) holds locks and stalls unrelated transactions on those rows. At high transaction rates this creates cascading latency spikes. 2PC is practical within a single database engine (XA transactions) but impractical across independently deployed services.</p>

<h2>Three-Phase Commit (3PC)</h2>
<p>3PC inserts a <strong>Pre-Commit</strong> phase between Prepare and Commit, giving cohorts enough information to make a safe unilateral decision after a coordinator crash. However, 3PC cannot handle network partitions — a partitioned network allows two groups to reach opposite decisions. In practice 3PC is rarely deployed; the saga pattern is the preferred alternative for microservices.</p>

<h2>Saga pattern</h2>
<p>A saga is a sequence of local transactions, each of which commits immediately. If a step fails, <strong>compensating transactions</strong> execute in reverse order to undo the already-committed effects.</p>
<div class="formula-box">T1 → T2 → T3 → <span class="v">SUCCESS</span><br><br>T1 → T2 → T3 fails:<br>→ Run C2 (compensate T2)<br>→ Run C1 (compensate T1)<br>→ Saga marked as failed</div>
<div class="info-box">
  <div class="info-box-title">Compensating transactions are not rollbacks</div>
  <div class="info-box-body">A compensating transaction is a new business operation — "release inventory reservation" compensates "reserve inventory." Unlike a database rollback, the intermediate state was already visible to other services. Sagas provide ACD properties (no Isolation) — you must design for transiently visible partial states, e.g., show "payment pending" until the full saga completes.</div>
</div>

<h2>Choreography vs orchestration</h2>
<table class="metrics-table">
  <tr><td><strong>Choreography</strong></td><td>Each service reacts to events from others. No central coordinator.</td></tr>
  <tr><td>Pros</td><td class="hl">Decoupled; no single point of failure; services evolve independently</td></tr>
  <tr><td>Cons</td><td class="warn">Hard to trace overall saga state; debugging across many services is complex</td></tr>
  <tr><td><strong>Orchestration</strong></td><td>Central orchestrator (AWS Step Functions, Temporal) sends commands in sequence</td></tr>
  <tr><td>Pros</td><td class="hl">Saga state visible in one place; explicit failure handling; easy to add steps</td></tr>
  <tr><td>Cons</td><td class="warn">Orchestrator is a central dependency; can accumulate business logic</td></tr>
</table>

<h2>Google Spanner and TrueTime</h2>
<p>Spanner achieves external consistency — stronger than serialisability — across globally distributed shards using <strong>TrueTime</strong>, an API backed by GPS receivers and atomic clocks in every Google datacenter. TrueTime returns an interval <code>[earliest, latest]</code> bounding the true current time; uncertainty is typically 1–7ms.</p>
<p>Before committing, Spanner waits out the uncertainty window (<strong>commit-wait</strong>). This ensures every transaction's commit timestamp is strictly after all causally prior transactions — globally — without requiring a global lock manager or a central coordinator.</p>
`,
    },

    /* ── 4 ── Event Sourcing ──────────────────────────────── */
    {
      id: 'event-sourcing',
      title: 'Event Sourcing & CQRS',
      track: 'patterns',
      difficulty: 'intermediate',
      readingMins: 12,
      keyPoints: [
        'Event sourcing stores every state change as an immutable, append-only event; current state is derived by replaying the full event log from the beginning.',
        'CQRS (Command Query Responsibility Segregation) separates write models (commands that emit events) from read models (projections) — each is independently optimized and scaled.',
        'Event replay enables: rebuilding corrupted read models, creating new projections from old data, time-travel debugging, and complete audit logs — impossible with mutable state.',
        'Projections are derived read models built by consuming the event stream — e.g., "revenue by day" built by aggregating PaymentProcessed events.',
        'Snapshots capture aggregate state every N events (typically 100–1,000) to avoid replaying the full event log on every aggregate load.',
        'Apache Kafka\'s append-only partitioned log is a natural event store backbone; consumer offset resets allow full replay; log compaction retains the latest event per key.',
      ],
      quiz: [
        {
          q: 'An event-sourced order aggregate has accumulated 50,000 events. Loading it requires replaying all 50,000 events. What standard technique reduces this cost?',
          opts: [
            'Use eventual consistency to skip processing older events',
            'Store a snapshot of the aggregate state every N events; on load, start from the latest snapshot and replay only the events after it',
            'Delete events older than 30 days to keep the log short',
            'Switch to a mutable state model for high-volume aggregates',
          ],
          answer: 1,
          explanation: 'Snapshots are the standard solution. The system periodically serialises the full aggregate state and stores it with the corresponding event offset. On the next load, only events after the snapshot offset need to be replayed — reducing 50,000 event replays to at most N events (the snapshot interval).',
        },
        {
          q: 'In a CQRS system the read model is 800ms behind the write model. A user submits a payment and immediately views their transaction history. What should the system do?',
          opts: [
            'Crash — CQRS guarantees immediate read-after-write consistency',
            'Return confirmation in the command response and show a "processing" indicator; the read model will catch up within seconds',
            'Always query the write model directly for reads after a command',
            'Block the user response until the read model has caught up',
          ],
          answer: 1,
          explanation: 'CQRS with asynchronous projection updates means the read model can lag. The correct pattern is to return confirmation in the command response ("payment submitted") and display optimistic UI or a processing state. Blocking or always querying the write model defeats the purpose of CQRS.',
        },
        {
          q: 'A new reporting requirement needs "total spend by product category" — a metric that was never tracked before. In an event-sourced system, how is this report built?',
          opts: [
            'It cannot be built — the historical data was never captured in the old schema',
            'Run a schema migration to add the category column retroactively to the main table',
            'Replay the full event log through a new projection that extracts category data from historical PurchaseCompleted events',
            'Add category tracking going forward only, and manually backfill the last 90 days',
          ],
          answer: 2,
          explanation: 'This is one of event sourcing\'s most powerful advantages. All PurchaseCompleted events already contain the data needed (product, amount, category). A new projection consumer replays the event log from offset 0, building the spend-by-category aggregate from the complete history. This would be impossible with a traditional database that only stores current state.',
        },
        {
          q: 'Which statement best describes the fundamental difference between event sourcing and traditional database storage?',
          opts: [
            'Event sourcing uses SQL; traditional storage uses NoSQL document models',
            'Traditional storage overwrites current state in place; event sourcing appends each change as an immutable event and derives state by replay',
            'Event sourcing is only appropriate for financial and compliance applications',
            'Traditional databases cannot support audit logging or change history',
          ],
          answer: 1,
          explanation: 'Traditional databases store the latest state — updating a row overwrites the previous value permanently. Event sourcing never overwrites; it appends an event describing the change. Current state is computed by replaying events. This immutability enables temporal queries, audit trails, projection rebuilds, and debugging — at the cost of query complexity and storage growth.',
        },
      ],
      relatedSystems: ['message-queue', 'payment'],
      content: `
<h2>Traditional state vs event sourcing</h2>
<p>In a traditional database, state is stored as the current value. When a user updates their email address, the old value is overwritten and lost. In event sourcing, every change is stored as an immutable event — <em>EmailChanged{userId: 42, newEmail: "x@y.com", at: T}</em>. The current state is the result of replaying all events for that entity in order.</p>
<div class="formula-box">Traditional: store current state<br>→ UPDATE users SET email='new@x.com' WHERE id=42<br><br>Event sourcing: append the change<br>→ APPEND EmailChanged{user:42, email:'new@x.com', at:T}<br>→ current state = <span class="v">replay(all events for user 42)</span></div>

<h2>CQRS: separate reads from writes</h2>
<p>Command Query Responsibility Segregation recognizes that the data shape needed for writes (validating a business rule) differs from what reads need (rendering a dashboard). CQRS uses separate models for each side.</p>
<table class="metrics-table">
  <tr><td><strong>Command side (Write)</strong></td><td class="hl">Validates business rules, emits events, optimized for consistency and correctness</td></tr>
  <tr><td><strong>Query side (Read)</strong></td><td class="hl">Denormalized projections, optimized for read performance, eventually consistent</td></tr>
  <tr><td>Scaling</td><td class="hl">Each side scales independently — many read replicas; focused write throughput</td></tr>
  <tr><td>Consistency</td><td class="warn">Read model lags behind write model (milliseconds to seconds) — design UX accordingly</td></tr>
</table>

<h2>Projections</h2>
<p>A projection is a derived read model built by consuming the event stream and computing an aggregate view. Projections are built for specific query patterns and can be rebuilt at any time by replaying from the event log.</p>
<div class="info-box">
  <div class="info-box-title">New requirements from old data</div>
  <div class="info-box-body">Need a "revenue by product category" report that was never tracked? In an event-sourced system, replay the complete event log through a new projection — all the raw data already exists in past PaymentProcessed events. With a traditional mutable database where old values were overwritten, this retroactive analysis would be impossible.</div>
</div>

<h2>Snapshots</h2>
<p>As an aggregate accumulates thousands of events, replaying them all on every load becomes expensive. A snapshot serializes the aggregate state at a given event offset. On load: fetch the latest snapshot, then replay only events after that offset.</p>
<table class="metrics-table">
  <tr><td>Without snapshots (10,000 events)</td><td class="warn">Replay all 10,000 events on every load</td></tr>
  <tr><td>Snapshot every 500 events</td><td class="hl">Load snapshot + replay ≤500 events</td></tr>
  <tr><td>Typical snapshot frequency</td><td>Every 100–1,000 events; tune per aggregate's event volume</td></tr>
</table>

<h2>Apache Kafka as event store</h2>
<p>Kafka's append-only, partitioned log maps naturally onto event sourcing. Topics retain events for configurable durations (days to indefinitely with log compaction). Multiple independent projection consumers read the same topic at their own offsets and can reset to 0 for a full replay.</p>
<table class="metrics-table">
  <tr><td>Write throughput</td><td class="hl">1M+ events/second per cluster</td></tr>
  <tr><td>Retention</td><td class="hl">Days, weeks, or forever (log compaction keeps latest event per key)</td></tr>
  <tr><td>Consumer replay</td><td class="hl">Reset consumer group offset to 0 — full history replays</td></tr>
  <tr><td>Delivery guarantee</td><td>At-least-once — consumers must deduplicate by event ID (idempotent processing)</td></tr>
</table>

<h2>When to use event sourcing</h2>
<div class="formula-box">Good fit: audit requirements, multiple read models, complex domain<br>→ <span class="v">Financial ledgers, order management, collaboration tools</span><br><br>Poor fit: simple CRUD, analytics-only, small teams<br>→ <span class="r">Adds operational complexity without proportional benefit</span></div>
<p>Event sourcing introduces real costs: event schema evolution (old consumers must handle old event shapes), snapshot management, and projection rebuild time for large event stores. Adopt it when audit trails, temporal queries, or event replay are genuine product requirements.</p>
`,
    },

    /* ── 5 ── Resilience Patterns ─────────────────────────── */
    {
      id: 'resilience-patterns',
      title: 'Resilience Patterns',
      track: 'patterns',
      difficulty: 'intermediate',
      readingMins: 12,
      keyPoints: [
        'Circuit breaker has 3 states: Closed (normal), Open (fail fast — skip the call), Half-Open (send one probe to test recovery). Trips after N consecutive failures or >X% error rate in a window.',
        'Exponential backoff: retry delay doubles each attempt (1s → 2s → 4s → 8s). Add jitter (±50% random) to spread retries and prevent synchronized thundering-herd storms.',
        'Bulkhead: dedicate separate thread pools (or connection pools) per downstream dependency so one slow service cannot exhaust shared resources and cascade to healthy services.',
        'Every outbound network call must have a timeout — without one, a hung dependency blocks a thread indefinitely, exhausting the pool and cascading the failure in seconds.',
        'Idempotency keys: client generates a UUID per logical operation; server stores (key → response) and returns the cached response on duplicates — essential for payments and order creation.',
        'Graceful degradation: return cached or default responses under load rather than failing hard; shed non-critical features first (recommendations before core search).',
      ],
      quiz: [
        {
          q: 'A circuit breaker between Service A and Service B is in the Open state. Service A receives a new request requiring Service B. What happens?',
          opts: [
            'The call to Service B proceeds normally — "Open" means the connection is active',
            'Service A immediately returns a fallback response without sending any request to Service B',
            'Service A retries Service B 3 times with exponential backoff before failing',
            'Service A queues the request and waits until Service B is healthy',
          ],
          answer: 1,
          explanation: 'When the circuit breaker is Open, outbound calls are short-circuited — no request is sent to Service B at all. A fallback (cached value, default response, or error) is returned immediately. This prevents call pile-up on the failing service and gives it time to recover before the breaker transitions to Half-Open.',
        },
        {
          q: 'Service B goes down. All 10,000 instances of Service A retry simultaneously at T+1s. What problem does this cause, and what prevents it?',
          opts: [
            'Duplicate requests — prevented by idempotency keys stored in a shared cache',
            'Thundering herd — prevented by adding random jitter to each client\'s retry delay so retries spread over time',
            'Circuit breaker trips on Service A — prevented by switching to the Saga pattern',
            'Thread pool exhaustion in Service A — prevented by bulkhead isolation',
          ],
          answer: 1,
          explanation: 'Thundering herd: synchronized retries from thousands of clients create a traffic spike that can overwhelm a service just as it begins recovering, causing it to fail again. Jitter randomizes each client\'s delay — instead of all 10,000 retrying at T+1.000s, they retry uniformly between T+0.5s and T+1.5s, spreading load across 1 second.',
        },
        {
          q: 'Service A has a single shared thread pool of 50 threads for all outbound calls. Service B averages 5s response time; Service C averages 10ms. What failure does a bulkhead prevent?',
          opts: [
            'Service B\'s slow responses fill all 50 threads; no threads are left to call the fast Service C — a healthy service is taken down by a slow one',
            'Service C\'s fast responses consume threads faster than Service B can release them',
            'Bulkheads prevent retry storms from overwhelming downstream dependencies',
            'Bulkheads ensure threads are shared fairly across services for maximum utilization',
          ],
          answer: 0,
          explanation: 'Without bulkheads, Service B\'s 5-second responses can accumulate until all 50 threads are waiting on it. Service C — completely healthy — gets zero threads and fails. A bulkhead dedicates separate pools: 20 threads for Service B, 20 for Service C. Service B\'s slowness is contained and cannot spread.',
        },
        {
          q: 'A user double-clicks "Pay." Both HTTP requests reach the payment service. What pattern prevents the user from being charged twice?',
          opts: [
            'Circuit breaker — it detects identical requests and blocks the second one',
            'Retry with exponential backoff — the second request waits and is deduplicated automatically',
            'Idempotency key — the client sends the same UUID with both requests; the server returns the cached first response for the duplicate',
            'Bulkhead — separate thread pools prevent concurrent payment requests from the same user',
          ],
          answer: 2,
          explanation: 'Idempotency keys are the correct pattern. The client generates a UUID when the user initiates checkout and includes it in every request. The server stores (idempotency_key → response) after the first successful charge. The duplicate request with the same key gets the cached response back — no second charge, even if the first request\'s response was never received by the client.',
        },
      ],
      relatedSystems: ['payment', 'notifications'],
      content: `
<h2>Why resilience patterns matter</h2>
<p>In distributed systems, partial failure is the norm. Services are slow, networks drop packets, dependencies go down unexpectedly. Resilience patterns are the engineering discipline of building systems that remain functional — or degrade gracefully — in the face of these failures. A cascade failure, where one slow dependency takes down an entire platform, is among the most common causes of major production incidents.</p>

<h2>Circuit breaker</h2>
<p>The circuit breaker wraps outbound calls and tracks failure rates. When failures exceed a threshold it "trips" — subsequent calls are short-circuited without touching the downstream service, giving it time to recover.</p>
<div class="formula-box">State: <span class="v">Closed</span> → normal operation, calls pass through<br>Failures exceed threshold → <span class="v">Open</span> → fail fast, no calls sent<br>After timeout, send one probe → <span class="v">Half-Open</span><br>Probe succeeds → back to Closed<br>Probe fails → back to Open</div>
<table class="metrics-table">
  <tr><td>Trip threshold (typical)</td><td class="hl">5 consecutive failures, or &gt;50% error rate over 60s</td></tr>
  <tr><td>Open state duration</td><td class="hl">30–60s before entering Half-Open</td></tr>
  <tr><td>Fallback options</td><td>Return cached response, default value, or enqueue for later</td></tr>
  <tr><td>Libraries</td><td>Resilience4j (Java), Polly (.NET), go-resilience (Go)</td></tr>
</table>

<h2>Retry with exponential backoff and jitter</h2>
<p>Transient failures (momentary network blip, GC pause) are best handled by retry. But naive immediate retry can amplify load on a struggling service.</p>
<div class="formula-box">delay = min(cap, base × 2^attempt) × rand(0.5, 1.5)<br><br>Attempt 1: 1s × ~1.1 = ~1.1s<br>Attempt 2: 2s × ~0.8 = ~1.6s<br>Attempt 3: <span class="v">4s × ~1.3 = ~5.2s</span><br>Cap at max_delay (e.g. 30s)</div>
<div class="info-box">
  <div class="info-box-title">Jitter is not optional</div>
  <div class="info-box-body">Without jitter, every client that received an error at time T retries at exactly T+1s, T+3s, T+7s — synchronized waves of retries that can cause a recovering service to fail again. Jitter spreads retries randomly across a window, converting a synchronized spike into a smooth ramp.</div>
</div>

<h2>Bulkhead</h2>
<p>Named after ship hull compartments that prevent one breach from sinking the vessel. In software, bulkheads isolate resource pools (thread pools, connection pools, semaphores) per downstream dependency.</p>
<table class="metrics-table">
  <tr><td>Without bulkhead</td><td class="warn">1 slow dependency saturates the shared pool; all downstream calls degrade</td></tr>
  <tr><td>With bulkhead</td><td class="hl">Each dependency has its own pool; one slow service stays isolated</td></tr>
  <tr><td>Implementation options</td><td>Thread pool per service, semaphore isolation, separate container/process</td></tr>
</table>

<h2>Timeout: the most critical pattern</h2>
<p>Every outbound call — HTTP, database query, cache lookup — must have a deadline. Without one, a hung dependency blocks a thread until the OS TCP timeout fires (~2 minutes). At high concurrency, threads exhaust within seconds, cascading the failure to every part of the system.</p>
<table class="metrics-table">
  <tr><td>HTTP service call (same region)</td><td class="hl">100ms – 500ms</td></tr>
  <tr><td>HTTP service call (cross-region)</td><td class="hl">500ms – 2s</td></tr>
  <tr><td>Database query timeout</td><td class="hl">1s – 5s (varies by operation complexity)</td></tr>
  <tr><td>No timeout set</td><td class="warn">Thread blocked up to ~2 min (OS TCP default)</td></tr>
</table>

<h2>Idempotency keys</h2>
<p>For non-idempotent operations (payments, order creation), clients generate a UUID per logical operation and send it with every attempt. The server stores <code>(idempotency_key → response)</code> with a TTL (24 hours is common). A duplicate request returns the cached first response — no second charge, no duplicate order.</p>
<p><strong>Implementation:</strong> store in a database unique index on the key. Return HTTP 200 with the original response body on a duplicate. Stripe, PayPal, and Braintree all use this pattern.</p>

<h2>Graceful degradation</h2>
<p>Under extreme load or partial failure, return a degraded but functional response rather than failing hard. Shed non-critical features first, preserving core user value.</p>
<div class="formula-box">Never shed: Auth, core search, checkout, payments<br>Shed under load: <span class="v">Personalized recommendations, analytics</span><br>Shed first: <span class="v">Real-time inventory counts, social proof badges</span></div>
`,
    },

    /* ── 6 ── Probabilistic Data Structures ──────────────── */
    {
      id: 'probabilistic-structures',
      title: 'Probabilistic Data Structures',
      track: 'patterns',
      difficulty: 'intermediate',
      readingMins: 11,
      keyPoints: [
        'Bloom filter: O(1) insert and membership test, zero false negatives, tunable false positive rate — 1% FPR requires only ~9.6 bits/element vs ~64 bits/element for a HashSet.',
        'Count-Min Sketch: frequency estimation using d hash functions × w counters; estimates are always ≥ true count (overestimates, never underestimates); ideal for Top-K heavy hitters.',
        'HyperLogLog: estimates cardinality (count distinct) with ~1.625% standard error using only 12–16 KB of memory — can estimate billions of unique IPs in a single Redis key.',
        'MinHash: approximates Jaccard similarity between sets using compact signatures; used for near-duplicate document detection and collaborative filtering at web scale.',
        'All probabilistic structures trade a bounded, tunable error rate for orders-of-magnitude reductions in memory and processing time vs exact structures.',
        'Bloom filters have no false negatives: "not in set" is always correct — making them ideal as a fast pre-filter before an expensive database or disk lookup.',
      ],
      quiz: [
        {
          q: 'A Bloom filter for a URL shortener\'s "used aliases" set returns "possibly in set" for a new alias candidate. What is the correct action?',
          opts: [
            'The alias is definitely taken — reject it immediately and generate a new one',
            'The alias is possibly taken (false positive possible) — perform a definitive database lookup to confirm before rejecting',
            'The alias is definitely available — the Bloom filter result is always reliable',
            'Rebuild the Bloom filter to remove the false positive entry',
          ],
          answer: 1,
          explanation: 'A Bloom filter has false positives (reports "in set" when it isn\'t) but zero false negatives. "Possibly in set" means: it might be there, or this might be a false positive. Always confirm positive results with a definitive lookup. On a negative result ("not in set"), you can trust it completely and skip the database query entirely — which is the whole point.',
        },
        {
          q: 'You need to count unique visitors to a site receiving 10 billion page views per day. A HashSet of 64-bit user IDs would need ~80 GB of RAM. What structure reduces this to kilobytes with ~2% error?',
          opts: [
            'Bloom filter',
            'Count-Min Sketch',
            'HyperLogLog',
            'MinHash',
          ],
          answer: 2,
          explanation: 'HyperLogLog estimates cardinality (count distinct) with ~1.625% standard error using only 12–16 KB, regardless of whether you\'ve seen 1,000 or 1 trillion unique values. Redis\'s PFADD/PFCOUNT commands implement HyperLogLog natively. Google Analytics, Cloudflare, and Twitter use HyperLogLog variants for massive-scale unique visitor counting.',
        },
        {
          q: 'You want to identify the 100 most-requested URLs out of 1 trillion total requests, using minimal memory. Which structure is best suited?',
          opts: [
            'Bloom filter — check set membership for candidate heavy-hitter URLs',
            'HyperLogLog — estimate the distinct request count per URL',
            'Count-Min Sketch paired with a min-heap of size 100 to maintain the Top-K list',
            'MinHash — estimate Jaccard similarity between URL request patterns',
          ],
          answer: 2,
          explanation: 'Count-Min Sketch estimates the frequency of any item (how many times each URL was requested) using a fixed-size 2D counter array. Pair it with a size-100 min-heap: for each URL request, increment the sketch, then check if this URL\'s estimated count exceeds the heap minimum and update accordingly. Memory is O(d×w) for the sketch plus O(K) for the heap — independent of the number of distinct URLs.',
        },
        {
          q: 'A search engine must identify near-duplicate web pages (same content, slightly different wording) across billions of documents. Which structure enables efficient large-scale similarity comparison?',
          opts: [
            'Bloom filter — check whether document tokens appear in a known vocabulary set',
            'HyperLogLog — estimate the count of distinct tokens per document',
            'Count-Min Sketch — find documents with matching token frequency profiles',
            'MinHash — approximate Jaccard similarity; documents with many matching signature values are near-duplicates',
          ],
          answer: 3,
          explanation: 'MinHash approximates Jaccard similarity (|A∩B| / |A∪B|) between two documents represented as token sets. Each document is reduced to a compact signature of K minimum hash values. The fraction of matching signature positions estimates the Jaccard similarity — without comparing full document content. Google\'s SimHash is a related technique used for large-scale web crawl deduplication.',
        },
      ],
      relatedSystems: ['web-crawler', 'distributed-cache'],
      content: `
<h2>Why approximate data structures?</h2>
<p>Exact data structures (HashSet, HashMap) require memory proportional to the data they store. At hyperscale — billions of unique users, trillions of events, petabytes of logs — exact structures are impractical. Probabilistic data structures sacrifice a small, bounded error rate for dramatic reductions in memory and processing time.</p>
<div class="formula-box">Exact HashSet (1B items × 8 bytes) = <span class="v">~8 GB RAM</span><br>HyperLogLog (same 1B unique items) = <span class="v">~16 KB RAM</span><br>Error: ±1.625%</div>

<h2>Bloom filter</h2>
<p>A Bloom filter answers the question: "Have I seen this element before?" It uses a bit array of size <em>m</em> and <em>k</em> independent hash functions. To insert: set bits at all k hash positions to 1. To query: check all k positions — if any bit is 0, the element is <strong>definitely not</strong> in the set; if all are 1, it is <strong>probably</strong> in the set.</p>
<table class="metrics-table">
  <tr><td>False negatives</td><td class="hl">Impossible — "not in set" is always correct</td></tr>
  <tr><td>False positives</td><td>Possible — "in set" may be a false alarm</td></tr>
  <tr><td>Memory at 1% FPR</td><td class="hl">~9.6 bits/element (~1.2 MB for 1M items)</td></tr>
  <tr><td>Memory at 0.1% FPR</td><td>~14.4 bits/element (~1.8 MB for 1M items)</td></tr>
  <tr><td>Optimal hash function count</td><td class="hl">k = (m/n) × ln 2 ≈ 0.693 × (m/n)</td></tr>
</table>
<p><strong>Real-world use cases:</strong> Cassandra and HBase use Bloom filters to avoid reading SSTable files that don't contain a queried key (saving disk I/O). Google Chrome used Bloom filters for its Safe Browsing malicious URL list. URL shorteners use them as a fast "is this alias taken?" pre-check before querying the database.</p>

<h2>Count-Min Sketch</h2>
<p>Count-Min Sketch estimates how frequently items appear in a stream. It uses a 2D array of counters — <em>d</em> rows × <em>w</em> columns — with one distinct hash function per row. To increment an item: for each row <em>i</em>, increment <code>table[i][hash_i(item) % w]</code>. To query: return the minimum value across all rows (hash collisions cause overcounting, never undercounting — hence "min").</p>
<table class="metrics-table">
  <tr><td>Error guarantee</td><td>Estimate ≤ true count + ε × N (where N = total items processed)</td></tr>
  <tr><td>Direction of error</td><td class="warn">Always overestimates — never underestimates</td></tr>
  <tr><td>Memory</td><td class="hl">Fixed O(d × w) regardless of stream size or cardinality</td></tr>
  <tr><td>Use cases</td><td class="hl">Top-K heavy hitters, network traffic analysis, trending hashtags</td></tr>
</table>

<h2>HyperLogLog</h2>
<p>HyperLogLog estimates cardinality — how many distinct items have been seen. It exploits a statistical property of hash functions: the maximum run of leading zeros in a set of hash values grows logarithmically with the number of distinct elements. By tracking the maximum leading-zero run across <em>m</em> registers, it estimates cardinality with remarkable accuracy using a tiny amount of memory.</p>
<table class="metrics-table">
  <tr><td>Standard error</td><td class="hl">±1.625% with 16 KB (2,048 registers)</td></tr>
  <tr><td>Maximum estimable cardinality</td><td class="hl">Effectively unbounded — works for trillions</td></tr>
  <tr><td>Mergeable</td><td class="hl">Yes — union of two HLL sketches gives cardinality of the union set</td></tr>
  <tr><td>Redis support</td><td>PFADD / PFCOUNT / PFMERGE — each key uses at most 12 KB</td></tr>
</table>
<div class="info-box">
  <div class="info-box-title">Why mergeability matters</div>
  <div class="info-box-body">Each regional data center can maintain its own HyperLogLog of unique visitors. At reporting time, merge all regional HLLs in O(m) time — the result is a global unique visitor count. With exact structures, this would require shipping billions of user IDs to a central location and deduplicating them.</div>
</div>

<h2>MinHash and Jaccard similarity</h2>
<p>MinHash approximates the Jaccard similarity between two sets: <code>J(A,B) = |A ∩ B| / |A ∪ B|</code>. Each set is hashed with K hash functions, keeping the minimum hash value for each function. The resulting K-element signature is compact. The probability that two sets share the same minimum hash under function <em>h</em> is exactly their Jaccard similarity — so the fraction of matching signature elements estimates J(A,B).</p>
<table class="metrics-table">
  <tr><td>Use cases</td><td class="hl">Near-duplicate detection, document similarity, collaborative filtering</td></tr>
  <tr><td>Signature size</td><td class="hl">200 hashes → ~7% standard error on similarity estimate</td></tr>
  <tr><td>Scale</td><td class="hl">Compare billions of document pairs in O(signature_size) each</td></tr>
  <tr><td>Related technique</td><td>Locality-Sensitive Hashing (LSH) for approximate nearest-neighbor search</td></tr>
</table>

<h2>Decision guide</h2>
<div class="formula-box">Membership test, memory-constrained → <span class="v">Bloom filter</span><br>Frequency estimation / Top-K → <span class="v">Count-Min Sketch</span><br>Count distinct (cardinality) → <span class="v">HyperLogLog</span><br>Set similarity / near-duplicates → <span class="v">MinHash + LSH</span><br>Exact answer required → <span class="r">Use an exact data structure</span></div>
`,
    },
  ];
})();
