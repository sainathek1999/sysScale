# SysScale

Interactive capacity-estimation and system design interview prep tool. Tune real-world parameters with sliders and watch traffic, storage, bandwidth, node counts, live architecture diagrams, and component recommendations update instantly.

**Live demo:** open `index.html` — no build step, no dependencies, no backend.

---

## What it does

- **9 production systems** with realistic math, bottleneck detection, and interview tips
- **Live architecture diagrams** — SVG updates as you move sliders; bottleneck nodes pulse red
- **Interview timer** — 35-minute countdown with stage prompts (clarify → design → estimate → deep-dive → wrap-up)
- **Shareable URLs** — every slider position is encoded in the URL (`?s=ride-sharing&p=dau:2,locHz:2`)
- **Glossary tooltips** — 50+ distributed-systems terms highlighted in-text with hover definitions
- **Export / print** — one-click print-optimised view with all steps expanded
- **Cheat sheet** — universal capacity constants, component throughput reference, storage sizes

---

## Quick start

```bash
# Option 1 — open directly
open index.html

# Option 2 — local server (avoids file:// quirks)
npm start          # runs: python3 -m http.server 8000
# visit http://localhost:8000
```

No npm install needed. `npm start` is just a shortcut for the Python server.

---

## Systems (9 total)

| System | Key concept | Bottleneck signal |
|---|---|---|
| **Rate Limiter** | Token bucket / sliding window / fixed window | Window rollover spike |
| **URL Shortener** | Base62 encoding, cache hit ratio, redirect QPS | Write amplification |
| **Chat Service** | WebSocket fan-out, message fan-in, delivery guarantees | Message queue depth |
| **Notifications** | Push vs pull, FCM/APNs throughput, dedup | Delivery storm |
| **Search Typeahead** | Trie vs inverted index, prefix cache, latency budget | Cache miss at leaf |
| **Video Conferencing** | SFU O(N²) fan-out, simulcast, TURN relay | SFU egress Tbps |
| **News Feed** | Push/pull/hybrid fanout, celebrity problem, Redis sorted sets | Celebrity write storm |
| **Ride Sharing** | H3 geo-indexing, location write storm, Redis GEO, surge pricing | Location update QPS |
| **Job Scheduler** | Little's Law queue depth, retry amplification, SKIP LOCKED | Retry storm |

---

## Features

### Interview timer
Click **Practice** in the header to start a 35-minute countdown. Stage prompts appear automatically:

| Time remaining | Prompt |
|---|---|
| 35:00 | Clarify requirements and scope |
| 30:00 | Define APIs and data models |
| 25:00 | Capacity estimation |
| 18:00 | High-level design |
| 10:00 | Deep dive on bottlenecks |
| 5:00 | Wrap up and tradeoffs |
| 2:00 | Final 2 minutes |

### Shareable URLs
Every system switch and slider move updates the URL with `replaceState` — no page reload.

```
http://localhost:8000?s=news-feed&p=dau:2,postsPerDay:2,avgFollowers:1,celebPct:1,mediaPct:2,fanout:2
```

Share a URL to hand off a specific configuration to someone else.

### Glossary
50+ distributed-systems terms (`DAU`, `SFU`, `MVCC`, `Saga`, `Little's Law`, `H3`, `Consistent hashing`, …) are automatically underlined in step bodies. Hover for a definition. Full alphabetical list in the **Glossary** right-panel tab.

### Export / print
Click **Export** in the header. All step cards expand and the browser print dialog opens with print-optimised CSS (panels hidden, white background, good typography).

---

## Project structure

```
sysscale/
├── index.html                  # entry point — wires CSS + JS in load order
├── package.json
├── css/
│   ├── tokens.css              # design tokens (colors, type, motion, shadows)
│   ├── base.css                # reset, global elements, scanline overlay
│   ├── layout.css              # 3-column skeleton (header + sidebar + center + right)
│   ├── components.css          # all UI components + timer + glossary + print CSS
│   └── animations.css          # keyframes + staggered entrance animations
└── js/
    ├── utils/
    │   ├── format.js           # fmt() fmtB() fmtBw() number formatters
    │   └── glossary.js         # 50+ term definitions + DOM tooltip injection
    ├── core/
    │   ├── diagram.js          # drawArch(nodes, edges) → SVG string
    │   ├── state.js            # SS.SYSTEMS registry + SS.paramState + SS.cur
    │   └── render.js           # all DOM rendering (renderAll, renderCenter, etc.)
    ├── systems/
    │   ├── rate-limiter.js
    │   ├── url-shortener.js
    │   ├── chat-service.js
    │   ├── notifications.js
    │   ├── typeahead.js
    │   ├── zoom.js             # Video Conferencing
    │   ├── news-feed.js        # Social News Feed
    │   ├── ride-sharing.js     # Ride Sharing (Uber-like)
    │   └── job-scheduler.js    # Distributed Job Scheduler
    └── app.js                  # event handlers, URL state, timer, export, boot
```

---

## Architecture

Everything hangs off `window.SS`. Scripts load in strict order; each system file self-registers at parse time.

```
format.js ──┐
glossary.js ┤
diagram.js ─┤──▶  window.SS  ◀── systems/*.js  (register on load)
state.js   ─┤
render.js  ─┘
                      ▲
                   app.js  (wires events, reads URL, boots on DOMContentLoaded)
```

**Data flow:**
```
slider/select → SS.onSlide / SS.onSelect
  → updates SS.paramState
  → sys.compute(p) → c
  → metrics(c) → metric bar
  → steps(c, p) → step cards
  → arch(c) → SVG diagram
  → components() → right panel
  → tradeoffs(c) → right panel
```

