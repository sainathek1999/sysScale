/* ============================================================
   gamification.js — XP levels, achievements, streak tracking
   ============================================================ */
(function () {
  window.SS = window.SS || {};

  const KEY_ACH = 'ss_achievements_v1';

  const LEVEL_TIERS = [
    { min: 0,     level: 1,  title: 'Intern',       color: '#94A3B8' },
    { min: 100,   level: 2,  title: 'Junior SDE',   color: '#2BA07E' },
    { min: 300,   level: 3,  title: 'SDE I',        color: '#14B8A6' },
    { min: 600,   level: 4,  title: 'SDE II',       color: '#10B981' },
    { min: 1100,  level: 5,  title: 'Senior SDE',   color: '#F59E0B' },
    { min: 2000,  level: 6,  title: 'Staff SDE',    color: '#8B5CF6' },
    { min: 3500,  level: 7,  title: 'Principal',    color: '#EC4899' },
    { min: 6000,  level: 8,  title: 'Distinguished', color: '#EF4444' },
    { min: 10000, level: 9,  title: 'Fellow',       color: '#F97316' },
    { min: 16000, level: 10, title: 'Legend',       color: '#F59E0B' },
  ];

  const FOUNDATIONS_IDS = [
    'internet-basics', 'apis-protocols', 'scaling-fundamentals',
    'load-balancers', 'cap-theorem', 'consistency-models', 'replication',
  ];

  const ACHIEVEMENTS = [
    {
      id: 'target-set', icon: '🎯', title: 'Focused',
      desc: 'Set your target company', xp: 30,
      check: function (u) { return !!(u.targetCompany && u.targetCompany !== 'other'); },
    },
    {
      id: 'first-module', icon: '📚', title: 'First Steps',
      desc: 'Complete your first module', xp: 50,
      check: function (u, p) { return !!(p && p.completedModules && p.completedModules.length >= 1); },
    },
    {
      id: 'quiz-perfect', icon: '💯', title: 'Perfect Score',
      desc: 'Score 100% on any quiz', xp: 100,
      check: function (u, p) {
        if (!p || !p.quizScores) return false;
        return Object.values(p.quizScores).some(function (s) { return s === 100; });
      },
    },
    {
      id: 'foundations-done', icon: '🏛️', title: 'Foundation Builder',
      desc: 'Complete all 7 Foundations modules', xp: 200,
      check: function (u, p) {
        if (!p) return false;
        var done = p.completedModules || [];
        return FOUNDATIONS_IDS.every(function (id) { return done.indexOf(id) !== -1; });
      },
    },
    {
      id: 'streak-3', icon: '🔥', title: 'On Fire',
      desc: 'Maintain a 3-day learning streak', xp: 75,
      check: function (u) { return (u.streak || 0) >= 3; },
    },
    {
      id: 'streak-7', icon: '⚡', title: 'Week Warrior',
      desc: 'Maintain a 7-day streak', xp: 150,
      check: function (u) { return (u.streak || 0) >= 7; },
    },
    {
      id: 'streak-14', icon: '💫', title: 'Fortnight',
      desc: '14 consecutive study days', xp: 300,
      check: function (u) { return (u.streak || 0) >= 14; },
    },
    {
      id: 'explorer-5', icon: '🔭', title: 'Systems Explorer',
      desc: 'Try 5 different systems in the estimator', xp: 75,
      check: function (u) { return (u.systemsVisited || []).length >= 5; },
    },
    {
      id: 'explorer-all', icon: '🌐', title: 'Omniscient',
      desc: 'Try every system in the estimator (16 total)', xp: 250,
      check: function (u) { return (u.systemsVisited || []).length >= 16; },
    },
    {
      id: 'xp-1000', icon: '⭐', title: 'Rising Star',
      desc: 'Earn 1,000 XP total', xp: 0,
      check: function (u) { return (u.xp || 0) >= 1000; },
    },
    {
      id: 'xp-5000', icon: '🌟', title: 'Knowledge Master',
      desc: 'Earn 5,000 XP total', xp: 0,
      check: function (u) { return (u.xp || 0) >= 5000; },
    },
    {
      id: 'checklist-done', icon: '✅', title: 'Interview Ready',
      desc: 'Complete a full company prep checklist', xp: 150,
      check: function () {
        try {
          var c = JSON.parse(localStorage.getItem('ss_checklist_v1')) || {};
          return Object.values(c).some(function (group) {
            var vals = Object.values(group || {});
            return vals.length > 0 && vals.every(Boolean);
          });
        } catch (_) { return false; }
      },
    },
  ];

  function loadUser() {
    try { return JSON.parse(localStorage.getItem('ss_user_v1')) || {}; } catch (_) { return {}; }
  }
  function saveUser(u) {
    try { localStorage.setItem('ss_user_v1', JSON.stringify(u)); } catch (_) {}
  }
  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem('ss_progress_v1')) || { completedModules: [], quizScores: {} };
    } catch (_) { return { completedModules: [], quizScores: {} }; }
  }
  function loadAch() {
    try { return JSON.parse(localStorage.getItem(KEY_ACH)) || []; } catch (_) { return []; }
  }
  function saveAch(list) {
    try { localStorage.setItem(KEY_ACH, JSON.stringify(list)); } catch (_) {}
  }

  function levelFromXP(xp) {
    for (var i = LEVEL_TIERS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_TIERS[i].min) return LEVEL_TIERS[i];
    }
    return LEVEL_TIERS[0];
  }

  function nextTier(currentLevel) {
    return LEVEL_TIERS[Math.min(currentLevel, LEVEL_TIERS.length - 1)] || LEVEL_TIERS[LEVEL_TIERS.length - 1];
  }

  function updateStreak() {
    var u = loadUser();
    if (!u || !u.roadmapGenerated) return null;
    var today = new Date().toDateString();
    if (u.lastVisitDate === today) return null;
    var yesterday = new Date(Date.now() - 86400000).toDateString();
    u.streak = (u.lastVisitDate === yesterday) ? (u.streak || 0) + 1 : 1;
    u.xp = (u.xp || 0) + 10;
    u.lastVisitDate = today;
    saveUser(u);
    return u;
  }

  function checkAndUnlock() {
    var u = loadUser();
    var p = loadProgress();
    var unlocked = loadAch();
    var newlyUnlocked = [];

    ACHIEVEMENTS.forEach(function (ach) {
      if (unlocked.indexOf(ach.id) !== -1) return;
      if (ach.check(u, p)) {
        unlocked.push(ach.id);
        newlyUnlocked.push(ach);
        if (ach.xp > 0) u.xp = (u.xp || 0) + ach.xp;
      }
    });

    if (newlyUnlocked.length) { saveAch(unlocked); saveUser(u); }
    return { unlocked: unlocked, newlyUnlocked: newlyUnlocked, user: u };
  }

  function awardXP(amount) {
    var u = loadUser();
    if (!u || !u.roadmapGenerated) return null;
    var prevLevel = levelFromXP(u.xp || 0).level;
    u.xp = (u.xp || 0) + amount;
    var newLevel = levelFromXP(u.xp);
    saveUser(u);
    return { levelUp: newLevel.level > prevLevel, newLevel: newLevel, xp: u.xp };
  }

  function trackSystemVisit(systemId) {
    var u = loadUser();
    if (!u || !u.roadmapGenerated) return;
    var visited = u.systemsVisited || [];
    if (visited.indexOf(systemId) === -1) {
      visited.push(systemId);
      u.systemsVisited = visited;
      u.xp = (u.xp || 0) + 20;
      saveUser(u);
    }
  }

  window.SS.gamification = {
    LEVEL_TIERS: LEVEL_TIERS,
    ACHIEVEMENTS: ACHIEVEMENTS,
    levelFromXP: levelFromXP,
    nextTier: nextTier,
    updateStreak: updateStreak,
    checkAndUnlock: checkAndUnlock,
    awardXP: awardXP,
    trackSystemVisit: trackSystemVisit,
    getUnlocked: loadAch,
  };
})();
