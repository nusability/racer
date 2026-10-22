# Architecture Decision Records

Dated, one-off technical decisions: the durable *why* that code can't explain. One file per
decision, named `NNNN-short-title.md`. Take the next number, and never reuse or renumber one.

- **0001–0002** are standing decisions inherited from `game-template`.
- **0003** is the web prototype's stack (taken by `/new-game`).
- The apps' one-way doors (renderer, UI, threading, persistence) are taken at `/graduate`
  through `/architecture`.

An ADR is never edited to say something else. It is **superseded** by a new one, or
**narrowed** with a dated note at its foot.

## Template

```
# NNNN. <title>
Date: YYYY-MM-DD · Status: proposed | accepted | superseded by NNNN | narrowed by NNNN

## Context
<the forces at play: what made this a decision>

## The question
<"X can be A or B": the decision to be taken>

## Decision
<what we chose, and its shape>

## Alternatives considered
<each rejected path: what it buys, what it forecloses. Effort to build is never a reason.>

## Consequences
<trade-offs, what this closes off, what would make us revisit it>
```
