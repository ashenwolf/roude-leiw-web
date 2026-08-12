# `.claude/reference/` — binding technical detail, loaded on demand

`CLAUDE.md` is a lean hub loaded into every session; it stays under the tool's char budget by pointing here instead of inlining. This directory holds the **binding mechanics** CLAUDE.md used to state in full: exact specs, diagrams, checklists, bounds. Read the file for the area you're touching before making a change there — don't read them all speculatively.

**How this differs from `.claude/memory/`:** memory holds *design rationale* — why a structure was chosen, tradeoffs, "we considered X and decided no." Reference holds *current mechanics* — what the system does right now, stated precisely enough to code against. A memory file can go stale gracefully (it's a historical record); a reference file going stale is a bug, because the diagram or checklist is asserted as true *today*.

| File | Read it before you… |
|---|---|
| [mode-specs.md](mode-specs.md) | touch `src/exercise/modes/*.ts`, the SessionMachine, the unlock rule, or the error pool |
| [data-flow.md](data-flow.md) | add/rename/move a producer or data shape; touch the session or per-slot state machines |
| [persistence.md](persistence.md) | add a KV key, change a stored shape, alter merge semantics, or add a client-side store |
| [security.md](security.md) | add an API endpoint, a persisted field, or a new external resource |
| [testing.md](testing.md) | decide whether/how to test something, or need the fixture helpers |
| [project-structure.md](project-structure.md) | need the full annotated file tree |

**Keep these accurate in the same commit as the change that invalidates them.** Unlike memory, there is no tolerance for drift here — these files are asserted as the current state of the system, not a record of a past decision.
