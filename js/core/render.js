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

  /* ── Center: metric bar + phase-dispatched content ─── */
  S.renderCenter = function () {
    const sys = S.SYSTEMS[S.cur.system];
    const p   = S.getParams(S.cur.system);
    const c   = sys.compute(p);

    const phase = S.cur.phase || 2;

    // metric bar — only on Capacity phase
    const metricBarEl = el('metric-bar');
    if (phase === 2) {
      metricBarEl.style.display = '';
      metricBarEl.innerHTML = sys.metrics(c).map(m =>
        `<div class="metric-pill ${m.cls}">
          <div class="metric-pill-val">${m.val}</div>
          <div class="metric-pill-lbl">${m.lbl}</div>
        </div>`
      ).join('');
    } else {
      metricBarEl.style.display = 'none';
      metricBarEl.innerHTML = '';
    }
    if (phase === 1) {
      el('steps-area').innerHTML = S._renderRequirements(sys, c, p);
    } else if (phase === 3) {
      el('steps-area').innerHTML = S._renderHLD(sys, c);
    } else if (phase === 4) {
      el('steps-area').innerHTML = S._renderDeepDive(sys, c);
    } else {
      // Phase 2 — capacity estimation (original behaviour)
      const steps = sys.steps(c, p);
      const total = steps.length;
      let h = '<div class="steps-inner">';
      if (c.bottleneck) {
        h += `<div class="bottleneck-warn">⚠ <strong>Bottleneck detected:</strong> ${c.bottleneck}</div>`;
      }
      steps.forEach((step, i) => {
        h += `<div class="step-card ${i < 3 ? 'open' : ''}" id="sc-${i}">
          <div class="step-head" onclick="SS.toggleStep(${i})">
            <div class="step-num-badge">${i + 1}</div>
            <div class="step-title-wrap">
              <div class="step-title">${step.title}</div>
              <div class="step-counter">${i + 1} of ${total}</div>
            </div>
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
      if (window.SS.applyGlossary) window.SS.applyGlossary(el('steps-area'));
    }
  };

  /* ── Phase 1: Requirements ─────────────────────────── */
  S._renderRequirements = function (sys, c, p) {
    const sysId = S.cur.system;
    const req   = (window.SS.REQUIREMENTS && window.SS.REQUIREMENTS[sysId]) || {};
    const metrics = sys.metrics(c);
    let h = '<div class="steps-inner">';

    if (c.bottleneck) {
      h += `<div class="bottleneck-warn">⚠ <strong>Bottleneck detected:</strong> ${c.bottleneck}</div>`;
    }

    if (req.functional && req.functional.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Functional Requirements</div>
        <ul class="req-list">${req.functional.map(f => `<li>${f}</li>`).join('')}</ul>
      </div>`;
    }

    h += `<div class="req-section">
      <div class="req-section-title">Non-Functional Requirements</div>
      <table class="metrics-table">
        ${metrics.map(m => `<tr><td>${m.lbl}</td><td class="hl">${m.val}</td></tr>`).join('')}
        ${req.latencySLO  ? `<tr><td>P99 Latency SLO</td><td class="hl">${req.latencySLO}</td></tr>`  : ''}
        ${req.readWrite   ? `<tr><td>Read : Write Ratio</td><td class="hl">${req.readWrite}</td></tr>` : ''}
        ${req.consistency ? `<tr><td>Consistency Model</td><td class="hl">${req.consistency}</td></tr>` : ''}
      </table>
    </div>`;

    if (req.assumptions && req.assumptions.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Clarify With Interviewer</div>
        <ul class="req-list req-list-q">${req.assumptions.map(a => `<li>${a}</li>`).join('')}</ul>
      </div>`;
    }

    if (req.outOfScope && req.outOfScope.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Out of Scope</div>
        <ul class="req-list req-list-oos">${req.outOfScope.map(o => `<li>${o}</li>`).join('')}</ul>
      </div>`;
    }

    h += '</div>';
    return h;
  };

  /* ── Phase 3: High-Level Design ────────────────────── */
  S._renderHLD = function (sys, c) {
    const sysId = S.cur.system;
    const req   = (window.SS.REQUIREMENTS && window.SS.REQUIREMENTS[sysId]) || {};

    function stepChain(path, direction) {
      const steps = path.split(/\s*→\s*/);
      return `<div class="hld-step-chain">
        ${steps.map((s, i) => `
          <div class="hld-step" style="animation-delay:${i * 70}ms">
            <div class="hld-step-num">${i + 1}</div>
            <div class="hld-step-label">${s}</div>
          </div>
          ${i < steps.length - 1 ? '<div class="hld-step-connector"></div>' : ''}
        `).join('')}
      </div>`;
    }

    let h = '<div class="steps-inner">';

    // Hero: arch diagram
    h += `<div class="req-section hld-arch-hero">
      <div class="hld-arch-header">
        <span class="req-section-title">Architecture — ${sys.name}</span>
      </div>
      <div class="arch-canvas arch-canvas-lg">${sys.arch(c)}</div>
    </div>`;

    // Write + Read paths side by side
    if (req.writePath || req.readPath) {
      h += '<div class="hld-flows">';
      if (req.writePath) {
        h += `<div class="req-section hld-flow-card">
          <div class="req-section-title hld-flow-title hld-write">↑ Write Path</div>
          ${stepChain(req.writePath, 'write')}
        </div>`;
      }
      if (req.readPath) {
        h += `<div class="req-section hld-flow-card">
          <div class="req-section-title hld-flow-title hld-read">↓ Read Path</div>
          ${stepChain(req.readPath, 'read')}
        </div>`;
      }
      h += '</div>';
    }

    // APIs
    if (req.apis && req.apis.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Key API Contracts</div>
        <div class="hld-api-list">
          ${req.apis.map((a, i) => {
            const method = a.match(/^(GET|POST|PUT|DELETE|PATCH|WS|RPC)/)?.[1] || '';
            const cls = { GET:'api-get', POST:'api-post', DELETE:'api-del', WS:'api-ws', PUT:'api-put', PATCH:'api-put', RPC:'api-rpc' }[method] || '';
            return `<div class="hld-api-item ${cls}" style="animation-delay:${i * 60}ms">
              ${method ? `<span class="api-method">${method}</span>` : ''}
              <span class="api-sig">${a.replace(/^(GET|POST|PUT|DELETE|PATCH|WS|RPC)\s+/, '')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    h += '</div>';
    return h;
  };

  /* ── Phase 4: Deep Dive ────────────────────────────── */
  S._renderDeepDive = function (sys, c) {
    const sysId = S.cur.system;
    const req   = (window.SS.REQUIREMENTS && window.SS.REQUIREMENTS[sysId]) || {};
    let h = '<div class="steps-inner">';

    if (c.bottleneck) {
      h += `<div class="bottleneck-warn">⚠ <strong>Bottleneck detected:</strong> ${c.bottleneck}</div>`;
    }

    // Design decisions — rich card format
    if (req.designDecisions && req.designDecisions.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Critical Design Decisions</div>
        <div class="dd-list">`;
      req.designDecisions.forEach(function(d) {
        if (typeof d === 'string') {
          h += `<div class="dd-card-simple"><span class="dd-bullet">◆</span>${d}</div>`;
        } else {
          const optsHtml = d.options ? d.options.map(function(opt) {
            const chosen = opt.name === d.choice;
            return `<div class="dd-opt${chosen ? ' dd-opt-chosen' : ''}">
              <div class="dd-opt-name">${opt.name}${chosen ? ' <span class="dd-chosen-tag">chosen</span>' : ''}</div>
              <div class="dd-opt-pro">✓ ${opt.pro}</div>
              <div class="dd-opt-con">✗ ${opt.con}</div>
            </div>`;
          }).join('<div class="dd-opt-vs">vs</div>') : '';
          h += `<div class="dd-card">
            <div class="dd-card-title">${d.title}</div>
            <div class="dd-problem">${d.problem}</div>
            ${optsHtml ? `<div class="dd-options">${optsHtml}</div>` : ''}
            <div class="dd-verdict">
              <span class="dd-verdict-label">Decision</span>
              <span class="dd-verdict-choice">${d.choice}</span>
            </div>
            <div class="dd-rationale">${d.rationale}</div>
          </div>`;
        }
      });
      h += `</div></div>`;
    }

    // Failure modes — trigger → impact → mitigation chain
    if (req.failureModes && req.failureModes.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Failure Modes & Recovery</div>
        <div class="fm-list">`;
      req.failureModes.forEach(function(f) {
        if (typeof f === 'string') {
          h += `<div class="fm-card-simple"><span class="fm-warn-icon">⚠</span>${f}</div>`;
        } else {
          h += `<div class="fm-card">
            <div class="fm-scenario">⚡ ${f.scenario}</div>
            <div class="fm-chain">
              <div class="fm-step">
                <div class="fm-step-icon fm-icon-impact">💥</div>
                <div class="fm-step-body"><span class="fm-step-label">Impact</span>${f.impact}</div>
              </div>
              <div class="fm-connector-line"></div>
              <div class="fm-step">
                <div class="fm-step-icon fm-icon-fix">🛡</div>
                <div class="fm-step-body"><span class="fm-step-label">Mitigation</span>${f.mitigation}</div>
              </div>
              ${f.recovery ? `<div class="fm-connector-line"></div>
              <div class="fm-step">
                <div class="fm-step-icon fm-icon-recover">♻</div>
                <div class="fm-step-body"><span class="fm-step-label">Recovery</span>${f.recovery}</div>
              </div>` : ''}
            </div>
          </div>`;
        }
      });
      h += `</div></div>`;
    }

    if (req.monitoring && req.monitoring.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Monitoring & Alerting</div>
        <ul class="req-list">${req.monitoring.map(m => `<li>${m}</li>`).join('')}</ul>
      </div>`;
    }

    const tradeoffs = sys.tradeoffs(c);
    if (tradeoffs && tradeoffs.length) {
      h += `<div class="req-section">
        <div class="req-section-title">Algorithm Tradeoffs</div>
        <table class="tradeoff-table">
          <thead><tr><th>Option</th><th>Pro / Con</th></tr></thead>
          <tbody>${tradeoffs.map(t =>
            `<tr><td>${t.algo}</td><td><span class="pro">✓ ${t.pro}</span><br><span class="con">✗ ${t.con}</span></td></tr>`
          ).join('')}</tbody>
        </table>
      </div>`;
    }

    if (sys.tips && sys.tips.length) {
      h += `<div class="tips-box"><div class="tips-box-head">💡 Interview talking points</div>
        <ul class="tips-list">${sys.tips.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
    }

    h += '</div>';
    return h;
  };

  /* ── Right panel ───────────────────────────────────── */
  S.renderRightPanel = function () {
    const sys = S.SYSTEMS[S.cur.system];
    const p = S.getParams(S.cur.system);
    const c = sys.compute(p);
    let h = '';

    if (S.cur.rpTab === 'arch') {
      const archSVG = sys.arch(c);
      h = `<div class="rp-section-title">Architecture</div>`;
      h += `<div class="arch-canvas">${archSVG}</div>`;
      h += `<div class="arch-hint">Nodes update live as you change parameters. Red = bottleneck.</div>`;
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
