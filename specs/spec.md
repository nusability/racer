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

Mirage Racer is a racing game for phones. Pilots fly ground-effect skimmers (low, wide
racing wings riding a cushion of air a hand's width above the ground, pushed by ducted
fans) across worlds of salt pans, canyons, lagoons, sea caves, glaciers and neon cities at 600–800 km/h. The
opponents are there, but the real rival is the track: chasms to jump, kickers that throw you into the air, tunnels through
mesas, canyons barely wider than your engines, rock arches with off-centre openings and
fields of pillars. Learning a track's lines is how you win.

It should feel faster than is safe: always a hair beyond control, with boost that makes you
faster still at the price of engine heat. Between races it is a garage game: credits buy new
racers and upgrades, and a championship of three cups gives the series a goal.

**Elevator pitch**: An ultra-fast ground-effect racer where the track itself is the main obstacle.

**Target player**: Mobile players who like arcade racers (F-Zero, Wipeout, pod racing); a race is 2–4 minutes, a session is one to a few races.

## Core Game Loop

1. **Pick a race**: the next race of a championship cup, or a quick race on any track of an
   open world. Each world (Mirage Desert, Coral Coast, Frostline, Neon Meridian; more to come) has six to
   eight tracks and three cups, rookie → pro → elite. Winning a world's rookie cup opens the
   next world. Every world mixes track archetypes: a forgiving rookie loop, a technical track
   of switchbacks, a speed track with a 2–2.7 km straight, and a gimmick track (vertical loop,
   corkscrew, cliff roads with open edges); several are figure-8s or knots that cross
   themselves on bridges or at flat X junctions with live cross-traffic. Neon Meridian
   is the stunt world: walled city roads where every track has at least two loops or
   corkscrews and the pro and elite tracks four or more (double loops, a loop straight into a
   corkscrew, a corkscrew that drops into a tunnel, loops on the deck of a flyover).
