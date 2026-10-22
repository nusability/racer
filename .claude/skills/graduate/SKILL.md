---
name: graduate
description: Graduate a game from the web prototype to the native apps (Stage prototype → pre-prod). Harvests the full spec from what web/ proved, settles the apps' one-way doors as ADRs, plans both platforms, and files the first, riskiest work on Stori. Use only when the owner says the prototype is good enough to build as an app.
argument-hint: "Optional notes on what the prototype proved"
user-invocable: true
---

# graduate

The moment the owner says "this is cool, build it as an app for iOS and Android". After this,
**the spec, not `web/`, is the authority on rules and numbers**. `web/` stays as a sketchpad for
trying a feel question quickly, and nothing in it binds the apps.

This is the owner's call. Never run it on your own initiative. Confirm before starting if
the request was not explicit.

## 1. Harvest the spec from the prototype

Read `web/` end to end. It is the source of *what* the game does and *which numbers* it uses,
never of *how* the apps are built. Then rewrite `specs/spec.md` into a full spec (the
`/speckit-specify` *Create* mode, at `pre-prod` depth):

- Every rule the prototype plays by becomes an `F-NNN` feature with user stories and
  requirements.
- Every tuned constant becomes a requirement with its value. Nothing stays as "as in the
  prototype".
- Name the determinism the apps need: the fixed step, the seeded RNG algorithm, and which parts
  of the simulation golden vectors pin.
- Spell out anything the prototype only did by accident (a quirk you can't tell is intended)
  and list it as a question for the owner.

## 2. Ask the owner (one batch, with AskUserQuestion where available)

- **Orientation**, **minimum iOS / Android**, **out of scope** (tablets? landscape?).
- **Reference devices**: the flagship, and the weakest device we support on each platform.
- **Business model**: premium, or free-to-play with IAP (the monetization ethics bind it).
  What is sold is specified later, and nothing is sold until it is.
- **Languages**.
- **North-stars**: confirm or fill the 3–4 in the constitution.
- **Quirks** found while harvesting: keep or drop?

Fold the answers into *Platforms & Scope*, *Global Requirements* and the constitution's
north-stars.

## 3. Flip the stage

In the spec header: `Stage: pre-prod` and `Platforms: iOS · Android (web/ is a sketchpad)`.
For each feature, add one **temporary** row to *Platform deltas* ("not built yet on either
platform"), each naming the Stori item that closes it. These rows are deleted as the features
land, and the goal is zero.

## 4. Settle the one-way doors

Through `/architecture` (one question per consultation), then an ADR for each:

- What draws the scene on iOS, and what draws it on Android.
- What draws the UI (native toolkit, or part of the scene) and how it animates.
- Where the simulation lives on each platform, which thread owns it, and the clock.
- The persistence shape.
- The `shared/data` generator and the format of the golden vectors.

## 5. Plan and file the work

1. `/speckit-plan` fills `specs/plan.md` and `specs/data-model.md`.
2. On Stori, in `now`, **riskiest first**:
   - **The core on both platforms with the first golden vector replaying green.** This proves
     the determinism contract before anything sits on it.
   - The minimal app shells (an Xcode project and a Gradle project, per `conventions.md`) that
     draw the scene on a phone.
   - One item per feature, closing its temporary delta row, in `next`.
3. Run `/speckit-tasks` on the first item.

## 6. Commit

One commit to `main`: `Graduate to pre-prod: harvest spec from web/`, containing the spec, the
plan, the ADRs and the constitution's north-stars. Report what was harvested, the questions
answered, the ADRs taken, and the first Stori item.
