/* ============================================================
   message-queue.js — Message Queue / Event Streaming (Kafka)
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('message-queue', {
    name: 'Message Queue',
    icon: '📨',
    params: {
      producers:  { label: 'Producer count',       options: ['10','100','1K','10K'],          values: [10,100,1e3,1e4],          def: 1 },
      msgRate:    { label: 'Messages / producer / s', options: ['1','10','100','1K'],          values: [1,10,100,1e3],            def: 1 },
      msgSize:    { label: 'Message size',          options: ['100 B','1 KB','10 KB','1 MB'], values: [100,1e3,1e4,1e6],          def: 1 },
      retention:  { label: 'Retention period',      options: ['1 day','7 days','30 days','90 days'], values: [1,7,30,90],         def: 1 },
      replication:{ label: 'Replication factor',    type: 'select',
        options: ['1× (no replication)','3× (standard)','5× (high durability)'], values: [1,3,5], def: 1 },
    },

    compute(p) {
      const producers = p.producers.v, msgRate = p.msgRate.v;
      const msgSize = p.msgSize.v, retention = p.retention.v, repl = p.replication.v;
      const totalMsgPerSec = producers * msgRate;
      const throughputBytes = totalMsgPerSec * msgSize;
      const throughputBits  = throughputBytes * 8;
      // Each Kafka partition safely handles ~10 MB/s
      const partitions = Math.max(1, Math.ceil(throughputBytes / 10e6));
      // Storage: throughput × retention × replication
      const retentionBytes = throughputBytes * retention * 86400 * repl;
      const brokersByStorage    = Math.max(3, Math.ceil(retentionBytes / 2e12));
      const brokersByThroughput = Math.max(3, Math.ceil(throughputBytes / 200e6));
      const brokers = Math.max(brokersByStorage, brokersByThroughput);
      const consumerLag = 0; // nominal
      return {
        producers, msgRate, msgSize, retention, repl,
        totalMsgPerSec, throughputBytes, throughputBits, partitions,
        retentionBytes, brokers,
        bottleneck: brokers > 20
          ? `Cluster needs ${brokers} brokers. Enable Snappy compression and consider shorter retention.`
          : throughputBytes > 100e6
          ? `Throughput (${fmtBw(throughputBits)}) is high. Enable producer batching (linger.ms=5, batch.size=64KB).`
          : null,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.totalMsgPerSec), lbl: 'Messages/s',  cls: 'accent' },
        { val: fmtBw(c.throughputBits), lbl: 'Throughput', cls: 'amber' },
        { val: c.partitions,          lbl: 'Partitions',  cls: 'teal' },
        { val: c.brokers,             lbl: 'Brokers',     cls: 'purple' },
        { val: fmtB(c.retentionBytes), lbl: 'Stored data', cls: 'green' },
      ];
    },

    steps(c) {
      return [
        { title: 'Clarify scope', summary: 'Delivery, ordering, replay needs', body: `<table class="metrics-table">
  <tr><td>Delivery guarantee</td><td>At-least-once (default) or exactly-once</td></tr>
  <tr><td>Message ordering</td><td>Per-partition (guaranteed within partition)</td></tr>
  <tr><td>Consumer model</td><td>Pull — consumers control pace</td></tr>
  <tr><td>Replay required?</td><td class="warn">Yes → Kafka; No → RabbitMQ/SQS simpler</td></tr>
  <tr><td>Schema evolution</td><td>Avro + Schema Registry</td></tr>
</table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.totalMsgPerSec)} msg/s · ${fmtBw(c.throughputBits)}`, body: `<div class="formula-box">
total msg/s = producers × rate/producer<br>
&nbsp;&nbsp;= <span class="v">${fmt(c.producers)}</span> × <span class="v">${fmt(c.msgRate)}</span> = <span class="r">${fmt(c.totalMsgPerSec)}</span><br>
throughput = msg/s × size = <span class="r">${fmtBw(c.throughputBits)}</span></div>
<table class="metrics-table">
  <tr><td>Producers</td><td>${fmt(c.producers)}</td></tr>
  <tr><td>Rate per producer</td><td>${fmt(c.msgRate)} msg/s</td></tr>
  <tr><td>Total messages/s</td><td class="hl">${fmt(c.totalMsgPerSec)}</td></tr>
  <tr><td>Wire throughput</td><td class="hl">${fmtBw(c.throughputBits)}</td></tr>
</table>` },
        { title: 'Partition sizing', summary: `${c.partitions} partitions needed`, body: `<div class="formula-box">
partition capacity = ~10 MB/s (safe sequential write)<br>
partitions = ceil(<span class="v">${fmtBw(c.throughputBits)}</span> ÷ 80 Mbps) = <span class="r">${c.partitions}</span></div>
<table class="metrics-table">
  <tr><td>Single partition capacity</td><td>~10 MB/s</td></tr>
  <tr><td>Partitions needed</td><td class="hl">${c.partitions}</td></tr>
  <tr><td>Partitions per broker</td><td>${Math.ceil(c.partitions / c.brokers)} avg</td></tr>
  <tr><td>Ordering scope</td><td>Per-partition only</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Partition key design</div><div class="info-box-body">Route messages by user_id or entity_id for ordering guarantees within a user session. Never use a constant key (routes all traffic to one partition).</div></div>` },
        { title: 'Storage & retention', summary: `${fmtB(c.retentionBytes)} · ${c.retention} days × ${c.repl}×`, body: `<div class="formula-box">
storage = throughput × retention_days × 86,400 × replication<br>
= <span class="v">${fmtBw(c.throughputBits)}</span> ÷ 8 × <span class="v">${c.retention}</span>d × 86,400 × <span class="v">${c.repl}</span> = <span class="r">${fmtB(c.retentionBytes)}</span></div>
<table class="metrics-table">
  <tr><td>Raw throughput</td><td>${fmtB(c.throughputBytes)}/s</td></tr>
  <tr><td>Retention</td><td>${c.retention} days</td></tr>
  <tr><td>Replication factor</td><td>${c.repl}×</td></tr>
  <tr><td>Total broker storage</td><td class="hl">${fmtB(c.retentionBytes)}</td></tr>
</table>` },
        { title: 'Broker count', summary: `${c.brokers} brokers (3 Zookeeper/KRaft)`, body: `<div class="formula-box">
brokers_by_storage = ceil(${fmtB(c.retentionBytes)} ÷ 2 TB) = ${Math.max(3, Math.ceil(c.retentionBytes/2e12))}<br>
brokers_by_throughput = ceil(${fmtBw(c.throughputBits)} ÷ 1.6 Gbps) = ${Math.max(3, Math.ceil(c.throughputBytes/200e6))}<br>
<span class="r">effective brokers = ${c.brokers}</span></div>
<table class="metrics-table">
  <tr><td>Broker storage (2 TB SSD)</td><td>2 TB each</td></tr>
  <tr><td>Broker throughput cap</td><td>200 MB/s each</td></tr>
  <tr><td>Broker count</td><td class="hl">${c.brokers}</td></tr>
  <tr><td>Coordination</td><td>KRaft (replaces Zookeeper)</td></tr>
</table>` },
      ];
    },

    arch(c) {
      const hot = c.throughputBytes > 100e6;
      return drawArch([
        { id: 'prod', x: 75,  y: 14,  w: 210, h: 34, label: `Producers (${fmt(c.producers)})`,  color: '#2BA07E' },
        { id: 'kfk',  x: 35,  y: 76,  w: 290, h: 34, label: `Kafka Cluster (${c.brokers} brokers)`, color: hot ? '#ef4444' : '#f59e0b' },
        { id: 'part', x: 55,  y: 140, w: 250, h: 34, label: `${c.partitions} Partitions · ${c.repl}× replicas`, color: '#f59e0b', dim: true },
        { id: 'cons', x: 75,  y: 204, w: 210, h: 34, label: 'Consumer Groups',              color: '#14b8a6' },
        { id: 'ds',   x: 85,  y: 272, w: 190, h: 34, label: 'Downstream Services / DB',    color: '#a855f7' },
      ], [
        { from: 'prod', to: 'kfk',  label: 'produce' },
        { from: 'kfk',  to: 'part', label: 'replicate' },
        { from: 'kfk',  to: 'cons', label: 'poll' },
        { from: 'cons', to: 'ds',   label: 'process' },
      ]);
    },

    components() {
      return [
        { icon: '📊', name: 'Apache Kafka', best: true, reason: 'Durable, replay, high-throughput sequential I/O, exactly-once semantics via idempotent producers. Standard for event streaming.', stats: ['1M msgs/s/broker','Replay','Exactly-once'] },
        { icon: '🐇', name: 'RabbitMQ',     best: false, reason: 'Better for task queues with complex routing (AMQP), dead-letter queues. No native replay or long-term retention.', stats: ['Smart routing','Dead-letter','No replay'] },
        { icon: '⚡', name: 'AWS SQS',      best: false, reason: 'Fully managed, near-zero ops. Limited to 256 KB per message, no replay, no ordering (FIFO queue for ordering costs 3×).', stats: ['Managed','256 KB limit','No replay'] },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'At-least-once',   pro: 'No message loss',              con: 'Consumers must be idempotent' },
        { algo: 'At-most-once',    pro: 'Lowest latency (fire & forget)', con: 'Messages can be lost on failure' },
        { algo: 'Exactly-once',    pro: 'No duplicates, no loss',        con: '~30% throughput penalty; requires idempotent producers + transactional API' },
      ];
    },

    tips: [
      'Partition count cannot be reduced — plan for 3–10× future throughput when creating topics',
      'Use consumer group ID carefully: same group ID = competing consumers; different group = fan-out',
      'Set min.insync.replicas=2 with acks=all for durability; acks=1 loses data if leader crashes mid-write',
      'Kafka consumer offset commit strategy: manual commit after successful processing prevents loss during restarts',
      'Monitor consumer lag (kafka.consumer.lag) — sustained lag means consumers can\'t keep up with producers',
    ],
  });
})();
