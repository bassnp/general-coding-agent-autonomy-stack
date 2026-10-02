# General Coding Agent Autonomy Stack (GCAAS), lite edition

*Long Horizon Task Execution via Guardrailed Agent Autonomy*

The operator's handbook. Read it once; after that, the agent reads `AGENTS.md` and you mostly type the commands below.
This is the lite edition: it needs no workflows and runs on any plan that has the Agent tool. Section 11 says what it
gives up against the full edition and when to pick which.

## 1. What this is

- A constitution (`AGENTS.md`) that tells a coding agent how to work, when to ask, and when to stop.
- Three commands (`/gcaas-plan`, `/gcaas-run`, `/gcaas-status`). The main session plans, then builds the plan wave
  by wave: for each track it launches one builder and one independent checker as helper agents, a few at a time, and
  does every git, test and commit step itself as written steps. No workflows are installed or needed.
- Model routing: the agent picks the model and effort for each helper from a lookup table of defaults, through four
  rung agents, and says why.
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
.claude/skills/gcaas-plan/     alignment Q&A, a session-written draft a fresh checker attacks, plan and ledger
  briefs.md                    the gatherer, researcher and plan-checker brief templates
  templates/                   plan, ledger, decisions and resume templates
.claude/skills/gcaas-run/      reconcile, preflight, the batches of builders and checkers, the git checks, the stops
  briefs.md                    the builder, checker, docs-editor and reviewer brief templates
.claude/skills/gcaas-status/   plain-words progress table and brief, then open decisions asked by Q&A
.claude/agents/
  gcaas-opus-xhigh.md          plan checker, rigorous checker, closing reviewer
  gcaas-opus-high.md           builder, checker
  gcaas-sonnet-high.md         gatherer, researcher, docs editor, quick-preset builder
  gcaas-haiku.md               mechanical sweeps only
