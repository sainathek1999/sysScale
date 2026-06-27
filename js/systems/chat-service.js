/* ============================================================
   chat-service.js — Chat Service system definition
   ============================================================ */
(function () {
  const { fmt, fmtB, drawArch } = window.SS;

  window.SS.register('chat-service', {
    name: 'Chat Service',
    icon: '💬',
    params: {
      dau:     { label: 'Daily active users', options: ['1M', '10M', '100M', '500M', '1B'], values: [1e6, 10e6, 100e6, 500e6, 1e9], def: 2 },
      msgDay:  { label: 'Messages / user / day', options: ['10', '50', '100', '500', '1K'], values: [10, 50, 100, 500, 1000], def: 2 },
      msgSize: { label: 'Avg message size', options: ['100B', '500B', '1KB', '5KB'], values: [100, 500, 1000, 5000], def: 1 },
      history: { label: 'Message retention', options: ['30d', '90d', '1yr', '5yr', '∞'], values: [30, 90, 365, 1825, 36500], def: 2 },
    },

    compute(p) {
      const dau = p.dau.v, totalMsgDay = dau * p.msgDay.v;
      const writeMsgRps = Math.round(totalMsgDay / 86400), readMsgRps = writeMsgRps * 5;
      const peakRps = (writeMsgRps + readMsgRps) * 3;
      const wsConns = dau * 0.1, wsServers = Math.max(1, Math.ceil(wsConns / 50000));
      const msgStorage = totalMsgDay * p.msgSize.v * p.history.v;
      const fanoutWorkers = Math.max(1, Math.ceil(writeMsgRps / 10000));
      return {
        dau, totalMsgDay, writeMsgRps, readMsgRps, peakRps, wsConns, msgStorage, wsServers, fanoutWorkers,
        msgSize: p.msgSize.v, history: p.history.v, msgDay: p.msgDay.v,
        bottleneck: wsConns > 500000 ? `${fmt(wsConns)} concurrent WebSocket connections — need ${wsServers} WS servers, hash by user_id` : null
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.writeMsgRps), lbl: 'Write RPS', cls: 'accent' },
        { val: fmt(c.wsConns), lbl: 'WS connections', cls: 'amber' },
        { val: fmtB(c.msgStorage), lbl: 'Msg storage', cls: 'teal' },
        { val: c.wsServers, lbl: 'WS servers', cls: 'purple' },
        { val: c.fanoutWorkers, lbl: 'Fanout workers', cls: 'green' },
      ];
    },

    steps(c, p) {
      return [
        { title: 'Clarify scope', summary: 'Protocol & features', body: `<table class="metrics-table">
          <tr><td>Real-time protocol</td><td class="hl">WebSockets (persistent, bidirectional)</td></tr>
          <tr><td>Delivery guarantee</td><td>At-least-once + dedup by msg_id</td></tr>
          <tr><td>Max group size</td><td>500 members (affects fanout cost)</td></tr>
          <tr><td>Online presence</td><td>Heartbeat + last-seen tracking</td></tr>
          <tr><td>Media support</td><td>Text first; media via separate CDN upload</td></tr>
        </table>` },
        { title: 'Connection estimation', summary: `${fmt(c.wsConns)} concurrent WS`, body: `<div class="formula-box">
concurrent = DAU × 10% (active simultaneously)<br>
= <span class="v">${fmt(c.dau)}</span> × 0.10 = <span class="r">${fmt(c.wsConns)}</span> WS connections<br>
WS servers = ceil(${fmt(c.wsConns)} ÷ 50,000) = <span class="r">${c.wsServers}</span></div>
<table class="metrics-table">
  <tr><td>Concurrent users</td><td class="hl">${fmt(c.wsConns)}</td></tr>
  <tr><td>Connections per server</td><td>50,000</td></tr>
  <tr><td>WebSocket servers needed</td><td class="hl">${c.wsServers}</td></tr>
</table>` },
        { title: 'Message throughput', summary: `${fmt(c.writeMsgRps)} writes/s`, body: `<div class="formula-box">
write_rps = ${fmt(c.dau)} × ${c.msgDay}/day ÷ 86,400 = <span class="r">${fmt(c.writeMsgRps)}</span><br>
read_rps ≈ write × 5 (history + delivery) = <span class="r">${fmt(c.readMsgRps)}</span></div>
<table class="metrics-table">
  <tr><td>Messages / day</td><td>${fmt(c.totalMsgDay)}</td></tr>
  <tr><td>Write RPS</td><td class="hl">${fmt(c.writeMsgRps)}</td></tr>
  <tr><td>Read RPS</td><td class="hl">${fmt(c.readMsgRps)}</td></tr>
  <tr><td>Peak RPS (3×)</td><td class="warn">${fmt(c.peakRps)}</td></tr>
</table>` },
        { title: 'Storage estimation', summary: `${fmtB(c.msgStorage)} total`, body: `<div class="formula-box">
daily = ${fmt(c.totalMsgDay)} msgs × ${c.msgSize}B = <span class="v">${fmtB(c.totalMsgDay * c.msgSize)}</span>/day<br>
retention = ${c.history} days<br>
total = <span class="r">${fmtB(c.msgStorage)}</span></div>
<table class="metrics-table">
  <tr><td>Messages / day</td><td>${fmt(c.totalMsgDay)}</td></tr>
  <tr><td>Avg message size</td><td>${c.msgSize} B</td></tr>
  <tr><td>Retention period</td><td>${c.history} days</td></tr>
  <tr><td>Total storage</td><td class="hl">${fmtB(c.msgStorage)}</td></tr>
</table>` },
        { title: 'Fanout & delivery', summary: `Hybrid + ${c.fanoutWorkers} workers`, body: `<table class="metrics-table">
  <tr><td>Fanout strategy</td><td class="hl">Hybrid (push small, pull large)</td></tr>
  <tr><td>Message queue</td><td>Kafka — ordered, durable, replayable</td></tr>
  <tr><td>Fanout workers</td><td class="good">${c.fanoutWorkers}</td></tr>
  <tr><td>Presence backend</td><td>Redis pub/sub + 30s heartbeat</td></tr>
  <tr><td>Offline delivery</td><td>User inbox table, drain on reconnect</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Fanout strategy by group size</div>
<div class="info-box-body">≤100 members: push to each inbox on write. 100–500: fan out via Kafka consumers. Broadcast channels: pull model where clients poll on open.</div></div>` },
      ];
    },

    arch(c) {
      return drawArch([
        { id: 'client', x: 110, y: 10, w: 140, h: 34, label: 'Clients', color: '#2BA07E' },
        { id: 'lb', x: 80, y: 72, w: 200, h: 34, label: 'Load Balancer', color: '#2BA07E' },
        { id: 'ws', x: 45, y: 136, w: 270, h: 34, label: `WS Servers (${c.wsServers})`, color: c.wsConns > 500000 ? '#ef4444' : '#14b8a6' },
        { id: 'kafka', x: 80, y: 200, w: 200, h: 34, label: 'Kafka (queue)', color: '#f59e0b' },
        { id: 'fanout', x: 45, y: 264, w: 120, h: 34, label: `Fanout (${c.fanoutWorkers})`, color: '#a855f7' },
        { id: 'db', x: 195, y: 264, w: 130, h: 34, label: 'Cassandra', color: '#14b8a6' },
        { id: 'redis', x: 80, y: 328, w: 200, h: 34, label: 'Redis (presence)', color: '#22c55e' },
      ], [
        { from: 'client', to: 'lb', label: '' },
        { from: 'lb', to: 'ws', label: 'WS upgrade' },
        { from: 'ws', to: 'kafka', label: 'publish' },
        { from: 'kafka', to: 'fanout', label: 'consume' },
        { from: 'fanout', to: 'db', label: 'persist' },
        { from: 'ws', to: 'redis', label: 'presence' },
      ]);
    },

    components() {
      return [
        { icon: '📨', name: 'Kafka', best: true, reason: 'Durable ordered queue with replay. Fan-out consumers scale independently per channel type. Topic-per-conversation or hash partitioning.', stats: ['Durable', 'Ordered', 'Replayable', 'High throughput'] },
        { icon: '🗄️', name: 'Cassandra', best: true, reason: 'Wide-row model is ideal: partition by chat_id, sort by timestamp. Reading a conversation = single partition scan.', stats: ['Wide rows', 'Time-sort', 'Linear scale', '<5ms P99'] },
        { icon: '🔌', name: 'WebSocket', best: true, reason: 'Persistent bidirectional connection. Server push without polling. Sticky sessions via consistent hashing to WS server.', stats: ['Persistent', 'Bidirectional', '50K/server', 'Low latency'] },
      ];
    },

    tradeoffs() {
      return [
        { algo: 'Push fanout', pro: 'Low read latency, instant', con: 'Expensive for large groups' },
        { algo: 'Pull fanout', pro: 'Scales to huge groups', con: 'Higher latency, polling' },
        { algo: 'Hybrid (best)', pro: 'Best of both worlds', con: 'Added routing complexity' },
      ];
    },

    tips: [
      'Sticky WS sessions: hash user_id to WS server — else you need pub/sub between all servers per message',
      'Client-generated UUID as msg_id gives idempotency — safe to retry without creating duplicates',
      'Cassandra schema: partition_key=channel_id, clustering_key=msg_id DESC for newest-first reads',
      'Presence: heartbeat every 30s to Redis with 60s TTL — query once on open, subscribe to changes after',
      'Read receipts are high-volume; batch them and send asynchronously, not per-message',
    ],
  });
})();
