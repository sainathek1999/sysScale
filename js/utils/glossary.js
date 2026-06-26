/* ============================================================
   glossary.js — Term definitions + DOM tooltip injection
   ============================================================ */
window.SS = window.SS || {};

window.SS.GLOSSARY = {
  'DAU':              'Daily Active Users — unique users who engage with a product on a given day.',
  'QPS':              'Queries Per Second — throughput measure for read/write operations.',
  'TPS':              'Transactions Per Second — typically used for database or payment workloads.',
  'RPS':              'Requests Per Second — HTTP/API throughput at the application layer.',
  'CDN':              'Content Delivery Network — geographically distributed servers that cache static assets close to users.',
  'SFU':              'Selective Forwarding Unit — media server that relays individual streams without transcoding.',
  'MCU':              'Multipoint Control Unit — media server that mixes all streams into one composite output.',
  'TURN':             'Traversal Using Relays around NAT — relay server for WebRTC connections that fail direct NAT traversal.',
  'STUN':             'Session Traversal Utilities for NAT — server used to discover a client\'s public IP and port.',
  'P2P':              'Peer-to-Peer — direct connection between two endpoints without a server relay.',
  'WAL':              'Write-Ahead Log — append-only log written before any data page is modified; basis for crash recovery.',
  'MVCC':             'Multi-Version Concurrency Control — readers never block writers; each txn sees a consistent snapshot.',
  'ACID':             'Atomicity, Consistency, Isolation, Durability — the four properties of reliable database transactions.',
  'CAP':              'Consistency, Availability, Partition tolerance — you can guarantee at most two out of three (Brewer\'s theorem).',
  'AP':               'Available + Partition-tolerant (from CAP theorem) — system stays up during network splits but may return stale data.',
  'CP':               'Consistent + Partition-tolerant (from CAP theorem) — system returns correct data or errors, never stale, during network splits.',
  'LRU':              'Least Recently Used — cache eviction policy that removes the entry accessed least recently.',
  'LFU':              'Least Frequently Used — cache eviction policy that removes the entry hit least often.',
  'TTL':              'Time-To-Live — duration after which a cached value or record expires and is discarded.',
  'HPA':              'Horizontal Pod Autoscaler — Kubernetes controller that scales pod replicas based on CPU/memory/custom metrics.',
  'SLA':              'Service Level Agreement — contractual commitment on availability, latency, or error rate (e.g., 99.9% uptime).',
  'SLO':              'Service Level Objective — internal target for a reliability metric (e.g., p99 latency < 200ms).',
  'SLI':              'Service Level Indicator — the actual measured metric used to evaluate an SLO.',
  'RPO':              'Recovery Point Objective — maximum acceptable data loss measured in time (how old can the latest backup be?).',
  'RTO':              'Recovery Time Objective — maximum acceptable downtime after a failure before service must be restored.',
  'Sharding':         'Horizontal partitioning — splitting a dataset across multiple DB nodes by a shard key (e.g., user_id % N).',
  'Consistent hashing': 'Hash ring technique where adding/removing nodes remaps only ~1/N of keys — minimises reshuffling vs modulo hashing.',
  'Fanout':           'Broadcasting a single write event to multiple downstream consumers — e.g., posting to all followers\' timelines.',
  'Idempotency':      'Property where repeating an operation N times produces the same result as running it once; essential for safe retries.',
  'Backpressure':     'Flow-control mechanism where a slow consumer signals the producer to slow down, preventing queue overflow.',
  'Hot partition':    'A shard or partition receiving disproportionately high traffic — often caused by a skewed key distribution.',
  'Thundering herd':  'Sudden spike in requests when a cache expires or a server restarts and all clients retry simultaneously.',
  'Little\'s Law':    'L = λW — steady-state queue length equals arrival rate × average time in system. Core capacity formula.',
  'Saga':             'Pattern for distributed transactions: a sequence of local transactions with compensating rollbacks on failure.',
  'Two-phase commit': '2PC — distributed commit protocol: prepare phase (all nodes vote), then commit phase (all nodes apply). Blocking on coordinator failure.',
  'Event sourcing':   'Store state as an append-only sequence of events; current state derived by replaying the event log.',
  'CQRS':             'Command Query Responsibility Segregation — separate write model (commands) from read model (queries).',
  'Bloom filter':     'Probabilistic data structure: answers "is X in the set?" with zero false negatives and tunable false positive rate.',
  'Simulcast':        'Publisher sends multiple resolution tiers simultaneously; SFU selects the right tier per receiver based on bandwidth.',
  'HyperLogLog':      'Probabilistic cardinality estimator — counts unique values using O(log log N) space with ~2% error.',
  'QuadTree':         'Tree that recursively subdivides 2D space into four quadrants; used for geospatial indexing.',
  'Cassandra':        'Wide-column NoSQL DB optimised for high-write, time-series workloads; AP system with tunable consistency.',
  'Kafka':            'Distributed event streaming platform; partitioned append-only log with consumer groups for parallel consumption.',
  'Redis':            'In-memory data structure store; supports strings, hashes, sorted sets, lists, streams, pub/sub.',
  'Zookeeper':        'Distributed coordination service for leader election, configuration management, and distributed locks.',
  'etcd':             'Strongly consistent distributed key-value store using Raft; Kubernetes control plane backing store.',
  'H3':               'Uber\'s hierarchical hexagonal geospatial grid; each cell has a unique 64-bit ID for O(1) lat/lng lookup.',
  'WebSocket':        'Persistent bidirectional TCP connection over HTTP; enables server-push without client polling.',
  'WebRTC':           'Browser API for real-time peer-to-peer audio, video, and data using DTLS-SRTP encryption.',
};

/* Inject tooltip spans into a DOM container for known terms */
window.SS.applyGlossary = function (container) {
  const terms = Object.keys(window.SS.GLOSSARY);
  // Sort longest first to match multi-word terms before sub-terms
  terms.sort((a, b) => b.length - a.length);

  // Build one alternation regex for all terms (case-sensitive boundary match)
  const escaped  = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern  = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'g');

  // Walk only .step-body elements to avoid touching formula spans etc.
  const bodies = container.querySelectorAll('.step-body, .tips-box');
  bodies.forEach(body => {
    wrapTextNodes(body, pattern);
  });
};

function wrapTextNodes(node, pattern) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (!pattern.test(text)) return;
    pattern.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'g-tip';
      span.setAttribute('data-def', window.SS.GLOSSARY[m[1]] || '');
      span.textContent = m[1];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
    return;
  }

  // Skip script/style/code/already-wrapped nodes
  const skip = new Set(['SCRIPT','STYLE','CODE','SPAN','STRONG','EM','A']);
  if (skip.has(node.nodeName)) return;

  // Clone childNodes list — modifying live collection while iterating is unsafe
  Array.from(node.childNodes).forEach(child => wrapTextNodes(child, pattern));
}
