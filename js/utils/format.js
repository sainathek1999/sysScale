/* ============================================================
   format.js — Number / byte / bandwidth formatting helpers
   Exposed on window.SS.fmt for use across modules.
   ============================================================ */
window.SS = window.SS || {};

window.SS.fmt = function (n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
};

window.SS.fmtB = function (b) {
  if (b >= 1e15) return (b / 1e15).toFixed(1) + ' PB';
  if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6)  return (b / 1e6).toFixed(1) + ' MB';
  if (b >= 1e3)  return (b / 1e3).toFixed(1) + ' KB';
  return Math.round(b) + ' B';
};

window.SS.fmtBw = function (bps) {
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps';
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps';
  return (bps / 1e3).toFixed(1) + ' Kbps';
};
