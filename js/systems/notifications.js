/* ============================================================
   notifications.js — Notification Service system definition
   ============================================================ */
(function () {
  const { fmt, fmtB, drawArch } = window.SS;

  window.SS.register('notifications', {
    name: 'Notification Service',
    icon: '🔔',
    params: {
      dau:     { label: 'Daily active users', options: ['1M', '10M', '100M', '500M', '1B'], values: [1e6, 10e6, 100e6, 500e6, 1e9], def: 2 },
      npu:     { label: 'Notifications / user / day', options: ['1', '5', '10', '50', '100'], values: [1, 5, 10, 50, 100], def: 1 },
      pctPush: { label: 'Push notification %', options: ['20%', '40%', '60%', '80%', '100%'], values: [0.2, 0.4, 0.6, 0.8, 1.0], def: 2 },
    },

    compute(p) {
      const dau = p.dau.v, totalPerDay = dau * p.npu.v;
      const rps = Math.round(totalPerDay / 86400), peak = rps * 10;
      const pushRps = Math.round(peak * p.pctPush.v), emailRps = Math.round(peak * (1 - p.pctPush.v) * 0.5);
      const workers = Math.max(1, Math.ceil(peak / 5000)), queueMem = peak * 200;
      return {
        dau, totalPerDay, rps, peak, pushRps, emailRps, workers, queueMem, pctPush: p.pctPush.v, npu: p.npu.v,
        bottleneck: peak > 100000 ? `${fmt(peak)} peak RPS — queue with ${workers} workers to absorb the burst and avoid a thundering herd` : null
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.rps), lbl: 'Avg RPS', cls: 'accent' },
        { val: fmt(c.peak), lbl: 'Peak RPS', cls: 'amber' },
        { val: fmt(c.pushRps), lbl: 'Push/s', cls: 'teal' },
        { val: c.workers, lbl: 'Workers', cls: 'purple' },
        { val: fmtB(c.queueMem), lbl: 'Queue memory', cls: 'green' },
      ];
    },

    steps(c, p) {
      return [
        { title: 'Clarify scope', summary: 'Channels & delivery', body: `<table class="metrics-table">
          <tr><td>Channels</td><td>Push (APNs/FCM), Email, SMS, In-app</td></tr>
          <tr><td>Priority levels</td><td>Critical (sync) / Normal (async)</td></tr>
          <tr><td>Retry policy</td><td>Exponential backoff, max 3 attempts</td></tr>
          <tr><td>Deduplication</td><td>Content hash + user_id in 24h window</td></tr>
          <tr><td>Opt-out</td><td>Per user / per channel / per type</td></tr>
        </table>` },
        { title: 'Traffic estimation', summary: `${fmt(c.rps)} avg, ${fmt(c.peak)} peak RPS`, body: `<div class="formula-box">
total/day = ${fmt(c.dau)} × ${c.npu} = <span class="v">${fmt(c.totalPerDay)}</span><br>
avg_rps = ÷ 86,400 = <span class="v">${fmt(c.rps)}</span><br>
peak = avg × 10 (event bursts) = <span class="r">${fmt(c.peak)}</span></div>
<table class="metrics-table">
  <tr><td>Notifications / day</td><td>${fmt(c.totalPerDay)}</td></tr>
  <tr><td>Average RPS</td><td class="hl">${fmt(c.rps)}</td></tr>
  <tr><td>Peak RPS <span class="tag tag-red">×10 burst</span></td><td class="warn">${fmt(c.peak)}</td></tr>
</table>` },
        { title: 'Channel breakdown', summary: `Push: ${fmt(c.pushRps)}/s`, body: `<table class="metrics-table">
  <tr><td>Push (APNs/FCM) <span class="tag tag-blue">${Math.round(c.pctPush * 100)}%</span></td><td class="hl">${fmt(c.pushRps)}/s</td></tr>
  <tr><td>Email</td><td>${fmt(c.emailRps)}/s</td></tr>
  <tr><td>APNs throughput limit</td><td>~600K/s per cert</td></tr>
  <tr><td>FCM throughput limit</td><td>~500K/s per project</td></tr>
</table>` },
        { title: 'Queue & workers', summary: `${c.workers} workers`, body: `<div class="formula-box">
workers = ceil(peak ÷ 5,000 per worker) = <span class="r">${c.workers}</span><br>
queue_memory = ${fmt(c.peak)} × 200B = <span class="r">${fmtB(c.queueMem)}</span></div>
<table class="metrics-table">
  <tr><td>Queue backend</td><td class="hl">Kafka (priority topics)</td></tr>
  <tr><td>Per-worker throughput</td><td>~5,000 notifications/s</td></tr>
  <tr><td>Workers at peak</td><td class="hl">${c.workers}</td></tr>
  <tr><td>Queue memory</td><td>${fmtB(c.queueMem)}</td></tr>
</table>` },
        { title: 'Reliability patterns', summary: 'Retry + dedup + opt-out', body: `<table class="metrics-table">
  <tr><td>Retry strategy</td><td class="hl">Exponential backoff: 1s, 2s, 4s, 8s</td></tr>
  <tr><td>Dead letter queue</td><td>Failed after 3 retries → DLQ + alert</td></tr>
  <tr><td>Rate limit per user</td><td>Max 10 push/hour to avoid spam</td></tr>
  <tr><td>Opt-out check</td><td>Redis set lookup — O(1) before every send</td></tr>
  <tr><td>Dedup window</td><td>24h content hash per user</td></tr>
</table>` },
      ];
    },

    arch(c) {
      return drawArch([
        { id: 'api', x: 80, y: 10, w: 200, h: 34, label: 'Notification API', color: '#6366f1' },
        { id: 'kafka', x: 80, y: 72, w: 200, h: 34, label: 'Kafka Queue', color: '#f59e0b' },
        { id: 'worker', x: 45, y: 136, w: 270, h: 34, label: `Workers (${c.workers})`, color: c.peak > 100000 ? '#ef4444' : '#a855f7' },
        { id: 'push', x: 14, y: 210, w: 100, h: 34, label: 'APNs/FCM', color: '#14b8a6' },
        { id: 'email', x: 140, y: 210, w: 90, h: 34, label: 'Email SES', color: '#14b8a6' },
        { id: 'sms', x: 256, y: 210, w: 90, h: 34, label: 'SMS SNS', color: '#14b8a6' },
        { id: 'redis', x: 80, y: 278, w: 200, h: 34, label: 'Redis (opt-out + dedup)', color: '#22c55e' },
      ], [
        { from: 'api', to: 'kafka', label: 'enqueue' },
        { from: 'kafka', to: 'worker', label: 'consume' },
        { from: 'worker', to: 'push', label: '' },
        { from: 'worker', to: 'email', label: '' },
        { from: 'worker', to: 'sms', label: '' },
        { from: 'worker', to: 'redis', label: 'check' },
      ]);
    },

    components() {
      return [
        { icon: '📨', name: 'Kafka', best: true, reason: 'Persistent queue with replay. Priority queues via separate topics (critical vs normal). Workers scale independently per channel.', stats: ['Durable', 'Per-topic scale', 'Replayable', 'Priority topics'] },
        { icon: '📱', name: 'FCM / APNs', best: true, reason: "Google/Apple's official push gateways. FCM=Android, APNs=iOS. Batch API sends 500 notifications per HTTP request.", stats: ['Official SDK', 'Batch 500/req', 'Delivery receipt', 'Free'] },
        { icon: '📧', name: 'SES / SendGrid', best: true, reason: 'Managed email delivery. SES cheapest at scale ($0.10/1K emails). SendGrid better for analytics and templates.', stats: ['High deliverability', 'Templates', 'Analytics', 'SPF/DKIM'] },
      ];
    },

    tradeoffs() {
      return [
        { algo: 'Sync delivery', pro: 'Simple, immediate', con: 'Blocks on slow 3rd-party APIs' },
        { algo: 'Kafka queue (async)', pro: 'Decoupled, retryable, scalable', con: 'Adds ~1-2s latency' },
        { algo: 'Priority queues', pro: 'Critical notifs always fast', con: 'More Kafka topics to manage' },
      ];
    },

    tips: [
      '10× peak is correct — breaking news and sports events cause sudden massive notification spikes',
      'Separate Kafka topics by priority — never let bulk marketing email delay a login OTP',
      'APNs requires per-device token refresh — store in DB, auto-clean failed tokens silently',
      'Rate limit per user: too many pushes → users disable all of them. Track sends per user per hour',
      'Template service: centralize content generation separately from the delivery pipeline',
    ],
  });
})();
