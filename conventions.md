# Conventions

Coding standards tied to the stack. Unlike the constitution, which holds universal values,
these change when the technology changes. Each game adds its own decisions (renderer, UI
approach, generator) as ADRs and records the outcome here.

The stack is **two stand-alone native implementations** (ADR 0001): Swift on iOS, Kotlin on
Android. What draws the scene on each is decided per game by ADR at graduation.

## The web prototype (`web/`)

- **The prototype, then the sketchpad** (ADR 0002). Read it for *what* the game does and
  *which numbers* it uses. Once those are in the spec, the spec is the authority.
- **Never a technical foundation.** Don't mirror its module layout, class split, UI or asset
  pipeline. Design each app natively.
- **Its stack is its own ADR** (taken in `/new-game`). Keep it fast to change. If a change
  needs serious infrastructure, that's a sign it belongs in the apps.
- **Never copy-paste or transliterate web code into an app.**

## Game loop & feel

- **Fixed-step simulation**, decoupled from the display, on both platforms. The step is named
  in the spec. Rendering interpolates or draws the latest state, and never advances the
  simulation by the frame's delta.
- **Frame-rate independence is a correctness property.** A session plays identically at 60 and
  120 Hz, and a test asserts it.
- **Determinism is seeded, never ambient.** Everything on the simulation path draws from a
  seeded generator whose algorithm the spec names. No wall clock, no unseeded random, no
  device-dependent branch. Same seed + same inputs ⇒ same result on iOS and Android.
- **Simulation and presentation are separate layers.** The core knows nothing of the scene.
  The scene reads core state and events. That separation is what lets golden vectors test one
  without the other.
- **Golden vectors** (`shared/vectors/`): seed + input tape → expected state, recorded from a
  core and replayed by both test suites. Re-recording one needs a spec diff that explains why.
- **Input latency is sacred.** Register touch on touch-down, in the same frame. Never gate
  input behind an animation, a transition or a network call.
- **Nothing blocks the next round.** No load, fetch, ad or dialog between a result and the
  next start.

## Rendering & assets

- **Shared assets where one file serves both** (`shared/assets/`). The code that places and
  animates them belongs to each platform.
- **One clock per platform** (`CADisplayLink` / the engine's update on iOS, `Choreographer` on
  Android). Nothing else drives motion.
- **"The same game to a player's eye" is checked, not hoped for.** Compare the same scene
  state on both platforms side by side when the look changes.
- **Assets are budgeted.** Draw calls, triangles, texture memory and audio have a ceiling in
  `specs/plan.md`. An addition states its cost.

## UI

- **Built once per platform as a small kit** (button, panel, list, digits…) and reused. No
  screen hand-rolls its own button.
- **Design tokens and motion, not raw values.** Colours, sizes, type, springs, durations and
  easings come from one vocabulary in `shared/data/`, generated into both apps, so both move
  the same way.
- **Accessibility is not optional.** Every interactive element exposes a label, trait and
  frame to VoiceOver/TalkBack. Text scales with the system setting within a stated range.
  Reduce Motion replaces the motion with plain fades.
- **Respect the system**: safe areas, the silent switch and media volume, interruptions.
- **Stable identifiers** on every interactive element, the same id on both platforms. Tests
  target ids, never visible text: `<surface>_<action>_button`, `<surface>_<field>_field`.

## Economy

- **One earn path, one spend path.** A single place computes what a session pays out, and a
  single place debits a balance.
- **Balances are integers.** No floats for currency, anywhere.
- **Every mutation is idempotent under retry.** Key it and check it.
- **Tunable numbers live in `shared/data/`**, not in the code that reads them.

## Payments

- **One chokepoint per platform**: StoreKit 2 on iOS, Play Billing on Android. Every purchase,
  restore and entitlement check goes through it, with at least on-device verification.
- **Purchases are per store.** Without an account, the UI never implies a cross-platform
  restore.

## Persistence

- **Versioned save format**, decoded defensively.
- **`pre-prod`**: shapes change freely, and resetting saves is fine.
- **`live`**: every shape change ships a migration and a test that loads a pre-change save. A
  record that fails to decode is preserved, never silently replaced.

## Copy

- **Declared once** in `shared/data/` and generated into `Localizable.xcstrings` and
  `strings.xml`. Neither resource file is edited by hand.
- **Prices and contents are legible before the tap.**

## Configuration (constitution 14)

- **Never silently default a missing value. Fail loud.** No `?? 100` (Swift), no `?: "id"`
  (Kotlin), no `|| 100` (JS) for anything resolved from outside the source file that reads it:
  endpoints, product ids, secrets, signing keys, tunables, feature flags, level data.
- **What may have a default**: genuinely optional behaviour (where absence is a specified
  state), obvious test dummies, and values derived from config that is already resolved.
- **The failure says what is missing and where it comes from.**
- **A default that exists only to make tests pass is a broken test.**

## Errors (constitution 20–21)

- **Swift**: no `try?` that throws away an error you can't prove is impossible, no empty
  `catch {}`, and no `fatalError` to silence the compiler where the error can be handled.
  Throw typed errors.
- **Kotlin**: no `runCatching { … }.getOrNull()` / `getOrDefault()` that discards the
  failure, no empty `catch`, and no `catch (e: Exception)` that only logs. Use `Result` or
  sealed types where failure is a specified outcome.
- A guard against "impossible" state is an assertion that crashes in debug builds, not a
  silent early return.

## Comments & identifiers (constitution 25)

- Comments explain *why*. A comment restating the code is deleted.
- Stori ids appear only in comments (`// GAME-42: the store rejects …`) and commit messages.
  Never in type, function, test or file names, string literals, logs, or UI.

## Tests (constitution 26)

- Test through our real code. Fakes stand in only at boundaries: StoreKit / Play Billing, the
  network, the clock, the file system.
- No `sleep`, `Thread.sleep`, `delay`, timeout-based waits or retry-until-green. Drive time
  explicitly (the fixed-step core makes that easy).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, with
the Stori key in a footer.

- **Types**: `feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `build` · `ci` ·
  `chore`. Use `spec` for a spec-only commit (allowed in `prototype`, and for clarifications
  that change no behaviour).
- **Scopes**: `ios` · `android` · `core` (both cores) · `shared` · `web` · `spec` · `tools`.
  Omit the scope when a change spans the whole game.
- **Summary**: what changed for the player or the system, in plain words, in the imperative.
- **Footer**: `Refs: GAME-42` (or `Closes: GAME-42` when it finishes the item).

```
feat(core): keeper holds position until the shot is released

Refs: GAME-71
```

## Technical

- **File size**: 500 lines is the maximum for an app source file on either platform. Test files
  may exceed it. Past that, refactor.
- **iOS**: Swift 6 with strict concurrency complete. The deterministic core is a SwiftPM
  package (`swift test` runs it without a simulator). Generate the Xcode project (e.g.
  XcodeGen from `ios/project.yml`) rather than committing it.
- **Android**: Kotlin, Gradle Kotlin DSL with a version catalog, AGP's current stable line. The
  deterministic core is a plain JVM module (`./gradlew :core:test`).
- **Identifiers are one-way doors at registration.** Choose the bundle id and application id
  before the first App Store Connect / Play Console registration, record them here, and never
  change them.
