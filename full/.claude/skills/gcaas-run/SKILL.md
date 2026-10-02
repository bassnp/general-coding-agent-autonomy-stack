---
name: gcaas-run
description: Runs an approved gcaas-plan wave by wave until it is done, with reconcile, preflight, one gcaas-wave workflow per wave, the ledger, retries with escalation, a closing docs pass and review, and the stops. Use when the operator says "run the plan", "start the run", "continue the run", "keep going", "resume the run" or /gcaas-run.
---

# gcaas-run: run an approved plan until it is done

You orchestrate: you dispatch, adjudicate and record, and never write product code here; test writers, builders,
validators and editors do, through `gcaas-wave` or a rung agent. `<root>` is the absolute project root from
`git rev-parse --show-toplevel` (forward slashes), `<ops>` is `<root>/gcaas-ops/<NAME>`, and workflow paths are
absolute. Only you write the control files `PLAN.md`, `LEDGER.md`, `DECISIONS.md` and `RESUME.md` in `<ops>`
(EDGE_CASES: the controller's own records), save the operator's answers that `/gcaas-status` appends (below), yet a
helper could forge a MADE row there. So on `gcaas/<name>`, make a control commit whenever you write them, before each
dispatch (`gcaas-wave`, `gcaas-review` or a rung agent) and at the end of each turn that leaves no helper running.
First `git check-ignore --no-index -- <the five record paths>` (the files `<specs>` names below; no `-q`, which takes
one path) prints nothing and exits 1: none is ignored. Any printed path or other exit → 🔵 HANDOFF STOP naming it,
since `.gitignore` covers a run record and the listing below would leave it out in silence. List the files with
`git ls-files --cached --others --exclude-standard -- <specs>`, then
`git add -- <that list>`; when `git diff --cached --quiet` then exits 0 nothing changed, so skip the commit; else
`git commit -m 'gcaas(<name>) control: <what>' -- <that list>` (`<what>` in plain words, no quotes or apostrophes).
`<specs>` names the four control files and `PLAN.draft.md` as paths from the root, then
`':(glob)gcaas-ops/<NAME>/evidence/*.md'`, never a glob over `<ops>` itself, so a stray file there is never swept into
a control commit; `add` and `commit` take the listed paths, since one pathspec that matches nothing aborts them.
Write and commit none while a helper runs. When it returns, and before you write one or log the operator's answers, run
`git diff --name-only <the sha it started from> -- <the four files>`: any output is foreign (§2). `/gcaas-status` may
also log the operator's answers in `DECISIONS.md` between your turns, never while a run recorded in
`<ops>/evidence/runs.md` may still be out, with the same control commit: take those rows as the operator's.

Keep going: once a wave is recorded, start the next in the same turn. End each turn with one of AGENTS.md §5's six
stop lines, the state on disk first; ask through the Q&A tool (AskUserQuestion) when offered, else in plain words.

## 1. Fit check

- The plan is `<ops>/PLAN.md`; its one fenced json block holds the tracks and is the machine source.
- Take NAME from the operator's words. With one unfinished plan on disk, use it; with several, ask which.
- No `PLAN.md` → if `git branch --list 'gcaas/*'` shows its run branch, 🔵 HANDOFF STOP asking the operator to switch to
  it; else say "No plan found for this; run /gcaas-plan first." and stop, with no stop line: no run has started.
- No Workflow tool (workflows off) → 🔵 HANDOFF STOP: turn workflows on in `/config`; there is no inline route.

## 2. Reconcile, on every start and every resume (AGENTS.md §8)

Read first, in parallel: `LEDGER.md` against `PLAN.md`; `DECISIONS.md` (append-only: a key is open when its last row is
PENDING or AWAITING-YES); `RESUME.md` (base, preset, questions held, owed suite runs, the run's first baseline);
`evidence/runs.md` (run ids) and the newest evidence; `claude --version` (record it); git branch, HEAD, `git diff --stat
HEAD`, and `git status --porcelain` only for untracked files (EDGE_CASES: `git status` after EOL normalisation).
- A committed control file changed outside your control commits is foreign: uncommitted, or in a commit since the
  base not yet ruled on (`git log --format='%h %s' <base sha>..HEAD -- <the four files>`). After an earlier session's
  wave with no recorded result, any commit touching them since its start sha (`evidence/runs.md`) is foreign whatever
  its title, and on a first start a `DECISIONS.md` row whose key starts `approval`, `drop`, `foreign` or `commands` is
  foreign, since those arise only in a run. Write and commit nothing, end with 🔵 HANDOFF STOP showing the diff, and
  trust none until the operator rules keep or restore in their own words. On restore, first
  `git checkout <your last control sha> -- <file>` (on a first start, delete the foreign rows). Then, on either ruling,
  log it (MADE `foreign <sha or uncommitted>: <keep|restore>`) and make a control commit.
- Never re-dispatch a wave that may still be running (its run id, the task list) or message its agents (EDGE_CASES:
  host restarts). A workflow resumes only in the session that started it (EDGE_CASES: resume): an earlier session's
  unrecorded wave is rebuilt from git and its evidence as for a halt (§6). Then say: position, in flight, next action.

## 3. Preflight

Check in this order; the first stop that applies ends the turn.
- No MADE `plan approval`, or an open `commands` decision → ⏸️ APPROVAL STOP naming it and the exact action; an open
  PENDING one → 🔵 HANDOFF STOP naming the question; an open `approval <id>` holds only its track (§5). Plan approval
  clears only on the operator's explicit yes to this plan in their own words (logged MADE), never on a pasted re-kick
  text.
- Ledger rows that do not match the plan's tracks (missing, extra, another wave) → 🛑 BLOCKED STOP with the mismatch.
- A track missing a contract field /gcaas-plan step 7 requires, or no suite (fast, full) → 🛑 naming both.
- A working tree dirty outside `<ops>/evidence/`, a first start's own untracked plan files aside → 🔵 HANDOFF STOP
  naming the paths. Other plans' folders under `gcaas-ops/` count, since `gcaas-wave` halts on them: the operator
  commits them on their branch or moves them out (raw pages and `*.patch` files: move them out, never commit them).
  Never stash, reset, commit or build over the operator's work (EDGE_CASES: a dirty tree).
- Then, on a first start, record the current branch and its HEAD sha in `RESUME.md` as the run's base (a resume keeps
  them), check out `gcaas/<name>` (the plan's `name`), creating it from that HEAD when it does not exist, and commit the
  control files there, so the `commands` row below is not foreign on the next start (§2).
- The operator's MADE `plan approval` clears the project's own commands the plan names: suite.fast, suite.full, each
  track's tests.command and done commands, and the test adversary's runner form; as its brief said, it also covers the
  helpers' own small checks on a track's code and the repo's git hooks on commit. Any other command (an install, a
  setup or build step, a fix in §6, a findings-wave command on a runner the plan does not use) first gets its own
  `commands <what>: <list>` AWAITING-YES row (its own key) and a ⏸️.

## 4. Preset and routing

- Preset: the run request's (quick, default or rigorous), else this run's in `RESUME.md`, else the plan's in
  `DECISIONS.md`, else default; record it in `RESUME.md`. Any preset fits: each track has room for an adversary's file.
- `routing` = { role: { model, effort } } from `.claude/ROUTING.md` §B, both always (EDGE_CASES: effort inheritance),
  for committer, builder, validator, test_writer and test_adversary (`gcaas-wave`), and editor, reviewer and judge
  (`gcaas-review`); pass every role a call uses, since a workflow refuses a missing one. A track that deviates from a
  cell runs in its own call (§5), with a one-line reason in its evidence.

## 5. The loop

1. `LEDGER.md` uses only these status words: pending (not run), done (PASS, its commit on the branch), retry (FAIL under
   five attempts), held (waits on an answer or a YES), blocked (five attempts failed), uncommitted (PASS with no
   commit), dropped (a MADE `drop <id>`). ▶ Current wave is the lowest wave with a track not done or dropped.
2. A track is ready when it is pending, retry, or held with its answers (MADE `answer <id>` rows) or YES now MADE (the
   answer goes to `<ops>/evidence/answer-<id>.md` and into its `prior_evidence`), and every `consumes` entry that
   matches an earlier track's `provides` comes from a done track. Take the lowest wave with a ready track; tracks that
   are not ready wait.
3. A ready track whose `approval` is not `none` runs only on a MADE yes with the key `approval <id>` (AGENTS.md §5).
   Without one it is held: append `approval <id>: <exact action>` as AWAITING-YES once, and ask at the stop in §6. The
   operator's yes covers that action in this run only; on a no, drop it and its consumers (MADE `drop <id>`) or replace
   it. `gcaas-wave`'s helpers reach no live service, so a run never deploys: a deployment follows it under AGENTS.md §5.
4. `gcaas-wave` args: { root, ops, name, branch, wave, preset, routing, suite { fast, full }, tracks }, without
   `max_inner_attempts` (at most two tries per track per call, fewer near five; `attempts_used` counts them). Each track
   is its plan contract plus `attempt` (its total so far + 1) and `prior_evidence` (every earlier path). A wave's ready
   pending tracks share one call; a retry track runs alone, with its plan `wave` and escalated cells (§6).
5. Write `RESUME.md` (wave, tracks, preset) and make a control commit; call the Workflow tool with the saved workflow
   `gcaas-wave` and the args; append `wave <n> | <run id> | <that commit's sha>` to `<ops>/evidence/runs.md`, and append
   `<run id> returned` there when it comes back (§6). End the turn with ⏳
   HANDS OFF STOP: "gcaas-wave wave <n> (<track ids>) is running; its completion notice resumes this run (no fixed
   time)."

