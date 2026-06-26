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
      void lbl.offsetWidth;
      lbl.classList.add('flash');
    }
    S.renderCenter();
    S.renderRightPanel();
    S.pushURL();
  };

  S.onSelect = function (key, idx) {
    const i = parseInt(idx, 10);
    S.getParams(S.cur.system)[key] = { i: i, v: i };
    S.renderCenter();
    S.renderRightPanel();
    S.pushURL();
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
    S.pushURL();
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

  /* ── URL state ─────────────────────────────────────── */
  S.pushURL = function () {
    const sys = S.cur.system;
    const p   = S.getParams(sys);
    const parts = Object.entries(p).map(([k, v]) => k + ':' + v.i).join(',');
    const url = '?s=' + sys + (parts ? '&p=' + parts : '');
    history.replaceState(null, '', url);
  };

  S.readURL = function () {
    const params = new URLSearchParams(location.search);
    const s = params.get('s');
    if (s && window.SS.SYSTEMS[s]) {
      S.cur.system = s;
    }
    const p = params.get('p');
    if (p && S.cur.system) {
      const sys = S.SYSTEMS[S.cur.system];
      p.split(',').forEach(pair => {
        const [k, idx] = pair.split(':');
        if (k && idx !== undefined && sys.params[k]) {
          const i = parseInt(idx, 10);
          const param = sys.params[k];
          S.getParams(S.cur.system)[k] = {
            i: i,
            v: param.values ? param.values[i] : i,
          };
        }
      });
    }
  };

  /* ── Interview timer ───────────────────────────────── */
  const TIMER_DURATION = 35 * 60; // 35 minutes in seconds
  const TIMER_PROMPTS = [
    { at: 35 * 60, msg: '🚀 Start! Clarify requirements: functional, non-functional, scale assumptions, out of scope.' },
    { at: 30 * 60, msg: '📐 Define your APIs and data models. What are the core entities? What does each endpoint accept/return?' },
    { at: 25 * 60, msg: '🔢 Capacity estimation: traffic, storage, bandwidth. Use the sliders on the left — say your numbers out loud.' },
    { at: 18 * 60, msg: '🏗️ High-level design: draw the key components and their connections. Name the data stores and justify choices.' },
    { at: 10 * 60, msg: '🔍 Deep dive: pick the hardest component and go deep. Bottlenecks, failure modes, scaling strategies.' },
    { at: 5  * 60, msg: '⚡ Wrap up: summarize tradeoffs, mention what you\'d do differently with more time, answer interviewer questions.' },
    { at: 2  * 60, msg: '⏰ 2 minutes left! Finish your thought and be ready to stop.' },
    { at: 0,       msg: '🏁 Time\'s up! Great practice session. Review the tips and tradeoffs below.' },
  ];

  let _timerInterval = null;
  let _timerSecondsLeft = TIMER_DURATION;
  let _timerPromptsFired = new Set();

  S.toggleTimer = function () {
    if (_timerInterval) {
      S.stopTimer();
    } else {
      S.startTimer();
    }
  };

  S.startTimer = function () {
    _timerSecondsLeft = TIMER_DURATION;
    _timerPromptsFired.clear();

    const btn      = document.getElementById('timer-btn');
    const display  = document.getElementById('timer-display');
    const label    = document.getElementById('timer-label');

    btn.style.display    = 'none';
    display.style.display = 'flex';

    _timerInterval = setInterval(function () {
      _timerSecondsLeft--;

      // Update countdown display
      const m = Math.floor(_timerSecondsLeft / 60);
      const s = _timerSecondsLeft % 60;
      document.getElementById('timer-countdown').textContent =
        String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

      // Color change in last 5 minutes
      const countdown = document.getElementById('timer-countdown');
      if (_timerSecondsLeft <= 300) countdown.classList.add('timer-warn');

      // Fire prompts
      TIMER_PROMPTS.forEach(function (prompt) {
        if (!_timerPromptsFired.has(prompt.at) && _timerSecondsLeft <= prompt.at) {
          _timerPromptsFired.add(prompt.at);
          S.showTimerToast(prompt.msg);
        }
      });

      if (_timerSecondsLeft <= 0) {
        S.stopTimer();
      }
    }, 1000);
  };

  S.stopTimer = function () {
    clearInterval(_timerInterval);
    _timerInterval = null;
    document.getElementById('timer-btn').style.display    = 'flex';
    document.getElementById('timer-display').style.display = 'none';
    document.getElementById('timer-countdown').classList.remove('timer-warn');
    document.getElementById('timer-label').textContent = 'Practice';
    S.hideTimerToast();
  };

  let _toastTimeout = null;
  S.showTimerToast = function (msg) {
    const toast = document.getElementById('timer-toast');
    toast.innerHTML = msg;
    toast.style.display = 'block';
    toast.classList.remove('toast-exit');
    toast.classList.add('toast-enter');
    clearTimeout(_toastTimeout);
    _toastTimeout = setTimeout(function () {
      toast.classList.add('toast-exit');
      setTimeout(function () { toast.style.display = 'none'; }, 500);
    }, 7000);
  };

  S.hideTimerToast = function () {
    clearTimeout(_toastTimeout);
    document.getElementById('timer-toast').style.display = 'none';
  };

  /* ── Export / print ────────────────────────────────── */
  S.exportPrint = function () {
    // Open all step cards before printing
    document.querySelectorAll('.step-card').forEach(c => c.classList.add('open'));
    window.print();
  };

  /* ── Glossary tooltip ──────────────────────────────── */
  (function setupGlossaryTooltip() {
    const tooltip = document.getElementById('g-tooltip');

    document.addEventListener('mouseover', function (e) {
      const t = e.target.closest('.g-tip');
      if (!t) return;
      const def = t.getAttribute('data-def');
      if (!def) return;
      tooltip.textContent = def;
      tooltip.style.display = 'block';
      positionTooltip(t, tooltip);
    });

    document.addEventListener('mouseout', function (e) {
      if (!e.target.closest('.g-tip')) return;
      tooltip.style.display = 'none';
    });

    document.addEventListener('scroll', function () {
      tooltip.style.display = 'none';
    }, true);

    function positionTooltip(anchor, tip) {
      const r    = anchor.getBoundingClientRect();
      const tw   = Math.min(280, window.innerWidth - 24);
      tip.style.maxWidth = tw + 'px';
      tip.style.display  = 'block';

      let left = r.left + window.scrollX;
      let top  = r.bottom + window.scrollY + 8;

      // Clamp horizontally
      if (left + tw > window.innerWidth - 12) {
        left = window.innerWidth - tw - 12;
      }
      if (left < 8) left = 8;

      // Flip above if overflows bottom
      if (r.bottom + tip.offsetHeight + 16 > window.innerHeight) {
        top = r.top + window.scrollY - tip.offsetHeight - 8;
      }

      tip.style.left = left + 'px';
      tip.style.top  = top + 'px';
    }
  })();

  /* ── Boot ──────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    S.readURL();
    S.renderAll();
  });
})();
