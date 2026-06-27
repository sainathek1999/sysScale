/* ============================================================
   onboarding.js — 4-step wizard state + localStorage
   ============================================================ */
(function () {
  const STORAGE_KEY = 'ss_user_v1';

  const COMPANIES = [
    { id: 'google',    name: 'Google',    color: '#4285F4', letter: 'G', emoji: '🔵' },
    { id: 'meta',      name: 'Meta',      color: '#0866FF', letter: 'M', emoji: '🔷' },
    { id: 'amazon',    name: 'Amazon',    color: '#FF9900', letter: 'A', emoji: '🟠' },
    { id: 'netflix',   name: 'Netflix',   color: '#E50914', letter: 'N', emoji: '🔴' },
    { id: 'microsoft', name: 'Microsoft', color: '#00A4EF', letter: 'M', emoji: '🔵' },
    { id: 'apple',     name: 'Apple',     color: '#555555', letter: '', emoji: '🍎' },
    { id: 'uber',      name: 'Uber',      color: '#000000', letter: 'U', emoji: '⚫' },
    { id: 'other',     name: 'Other',     color: '#2BA07E', letter: '?', emoji: '🚀' },
  ];

  const LEVELS = [
    { id: 'new-grad',  label: 'New Grad',  sub: 'E3 / L3 · First role',            icon: '🌱' },
    { id: 'mid',       label: 'Mid-Level', sub: 'E4 / L4 · 2–4 years',             icon: '⚡' },
    { id: 'senior',    label: 'Senior',    sub: 'E5 / L5 · 5+ years',              icon: '🔥' },
    { id: 'staff',     label: 'Staff+',    sub: 'E6 / L6+ · Principal / Director', icon: '👑' },
  ];

  const TIMELINES = [
    { id: '2w',  label: '< 2 weeks', days: 14,  urgency: 'critical' },
    { id: '1m',  label: '1 month',   days: 30,  urgency: 'high' },
    { id: '2m',  label: '2 months',  days: 60,  urgency: 'medium' },
    { id: '3m',  label: '3 months',  days: 90,  urgency: 'low' },
    { id: '6m+', label: '6+ months', days: 180, urgency: 'relaxed' },
  ];

  /* ── State ── */
  let state = {
    step: 1,
    targetCompany: null,
    targetLevel: null,
    timeline: null,
    experienceLevel: null,  // beginner / some / experienced
    weakAreas: [],
    roadmapGenerated: false,
  };

  /* ── Persist / load ── */
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      savedAt: Date.now(),
    }));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /* ── XP helpers ── */
  function initialXP() { return 0; }
  function levelFromXP(xp) {
    const tiers = [
      { min: 0,    level: 1, title: 'Intern' },
      { min: 100,  level: 2, title: 'Junior' },
      { min: 300,  level: 3, title: 'SDE I' },
      { min: 600,  level: 4, title: 'SDE II' },
      { min: 1000, level: 5, title: 'Senior' },
      { min: 1600, level: 6, title: 'Staff' },
      { min: 2500, level: 7, title: 'Principal' },
    ];
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (xp >= tiers[i].min) return tiers[i];
    }
    return tiers[0];
  }

  /* ── Roadmap generation ── */
  function generateRoadmap(s) {
    const { targetCompany, targetLevel, timeline } = s;
    const tl = TIMELINES.find(t => t.id === timeline) || TIMELINES[2];

    // Company-specific focus systems
    const companyFocus = {
      google:    ['url-shortener', 'search-autocomplete', 'key-value-store', 'notification-service'],
      meta:      ['notification-service', 'rate-limiter', 'url-shortener', 'pastebin'],
      amazon:    ['ecommerce', 'notification-service', 'rate-limiter', 'key-value-store'],
      netflix:   ['video-streaming', 'cdn', 'notification-service', 'key-value-store'],
      microsoft: ['key-value-store', 'search-autocomplete', 'rate-limiter', 'pastebin'],
      apple:     ['notification-service', 'key-value-store', 'cdn', 'rate-limiter'],
      uber:      ['ride-sharing', 'rate-limiter', 'notification-service', 'key-value-store'],
      other:     ['url-shortener', 'key-value-store', 'rate-limiter', 'notification-service'],
    };

    // Weak areas based on calibration
    const defaultWeak = [];
    if (s.experienceLevel === 'beginner') defaultWeak.push('foundations', 'storage');
    if (s.experienceLevel === 'some')     defaultWeak.push('patterns');
    if (s.experienceLevel === 'experienced') defaultWeak.push('interview');

    return {
      focusSystems: companyFocus[targetCompany] || companyFocus.other,
      interviewDate: Date.now() + tl.days * 86400000,
      daysToInterview: tl.days,
      urgency: tl.urgency,
      weakAreas: s.weakAreas.length ? s.weakAreas : defaultWeak,
      roadmapGenerated: true,
      xp: initialXP(),
      streak: 0,
      lastVisit: Date.now(),
    };
  }

  /* ── Public API ── */
  window.SS = window.SS || {};
  window.SS.onboarding = {
    COMPANIES,
    LEVELS,
    TIMELINES,
    save,
    load,
    clear,
    generateRoadmap,
    levelFromXP,

    isComplete() {
      const u = load();
      return !!(u && u.roadmapGenerated);
    },

    complete(partialState) {
      const roadmap = generateRoadmap(partialState);
      const user = { ...partialState, ...roadmap };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return user;
    },

    getUser() {
      return load();
    },

    updateUser(patch) {
      const u = load() || {};
      const updated = { ...u, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    },

    addXP(amount) {
      const u = load();
      if (!u) return;
      const newXP = (u.xp || 0) + amount;
      return this.updateUser({ xp: newXP, lastVisit: Date.now() });
    },

    getCompany(id) {
      return COMPANIES.find(c => c.id === id) || COMPANIES[7];
    },
  };
})();
