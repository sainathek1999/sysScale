/* ============================================================
   ride-sharing.js — Ride-sharing platform (Uber/Lyft-like)
   ============================================================ */
(function () {
  const { fmt, fmtB, fmtBw, drawArch } = window.SS;

  const TRIP_BYTES       = 512;    // avg trip record size
  const LOCATION_BYTES   = 32;     // (lat, lng, heading, speed, ts) compressed
  const GEOFENCE_CELLS   = 10;     // h3 cells per driver write
  const MATCH_LATENCY_MS = 5000;   // target matching SLA (5s)

  window.SS.register('ride-sharing', {
    name: 'Ride Sharing',
    icon: '🚗',

    params: {
      dau:        { label: 'Daily riders (DAU)',         options: ['100K','1M','10M','50M','100M'],   values: [1e5,1e6,1e7,5e7,1e8],  def: 2 },
      ridesPerDay:{ label: 'Rides per rider / day',      options: ['1','2','3','5'],                  values: [1,2,3,5],              def: 1 },
      driverRatio:{ label: 'Driver : rider ratio',       options: ['1:5','1:10','1:20','1:50'],       values: [0.20,0.10,0.05,0.02],  def: 1 },
      locHz:      { label: 'Location update freq',       options: ['1 Hz','2 Hz','4 Hz','10 Hz'],    values: [1,2,4,10],             def: 1 },
      geoIndex:   { label: 'Geospatial index',           type: 'select',
                    options: ['H3 hexagonal grid', 'QuadTree', 'S2 cells', 'PostGIS'],              def: 0 },
    },

    compute(p) {
      const dau         = p.dau.v;
      const ridesPerDay = p.ridesPerDay.v;
      const driverRatio = p.driverRatio.v;
      const locHz       = p.locHz.v;
      const geoIndex    = p.geoIndex.i;

      // Derived numbers
      const activeDrivers     = dau * driverRatio;
      const peakDrivers       = activeDrivers * 0.5; // 50% on-trip at peak
      const ridesPerDay_total = dau * ridesPerDay;
      const rideRPS           = ridesPerDay_total / 86400;
      const peakRideRPS       = rideRPS * 5;

      // Location update writes (the big one)
      const locUpdatesPerSec  = activeDrivers * locHz;
      // Each update also writes to geo index (H3 cell writes)
      const geoWritesPerSec   = locUpdatesPerSec * GEOFENCE_CELLS;

      // Location DB bandwidth
      const locBandwidthBps   = locUpdatesPerSec * LOCATION_BYTES * 8;

      // Match request QPS (riders requesting a ride)
      const matchQPS          = peakRideRPS;

      // Storage
      const tripsPerDay       = ridesPerDay_total;
      const dailyTripBytes    = tripsPerDay * TRIP_BYTES;
      const yearlyTripStorage = dailyTripBytes * 365 * 3;

      // Location history (keep 30 days for analytics/disputes)
      const locRecordsPerDay  = activeDrivers * locHz * 8 * 3600; // 8 active hours
      const locHistoryBytes   = locRecordsPerDay * 30 * LOCATION_BYTES;

      // Matching: search radius in geo cells, return nearest N drivers
      const matchSearchMs     = geoIndex <= 1 ? 8 : 15; // H3/QuadTree vs PostGIS

      // Surge pricing: compute cell demand in real-time
      const surgeComputeHz    = 30; // re-compute every 30s
      const surgeCells        = 10000; // geographic cells per city

      // Bottleneck
      let bottleneck = null;
      if (locUpdatesPerSec > 500000) {
        bottleneck = `Location write storm: ${fmt(locUpdatesPerSec)} loc updates/sec + ${fmt(geoWritesPerSec)} geo index writes/sec. Partition location DB by geo-hash prefix. Use in-memory ring-buffer per driver, batch-flush to DB every 10s.`;
      } else if (locUpdatesPerSec > 100000) {
        bottleneck = `${fmt(locUpdatesPerSec)} location updates/sec approaching DB limits. Use Redis for hot driver positions (TTL=60s), async-flush to persistent store.`;
      }

      return {
        dau, ridesPerDay, driverRatio, locHz, geoIndex,
        activeDrivers, peakDrivers,
        ridesPerDay_total, rideRPS, peakRideRPS,
        locUpdatesPerSec, geoWritesPerSec, locBandwidthBps,
        matchQPS, matchSearchMs,
        dailyTripBytes, yearlyTripStorage,
        locRecordsPerDay, locHistoryBytes,
        surgeComputeHz, surgeCells,
        bottleneck,
      };
    },

    metrics(c) {
      return [
        { val: fmt(c.activeDrivers),      lbl: 'Active drivers',     cls: 'accent' },
        { val: fmt(c.locUpdatesPerSec)+'/s', lbl: 'Location writes', cls: 'amber'  },
        { val: fmt(c.peakRideRPS)+'/s',   lbl: 'Peak ride RPS',      cls: 'teal'   },
        { val: c.matchSearchMs + 'ms',    lbl: 'Match latency',      cls: 'purple' },
        { val: fmtB(c.yearlyTripStorage), lbl: 'Trip storage/year',  cls: 'green'  },
      ];
    },

    steps(c, p) {
      const geoNames = ['H3 hexagonal grid', 'QuadTree', 'S2 cells', 'PostGIS'];
      return [
        {
          title: 'Clarify scope',
          summary: '7 key decisions',
          body: `<table class="metrics-table">
            <tr><td>Core flows</td><td class="hl">Request ride → match → track → pay</td></tr>
            <tr><td>Matching SLA</td><td>&lt;5 seconds to show driver</td></tr>
            <tr><td>Location update freq</td><td>${c.locHz} Hz (every ${(1/c.locHz).toFixed(1)}s)</td></tr>
            <tr><td>Geospatial index</td><td>${geoNames[c.geoIndex]}</td></tr>
            <tr><td>Surge pricing</td><td>Real-time demand/supply ratio per cell</td></tr>
            <tr><td>Consistency</td><td>Driver position: eventual OK; payments: strong</td></tr>
            <tr><td>ETA calculation</td><td>External map API (Google Maps / OSRM)</td></tr>
          </table>`,
        },
        {
          title: 'Traffic estimation',
          summary: `${fmt(c.peakRideRPS)}/s rides · ${fmt(c.locUpdatesPerSec)}/s location writes`,
          body: `<div class="formula-box">
rides/day = DAU × rides_per_rider = <span class="v">${fmt(c.dau)}</span> × <span class="v">${c.ridesPerDay}</span> = <span class="r">${fmt(c.ridesPerDay_total)}</span><br>
peak_ride_RPS = (rides/day ÷ 86,400) × 5 = <span class="r">${fmt(c.peakRideRPS)}/s</span><br>
active_drivers = DAU × ratio = <span class="v">${fmt(c.dau)}</span> × <span class="v">${(c.driverRatio*100).toFixed(0)}%</span> = <span class="r">${fmt(c.activeDrivers)}</span><br>
location_writes/s = drivers × ${c.locHz} Hz = <span class="r">${fmt(c.locUpdatesPerSec)}/s</span></div>
<table class="metrics-table">
  <tr><td>Daily rides</td><td>${fmt(c.ridesPerDay_total)}</td></tr>
  <tr><td>Peak ride RPS (×5)</td><td class="hl">${fmt(c.peakRideRPS)}/s</td></tr>
  <tr><td>Active drivers</td><td>${fmt(c.activeDrivers)}</td></tr>
  <tr><td>Location updates/sec</td><td class="warn">${fmt(c.locUpdatesPerSec)}/s</td></tr>
  <tr><td>Geo index writes/sec</td><td class="warn">${fmt(c.geoWritesPerSec)}/s</td></tr>
  <tr><td>Location bandwidth</td><td>${fmtBw(c.locBandwidthBps)}</td></tr>
</table>`,
        },
        {
          title: 'Geospatial indexing',
          summary: `${geoNames[c.geoIndex]} · ${c.matchSearchMs}ms match`,
          body: `<table class="metrics-table">
  <tr><td>Index type</td><td class="hl">${geoNames[c.geoIndex]}</td></tr>
  <tr><td>Match search latency</td><td class="hl">${c.matchSearchMs}ms</td></tr>
  <tr><td>Match SLA target</td><td>≤${MATCH_LATENCY_MS}ms end-to-end</td></tr>
  <tr><td>Search radius</td><td>~2km (urban), ~10km (suburban)</td></tr>
  <tr><td>Drivers per cell (avg)</td><td>3–10</td></tr>
  <tr><td>Cells expanded on no result</td><td>Ring search: 1→7→19 cells</td></tr>
</table>
<div class="info-box"><div class="info-box-title">H3 hexagonal grid (Uber's approach)</div>
<div class="info-box-body">Uber open-sourced H3: hierarchical hex grid. Each cell has a unique 64-bit ID. Driver's lat/lng maps to cell in O(1). To find nearby drivers: lookup current cell + 6 neighbors. Hex neighbors are equidistant (unlike squares), avoiding corner-distance bias. Cells are 1.22km² at resolution 8.</div></div>
<div class="info-box"><div class="info-box-title">QuadTree alternative</div>
<div class="info-box-body">Recursively subdivide 2D space into quadrants. Dynamic — dense areas get smaller cells. Harder to distribute across nodes than H3. Used by Lyft (DynamoDB + QuadTree index).</div></div>`,
        },
        {
          title: 'Location write architecture',
          summary: `${fmt(c.locUpdatesPerSec)}/s → Redis hot store`,
          body: `<div class="formula-box">
write_pressure = drivers × Hz × geo_cells<br>
&nbsp;&nbsp;= <span class="v">${fmt(c.activeDrivers)}</span> × <span class="v">${c.locHz}</span> × <span class="v">${GEOFENCE_CELLS}</span> = <span class="r">${fmt(c.geoWritesPerSec)}/s</span></div>
<table class="metrics-table">
  <tr><td>Hot store (Redis)</td><td class="hl">driver:{id} → {lat,lng,ts}</td></tr>
  <tr><td>Redis key TTL</td><td>60 seconds (auto-expire offline drivers)</td></tr>
  <tr><td>Redis capacity</td><td>${fmt(c.activeDrivers)} keys × 64B ≈ ${fmtB(c.activeDrivers * 64)}</td></tr>
  <tr><td>Persistent store</td><td>Cassandra (time-series, partitioned by driver)</td></tr>
  <tr><td>Flush strategy</td><td>Ring buffer in app → batch write every 10s</td></tr>
  <tr><td>30-day location history</td><td class="warn">${fmtB(c.locHistoryBytes)}</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Why Redis for hot positions?</div>
<div class="info-box-body">Driver positions are read 100× more than they are written (every nearby ride request reads the geo index). Redis GEO commands (GEOADD, GEORADIUSBYMEMBER) are O(N+log M) for radius search. Persistent store is write-ahead-log async flush — not on the critical path.</div></div>`,
        },
        {
          title: 'Storage & surge pricing',
          summary: `${fmtB(c.yearlyTripStorage)} trips/year · real-time surge`,
          body: `<table class="metrics-table">
  <tr><td>Trip record size</td><td>~512 B</td></tr>
  <tr><td>Daily trips</td><td>${fmt(c.ridesPerDay_total)}</td></tr>
  <tr><td>Daily trip storage</td><td>${fmtB(c.dailyTripBytes)}</td></tr>
  <tr><td>Yearly (×365 ×3 repl.)</td><td class="hl">${fmtB(c.yearlyTripStorage)}</td></tr>
  <tr><td>Surge recompute interval</td><td>Every 30 seconds</td></tr>
  <tr><td>Geo cells per city</td><td>~10,000</td></tr>
  <tr><td>Surge store</td><td>Redis hash: cell_id → multiplier</td></tr>
</table>
<div class="info-box"><div class="info-box-title">Surge pricing algorithm</div>
<div class="info-box-body">Every 30s: count open_requests and available_drivers per H3 cell. Surge = f(demand/supply). Publish to Redis. Client polls every 5s for cell multiplier. Cap at 5× to avoid regulatory issues. Predictive model can forecast 10-min ahead using historical patterns.</div></div>`,
        },
      ];
    },

    arch(c) {
      const locHot = c.locUpdatesPerSec > 200000;
      return drawArch([
        { id: 'riders',   x: 20,  y: 10,  w: 120, h: 34, label: `Riders (${fmt(c.dau)})`,              color: '#2BA07E' },
        { id: 'drivers',  x: 220, y: 10,  w: 120, h: 34, label: `Drivers (${fmt(c.activeDrivers)})`,   color: '#f59e0b' },
        { id: 'api',      x: 95,  y: 74,  w: 170, h: 34, label: 'API Gateway',                          color: '#2BA07E' },
        { id: 'match',    x: 20,  y: 140, w: 120, h: 34, label: 'Match Service',                        color: '#6D28D9' },
        { id: 'location', x: 220, y: 140, w: 120, h: 34, label: 'Location Service',                     color: locHot ? '#ef4444' : '#14b8a6' },
        { id: 'redis',    x: 20,  y: 206, w: 120, h: 34, label: `Redis GEO (${fmt(c.activeDrivers)} drivers)`, color: '#14b8a6' },
        { id: 'surge',    x: 220, y: 206, w: 120, h: 34, label: 'Surge Engine',                         color: '#a855f7' },
        { id: 'tripdb',   x: 95,  y: 272, w: 170, h: 34, label: 'Trip DB (PostgreSQL)',                  color: '#22c55e' },
      ], [
        { from: 'riders',   to: 'api',      label: 'request' },
        { from: 'drivers',  to: 'api',      label: `${c.locHz}Hz loc` },
        { from: 'api',      to: 'match',    label: 'find' },
        { from: 'api',      to: 'location', label: 'update' },
        { from: 'match',    to: 'redis',    label: 'geo search' },
        { from: 'location', to: 'redis',    label: 'GEOADD' },
        { from: 'surge',    to: 'redis',    label: 'cell rates' },
        { from: 'api',      to: 'tripdb',   label: 'trips' },
      ]);
    },

    components() {
      return [
        {
          icon: '🗺️', name: 'Redis GEO (hot driver positions)', best: true,
          reason: 'GEOADD stores (lat,lng) per driver. GEORADIUSBYMEMBER finds drivers within Xkm in O(N+log M). TTL auto-expires offline drivers. Entire fleet fits in RAM — 1M drivers × 64B = 64MB.',
          stats: ['O(N+logM) search', 'GEORADIUS', 'TTL eviction', 'In-memory'],
        },
        {
          icon: '🔷', name: 'H3 Hexagonal Grid', best: true,
          reason: 'Uber\'s open-source hierarchical hex grid. O(1) lat/lng → cell ID. Hex neighbors equidistant (no corner bias vs squares). Hierarchical levels (city → block → meter) for zoom-adaptive search.',
          stats: ['O(1) encode', 'Hex neighbors', 'Hierarchical', 'Open source'],
        },
        {
          icon: '🐘', name: 'PostgreSQL + PostGIS (trip records)', best: false,
          reason: 'Completed trips need ACID guarantees (billing). PostGIS adds geospatial operators. Not for real-time location (too slow for 100K+ writes/sec).',
          stats: ['ACID', 'ST_Distance', '10K writes/s', 'Complex queries'],
        },
        {
          icon: '📡', name: 'WebSocket (driver ↔ server)', best: false,
          reason: 'Long-lived bidirectional channel for real-time driver app: receive match requests, push ETA updates, heartbeat. More efficient than polling for always-connected mobile devices.',
          stats: ['Persistent', 'Bidirectional', 'Low overhead', 'Heartbeat'],
        },
      ];
    },

    tradeoffs(c) {
      return [
        { algo: 'H3 Grid',           pro: 'O(1) encode/decode, equidistant neighbors, hierarchical',    con: 'Fixed cell sizes; dense areas still need ring search' },
        { algo: 'QuadTree',          pro: 'Dynamic subdivision; denser cells in busy areas',             con: 'Complex distributed implementation; rebalancing cost' },
        { algo: 'Redis GEO hot',     pro: 'Sub-millisecond reads; entire fleet fits in RAM',            con: 'Data loss on crash without AOF/RDB; needs persistent backup' },
        { algo: 'Cassandra location',pro: 'Durable time-series writes; linear scale',                   con: 'Too slow for real-time geo queries; use as audit log only' },
        { algo: 'WebSocket push',    pro: 'Server pushes matches — no polling overhead',                con: 'Connection state is stateful; harder to scale than HTTP' },
      ];
    },

    tips: [
      'Location writes are the hardest part: at 2Hz × 1M drivers = 2M writes/sec. Lead with "I\'d use Redis GEO as hot store, flush async to Cassandra." That shows you understand write amplification',
      'H3 ring search: start at the driver\'s current hex cell (resolution 8 ≈ 1.22km²). If no drivers, expand to 1-ring (7 cells), then 2-ring (19 cells). O(1) per expansion.',
      'Surge pricing is a distributed aggregation problem: count supply (idle drivers) and demand (open requests) per cell every 30s. Redis HINCRBY per cell, publish to all apps.',
      'ETA is not your problem to solve in a system design interview — call it a black box (Google Maps API). Estimate the API call cost and cache ETA by route segment.',
      'Driver matching is a bipartite matching problem in theory, but in practice you just find the closest idle driver and offer them the ride. Uber uses a combination of distance + predicted acceptance rate.',
      'Location history is needed for disputes and route replay. Keep 30 days. Cassandra time-series per driver_id is the canonical pattern — partition by driver, cluster by timestamp.',
    ],
  });
})();
