/* ============================================================
   job-scheduler.js — Distributed Job Scheduler (Airflow / Celery-like)
   ============================================================ */
(function () {
  const { fmt, fmtB, drawArch } = window.SS;

  const JOB_RECORD_BYTES   = 256;  // job metadata record
  const RESULT_BYTES       = 512;  // avg job result payload
  const HEARTBEAT_INTERVAL = 30;   // worker heartbeat period (seconds)

  window.SS.register('job-scheduler', {
    name: 'Job Scheduler',
    icon: '⚙️',

    params: {
      jobsPerSec:   { label: 'Job submissions / sec',    options: ['10','100','1K','10K','100K'],       values: [10,100,1000,10000,100000],  def: 2 },
      avgDurationS: { label: 'Avg job duration',         options: ['1s','10s','60s','5min','30min'],    values: [1,10,60,300,1800],          def: 2 },
      failureRate:  { label: 'Job failure rate',         options: ['0.1%','1%','5%','10%','20%'],       values: [0.001,0.01,0.05,0.10,0.20], def: 1 },
      maxRetries:   { label: 'Max retry attempts',       options: ['0','1','3','5','10'],               values: [0,1,3,5,10],                def: 2 },
      queueType:    { label: 'Queue backend',            type: 'select',
                      options: ['Redis (simple)', 'Kafka (streaming)', 'SQS (managed)', 'DB polling'], def: 0 },
    },

    compute(p) {
      const jobsPerSec   = p.jobsPerSec.v;
      const avgDurationS = p.avgDurationS.v;
      const failureRate  = p.failureRate.v;
      const maxRetries   = p.maxRetries.v;
      const queueType    = p.queueType.i;

      // Little's Law: queue_depth = arrival_rate × service_time
      const queueDepth = jobsPerSec * avgDurationS;

      // Workers needed (assume each worker handles 1 job concurrently, with I/O wait)
      const concurrencyPerWorker = avgDurationS > 10 ? 10 : 1; // I/O bound → more concurrency
      const workersNeeded = Math.ceil(queueDepth / concurrencyPerWorker);

      // Retry overhead
      const retryJobsPerSec = jobsPerSec * failureRate * maxRetries;
      const totalJobsPerSec = jobsPerSec + retryJobsPerSec;

      // Retry storm amplification
      const retryAmplification = 1 + (failureRate * maxRetries);

      // Dead letter queue volume
      const dlqPerSec = jobsPerSec * failureRate; // after all retries exhausted

      // Storage
      const jobsPerDay       = jobsPerSec * 86400;
      const dailyJobBytes    = jobsPerDay * (JOB_RECORD_BYTES + RESULT_BYTES);
      const retentionDays    = 30;
      const totalStorage     = dailyJobBytes * retentionDays * 3; // ×3 replication

      // Idempotency key TTL storage
      const idempKeyBytes    = 64; // UUID + status
      const idempKeyStore    = jobsPerSec * 24 * 3600 * idempKeyBytes; // 24h TTL

      // Heartbeat volume (workers send heartbeat every 30s)
      const heartbeatQPS     = workersNeeded / HEARTBEAT_INTERVAL;

      // Scheduler loop: how often to scan for due cron jobs
      const cronScanHz = 1; // once per second

      // Queue-specific latency
      const queueLatencyMs = [2, 5, 20, 100][queueType]; // Redis, Kafka, SQS, DB

      // Bottleneck
      let bottleneck = null;
      if (retryAmplification > 2) {
        bottleneck = `Retry storm: ${(failureRate*100).toFixed(0)}% failure × ${maxRetries} retries = ${retryAmplification.toFixed(1)}× load amplification. ${fmt(retryJobsPerSec)}/s retry jobs added. Use exponential backoff with jitter + circuit breaker.`;
      } else if (queueDepth > 1e6) {
        bottleneck = `Queue depth ${fmt(queueDepth)} jobs exceeds typical memory limits. Use Kafka (disk-backed) or SQS instead of Redis. Partition by job type to isolate slow jobs from fast ones.`;
      } else if (workersNeeded > 10000) {
        bottleneck = `${fmt(workersNeeded)} workers required. Worker coordination overhead becomes significant — use a worker pool manager (Kubernetes HPA) and avoid single-leader locking.`;
      }

      return {
        jobsPerSec, avgDurationS, failureRate, maxRetries, queueType,
        queueDepth, workersNeeded, concurrencyPerWorker,
        retryJobsPerSec, totalJobsPerSec, retryAmplification,
        dlqPerSec, jobsPerDay, dailyJobBytes, totalStorage,
        idempKeyStore, heartbeatQPS, cronScanHz, queueLatencyMs,
        bottleneck,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.totalJobsPerSec) + '/s', lbl: 'Effective job rate', cls: 'accent' },
        { val: fmt(c.queueDepth),             lbl: 'Queue depth',        cls: 'amber'  },
        { val: fmt(c.workersNeeded),           lbl: 'Workers needed',    cls: 'teal'   },
        { val: c.retryAmplification.toFixed(1) + '×', lbl: 'Retry amplification', cls: 'purple' },
        { val: fmtB(c.totalStorage),          lbl: 'Storage (30d)',      cls: 'green'  },
      ];
    },

    steps(c, p) {
      const queueNames  = ['Redis Lists/Sorted Sets', 'Kafka', 'Amazon SQS', 'DB polling'];
      const retryStrat  = c.maxRetries === 0 ? 'No retries (fire-and-forget)' : `Exp. backoff: ${c.maxRetries} attempts, max delay 1hr`;
      return [
        {
          title: 'Clarify scope',
          summary: '7 key decisions',
          body: `<table class="metrics-table">
            <tr><td>Job types</td><td class="hl">Cron + one-shot + recurring</td></tr>
            <tr><td>Delivery guarantee</td><td>At-least-once (idempotent jobs)</td></tr>
            <tr><td>Execution model</td><td>Distributed workers (stateless)</td></tr>
            <tr><td>Queue backend</td><td>${queueNames[c.queueType]}</td></tr>
            <tr><td>Retry strategy</td><td>${retryStrat}</td></tr>
            <tr><td>Priority support</td><td>Yes — priority queues / topics</td></tr>
            <tr><td>Dead letter queue</td><td>Separate queue after ${c.maxRetries} failures</td></tr>
          </table>`,
        },
        {
          title: 'Queue depth & worker sizing',
          summary: `${fmt(c.queueDepth)} jobs queued · ${fmt(c.workersNeeded)} workers`,
          body: `<div class="formula-box">
queue_depth = arrival_rate × service_time  <em>(Little's Law)</em><br>
&nbsp;&nbsp;= <span class="v">${fmt(c.jobsPerSec)}/s</span> × <span class="v">${c.avgDurationS}s</span> = <span class="r">${fmt(c.queueDepth)} jobs</span><br>
workers = queue_depth ÷ concurrency_per_worker<br>
&nbsp;&nbsp;= <span class="v">${fmt(c.queueDepth)}</span> ÷ <span class="v">${c.concurrencyPerWorker}</span> = <span class="r">${fmt(c.workersNeeded)}</span></div>
<table class="metrics-table">
  <tr><td>Job submission rate</td><td>${fmt(c.jobsPerSec)}/s</td></tr>
  <tr><td>Avg job duration</td><td>${c.avgDurationS}s</td></tr>
  <tr><td>Queue depth (steady state)</td><td class="hl">${fmt(c.queueDepth)}</td></tr>
  <tr><td>Concurrency / worker</td><td>${c.concurrencyPerWorker}</td></tr>
  <tr><td>Workers required</td><td class="hl">${fmt(c.workersNeeded)}</td></tr>
  <tr><td>Queue backend latency</td><td>${c.queueLatencyMs}ms</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Little's Law is the key formula</div>
<div class="info-box-body">L = λ × W (avg items in system = arrival rate × avg time in system). If jobs arrive at 1000/s and each takes 60s, there are always 60,000 jobs "in flight" at steady state. You need enough workers to process all 60,000 concurrently. For I/O-bound jobs (network calls, DB queries), each worker can run 10× concurrently via async — so 6,000 workers instead of 60,000.</div></div>`,
        },
        {
          title: 'Retry strategy & idempotency',
          summary: `${c.retryAmplification.toFixed(1)}× amplification · ${fmt(c.dlqPerSec)}/s DLQ`,
          body: `<div class="formula-box">
effective_rate = submission_rate × (1 + failure_rate × max_retries)<br>
&nbsp;&nbsp;= <span class="v">${fmt(c.jobsPerSec)}/s</span> × (1 + <span class="v">${(c.failureRate*100).toFixed(0)}%</span> × <span class="v">${c.maxRetries}</span>) = <span class="r">${fmt(c.totalJobsPerSec)}/s</span></div>
<table class="metrics-table">
  <tr><td>Base job rate</td><td>${fmt(c.jobsPerSec)}/s</td></tr>
  <tr><td>Failure rate</td><td>${(c.failureRate*100).toFixed(1)}%</td></tr>
  <tr><td>Max retry attempts</td><td>${c.maxRetries}</td></tr>
  <tr><td>Retry jobs/sec</td><td class="warn">${fmt(c.retryJobsPerSec)}/s</td></tr>
  <tr><td>Total effective rate</td><td class="hl">${fmt(c.totalJobsPerSec)}/s</td></tr>
  <tr><td>Retry amplification</td><td class="${c.retryAmplification > 1.5 ? 'warn' : ''}">${c.retryAmplification.toFixed(2)}×</td></tr>
  <tr><td>DLQ ingestion rate</td><td>${fmt(c.dlqPerSec)}/s</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Exponential backoff with jitter</div>
<div class="info-box-body">Retry delay = min(cap, base × 2^attempt) + random(0, jitter). Base=1s, cap=3600s, jitter=±50%. Without jitter, all retrying jobs hit the queue simultaneously (thundering herd). Idempotency key (UUID in job header) ensures re-execution = same outcome.</div></div>`,
        },
        {
          title: 'Cron scheduling & leader election',
          summary: 'Cron scan every 1s · single leader',
          body: `<table class="metrics-table">
  <tr><td>Cron scan frequency</td><td class="hl">1 Hz (every second)</td></tr>
  <tr><td>Leader election</td><td>Redis SETNX + TTL / etcd / ZooKeeper</td></tr>
  <tr><td>Leader lease duration</td><td>10 seconds (re-acquired every 5s)</td></tr>
  <tr><td>Failover time</td><td>&lt;10s (lease expiry)</td></tr>
  <tr><td>Cron expressions stored</td><td>DB (PostgreSQL)</td></tr>
  <tr><td>Due-job detection</td><td>next_run_at index scan</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Why a single scheduler leader?</div>
<div class="info-box-body">If multiple nodes run the cron scanner simultaneously, the same job gets enqueued N times. Solutions: (1) Single leader (Redis SETNX lease) — simple but SPOF. (2) DB row-level lock (SELECT FOR UPDATE SKIP LOCKED) — scalable, each node atomically claims a due job. PostgreSQL SKIP LOCKED is the production standard for this pattern.</div></div>
<div class="info-box"><div class="info-box-title">SELECT FOR UPDATE SKIP LOCKED</div>
<div class="info-box-body"><code>SELECT * FROM jobs WHERE status='pending' AND run_at &lt;= NOW() ORDER BY run_at LIMIT 10 FOR UPDATE SKIP LOCKED</code>. Multiple workers run this concurrently — each atomically claims its own batch with no conflicts. No external coordinator needed.</div></div>`,
        },
        {
          title: 'Storage & observability',
          summary: `${fmtB(c.totalStorage)} · ${fmtB(c.idempKeyStore)} idempotency keys`,
          body: `<table class="metrics-table">
  <tr><td>Job record size</td><td>~256 B</td></tr>
  <tr><td>Result payload size</td><td>~512 B</td></tr>
  <tr><td>Jobs / day</td><td>${fmt(c.jobsPerDay)}</td></tr>
  <tr><td>Daily storage</td><td>${fmtB(c.dailyJobBytes)}</td></tr>
  <tr><td>30-day retention (×3 repl.)</td><td class="hl">${fmtB(c.totalStorage)}</td></tr>
  <tr><td>Idempotency key store (24h)</td><td>${fmtB(c.idempKeyStore)}</td></tr>
  <tr><td>Worker heartbeat rate</td><td>${fmt(c.heartbeatQPS)}/s</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Worker health monitoring</div>
<div class="info-box-body">Each worker writes a heartbeat to Redis every 30s: <code>SET worker:{id} ts EX 60</code>. Scheduler scans for workers with expired heartbeats and requeues their claimed jobs. This handles worker crashes without manual intervention.</div></div>`,
        },
      ];
    },

    arch(c) {
      const queueHot   = c.queueDepth > 500000;
      const retryHot   = c.retryAmplification > 2.0;
      const queueColors = ['#14b8a6', '#f59e0b', '#2BA07E', '#dc2626'];
      return drawArch([
        { id: 'api',      x: 75,  y: 10,  w: 210, h: 34, label: 'Job Submission API',                      color: '#2BA07E' },
        { id: 'queue',    x: 75,  y: 74,  w: 210, h: 34, label: `Queue (${['Redis','Kafka','SQS','DB'][c.queueType]})`, color: queueHot ? '#ef4444' : queueColors[c.queueType] },
        { id: 'sched',    x: 20,  y: 140, w: 130, h: 34, label: 'Cron Scheduler',                          color: '#6D28D9' },
        { id: 'workers',  x: 210, y: 140, w: 130, h: 34, label: `Worker Pool (${fmt(c.workersNeeded)})`,   color: retryHot ? '#ef4444' : '#14b8a6' },
        { id: 'dlq',      x: 20,  y: 206, w: 130, h: 34, label: 'Dead Letter Queue',                       color: '#dc2626' },
        { id: 'db',       x: 210, y: 206, w: 130, h: 34, label: 'Job DB (PostgreSQL)',                      color: '#22c55e' },
        { id: 'redis',    x: 75,  y: 272, w: 210, h: 34, label: 'Redis (leader + idempotency + heartbeat)', color: '#14b8a6' },
      ], [
        { from: 'api',     to: 'queue',   label: 'enqueue' },
        { from: 'sched',   to: 'queue',   label: 'cron jobs' },
        { from: 'queue',   to: 'workers', label: 'consume' },
        { from: 'workers', to: 'dlq',     label: 'failed' },
        { from: 'workers', to: 'db',      label: 'results' },
        { from: 'workers', to: 'queue',   label: 'retry' },
        { from: 'sched',   to: 'redis',   label: 'leader lock' },
        { from: 'workers', to: 'redis',   label: 'heartbeat' },
      ]);
    },

    components() {
      return [
        {
          icon: '📋', name: 'Redis (queue + locking)', best: true,
          reason: 'BRPOP on a list gives O(1) blocking pop — workers sleep until a job appears. SETNX for leader election. Sorted set for delayed jobs (score = run_at timestamp). Simple and battle-tested for job queues up to ~100K jobs.',
          stats: ['BRPOP O(1)', 'ZADD delay', 'SETNX leader', '<5ms latency'],
        },
        {
          icon: '🌊', name: 'Kafka (streaming jobs)', best: false,
          reason: 'Use when jobs are events from a stream (e.g., process every payment event). Disk-backed = survives crash. Consumer groups = worker scaling. Replay for backfill. Slower than Redis for pure task queues.',
          stats: ['Disk-backed', 'Consumer groups', 'Replay', '5ms latency'],
        },
        {
          icon: '🔁', name: 'PostgreSQL SKIP LOCKED', best: false,
          reason: 'SELECT FOR UPDATE SKIP LOCKED on a jobs table lets multiple workers atomically claim work without a queue broker. Great for low-to-medium throughput (<10K jobs/s) — no extra infra.',
          stats: ['No broker', 'ACID', '<10K jobs/s', 'SKIP LOCKED'],
        },
        {
          icon: '🔔', name: 'DLQ + alerting', best: false,
          reason: 'Jobs that exhaust retries go to Dead Letter Queue. Alert on DLQ depth. Manual replay or discard. Gives you visibility into systemic failures without losing the job payload.',
          stats: ['Failure audit', 'Replay', 'Alerting', 'Isolation'],
        },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'At-least-once',    pro: 'Simple; retry on failure; no job lost',              con: 'Duplicate execution — jobs must be idempotent' },
        { algo: 'Exactly-once',     pro: 'No duplicate side effects',                           con: 'Requires 2-phase commit or saga; complex and slow' },
        { algo: 'Redis queue',      pro: 'Sub-ms latency; simple; BRPOP efficient',            con: 'Memory-bound; data loss on crash without RDB/AOF' },
        { algo: 'Kafka queue',      pro: 'Durable; replayable; consumer groups',               con: 'Higher latency (~5ms); operational complexity' },
        { algo: 'Exp. backoff + jitter', pro: 'Avoids thundering herd on failures',           con: 'Job may be delayed up to hours on persistent failure' },
        { algo: 'SKIP LOCKED',     pro: 'Zero extra infra; works up to ~10K jobs/s',           con: 'DB becomes bottleneck at high throughput' },
      ];
    },

    tips: [
      'Always design for at-least-once delivery — it\'s simpler. Then make your jobs idempotent (same inputs → same outputs, no side effects on repeat). Idempotency key = job_id in request header.',
      'Little\'s Law: L = λW. If 1000 jobs/sec and each takes 60s, you have 60,000 jobs in flight at steady state. This determines worker count — memorize this formula.',
      'Retry amplification is a hidden multiplier: 5% failure × 3 retries = 1.15× load. At high failure rates (20% × 5 retries = 2×), you can double system load during an outage — the worst time.',
      'Exponential backoff with jitter: delay = min(3600, 1 × 2^attempt) + randint(0, delay×0.5). The jitter is critical — without it, all retrying jobs hit simultaneously (thundering herd).',
      'PostgreSQL SKIP LOCKED is underrated: multiple workers concurrently claim rows without conflicts. Zero extra infra, works to ~10K jobs/s. Most teams reach for Redis or Kafka too early.',
      'Cron leader election: Redis SETNX with TTL 10s, renewed every 5s. Only the leader scans the schedule. Follower nodes become leader in <10s if leader dies. ZooKeeper/etcd are more robust but heavier.',
    ],
  });
})();
