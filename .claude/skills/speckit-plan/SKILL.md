---
name: "speckit-plan"
description: "Execute the implementation planning workflow: update the one technical plan (specs/plan.md, specs/data-model.md) for the spec diff, and turn one-way doors into ADRs."
argument-hint: "Optional guidance for the planning phase"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit (adapted: game-template single-spec mode)"
  source: "templates/commands/plan.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## What this does

Takes the reviewed spec diff (`git diff -- specs/spec.md`, or the whole spec on a first run) and
updates the **lasting** technical design so it can be built on **both** platforms:

- `specs/plan.md`: the one plan for the whole game (stack, architecture per platform, budgets,
  structure, feature coverage). Updated in place.
- `specs/data-model.md`: entities, save format, `shared/data` shapes and vector format. Updated
  in place.
- `decisions/NNNN-title.md`: an ADR for each lasting or one-way-door choice. Spec Kit's
  `research.md` is replaced by ADRs.

The **ephemeral** part, meaning how to get from as-is to to-be in steps, is not written here.
`/speckit-tasks` puts it on the Stori work item.

## Steps

1. **Hooks**: run `hooks.before_plan` from `.specify/extensions.yml` if registered.
2. **Setup**: run `.specify/scripts/bash/setup-plan.sh --json` and parse `FEATURE_SPEC` and
   `IMPL_PLAN`. It seeds `specs/plan.md` from the template if it is missing.
3. **Load**: the spec and its diff, `.specify/memory/constitution.md`, `conventions.md`, the
   current plan, `data-model.md`, and the ADRs the change touches.
4. **Stage check**: in `prototype`, the only planning is the `web/` stack ADR (if it isn't
   taken yet) and whatever `web/` needs. Stop there. The apps are planned at graduation.
5. **Constitution Check**: one line per relevant principle. An unjustified violation is an
   ERROR. A justified one gets a row in *Complexity Tracking*.
6. **Design** (pre-prod / live), for each new or changed feature:
   - **Core**: what the deterministic simulation owns and emits, and which golden vectors
     must be added or re-recorded.
   - **Per platform**: the iOS answer and the Android answer, each idiomatic to its platform
     and never a transliteration of the other.
   - **Shared**: what goes in `shared/data`, `shared/assets` and `shared/vectors`.
   - **Budgets**: what the change costs against the budget table.
   - **Data**: changes to saved shapes. In `live`, the migration.
   - Update *Feature Coverage*.
7. **One-way doors**: for each foundational, hard-to-reverse choice (renderer, persistence
   shape, thread and state ownership, module boundaries, what the platforms may share), name
   it. If it can't be settled on the spot, run `/architecture`. Record each settled one as an
   ADR (Context · The question · Decision · Alternatives considered · Consequences) and link
   it from the plan.
8. **Dependencies**: prefer the best-in-class library (constitution, *Take the SOTA
   dependency*). Each adoption is an ADR, with the version pinned exactly.
9. **Re-check** the Constitution Check after the design.
10. **Hooks**: run `hooks.after_plan` if registered.

## Rules

- Behaviour never goes here; it lives in the spec. If design forces a behaviour change, go
  back to `/speckit-specify` first.
- No versions and no dates on the plan. Git is the history.
- Scope down before over-engineering: sketch the smaller version. A feel-dependent unknown
  becomes a `web/` sketch task, not a design.

## Report

The features planned or revised, the ADRs written, the vectors to add or re-record, the
budget impact, and the next step: `/speckit-tasks`.
