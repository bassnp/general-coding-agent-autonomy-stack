# General Coding Agent Autonomy Stack (GCAAS)

*Long Horizon Task Execution via Guardrailed Agent Autonomy*

The operator's handbook. Read it once; after that, the agent reads `AGENTS.md` and you mostly type the commands below.

## 1. What this is

- A constitution (`AGENTS.md`) that tells a coding agent how to work, when to ask, and when to stop.
- Three commands (`/gcaas-plan`, `/gcaas-run`, `/gcaas-status`) and four saved workflows that run plan, build and validate as parallel helper agents.
- Model routing: the agent picks the model and effort for each helper from a lookup table of defaults, and says why.
- An edge-case inventory (`.claude/EDGE_CASES.md`) that records every quirk the package has met and how it is handled.
- State on disk: a plan, a ledger, decisions and evidence files, so a fresh session can continue from the files alone.

## 2. What is inside

```
AGENTS.md                      the constitution (200 lines or fewer); the agent reads it every session
CLAUDE.md                      imports AGENTS.md with one @AGENTS.md line, so Claude Code loads the constitution
GCAAS_README.md                this handbook (named so it never replaces a project's own README.md)
.claude/ROUTING.md             execution routes, the model and effort lookup table, the retry ladder, the evidence behind it
.claude/EDGE_CASES.md          the quirks inventory and the earned guardrails
.claude/BRIEFS.md              how to brief a helper: the slots, the emphasis policy, how much latitude to give
.claude/workflows/
  gcaas-plan-draft.js          recon, decompose into tracks and waves, plan adversary, revision
  gcaas-wave.js                one wave: a baseline suite run, tests, build, validate, retry; then commit and run the suite
  gcaas-review.js              critics by lens, a merge of duplicates, a refute pass, a verdict
  gcaas-research.js            facets, researchers, verification, a cited synthesis
.claude/skills/gcaas-plan/     alignment Q&A, runs gcaas-plan-draft, writes the plan and ledger, stops for approval
  templates/                   plan, ledger, decisions and resume templates
.claude/skills/gcaas-run/      reconcile, preflight, the wave loop, the ledger, escalation, the stops
.claude/skills/gcaas-status/   plain-words progress table and brief, then open decisions asked by Q&A
.claude/agents/
  gcaas-opus-xhigh.md          planner, reviewer, judge
  gcaas-opus-high.md           surgical builder, validator
  gcaas-sonnet-high.md         gatherer, editor, researcher
  gcaas-haiku.md               mechanical sweeps only
.claude/templates/COMPACT_PROMPT.md   the text you paste to compact a session
extras/                        optional, see section 10
```

## 3. Install

Per repo, which is the normal case:

