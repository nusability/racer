# 0003. The web prototype runs on three.js, TypeScript and Vite
Date: 2026-10-22 · Status: **accepted**

## Context
Mirage Racer is a 3D racer at 150–240 m/s on long desert tracks with jumps, tunnels and
canyons. The prototype has to run at 60 fps on a phone browser, be quick to change, and let
the simulation run headless so tracks and AI can be checked without a browser (ADR 0002:
`web/` is where we find the game).

## The question
Which stack does `web/` use: a full engine (Babylon.js, PlayCanvas), a thin renderer
(three.js), or 2D?

## Decision
**three.js (pinned 0.186.1) + TypeScript (strict) + Vite**, published to GitHub Pages by
`.github/workflows/pages.yml`.

- The simulation (`web/src/core`) is plain TypeScript with no three.js or DOM, on a fixed
  1/120 s step with a seeded RNG. It runs under `node --experimental-strip-types` for the
  headless checks (`npm run sim`, `tools/track-check.ts`).
- Everything visible (track, racers, effects) is procedural geometry, so there is no asset
  pipeline to slow iteration.
- Menus and HUD are DOM over one full-screen WebGL canvas.

## Alternatives considered
- **Babylon.js / PlayCanvas**: more built in (physics, editors), but heavier downloads and we
  use none of the physics: the racer lives in track space, not a rigid-body world.
- **Vanilla JS without a build**: no types across the sim/render contract, which is where
  integration bugs hide.
- **2D**: loses the speed sensation that is the whole game.

## Consequences
- Track-space simulation makes collisions robust at any speed, but the track must be a
  closed ribbon: no open-world shortcuts or branching routes without changing the model.
- Native apps (after `/graduate`) port the behaviour and numbers through the spec, never
  this code.
