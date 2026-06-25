/* ============================================================
   app.js — Event handlers + bootstrap (loaded LAST)
   ============================================================ */
(function () {
  const S = window.SS;

  /* ── Param events ──────────────────────────────────── */
  S.onSlide = function (key, idx) {
    const param = S.SYSTEMS[S.cur.system].params[key];
    S.getParams(S.cur.system)[key] = { i: idx, v: param.values[idx] };
    const lbl = document.getElementById('pv-' + key);
    if (lbl) {
      lbl.textContent = param.options[idx];
      lbl.classList.remove('flash');
      void lbl.offsetWidth;      // restart animation
      lbl.classList.add('flash');
    }
    S.renderCenter();
    S.renderRightPanel();
  };

  S.onSelect = function (key, idx) {
    const i = parseInt(idx, 10);
    S.getParams(S.cur.system)[key] = { i: i, v: i };
    S.renderCenter();
    S.renderRightPanel();
  };

  /* ── Step toggle ───────────────────────────────────── */
  S.toggleStep = function (i) {
    document.getElementById('sc-' + i).classList.toggle('open');
  };

  /* ── System switch ─────────────────────────────────── */
  S.selectSystem = function (id) {
    S.cur.system = id;
    S.cur.mode = 'estimate';
    document.querySelectorAll('.header-tab').forEach((t, idx) => t.classList.toggle('active', idx === 0));
    S.renderAll();
  };

  /* ── Right-panel tab ───────────────────────────────── */
  S.setRpTab = function (tab, btn) {
    S.cur.rpTab = tab;
    document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    S.renderRightPanel();
  };

  /* ── Header mode (estimator / cheat sheet) ─────────── */
  S.setMode = function (mode, btn) {
    document.querySelectorAll('.header-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    S.cur.mode = mode;
    if (mode === 'cheatsheet') {
      document.getElementById('metric-bar').innerHTML = '';
      document.getElementById('steps-area').innerHTML = S.renderCheatsheet();
    } else {
      S.renderCenter();
    }
  };

  /* ── Cheat sheet ───────────────────────────────────── */
  S.renderCheatsheet = function () {
    return `<div class="steps-inner">
<div class="cheat-title">Capacity estimation cheat sheet</div>
<div class="tips-box" style="margin-bottom:14px"><div class="tips-box-head">Universal constants</div><ul class="tips-list">
  <li>1 day = <strong>86,400 seconds</strong></li>
  <li>1 month = 2.5M seconds · 1 year = 31.5M seconds</li>
  <li>Peak multiplier: <strong>5× average</strong> (consumer APIs) · <strong>10×</strong> (notifications/events)</li>
  <li>Concurrent users ≈ <strong>10% of DAU</strong> at any moment</li>
</ul></div>
<div class="tips-box" style="margin-bottom:14px"><div class="tips-box-head">Component throughput reference</div>
<table class="metrics-table">
  <tr><td>Redis single node</td><td class="hl">~100K ops/s</td></tr>
  <tr><td>MySQL / Postgres primary</td><td class="hl">5K–10K writes/s</td></tr>
  <tr><td>Cassandra per node</td><td class="hl">~50K writes/s</td></tr>
  <tr><td>Kafka single broker</td><td class="hl">~1M msgs/s</td></tr>
  <tr><td>SSD random IOPS</td><td class="hl">100K IOPS</td></tr>
  <tr><td>HDD sequential</td><td class="hl">100 MB/s</td></tr>
  <tr><td>RAM access latency</td><td class="hl">~100 ns</td></tr>
  <tr><td>SSD random read latency</td><td class="hl">~150 μs</td></tr>
  <tr><td>Same-DC network RTT</td><td class="hl">~0.5 ms</td></tr>
  <tr><td>Cross-region network RTT</td><td class="hl">~150 ms</td></tr>
</table></div>
<div class="tips-box" style="margin-bottom:14px"><div class="tips-box-head">Storage size reference</div>
<table class="metrics-table">
  <tr><td>Average user record</td><td class="hl">~1 KB</td></tr>
  <tr><td>Average message / tweet</td><td class="hl">~200–500 B</td></tr>
  <tr><td>Photo (compressed JPEG)</td><td class="hl">~300 KB</td></tr>
  <tr><td>Video (1 min, 720p)</td><td class="hl">~50 MB</td></tr>
  <tr><td>Redis key overhead</td><td class="hl">~60 B</td></tr>
  <tr><td>MySQL row overhead</td><td class="hl">~100 B</td></tr>
</table></div>
<div class="tips-box"><div class="tips-box-head">The 5-step framework (every system)</div><ul class="tips-list">
  <li><strong>Clarify:</strong> state assumptions, scale, consistency model, edge cases out loud</li>
  <li><strong>Traffic:</strong> DAU × actions/day ÷ 86,400 = avg RPS → ×5 (or ×10) = peak</li>
  <li><strong>Storage:</strong> entities/day × bytes/entity × retention days</li>
  <li><strong>Bandwidth:</strong> peak RPS × payload × 8 bits = bps</li>
  <li><strong>Scale:</strong> ops_needed ÷ component_capacity = nodes → ×3 replication</li>
</ul></div>
</div>`;
  };

  /* ── Boot ──────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    S.renderAll();
  });
})();
