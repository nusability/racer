---
name: "speckit-implement"
description: "Build the tasks on the change's Stori work item on both platforms until the code matches the spec diff, then commit spec + code together to main."
argument-hint: "Optional: a Stori item id, or a subset of tasks"
compatibility: "Requires spec-kit project structure and the Stori MCP server"
metadata:
  author: "github-spec-kit (adapted: game-template, tasks on Stori)"
  source: "templates/commands/implement.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## Steps

1. **Hooks**: run `hooks.before_implement` from `.specify/extensions.yml` if registered.
2. **Load**: the Stori work item (`claim_work_item` moves it to in progress and assigns it),
   its `## Tasks` list, the spec diff, `specs/plan.md`, `specs/data-model.md`, the touched ADRs,
   the constitution and `conventions.md`.
3. **Gate**: if `[NEEDS CLARIFICATION]` markers remain in the spec, or a requirements checklist
   in `specs/checklists/` has open items, list them and ask whether to proceed.
4. **Build in task order, riskiest first:**
   - **TDD for logic**: write the contract test, watch it fail, make it pass. Reverting the fix
     must turn it red.
   - **Both platforms.** Each task tagged `[core]` is done when *both* cores pass it. If one
     platform has to stop short, add the dated temporary row to *Platform deltas* now and file
     the Stori task that closes it.
   - **Vectors**: both suites replay `shared/vectors/` green. A re-recorded vector needs a spec
     diff that explains it.
   - **Shared values are generated, never hand-copied.** Edit `shared/data/` and run the
     generator.
   - Tick each task (`- [x]`) on the Stori item as it completes, so progress is visible.
5. **The cheap checks**, which are the default: the data generator's `--check`, both core test
   suites, and one compile of each app. Simulators, emulators and screenshot loops are only for
   debugging a specific failure or when the owner asks.
6. **Feel**: a gameplay or UI change is verified by the owner playing a build on their phones.
   Say what to try. Do not claim it feels right.
7. **Conformance**: run `/speckit-analyze` (ideally in a fresh context). If reality forced a
   behaviour change, fix the spec so it stays honest.
8. **Commit** spec + code + shared data **together, straight to `main`** (trunk-based, no PRs
   unless the owner asks), as a Conventional Commit with the Stori key in the footer, e.g.
   `feat(core): ball spins on release` + `Closes: GAME-42`. Then move the Stori item to done and
   comment the commit SHA.
9. **Hooks**: run `hooks.after_implement` if registered.

## Rules

- `web/` code is never copied or transliterated into an app. Port the behaviour and numbers
  through the spec.
- No stubs, no placeholder UI, nothing unwired (constitution: *No prototype mindset in the
  product*).
- No compat shims for our own shapes. In `live`, player data gets a migration and a test that
  loads a pre-change save.
- The engineering rules (constitution 14, 16, 19–26) are not optional. Search for an existing
  helper before writing one. No fallback defaults, no swallowed errors, no symptom patches, no
  dead code, no magic numbers, and no Stori ids outside comments.
- Fix what you touch, and file what you only saw.
- Never estimate how long anything will take.
- Pre-existing failures are filed as Stori `bug`s, not ignored.
