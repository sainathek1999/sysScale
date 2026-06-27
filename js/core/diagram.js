/* ============================================================
   diagram.js — Architecture SVG renderer + 3D layered view
   window.SS.drawArch(nodes, edges) -> svg string
   window.SS.drawArch3D(nodes, edges) -> html string
   Nodes with color '#ef4444' (red) render as animated bottleneck.
   ============================================================ */
window.SS = window.SS || {};

window.SS.hexToRgb = function (h) {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
  ].join(',');
};

window.SS.drawArch = function (nodes, edges) {
  window.SS._lastArchArgs = { nodes: nodes, edges: edges };
  const W = 360;
  const maxY = Math.max(...nodes.map(n => n.y + n.h)) + 30;
  const cx = {}, cy = {};
  nodes.forEach(n => { cx[n.id] = n.x + n.w / 2; cy[n.id] = n.y + n.h / 2; });

  let s = `<svg viewBox="0 0 ${W} ${maxY}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M1 1L7 4L1 7" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>`;

  // edges (animated dashed flow)
  edges.forEach(e => {
    const ndFrom = nodes.find(n => n.id === e.from);
    const ndTo   = nodes.find(n => n.id === e.to);
    const x1 = cx[e.from], y1 = cy[e.from] + ndFrom.h / 2;
    const x2 = cx[e.to],   y2 = cy[e.to]   - ndTo.h / 2;
    s += `<path class="arch-edge" d="M${x1} ${y1} C${x1} ${y1 + 18},${x2} ${y2 - 18},${x2} ${y2}"
      fill="none" stroke="rgba(43,160,126,0.42)" stroke-width="1.5" marker-end="url(#ah)"/>`;
    if (e.label) {
      const mx = (x1 + x2) / 2 + 4, my = (y1 + y2) / 2;
      const lw = e.label.length * 5.2 + 10;
      s += `<rect x="${mx - lw / 2}" y="${my - 8}" width="${lw}" height="16" rx="3"
        fill="rgba(255,255,255,0.94)" stroke="rgba(43,160,126,0.18)" stroke-width="0.5"/>`;
      s += `<text x="${mx}" y="${my}" font-size="8.5" fill="rgba(51,65,85,0.80)"
        font-family="JetBrains Mono,monospace" dominant-baseline="central" text-anchor="middle">${e.label}</text>`;
    }
  });

  // nodes
  nodes.forEach(n => {
    const color = n.color || '#2BA07E';
    const rgb = window.SS.hexToRgb(color);
    const isBottleneck = color === '#ef4444';
    const cls = isBottleneck ? ' class="arch-node-bottleneck"' : '';
    s += `<g${cls}>
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7"
        fill="rgba(${rgb},0.13)" stroke="${color}" stroke-width="1.5" opacity="${n.dim ? 0.3 : 1}"/>
      <text x="${n.x + n.w / 2}" y="${n.y + n.h / 2}" text-anchor="middle" dominant-baseline="central"
        font-size="11" font-weight="600" fill="${color}"
        font-family="Inter,system-ui,sans-serif">${n.label}</text>
    </g>`;
  });

  return s + '</svg>';
};

/* ── 3D layered architecture view ────────────────────────────
   Groups nodes by Y proximity into "tiers", then renders each
   tier as a CSS 3D plane floating at a different Z depth.
   ─────────────────────────────────────────────────────────── */
window.SS.drawArch3D = function (nodes, edges) {
  const sorted = [...nodes].sort((a, b) => a.y - b.y);

  // Cluster into tiers: nodes within 50px Y of each other = same plane
  const tiers = [];
  sorted.forEach(nd => {
    const last = tiers[tiers.length - 1];
    if (!last || nd.y - last.baseY > 50) {
      tiers.push({ baseY: nd.y, nodes: [] });
    }
    tiers[tiers.length - 1].nodes.push(nd);
  });

  const n       = tiers.length;
  const TIER_Z  = 50; // px Z-gap between tiers

  // Edge labels indexed by destination node id
  const edgeLabels = {};
  edges.forEach(e => {
    if (e.label && !edgeLabels[e.to]) edgeLabels[e.to] = e.label;
  });

  // Build edge label chips (show alongside scene as a legend)
  const flowTags = edges.filter(e => e.label)
    .map(e => `<span class="arch3d-flow-tag">${e.label}</span>`)
    .join('');

  let html = `<div class="arch3d-scene"><div class="arch3d-stage" style="--tn:${n};">`;

  tiers.forEach((tier, i) => {
    const zVal  = (n - 1 - i) * TIER_Z; // client tier = highest Z
    const color = tier.nodes[0].color || '#2BA07E';
    const rgb   = window.SS.hexToRgb(color);
    const isBn  = tier.nodes.some(nd => nd.color === '#ef4444');

    // Collect incoming edge labels for this tier
    const inLabels = tier.nodes
      .map(nd => edgeLabels[nd.id])
      .filter(Boolean);

    html += `<div class="arch3d-tier${isBn ? ' arch3d-tier-bn' : ''}" style="--z:${zVal};--tc:${color};--tcr:${rgb};">`;

    if (inLabels.length) {
      html += `<div class="arch3d-edge-label">${inLabels[0]}</div>`;
    }

    html += `<div class="arch3d-tier-face">
      <div class="arch3d-tier-nodes">`;

    tier.nodes.forEach(nd => {
      const nr   = window.SS.hexToRgb(nd.color || '#2BA07E');
      const hot  = nd.color === '#ef4444';
      const dim  = nd.dim;
      html += `<div class="arch3d-node${hot ? ' arch3d-node-hot' : ''}${dim ? ' arch3d-node-dim' : ''}"
        style="--nc:${nd.color || '#2BA07E'};--ncr:${nr};">
        <div class="arch3d-node-dot"></div>
        <span class="arch3d-node-lbl">${nd.label}</span>
      </div>`;
    });

    html += `</div></div></div>`; // close tier-nodes, tier-face, tier
  });

  html += `</div>`; // close stage

  if (flowTags) {
    html += `<div class="arch3d-flows">${flowTags}</div>`;
  }

  html += `</div>`; // close scene
  return html;
};
