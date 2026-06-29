# SysScale

Interactive system design interview prep tool. Pick a system, move sliders, and watch capacity math, architecture diagrams, and tradeoffs update live.

Free to use. No build step. No install.

---

## Getting started

**Option 1 — open directly in browser**
```
open index.html
```

**Option 2 — local server**
```bash
npm start
# visit http://localhost:8000
```

That's it. Create an account to save your progress across sessions.

---

## How to use it

### 1. Pick a system
Click any system in the left sidebar — Rate Limiter, URL Shortener, Chat Service, and 13 more. The estimator loads instantly.

### 2. Adjust the sliders
Change DAU, QPS, replication factor, cache hit rate, or whatever parameters the system exposes. Every number in the page updates live — storage totals, bandwidth, node counts, architecture diagrams.

### 3. Read the estimation steps
The center panel walks through the 4-phase interview framework:
- **Phase 1 — Requirements** — what to clarify before designing
- **Phase 2 — Estimation** — capacity math with real formulas
- **Phase 3 — Design** — architecture decisions and components
- **Phase 4 — Deep Dive** — tradeoffs, failure modes, reasoning cards

Click any step to expand it.

### 4. Study the architecture diagram
The SVG diagram updates as you move sliders. If a bottleneck is detected, the affected node pulses red and a warning banner appears at the top.

### 5. Check the right panel
- **Components** — recommended tech choices with pros/cons
- **Tradeoffs** — algorithm and approach comparisons
- **Tips** — what to say out loud in the actual interview

---

## All 16 systems

| System | What it tests |
|---|---|
| Rate Limiter | Token bucket, sliding window, distributed counters |
| URL Shortener | Base62 encoding, cache hit ratio, redirect QPS |
| Distributed Cache | Consistent hashing, eviction, replication |
| Message Queue | Throughput, partitioning, consumer lag |
| Chat Service | WebSocket fan-out, delivery guarantees |
| Notifications | Push vs pull, FCM/APNs, dedup |
| Search Typeahead | Trie vs inverted index, prefix cache, latency |
| Video Conferencing | SFU fan-out, simulcast, TURN relay |
| News Feed | Push/pull/hybrid fanout, celebrity problem |
| Ride Sharing | H3 geo-indexing, location update QPS |
| Job Scheduler | Little's Law, retry amplification, SKIP LOCKED |
| Web Crawler | BFS vs DFS, politeness, dedup bloom filter |
| Object Storage | Erasure coding, chunk sizing, metadata index |
| CDN | PoP placement, cache TTL, origin shield |
| Payment System | Idempotency, 2PC, exactly-once semantics |
| Social Graph | Adjacency list vs matrix, BFS for degrees |

---

## Practice mode

Open `practice.html` for:
- **Mock interview timer** — 35-minute countdown with stage prompts (clarify → estimate → design → deep dive → wrap-up)
- **Concept quiz** — flash cards on numbers every engineer should know (latency, throughput, storage sizes)
- **System comparison** — side-by-side tradeoffs across multiple systems

---

## Dashboard

`index.html` is your personal dashboard. It tracks:
- Systems studied and XP earned
- Current streak
- Track readiness by company (Google, Meta, Amazon, etc.)
- Today's recommended focus

Sign in with email or Google to persist your progress.

---

## Learn mode

`learn.html` has structured learning tracks organized by company and role level (L4 → L7). Each track maps to the systems most likely to appear at that company.

---

## Reference

`reference.html` is a cheat sheet:
- Latency numbers every engineer should know
- Storage size reference (KB → PB)
- Throughput benchmarks by component
- Common capacity estimation formulas

---

## Tech

Zero dependencies. Vanilla JS + CSS. Firebase for auth and progress sync.
