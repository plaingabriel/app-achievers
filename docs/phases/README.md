# Build phases

Ordered, self-contained units of work. Build top to bottom — each phase unblocks the next. Every phase doc lists its goal, prerequisites, the ADRs it implements, a task checklist, and acceptance criteria.

| # | Phase | Implements | Depends on |
|---|---|---|---|
| 1 | Scaffold | 0001, 0006, 0010 | — |
| 2 | DB layer | 0003, 0004, 0008, 0011 | 1 |
| 3 | Auth | 0002, 0009 | 2 |
| 4 | RBAC | 0003 | 3 |
| 5 | Error-log viewer | 0005, 0008 | 2 (4 for gating) |
| 6 | Forms | 0003 (gating) | 4 |
| 7 | Ops | 0007, 0011 | 1 |
| 8 | Docs split | 0010 | decisions stable |
| 9 | Tests | — | when asked |

```
1 ─→ 2 ─→ 3 ─→ 4 ─→ 6
         │         
         └──→ 5    
1 ─→ 7   (parallel)
```

When picking up a phase in Claude Code, read `CLAUDE.md`, then this phase file, then the ADRs it lists, then (for any UI) `.claude/skills/achievers-design/SKILL.md`.
