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
fans) across worlds of salt pans, canyons, lagoons, sea caves, glaciers, neon cities and decks hung in the void of space at 600–800 km/h. The
opponents are there, but the real rival is the track: chasms to jump, kickers that throw you into the air, tunnels through
mesas, canyons barely wider than your engines, rock arches with off-centre openings and
fields of pillars. Learning a track's lines is how you win.

It should feel faster than is safe: always a hair beyond control, with boost that makes you
faster still at the price of engine heat. Between races it is a garage game: credits buy new
racers and upgrades, and a championship of three cups gives the series a goal.

**Elevator pitch**: An ultra-fast ground-effect racer where the track itself is the main obstacle.

**Target player**: Mobile players who like arcade racers (F-Zero, Wipeout, pod racing); a race is 2–4 minutes, a session is one to a few races.

## Core Game Loop

1. **Pick a race**: the next race of a championship cup, a quick race on any track of an
   open world, or a time trial on any of those tracks (below). Each world (Mirage Desert, Coral Coast, Frostline, Neon Meridian, Orbital Reach; more to come) has six to
   eight tracks and three cups, rookie → pro → elite. Winning a world's rookie cup opens the
   next world. Every world mixes track archetypes: a forgiving rookie loop, a technical track
   of switchbacks, a speed track whose long straights (up to 1.5 km, as every layout's) run into braking zones, and a gimmick track (vertical loop,
   corkscrew, cliff roads with open edges); several are figure-8s or knots that cross
   themselves on bridges or at flat X junctions with live cross-traffic. Neon Meridian
   is the stunt world: walled city roads where every track has at least two loops or
   corkscrews and the pro and elite tracks four or more (double loops, a loop straight into a
   corkscrew, a corkscrew that drops into a tunnel, loops on the deck of a flyover). Its city
   changes district by district, so every track has its own skyline: glass spires and holo-ad
   monoliths, domed civic towers and terraced megablocks, flats and capsule hotels, docks and
   works, slums of grimy slabs and shanty-crusted towers under failing neon. Close to half of
   every city lap is a street circuit through the city's own streets, 28–32 m wide (a lap's
   boulevards and flyovers 32–36 m): 90° corners at the intersections, hairpins round plazas,
   chicanes between the barriers, corners on the crest of a hill street, a tunnel exit or a
   hump bridge straight into a braking zone. The streets run between race barriers (painted in
   the race livery, a debris fence above; on a quay a low kerb of blocks so the harbour shows)
   that are the track's walls, with pavements, lamps, trees, bus shelters and signals behind
   them, lit shopfronts with awnings and café tables right on the pavement and the towers rising
   over them, zebra crossings and lane arrows on the road, side streets closed off at their
   mouths, and spectators along the barriers and on the terraces; set pieces include a tunnel
   under an office block, a plaza with a fountain inside a hairpin, the metro or a footbridge
   overhead, grandstands between the shops and a harbour front with yachts at the quay. The rest
   of the lap is the contrast: cloverleaf ramps that loop over themselves up onto the flyovers
   and back down, the stunts, open-edged sweepers and crests up in the air. The whole city is
   walled, so a street's barrier and a flyover's wall meet with no step.
   Orbital Reach, opened by the Neon Cup, is the space world: steel decks hung in the void over a
   gas giant, railed or with lit open edges (go over one and you tumble away into the void), station modules and
   asteroids to fly through, gaps in the void to jump, and loops and corkscrews held in floating
   cages rather than standing on anything. Its decks are railed through the bends and
   open over the void only on the straights, and they rise and fall, crests coming a little
   before the bends. Its six tracks are three circuits (the habitat ring, the refinery's dock
   yard, a figure of eight crossing its own start straight on a bridge deck, a solar farm whose
   array masts stand in the road) and three
   point-to-point sprints (a mine run bored through an asteroid, a moon crossing with ground,
   craters to hop and a crater to jump, and a skim low over the gas giant's cloud tops); three of
   them fork. A course can be a point-to-point sprint, and a road can fork into routes (below).
2. **Race**: six racers, 2–3 laps of a circuit, or one run of a point-to-point sprint: start
   line to finish line, counted in four sectors, then a run-out with no wall at its end:
   everyone glides on into a deep block of force field filling the road's last stretch, a
   lattice of glowing field lines in the world's accent that parts round each craft's nose,
   packs bright round it and sparks over its hull as it brakes it like a magnet, until it
   hangs at rest in its place in an arrowhead formation. Once the player rests, the camera
   cranes up and back out of the chase view, over the field, to take in the view from the
   road's end (the gas giant in space, the land elsewhere), and then the results show.
   Throttle is automatic. The craft always flies along the
   track and the player slides it sideways to where they want it (drag a thumb, or tilt, or
   buttons), air-brakes into hairpins and boosts. On touch, boost and brake are one throttle pad
   under the right thumb, so that thumb never leaves the glass: where it lands is neutral, slide
   up to boost, down to brake, back to the middle or lift to fly on. A slim gauge beside the
   thumb shows the three zones (boost cyan above, brake red below), the held one lit, and the
   boost zone goes hollow while the tank is dry; a phone that can buzz ticks on each change.
   Settings can swap the pad for the old separate boost and brake buttons. Settings also offer a
   one-thumb layout (two thumbs stay the default): one finger anywhere on the screen but the
   pause and restart buttons does both, its sideways travel steering exactly as the slide does
   (same sensitivity) and its vertical travel working the throttle as the pad does, from a
   neutral where it lands. A sideways slide never boosts or brakes on the thumb's wobble, and a
   held boost or brake never stops the steering; lifting flies on and leaves the craft where it
   is. Its gauge shows both axes on one see-through glass pad centred where the finger landed:
   as wide as the steering's 15 mm each way and as tall as the throttle's reach, boost band glowing
   cyan above, brake band red below, each starting at a line, a crosshair through the finger and
   a ring in the state colour round it (BOOST or BRAKE above it while held). A lattice of light
   points wakes around the finger, the held zone's lit across the pad, and the pad dissolves away
   from the finger; it fades in on touch and out on lift. The pad is cut, never moved, to stay on
   screen and clear of the minimap, the speed and the bars, unless the finger landed on them.
   A second finger waits, and takes over at a fresh neutral when the first lifts. Boost runs from a tank that
   glowing boost cells along the course refill, and boost pads give free bursts. Open terrain is wide, with drivable sand beyond the road that is
   slower but harmless; canyons and tunnels are walled. Pillars, arches and boulder fields are
   choices with a clear way round. Collisions matter: obstacles, walls and rivals cost hull,
   and green repair cells restore some. The landmarks are part of the course: scheduled
   hazards the player can read and dodge (a sand beast arching over and slamming across the
   road, a digger dropping ore, ships and rotor wash pushing racers sideways, whales and
   freighters blocking a causeway, avalanches, calving glaciers, herds crossing, a maglev train crossing the avenue, a crane dropping
   girders, a collapsing facade, a cargo airship's downdraft, a docking arm swinging across the
   deck, a hoist dropping cargo pods, an airlock's blast door, a vent jetting gas, a drifting
   asteroid). Every track
   has a walled shortcut that is a trade-off, not a free cut: rough ground (marked by hazard
   kerbs and wall stripes) batters the hull at speed, mixed with squeezes, boulders or drops.
   Flat out it saves 1.5–3.5 s for about a third of a stock hull; lifted through, it saves
   much less and costs almost nothing. A course can fork instead: the road splits into two or
   three parallel routes of their own character (rough ground, a row of pillars, the clear road)
   that rejoin later. They race within ±0.6 s of each other for a skilled driver, so the pick
   is style and risk, not a free gain; the route's name flashes on entering it, and rivals
   spread over the routes by their own call, aces favouring the harder way. A WRECK ENDS THE RACE: hull
   gone, a dead-centre hit at speed, a fall that ends in something, or stalling in a loop. A wall
   stands only as tall as it looks: a craft in the air above its top passes over it, beside the
   course, and below its top it scrapes as on the road. Being
   out beyond the road in the air is never a wreck in itself: a craft that comes down over road
   lands (a wide jump onto a wider landing is fine), and one that comes down where there is no
   road keeps falling, intact and tumbling, until it hits the ground, a chasm's floor or the
   sea (a splash), or the course's own structure; over the void it tumbles away and is lost.
   The craft disintegrates in slow motion where it hits, the camera riding with the tumbling
   debris until it comes to rest (or, lost in the void, watching it fall away), then the
   results show a DNF.
   **Time Trial** is the third mode beside Championship and Quick Race, on the same world and
   track picker, with the selected glider. The player flies alone: no rivals and nothing that
   depends on them, but the track's own hazards run as in a race, since they are part of the
   lap. A circuit is a standing start, then flying laps one after another until the player
   leaves (pause → quit) or reaches the 60-lap cap; every lap counts and the best one is the
   best. At every lap line the glider is refitted to how a race starts it (full hull, the
   tank at its start fill), whatever the lap before cost, so every lap starts alike and lap
   times compare; the hull and boost bars flash and the lap's readout says REPAIRED, REFUELLED
   or REFITTED. A sprint is one run from the grid. A wreck ends the run. A restart button on the HUD
   (or R) puts the run back on the grid at once, mid-lap, mid-wreck or after the end, with
   nothing of the last run left on screen (no wreck banner, debris, fire, slow motion or wreck
   camera). The ghost is the player's own best lap (or run) on
   that track, whatever the glider: a see-through tinted copy of the glider it was set with,
   with no collision, flying the recorded line (its poses, never its inputs, so it stays true
   when the physics tuning changes). While the player flies, the trial's HUD is small text in
   the top-left corner with no panel behind it (an outline keeps it legible), so it never
   covers the middle of the screen or the road ahead: the lap time, a live delta to the ghost
   measured at the same point of the course (green ahead, red behind), the split delta at each
   of four equal sector lines beside it, the best lap and the last lap. After each lap (or the
   run) a compact readout under them shows its time, the delta to the best, NEW BEST when it
   is one, and the four sector deltas on one line, then fades while the next lap runs. When
   the trial ends (a wreck, a sprint's finish, the lap cap, or pause → quit, which holds the
   scene still), a summary panel takes the screen: why it ended, the best lap (or the run),
   whether it was saved as the new ghost or how far it fell short, its four sectors against
   the ghost the trial started with, every lap with its delta to the best, and, in debug mode
   only, the physics tuning it was flown with, each value marked ≠ where it differs from that
   ghost's, or every value marked "older physics" when the ghost was set on an earlier tuning
   base (where the same multiplier flew differently). Its buttons are RETRY (back on the grid), CHANGE TRACK (the track picker) and MENU
   (the main menu). A new best replaces the ghost at once. A trial pays no credits
   and touches nothing in the career: each track keeps only its best ghost (with its time,
   glider, upgrades, physics tuning and the tuning base it sat on, build and date; a ghost
   saved before the base was recorded counts as the first base), on the device apart from the career
   save, and a ghost that can't be read is dropped with a warning. Each trial run that set a
   lap is kept in the race logs the debug menu exports, with its lap times and physics tuning.
3. **Collect**: credits by finishing place (one tap from the finish line to the results, one
   tap to the next race). Spend them in the garage on new racers and upgrades. Some gliders
   are sold only once their world opens (Neon Meridian brings two above the Halo Comet); the
   garage shows them locked until then, with the world that opens them.

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
| Starter top speed | 150 m/s (540 km/h) | Dustwing; racers range 150–212 m/s, up to ~250 m/s upgraded |
| Boost | ×(1 + 0.25–0.37) top speed | Racer's boostPower; thrusters add 0.03 per level |
| Boost tank | 5–7 s full (+12% per Boost tank upgrade) | Holding boost drains it; no heat, no penalty |
| Tank fill | Start 40%; +1.5%/s passive (paused 1.5 s after use); +10% per boost cell | Dry tank resumes at 10%; cells once per racer per lap |
| Boost cells | 33–41 per lap, never on the racing line | Strings wide of apexes, S-chains on straights, diagonal strings; none (nor pads) in shortcuts |
| Slide steering | 0.42 m per finger px (one thumb's sideways travel too); 45 m/s target rate on keys | Lateral target; craft follows at up to 60 m/s sideways |
| Throttle swipe | Enter boost / brake 5 mm from the touch-down point, let go 2.5 mm short of it; neutral trails a thumb more than 10 mm out; ~160 CSS px per inch on touch, the gauge at most 40% of the screen's height | Boost to brake is a 10 mm thumb roll; the 2.5 mm band is wider than a resting thumb's jitter, so a state never flickers |
| One-thumb throttle | As the throttle swipe, but enter at 6 mm (let go at 3.5 mm); of each 1 mm of travel, vertical counts only beyond 0.7 × sideways (nothing flatter than 35°) | A 15 mm sideways slide with a 2 / 3 / 4 mm wobble on a 50–70 mm thumb's arc moves the throttle at most 0.9 / 1.8 / 2.9 mm (throttle-check), so it never boosts or brakes, nor lets go of a state held 1 mm past its enter; a straight stroke counts in full |
| One-thumb gauge | ±15 mm of steering by ±10 mm of throttle reach, plus 3 mm all round (227 × 164 px on a phone), scaled with the swipe on a squat window; trails a finger that steers past 15 mm; kept 8 px off the screen edge and the HUD, no cut nearer neutral than the 6 mm enter | 15 mm of slide is ~40 m of the ~50 m road, the steering a race uses; the drive band always shows whole |
| Corner drift | κ·v²·0.11 × 0.5 ÷ grip m/s outward (the stock starter's 0.6 grip: κ·v²·0.092) | Hairpins at full boost push you wide; braking leaves 35% |
| Crests and dips | Grip × (1 + 0.375 × v²·vertical curvature ÷ 206 m/s²), between 0.25 and 1.5; 0.25 in the air | Over a crest a craft goes light and slides wide in a bend only when far too fast; a dip presses it on. It leaves the road only where the road falls away faster than gravity plus suction (38 + 168 m/s²): off jumps, kickers and the sharpest crests at speed (a stock starter at top speed off crests tighter than ~R110, boosting ~R170), never off ordinary rollers. AIs reckon a crest within 15% of lift-off (or of a ledge's kick) as a launch and fly it ballistically to the landing, a crest on a straight too when it throws them into a bend beyond (whichever way it turns); a bend's limit lets the drift carry them part of a lane wide (rookies half, aces one) plus half the sand run-off, never past an open edge. A stock starter holds a ~46 m bend flat out (~72 m on boost): hairpins (40–70 m, inside walled or narrow) are the brake corners on boost |
| Road / sand run-off | 42–56 m / 35–80 m each side | Sand: 70% top speed and extra drag, no damage |
| Obstacle hit | Within 25% of dead centre above 60% top speed = wreck; else 0.7 × centrality × pace ÷ armour hull | Solid hits cost 35–55% hull, glancing 10–20% |
| Walls | Impact hull 0.35 × ((v⊥ − 3)/27)^1.5 ÷ armour: 5 m/s ~1%, 10 m/s ~5%, 20 m/s ~18%, 30 m/s ~35%, 45 m/s ~70%; scraping 8% hull/s at top speed (less slower). Pressed into the outside wall of a bend it also loses 0.375 × v²·curvature m/s² of speed and 15% hull/s per 200 m/s² of it | A straight wall never slows a racer below 65% top speed, a bend's outside wall below 50%; a brush is cheap, a swerve into the wall at speed is serious. Riding the wall round a hairpin flat out costs more than braking for it (a starter in a 60 m hairpin: ~141 m/s², ~28% hull a second) |
| Racer contact | Shoved apart by closing speed, split by armour; hull 0.25 × ((closing − 5)/25)^1.5 ÷ armour each: 10 m/s ~2%, 20 m/s ~12%, 30 m/s ~25% | One hit per pair per second. Rivals (skill ≥ 0.25) never steer into one alongside unless rock ahead needs the room, move across toward one no faster than the gap between them ÷ 0.3 s (at the last a 4 m/s rub, never a hit), brake rather than let a bend's drift carry them into one alongside on the outside, and every AI lifts rather than rear-end the racer ahead |
| Repair cell | +25% hull | Once per racer per lap |
| Loop | Radius ≥ 80 m (160 m tall, ~510 m of road, crown no tighter than half the radius); below 75 m/s in the upper half = wreck | Racers are held to the surface in loops and corkscrews; flat out the starter tops a loop at ~137 m/s, so only braking up the climb stalls. A corkscrew rolls at most once per 200 m |
| Shortcuts | 1–2 per track, 18–22 m wide, walled | Stock glider, measured (track-check): flat out saves 1.5–3.5 s for 25–45% hull; lifting saves 0.2–2 s for ≤ 10%, and at least 0.8 s less than flat out. AIs line up for one 3 m in from the edge (often the divider wall), right up to it only for the last 0.5 s before the junction, and keep their wander off walls (1.5 m more berth for rookies) |
| Rough ground | Hull/s = 0.2 × amount × ((v/top − 0.7)/0.3)^1.5 ÷ armour above 70% of top speed; jolts up to 7 m/s sideways (seeded) | Lifting to 70% is free; boosting through costs ~2.5× flat out. AIs lift by skill (0.9 → 0.73 of top), skip shortcuts above 80–50% hull, and rookies sometimes charge through |
| Boost pad / launch boost | 1.2 s / 0.9 s free boost | Launch boost only for a press within 0.3 s after GO |
| False start | Any boost during the countdown: 1.0 s stall at GO, no launch boost | AIs false-start 0.25·(1−skill)², perfect-start 0.8·skill |
| Gravity | 38 m/s² | Jumps read weighty at these speeds |
| Air steering | 49.5% of the steer rate and of a drag, 82.5% of the lateral response; the debug menu's AIR STEERING multiplier scales both (×1.00 as tuned) | In the air a pod lines up its landing, it can't swerve as on the road: a stock starter's full input over a typical jump (1.2 s) moves it ~23 m (on the road: ~48 m); over a 0.5 s hop ~8 m, under half the road's 17 m but enough to edge round a rock |
| Physics tuning (debug) | Corner grip, crest lightness, suction, wall scrape and air steering as multipliers of the values above, ×1.00 as tuned; those values hold the owner's hand tuning on device (×1.20, ×0.75, ×1.05, ×1.50, ×1.65 of the first ones) | Kept per device; multipliers stored against earlier tuned values reset to ×1.00 once (said in the console), so they never apply twice |
| Wall heights | Rock or concrete wall 5 m (a canyon as authored, eased in and out at 0.9 m per m; a walls feature may stand one side taller); city street barrier 1.1 m with its catch fence to 4.4 m, a harbour quay's kerb 0.55 m, and past a street's ends the wall eases from 4.4 to 5 m over 45 m; a deck's rail 1.3 m (loops, corkscrews, bridges, every deck in the void); a run-off's lip 3.2 m (rock worlds 4.2 m, fence worlds 6.1 m to the top of the energy band); a tunnel's walls to its ceiling; nothing beside a chasm or a lagoon's buoys | What is drawn is what collides. Over a wall's top a craft is beside the course: coming down on a wall's own top (or a tunnel's rock) is a wreck there, past a barrier, rail, lip or buoys it falls to what lies below. Checked: no rival's line flies over one (sim-check), and no jump or kicker does at 240 m/s, taken anywhere across the lip with half the stick held toward a side (track-check); the humps in city hairpins stay under lift-off up to ~200 m/s (they still lighten the craft), and the walls beside six jump, kicker and junction flights stand 12 to 24 m |
| Falls | Ground 70 m below an open edge (~1.9 s of fall), a chasm's floor 72 m below its lower edge, the sea at sea level; over the void lost 150 m down (~2.8 s) | What lies below is set per track (ground, water or void) and must match its world; a fall that drifts back under the road or into a stretch with a wall or run-off hits the course |
| Jump clearance | ≥ 57–88 m/s | Slowest speed that clears each chasm |
| Respawn | 2 s out, 30 m back, 60% top speed | About 3 s lost per wreck |
| Laps | 2–3 per circuit, 8–11 km (each loop adds ~390 m of road to the ground plan) | Lap times 54–70 s on the starter racer |
| Sprint | Raced once, 14–24 km start to finish (track-check); 120 m grid apron behind the start, 750 m run-out past the finish whose last 160 m are a block of force field (no end wall) | Past the line the engines cut: a finisher coasts at 8 m/s² (a stock glider enters the field at ~105–125 m/s), braking only as much as it must to enter at what the field's grip (150 m/s², under twice the air brake) can stop in its place (a maxed Orbis Gyre at ~370–406 m/s: ~107 m/s², entering at ~165–200 m/s); inside, a steady decel (v²/2d) to rest, never a hard stop. Places: rows of three (middle, left, right at half the road's half width), the first 130 m into the block, side lanes 10 m behind the middle, each row 28 m shallower; finishers pass through each other and sit still once stopped. The vista camera takes over at rest (4 s crane to 30 m back and 18 m up, above the field) and the results follow 6.5 s later. A sprint pays like a full race, its best time is the "best run" |
| Forks | 2–3 routes over one stretch (left, main, right); each within ±0.6 s of the main road's way for a skilled stock driver, none both quickest by 0.25 s and no dearer on hull (track-check) | Each AI draws its route every pass, tilted ±0.25 toward the harder way by skill (difficulty = rough metres × amount + 40 m per obstacle); a hull past its shortcut limit takes the gentlest |
| Mild rough ground | AIs ride rough stretches peaking under 0.4 amount (low bumps) at pace | Flat out over such ground costs a few % hull, less than lifting costs in time |
| Rival parity | Every rival lifted to ≥ 98% of the player's performance index (topSpeed × (1 + 0.045 × boostPower × boostTank)) | Upgrades are a feel choice; they never trivialise a cup |
| Cup rival fields | A ladder per tier, shared by every world, strongest first as skill / pace (top speed as a share of parity): rookie 0.50/1.000, 0.47/0.996, 0.40/0.975, 0.37/0.971, 0.28/0.945; pro 0.56/1.005 … 0.34/0.940; elite 0.66/1.025, 0.63/1.018, 0.56/0.990, 0.53/0.982, 0.44/0.945 (eased skill²·⁸, 0.3 s reaction delay at skill 0) | A fast leader to a back-marker, the top two and middle two paired close so they fight; over a race the field strings out (sim: median 0.8–1.5 s between finishers, ~6–10 s first to last; a decent player wins about two rookie cups in five, a pro cup now and then, an elite one rarely; one that never brakes and holds boost wins no more often than a decent one overall; a decent player gains or loses 3+ places within 3 s about once in ten races). Machines lifted to parity with the player first; a cup whose roster floor out-paces the player's glider says so ("Field is N% faster than your …") on its card and screen |
| Catch-up | Rivals behind push up to +1.5% top speed (60–450 m gap); ahead ease 1% | Off once the player finishes; mild, so the field keeps its order of pace; slipstream carries most of the catching up, visibly |
| Slipstream | 4–40 m behind another racer, inside a wake 2.5 m wide close up narrowing to 1.2 m: up to +6% top speed and +0.02/s tank; pulling out after 0.8 s of full draft keeps the bonus 0.6 s (slingshot) | Everyone drafts; AIs tuck in on straights and pull out to pass |
| Championship pay | 1400/1050/770/560/350/210 × tier × world | Cup bonus 1200/2400/4000 × world; repeat wins 25%; DNF pays 0 |
| Glider top speeds | 150 / 158 / 166 / 174 / 182 / 192 m/s; Neon Meridian's two: 202 / 212 m/s | Halo Comet ~28% faster than the starter; each city glider another ~5% |
| Glider prices | 0 / 8k / 15k / 24k / 32k / 40k; Neon Meridian's two: 95k / 145k, on sale once the city opens (shown locked before) | Upgrade costs scale with glider class. A decent player (sim) buys the Halo Comet after 60 races, the first city glider with the Neon Cup's winnings (108) and the second with the Zenith Crown's (132); the Orbis Gyre's upgrade set is then the long tail, finished with Orbital Reach's winnings during its Supernova Trophy (race 160 of 164, ~102k spare after every cup) |
| World pay multiplier | Desert 1, Coast 1.6, Frostline 2.4, Neon Meridian 3.6, Orbital Reach 5.4 | Tiers 1 / 1.6 / 2.4; quick race pays 35% at the hardest cup won. Orbital Reach (decent player, sim): ~4.4k a race in the Apogee Cup, ~8.6k in the Perihelion Cup, ~11.0k in the Supernova Trophy; it opens with the Neon Cup (race 108) |
| Upgrades | 5 tracks × 5 levels, e.g. engine 550–4950 × (1 + price/40k) | Full starter set ≈ the whole desert's winnings |
| Time-trial ghost | Poses at 10 Hz, interpolated; distance 1/8 m, position 1/16 m, angles 0.35° | ~65 bytes per second stored: a circuit lap 3.5–4.7 KB, a sprint run ~6 KB (trial-check) |
| Time-trial splits | 4 equal sectors per lap (or run), as the sprint HUD counts them | Split delta shown 2.5 s; a lap's readout 5 s, gone long before the next lap's first sector line; the ghost hides within 4 m ahead of the camera |

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
