# {{GAME_NAME}} Constitution

The project's durable values. Everything in the repo complies with it: the spec, the code,
the Stori backlog, `AGENTS.md` and `conventions.md`. If they conflict, this document wins.
It changes rarely, and only by a deliberate amendment (see *Governance*).

**We are not playing around.** We make mobile games for the App Store and Google Play, and we
build them as products from the first line of app code. A prototype is allowed in exactly one
place, `web/`, and only while we are still finding the game. Everything that reaches a player's
phone is built to production standards: no stubs, no fake UI, no "we'll fix it before launch".

---

## The trade-off settings

These are the calls the project has already made, so nobody re-argues them per change. Each
slider shows where we stand. Moving one is an amendment.

| Trade-off | Setting | Meaning |
|---|---|---|
| **Clean architecture ◄► Backwards compatibility** | `Clean ●━━━━━━━━○ Compat` | Our own shapes (code, APIs, data formats, file layouts) are always replaced, never shimmed. The one exception depends on the **stage** (below): once we are `live`, a player's data is never broken. |
| **Ship speed ◄► Prod-grade rigor** | `web/  Speed ●━━━━━━━━○ Rigor`<br>`apps  Speed ○━━━━━━━━● Rigor` | `web/` is a fast sandbox. iOS and Android are release-quality on every commit. |
| **Lean / hand-rolled ◄► Best-in-class dependency** | `Lean ○━━━━━━━●━ SOTA` | Adopt the best library rather than hand-rolling one, and record the adoption in an ADR. |
| **Shared code ◄► Stand-alone native apps** | `Shared ○━━━━━━━━● Stand-alone` | Two native codebases (Swift, Kotlin) with no code of ours shared. They share the spec, generated data, assets and golden vectors (ADR 0001). |
| **Ask ◄► Decide** | `Ask ○━━━━━━━●━ Decide` | Agents make engineering calls and say what they decided. They ask only about product forks a player would feel. One-way technical doors go to `/architecture`. |
| **Visual ambition ◄► Low-end performance** | `Looks ○━━━●━━━━━ Perf` | Tuned to look great on current flagships. The weakest supported device must stay playable (≥ 30 fps, no hitches in input). |
| **Cautious ◄► Bold** | `Cautious ○━━━━━━━●━ Bold` | Sweeping changes are fine and the elegant path wins even when it costs more time. De-risk the riskiest thing first. |

---

## Stages

The spec header carries one field, `Stage:`, which says where the game is. The stage changes
which rules are awake. Moving to the next stage is a deliberate, owner-made commit to
`specs/spec.md`, and it is never done implicitly.

| Stage | What exists | Rules in force |
|---|---|---|
| **`prototype`** | `web/` only. | Find the game. `web/` is free: any stack (chosen by ADR), no tests required, no compat at all. The spec is **light**: the pitch, the core loop, and the numbers that survived play, written as we go. The Spec Kit loop is optional. Many ideas end here, which is fine. |
| **`pre-prod`** | iOS **and** Android, built in parallel. `web/` stays as a sketchpad. | Everything below applies in full. **Clean, always:** shapes change freely, and save data may be reset with no migrations because no player exists yet. |
| **`live`** | The game is in at least one store. | Everything below applies, plus **player data is sacred**: progress, balances and purchases are migrated and never reset, devalued or stranded. A record that fails to decode is preserved, never silently replaced. Our own code shapes stay clean. |

**Graduation** (`prototype → pre-prod`) is the moment the owner says "this is cool, build it as
an app". It is run by `/graduate`: the spec is harvested from what `web/` proved, the first
ADRs for the apps are taken, and both apps start. After graduation `web/` is never a source of
truth for rules or numbers; the spec is.

**Going live** (`pre-prod → live`) happens in the commit that submits the first store build on
either platform.

---

## Product north-stars

<!-- Filled in per game by /new-game and /graduate. 3–4 north-stars, each one sentence plus
     the test that tells you whether a change serves it. When a call is ambiguous, pick the
     option that advances them. -->

- **N1. {{NORTH_STAR_1}}**
- **N2. {{NORTH_STAR_2}}**
- **N3. {{NORTH_STAR_3}}**

---

## Principles

### Spec & source of truth

