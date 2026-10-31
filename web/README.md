# web/: the prototype

Where we find the game (ADR 0002). Its stack is ADR 0003, taken by `/new-game`.

- **Stage `prototype`**: this *is* the game. Sketch fast, play it on a phone, and keep the
  spec's Vision, Core Loop and Tuned Numbers honest as you go.
- **After `/graduate`**: a sketchpad for trying a feel question quickly. What survives goes
  through `specs/spec.md` into both apps.
- Never a store target. Never copied into an app.
- Commits here need no spec diff.

## Checks

- `npx tsc --noEmit`: types.
- `node --experimental-strip-types tools/track-check.ts`: every layout against the rules authors
  design to (0 warnings).
- `npm run sim`: full headless races on every track.
- `npm run scenery`: builds every track's scene headless (no browser) at low and high detail and
  runs the scenery audits: the clearance audit (no landmark, stand, ship, building, tree, post or
  scatter piece in any ribbon's drivable envelope or under its headroom, as built and while the
  landmarks animate through a race's first minute) and the ground audit (no terrain rising into
  the road or run-off). `npm run scenery -- sunpan,oasis --high` checks only those. The same
  clearance audit runs whenever a scene is built: a dev build of the game refuses the race, a live
  one logs console errors, and the level viewer logs them (`viewer.auditClearance()` lists them).
