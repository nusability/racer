# android/: the product on Android

Kotlin, prod-grade, built **in parallel** with `ios/` from `/graduate` on (ADR 0001). It is a
stand-alone implementation, not a port of iOS. Empty until then.

What gets decided at graduation, through `/architecture` → `decisions/`:
- what draws the scene, what draws the UI, which thread owns the simulation, the clock;
- the persistence shape.

Standards are in `conventions.md`: Kotlin, Gradle Kotlin DSL with a version catalog, and the
deterministic core as a JVM module (`./gradlew :core:test` replays `shared/vectors/`).
