/* ============================================================
   mentor.js — Rule-based daily task generator + readiness score
   ============================================================ */
(function () {
  window.SS = window.SS || {};

  /* Track → module count mapping */
  const TRACK_TOTALS = {
    foundations: 7,
    storage:     5,
    patterns:    6,
    systems:     9,
    interview:   5,
  };

  const TOTAL_MODULES = Object.values(TRACK_TOTALS).reduce((a, b) => a + b, 0);

  /* ── Readiness score (0–100) ── */
  function calcReadiness(user) {
    if (!user) return 0;
    const prog    = window.SS.progress;
    const total   = prog ? prog.getTotalProgress() : { done: 0, total: TOTAL_MODULES };
    const done    = total.done || 0;
    const avgQuiz = _avgQuizScore(prog);
    const daysDone = _daysSinceStart(user);
    const mocksDone = user.mocksDone || 0;

    const moduleScore   = Math.min((done / TOTAL_MODULES) * 40, 40);
    const quizScore     = avgQuiz * 30;
    const practiceScore = Math.min((daysDone / 14) * 20, 20);
    const mockScore     = Math.min(mocksDone * 3.3, 10);

    return Math.round(moduleScore + quizScore + practiceScore + mockScore);
  }

  function _avgQuizScore(prog) {
    if (!prog) return 0;
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith('ss_progress'));
    try {
      const raw = localStorage.getItem('ss_progress_v1');
      if (!raw) return 0;
      const data = JSON.parse(raw);
      const scores = Object.values(data.quizScores || {});
      if (!scores.length) return 0;
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    } catch (_) { return 0; }
  }

  function _daysSinceStart(user) {
    if (!user || !user.savedAt) return 0;
    return Math.round((Date.now() - user.savedAt) / 86400000);
  }

  /* ── Track readiness per-track ── */
  function calcTrackReadiness(user) {
    const prog = window.SS.progress;
    const out  = {};
    Object.entries(TRACK_TOTALS).forEach(([trackId, total]) => {
      const tp = prog ? prog.getTrackProgress(trackId) : { done: 0, total };
      out[trackId] = Math.round((tp.done / tp.total) * 100);
    });
    return out;
  }

  /* ── Daily task rules ── */
  function generateDailyTasks(user) {
    if (!user) return _defaultTasks();
    const prog     = window.SS.progress;
    const days     = user.daysToInterview || 60;
    const urgency  = user.urgency || 'medium';
    const company  = user.targetCompany || 'other';
    const done     = prog ? prog.getTotalProgress().done : 0;
    const tasks    = [];

    // Rule 1: No modules done → start foundations
    if (done === 0) {
      tasks.push({
        title: 'Start: Scalability Fundamentals',
        desc:  'Learn how load, concurrency, and throughput relate — the baseline for all system design.',
        type:  'learn',
        href:  'learn.html#foundations',
        xp:    25,
      });
    } else {
      // Rule 2: Unfinished track → push next module
      const nextModule = _findNextModule(prog);
      if (nextModule) tasks.push(nextModule);
    }

    // Rule 3: Company-specific estimator practice
    const companySystem = _companySystem(company, done);
    tasks.push({
      title:  `Estimate: ${companySystem.name}`,
      desc:   `${companySystem.company}-style design question. Practice the 5-step framework end-to-end.`,
      type:   'practice',
      href:   `estimator.html?s=${companySystem.id}`,
      xp:     40,
    });

    // Rule 4: Urgency-driven review
    if (urgency === 'critical' || urgency === 'high') {
      tasks.push({
        title: 'Quick: FAANG Evaluation Rubric',
        desc:  'Interviewers score on Clarification, High-Level Design, Deep Dive, Trade-offs, and Communication.',
        type:  'review',
        href:  'reference.html',
        xp:    15,
      });
    } else {
      // Low urgency → suggest weak area
      const weakTrack = (user.weakAreas || [])[0] || 'patterns';
      tasks.push({
        title: `Strengthen: ${_trackLabel(weakTrack)}`,
        desc:  `Your weakest area — spend 20 min here today to build systematic depth.`,
        type:  'learn',
        href:  `learn.html#${weakTrack}`,
        xp:    30,
      });
    }

    return tasks.slice(0, 3);
  }

  function _defaultTasks() {
    return [
      { title: 'Start: Scalability Fundamentals', desc: 'The foundation of every system design interview.', type: 'learn',    href: 'learn.html#foundations', xp: 25 },
      { title: 'Estimate: URL Shortener',          desc: 'Classic FAANG warm-up — great first estimator.', type: 'practice', href: 'estimator.html?s=url-shortener', xp: 40 },
      { title: 'Read: Interview Cheat Sheet',       desc: 'Key numbers every engineer should know cold.',   type: 'review',   href: 'reference.html', xp: 15 },
    ];
  }

  function _findNextModule(prog) {
    if (!prog) return null;
    const order = ['foundations', 'storage', 'patterns', 'systems', 'interview'];
    for (const trackId of order) {
      const tp = prog.getTrackProgress(trackId);
      if (tp.done < tp.total) {
        return {
          title: `Continue: ${_trackLabel(trackId)} — Module ${tp.done + 1}`,
          desc:  `Pick up where you left off. ${tp.total - tp.done} modules remaining in this track.`,
          type:  'learn',
          href:  `learn.html#${trackId}`,
          xp:    25,
        };
      }
    }
    return null;
  }

  function _companySystem(company, done) {
    const map = {
      google:    [
        { id: 'search-autocomplete', name: 'Search Autocomplete', company: 'Google' },
        { id: 'key-value-store',     name: 'Key-Value Store',     company: 'Google' },
      ],
      meta:      [
        { id: 'notification-service', name: 'Notification Service', company: 'Meta' },
        { id: 'url-shortener',         name: 'URL Shortener',         company: 'Meta' },
      ],
      amazon:    [
        { id: 'rate-limiter',         name: 'Rate Limiter',         company: 'Amazon' },
        { id: 'key-value-store',      name: 'Key-Value Store',      company: 'Amazon' },
      ],
      netflix:   [
        { id: 'video-streaming', name: 'Video Streaming', company: 'Netflix' },
        { id: 'cdn',             name: 'CDN Design',      company: 'Netflix' },
      ],
      microsoft: [
        { id: 'key-value-store',      name: 'Key-Value Store',      company: 'Microsoft' },
        { id: 'search-autocomplete',  name: 'Search Autocomplete',  company: 'Microsoft' },
      ],
    };
    const systems = map[company] || [
      { id: 'url-shortener', name: 'URL Shortener', company: 'Target' },
      { id: 'rate-limiter',  name: 'Rate Limiter',  company: 'Target' },
    ];
    return systems[done % systems.length];
  }

  function _trackLabel(id) {
    const map = {
      foundations: 'Foundations',
      storage:     'Storage Systems',
      patterns:    'Design Patterns',
      systems:     'Real Systems',
      interview:   'Interview Skills',
    };
    return map[id] || id;
  }

  /* ── Company insight tips ── */
  const COMPANY_TIPS = {
    google: [
      'Google interviewers weigh "Googleyness": clarity, trade-off awareness, and scalability thinking.',
      'At Google, design for global scale first — then talk about regional optimisations.',
      'Google loves distributed systems questions: Chubby, Bigtable, Spanner patterns appear frequently.',
    ],
    meta: [
      'Meta focuses on product intuition — always clarify the business reason before diving into architecture.',
      'Meta interviews test "move fast": they want pragmatic decisions, not perfect ones.',
      'Feed ranking and real-time notification systems are Meta staples. Know pub/sub cold.',
    ],
    amazon: [
      'Amazon uses Leadership Principles as a scoring dimension — weave in trade-off ownership.',
      '"Frugality" principle: always estimate cost and show awareness of cloud spend in your design.',
      'Amazon cares about reliability: talk about fault tolerance, retry logic, and circuit breakers.',
    ],
    netflix: [
      'Netflix values chaos engineering thinking: design for failure from the first slide.',
      'Streaming and CDN questions dominate Netflix loops — know adaptive bitrate and edge caching.',
      'Microservices, service mesh, and sidecars are first-class topics at Netflix.',
    ],
    microsoft: [
      'Microsoft interviewers appreciate object-oriented decomposition before scaling.',
      'Azure-native patterns (Event Hub, Cosmos DB) come up frequently — mention them when relevant.',
      'Microsoft values systematic estimation: show your math step-by-step.',
    ],
    other: [
      'Start every design by clarifying functional and non-functional requirements.',
      'A strong back-of-envelope estimate signals technical fluency to any interviewer.',
      'Trade-offs matter more than "right answers" — name the pros and cons explicitly.',
    ],
  };

  function getDailyTip(user) {
    const company = (user && user.targetCompany) || 'other';
    const tips = COMPANY_TIPS[company] || COMPANY_TIPS.other;
    const dayIndex = Math.floor(Date.now() / 86400000) % tips.length;
    return tips[dayIndex];
  }

  /* ── Public API ── */
  window.SS.mentor = {
    calcReadiness,
    calcTrackReadiness,
    generateDailyTasks,
    getDailyTip,
    TRACK_TOTALS,
    TOTAL_MODULES,
  };
})();
