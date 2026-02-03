## XP curve quick-check

Use the helpers in `lib/xpProgression.ts` to preview or tune the curve:

- `sampleCurve(maxLevel)` returns an array of `{ level, toNext, total }` using the provided config (defaults to `defaultXPConfig`).
- `buildXpTable(maxLevel)` does the same but caches the running total if you need it in UI.
- `createXPConfig({ base, growth, linear, curve, sources })` lets you tweak pacing without touching call sites.

Example snippet (run in a TS REPL or a quick script):

```ts
import { sampleCurve, defaultXPConfig } from '../lib/xpProgression';
console.table(sampleCurve(15, defaultXPConfig));
```

This keeps progression tuning isolated so gameplay logic stays untouched.
