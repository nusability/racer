# {{GAME_NAME}}: Specification

Stage: prototype
Platforms: web (prototype)
Next IDs: F-002 · US2 · FR-002 · NFR-001 · SC-002

<!--
  THE ONE SPEC
  ============
  This file is the single specification of the whole game, AS IT IS NOW. It is never copied
  per feature. /speckit-specify adds a feature as a new `### F-NNN` block under "Features",
  or amends an existing one in place.

  Versioning: none. Git is the version (`git log -- specs/`). No changelog, no
  "Last updated", no Spec-Version.

  Stage (constitution, "Stages"): prototype | pre-prod | live. Only the owner changes it.
    prototype  web/ only. Keep this file LIGHT: Vision, Core Loop, the numbers play proved.
    pre-prod   iOS + Android in parallel. Full F-NNN sections; behaviour change = spec change
               in the same commit; platform-delta table enforced.
    live       As pre-prod, and player data is sacred (Player Data section is mandatory).

  ID rules (global across the file, NEVER reused or renumbered):
    F-001 features · US1 user stories · FR-001 functional reqs · NFR-001 global reqs ·
    SC-001 success criteria. Take the next ID from the "Next IDs" line and bump it.
    A removed item is deleted (git keeps it); its ID stays retired.

  Describe WHAT the player experiences and WHY. Engines, libraries and code structure belong
  in specs/plan.md and decisions/, never here. Future work belongs on Stori, never here.
-->

## Vision

{{ONE_OR_TWO_PARAGRAPHS: what the game is, who it is for, the feeling it should create.}}

**Elevator pitch**: {{ONE_SENTENCE}}

**Target player**: {{WHO, WHEN, HOW LONG PER SESSION}}

## Core Game Loop

1. {{STEP}}
2. {{STEP}}
3. {{STEP}}

**Win / lose / end**: {{HOW A RUN, MATCH OR LEVEL ENDS}}

## Tuned Numbers

<!-- In prototype: the constants that survived play in web/, with what each one controls.
     From pre-prod on, these move into the F-NNN sections and into shared/data/, and this
     section lists only the cross-cutting ones. -->

| Name | Value | What it controls |
|---|---|---|
| {{name}} | {{value}} | {{effect}} |

## Platforms & Scope

<!-- prototype: "web/ prototype only." pre-prod onward: fill in the list below. -->

- **iOS**: iPhone, {{portrait/landscape}}, minimum iOS {{N}}.
- **Android**: phone, {{portrait/landscape}}, minimum API {{N}}.
- **Out of scope**: {{e.g. tablets, landscape, web as a store target}}.
- **Business model**: {{premium / free-to-play with IAP}}, bound by the constitution's
  monetization ethics. Nothing is sold until this spec says what is sold.
- **Reference devices**: flagship {{iPhone X / Pixel Y}}; low end {{device}}, the weakest
  we support.

### Platform deltas

The complete list of places where iOS and Android do not agree. **A difference that is not in
this table is a bug** on whichever platform is wrong. Each row is dated, and is either
**permanent** (a decision, backed by an ADR) or **temporary** (a schedule fact that names the
Stori item closing it). The goal for temporary rows is zero.

| Since | Kind | Behind / differs | Delta | Closed by |
|---|---|---|---|---|

## Features

<!--
  One block per feature. Priority is per user story (P1 = needed for the first playable
  build). Each user story must be independently playable/testable.
-->

### F-001: {{Feature Name}}

**Summary**: {{What this feature adds and why it matters to the player}}

#### US1 – {{Title}} (P1)

{{The player journey in plain language.}}

**Independent test**: {{How this is played/tested on its own}}

**Acceptance scenarios**:

1. **Given** {{state}}, **When** {{player action}}, **Then** {{outcome}}

#### Requirements (F-001)

- **FR-001**: The game MUST {{capability}}

#### Edge cases (F-001)

- {{Rotation, backgrounding, a call coming in, interrupted touch, low storage, no network…}}

---

## Global Requirements

<!-- Whole-game, player-facing, measurable. Start filling these at pre-prod. -->

- **Performance**: {{60 fps on the flagship reference device; ≥ 30 fps and no input hitches on
  the low-end reference device; cold start to playable ≤ N s}}
- **Interruptions**: {{auto-pause on background, call or notification; clean resume}}
- **Input & layout**: {{touch targets ≥ 44 pt / 48 dp; safe areas; one-hand reach}}
- **Accessibility**: {{text scaling range; Reduce Motion honoured; nothing by colour alone;
  VoiceOver/TalkBack labels}}
- **Audio**: {{respects silent switch / media volume; mute remembered}}
- **Localisation**: {{languages; chosen by the device}}

## Player Data

<!-- Mandatory from `live`. What is saved, where, and the migration promise. -->

- **Saved**: {{progress, settings, balances, entitlements}}
- **Where**: {{on device only / cloud backup}}
- **Promise**: in `pre-prod` saves may reset. In `live` every change to a saved shape ships
  a migration, and a record that fails to decode is preserved.

## Telemetry

<!-- Every event that leaves the device, when it fires, and what it carries. Empty means none. -->

| Event | Fires when | Carries |
|---|---|---|

## Golden Vectors

<!-- From pre-prod: which parts of the simulation are pinned by shared/vectors/, and what
     re-recording a vector requires (a spec diff explaining why). -->

## Key Entities

- **{{Entity}}**: {{what it represents, key attributes}}

## Success Criteria

- **SC-001**: {{measurable, technology-agnostic outcome}}

## Assumptions

- {{assumption}}

## Out of Scope

- {{deliberately excluded}}

## Clarifications

<!-- Appended by /speckit-clarify. Remove a session once its answers are folded in above
     and committed, because git keeps the record. -->