## 6. On completion

Check the control files first (the header). After a foreign change or `head_moved`, record the result in evidence only
and write or commit nothing until the operator answers (🔵 as in §2, or 🛑 below). Otherwise record, then decide: update
each returned track's ledger row (status; attempts, the earlier total plus `attempts_used`; evidence paths; verdict) and
▶ Current wave; after the first wave, write its `baseline.failing` with its `head_start` (the sha the baseline suite
ran at) to `RESUME.md` as the run's first baseline, so a resume can tell which commits follow the measurement.
- PASS with a non-empty `commit` → done; its `questions` wait in `RESUME.md` for the next held round or the close brief.
  With an empty `commit` → uncommitted: commit it as for a halt, or with no owned change, hold it and ask.
- A `reverted` track with failure_class unclear was peeled (no track's tests own the wave-end failure; its concern names
  the clash): hold it for the operator's decision (which track changes, or a re-plan), then retry it unescalated.
- Otherwise, FAIL under five attempts → retry one step up `ROUTING.md` §C for the role that failed (builder, or test
  writer when its step failed), from the route its last try used (its concerns name it, else its call's starting route):
  missed_case or unclear, effort +1; wrong_approach, sonnet moves to opus at the same effort, opus goes effort +1, to
  the role's cap. A test adversary's own scope or tamper fault takes no step, nor does environment: fix what you can
  and re-run once at the same cells (it counts toward the five); 🛑 with the fault when it repeats or needs the
  operator.
- FAIL or BLOCKED at five attempts in total → blocked: 🛑 BLOCKED STOP with its evidence and three choices: drop
  it and its consumers (MADE `drop <id>`), replace it by a new id at 0 attempts (§7 or /gcaas-plan), or end the run.
- On a track that did not pass, BLOCKED verdicts from helpers, `questions` and concerns that need a decision → held, the
  questions in `RESUME.md`; the rest keep running. When nothing else can run, ask everything held in one round:
  ⏸️ APPROVAL STOP when only approvals are open, else 🔵 HANDOFF STOP naming every answer and approval the operator
  owes.
- `head_moved` → 🛑 at once: another session committed here; reconcile against git and ask (EDGE_CASES: HEAD moving).
- `stray_writes` → 🛑 with the list, and a suite.full re-run owed in `RESUME.md` (it ran with them). Once the operator
  resolves them, run it: a failing file not in the wave's `baseline.failing` → 🛑 naming it and the tracks whose globs
  match it.
- `suite.status` red with `new_failures` left after the reverts, or `not_started` → 🛑 at once with the command,
  failures and excerpt; a re-run is owed in `RESUME.md`. `baseline` failures never stop a wave, but 🟢 needs suite.full
  to fail nothing beyond the run's first baseline. A `flaky` suite (its re-run passed) is only recorded.
- A thrown call or a returned `error` → record it in the evidence, and in `RESUME.md` unless a control file changed:
  - A preflight halt the operator must settle stops at once: a dirty tree, files suite.full writes or rewrites, or the
    wrong branch → 🔵 naming the paths; suite.full could not start or is red naming no file, or the helper reported a
    HEAD that is not a git sha → 🛑 with the excerpt. A control file uncommitted at preflight or changed during the wave
    is foreign (§2); once the operator has settled it, re-run the wave after a preflight halt, or recover as for a halt
    past the Tracks phase after a wave-end one.
  - After a halt past the Tracks phase (survey, commit or revert helper without a result, or a survey or commit
    helper that reported a HEAD that is not a git sha, when commits may have landed) or a `commit failed` concern,
    stage and commit a passed track's uncommitted owned files outside `gcaas-ops/` by pathspec (add
    `':(exclude)gcaas-ops'`) as `gcaas(<name>) w<wave> <id>`, then read git: a track is done only when that commit is on
    the branch, not reverted (else retry). Run suite.full once and compare its failing files with the wave's
    `baseline.failing` (a new one → 🛑); never rebuild validated work.
  - Otherwise fix the cause and re-run the wave, each track's total first set from the highest `a<k>` in its evidence
    file names, or the ledger when higher (a track at five is blocked instead); after five runs, 🛑 with the error.

