# Notes for agents

Context for anyone, human or coding agent, working in this repository. `CLAUDE.md` at the root is the short map; these go deeper.

| File | Read it when |
| --- | --- |
| [`workflow.md`](workflow.md) | Starting any task: the local stack, the definition of done, tests, commits, what to do when something fails. |
| [`architecture.md`](architecture.md) | Changing code: the source-versus-database split, rendering modes, how a day becomes a night and a place, the resolution pipeline, auth, environment, where a change lands. |
| [`glossary.md`](glossary.md) | Reading a request in the campaign's words: every term mapped to the code that implements it. |
| [`writing.md`](writing.md) | Writing content: the four voices, and commit messages. |

Procedures for the common tasks are skills under [`.claude/skills/`](../../.claude/skills/): `record-battle`, `add-warband`, `town-cryer`, `curfew-pack`, `curfew-engine`, `schema-change`, `preflight`. Each `SKILL.md` is a checklist; some carry a script.

Product intent is in [`PRODUCT.md`](../../PRODUCT.md), the Curfew plan and its decisions in [`src/data/curfew/PLAN.md`](../../src/data/curfew/PLAN.md), the prose rules in [`src/data/curfew/STYLE.md`](../../src/data/curfew/STYLE.md).
