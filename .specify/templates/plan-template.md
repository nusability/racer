# {{GAME_NAME}}: Technical Plan

**Spec**: [spec.md](./spec.md) · **Decisions**: [../decisions/](../decisions/)

<!--
  THE ONE PLAN
  ============
  The lasting technical design of the whole game, AS IT IS NOW: stack, architecture per
  platform, budgets, structure. /speckit-plan updates it in place and never creates a second
  plan. Like the spec it carries no version: git is the history.

  What does NOT live here:
  - The step-by-step plan and tasks for a change: those go on the change's Stori work item
    (/speckit-tasks) and are thrown away when it ships.
  - The WHY of a one-way door: that is an ADR in decisions/. This file links to it.
  - Behaviour: that is the spec.
-->

## Summary

{{The game in one paragraph from the engineering side: what runs where.}}

## Technical Context

| | iOS | Android |
|---|---|---|
| Language | Swift {{6}}, strict concurrency | Kotlin {{2.x}} |
| UI shell | {{SwiftUI}} | {{Jetpack Compose}} |
| 3D / rendering | {{ADR NNNN}} | {{ADR NNNN}} |
| Audio | {{}} | {{}} |
| Persistence | {{}} | {{}} |
| Purchases | StoreKit 2 (one chokepoint) | Play Billing (one chokepoint) |
| Telemetry | {{}} | {{}} |
| Tests | Swift Testing / XCTest (`swift test` on the core) | JUnit (`./gradlew :core:test`) |
| Min OS | iOS {{N}} | API {{N}} |

**Shared (no code)**: `shared/data/` (generated into both apps by `tools/{{generate-data}}`),
`shared/assets/`, `shared/vectors/`.

**Web prototype**: {{stack per ADR NNNN}}. Sketchpad only after graduation.

## Budgets

| Budget | Flagship ({{device}}) | Low end ({{device}}) |
|---|---|---|
| Frame rate | 60 fps | ≥ 30 fps, no input hitch |
| Draw calls | {{}} | {{}} |
| Triangles on screen | {{}} | {{}} |
| Texture memory | {{}} | {{}} |
| Cold start → playable | {{}} s | {{}} s |
| Download size | {{}} MB | {{}} MB |

## Architecture

### The core (per platform, mirrored by spec, not by code)

{{The deterministic simulation: fixed step, seeded RNG (algorithm named in the spec), the state it
owns, the events it emits. No rendering, no platform UI, no clock.}}

### Presentation

{{Scene, camera, UI, audio, input: what reads the core, which clock drives the frame, which
thread owns what.}}

### Data flow

{{shared/data → generator → app constants; save format; telemetry path.}}

## Feature Coverage

| Feature | iOS | Android | Notes |
|---|---|---|---|
| F-001 {{name}} | {{modules}} | {{modules}} | {{ADR links}} |

## Constitution Check

*Gate: must pass before design and again after it.*

{{One line per relevant constitution principle: ✅ / ⚠️ with a pointer.}}

## Project Structure

```text
specs/          spec.md · plan.md · data-model.md · checklists/
decisions/      ADRs (NNNN-title.md)
shared/         data/ · assets/ · vectors/
ios/            {{layout}}
android/        {{layout}}
web/            prototype / sketchpad
tools/          generators and build scripts
```

## Complexity Tracking

> Fill only when the Constitution Check has a deviation that must be justified.

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
