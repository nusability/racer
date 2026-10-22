---
name: "speckit-tasks"
description: "Break the planned spec diff into an ordered, dependency-aware task list on the change's Stori work item (no tasks.md)."
argument-hint: "Optional task generation constraints"
compatibility: "Requires spec-kit project structure and the Stori MCP server"
metadata:
  author: "github-spec-kit (adapted: game-template, tasks on Stori)"
  source: "templates/commands/tasks.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## What this does

Spec Kit normally writes `tasks.md`. **This project keeps tasks on Stori.** The task list for
a change is ephemeral: it is written on the change's Stori work item and is done when the
change is committed. The repo never holds a `tasks.md`.

## Steps

1. **Hooks**: run `hooks.before_tasks` from `.specify/extensions.yml` if registered.
2. **Load**: the spec diff (`git diff -- specs/`), `specs/plan.md`, `specs/data-model.md`, the
   ADRs touched, and the constitution. Read the Stori project key from `AGENTS.md`.
3. **Find the work item.** Use `get_project_briefing(<KEY>)` and `query_work_items`. Use the
   item for this change. If none exists, create one: type `task` (or `bug`), bucket `now`, a
   player-facing title, tags `F-NNN`.
4. **Generate the tasks**, **riskiest first**:
   - **Setup / foundation**: anything every later task needs.
   - **Per user story**, in priority order, each story's tasks for **both** platforms:
     - `[core]` deterministic logic and its tests on each platform: contract → failing
       test → green.
     - `[vectors]` record or re-record golden vectors. Re-recording needs the spec diff that
       explains it.
     - `[shared]` data, assets and generator changes.
     - `[ios]` and `[android]` presentation, UI and integration.
   - **Verification**: the `/speckit-analyze` pass, both test suites, one compile of each app,
     and a build for the owner to play on their phones.
   - In `prototype` the list is just `[web]` tasks, and may be a single line.
5. **Format**: write the tasks into the work item's description under a `## Tasks` heading:

   ```markdown
   ## Tasks (F-003, US7–US8)
   - [ ] T1 [core] Seeded spawn table: failing test for FR-031 on both cores
   - [ ] T2 [ios] [P] …
   - [ ] T3 [android] [P] …
   ```

   `T` ids are local to this item. `[P]` marks tasks that can run in parallel with the
   neighbour task. Put dependencies in words ("after T1"). Keep any existing *Intent*,
   *Clarifications* and *Plan* sections of the description intact.
6. **Split only when it helps.** A platform-specific chunk that may lag behind, such as the work
   closing a platform-delta row, gets its own Stori `task` tagged `ios` or `android` and is
   linked to the main item with `create_link(type: "relates_to")`. Don't create a card per
   checklist line.
7. **Hooks**: run `hooks.after_tasks` if registered.

## Report

The Stori item id and link, the task count per tag, the riskiest task, and the next step:
`/speckit-analyze` (recommended), then `/speckit-implement`.
