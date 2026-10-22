---
name: "speckit-analyze"
description: "Non-destructive consistency and conformance analysis across spec.md, plan.md, ADRs, the Stori task list and the code on both platforms."
argument-hint: "Optional focus areas for analysis"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit (adapted: game-template)"
  source: "templates/commands/analyze.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

**Read-only.** This modifies no file and no Stori item. It produces a report, and the user
decides what to fix. Best run in a fresh context (or a subagent) so the build session doesn't
bias it.

## Use it twice

- **Before building** (after `/speckit-tasks`): spec ↔ plan ↔ tasks consistency.
- **After building** (before the commit): code ↔ spec conformance.

## Checks

1. **Constitution**: anything in the spec diff, plan or code that violates a principle is
   **CRITICAL**, including the stage rules, monetization ethics and privacy.
2. **Coverage**: every FR, US and SC in the diff maps to at least one task, and, after
   building, to code **on both platforms** or to a dated platform-delta row. Name the
   requirement ↔ `file:line` that satisfies it.
3. **Orphans**: tasks or code with no requirement behind them, which is behaviour without a
   spec line.
4. **Ambiguity**: vague adjectives without a number ("fast", "smooth", "rare"), leftover
   placeholders, and `[NEEDS CLARIFICATION]` markers.
5. **Consistency**: terms used two ways, contradicting requirements, data entities in the plan
   that the spec lacks (or the reverse), and a plan that forgets one platform.
6. **Parity**: every behavioural difference between `ios/` and `android/` that is not in the
   delta table. Temporary delta rows with no Stori item.
7. **Vectors**: both suites replay `shared/vectors/`. Every re-recorded vector has a spec diff
   that explains it.
8. **Tests**: each new contract has a test that fails without the fix. No test sits outside
   a pipeline.
9. **Player data** (stage `live`): every changed saved shape has a migration and a test that
   loads a pre-change save.
10. **Economy**: for changes touching currency, rewards or prices, state the earn rate, the
    sink and the time-to-unlock, and check them against the spec's invariants.
11. **Secrets and config**: no hardcoded fallback for any externally resolved value, no echoed
    secret, no client-side entitlement.
12. **Engineering rules** (constitution 16, 20–26) in the changed code: a new helper that
    duplicates an existing one, swallowed errors, symptom patches (retries, sleeps, defensive
    guards), dead or commented-out code, magic numbers, comments that restate the code, Stori
    ids outside comments, mocks of our own code, and sleeps or retries in tests.

## Output

A table of findings: `ID · Category · Severity (CRITICAL/HIGH/MEDIUM/LOW) · Location
(file:line or spec ID) · Finding · Fix`. Then coverage numbers, the list of unmapped
requirements, and a verdict:

- **pass**: ready for the spec + code commit.
- **fail**: the CRITICAL and HIGH items to resolve first.

Offer to fix the top items, but don't apply anything without the user's go-ahead.
