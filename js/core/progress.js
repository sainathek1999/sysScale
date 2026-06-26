(function () {
  window.SS = window.SS || {};
  const KEY = 'ss_progress_v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { completedModules: [], quizScores: {} };
    } catch (e) {
      return { completedModules: [], quizScores: {} };
    }
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  window.SS.progress = {
    completeModule: function (id) {
      var d = load();
      if (!d.completedModules.includes(id)) {
        d.completedModules.push(id);
        save(d);
      }
    },

    uncompleteModule: function (id) {
      var d = load();
      d.completedModules = d.completedModules.filter(function (m) { return m !== id; });
      save(d);
    },

    isCompleted: function (id) {
      return load().completedModules.includes(id);
    },

    saveQuizScore: function (moduleId, score) {
      var d = load();
      d.quizScores = d.quizScores || {};
      d.quizScores[moduleId] = score;
      save(d);
    },

    getQuizScore: function (moduleId) {
      return (load().quizScores || {})[moduleId] || null;
    },

    getTrackProgress: function (trackId) {
      var track = (window.SS.TRACKS || []).find(function (t) { return t.id === trackId; });
      if (!track) return { done: 0, total: 0 };
      var completed = load().completedModules;
      var done = track.modules.filter(function (m) { return completed.includes(m.id); }).length;
      return { done: done, total: track.modules.length };
    },

    getTotalProgress: function () {
      var tracks = (window.SS.TRACKS || []).filter(function (t) { return t.id !== 'systems'; });
      var total  = tracks.reduce(function (s, t) { return s + t.modules.length; }, 0);
      var done   = load().completedModules.length;
      return { done: done, total: total };
    },

    reset: function () {
      save({ completedModules: [], quizScores: {} });
    },
  };
})();