1. **One spec, one state.** `specs/spec.md` is the single specification of the whole game,
   describing it *as it is now*. Features are `F-NNN` sections inside it, and there is never a
   spec per feature. Read the spec to learn the current state; never reconstruct it from work
   items, commits or chat.
2. **Git is the version.** The spec carries no version number and no changelog. The last
   commit is the as-is, and `git log -- specs/` is the history. IDs (F, US, FR, NFR, SC) are
   global and stable. A removed item is deleted and its ID is never reused.
3. **Spec and code never diverge.** From `pre-prod` on, a behaviour change updates the spec
   **in the same commit** as the code. There are no spec-only or code-only behaviour commits.
4. **Change is specified before it is built.** The to-be is the uncommitted spec diff, and
   that diff *is* the scope of the work.
5. **Behaviour, not implementation.** The spec says what the player experiences and why. How
   it is built lives in `specs/plan.md`, the ADRs and the code.
6. **Ideas are cheap and live on Stori; specs are earned.** The backlog, the plan for a change
   and its tasks live in the game's Stori project. The spec is never a wishlist and never holds
   future work.

### Two platforms, one game

7. **Two stand-alone native apps.** iOS in Swift and Android in Kotlin, built **in parallel
   from the first commit**. Neither is a port of the other and neither comes first. Each gets
   its own best answer to *how*, never a transliteration of the other (ADR 0001).
8. **Share the description, never the implementation.** What crosses platforms is `shared/`:
   generated config (tunables, copy, tokens), assets, and golden vectors. A value is declared
   once and generated into both apps, never hand-copied.
9. **Same commit or a delta row.** A behaviour change lands on both platforms in one commit, or
   the spec gains a **dated platform-delta row** naming which platform is behind and the Stori
   item that closes it. A platform silently behind is the failure this rule exists to prevent.
   To a player's eye it is the same game, and any noticeable difference not in the table is a bug.
10. **Deterministic simulation, golden vectors.** Game logic runs on a fixed timestep from
    seeded randomness, with no wall clock, no ambient random and no device-dependent branch on
    the simulation path. Logic and presentation are separate layers. `shared/vectors/` holds
    seeded input → expected-state recordings that **both** platforms' test suites replay; a
    drift turns a suite red.

### Quality

11. **No prototype mindset in the product.** The apps are built prod-grade. UI ships only when
    it is wired to real functionality. `web/` is the sanctioned exception, and the exemption
    is a location, not an attitude.
12. **TDD for logic, hands for feel.** Rules, economy and progression follow contract →
    failing test → green, and reverting the fix must turn the test red. Look and feel are
    judged by the owner on real phones, and nothing else verifies a gameplay change. Every test
    sits on the path to production.
13. **Performance is a requirement.** The spec names the reference devices (a current flagship
    and the weakest supported device on each platform) and their budgets. Breaking a budget is
    a bug.
14. **Fail loud, no hardcoded fallbacks.** A value that comes from outside the code reading it
    (config, environment, endpoints, product ids, keys, tunables, level data, a decoded file)
    is either there or it is an error. `let x = env.x || 100` is forbidden, as are `?? 100` and
    `?: "id"`. The failure says what is missing and where it should come from. A default is
    allowed only where absence is a specified state.

### Architecture & decisions

15. **Clean over compatible.** When the spec changes a shape, the old shape goes, with no
    compat shims, adapters or deprecated paths. The only exception is player data in `live`
    (see *Stages*).
16. **No duplication; search before you write.** One canonical shape, one write path and one
    owner per concern. In particular, one place decides what a play session is worth, one earn
    path and one spend path. Before writing a helper, type, extension or pattern, search the
    codebase for one that already exists, and extend it rather than writing a sibling.
17. **Take the SOTA dependency.** Prefer the best-in-class library to hand-rolling one. Pin
    runtime-critical dependencies exactly, and record each adoption as an ADR in `decisions/`.
18. **Own engineering calls; flag one-way doors.** Pick the elegant default and say what you
    picked. A foundational, hard-to-reverse choice (renderer, persistence shape, threading,
    module boundaries) goes to `/architecture` and becomes an ADR. A product fork, meaning two
    things a player would feel differently, goes to the owner.
