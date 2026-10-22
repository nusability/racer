---
name: new-game
description: Bootstrap a new game from this template. Asks for the game's name, Stori key and pitch, creates the Stori project with its Now/Next/Later areas, fills the template placeholders, seeds the light prototype spec, and records the web prototype's stack as an ADR. Use once, right after creating a repo from game-template.
argument-hint: "\"Game Name\" KEY — e.g. \"Moon Golf\" MOON"
user-invocable: true
---

# new-game

Run this once, in a fresh repo created from `game-template`. It ends with one commit on
`main`, and the game is at `Stage: prototype`.

## 1. Ask (one batch, with the AskUserQuestion tool where available)

- **Name** of the game, and its **Stori key** (2–5 uppercase letters, unique in the org).
  Take both from the arguments if given.
- **Pitch**: one sentence on what the game is and who it is for.
- **Web prototype stack**, with a recommended option first. For example: three.js +
  TypeScript + Vite · vanilla JS + three.js (no build) · PlayCanvas / Babylon.js · 2D (Pixi /
  Phaser) · other. It becomes ADR 0003.
- **North-stars**: offer to draft 3 from the pitch, or leave them for `/graduate`.
- Which **Stori organization** to create the project in, if `list_orgs` returns more than one
  (default: the active one).

## 2. Stori

1. `create_project({ name, key, description: <pitch> })`.
2. `get_project_briefing(key)`. If the canvas has no areas, create three magnetic ones with
   `save_area`: `Now` (kind `now`, binding `bucket=now`), then `Next` and `Later` anchored to
   its east (`anchor: { relativeTo, side: "east" }`), bound to `next` and `later`.
3. Seed a few `idea` cards in `next` from the pitch: the core loop to sketch first and the
   riskiest feel question. Keep it small, because ideas are cheap.

## 3. Fill the template

Replace these placeholders everywhere outside `.git/` (`grep -rl '{{' .`):

| Placeholder | Value |
|---|---|
| `{{GAME_NAME}}` | the name |
| `{{STORI_KEY}}` | the key |
| `{{NORTH_STAR_1..3}}` | the north-stars, or leave them for `/graduate` |

Keep the `{{…}}` slots inside `.specify/templates/*` and `specs/` that `/speckit-specify` fills
later (e.g. `{{ONE_SENTENCE}}`).

## 4. Seed the spec and the prototype

1. `.specify/scripts/bash/ensure-spec.sh` seeds `specs/spec.md`. Fill **Vision** and the
   **Elevator pitch** from the pitch. Leave `Stage: prototype` and `Platforms: web
   (prototype)`. Leave the rest as template slots, because the prototype fills them.
2. Write `decisions/0003-<web-stack>.md` (Context · Decision · Alternatives considered ·
   Consequences) for the chosen web stack, and scaffold `web/` with its minimal hello-world
   (one scene on screen, playable at phone size). Add a GitHub Pages workflow
   (`.github/workflows/pages.yml`) that publishes `web/` on pushes to `main` touching `web/**`.
   Tell the owner to set Pages → Source: GitHub Actions in the repo settings.
3. Replace the top section of `README.md` (*Using this template*) with a short
   description of the game. Keep the rest.

## 5. Commit

One commit to `main`: `Start <Name> from game-template`. Report the Stori project link, the
ADR, and the next step: **sketch in `web/`**. When it's fun, run `/graduate`.