2. **Race**: six racers, 2–3 laps. Throttle is automatic. The craft always flies along the
   track and the player slides it sideways to where they want it (drag a thumb, or tilt, or
   buttons), air-brakes into hairpins and boosts. Boost runs from a tank that
   glowing boost cells along the course refill, and boost pads give free bursts. Open terrain is wide, with drivable sand beyond the road that is
   slower but harmless; canyons and tunnels are walled. Pillars, arches and boulder fields are
   choices with a clear way round. Collisions matter: obstacles, walls and rivals cost hull,
   and green repair cells restore some. The landmarks are part of the course: scheduled
   hazards the player can read and dodge (a sand beast arching over and slamming across the
   road, a digger dropping ore, ships and rotor wash pushing racers sideways, whales and
   freighters blocking a causeway, avalanches, calving glaciers, herds crossing, a maglev train crossing the avenue, a crane dropping
   girders, a collapsing facade, a cargo airship's downdraft). Every track
   has a walled shortcut that is a trade-off, not a free cut: rough ground (marked by hazard
   kerbs and wall stripes) batters the hull at speed, mixed with squeezes, boulders or drops.
   Flat out it saves 1.5–3.5 s for about a third of a stock hull; lifted through, it saves
   much less and costs almost nothing. A WRECK ENDS THE RACE: hull
   gone, a dead-centre hit at speed, falling into a chasm or off an open edge, or stalling in
   a loop. The craft disintegrates in slow motion, then the results show a DNF.
3. **Collect**: credits by finishing place (one tap from the finish line to the results, one
   tap to the next race). Spend them in the garage on new racers and upgrades.

**Win / lose / end**: a race ends when everyone finishes, or 20 s after the player does. A cup
is four races scored 10/8/6/4/2/1; winning it pays a bonus and unlocks the next cup of that
world. Winning a world's elite cup makes you that world's champion.

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
| Tank fill | Start 40%; +1.5%/s passive (paused 1.5 s after use); +10% per boost cell | Dry tank resumes at 10%; cells once per racer per lap |
| Boost cells | 33–41 per lap, never on the racing line | Strings wide of apexes, S-chains on straights, diagonal strings; none (nor pads) in shortcuts |
| Slide steering | 0.42 m per finger px; 45 m/s target rate on keys | Lateral target; craft follows at up to 60 m/s sideways |
| Corner drift | κ·v²·0.11 m/s outward | Hairpins at full boost push you wide; braking leaves 35% |
| Road / sand run-off | 42–56 m / 35–80 m each side | Sand: 70% top speed and extra drag, no damage |
| Obstacle hit | Within 25% of dead centre above 60% top speed = wreck; else 0.7 × centrality × pace ÷ armour hull | Solid hits cost 35–55% hull, glancing 10–20% |
| Walls | Impact damage above 8 m/s sideways; grinding 3% hull/s | Never slows a racer below 65% top speed |
| Racer contact | Shoved apart by closing speed, split by armour; 0.002 hull per m/s above 8 m/s | One hit per pair per second |
| Repair cell | +25% hull | Once per racer per lap |
| Loop | Below 75 m/s in the upper half = wreck | Racers are held to the surface in loops and corkscrews |
| Shortcuts | 1–2 per track, 18–22 m wide, walled | Stock glider, measured (track-check): flat out saves 1.5–3.5 s for 25–45% hull; lifting saves 0.2–2 s for ≤ 10%, and at least 0.8 s less than flat out |
| Rough ground | Hull/s = 0.2 × amount × ((v/top − 0.7)/0.3)^1.5 ÷ armour above 70% of top speed; jolts up to 7 m/s sideways (seeded) | Lifting to 70% is free; boosting through costs ~2.5× flat out. AIs lift by skill (0.9 → 0.73 of top), skip shortcuts above 80–50% hull, and rookies sometimes charge through |
| Boost pad / launch boost | 1.2 s / 0.9 s free boost | Launch boost only for a press within 0.3 s after GO |
| False start | Any boost during the countdown: 1.0 s stall at GO, no launch boost | AIs false-start 0.25·(1−skill)², perfect-start 0.8·skill |
| Gravity | 38 m/s² | Jumps read weighty at these speeds |
| Jump clearance | ≥ 57–88 m/s | Slowest speed that clears each chasm |
| Respawn | 2 s out, 30 m back, 60% top speed | About 3 s lost per wreck |
| Laps | 2–3 per track, 8.9–10 km | Lap times 54–65 s on the starter racer |
| Rival parity | Every rival lifted to ≥ 98% of the player's performance index (topSpeed × (1 + 0.045 × boostPower × boostTank)) | Upgrades are a feel choice; they never trivialise a cup |
| Cup rival fields | Skill bands per tier, shared by every world: rookie 0.44–0.32, pro 0.48–0.36, elite 0.58–0.49 (eased skill²·⁸, 0.3 s reaction delay at skill 0) | Machines at parity with the player; the cup roster is the floor, and a cup whose floor out-paces the player's glider says so ("Field is N% faster than your …") on its card and screen |
| Catch-up | Rivals behind push up to +5% top speed (60–450 m gap); ahead ease 3% | Off once the player finishes; slipstream carries most of the catching up, visibly |
| Slipstream | 4–40 m behind another racer, inside a wake 2.5 m wide close up narrowing to 1.2 m: up to +6% top speed and +0.02/s tank; pulling out after 0.8 s of full draft keeps the bonus 0.6 s (slingshot) | Everyone drafts; AIs tuck in on straights and pull out to pass |
| Championship pay | 1400/1050/770/560/350/210 × tier × world | Cup bonus 1200/2400/4000 × world; repeat wins 25%; DNF pays 0 |
| Glider top speeds | 150 / 158 / 166 / 174 / 182 / 192 m/s | Top glider ~28% faster than the starter |
| Glider prices | 0 / 8k / 15k / 24k / 32k / 40k | Upgrade costs scale with glider class |
| World pay multiplier | Desert 1, Coast 1.6, Frostline 2.4, Neon Meridian 3.6 | Tiers 1 / 1.6 / 2.4; quick race pays 35% at the hardest cup won |
| Upgrades | 5 tracks × 5 levels, e.g. engine 550–4950 × (1 + price/40k) | Full starter set ≈ the whole desert's winnings |

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
