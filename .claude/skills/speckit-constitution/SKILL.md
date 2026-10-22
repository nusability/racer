---
name: "speckit-constitution"
description: "Amend the project constitution (.specify/memory/constitution.md): principles, trade-off sliders, stage rules, north-stars. No version numbers; git is the history."
argument-hint: "The amendment, e.g. 'move Ask/Decide one notch toward Ask'"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit (adapted: game-template)"
  source: "templates/commands/constitution.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## What this does

Amends `.specify/memory/constitution.md` in place. The constitution is already concrete, so
this is an edit, not a template fill. It carries **no version number and no ratification
dates**. Git is the history, as it is for the spec.

## Steps

1. **Hooks**: run `hooks.before_constitution` from `.specify/extensions.yml` if registered.
2. Read the constitution, `AGENTS.md`, `conventions.md` and the spec header.
3. **Understand the amendment.** If it is vague, ask at most 3 questions. For a trade-off,
   present it as a **slider** with 3–4 positions, each with its consequence, and mark the
   current position:

   ```
   Clean architecture ●━━━━━━━━○ Backwards compatibility   (current)
   Clean architecture ━━━━●━━━━ Backwards compatibility   (deprecation window for stored shapes)
   ```

4. **Edit.** Keep the structure: preamble → *The trade-off settings* → *Stages* → *Product
   north-stars* → *Principles* → *Monetization ethics* → *Privacy & telemetry* →
   *Governance*. Principles are declarative and testable, and each states its rule plainly. A
   new principle takes the next number, and existing numbers are not renumbered (other files
   cite them).
5. **Propagate.** Find the places that restate the changed rule (`AGENTS.md`,
   `conventions.md`, `.specify/templates/*`, `.claude/skills/*`, `.claude/agents/*`) and update
   them in the same change. List what you touched.
6. **Hooks**: run `hooks.after_constitution` if registered.

## Report

What changed (before → after), the files propagated, and a suggested commit message that
begins `constitution:` with a one-line rationale, e.g.
`constitution: Ask/Decide one notch toward Ask while the team onboards`.

Changing the spec's `Stage:` is **not** an amendment. That is `/graduate` (prototype →
pre-prod) or an owner's spec edit (pre-prod → live).
