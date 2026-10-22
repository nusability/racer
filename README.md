# game-template

A starting point for **mobile games**: prototyped on the web, then built as **native iOS and
Android apps in parallel**. Spec-driven with [Spec Kit](https://github.com/github/spec-kit)
in **single-spec mode**, with work tracked on **Stori**.

## Using this template

1. On GitHub, **Use this template** → create the game's repo. Clone it and open Claude Code.
2. Run **`/new-game "Game Name" KEY`**. It creates the Stori project (Now / Next / Later), fills
   the placeholders, seeds a light spec, records the web stack as ADR 0003, and scaffolds `web/`.
3. **Sketch in `web/`**, play it on your phone, and capture ideas on Stori. Keep the spec's
   Vision, Core Loop and Tuned Numbers honest. Plenty of games end here.
4. When it's fun and you want it in the stores, run **`/graduate`**. It harvests the full spec
   from the prototype, flips `Stage:` to `pre-prod`, takes the apps' one-way doors as ADRs, and
   files the riskiest first work on Stori.
5. From then on, every change goes through the loop in [`AGENTS.md`](AGENTS.md) on both
   platforms at once.

## How it differs from stock Spec Kit

| Stock Spec Kit | Here |
|---|---|
| One spec per feature (`specs/NNN-feature/`) | **One spec** for the whole game, `specs/spec.md`, as it is *now*. Features are `F-NNN` sections. |
| `tasks.md` in the repo | Tasks live on the change's **Stori** work item (`/speckit-tasks` writes them there). |
| `research.md` | **ADRs** in `decisions/`. One-way doors go through `/architecture` (the `mobile-architect` subagent). |
| Versioned constitution | No versions on the spec, plan or constitution. **Git is the version.** |
| Feature branches | **Trunk-based**: spec + code commit together to `main`. |
| — | **`Stage:`** in the spec header: `prototype → pre-prod → live`, which switches rules on. |
| — | **Platform-delta table**: iOS and Android agree, or the difference is written down and dated. |
| — | **Golden vectors**: deterministic simulation pinned by `shared/vectors/`, replayed by both apps. |

## What's in here

```text
AGENTS.md                     operating rules (CLAUDE.md imports it)
conventions.md                stack standards (Swift, Kotlin, the web prototype)
.specify/memory/constitution.md   values + trade-off sliders + stages
.specify/templates/           spec / plan / checklist templates (single-spec)
.specify/scripts/bash/        Spec Kit scripts (ensure-spec.sh replaces create-new-feature.sh)
.claude/skills/               speckit-*, architecture, new-game, graduate
.claude/agents/               mobile-architect (consulted on one-way doors)
decisions/                    ADRs (0001 two native codebases, 0002 web is the prototype)
specs/                        spec.md, plan.md, data-model.md (created by the skills)
web/  ios/  android/          the three surfaces
shared/{data,assets,vectors}/ what the platforms share; none of it is code
```

## Maintaining the template

Changes to Spec Kit to re-apply after `specify init --force` or a Spec Kit upgrade:

- `.specify/scripts/bash/common.sh`: `get_feature_paths` always resolves to `specs/` (unless
  `SPECIFY_FEATURE_DIRECTORY` is set).
- `.specify/scripts/bash/ensure-spec.sh` replaces `create-new-feature.sh`. `setup-tasks.sh`
  and `tasks-template.md` are removed (tasks live on Stori). `constitution-template.md` is
  removed (the constitution is concrete and amended in place).
- `.specify/templates/{spec,plan}-template.md` are specific to games and to single-spec mode.
- `.claude/skills/speckit-{specify,plan,tasks,implement,analyze,converge,constitution}` are
  rewritten. `speckit-clarify` and `speckit-checklist` have small patches.
  `speckit-taskstoissues` is removed.