**Bottleneck signaling:** `compute()` sets `c.bottleneck` to a string → red warning banner appears + any arch node with `color: '#ef4444'` gets the pulsing `.arch-node-bottleneck` animation.

---

## Adding a new system

**Step 1** — create `js/systems/your-system.js`:

```js
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('your-system', {
    name: 'Your System',
    icon: '🧩',

    params: {
      dau: {
        label: 'Daily active users',
        options: ['1M', '10M', '100M'],
        values:  [1e6,  10e6,  100e6],
        def: 1,
      },
      mode: {
        label: 'Consistency model',
        type: 'select',                          // dropdown instead of slider
        options: ['Strong', 'Eventual', 'Causal'],
        def: 0,
      },
    },

    compute(p) {
      const dau = p.dau.v;
      const qps = dau / 86400;
      // ... all derived numbers
      return { dau, qps, bottleneck: qps > 1e6 ? 'DB write limit' : null };
    },

    metrics(c) {
      return [
        { val: fmt(c.dau),        lbl: 'DAU',      cls: 'accent' },
        { val: fmt(c.qps) + '/s', lbl: 'Avg QPS',  cls: 'teal'   },
        // cls values: accent | teal | amber | green | purple
      ];
    },

    steps(c, p) {
      return [
        {
          title:   'Clarify scope',
          summary: '5 decisions',
          body:    `<table class="metrics-table">
                     <tr><td>Consistency</td><td class="hl">Eventual OK</td></tr>
                   </table>`,
        },
        // ... more steps
      ];
    },

    arch(c) {
      return drawArch(
        [
          { id: 'clients', x: 75, y: 10, w: 210, h: 34, label: 'Clients', color: '#6366f1' },
          { id: 'db',      x: 75, y: 80, w: 210, h: 34, label: 'Database', color: '#22c55e' },
          // color '#ef4444' = red = triggers .arch-node-bottleneck pulse animation
        ],
        [
          { from: 'clients', to: 'db', label: 'write' },
        ]
      );
    },

    components() {
      return [
        {
          icon: '⚡', name: 'Redis', best: true,
          reason: 'Sub-millisecond reads, 100K ops/s per node.',
          stats: ['100K ops/s', '<1ms', 'In-memory'],
        },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'Redis', pro: 'Fast reads, simple', con: 'Memory-bound, no persistence by default' },
      ];
    },

    tips: [
      'Lead with the bottleneck — say it out loud before the interviewer has to ask.',
    ],
  });
})();
```

**Step 2** — add the script tag to `index.html` before `js/app.js`:

```html
<script src="js/systems/your-system.js"></script>
```

It appears in the sidebar automatically. No other files need to change.

---

## System definition reference

| Key | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Displayed in sidebar |
| `icon` | string | ✓ | Emoji for sidebar button |
| `params` | object | ✓ | Slider/select definitions (see below) |
| `compute(p)` | fn → `c` | ✓ | All math. Set `c.bottleneck` to trigger warning |
| `metrics(c)` | fn → array | ✓ | Top metric bar pills |
| `steps(c, p)` | fn → array | ✓ | Collapsible step cards |
| `arch(c)` | fn → string | ✓ | SVG via `drawArch(nodes, edges)` |
| `components()` | fn → array | ✓ | Right-panel component cards |
| `tradeoffs(c)` | fn → array | ✓ | Right-panel pro/con table |
| `tips` | string[] | ✓ | Interview talking points |

### Param definition

```js
// Slider (default)
key: {
  label:   'Display label',
  options: ['1M', '10M', '100M'],   // shown in UI
  values:  [1e6,  10e6,  100e6],    // numeric, passed as p.key.v
  def:     1,                        // default index into options[]
}

// Dropdown
key: {
  label:   'Display label',
  type:    'select',
  options: ['Option A', 'Option B'],
  def:     0,
}
// accessed as p.key.i (index) — no values[] for selects
```

### HTML classes available in `steps` body

| Class | Use |
|---|---|
| `.formula-box` | Mono block for equations; `.v` = cyan variable, `.r` = amber result |
| `.metrics-table` | Two-column key/value table; `.hl` = cyan, `.warn` = amber, `.good` = green |
| `.info-box` + `.info-box-title` + `.info-box-body` | Callout block for explanations |

---

## CSS conventions

- All colors come from `css/tokens.css` CSS variables — never hardcode hex in components or system files.
- **Exception:** `drawArch` node colors use hex literals directly (they are SVG fill attributes, not CSS). `#ef4444` = bottleneck red, `#6366f1` = default indigo.
- All animations respect `prefers-reduced-motion` (defined in `css/animations.css`).
- Responsive: right panel hidden below 920px, left sidebar hidden below 680px.

---

## Design

- **Theme:** Mission-control dark — deep void backgrounds, electric cyan primary, amber warnings
- **Signature:** Scanline overlay (`body::before`) — subtle horizontal banding gives a live instrument-panel feel
- **Logo:** CSS `@property` conic gradient animating through cyan → indigo → violet
- **Fonts:** Space Grotesk (display/headers) + Inter (body) + JetBrains Mono (data/code)
- **Scroll:** Lenis v1.1.14 for inertial smooth scroll on step and right panels
- **Metric pills:** Cockpit-gauge style — glowing mono values with color `text-shadow` bloom

---

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | None — vanilla JS | Zero dependencies, instant load, no build |
| State | `window.SS` global | Simple, predictable, no module bundler needed |
| Styling | 5 plain CSS files | CSS custom properties handle all theming |
| Fonts | Google Fonts CDN | Space Grotesk + Inter + JetBrains Mono |
| Scroll | Lenis CDN (7KB) | Only external runtime dependency |
| Diagrams | Hand-rolled SVG | Full control, no D3/chart library needed |

---

## License

MIT — use freely for study, interview prep, or as a reference for your own tools.
