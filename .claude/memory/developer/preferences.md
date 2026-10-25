---
name: preferences
description: Developer workflow preferences — always use auto-memory; reply in Lithuanian; Boy Scout Rule on every edited file.
keywords: [workflow, memory, language, lithuanian, boy-scout, refactoring]
updated: 2026-10-25
---

### Rule / Fact

- Always use the auto-memory skill for **every** task: retrieve from `.claude/memory/` before starting, save new high-signal facts after.
- The developer writes in Lithuanian (often without diacritics); reply in Lithuanian.
- **Boy Scout Rule:** whenever a file is edited, also leave it a bit better — small, safe improvements in that file (clearer naming, removing duplication or dead code, tightening types, fixing small inconsistencies). Keep them scoped to the touched file and mention them in the summary.

### Context & Why

Explicit instructions from the developer: "visada naudok auto-memory - betkokiom uzduotim" (2026-10-24) and "Visada naudok Boy Scout Rule - kai redaguoji faila ji patobulink" (2026-10-25).

### Practical Impact

Start each substantive task by reading `.claude/memory/INDEX.md`. Before finishing an edit, review the touched file for one or two worthwhile cleanups; don't turn them into unrelated rewrites.
