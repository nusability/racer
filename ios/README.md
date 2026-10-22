# ios/: the product on iOS

Swift, prod-grade, built **in parallel** with `android/` from `/graduate` on (ADR 0001). Empty
until then.

What gets decided at graduation, through `/architecture` → `decisions/`:
- what draws the scene, what draws the UI, which thread owns the simulation, the clock;
- the persistence shape.

Standards are in `conventions.md`: Swift 6 with strict concurrency, the deterministic core as a
SwiftPM package (`swift test` replays `shared/vectors/`), and a generated Xcode project.
