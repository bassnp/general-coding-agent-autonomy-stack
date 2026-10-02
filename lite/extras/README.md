# Extras — optional, install only what you need

The core package works without anything in this folder. These files help a repository that installs tools or
talks to live services. Nothing here is loaded until you copy it into place.

Installing a skill or a script is an approval-required step (`AGENTS.md` §5, §9): enabling a new skill is a new
dependency, so read the file first and give a YES for each one. The agent may list what goes where; it copies
nothing into `.claude/` before that YES.

## What each extra is, and when it helps

| File | What it is | It helps when |
|---|---|---|
| `gcaas-tooling-install/SKILL.md` | A skill (`/gcaas-tooling-install`) that installs one catalogued tool: validate, stage a diff, wait for a YES, apply, prove it is live. | Agents in the repo need MCP servers, plugins, skills, subagents or CLIs added safely. |
| `scripts/validate-catalog.ps1` | A validator for the tooling catalog: schema, deny list, unanchored allow-globs, secret-shaped values. Exit codes 0-5. | You keep a tooling catalog. The skill halts without it. |
| `templates/CATALOG_TEMPLATE.md` | The shape of a tooling catalog (`TOOLING_CATALOG.md`), and itself a valid catalog. | You want a written list of what agents may install, with a deny list. |
| `templates/INIT_CHECKLIST.md` | A one-time bootstrap checklist: permission mode, credentials, `.env`, host prerequisites, config traps, a dispatch proof. | You are setting the package up in a repo for autonomous runs. |
| `templates/PROTOCOL_TEMPLATE.md` | A skeleton for a per-service protocol file (`[VERIFIED]` baseline, operating rules, session checklist). | The repo touches a live service (`AGENTS.md` §11). |

## How to install
| From `extras/` | To | Note |
|---|---|---|
| `gcaas-tooling-install/` | `.claude/skills/gcaas-tooling-install/` | Restart the session; skills load at start. |
| `scripts/validate-catalog.ps1` | `.claude/scripts/validate-catalog.ps1` | Or `~/.claude/scripts/` for a global install. |
| `templates/*.md` | `.claude/templates/` | Keeps the paths the skill and the templates cite; until installed they sit in `extras/templates/`. |
| a copy of `CATALOG_TEMPLATE.md` | `TOOLING_CATALOG.md` at the repo root | Fill it in; the filled catalog is the repo's own record. |
| a copy of `PROTOCOL_TEMPLATE.md` | one file per live service, at the repo root | Fill it in only from executed checks. |

`INIT_CHECKLIST.md` is read once and worked in order; it installs nothing itself.

## Check the validator
A repo copy is repository code, so its first run needs a sha256 match with a global copy in `~/.claude/scripts/` or a
YES that names it (`gcaas-tooling-install` §1). Then run this from the repository root, and expect exit code 0:

```
powershell -ExecutionPolicy Bypass -File .claude/scripts/validate-catalog.ps1 -Path .claude/templates/CATALOG_TEMPLATE.md
```

Pass `-Entry <name>` on every install request, *importantly*: without it the run is only a lint, and a deny-listed
entry is reported, not refused.
