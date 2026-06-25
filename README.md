# ⚡ SysScale

Interactive capacity-estimation tool for system design interviews. Tune real-world
parameters with sliders and watch traffic, storage, bandwidth, node counts, the live
architecture diagram, and component recommendations update in real time.

## Quick start

No build step. Just open `index.html` in any browser:

```bash
# option 1 — double-click index.html

# option 2 — serve locally (recommended, avoids any file:// quirks)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
sysscale/
├── index.html              # entry point — wires up CSS + JS
├── README.md
├── css/
│   ├── tokens.css          # design system variables (colors, type, motion)
│   ├── base.css            # reset + global element styles
│   ├── layout.css          # 3-column app skeleton (the responsive grid)
│   ├── components.css      # cards, tables, pills, badges, formulas
│   └── animations.css      # keyframes + entrance/transition effects
└── js/
    ├── utils/
    │   └── format.js       # fmt() / fmtB() / fmtBw() number helpers
    ├── core/
    │   ├── diagram.js      # SVG architecture-diagram renderer
    │   ├── state.js        # system registry + parameter state
    │   └── render.js       # all DOM rendering
    ├── systems/            # ← ONE FILE PER SYSTEM
    │   ├── rate-limiter.js
    │   ├── url-shortener.js
    │   ├── chat-service.js
    │   ├── notifications.js
    │   └── typeahead.js
    └── app.js              # event handlers + bootstrap (loaded last)
```

## Architecture

Everything hangs off a single global namespace, `window.SS`. Each system file
self-registers via `SS.register(id, definition)`. The core renderer reads the
registry and draws the UI — it never needs to know which systems exist.

```
format.js ─┐
diagram.js ─┤→  SS.*  ←─ systems/*.js  (register themselves)
state.js  ─┤
render.js ─┘
                 ↑
              app.js  (wires events, boots on DOMContentLoaded)
```

## Adding a new system

1. Create `js/systems/your-system.js`:

```js
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  window.SS.register('your-system', {
    name: 'Your System',
    icon: '🧩',
    params: {
      dau: { label: 'Daily active users',
             options: ['1M','10M','100M'], values: [1e6,10e6,100e6], def: 1 },
      // type: 'select' makes a dropdown instead of a slider
    },
    compute(p) {
      const dau = p.dau.v;
      // ... do the math, return everything the views need
      return { dau, /* ... */, bottleneck: null };
    },
    metrics(c)    { return [ { val: fmt(c.dau), lbl: 'DAU', cls: 'accent' } ]; },
    steps(c, p)   { return [ { title: 'Clarify scope', summary: '...', body: '<table>...</table>' } ]; },
    arch(c)       { return drawArch([ /* nodes */ ], [ /* edges */ ]); },
    components()  { return [ { icon: '⚡', name: 'Redis', best: true, reason: '...', stats: ['...'] } ]; },
    tradeoffs(c)  { return [ { algo: '...', pro: '...', con: '...' } ]; },
    tips: [ 'Interview talking point 1', '...' ],
  });
})();
```

2. Add the script tag to `index.html` (before `js/app.js`):

```html
<script src="js/systems/your-system.js"></script>
```

That's it — it appears in the sidebar automatically.

### Field reference

| Method | Returns | Purpose |
|---|---|---|
| `compute(p)` | object `c` | All derived numbers. Set `c.bottleneck` to a string to trigger the red warning + pulsing red arch node. |
| `metrics(c)` | array | Top metric bar. `cls`: accent/teal/amber/green/purple. |
| `steps(c, p)` | array | Collapsible estimation steps. `body` is HTML (use `.formula-box`, `.metrics-table`, `.info-box`). |
| `arch(c)` | SVG string | Live architecture. Use `drawArch(nodes, edges)`. Node color `#ef4444` = animated bottleneck. |
| `components()` | array | Right-panel component cards. `best: true` shows the green "Best fit" badge. |
| `tradeoffs(c)` | array | Right-panel pro/con table. |
| `tips` | array of strings | Interview talking points box. |

## Styling conventions

- All colors come from CSS variables in `tokens.css` — never hardcode hex in components.
- Animations respect `prefers-reduced-motion`.
- Layout is responsive: right panel hides under 920px, left sidebar under 680px.

## License

Personal study tool. Use freely.
