/* ============================================================
   render.js — All DOM rendering for the app
   ============================================================ */
window.SS = window.SS || {};

(function () {
  const S = window.SS;

  function el(id) { return document.getElementById(id); }

  /* ── System list (left sidebar) ────────────────────── */
  S.renderSystemList = function () {
    el('system-list').innerHTML = Object.entries(S.SYSTEMS).map(([id, s]) =>
      `<button class="system-btn ${id === S.cur.system ? 'active' : ''}" onclick="SS.selectSystem('${id}')">
        <span class="s-icon">${s.icon}</span><span class="s-name">${s.name}</span>
      </button>`
    ).join('');
  };

  /* ── Parameters (left sidebar) ─────────────────────── */
  S.renderParams = function () {
    const sys = S.SYSTEMS[S.cur.system];
    const p = S.getParams(S.cur.system);
    let h = '<div class="sidebar-label">Parameters</div>';
    Object.entries(sys.params).forEach(([k, param]) => {
      const cur = p[k];
      if (param.type === 'select') {
        h += `<div class="param-group"><div class="param-label">${param.label}</div>
        <select onchange="SS.onSelect('${k}', this.value)">
          ${param.options.map((o, i) => `<option value="${i}" ${i === cur.i ? 'selected' : ''}>${o}</option>`).join('')}
        </select></div>`;
      } else {
        h += `<div class="param-group">
          <div class="param-label">${param.label}<span id="pv-${k}">${param.options[cur.i]}</span></div>
          <input type="range" min="0" max="${param.options.length - 1}" step="1" value="${cur.i}" oninput="SS.onSlide('${k}', +this.value)">
        </div>`;
      }
    });
    el('params-panel').innerHTML = h;
  };

  /* ── Center: metric bar + steps ────────────────────── */
  S.renderCenter = function () {
    const sys = S.SYSTEMS[S.cur.system];
    const p = S.getParams(S.cur.system);
    const c = sys.compute(p);

    // metric bar
    el('metric-bar').innerHTML = sys.metrics(c).map(m =>
      `<div class="metric-pill ${m.cls}">
        <div class="metric-pill-val">${m.val}</div>
        <div class="metric-pill-lbl">${m.lbl}</div>
      </div>`
    ).join('');

    // steps (with animated grid-rows wrapper)
    const steps = sys.steps(c, p);
    let h = '<div class="steps-inner">';
    if (c.bottleneck) {
      h += `<div class="bottleneck-warn">⚠ <strong>Bottleneck detected:</strong> ${c.bottleneck}</div>`;
    }
    steps.forEach((step, i) => {
      h += `<div class="step-card ${i < 3 ? 'open' : ''}" id="sc-${i}">
        <div class="step-head" onclick="SS.toggleStep(${i})">
          <div class="step-num-badge">${i + 1}</div>
          <div class="step-title">${step.title}</div>
          <div class="step-summary">${step.summary}</div>
          <div class="chevron">▼</div>
        </div>
        <div class="step-body-wrap"><div class="step-body-inner"><div class="step-body">${step.body}</div></div></div>
      </div>`;
    });
    h += `<div class="tips-box"><div class="tips-box-head">💡 Interview talking points</div>
      <ul class="tips-list">${sys.tips.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
    h += '</div>';
    el('steps-area').innerHTML = h;
    // Inject glossary tooltips after render
    if (window.SS.applyGlossary) window.SS.applyGlossary(el('steps-area'));
  };

  /* ── Right panel ───────────────────────────────────── */
  S.renderRightPanel = function () {
    const sys = S.SYSTEMS[S.cur.system];
    const p = S.getParams(S.cur.system);
    const c = sys.compute(p);
    let h = '';

    if (S.cur.rpTab === 'arch') {
      h = `<div class="rp-section-title">Live architecture</div>
        <div class="arch-canvas">${sys.arch(c)}</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.6;">
          Nodes update live as you change parameters. A pulsing red node means a bottleneck at the current scale.
        </div>`;
    } else if (S.cur.rpTab === 'components') {
      h = '<div class="rp-section-title">Component recommendations</div>' +
        sys.components().map(comp => `<div class="comp-card">
          <div class="comp-card-head"><span class="comp-icon">${comp.icon}</span>
            <span class="comp-name">${comp.name}</span>
            ${comp.best ? '<span class="best-badge">Best fit</span>' : '<span class="alt-badge">Alternative</span>'}
          </div>
          <div class="comp-reason">${comp.reason}</div>
          <div class="comp-stats">${comp.stats.map(s => `<span class="comp-stat">${s}</span>`).join('')}</div>
        </div>`).join('');
    } else if (S.cur.rpTab === 'tradeoffs') {
      h = `<div class="rp-section-title">Algorithm tradeoffs</div>
        <table class="tradeoff-table"><thead><tr><th>Option</th><th>Pro / Con</th></tr></thead><tbody>
        ${sys.tradeoffs(c).map(t =>
          `<tr><td>${t.algo}</td><td><span class="pro">✓ ${t.pro}</span><br><span class="con">✗ ${t.con}</span></td></tr>`
        ).join('')}
        </tbody></table>`;
    } else {
      // Glossary tab — sorted alphabetically
      const G = window.SS.GLOSSARY || {};
      const entries = Object.entries(G).sort((a, b) => a[0].localeCompare(b[0]));
      h = `<div class="rp-section-title">Term glossary (${entries.length} terms)</div>
        <div class="glossary-list">` +
        entries.map(([term, def]) =>
          `<div class="glossary-entry"><div class="glossary-term-label">${term}</div><div class="glossary-def">${def}</div></div>`
        ).join('') +
        `</div>`;
    }
    el('rp-content').innerHTML = h;
  };

  /* ── Full re-render ────────────────────────────────── */
  S.renderAll = function () {
    S.renderSystemList();
    S.renderParams();
    S.renderCenter();
    S.renderRightPanel();
  };
})();