1. Copy `AGENTS.md`, `CLAUDE.md`, `GCAAS_README.md` and the `.claude/` folder into the repo root, following steps 2 to 4 where a file already exists. Never copy over or overwrite the project's own `README.md`.
2. If an `AGENTS.md` already exists (other coding agents often read it), do not copy over it. Keep the project's copy outside the repo (an untracked backup trips `/gcaas-run`'s dirty check), put the package's in place, and carry the project's own rules into a final section after §13, which the other agents still read (the file then runs past 200 lines by that section); a file that `CLAUDE.md` imports with a second `@` line suits only rules that Claude Code alone needs. Show the operator any rule that contradicts §1 or §5; the merge is their decision.
3. If a `CLAUDE.md` already exists, do not overwrite it. Append the single line `@AGENTS.md` unless it is already there, and keep what it already said.
4. If a `.claude/` folder already exists, merge. Every `gcaas-*` file is new and collides with nothing standard; the four unprefixed files (`ROUTING.md`, `EDGE_CASES.md`, `BRIEFS.md`, `templates/COMPACT_PROMPT.md`) replace any older copies, except an existing `EDGE_CASES.md`, whose earned guardrails section 9 merges back in.
5. Add the line `.claude/workflows/*.js text eol=lf` to the repo's `.gitattributes` (create the file, or append to it) and commit it with the package. With `core.autocrlf=true` a checkout otherwise writes CRLF, and Claude Code rejects every CRLF workflow (`EDGE_CASES.md`: CRLF workflow scripts).
6. Restart Claude Code in the repo root. Rung agents resolve against the folder the session started in. A newly created `.claude/agents/` folder is not picked up by a running session, and edits to a definition may not apply mid-session (`EDGE_CASES.md`, earned guardrails: the agent registry).
7. Verify by name, not by count, because the folders may be shared with other tooling:
   - the skills `gcaas-plan`, `gcaas-run` and `gcaas-status` exist under `.claude/skills/`;
   - the workflow files `gcaas-plan-draft.js`, `gcaas-wave.js`, `gcaas-review.js` and `gcaas-research.js` exist under `.claude/workflows/` (`/reload-skills` re-reads them in a running session);
   - the four `gcaas-*` agent files exist under `.claude/agents/`;
   - `CLAUDE.md` contains exactly one `@AGENTS.md` line;
   - `git check-attr eol -- .claude/workflows/gcaas-wave.js` prints `eol: lf`, and `git ls-files --eol .claude/workflows` shows `i/lf w/lf` for each `gcaas-*.js` file. A clone that had them before the attribute keeps CRLF until they are written again: with no uncommitted edits there, delete the four files and run `git checkout -- .claude/workflows`.
8. Dispatch one trivial read-only task through `gcaas-sonnet-high` and see a result come back. "Agent type not found" usually means a malformed frontmatter value or a session started outside the repo root; check the `effort` and `permissionMode` values first, check the start folder, then restart again.

Requirements:
- Tested on Claude Code 2.1.285 under Windows 11; use that version or later. Older versions are untested for workflows and per-helper effort, and other systems are untested: the helpers' briefs tell them to use Claude Code's PowerShell tool.
- Workflows must be switched on. On a Pro plan turn them on in `/config`; if `disableWorkflows` is set they stay off. `/gcaas-plan` and `/gcaas-run` run saved workflows, so they need workflows on.
- Optional: the Firecrawl CLI, which research helpers try first; without it they fall back to WebFetch and say so.
- Optional: `autoContinueAtUsageLimit` on, so a wave that hits a usage limit can wait for the reset and go on by itself; it works only in an interactive subscription session (`EDGE_CASES.md`: usage-limit auto-resume).

