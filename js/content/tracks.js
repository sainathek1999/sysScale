(function () {
  window.SS = window.SS || {};

  window.SS.TRACKS = [
    {
      id: 'foundations',
      name: 'Foundations',
      icon: '⚡',
      color: '#22D3EE',
      description: 'HTTP, scaling patterns, load balancers, CAP theorem, consistency.',
      modules: [
        { id: 'internet-basics',       title: 'How the Internet Works',    readingMins: 8,  difficulty: 'beginner'     },
        { id: 'apis-protocols',        title: 'APIs & Protocols',           readingMins: 10, difficulty: 'beginner'     },
        { id: 'scaling-fundamentals',  title: 'Scaling Fundamentals',       readingMins: 12, difficulty: 'beginner'     },
        { id: 'load-balancers',        title: 'Load Balancers',             readingMins: 10, difficulty: 'beginner'     },
        { id: 'cap-theorem',           title: 'CAP Theorem',                readingMins: 8,  difficulty: 'beginner'     },
        { id: 'consistency-models',    title: 'Consistency Models',         readingMins: 12, difficulty: 'intermediate' },
        { id: 'replication',           title: 'Replication Strategies',     readingMins: 10, difficulty: 'intermediate' },
      ],
    },
    {
      id: 'storage',
      name: 'Storage & Databases',
      icon: '🗄',
      color: '#A78BFA',
      description: 'SQL internals, NoSQL patterns, caching, sharding, search.',
      modules: [
        { id: 'sql-internals',         title: 'SQL Internals',              readingMins: 15, difficulty: 'intermediate' },
        { id: 'nosql-landscape',       title: 'NoSQL Landscape',            readingMins: 12, difficulty: 'intermediate' },
        { id: 'caching-deep-dive',     title: 'Caching Deep Dive',          readingMins: 15, difficulty: 'intermediate' },
        { id: 'sharding-partitioning', title: 'Sharding & Partitioning',    readingMins: 12, difficulty: 'advanced'     },
        { id: 'search-internals',      title: 'Search Internals',           readingMins: 12, difficulty: 'advanced'     },
      ],
    },
    {
      id: 'patterns',
      name: 'Core Patterns',
      icon: '🔄',
      color: '#F59E0B',
      description: 'Consistent hashing, distributed transactions, resilience.',
      modules: [
        { id: 'consistent-hashing',        title: 'Consistent Hashing',             readingMins: 10, difficulty: 'intermediate' },
        { id: 'leader-election',           title: 'Leader Election',                readingMins: 12, difficulty: 'advanced'     },
        { id: 'distributed-transactions',  title: 'Distributed Transactions',       readingMins: 15, difficulty: 'advanced'     },
        { id: 'event-sourcing',            title: 'Event Sourcing & CQRS',          readingMins: 12, difficulty: 'advanced'     },
        { id: 'resilience-patterns',       title: 'Resilience Patterns',            readingMins: 10, difficulty: 'intermediate' },
        { id: 'probabilistic-structures',  title: 'Probabilistic Data Structures',  readingMins: 10, difficulty: 'advanced'     },
      ],
    },
    {
      id: 'systems',
      name: 'Systems',
      icon: '⚙',
      color: '#10B981',
      description: '9 production systems now — growing to 30. Interactive estimator for each.',
      modules: [
        { id: 'rate-limiter',    title: 'Rate Limiter',          readingMins: 0, difficulty: 'intermediate', estimatorId: 'rate-limiter'   },
        { id: 'url-shortener',   title: 'URL Shortener',         readingMins: 0, difficulty: 'beginner',     estimatorId: 'url-shortener'  },
        { id: 'chat-service',    title: 'Chat Service',          readingMins: 0, difficulty: 'intermediate', estimatorId: 'chat-service'   },
        { id: 'notifications',   title: 'Notifications',         readingMins: 0, difficulty: 'intermediate', estimatorId: 'notifications'  },
        { id: 'typeahead',       title: 'Search Typeahead',      readingMins: 0, difficulty: 'intermediate', estimatorId: 'typeahead'      },
        { id: 'zoom',            title: 'Video Conferencing',    readingMins: 0, difficulty: 'advanced',     estimatorId: 'zoom'           },
        { id: 'news-feed',       title: 'News Feed',             readingMins: 0, difficulty: 'intermediate', estimatorId: 'news-feed'      },
        { id: 'ride-sharing',    title: 'Ride Sharing',          readingMins: 0, difficulty: 'advanced',     estimatorId: 'ride-sharing'   },
        { id: 'job-scheduler',   title: 'Job Scheduler',         readingMins: 0, difficulty: 'advanced',     estimatorId: 'job-scheduler'  },
      ],
    },
    {
      id: 'interview',
      name: 'Interview Mastery',
      icon: '🎯',
      color: '#EC4899',
      description: 'Mock interviews, estimation drills, talking points, common mistakes.',
      modules: [
        { id: 'interview-framework',    title: 'The 5-Step Framework',             readingMins: 8,  difficulty: 'beginner'     },
        { id: 'numbers-to-know',        title: 'Numbers Every Engineer Must Know', readingMins: 10, difficulty: 'beginner'     },
        { id: 'common-mistakes',        title: 'Top 10 Interview Mistakes',        readingMins: 8,  difficulty: 'beginner'     },
        { id: 'advanced-talking-points',title: 'Advanced Talking Points',          readingMins: 12, difficulty: 'intermediate' },
        { id: 'mock-breakdown',         title: 'Mock Interview Breakdown',         readingMins: 15, difficulty: 'advanced'     },
      ],
    },
  ];
})();
