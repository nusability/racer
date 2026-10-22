# Mirage Racer: Specification

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

Mirage Racer is a desert pod-racing game for phones. Two giant engines haul a tiny cockpit
across salt pans, canyons and dune seas at 600–800 km/h. The opponents are there, but the
real rival is the track: chasms to jump, kickers that throw you into the air, tunnels through
mesas, canyons barely wider than your engines, rock arches with off-centre openings and
fields of pillars. Learning a track's lines is how you win.

It should feel faster than is safe: always a hair beyond control, with boost that makes you
faster still at the price of engine heat. Between races it is a garage game: credits buy new
racers and upgrades, and a championship of three cups gives the series a goal.

**Elevator pitch**: An ultra-fast desert pod racer where the track itself is the main obstacle.

**Target player**: Mobile players who like arcade racers (F-Zero, Wipeout, pod racing); a race is 2–4 minutes, a session is one to a few races.

## Core Game Loop

1. **Pick a race**: the next race of a championship cup, or a quick race on any track.
2. **Race**: six racers, 2–3 laps. Throttle is automatic. The craft always flies along the
   track and the player slides it sideways to where they want it (drag a thumb, or tilt, or
   buttons), air-brakes into hairpins and boosts. Boost runs from a tank that
   glowing boost cells along the course refill, and boost pads give free bursts. Open terrain is wide, with drivable sand beyond the road that is
   slower but harmless; canyons and tunnels are walled. Pillars, arches and boulder fields are
   choices with a clear way round, and only a dead-centre hit at speed wrecks you. Chasms
   swallow a racer who leaves a jump too slow. Every track has a walled, risky shortcut that
   saves two or three seconds. A wreck costs about three seconds and a respawn.
3. **Collect**: credits by finishing place (one tap from the finish line to the results, one
   tap to the next race). Spend them in the garage on new racers and upgrades.

**Win / lose / end**: a race ends when everyone finishes, or 20 s after the player does. A cup
is four races scored 10/8/6/4/2/1; winning it pays a bonus and unlocks the next cup. Winning
the third cup, the Mirage Grand Prix, makes you Mirage Champion.

## Tuned Numbers

<!-- In prototype: the constants that survived play in web/, with what each one controls.
     From pre-prod on, these move into the F-NNN sections and into shared/data/, and this
     section lists only the cross-cutting ones. -->

| Name | Value | What it controls |
|---|---|---|
| Simulation step | 1/120 s | Fixed step for physics and AI, seeded RNG |
| Starter top speed | 150 m/s (540 km/h) | Dustwing; racers range 150–198 m/s, up to ~240 m/s upgraded |
| Boost | ×(1 + 0.22–0.32) top speed | Racer's boostPower; thrusters add 0.03 per level |
| Boost tank | 4.5–6.5 s full (+12% per Boost tank upgrade) | Holding boost drains it; no heat, no penalty |
| Tank fill | Start 40%; +2.5%/s passive; +22% per boost cell | Dry tank resumes at 10%; cells once per racer per lap |
| Boost cells | 40–48 per track in lines of 3–8 | Easy lines before straights, most on risky lines and shortcuts |
| Slide steering | 0.42 m per finger px; 45 m/s target rate on keys | Lateral target; craft follows at up to 60 m/s sideways |
| Corner drift | κ·v²·0.11 m/s outward | Hairpins at full boost push you wide; braking leaves 35% |
| Road / sand run-off | 42–56 m / 35–80 m each side | Sand: 80% top speed, no damage |
| Obstacle wreck | Hit within 15% of dead centre above 70% top speed | Anything else deflects (≤ 10% speed) |
| Shortcuts | 1–2 per track, 18–22 m wide, walled | Save 1.5–3 s when driven well |
| Boost pad / launch boost | 1.8 s / 0.9 s free boost | 7–10 pads per track, often in pairs |
| Gravity | 38 m/s² | Jumps read weighty at these speeds |
| Jump clearance | ≥ 57–88 m/s | Slowest speed that clears each chasm |
| Respawn | 2 s out, 30 m back, 60% top speed | About 3 s lost per wreck |
| Laps | 2–3 per track, 9.3–10 km | Lap times 54–65 s on the starter racer |
| Cup rival skill | Dust 0.20–0.45, Canyon 0.40–0.65, Grand Prix 0.70–0.95 | One strong rival per cup, the rest beatable |
| Championship pay | 1000/750/550/400/250/150 × 1/4/12 | By place, per cup tier; cup bonus 2k/6k/25k |
| Quick race pay | 50% of current tier | Scaled by laps |
| Racer prices | 0 / 3k / 6.5k / 11k / 18k / 30k | Second racer after the first cup |
| Upgrades | 5 tracks × 5 levels, 300–8500 each | Full set on one racer ≈ one Grand Prix of winnings |

## Platforms & Scope

web/ prototype only (landscape preferred, portrait supported).

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
