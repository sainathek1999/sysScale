# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step or dependencies to install.

```bash
npm start          # python3 -m http.server 8000  →  http://localhost:8000
# or just open index.html directly in a browser
```

## Architecture

This is a zero-dependency vanilla JS/CSS app. Everything lives on a single global namespace `window.SS`.

**Execution order matters** — `index.html` loads scripts in this sequence:

1. `js/utils/format.js` — number formatters (`fmt`, `fmtB`, `fmtBw`) attached to `window.SS`
2. `js/core/diagram.js` — `SS.drawArch(nodes, edges)` SVG builder
3. `js/core/state.js` — initializes `SS.SYSTEMS`, `SS.paramState`, `SS.cur`, and `SS.register()`
4. `js/core/render.js` — all DOM rendering (`SS.renderAll`, `SS.renderCenter`, etc.)
5. `js/systems/*.js` — each system file self-registers via `SS.register(id, def)` at parse time
6. `js/app.js` — event handlers + `DOMContentLoaded` boot that calls `SS.renderAll()`

**Data flow:** param slider/select → `SS.onSlide` / `SS.onSelect` → updates `SS.paramState` → calls `sys.compute(p)` → passes result `c` to `metrics()`, `steps()`, `arch()`, `components()`, `tradeoffs()` → innerHTML written to DOM elements.

**Bottleneck signaling:** when `compute()` sets `c.bottleneck` to a non-null string, `render.js` injects a warning banner, and any arch node with `color: '#ef4444'` gets the pulsing CSS animation via the `.arch-node-bottleneck` class.

## Adding a new system

1. Create `js/systems/your-system.js` — call `window.SS.register('your-id', { ... })` inside an IIFE.
2. Add `<script src="js/systems/your-system.js"></script>` to `index.html` before `js/app.js`.

The system definition object must implement:

| Key | Type | Description |
|---|---|---|
| `name` | string | Displayed in the sidebar |
| `icon` | string | Emoji for the sidebar button |
| `params` | object | Each key is a param; `options` = labels, `values` = numeric values, `def` = default index. Use `type: 'select'` for a dropdown instead of a slider. |
| `compute(p)` | fn → object `c` | All derived numbers. Set `c.bottleneck` to a string to trigger the warning. |
| `metrics(c)` | fn → array | Top metric pills. `cls` values: `accent`, `teal`, `amber`, `green`, `purple`. |
| `steps(c, p)` | fn → array | Collapsible estimation steps. `body` is raw HTML. |
| `arch(c)` | fn → string | Call `SS.drawArch(nodes, edges)` and return the SVG string. |
| `components()` | fn → array | Component cards. `best: true` shows the "Best fit" badge. |
| `tradeoffs(c)` | fn → array | `{ algo, pro, con }` rows. |
| `tips` | string[] | Interview talking points. |

## CSS conventions

- All colors come from CSS variables defined in `css/tokens.css` — never hardcode hex values in components or system files.
- Arch node colors are the one exception: use hex literals when calling `drawArch` (e.g. `color: '#ef4444'` for bottleneck red, `color: '#6366f1'` for default indigo).
- Responsive breakpoints: right panel hidden below 920 px, left sidebar hidden below 680 px (defined in `css/layout.css`).
- All animations respect `prefers-reduced-motion` (defined in `css/animations.css`).

## HTML CSS class reference (for `steps` body HTML)

- `.formula-box` — highlighted formula/equation block
- `.metrics-table` — two-column table for key/value pairs
- `.info-box` — soft highlight for notes
- `.hl` — accent-colored table cell value
