/* ============================================================
   state.js — Central system registry + parameter state
   Systems register themselves via window.SS.register(id, def).
   ============================================================ */
window.SS = window.SS || {};
window.SS.SYSTEMS = {};
window.SS.paramState = {};

window.SS.register = function (id, def) {
  window.SS.SYSTEMS[id] = def;
};

window.SS.getParams = function (sysId) {
  const sys = window.SS.SYSTEMS[sysId];
  if (!window.SS.paramState[sysId]) {
    window.SS.paramState[sysId] = {};
    Object.entries(sys.params).forEach(([k, p]) => {
      const i = p.def != null ? p.def : 0;
      window.SS.paramState[sysId][k] = { i: i, v: p.values ? p.values[i] : i };
    });
  }
  return window.SS.paramState[sysId];
};

/* current view state */
window.SS.cur = {
  system: 'rate-limiter',
  rpTab: 'arch',
  mode: 'estimate'
};
