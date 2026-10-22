# shared/: what the platforms share (no code)

ADR 0001: iOS and Android share no executable code of ours. They share this:

| Folder | What | How it reaches the apps |
|---|---|---|
| `data/` | Tunables, copy, design tokens, motion vocabulary, telemetry catalogue | Generated into both apps by `tools/` (generator chosen at graduation). Never hand-copied. |
| `assets/` | Models, textures, sounds both load | Bundled by each app's build. |
| `vectors/` | Golden vectors: seed + input tape → expected state | Replayed by both core test suites. A drift turns a suite red. |

A value is declared here once. Re-recording a vector needs a spec diff that explains why.
