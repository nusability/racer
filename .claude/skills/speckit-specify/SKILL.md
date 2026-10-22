---
name: "speckit-specify"
description: "Add a feature to (or create) the single game specification at specs/spec.md from a natural language feature description."
argument-hint: "Describe the feature or change you want to specify"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit (adapted: game-template single-spec mode)"
  source: "templates/commands/specify.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

The text after `/speckit-specify` **is** the feature or change description. Ask for it only if
it is empty.

## What this does

Edits `specs/spec.md` in the working tree to describe the **desired** state of the game. The
resulting uncommitted diff (`git diff -- specs/`) *is* the scope of the change. It writes no
code.

> **SINGLE-SPEC MODE.** There is exactly one spec, `specs/spec.md`, for the whole game. Never
> create `specs/NNN-name/` directories, a second spec file, or `.specify/feature.json`. There is
> no Spec-Version and no changelog, because git is the version.

## Steps

1. **Hooks.** If `.specify/extensions.yml` registers `hooks.before_specify`, run them as Spec Kit
   does (mandatory ones automatically, optional ones offered to the user).

2. **Ensure the spec exists.** Run `.specify/scripts/bash/ensure-spec.sh --json` and parse
   `SPEC_FILE` and `SPEC_EXISTED`. It seeds `specs/spec.md` from
   `.specify/templates/spec-template.md` on the first run.

3. **Read first.** Read the whole spec, `.specify/memory/constitution.md`, and the Stori work
   item for this change if there is one (project key in `AGENTS.md`). If none exists and the
   change is non-trivial, create one as a `task` in the `now` bucket, set it to in progress,
   and link it in your report.

4. **Read the stage** from the spec header (`Stage:`). It decides how much to write:
   - **`prototype`**: keep it **light**. Update Vision, Core Game Loop and Tuned Numbers. Add an
     `F-NNN` block only for something that is clearly a lasting feature, and keep it to a summary
     plus the rules and numbers that play proved. No acceptance-scenario ceremony.
   - **`pre-prod` / `live`**: full treatment (steps 5–8).

5. **Decide the mode.**
   - **Create**: the spec holds only template placeholders. Fill the shared sections and split
     the description into cohesive features `F-001…`.
   - **Add**: append `### F-NNN: <Name>` under *Features* with the next F id.
   - **Amend**: the description changes an existing feature, so edit that block in place. This
     is the common case in an as-is spec. When unsure, amend the closest feature and say so.

6. **Write the feature** (pre-prod / live):
   - User stories (`USn`, priority, independent test, Given/When/Then scenarios).
   - Requirements (`FR-NNN`), each testable. Write numbers that must hold (rates, caps, prices,
     odds, timings) as **invariants with their values**. "Tuned in the prototype" is not a
     requirement.
   - Edge cases, including mobile ones: rotation, backgrounding, a call or notification,
     interrupted touch, low storage, no network, Reduce Motion, large text.
   - Shared sections touched by the change: Global Requirements, Player Data, Telemetry, Golden
     Vectors, Key Entities, Success Criteria, Assumptions, Out of Scope.

7. **Hold the rules.**
   - **IDs**: take them from the `Next IDs:` header line and bump it. Never renumber or reuse.
     A removed item is deleted, not struck through, because git has it.
   - **Behaviour, not implementation**: no engines, libraries, file names or code structure.
     Those go in `specs/plan.md` and `decisions/`.
   - **No future work**: anything "later" or "maybe" is a Stori `idea`, never spec text.
   - **Both platforms**: the text binds iOS and Android alike. If one platform will land later,
     add a dated **temporary** row to *Platform deltas* in this same diff, naming the Stori item
     that closes it.
   - **Player data** (stage `live`): a change to anything saved states its migration in the
     *Player Data* section.
   - **Monetization and telemetry**: changes are checked against the constitution's ethics and
     privacy sections. A violation is a blocker, not a note.
   - **Contradictions**: check the change against the other features. Resolve each one in the
     text, or make it one of the clarification markers below.

8. **Unknowns.** Make informed guesses and record them under *Assumptions*. Use at most **3**
   `[NEEDS CLARIFICATION: …]` markers, and only for scope or something a player would feel.
   When the unknown is **feel** ("does this play well?"), don't ask: propose a `web/` sketch
   and say so.

9. **Validate.** Write `specs/checklists/requirements.md` (overwrite it) and check:
   - No implementation details; written for a non-technical reader.
   - Requirements are testable and unambiguous; success criteria are measurable and
     technology-agnostic.
   - Scenarios and edge cases are covered, including the mobile ones.
   - IDs are unique, `Next IDs` is bumped, and nothing was renumbered.
   - No contradiction with other features or the constitution.
   - Every platform difference is in the delta table.

   Fix failures and re-check, at most 3 rounds. Present any remaining clarification markers as
   one batch of up to 3 questions, each with options and a recommended answer, then fold the
   answers in.

10. **Hooks.** Run `hooks.after_specify` if registered.

## Report

The mode (created / added F-NNN / amended F-NNN), the IDs touched, the checklist result, any
delta rows added, the Stori item, and the next step: `/speckit-clarify` if anything is still
fuzzy, otherwise `/speckit-plan`. Tell the user to review `git diff -- specs/`, because that
diff is the scope.