Global install, for every project on the machine: copy the `gcaas-*` skills, agents and workflows into `~/.claude/skills/`, `~/.claude/agents/` and `~/.claude/workflows/`, then restart. `AGENTS.md` does not go global: each repo still needs its own `AGENTS.md` and the `@AGENTS.md` line. Keep `.claude/ROUTING.md`, `BRIEFS.md`, `EDGE_CASES.md` and `templates/` per repo too, because `AGENTS.md` cites them by that path. When names clash, a project workflow wins over a global one (Claude Code docs, "Workflows", https://code.claude.com/docs/en/workflows, read 2026-09-29), but a global skill wins over a project one (`EDGE_CASES.md`: skill precedence). So install the skills in one scope only, and re-copy the global ones after every update.

## 4. Commands

| Command | What it does | Use it when |
|---|---|---|
| `/gcaas-plan` | Fit check, alignment Q&A, then a plan of tracks and waves with contracts and a ledger. Ends at an approval stop. | The work spans more than one file or 50 lines, or you are unsure of the design |
| `/gcaas-run` | Reconciles state, then runs the plan wave by wave until done, with fresh validators and commits. | The plan is approved |
| `/gcaas-status` | Explains in plain words, in the chat: a short table of what is done, active and upcoming, a brief, then each open decision explained and asked through the Q&A tool, with your answers logged. | You return to a run, want to know where it stands, or owe answers |
| `/gcaas-review` | Critics by lens (correctness, security, scope, tests), a refute pass, a verdict. Read-only unless your YES lets it run the target's tests and code. | Before you trust a diff, a plan or a set of files |
| `/gcaas-research` | Facet researchers, verification, a cited report ending in open unknowns. Evaluate mode needs a use case and a volume. | A fact, a vendor or a design question needs evidence |
| `/gcaas-plan-draft` | The planning workflow. `/gcaas-plan` calls it; you rarely do. | Never by hand, unless debugging the planner |
| `/gcaas-wave` | The building workflow for one wave. `/gcaas-run` calls it; you rarely do. | Never by hand, unless debugging a wave |

A review that runs tests or failing inputs runs the target's code with your privileges, so a standalone `/gcaas-review` passes `may_run: false` (no tests, builds, installs or target code) unless your YES lets it run the target's tests and code; the switch is all or nothing. `/gcaas-run`'s closing review passes `may_run: true`: it runs the relevant tests and inputs of its own against the target's code, and your plan approval is the YES for running that code. Typed by hand, `/gcaas-review` and `/gcaas-research` take args the agent fills from `ROUTING.md`, checked at the top of each script. Review: `routing` (reviewer, judge, editor), `root`, `out`, `preset`, `target` (`kind` diff, files or plan, and `ref`), `may_run`. Research: `question`, `mode` (`investigate`, or `evaluate`, which adds `use_case` and `volume`), `preset`, `out`, `raw` (a folder for fetched pages), `routing` (researcher, reviewer, judge, and planner unless `facets` are given).

Small work needs none of these. The agent makes a mini-plan, the change and the check inline.

The agent also picks the lightest execution route for each job (`.claude/ROUTING.md` section A):
- Inline: a few tool calls, every decision, and talking to you.
- One subagent: one bounded job, such as reading many files or one research question, so its working set stays out of the main session's context. Never for two or three tool calls, because each helper starts with about 46-66k tokens of fixed context (`EDGE_CASES.md`: fixed context per helper).
- Parallel subagents: two to four independent lookups where you need answers, not verification.
- A workflow: a systematic multi-stage job with a final output, where results must be cross-verified, looped or retried; never when you are needed mid-run. For planning, building a wave, review and research it uses the four saved GCAAS workflows.

You can steer it in words ("just check this yourself", "use a workflow for it").

## 5. Presets

Say the word in your request. With no word, the default applies.

| Preset | Models and effort (from `ROUTING.md`) | Test-first rigor |
|---|---|---|
| quick | Cheaper cells: a Sonnet high builder (calibrated: the same results on small tasks, fastest and cheapest), Sonnet or Haiku for gathering and sweeps. | The builder writes failing tests, then the code; a fresh validator checks it |
| default | Opus builders, validators and test writers at high; planners and judges at xhigh; Sonnet edits and gathers | A separate test writer locks failing tests, seen red; the builder cannot touch them; a fresh validator checks the work; tracks whose risk is high also get a test adversary |
| rigorous | Builders stay at high, because effort cuts missed cases, not wrong approaches. Rigor goes into checking: validators, test writers and test adversaries at xhigh; planners, plan adversaries and judges at max. | The default flow plus a test adversary on every track, and a `/gcaas-review` of the full diff at the end |

The agent may deviate from a table cell for one helper, with a one-line reason recorded in the evidence.

## 6. How a run flows

```
/gcaas-plan   triage -> recon -> alignment Q&A (hardest question first) -> plan of tracks and waves
            -> plan adversary -> plan + ledger on disk -> APPROVAL STOP (you say yes)
            -> your yes logged -> COMPACTION STOP: the plan is done and nothing is built yet
/gcaas-run    reconcile -> preflight (clean working tree, no open decisions) -> run branch gcaas/<name>
            before each helper call: commit the run's control files (plan, ledger, decisions, resume notes)
            wave 0: the seam (shared interfaces, their tests green); then each next wave:
              baseline: the full suite once, recording the tests that already fail
              per track, in parallel only if truly separate: tests red -> build -> fresh validator
              wave end: stray-write and control-file check -> commit each passed track -> full suite -> ledger
            -> next wave, without asking
            -> findings wave (validator follow-ups) -> closing step: docs sync, and /gcaas-review in
               rigorous, or in default when a track was high risk or failed once -> COMPLETION
```

After your yes, `/gcaas-plan` logs the approval and ends with 🟡 COMPACTION: the plan is proven and on disk, and the build has not started. Start it with `/gcaas-run <plan name>`, cheapest in a fresh session or after `/compact`, so the build does not carry the planning context.

The run keeps going. It stops only for an approval, a block, a question only you can answer, completion, or real context pressure, and it writes its state to disk first. While a wave runs you see ⏳ HANDS OFF; leave the repo alone meanwhile, since a track whose files change after its validator passed it is not committed; the wave's completion notice resumes the run. A failed track gets at most five attempts in total, and each retry of a code failure starts from a red test that reproduces it. A track reverted at wave end because the new failures map to it first reproduces the recorded suite failure. When they map to no track, the wave's commits are peeled newest first: the track whose revert cleared them comes back `unclear`, its concern naming the clash, and waits for your decision; tracks peeled before it, or in a peel that never cleared, retry at the same cells.

The control files under `gcaas-ops/<name>/` (`PLAN.md`, `LEDGER.md`, `DECISIONS.md`, `RESUME.md`) hold your approvals, so the run commits them before every helper call and at the end of each turn that leaves no helper running (keep `gcaas-ops/` out of `.gitignore`). A wave halts if one is uncommitted at its start, and at its end halts without committing if one changed while helpers ran, since a helper could have forged an approval there; only the `evidence/` folder may change. Keep other plans' folders committed too, except their raw pages and `*.patch` files, which you move out instead. After every helper returns, and on resume, a change to a control file outside the run's own control commits (which include the answers `/gcaas-status` logs for you), committed or not, is treated as foreign: the agent stops and asks. At plan time likewise, a `DECISIONS.md` row the agent did not write is shown to you before anything builds on it.

At wave end only new failures count, measured against the wave's baseline. When a revert would follow, new failures first get one re-run to rule out a flake; otherwise the wave ends red and `/gcaas-run` owes that re-run. If they persist, the tracks behind them are reverted by new commits; when they map to no track and no stray writes are present, the wave's commits are reverted newest-first until they clear. If the suite still has new failures after the reverts, the run stops with 🛑. If HEAD moves during a wave, another session is at work in the repo, and the loop stops.

## 7. The six stops

Every turn of a looped run ends with exactly one stop line.

| Stop | What it means | What it asks of you |
|---|---|---|
| ⏸️ APPROVAL | The path is clear and only a yes is missing. | One decision, scoped to the named action |
| 🛑 BLOCKED | A yes will not fix it. Something must be fixed or investigated first. | Fix the thing or supply what is missing; do not answer with an approval |
| 🟡 COMPACTION | The work so far is proven and recorded; the context needs a refresh. | Compact with the block in section 8, then re-kick with `/gcaas-run <plan name>` |
| 🔵 HANDOFF | You must do or answer something beyond a yes. | Do the named step or give the answer |
| ⏳ HANDS OFF | Waiting on something that is not you: a workflow, a limit reset, CI. | Nothing while it runs, except answering any permission prompt its helpers raise (the run pauses for it). A workflow can die silently, so if nothing comes back long after it should, run `/gcaas-status` |
| 🟢 COMPLETION | Every part of the work is proven done. | Review, then close the plan |

The discriminator, in three lines:
- Does a yes from you clear it? Approval. Must something be fixed first? Blocked. Must you do or answer more than a yes? Handoff.
- Is it waiting on something that is not you? Hands off. Is the work proven and only the context spent? Compaction. Is everything proven done? Completion.
- Unproven work with the context spent is never compaction; it is hands off when something restarts the session, else handoff.

A host harness that recognises fewer stop types wins: the agent prints its nearest equivalent, and never ⏸️ for an ask a yes alone cannot answer, because a host may approve ⏸️ by silence. `.claude/EDGE_CASES.md` has the detection and per-host mappings.

## 8. Paste-ready replies

Fill the `<angle brackets>` and paste. Each approval names its action and bounds it to this run, because a bare "yes, go ahead" is read as a standing yes.

**Compaction.** Open `.claude/templates/COMPACT_PROMPT.md`, select from `/compact` to the last line, and paste it. It is multi-line on purpose: a multiline paste arrives through the paste chip (`[Pasted text #N +M lines]` is your proof it arrived whole), while one long line can be truncated in some terminals. A compacted session does not resume by itself: then type `/gcaas-run <plan name>`, or your own kickoff prompt for other work.

**Approval scoped to one action:**

```
Approved for this run only: <exact action>, against <exact target>, limited to <exact scope>.
Not approved: anything outside that target or scope, any other action of the same class, and
any follow-on this one turns out to need; bring those back to me separately.
Before you start, state what would have to be undone if this goes wrong. After, paste the real
output, including anything that failed.
```

**Rejection or redirect:**

```
No, do not do <the thing you proposed>. Reason: <why>.
Do this instead: <the alternative>.
If that conflicts with something you have verified and I have not seen, say what you know that
I do not in one sentence, and in that case stop until I answer.
```

**Demand for evidence:**

```
That is an assertion, not evidence. For every claim in what you just wrote, give me the command
you ran, its exit code and the real output, or relabel the claim Unverified and say what would
settle it. Do not re-run anything destructive to satisfy this. If a check was never executed,
say so plainly rather than reconstructing what it would have printed.
```

**Status check.** Type `/gcaas-status`, or ask in your own words ("explain the progress", "explain the open questions"). It reads the files on disk, so it works in a fresh session too, and answers in the chat, never in a file. It explains each open decision, asks it through the Q&A tool, and logs your answers for `/gcaas-run`; it writes nothing else, and nothing while a wave runs. With several plans on disk, name one: `/gcaas-status <plan name>`.

## 9. Updating

Replace the package files with the newer ones, with three exceptions. `CLAUDE.md`: keep yours; it needs only its one `@AGENTS.md` line. `AGENTS.md`: carry everything after §13 (the project's own rules from install step 2, if it added any) into the new file after its §13. `.claude/EDGE_CASES.md`: the guardrails your own runs earned live there, so diff it and merge them back in at the end of the list (the skills and docs cite items by topic, so numbers may shift). Local edits to an installed skill, workflow or agent get no backup, so keep them under version control. After an update, restart Claude Code and re-run the by-name check in section 3.

## 10. Deliberately not included

- Settings, hooks, permission rules and MCP configuration. They are environment-specific and security-sensitive, and `AGENTS.md` makes each one an operator-approved edit. A package that shipped them would be granting itself permissions.
- Routing above opus. Models are the aliases `opus`, `sonnet` and `haiku`. A stronger model runs only when you ask for it by name, and then as the session's own model or through an agent definition you approve (a governance edit), since the saved workflows accept only those three aliases and no `gcaas-*` rung names another.
- Per-track copies, worktrees and merge paths. Tracks the plan proves truly separate build side by side in the same folder; everything else runs one builder at a time.

`extras/` is optional and is not copied by the install steps. It holds the `gcaas-tooling-install` skill with its `validate-catalog.ps1` validator and a catalog template, an `INIT_CHECKLIST.md` for a first-time machine setup, and `PROTOCOL_TEMPLATE.md` for a live-service protocol file. Copying the folder loads nothing: to use an extra, follow the install table in `extras/README.md`. A repo that touches a live service needs a protocol file started from `PROTOCOL_TEMPLATE.md`, which `AGENTS.md` §11 cites.

## 11. Provenance

- Distilled from a multi-month build of a coding-agent operating package.
- It is organised around saved workflows, parallel tracks that are truly separate, and model routing by a lookup table.