19. **Elegance decides, effort doesn't; riskiest first.** Don't fear sweeping changes, because
    a sharp line beats a safe one. How long an implementation or refactor would take is **no
    factor** in choosing it. **Never estimate time or effort**, not in plans, options or
    replies, because such estimates are routinely off by orders of magnitude. De-risk the
    foundation before polishing what sits on it.

### Engineering rules

These bind `ios/`, `android/`, `shared/` and `tools/`. In `web/` they are good habits, not
gates (the *Ship speed ◄► Prod-grade rigor* slider), except 25, which binds everywhere.

20. **No swallowed errors.** No empty catch, no `try?` or `runCatching { }.getOrNull()` that
    throws the failure away, no log-and-continue. An error is handled meaningfully at a place
    that can, or it propagates and fails loud.
21. **Root cause, not symptom.** Fix a bug where it starts. No retry loop, sleep, delay,
    defensive null check or one-input special case to make a symptom go away.
22. **Fix what you touch.** When a change runs into duplication or a bad shape in code it
    touches, refactor toward the elegant version in the same change, with no permission
    needed. Leave code the change doesn't touch alone, and file a Stori item for what you saw.
23. **No dead code.** No commented-out code, no unused functions, no branch kept "just in
    case". Git remembers, so delete it.
24. **No magic numbers.** Every tunable has a name and lives in `shared/data/`. Only
    self-evident literals (0, 1, an index) appear inline.
25. **Comments say why; Stori ids stay in comments.** Code says what it does. A comment
    explains only the reason, meaning the constraint or decision the code can't express. A
    Stori id (`GAME-42`) may appear in a comment or a commit message, and **never** in an
    identifier, a string, a file name, a test name, a log line, or anything a player can see.
26. **Tests use the real code.** Don't mock our own code. Fakes exist only at the platform and
    external boundaries (store, network, clock, file system). No sleep, wait-for-timeout or
    retry-until-green in a test, because a flaky test is a bug in the test or the code.

---

## Monetization ethics

Non-negotiable. If the game is free-to-play with in-app purchases, these bound what that may
mean.

1. **Compare like with like.** If a competitive surface exists (a ranking, a shared challenge,
   a head-to-head), a player is ranked against others with the same purchased advantages.
2. **Never sell the fix to a problem we manufactured.** No artificial friction added so it can
   be removed for money. Difficulty serves the game, not the shop.
3. **No dark patterns.** No countdown pressure on a purchase, no confusable currencies at the
   point of sale, no accidental-tap buys, no ads dressed as gameplay. Price and contents are
   legible before the tap.
4. **The free game is a whole game.** A player who never spends gets the full core loop and a
   real earn path. Paying buys pace and cosmetics, not entry.
5. **Never spend a player's premium currency implicitly.** It leaves the balance only on a
   deliberate, confirmed act.
6. **Never fabricate an entitlement client-side.** Purchases and balances resolve through one
   verified path per store (StoreKit on iOS, Play Billing on Android). No debug switch that
   grants anything ships, and tests click through paywalls rather than seeding entitlements.

## Privacy & telemetry

1. **Collect the minimum.** Every event answers a question we have written down. No event
   "just in case".
2. **Anonymous by default.** No account, no advertising id and no cross-app identifier unless
   a spec section justifies it. Each install has its own random id, and that is all.
3. **Consent first where the law or the store asks for it.** No event leaves the device before
   that. A test run sends nothing.
4. **Described once, decided in the core, sent by the app.** The event catalogue lives in
   `shared/data/`. Each platform's core decides when an event happens, and the app sends it.
   The spec lists every event and when it fires.
5. **The store privacy labels are part of the spec.** A change that alters what leaves the
   device updates them in the same commit.

---

## Governance

- This constitution overrides every other practice in the repo. `/speckit-plan` checks every
  plan against it in its *Constitution Check*. A deviation needs a row in the plan's
  *Complexity Tracking* table explaining why the simpler path was rejected.
- **Amendments** go through `/speckit-constitution`. The commit message begins
  `constitution:` and carries a one-line rationale. There is no version number: git is the
  history, as it is for the spec.
- Moving a trade-off slider is an amendment. Changing the `Stage:` is a spec change, not an
  amendment, but it must be made by the owner.
