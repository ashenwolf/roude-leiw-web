# AGENTS.md

Agent-neutral entry point. **The project's guidance lives in [`CLAUDE.md`](./CLAUDE.md)** — read
that first, whichever tool you are. This file exists only so an agent that looks for
`AGENTS.md` by convention finds its way there instead of exploring blind.

Nothing here is duplicated from `CLAUDE.md`; when the two could disagree, `CLAUDE.md` wins.

## Read in this order

1. [`CLAUDE.md`](./CLAUDE.md) — the hub: commands, glossary, architecture, and pointers to
   everything below.
2. [`.claude/memory/MEMORY.md`](./.claude/memory/MEMORY.md) — index of design rationale, plus the
   code-style rules and the memory-writing rules.
3. The **one** file for the area you are about to touch:
   - [`.claude/reference/`](./.claude/reference/README.md) — binding *current mechanics*
     (mode specs, data flow, persistence, security, testing, structure conventions).
   - [`.claude/memory/`](./.claude/memory/MEMORY.md) — *why* a decision was made, and what was
     rejected.
   - [`.claude/skills/`](./.claude/skills/) — content-authoring procedures for `.letz` files.

Read the file for your area, not all of them.

## Two rules that outlive any single change

- **Reference docs must not drift.** `.claude/reference/*.md` asserts what the system does
  *today*. If your change invalidates a diagram, bound, or checklist there, fix it in the same
  commit.
- **Record rationale, not narration.** New design decisions and rejected alternatives go to
  `.claude/memory/`, merged into the relevant section — not appended as a dated changelog.

## Verify before you call it done

```bash
npm run build          # vitest + eslint + tsc -b + vite build — this is the gate
npm run check-content   # advisory Eifeler-Regel audit for .letz changes; you adjudicate flags
```

Tool-specific config: MCP servers in [`.mcp.json`](./.mcp.json) (`lod` — the Luxembourgish
dictionary, used to verify every `@word`); Kermes workspace skills in
[`.kermes/workspace.json`](./.kermes/workspace.json).
