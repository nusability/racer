# AGENTS.md

Operating rules for agents and humans. Kept short on purpose.

- **Values**: `.specify/memory/constitution.md` (it overrides everything)
- **Stack standards**: `conventions.md`
- **Current state**: `specs/spec.md` (read it first, always)

## What this repo is

**{{GAME_NAME}}**: a mobile game for the **App Store and Google Play**. Stori project:
**`{{STORI_KEY}}`**.

| Surface | What it is |
|---|---|
| `web/` | The **prototype**, where we find the game. Later it becomes a sketchpad. Never a store target, never a technical foundation. |
| `ios/` | The product on iOS. Swift. Prod-grade. |
| `android/` | The product on Android. Kotlin. Prod-grade. Stand-alone: it shares no code of ours with `ios/` (ADR 0001). |
| `shared/` | The only things the platforms share, none of it code: `data/` (generated config), `assets/`, `vectors/` (golden vectors both suites replay). |
| `specs/` | The **one** spec (`spec.md`) plus the one technical plan (`plan.md`, `data-model.md`). |
| `decisions/` | ADRs: the durable *why*. |

## Where the game is: `Stage:` in the spec header

- **`prototype`**: only `web/` exists. Sketch fast and play it. The spec stays light (pitch,
  loop, numbers that survived). Some ideas end here, and that's fine.
- **`pre-prod`**: the owner said "build it as an app" (`/graduate`). iOS and Android are built
  **in parallel** to the spec. Clean, always: saves may reset.
- **`live`**: in a store. As `pre-prod`, plus player data is sacred (migrations, never resets).

Only the owner moves the stage.

## Sources of truth

| Question | Where to look |
|---|---|
| What the game does now | `specs/spec.md` |
| How it's built now | `specs/plan.md`, `specs/data-model.md`, the code |
| Why it's built that way | `decisions/` |
| Values and trade-offs | `.specify/memory/constitution.md` |
| Ideas, priorities, the plan and tasks for a change | Stori `{{STORI_KEY}}` (Now / Next / Later) |

## Golden rule (from `pre-prod`)

**A behaviour change is a spec change in the same commit, on both platforms.** Either iOS
*and* Android land it in that commit, or the spec gains a **dated platform-delta row** naming
which platform is behind and the Stori item that closes it. There is no third option. A
platform that is behind still compiles and passes its own tests, so it won't announce itself.

`web/` is exempt: commits there need no spec diff.

## The loop: Spec Kit, single spec, trunk-based

The as-is is the last commit. The to-be is your uncommitted spec diff.

1. **Capture**: create a Stori item in `{{STORI_KEY}}` (an `idea` stays an idea until it is
   picked up), bucket Now / Next / Later. Claim it when you start.
2. **`/speckit-specify`**: edit `specs/spec.md` to the desired state. `git diff -- specs/` is
   the scope. Review it before coding.
3. **`/speckit-clarify`**: resolve the unknowns that change what gets built. If the unknown is
   feel, sketch it in `web/` instead.
4. **`/speckit-plan`**: update the lasting design (`plan.md`, `data-model.md`). One-way door →
   **`/architecture`** → ADR.
5. **`/speckit-tasks`**: write the task list onto the Stori item, riskiest first. There is no
   `tasks.md`.
6. **`/speckit-analyze`**: consistency check before building (optional) and conformance check
   after building (recommended, in a fresh context).
7. **`/speckit-implement`**: build on both platforms until the code matches the spec.
8. **Commit** spec + code + shared data together, **straight to `main`**, as a Conventional
   Commit with the Stori key in the footer (`conventions.md`, *Commits*). Close the Stori item
   and comment the SHA.

There is no spec version and no tag: git is the history. One change in flight at a time,
because the uncommitted diff is the only to-be.

Other skills: `/speckit-converge` (find what's unbuilt or drifted and file it on Stori),
`/speckit-checklist`, `/speckit-constitution` (amend values or move a trade-off slider),
`/new-game` (bootstrap, once), `/graduate` (prototype → pre-prod, owner only).

**In `prototype`**, the loop is optional. Sketch in `web/`, keep the spec's Vision, Core Loop
and Tuned Numbers honest, and capture ideas on Stori.

## Stori conventions

- **One work item per change** (a feature added or amended, or a bug). It has a player-facing
  title and the tag `F-NNN`.
- Its description holds the change's **Intent**, **Clarifications**, **Plan** notes and the
  **`## Tasks`** checklist (`T1 [core] …`, `[ios]`, `[android]`, `[shared]`, `[vectors]`,
  `[web]`). All of that is ephemeral. Anything lasting goes in the spec, the plan or an ADR.
- Types: `idea` · `task` · `bug`. A card's type never changes. Move it between buckets.
- A platform that falls behind gets its own `task` tagged `ios` or `android`, linked
  (`relates_to`) to the main item. The delta row names it.
- Pre-existing failures are filed as `bug`s and never note-and-moved-on.

## Working rules

- **The engineering rules are constitution 14, 16 and 19–26.** In short: fail loud with no
  hardcoded fallbacks, search before you write, no swallowed errors, root cause not symptom,
  fix what you touch, no dead code, no magic numbers, comments say why, Stori ids only in
  comments and commits, and tests use the real code.
- **Never estimate time or effort.** Effort is no factor in a choice; elegance decides.
- **Decide, and say what you decided.** Commit granularity, the order of items, which small
  adjacent fix rides along: decide those. **Ask only about product forks**, meaning two things
  a player would feel differently. **Technical one-way doors go to `/architecture`**, not to a
  menu of options.
- **Press on when told.** Ship the next item. No recaps, no "good place to stop".
- **Rollback is a real option** when the work is in doubt, not as a routine menu.
- **Prototype feel, don't argue it.** Game feel, AI behaviour, difficulty and economy pacing
  are cheaper to judge in `web/` than in prose, at any stage.
- **Never copy or transliterate `web/` code into an app.** Port the behaviour and numbers
  through the spec.

## Verification

- **Cheap checks by default**: the data generator's `--check`, both core test suites, and one
  compile of each app. Simulators, emulators and screenshot loops are only for debugging a
  specific failure or when the owner asks.
- **TDD for logic**: contract → failing test → green, and reverting the fix must fail the test.
- **Golden vectors** prove the two platforms agree. **The owner's hands** prove the game feels
  right. A gameplay change needs both.
- **Verify against reality.** Check the real thing, not what you expect. Anything web is
  verified in a browser with the console open.
- **Performance** is measured on the low-end reference device, not only the flagship.
- **Economy changes** state the resulting earn and spend rates and the time-to-unlock.
- **Don't bypass gates in tests.** Click through paywalls, IAP and consent flows.
- After a dependency change, run the full suite. Pin runtime-critical dependencies exactly.

## Safety

- **Never echo or inline secrets** (App Store Connect keys, Play service-account JSON, signing
  certs, keystores). Move them via a file or secret store.
- **No hardcoded fallbacks for infrastructure config.** Fail loud.
- **Never fabricate an entitlement client-side.**

## Do NOT

- …piece current state together from Stori items or commits. Read the spec.
- …commit behaviour code without its spec diff (from `pre-prod`).
- …park future functionality in the spec. That's Stori's job.
- …create `specs/NNN-feature/` directories, `tasks.md`, or a spec version.
- …ship `web/` to a store.