.claude/templates/COMPACT_PROMPT.md   the text you paste to compact a session
extras/                        optional, see section 10
```

## 3. Install

Per repo, which is the normal case:

1. Copy `AGENTS.md`, `CLAUDE.md`, `GCAAS_README.md` and the `.claude/` folder into the repo root, following steps 2
   to 4 where a file already exists. Never copy over or overwrite the project's own `README.md`.
2. If an `AGENTS.md` already exists (other coding agents often read it), do not copy over it. Keep the project's copy
   outside the repo (an untracked backup trips `/gcaas-run`'s dirty check), put the package's in place, and carry the
   project's own rules into a final section after §13, which the other agents still read (the file then runs past 200
   lines by that section); a file that `CLAUDE.md` imports with a second `@` line suits only rules that Claude Code
   alone needs. Show the operator any rule that contradicts §1 or §5; the merge is their decision.
3. If a `CLAUDE.md` already exists, do not overwrite it. Append the single line `@AGENTS.md` unless it is already
   there, and keep what it already said.
4. If a `.claude/` folder already exists, merge. Every `gcaas-*` file is new and collides with nothing standard; the
   four unprefixed files (`ROUTING.md`, `EDGE_CASES.md`, `BRIEFS.md`, `templates/COMPACT_PROMPT.md`) replace any
   older copies, except an existing `EDGE_CASES.md`, whose earned guardrails section merges back in.
5. Restart Claude Code in the repo root. Rung agents resolve against the folder the session started in. A newly
   created `.claude/agents/` folder is not picked up by a running session, and edits to a definition may not apply
   mid-session (`EDGE_CASES.md`, earned guardrails: the agent registry).
6. Verify by name, not by count, because the folders may be shared with other tooling:
   - the skills `gcaas-plan`, `gcaas-run` and `gcaas-status` exist under `.claude/skills/`, the first two with a
     `briefs.md` beside their `SKILL.md`;
   - the four `gcaas-*` agent files exist under `.claude/agents/`;
   - `CLAUDE.md` contains exactly one `@AGENTS.md` line.
7. Dispatch one trivial read-only task through `gcaas-sonnet-high` and see a result come back. "Agent type not found"
   usually means a malformed frontmatter value or a session started outside the repo root; check the `effort` and
   `permissionMode` values first, check the start folder, then restart again.

Requirements:
- Tested on Claude Code 2.1.285 under Windows 11; use that version or later. Older versions are untested for
  per-helper effort, and other systems are untested: the helpers' briefs tell them to use Claude Code's PowerShell
  tool. The Agent tool must be available to the session; workflows are not used.
- Optional: the Firecrawl CLI, which research helpers try first; without it they fall back to WebFetch and say so.
- Optional: `autoContinueAtUsageLimit` on, so a run that hits a usage limit can wait for the reset and go on by
  itself; it works only in an interactive subscription session (`EDGE_CASES.md`: usage-limit auto-resume).
- Optional launch variables. `/gcaas-run` asks for the foreground on every helper call where the Agent tool offers
  that choice, so a batch of builders or checkers completes inside one turn instead of waiting on completion notices
  (a live run did so); some hosts offer no such choice and some interactive sessions background a helper anyway, and
  `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` set at launch prevents that, so it is the setting to prefer for a long
  unattended run. `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` is needed for a headless `claude -p` run whose helpers do
  run in the background, which otherwise ends them after 600 s of idle (`EDGE_CASES.md`: headless).

Global install, for every project on the machine: copy the `gcaas-*` skills and agents into `~/.claude/skills/` and
`~/.claude/agents/`, then restart. `AGENTS.md` does not go global: each repo still needs its own `AGENTS.md` and the
`@AGENTS.md` line. Keep `.claude/ROUTING.md`, `BRIEFS.md`, `EDGE_CASES.md` and `templates/` per repo too, because
`AGENTS.md` cites them by that path. A global skill wins over a project one (`EDGE_CASES.md`: skill precedence), so
install the skills in one scope only, and re-copy the global ones after every update.

## 4. Commands

| Command | What it does | Use it when |
|---|---|---|
| `/gcaas-plan` | Fit check, alignment Q&A, recon, a draft the session writes and one fresh plan checker attacks, then a plan of tracks and waves with contracts and a ledger. Ends at an approval stop. | The work spans more than one file or 50 lines, or you are unsure of the design |
| `/gcaas-run` | Reconciles state, then runs the plan wave by wave until done: per track a builder, the session's own test run and git checks, a fresh checker, a commit by explicit file list. | The plan is approved |
| `/gcaas-status` | Explains in plain words, in the chat: a short table of what is done, active and upcoming, a brief, then each open decision explained and asked through the Q&A tool, with your answers logged. | You return to a run, want to know where it stands, or owe answers |

Small work needs none of these. The agent makes a mini-plan, the change and the check inline.

The agent also picks the lightest execution route for each job (`.claude/ROUTING.md` section A):
- Inline: a few tool calls, every decision, and talking to you.
- One subagent: one bounded job, such as reading many files or one research question, so its working set stays out of
  the main session's context. Never for two or three tool calls, because each helper starts with about 46-66k tokens
  of fixed context (`EDGE_CASES.md`: fixed context per helper).
- Parallel subagents: two to four independent lookups where you need answers, not verification, or the builders and
  checkers of up to four truly separate tracks in `/gcaas-run`.

You can steer it in words ("just check this yourself", "use one helper for it").

## 5. Presets

Say the word in your request. With no word, the default applies. Presets change which rung each helper runs on and
when the closing review runs (never on quick; on default when a track was high risk or failed once; always on
rigorous); every other check is the same.

| Preset | Rungs | Checking |
|---|---|---|
| quick | Sonnet high builders (calibrated with the full edition's builder brief, `ROUTING.md` section E: the same results on small tasks, fastest and cheapest; not re-measured with this edition's brief); Opus high checkers; Opus high plan checker; Sonnet high docs editor | The builder writes failing tests, then the code; a fresh checker runs the checks and probes edge cases |
| default | Opus high builders and checkers (Opus xhigh checker on a high-risk track); Opus xhigh plan checker; Sonnet high docs editor | As quick, plus a closing review of the whole diff when a track was high risk or failed once |
| rigorous | Opus high builders; Opus xhigh checkers and plan checker; Opus high docs editor; a closing reviewer at Opus xhigh, always | As default, with the stronger checkers and the review on every run |

Two table cells of `ROUTING.md` have no rung of their own (the quick docs editor at sonnet/medium, the rigorous plan
checker and reviewer at opus/max): they run on the nearest rung and the run records the deviation once. The agent may
deviate from a cell for one helper, with a one-line reason recorded in the evidence.

## 6. How a run flows

```
/gcaas-plan   triage -> recon (code map, coupling map) -> alignment Q&A (hardest question first)
            -> the session drafts the plan of tracks and waves -> one fresh plan checker attacks it
            -> findings addressed or declined (declines shown to you) -> plan + ledger on disk -> APPROVAL STOP
            -> your yes logged -> COMPACTION STOP: the plan is done and nothing is built yet
