/* ============================================================
   diagram.js — Architecture SVG renderer
   window.SS.drawArch(nodes, edges) -> svg string
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
      fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" marker-end="url(#ah)"/>`;
    if (e.label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      s += `<text x="${mx + 4}" y="${my}" font-size="9" fill="rgba(255,255,255,0.3)"
        font-family="JetBrains Mono,monospace" dominant-baseline="central">${e.label}</text>`;
    }
  });

  // nodes
  nodes.forEach(n => {
    const color = n.color || '#6366f1';
    const rgb = window.SS.hexToRgb(color);
    const isBottleneck = color === '#ef4444';
    const cls = isBottleneck ? ' class="arch-node-bottleneck"' : '';
    s += `<g${cls}>
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7"
        fill="rgba(${rgb},0.1)" stroke="${color}" stroke-width="1" opacity="${n.dim ? 0.3 : 1}"/>
      <text x="${n.x + n.w / 2}" y="${n.y + n.h / 2}" text-anchor="middle" dominant-baseline="central"
        font-size="11" font-weight="500" fill="${color}"
        font-family="Inter,system-ui,sans-serif">${n.label}</text>
    </g>`;
  });

  return s + '</svg>';
};
