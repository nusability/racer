---
name: "speckit-converge"
description: "Assess the codebase on both platforms against specs/spec.md and plan.md, then file the unbuilt or drifted work as tasks on Stori so implement can finish it."
argument-hint: "Optional: a feature (F-NNN) or area to converge"
compatibility: "Requires spec-kit project structure and the Stori MCP server"
metadata:
  author: "github-spec-kit (adapted: game-template, tasks on Stori)"
  source: "templates/commands/converge.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## What this does

The spec says what the game **is**. This finds where the code isn't that yet, on either
platform, and makes the gap visible on Stori. It edits no code and no spec.

## Steps

1. Load the spec (or the named `F-NNN`), the plan, the delta table, and the Stori project
   (`get_project_briefing`).
2. For each requirement in scope, check `ios/`, `android/` and `shared/`: **built**,
   **partial**, **missing** or **drifted** (the code does something the spec doesn't say).
   Cite `file:line`.
3. Check every temporary delta row: is its Stori item still open and still true?
4. Group the gaps per feature. For each group, find an existing open Stori item covering it
   (`query_work_items`) or create one: a `task` (`bug` for drift) in the `next` bucket, tagged
   `F-NNN` and `ios` / `android`, with a `## Tasks` checklist in the same format as
   `/speckit-tasks`.
5. **Drift is a decision for the owner.** When code does something the spec doesn't say, ask
   whether to fix the code (Stori `bug`) or the spec (`/speckit-specify`). Never quietly bless
   the code.

## Report

Per feature: built, partial and missing counts per platform, the drift found, the Stori items
created or updated, and the suggested order (riskiest first).