/gcaas-run    reconcile -> preflight (clean tree, no open decisions, the suite's known failures) -> branch gcaas/<name>
            before each helper batch: commit the run's control files (plan, ledger, decisions, resume notes)
            wave 0: the seam (shared interfaces, their tests green); then each next wave, in batches:
              up to four side-by-side tracks, or one: builders -> tree checks (branch and HEAD unchanged,
              control files unchanged, no stray writes, every test file present) -> the session runs each
              track's tests and done commands -> snapshot -> fresh checkers -> late-edit check
              -> commit each passed track by explicit file list; undo each failed one (patch saved, retry)
            wave end: the full suite once against the known failures; new failures -> one re-run -> revert or stop
            -> next wave, without asking
            -> findings wave (checker follow-ups) -> closing step: docs sync, and a review in rigorous, or in
               default when a track was high risk or failed once -> COMPLETION
```

After your yes, `/gcaas-plan` logs the approval and ends with 🟡 COMPACTION: the plan is proven and on disk, and the
build has not started. Start it with `/gcaas-run <plan name>`, cheapest in a fresh session or after `/compact`, so the
build does not carry the planning context.

The run keeps going. It stops only for an approval, a block, a question only you can answer, completion, or real
context pressure, and it writes its state to disk first. Helpers run in the foreground where the Agent tool offers that
choice: a batch's builders or checkers run side by side, the checks start when the last one is back, and the batch
completes within one turn; leave the repo alone meanwhile, since a track whose files change after its checker saw them
is not committed. When a session runs the helpers in the background instead you see ⏳ HANDS OFF, and each completion
notice resumes the run (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` at launch prevents that). A failed track gets at
most five attempts in total, each retry one rung up (Sonnet high, Opus high, Opus xhigh), and each retry of a code
failure starts from a red test that reproduces it. A track reverted at wave end because the new failures map to it
first reproduces the recorded suite failure (after a crash right after the revert, its verdict names only the
reverted commit, so its retry is briefed with that and no failing file). When they map to no track, the run stops
with 🛑 and hands you the failures and the wave's commits: this edition never peels commits to find the culprit.

The control files under `gcaas-ops/<name>/` (`PLAN.md`, `LEDGER.md`, `DECISIONS.md`, `RESUME.md`) hold your
approvals, so the run commits them before every helper batch and at the end of each turn that leaves no helper
running (keep `gcaas-ops/` out of `.gitignore`). A batch halts if one is uncommitted at its start, and ends without
committing if one changed while helpers ran, since a helper could have forged an approval there; only the `evidence/`
folder may change, and a retry brief quotes none of it: a track reverted at wave end has its failing files and the
failure line in its ledger verdict, a control file. One exception: when a crash lands right after the revert, before
that verdict is written, the next start finds the reverted commit and writes a verdict naming that commit alone, with
no failing files; that retry is briefed from it alone. Keep other plans' folders committed too, except their raw pages
and `*.patch` files, which you move out instead. After every helper batch returns, and on resume, a change to a
control file outside the run's own control commits (which include the answers `/gcaas-status` logs for you),
committed or not, is treated as foreign: the agent stops and asks. At plan time likewise, a `DECISIONS.md` row the
agent did not write is shown to you before anything builds on it.