## 7. Findings wave

After the planned waves, turn validator and builder follow-ups into small tracks in the reserved findings wave, each
with a full contract that passes /gcaas-plan step 7; drop duplicates and work already done; `parallel_ok` only as in the
plan (disjoint owned paths, independent checks, no shared build step, port, database or fixture, `why_parallel` set). A
follow-up outside the plan's scope goes to the operator. Add the tracks to `PLAN.md`'s json block and the ledger,
confirm each contract can be met (EDGE_CASES: unsatisfiable contracts), clear new commands (§3), and run it; an empty
findings wave is skipped. It runs once per close; its own tracks' follow-ups go to the operator in the close brief.

## 8. Close

1. Docs: one editor on the rung nearest the editor cell (reason recorded) gets the docs to check and `git diff
   <base>..gcaas/<name> -- . ':(exclude)gcaas-ops'` (`<base>`: base sha); it fixes falsified words in place, nothing
   else. It may run in the background (⏳ naming it meanwhile, recorded in `<ops>/evidence/runs.md` as in §5); then
   commit by pathspec only when `git diff --stat` shows doc paths alone. Its second key: the review below or, with none,
   a fresh `gcaas-opus-high` validator per edited sentence.
2. Review, in rigorous always and in default when a track was high risk or failed once: the Workflow tool with
   `gcaas-review` and { root, ops, target: { kind: "diff", ref: "<base>..gcaas/<name>" }, preset, routing, may_run:
   true, out: "<ops>/evidence/review-close-<k>.md" } (the operator's plan approval covers running the target's code;
   `<k>` counts closing reviews; default `lenses`), then record it and ⏳ as in §5. A surviving finding whose id starts
   with L is a lens gap: re-run the review, as after a thrown run or a null `report_path` (recorded, its cause fixed);
   each re-run counts toward five, then 🛑 (none is a second review). Surviving Majors → a findings wave and close
   again; twice → 🛑.
3. 🟢 COMPLETION STOP only when every track is done or dropped by a MADE row and no suite re-run is owed, else 🔵, with
   a clear table (track, wave, attempts, status) and an explained brief in plain words: what was built, what failed and
   how it was fixed, follow-ups not built, the harness version, and the untracked raw pages and `*.patch` files left in
   `<ops>/evidence/` (another plan's run halts on them until the operator moves them out). Offer, through the Q&A tool,
   a local merge of `gcaas/<name>` into the start branch in `RESUME.md`, merging only on the operator's yes; pushes
   follow AGENTS.md §5.

## 9. Context pressure

On real signs of context degrading (AGENTS.md §8), write `RESUME.md` (not during a wave): position, in flight (with the
run id), next action, questions held. Then end with AGENTS.md §5's stop: 🟡 COMPACTION STOP when every finished wave is
recorded, nothing in flight; otherwise ⏳ HANDS OFF STOP when something restarts the session on its own, else
🔵 HANDOFF STOP naming the compact (`.claude/templates/COMPACT_PROMPT.md`) and the re-kick text in `RESUME.md`.
