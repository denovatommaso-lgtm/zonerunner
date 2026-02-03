# Performance Findings (Instrumentation Report)

This report is generated from the dev-only `[PERF]` logs added across the app. Use Metro console to capture real data and fill in actual timings.

## Before / After (log flood mitigation)
### Before
- Territory rebuild spam: `rebuildTerritoriesFromRuns` running back-to-back (1600–1900ms) and repeated `updateTerritoriesWithRun` steps (50–200ms).
- Duplicate friend loads: `FriendService.loadFriends` observed twice per refresh with long durations (8–11s).
- Auth state spam: repeated `auth-state:authed` logs.
- Reverse geocode spam: `YearlyChallengesService.reverseGeocodeAsync` repeated and sometimes 5–7s.

### After (expected)
- Rebuilds are coalesced (latest-wins) and never run concurrently; repeated calls should collapse into one rebuild, with a `rebuildTerritoriesFromRuns coalesced` log.
- Friend loads coalesce per-user (no concurrent duplicates).
- Reverse geocode requests dedupe for the same month/year + rounded location.
- PERF log volume reduced with a global filter (default logs only >=50ms or rebuilds).

## Boot Timeline (sample output)
```
[PERF] ts=1730000000000 screen=RootLayout phase=BOOT dur=0ms label=root-mounted
[PERF] ts=1730000000123 screen=RootLayout phase=BOOT dur=123ms label=auth-ready
[PERF] ts=1730000000250 screen=MonthlyChallengesStore phase=DATA dur=250ms label=loadState meta={"userId":"...","bytes":1234}
[PERF] ts=1730000000320 screen=YearlyChallengesStore phase=DATA dur=320ms label=loadState meta={"userId":"...","bytes":980}
[PERF] ts=1730000000480 screen=RunService phase=DATA dur=480ms label=loadRunsForUser meta={"count":42,"bytes":56000}
```

## Navigation Timeline (sample output)
```
[PERF] ts=1730000010000 screen=RootLayout phase=NAV dur=0ms label=segments:(tabs)/home
[PERF] ts=1730000010150 screen=Home phase=RENDER dur=12ms label=HomeScreen render meta={"renders":3,"changedProps":["runs","leaderboard"]}
[PERF] ts=1730000010400 screen=RootLayout phase=NAV dur=0ms label=segments:(tabs)/leaderboard
[PERF] ts=1730000010550 screen=Leaderboard phase=RENDER dur=14ms label=LeaderboardScreen render meta={"renders":2,"changedProps":["filter","entries"]}
```

## Network & Storage Report (sample output)
```
[PERF] ts=1730000020000 screen=FriendService phase=DATA dur=180ms label=loadFriends meta={"count":12,"bytes":2200}
[PERF] ts=1730000020300 screen=GroupService phase=DATA dur=210ms label=listGroupRuns meta={"count":18,"bytes":18000}
[PERF] ts=1730000020600 screen=PendingRunsStore phase=DATA dur=12ms label=readList meta={"count":4,"bytes":4200}
[PERF] ts=1730000020800 screen=StorageService phase=DATA dur=650ms label=uploadImageAsync meta={"size":512000,"status":200}
```

## Render & Re-render Report (sample output)
```
[PERF] ts=1730000030000 screen=RunWindow phase=RENDER dur=8ms label=RunWindow render meta={"renders":5,"changedProps":["routePoints","tracking"]}
[PERF] ts=1730000030100 screen=TerritoryMap phase=RENDER dur=10ms label=TerritoryMapScreen render meta={"renders":4,"changedProps":["owners","polygons"]}
[PERF] ts=1730000030200 screen=Leaderboard phase=RENDER dur=7ms label=LeaderboardScreen render meta={"renders":3,"changedProps":["entries"]}
```

## Heavy Compute Report (sample output)
```
[PERF] ts=1730000040000 screen=TerritoryEngine phase=DATA dur=420ms label=rebuildTerritoriesFromRuns meta={"runs":42,"totalPoints":2100,"owners":12}
[PERF] ts=1730000040600 screen=TerritoryEngine phase=DATA dur=120ms label=updateTerritoriesWithRun meta={"runnerId":"...","owners":12,"runVertices":480}
[PERF] ts=1730000040900 screen=TerritoryEngine phase=MAP dur=0ms label=territoryToMapPolygons meta={"polygons":6,"vertices":2800}
```

## Top Slow Operations (fill with real data)
| Rank | Operation | Duration (ms) | Trigger | Required? | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | TerritoryEngine.rebuildTerritoriesFromRuns | 420 | home map open | yes | cache + debounce + move off main thread |
| 2 | RunService.loadRunsForUser | 480 | boot + profile | yes | pagination + cache + lazy load |
| 3 | StorageService.uploadImageAsync | 650 | profile edit | yes | background queue + resize before upload |
| 4 | GroupService.listGroupRuns | 210 | leaderboard group | yes | fetch summaries instead of full run docs |
| 5 | FriendService.loadFriends | 180 | home + profile | yes | memoize + avoid redundant reload |

## Render Hot Spots (fill with real data)
| Component | Render Count | Avg Render (ms) | Likely Cause | Fix |
| --- | --- | --- | --- | --- |
| RunWindow | 5/5s | 8 | routePoints prop changes | keep route updates throttled |
| TerritoryMapScreen | 4/5s | 10 | owner polygons recalculated | memoize polygon derivations |
| LeaderboardScreen | 3/5s | 7 | entries array replaced | stable sorting + memoized selectors |

## Ranked Actions
### Quick Wins (today)
1. Keep `MAP_LITE_DURING_RUN` enabled during active run to freeze camera and reduce updates.
2. Keep UI update throttles in `hooks/useRunTrackingEngine.ts` (route/metrics every 2.5s/1s).
3. Avoid auto-refresh on leaderboard; refresh only on explicit actions.
4. Keep live location disabled unless needed (recenter/manual).

### Structural Fixes (next)
1. Offload territory rebuild to a background thread / worker (or move to native).
2. Cache territory polygons per user/month and only diff apply new runs.
3. Replace full-run downloads with summary aggregates for leaderboard/home.
4. Add memoized selectors for `useTerritoryMapData` and `computeCurrentAreasFromRuns`.

## Where the Logs Live
- Boot + nav timeline: `app/_layout.tsx`
- Render traces: `hooks/useRenderTrace.ts` + screens in `app/(tabs)/...` and `app/run-window.tsx`
- Location update rate: `hooks/useLiveLocation.ts`
- Map camera logs: `app/run-window.tsx`
- Territory compute: `lib/territoryEngine.ts`
- Firestore data access: `lib/runService.ts`, `lib/groupService.ts`, `lib/friendService.ts`, `lib/authService.ts`
- Storage: `lib/pendingRunsStore.ts`, `lib/deletedRunsStore.ts`, `lib/monthlyChallengesStore.ts`, `lib/yearlyChallengesStore.ts`, `lib/storageService.ts`

## Validation Steps
1. Cold start the app and watch for only slow `[PERF]` entries (>=50ms) plus rebuild logs.
2. Trigger territory load twice quickly; confirm only one `rebuildTerritoriesFromRuns` runs and coalesced logs appear.
3. Trigger friend list refresh twice quickly; confirm single `FriendService.loadFriends` duration.
4. Trigger yearly challenge enrichment on the same location/month; confirm one `reverseGeocodeAsync` and subsequent calls reuse cached result.
