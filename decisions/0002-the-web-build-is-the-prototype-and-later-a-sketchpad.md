# 0002. The web build is the prototype, and later a sketchpad
Date: inherited from game-template · Status: **accepted**

## Context
We find a game by playing it. A web build is the fastest place to change rules, feel and
numbers and to try them on a phone through a link. Most ideas never get past this stage. Those
that do are rebuilt as native apps (ADR 0001).

## The question
What is `web/` to the apps: a foundation, a reference, or a prototype?

## Decision
`web/` is a **gameplay prototype and nothing else**.

- **Stage `prototype`**: it is the game. Any stack (its own ADR), no spec binding, no tests
  required. The spec is kept light: the pitch, the loop, and the numbers that survived play.
- **At graduation** (`/graduate`) the spec is harvested from it: every rule and every tuned
  number. From then on **the spec is the authority**, and `web/` is not consulted for rules
  or numbers.
- **After graduation** it stays alive as a **sketchpad** for quickly trying a feel question
  (a mechanic, an AI tweak, a pacing change). Anything that survives goes through the spec into
  both apps. Nothing in `web/` binds the apps, and it may lag behind them freely.
- **What crosses into the apps is behaviour and numbers, through the spec.** Never its code,
  structure, assets or UI.
- It is never a store target. It may be published on GitHub Pages as a playable demo.

## Alternatives considered
- **Prototype straight in the apps**: slower to iterate, and it tempts us to ship prototype
  code. Rejected on merit.
- **Keep web in step with the apps**: a third implementation of every rule, kept in step
  forever, for no player. Rejected on merit (constitution 16, no duplication).

## Consequences
- Reading `web/` teaches what the game does, never how an app should be built.
- Harvesting the spec is the first real task of graduation, and the riskiest, because whatever
  it misses is lost.
