# 0001. Two native codebases; share data and vectors, never code
Date: inherited from game-template · Status: **accepted**

## Context
Our games ship on the App Store and Google Play, built in parallel and held to the same bar.
There are three ways to get two store builds: a cross-platform engine or framework (Unity,
Godot, Flutter, React Native, Capacitor), a shared core of our own (Kotlin Multiplatform, Rust,
C++) under native shells, or two stand-alone native implementations.

## The question
Do iOS and Android share executable code of ours, or not?

## Decision
**Two stand-alone native implementations**: Swift on iOS, Kotlin on Android. They share no
executable code of ours. What they share is the *description*:

- `specs/spec.md`: one specification for both, with a dated platform-delta table for every
  place they are allowed to differ.
- `shared/data/`: config (tunables, copy, design tokens, motion), declared once and generated
  into both apps.
- `shared/assets/`: models, textures and sounds that both load.
- `shared/vectors/`: seeded golden vectors of the deterministic simulation, which both test
  suites replay. This is what makes two implementations checkable against each other rather
  than merely written to the same text.

A shared **third-party** dependency (the same renderer library on both platforms) is not our
code and is a legitimate choice, judged on its merits.

## Alternatives considered
- **Cross-platform engine or framework**: one codebase, but a non-native feel, an engine's
  release cadence between us and each OS, and store, payment and accessibility integrations
  through a translation layer. Rejected on merit for games that must feel native and use each
  store's own payments.
- **Shared core of our own**: removes the logic duplication but adds a build and toolchain
  boundary on both platforms and debugging across a foreign-function interface. It also makes
  each app's best answer bend to the shared core's shape. Rejected on merit: the duplication it
  removes is guarded by golden vectors without adding a foreign boundary to either app.

## Consequences
- Every behaviour change is a two-codebase change. The golden rule (same commit or a delta row)
  exists because of this decision.
- Logic is written twice, and the vectors keep the two copies honest. A drift turns a suite red.
- Each platform gets its own idiomatic answer: SwiftUI/Swift concurrency on one side,
  Compose/coroutines on the other, never a transliteration.
- Revisit only if keeping the two cores in step through vectors stops catching drift. Argue that
  head-on in a superseding ADR, not by drift.
