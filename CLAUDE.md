# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step or dependencies to install.

```bash
npm start          # python3 -m http.server 8000  →  http://localhost:8000
# or just open index.html directly in a browser
```

## Architecture

Zero-dependency vanilla JS/CSS app. Everything lives on a single global namespace `window.SS`.

### Pages

| Page | Auth required | Purpose |
|---|---|---|
| `landing.html` | No | Marketing / unauthenticated entry point |
| `login.html` | No | Google Sign-In via Firebase |
| `onboarding.html` | No | 4-step wizard (company/level/timeline) |
| `estimator.html` | No | Main estimator tool — accessible without onboarding |
| `index.html` | Yes | Dashboard — redirects to `estimator.html` if not onboarded |
| `learn.html` | No | Curriculum browser (5 tracks, 18+ modules) |
| `module.html` | No | Individual module content + quiz |
| `practice.html` | No | Mock interview (timed sessions) |
| `reference.html` | No | Capacity constants / latency cheat sheet |
| `companies.html` | No | Company grid |
| `company.html` | No | Per-company rubric + top systems |

### Auth layer

Pages requiring login add `data-auth-required="true"` to `<body>`. `firebase-init.js` reads this attribute on `onAuthStateChanged` and redirects unauthenticated users to `login.html?next=<current-path>`.

Two Firebase scripts serve different purposes:
- **`js/auth/firebase-init.js`** — use on pages that need Firestore writes or auth gating. Exposes `window.SS_FIREBASE` (`auth`, `db`, `fbAuth`, `fbStore`) and `window.SS_USER`. Fires `window._onAuthUser(user)` after auth resolves. Also creates/ensures the Firestore user doc (`users/{uid}` with `email`, `hasPaid`, `createdAt`).
- **`js/auth/nav-auth.js`** — lightweight script for pages that only need the nav Sign In / Sign Out chip. Initializes Firebase under a named app `'nav'` to avoid conflicts.

### localStorage keys

All user state is localStorage-first (no server sync):

| Key | Owner | Contents |
|---|---|---|
| `ss_theme` | `theme.js` | `'light'` or `'dark'` |
| `ss_user_v1` | `onboarding.js` | Onboarding answers + XP + streak + `savedAt` |
| `ss_progress_v1` | `progress.js` | `completedModules[]` + `quizScores{}` |
| `ss_achievements_v1` | `gamification.js` | Unlocked achievement IDs |

### Estimator script load order

`estimator.html` loads scripts in this exact sequence (order matters):

1. `js/utils/format.js` — number formatters (`fmt`, `fmtB`, `fmtBw`) attached to `window.SS`
2. `js/core/diagram.js` — `SS.drawArch(nodes, edges)` SVG builder
3. `js/core/state.js` — initializes `SS.SYSTEMS`, `SS.paramState`, `SS.cur`, and `SS.register()`
4. `js/core/render.js` — all DOM rendering (`SS.renderAll`, `SS.renderCenter`, etc.)
5. `js/systems/*.js` — each system file self-registers via `SS.register(id, def)` at parse time
6. `js/app.js` — event handlers + `DOMContentLoaded` boot that calls `SS.renderAll()`

**Data flow:** param slider/select → `SS.onSlide` / `SS.onSelect` → updates `SS.paramState` → calls `sys.compute(p)` → passes result `c` to `metrics()`, `steps()`, `arch()`, `components()`, `tradeoffs()` → innerHTML written to DOM elements.

**Bottleneck signaling:** when `compute()` sets `c.bottleneck` to a non-null string, `render.js` injects a warning banner, and any arch node with `color: '#ef4444'` gets the pulsing CSS animation via the `.arch-node-bottleneck` class.

### Learning platform modules

Four core modules are used by `index.html` and `learn.html`/`module.html`:

- **`js/core/onboarding.js`** → `window.SS.onboarding` — 4-step wizard state; `isComplete()`, `getUser()`, `getCompany(id)`, `clear()`, `LEVELS`, `TIMELINES`.
- **`js/core/progress.js`** → `window.SS.progress` — module completion; `completeModule(id)`, `isCompleted(id)`, `getTrackProgress(trackId)`, `saveQuizScore(moduleId, score)`.
- **`js/core/gamification.js`** → `window.SS.gamification` — XP/level tiers (Intern → Legend), achievements, streak; `levelFromXP(xp)`, `checkAndUnlock()`, `updateStreak()`.
- **`js/core/mentor.js`** → `window.SS.mentor` — daily task generation + readiness score (0–100 weighted: 40% module completion, 30% quiz avg, 20% days active, 10% mock count); `calcReadiness(user)`, `generateDailyTasks(user)`.

Content lives in `js/content/`:
- `tracks.js` → `window.SS.TRACKS` (array of 5 track objects; `id` values: `foundations`, `storage`, `patterns`, `systems`, `interview`)
- `modules-foundations.js`, `modules-storage.js`, `modules-patterns.js`, `modules-interview.js` — module definitions per track
- `companies.js` → company rubrics / insights
- `requirements.js` — requirements framework content

## Adding a new system

1. Create `js/systems/your-system.js` — call `window.SS.register('your-id', { ... })` inside an IIFE.
2. Add `<script src="js/systems/your-system.js"></script>` to `estimator.html` before `js/app.js`.

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
- Theme is applied via `data-theme` on `<html>`. Each page `<head>` has an inline `<script>` that reads `ss_theme` from localStorage and sets the attribute before first paint — this prevents the light→dark flash. Do not remove this inline script.

## HTML CSS class reference (for `steps` body HTML)

- `.formula-box` — highlighted formula/equation block
- `.metrics-table` — two-column table for key/value pairs
- `.info-box` — soft highlight for notes
- `.hl` — accent-colored table cell value