At wave end only new failures count, measured against the known failures: the test files that already failed at the
last measurement that passed (the run's start, then each wave end), so a test fixed during the run is protected from
then on, and a test red at the start may stay red through to completion. A starting failure that passes once drops
out of the record the same way, so a later flake of it counts as new. New failures first get one re-run to rule
out a flake. If they persist and every failing file belongs to a track that committed in this wave, those commits are
reverted by new commits and the tracks retry; if a failing file belongs to no track, or the tree holds stray writes,
the run stops with 🛑, and the next start measures the suite again before anything else. If HEAD moves during a
batch, another session is at work in the repo, and the
loop stops. Every batch leaves an audit file, `w<wave>-b<batch>-orchestrator.md` under `evidence/`, with each check,
its command and its exit code.

## 7. The six stops

Every turn of a looped run ends with exactly one stop line.

| Stop | What it means | What it asks of you |
|---|---|---|
| ⏸️ APPROVAL | The path is clear and only a yes is missing. | One decision, scoped to the named action |
| 🛑 BLOCKED | A yes will not fix it. Something must be fixed or investigated first. | Fix the thing or supply what is missing; do not answer with an approval |
| 🟡 COMPACTION | The work so far is proven and recorded; the context needs a refresh. | Compact with the block in section 8, then re-kick with `/gcaas-run <plan name>` |
| 🔵 HANDOFF | You must do or answer something beyond a yes. | Do the named step or give the answer |
| ⏳ HANDS OFF | Waiting on something that is not you: a batch of helpers, a limit reset, CI. | Nothing while it runs, except answering any permission prompt its helpers raise (the run pauses for it). A helper's completion notice can fail to arrive, so if nothing comes back long after it should, run `/gcaas-status` and then `/gcaas-run` |
| 🟢 COMPLETION | Every part of the work is proven done. | Review, then close the plan |

The discriminator, in three lines:
- Does a yes from you clear it? Approval. Must something be fixed first? Blocked. Must you do or answer more than a
  yes? Handoff.
- Is it waiting on something that is not you? Hands off. Is the work proven and only the context spent? Compaction.
  Is everything proven done? Completion.
- Unproven work with the context spent is never compaction; it is hands off when something restarts the session,
  else handoff.

A host harness that recognises fewer stop types wins: the agent prints its nearest equivalent, and never ⏸️ for an ask
a yes alone cannot answer, because a host may approve ⏸️ by silence. `.claude/EDGE_CASES.md` has the detection and
per-host mappings.

## 8. Paste-ready replies

Fill the `<angle brackets>` and paste. Each approval names its action and bounds it to this run, because a bare "yes,
go ahead" is read as a standing yes.

**Compaction.** Open `.claude/templates/COMPACT_PROMPT.md`, select from `/compact` to the last line, and paste it. It
is multi-line on purpose: a multiline paste arrives through the paste chip (`[Pasted text #N +M lines]` is your proof
it arrived whole), while one long line can be truncated in some terminals. A compacted session does not resume by
itself: then type `/gcaas-run <plan name>`, or your own kickoff prompt for other work.

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

**Status check.** Type `/gcaas-status`, or ask in your own words ("explain the progress", "explain the open
questions"). It reads the files on disk, so it works in a fresh session too, and answers in the chat, never in a
file. It explains each open decision, asks it through the Q&A tool, and logs your answers for `/gcaas-run`; it writes
nothing else, and nothing while a batch runs. With several plans on disk, name one: `/gcaas-status <plan name>`.

## 9. Updating

Replace the package files with the newer ones, with three exceptions. `CLAUDE.md`: keep yours; it needs only its one
`@AGENTS.md` line. `AGENTS.md`: carry everything after §13 (the project's own rules from install step 2, if it added
any) into the new file after its §13. `.claude/EDGE_CASES.md`: the guardrails your own runs earned live there, so
diff it and merge them back in at the end of the list (the skills and docs cite items by topic, so numbers may
shift). Local edits to an installed skill or agent get no backup, so keep them under version control. After an
update, restart Claude Code and re-run the by-name check in section 3.

## 10. Deliberately not included

- Settings, hooks, permission rules and MCP configuration. They are environment-specific and security-sensitive, and
  `AGENTS.md` makes each one an operator-approved edit. A package that shipped them would be granting itself
  permissions.
- Routing above opus. Models are the aliases `opus`, `sonnet` and `haiku`. A stronger model runs only when you ask
  for it by name, and then as the session's own model or through an agent definition you approve (a governance
  edit), since no `gcaas-*` rung names another.
- Per-track copies, worktrees and merge paths. Tracks the plan proves truly separate build side by side in the same
  folder; everything else runs one builder at a time.
- Everything the full edition does in code (section 11): locked tests written by a separate test writer, test
  adversaries, the peel of unmapped failures, the multi-lens review with its refute pass, the research command with
  per-claim verification, and schema-checked helper returns.

`extras/` is optional and is not copied by the install steps. It holds the `gcaas-tooling-install` skill with its
`validate-catalog.ps1` validator and a catalog template, an `INIT_CHECKLIST.md` for a first-time machine setup, and
`PROTOCOL_TEMPLATE.md` for a live-service protocol file. Copying the folder loads nothing: to use an extra, follow the
install table in `extras/README.md`. A repo that touches a live service needs a protocol file started from
`PROTOCOL_TEMPLATE.md`, which `AGENTS.md` §11 cites.

## 11. Lite or full

The full edition runs the same plan format, records and commands, but its planning, building, review and research
loops are saved workflows (`gcaas-plan-draft`, `gcaas-wave`, `gcaas-review`, `gcaas-research`): code that dispatches
the helpers, checks scope with a matcher, locks tests by hash, and computes verdicts. Lite moves that work into the
main session as written steps, so it needs no workflows. A plan made by either edition runs under the other.

What lite gives up, in plain words:
1. The guards are prose. A main session under context pressure can skip a written step; a script cannot. Every batch
   leaves an audit file that makes a skipped step visible, but nothing prevents it.
2. No locked tests. The builder writes its own tests, so weak tests can pass weak code; only the checker's judgement
   and its own probes stand against that.
3. No test adversary. Edge cases come from the builder and the checker's probes, not from a third agent.
4. A thinner closing review. One reviewer holds all four lenses in one context, with no merge and no refute pass:
   less coverage and more false Majors, each costing a findings-wave track.
5. A thinner plan review. The session that aligned with you also drafts the plan; one checker attacks it and no judge
   refutes the findings; the drafter rules on them, and every decline is shown to you in the approval brief.
6. No peel. A new failure that no track's tests own stops the run for you instead of being bisected by reverts.
7. No return schemas. A malformed helper return is a failed attempt, not a retried call.
8. No case folding. Scope matching is git's own and case-sensitive, so a file written under another case of an owned
   path reads as a stray write and stops the run: a false stop, rare because Windows keeps an existing folder's case.
9. A heavier main context: more compactions, and part of the cost shifts to the priciest rung.
10. A coarser ladder: three rungs, no Sonnet at xhigh, nothing at max.
11. Research without verification by default and no evaluate mode; a claim a decision rests on gets one verifier.
12. More helper rounds. Two per batch (builders, then checkers) where full has one workflow per wave; when a session
    backgrounds them anyway, a completion notice that never arrives needs you (`/gcaas-status`, then `/gcaas-run`).
Equal in both: an unreported write across tracks, or a write to a gitignored path or under `.git/`, stays invisible.
Stronger in lite: the session runs each track's tests and done commands itself before any checker is paid for, and a
snapshot before the checkers removes the window in which a file could change after its check.

Helper counts, estimated from the code and not yet measured on a run: for a plan with a seam, two side-by-side tracks
and one more track, default preset, everything passing first time, full dispatches about 26-28 helpers and lite 10-11;
each retry adds about 6 in full and 2 in lite, and the full suite runs about once per wave in lite against twice per
wave in full. Each helper carries 46-66k tokens of fixed context before it starts. Part of the saving moves into the
main session, which in lite runs many more tool calls per wave.

Pick full when workflows are on and tokens are not the binding constraint; when the work touches auth, payments,
cryptography, schemas or other high-risk code, where locked tests, adversaries and a refuted multi-lens review earn
their cost; when waves are wider than four parallel tracks or the plan is long, since code guards do not drift as the
main context grows; when the run is long and unattended; or when the question needs `/gcaas-research` with
verification. Pick lite for small and medium plans, cost-sensitive work, plans with workflows off, and whenever you
want to read every guard as a plain step.

## 12. Provenance

- Distilled from a multi-month build of a coding-agent operating package, then reduced to written steps.
- It is organised around one dispatcher (the main session), parallel tracks that are truly separate, model routing by
  a lookup table, and git as the guard.
