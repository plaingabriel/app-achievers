# Docs

Context for humans and agents. If you are an agent, also read `../CLAUDE.md`.

| Path | What's here |
|---|---|
| `Achievers_App_Plan.md` | The master plan — full rationale and decisions (source of truth). |
| `adr/` | Architecture Decision Records. Numbered, immutable once accepted; new decisions supersede old ones. |
| `phases/` | The staged build plan, in small batches. Each phase has a **How to validate** section. Tests and GitHub Actions are the last two. |
| `db/` | Schema ownership rules and the `error_log` contract. |
| `runbooks/` | Operational procedures: backup/restore, fire drill, credential rotation, deploy. |

## How to use the phases
Work one batch at a time, top to bottom. A batch is "done" only when its
**How to validate** steps pass. Record any non-obvious decision made along the
way as a new ADR (copy `adr/template.md`).
