/* ============================================================
   zoom.js — Video Conferencing (Zoom-like) system definition
   ============================================================ */
(function () {
  const { fmt, fmtB, drawArch } = window.SS;

  // fmtBw tops out at Gbps — video egress can reach Tbps/Pbps
  function bw(bits) {
    if (bits >= 1e15) return (bits / 1e15).toFixed(1) + ' Pbps';
    if (bits >= 1e12) return (bits / 1e12).toFixed(1) + ' Tbps';
    if (bits >= 1e9)  return (bits / 1e9).toFixed(1) + ' Gbps';
    if (bits >= 1e6)  return (bits / 1e6).toFixed(1) + ' Mbps';
    if (bits >= 1e3)  return (bits / 1e3).toFixed(1) + ' Kbps';
    return bits.toFixed(0) + ' bps';
  }

  const QUALITY = [
    { label: '360p',  bitrate: 500e3,  audioBr: 64e3  },
    { label: '720p',  bitrate: 1.5e6,  audioBr: 128e3 },
    { label: '1080p', bitrate: 3e6,    audioBr: 128e3 },
    { label: '4K',    bitrate: 8e6,    audioBr: 256e3 },
  ];

  const SFU_CAPACITY_BPS = 40e9; // 40 Gbps per SFU node (conservative)

  window.SS.register('zoom', {
    name: 'Video Conferencing',
    icon: '📹',

    params: {
      dau:     { label: 'Daily active users',        options: ['1M','10M','100M','500M'],   values: [1e6,10e6,100e6,500e6],   def: 1 },
      concur:  { label: 'Peak concurrent %',         options: ['1%','5%','10%','20%'],      values: [0.01,0.05,0.10,0.20],    def: 1 },
      parts:   { label: 'Participants / meeting',    options: ['2','5','10','25','50'],      values: [2,5,10,25,50],           def: 2 },
      quality: { label: 'Video quality',             type: 'select',
                 options: ['360p (500 Kbps)','720p (1.5 Mbps)','1080p (3 Mbps)','4K (8 Mbps)'], def: 1 },
      record:  { label: 'Meetings recorded',         options: ['0%','15%','30%','50%'],     values: [0,0.15,0.30,0.50],       def: 1 },
    },

    compute(p) {
      const q          = QUALITY[p.quality.i];
      const dau        = p.dau.v;
      const concurFrac = p.concur.v;
      const N          = p.parts.v;
      const recordFrac = p.record.v;

      // Concurrent users / meetings
      const concurUsers    = dau * concurFrac;
      const activeMeetings = concurUsers / N;

      // SFU egress: server forwards N-1 streams to each of N participants
      // O(N²) fan-out per meeting
      const streamsPerMeeting  = N * (N - 1);
      const videoEgressPerMtg  = streamsPerMeeting * q.bitrate;
      const audioEgressPerMtg  = streamsPerMeeting * q.audioBr;
      const totalEgressPerMtg  = videoEgressPerMtg + audioEgressPerMtg;

      const totalVideoEgress   = activeMeetings * videoEgressPerMtg;
      const totalAudioEgress   = activeMeetings * audioEgressPerMtg;
      const totalEgress        = totalVideoEgress + totalAudioEgress;

      // SFU node count
      const sfuNodes = Math.max(1, Math.ceil(totalEgress / SFU_CAPACITY_BPS));

      // Ingress (each participant uploads 1 stream to SFU)
      const totalIngress = concurUsers * (q.bitrate + q.audioBr);

      // Recording storage (assume avg meeting = 1 hour)
      const MEETING_SECS      = 3600;
      const dailyMeetings     = (dau * concurFrac * 8) / N; // rough: 8 peak hours
      const recordedMeetings  = dailyMeetings * recordFrac;
      const bytesPerRecording = (q.bitrate + q.audioBr) * MEETING_SECS / 8;
      const dailyStorage      = recordedMeetings * bytesPerRecording;
      const yearlyStorage     = dailyStorage * 365;

      // Signaling load
      const signalingConns = concurUsers; // 1 WebSocket per user

      // Bottleneck logic
      let bottleneck = null;
      if (N >= 25 && sfuNodes > 10) {
        bottleneck = `O(N²) SFU fan-out: ${N} participants → ${streamsPerMeeting} streams/meeting. Need ${fmt(sfuNodes)} SFU nodes. Use simulcast + active-speaker switching to cut streams to ~3.`;
      } else if (sfuNodes > 5) {
        bottleneck = `Egress ${bw(totalEgress)} requires ${fmt(sfuNodes)} SFU nodes. Regional SFU mesh + simulcast recommended.`;
      }

      return {
        dau, concurFrac, N, recordFrac,
        q, qualityLabel: q.label,
        concurUsers, activeMeetings,
        streamsPerMeeting, videoEgressPerMtg, totalEgressPerMtg,
        totalVideoEgress, totalAudioEgress, totalEgress,
        totalIngress, sfuNodes,
        dailyMeetings, recordedMeetings, dailyStorage, yearlyStorage,
        signalingConns,
        bottleneck,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.concurUsers),   lbl: 'Concurrent users', cls: 'accent' },
        { val: fmt(c.activeMeetings),lbl: 'Active meetings',  cls: 'teal'   },
        { val: bw(c.totalEgress),    lbl: 'SFU egress',       cls: 'amber'  },
        { val: fmt(c.sfuNodes),      lbl: 'SFU nodes',        cls: 'purple' },
        { val: fmtB(c.yearlyStorage),lbl: 'Storage / year',   cls: 'green'  },
      ];
    },

    steps(c, p) {
      return [
        {
          title: 'Clarify scope',
          summary: '5 key decisions',
          body: `<table class="metrics-table">
            <tr><td>Media routing model</td><td class="hl">SFU (Selective Forwarding Unit)</td></tr>
            <tr><td>Signaling protocol</td><td>WebSocket + SDP/ICE (WebRTC)</td></tr>
            <tr><td>NAT traversal</td><td>STUN (discovery) + TURN (relay fallback)</td></tr>
            <tr><td>Recording</td><td>Server-side (SFU tap → S3)</td></tr>
            <tr><td>Max participants</td><td>${c.N} (current config)</td></tr>
          </table>`,
        },
        {
          title: 'Traffic estimation',
          summary: `${fmt(c.concurUsers)} concurrent · ${fmt(c.activeMeetings)} meetings`,
          body: `<div class="formula-box">
concurrent_users = DAU × concur% = <span class="v">${fmt(c.dau)}</span> × <span class="v">${(c.concurFrac*100).toFixed(0)}%</span> = <span class="r">${fmt(c.concurUsers)}</span><br>
active_meetings = concurrent_users ÷ N = <span class="r">${fmt(c.activeMeetings)}</span><br>
streams/meeting = N × (N−1) = <span class="v">${c.N}</span> × <span class="v">${c.N-1}</span> = <span class="r">${c.streamsPerMeeting}</span></div>
<table class="metrics-table">
  <tr><td>Daily active users</td><td>${fmt(c.dau)}</td></tr>
  <tr><td>Concurrent %</td><td>${(c.concurFrac*100).toFixed(0)}%</td></tr>
  <tr><td>Concurrent users (peak)</td><td class="hl">${fmt(c.concurUsers)}</td></tr>
  <tr><td>Participants / meeting</td><td>${c.N}</td></tr>
  <tr><td>Active meetings</td><td class="hl">${fmt(c.activeMeetings)}</td></tr>
  <tr><td>Streams / meeting (O(N²))</td><td class="warn">${c.streamsPerMeeting}</td></tr>
</table>`,
        },
        {
          title: 'Bandwidth — SFU egress',
          summary: `${bw(c.totalEgress)} total · ${fmt(c.sfuNodes)} SFU nodes`,
          body: `<div class="formula-box">
egress/meeting = N×(N−1) × (video + audio bitrate)<br>
&nbsp;&nbsp;= <span class="v">${c.streamsPerMeeting}</span> × (<span class="v">${bw(c.q.bitrate)}</span> + <span class="v">${bw(c.q.audioBr)}</span>) = <span class="r">${bw(c.totalEgressPerMtg)}</span><br>
total_egress = meetings × egress/meeting = <span class="r">${bw(c.totalEgress)}</span><br>
SFU_nodes = ceil(total ÷ 40 Gbps) = <span class="r">${fmt(c.sfuNodes)}</span></div>
<table class="metrics-table">
  <tr><td>Video quality</td><td>${c.qualityLabel}</td></tr>
  <tr><td>Video bitrate / stream</td><td>${bw(c.q.bitrate)}</td></tr>
  <tr><td>Audio bitrate / stream</td><td>${bw(c.q.audioBr)}</td></tr>
  <tr><td>Egress / meeting</td><td class="warn">${bw(c.totalEgressPerMtg)}</td></tr>
  <tr><td>Total SFU egress</td><td class="warn">${bw(c.totalEgress)}</td></tr>
  <tr><td>Total ingress (uploads)</td><td>${bw(c.totalIngress)}</td></tr>
  <tr><td>SFU capacity (each)</td><td>40 Gbps</td></tr>
  <tr><td>SFU nodes required</td><td class="hl">${fmt(c.sfuNodes)}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Why O(N²)?</div>
<div class="info-box-body">SFU receives 1 stream per sender, then forwards to every other participant. With N people, each receives N−1 streams → N×(N−1) total forwarded. At N=50 that's 2,450 streams per meeting. Simulcast + active-speaker switching caps effective streams to ~3 per receiver regardless of N.</div></div>`,
        },
        {
          title: 'Storage — recordings',
          summary: `${fmtB(c.dailyStorage)} / day · ${fmtB(c.yearlyStorage)} / year`,
          body: `<div class="formula-box">
bytes/recording = (video + audio) × 3600s ÷ 8<br>
&nbsp;&nbsp;= (<span class="v">${bw(c.q.bitrate)}</span> + <span class="v">${bw(c.q.audioBr)}</span>) × 3600 ÷ 8 = <span class="r">${fmtB((c.q.bitrate+c.q.audioBr)*3600/8)}</span><br>
daily_storage = recorded_meetings × bytes/recording = <span class="r">${fmtB(c.dailyStorage)}</span></div>
<table class="metrics-table">
  <tr><td>Daily meetings (est.)</td><td>${fmt(c.dailyMeetings)}</td></tr>
  <tr><td>Recorded (%)</td><td>${(c.recordFrac*100).toFixed(0)}%</td></tr>
  <tr><td>Recorded meetings / day</td><td>${fmt(c.recordedMeetings)}</td></tr>
  <tr><td>Storage / recording (1hr)</td><td>${fmtB((c.q.bitrate+c.q.audioBr)*3600/8)}</td></tr>
  <tr><td>Daily storage growth</td><td class="hl">${fmtB(c.dailyStorage)}</td></tr>
  <tr><td>Yearly storage</td><td class="warn">${fmtB(c.yearlyStorage)}</td></tr>
</table>`,
        },
        {
          title: 'Scale — signaling & TURN',
          summary: `${fmt(c.signalingConns)} WebSocket connections`,
          body: `<table class="metrics-table">
  <tr><td>Concurrent WebSocket conns</td><td class="hl">${fmt(c.signalingConns)}</td></tr>
  <tr><td>Signaling server capacity</td><td>~50K conns / node</td></tr>
  <tr><td>Signaling nodes needed</td><td>${Math.max(1,Math.ceil(c.signalingConns/50000))}</td></tr>
  <tr><td>TURN relay (NAT failure rate)</td><td>~15–20% of connections</td></tr>
  <tr><td>TURN nodes needed</td><td>${Math.max(1,Math.ceil(c.signalingConns*0.18/5000))}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">WebRTC connection flow</div>
<div class="info-box-body">Client → STUN → discover public IP. Exchange SDP offer/answer via signaling WS. 80% connect peer-to-SFU directly. 15-20% fail NAT traversal → fall back to TURN relay. TURN is expensive: relay all media bytes.</div></div>`,
        },
      ];
    },

    arch(c) {
      const sfuOverloaded = c.sfuNodes > 10;
      return drawArch([
        { id: 'clients',    x: 85,  y: 10,  w: 190, h: 34, label: `Clients (${fmt(c.concurUsers)})`,   color: '#6366f1' },
        { id: 'stun',       x: 10,  y: 74,  w: 110, h: 34, label: 'STUN / TURN',                        color: '#f59e0b' },
        { id: 'signal',     x: 140, y: 74,  w: 160, h: 34, label: 'Signaling (WS)',                      color: '#6366f1' },
        { id: 'sfu',        x: 55,  y: 140, w: 250, h: 34, label: `SFU Cluster (${fmt(c.sfuNodes)} nodes)`, color: sfuOverloaded ? '#ef4444' : '#14b8a6' },
        { id: 'kafka',      x: 55,  y: 206, w: 120, h: 34, label: 'Kafka',                               color: '#f59e0b' },
        { id: 'rec',        x: 195, y: 206, w: 120, h: 34, label: 'Recording Svc',                       color: '#a855f7' },
        { id: 's3',         x: 140, y: 270, w: 180, h: 34, label: 'Object Storage (S3)',                  color: '#22c55e' },
      ], [
        { from: 'clients', to: 'stun',   label: 'ICE' },
        { from: 'clients', to: 'signal', label: 'SDP' },
        { from: 'signal',  to: 'sfu',    label: 'route' },
        { from: 'clients', to: 'sfu',    label: 'media' },
        { from: 'sfu',     to: 'clients',label: `×${c.streamsPerMeeting}/mtg` },
        { from: 'sfu',     to: 'kafka',  label: 'tap' },
        { from: 'kafka',   to: 'rec',    label: '' },
        { from: 'rec',     to: 's3',     label: 'store' },
      ]);
    },

    components() {
      return [
        {
          icon: '📡', name: 'SFU (mediasoup / Janus)', best: true,
          reason: 'Server receives one stream per sender, selectively forwards to each subscriber. CPU-light vs MCU (no transcode). Enables simulcast, spatial/temporal scaling, active-speaker switching.',
          stats: ['No transcoding', 'Simulcast', '40 Gbps/node', 'Scales to 1000s'],
        },
        {
          icon: '🔀', name: 'MCU (Multipoint Control Unit)', best: false,
          reason: 'Mixes all streams server-side into one composite. Single outbound stream per participant = O(N) egress. But transcoding is CPU-heavy and adds latency.',
          stats: ['O(N) egress', 'High CPU', '+100ms latency', 'Legacy'],
        },
        {
          icon: '🤝', name: 'P2P (WebRTC mesh)', best: false,
          reason: 'Works for 2–3 participants. Every client uploads to every other client → O(N²) upload bandwidth consumed by the clients themselves. Collapses above ~4 participants.',
          stats: ['No server cost', 'O(N²) upload', 'Breaks at N>4', 'Two-party only'],
        },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'SFU',         pro: 'CPU-light, simulcast, active-speaker switching',    con: 'O(N²) egress still a factor at scale' },
        { algo: 'MCU',         pro: 'O(N) egress, single stream per viewer',             con: 'High CPU for transcoding, +latency'   },
        { algo: 'P2P mesh',    pro: 'Zero server egress cost for small calls',           con: 'Client upload blows up past 3–4 peers' },
        { algo: 'Simulcast',   pro: 'Receiver picks quality tier it can handle',         con: 'Publisher sends 3 streams (3× ingress)' },
      ];
    },

    tips: [
      'SFU O(N²) is the killer: with 50 participants that\'s 2,450 forwarded streams per meeting. Always budget N² in your estimate',
      'Simulcast: publisher sends 360p + 720p + 1080p simultaneously. SFU forwards the right tier per subscriber — huge quality-vs-bandwidth win',
      'Active-speaker switching: only forward the 3–5 loudest speaker streams to each subscriber. Cuts SFU egress from O(N²) to O(N) effectively',
      'TURN relay is expensive — every byte goes through your servers. Budget 15–20% of connections needing relay; TURN nodes size for that traffic',
      'Recording taps the SFU at the server — never re-encode on the client. Write raw VP8/VP9/H.264 to Kafka, transcode async to S3',
      'For latency: measure glass-to-glass. WebRTC target is <150ms. SFU forwarding adds ~10ms; TURN adds ~30ms vs direct.',
    ],
  });
})();
