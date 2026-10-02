# Edge cases and earned guardrails

The package's main list of known traps and fixes; ROUTING.md §D and BRIEFS.md add role-specific ones. Read the matching group before
you plan, route or brief a helper. Each item gives a trap, its fix and a source tag: verified here (on the test machine: Windows
11, Claude Code 2.1.285, 2026-09-29), docs, #N (an issue, open unless noted), process history (real campaigns), public write-up,
study, design (the author's choice). Re-check docs and #N items after each harness update; a fixed issue retires its item.
Sources, all read 2026-09-29: docs are the Claude Code pages under https://code.claude.com/docs/en/ (sub-agents,
model-config, hooks, prompt-caching), its changelog, the Anthropic pages ROUTING.md §F lists and, for item 27, Firecrawl's CLI
skill; #N is https://github.com/anthropics/claude-code/issues/N; the study is Geng and Neubig, "CAID",
https://arxiv.org/html/2603.21489v2; the write-ups are "Building a C compiler with a team of parallel Claudes",
https://www.anthropic.com/engineering/building-c-compiler, and "Rewriting Bun in Rust", https://bun.com/blog/bun-in-rust.

To add a guardrail, append one numbered item under "Earned guardrails": what was believed, what the executed evidence showed, and
the date it was observed. The agent appends it and names the new item in its report; no YES is needed (AGENTS.md §5).

## Detection and per-host mappings
Check once per session (AGENTS.md §5: a host that recognises fewer stop types wins). No host is mapped in this release. A
mapping names how to detect the host (for example a `TERM_PROGRAM` value it sets; any other value, or none, means not hosted by
it), the stops it recognises, and what prints in place of each missing one. The pattern, from an engine that recognised five stops,
⏸️ APPROVAL, 🛑 BLOCKED, 🟡 COMPACTION, 🔵 HANDOFF and 🟢 COMPLETION (no ⏳), and whose watchdog stopped an armed run whose turn ended on
any other: a hands-off wait prints as 🔵 HANDOFF, an ask a YES alone clears as ⏸️ APPROVAL, and anything else the operator
must do or answer as 🛑 BLOCKED, since such a host's veto window can approve a ⏸️ by silence, never a 🛑. [design]

## Model and effort routing
1. A helper with no effort inherits the session's effort (max in a max session). Set model and effort on every helper,
   chosen from ROUTING.md. The Agent tool takes no effort, so every subagent gets both from a `gcaas-*` rung agent.
   [docs; verified here: per-call effort held]
2. `CLAUDE_CODE_EFFORT_LEVEL` overrides skill and agent effort (per-call untested) and makes max persistent, flattening every tier:
   leave it unset. [docs]
3. A top-level `effortLevel` in user settings does not apply to Opus 5.5; per-model `modelSettings` or `/effort` does. `max` is
   accepted in neither key, only per session or per call. [docs; verified here: settings read]
4. Aliases move with releases (today opus is Opus 5.5, sonnet Sonnet 5.5, haiku Haiku 4.5); `opus` resolves to the session's exact
   model (its `[1m]` variant included) when that is an Opus, so an older-Opus session runs the older Opus. Re-probe each release
   (ROUTING §D). [verified here; docs]
5. Leave `ANTHROPIC_DEFAULT_HAIKU_MODEL` unset so Haiku 5.5 arrives with no edits. Haiku 4.5 has no effort parameter and Haiku 5.5's
   is unknown; the haiku rung and a per-call `effort: 'low'` pass it anyway: on Haiku 4.5 both run with no effort recorded.
   Re-check on Haiku 5.5. Haiku 4.5 retires no sooner than 2026-10-15. [docs; verified here]
6. Thinking cannot be turned off on Opus 5.5 or Sonnet 5.5, so "quick" can only lower effort. [docs]
7. Effort is not monotonic: Opus 5.5 peaks at xhigh on TB4 (high to max tie within ±2.6 SE) and at medium on FrontierCode (which
   penalises scope), where Sonnet 5.5 drops from 52.1% at xhigh to 46.2% at max for 13x the cost per task ($1.59 to $20.78 on
   Anthropic's chart). Never max a builder. [docs]
8. Sonnet 5.5 at max launches its own reviewers and drifts out of scope; a scope paragraph stopped it and cut cost by a third. At
   every level it adds unrequested tests and docs, so editor briefs state scope. [docs]
9. Low effort on 5.5 models skips the check: Sonnet sometimes reports a change done without running one, Opus edits before building
   or reproducing. Use low only where the script itself runs the check. [docs]
10. Safety fallbacks: Opus 5.5 reroutes most cyber work to Opus 4.8 (whether the caller is told is unknown), and biology-flagged
    requests go to Opus 5 or are refused on Sonnet 5.5, so a security role may run on an older model (check /tasks). [docs]
11. On Opus 5.5 and Sonnet 5.5 with an API key or a subscription, changing effort mid-session keeps the prompt cache. On other
    models, on Bedrock, Google Cloud or a gateway, with `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` set or under HIPAA, the next
    request re-reads the whole history uncached (about 25x the cached read on Opus 5.5). [docs]

## Helper runtime
12. A helper takes no mid-run input and dispatches no helpers of its own: the skills, which run in the main session,
    are the only dispatcher, and approvals and questions go between dispatches (helpers return `questions`). A
    subagent launching subagents is unverified here and never relied on. [docs; design]
13. A background helper's completion notice resumes only the session that dispatched it, and background agents can
    die silently at a pause or compaction boundary. The on-disk ledger, git and evidence files are the durable state:
    a batch silent long past its expected time is reconciled from them (`/gcaas-run`, reconcile). [docs; #95076;
    #63023; #80249]
14. Usage-limit auto-resume needs an interactive subscription session with `autoContinueAtUsageLimit` (not -p, SDK, background or
    teammate sessions); outages needed a human "continue". Host restarts duplicate or misreport agents: a relaunch forked a session,
    two runners wrote one tree for ten minutes, and a "lost" verifier reported 14 minutes later. Never re-dispatch on a "lost" notice
    alone: list what is in flight, check the target path for partial output, stop a duplicate with `claude stop <id>` (a process
    kill may be respawned) and audit what racing copies committed. Fork mode (the interactive default) backgrounds a lone writer
    subagent unless `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` was set at launch. [docs; #91493; process history]
15. The skills send at most four helpers in one message, one Agent call each. The harness may cap concurrent helpers
    through an environment variable (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` is named in its issues; its default is
    unknown and it is unverified here), so the skills do not rely on it. [design]
16. Each helper carries 46-66k tokens of fixed context and parallel helpers each cache it: batch tiny tasks. [verified here]
17. A rung agent (`subagent_type`) resolves against the folder the session started in: run from the project root or
    install agents at user scope. [#80544]
18. Never SendMessage to a running helper (it can start a duplicate); wait for its completion notice. [#93797]
19. Per the docs SubagentStart hooks cannot block a spawn (#92311 measured exit 2 blocking one; untested here): no hook
    reliably gates a helper, so the guards are the written git steps of the skills. [docs; #92311]
20. A headless `-p` session waits only 600 s of main-thread idle for background helpers, then terminates them (a
    review died mid-report here): set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` first.
    `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, set at launch, runs helpers in the foreground, so a batch completes
    within one turn; the `/gcaas-run` waiting rules cover both modes. [docs; verified here: the ceiling]

## Writers, git and Windows
21. No per-track copies or worktrees (the package author's choice), so worktree-only traps are out of scope: interfering work goes in serial
    tracks. Harness worktrees failed here on path length (`core.longpaths` unset), branch from origin's default branch, not HEAD,
    stay on disk unmerged once changed, and can leave a `worktree-*` branch to delete after an ancestry check. [verified here; docs]

22. The Bash tool truncates commands near 8,181 characters and halves `\\`; Git Bash rewrites `ref:path` arguments whose ref has a
    `/` and whose path starts with `.`. Route path-heavy commands and deletes through PowerShell `-LiteralPath`. [#92543; #91771]
23. A personal skill overrides a same-named project skill: give package skills unique names (the `gcaas-` prefix). [#93075]
24. A web-research CLI can write into the current folder unless given an output path (Firecrawl's convention is `.firecrawl/` under
    the cwd), and a research API's plan may cap concurrent jobs. Always pass the output path; retry with backoff. [docs]
25. Agents sharing one checkout ran `git stash` and `reset --hard` on each other within about 2 minutes in a large port; a command
    whitelist fixed it (no git but committing one's own file, no build tools, no slow commands). Package builders run no git at all
    and the orchestrator commits by explicit file list. [public write-up: Bun]
26. A dirty tree blocks `/gcaas-run`: uncommitted edits would read as stray writes, and restoring a failed track would discard edits
    in its paths. Other plans' folders and untracked suite output count, so gitignore what suite.full writes (coverage and the
    like) before the first wave (the preflight halts when its suite.full run writes such files); only `evidence/` is exempt.
    Ask. The stray-write check sees only what git lists: writes to gitignored paths or under `.git/` (hooks, `info/exclude`)
    stay invisible, so it catches mistakes, not a helper set on hiding them. [design]
27. HEAD moving during a wave stops the loop: another session committing in the same repo means the wave's commits land on work it
    never saw. `/gcaas-run` checks HEAD after every batch, stops, reconciles against git and asks. A run branch rebased
    between sessions gives every commit a new sha, so the reconcile finds each `done` track off the branch and sets it
    `retry` (fail-closed: the tree holds work under shas the ledger never verified, and a retry that finds the work in
    place ends `uncommitted`, asked about at the next stop), so rebase `gcaas/<name>` only once the run is complete.
    [design]

## Parallel tracks
28. Parallel is not automatically faster: a controlled study (CAID) measured parallel agents 1.15-2.54x slower at 1.7-4.3x the cost,
    from merges and test gates. Gains come from breadth and overlapped retries when each unit has its own check, so only truly
    separate tracks build side by side. [study, partially verified]
29. One giant failing task defeats fan-out: 16 agents fixed the same bug and overwrote each other in a compiler build. Derive
    per-unit checks (failing tests, error groups, files) before fanning out. [public write-up: C compiler]
30. Hub and registry files (manifests, test lists, docs) collided even in nearly disjoint waves; one campaign found 7 of its 13 fix
    slices mid-run. Land the seam first, merge registry and doc edits in one step, reserve a findings wave. [process history]
31. The controller's records were the most-written files. Only the orchestrator writes the control files (PLAN.md, LEDGER.md,
    DECISIONS.md, RESUME.md), which hold the approvals (`/gcaas-status` only appends the operator's answers, the same way); a
    helper could forge one, so `/gcaas-run` commits them before every helper call, and a batch halts if one is uncommitted at its
    start or changed during it (then committing nothing). After every helper returns, and on resume, a change outside the
    orchestrator's own control commits, committed or not, is foreign: stop and ask. `/gcaas-plan` treats a `DECISIONS.md` row it
    did not write after its planning run the same way. [process history; design]

## Process lessons
32. First-attempt PASS was 70-77% in four of five campaigns (50% in the fifth), and lower once same-attempt repairs are counted;
    about 1.5 attempts per phase. The fresh validator caught security-grade defects the builders had called done: never merge
    builder and validator, and budget for retries. [process history]
33. Fixing before reproducing cost about 5 h (in a phase of 4.4M+ tokens): reproduce failures as red tests first. [process history]
34. Unsatisfiable or false contract prose was a top cause of FAIL: check a contract can be met before dispatch. [process history]
35. Line citations broke through their own edits: re-measure citations last. [process history]
36. The 400k per-helper cap forced mid-phase handoffs: size tracks under it at plan time. [process history]
37. The full suite (25-30 min) ran twice per attempt, builder and validator: use targeted test groups where the validator accepts
    them, and run the fast gates before dispatching a validator (skipping them once cost a 1 h review). [process history]

## Earned guardrails
38. A claim that an error path is reachable (what a catch swallows, what a regex strips) is a hypothesis: execute the failing input
    first (2026-06-09).
39. An operator gate covers the probes too: get approval before any live-write probe, even a rollback-guaranteed one (2026-06-09).
40. A client library's convenience path can swallow the server's error body (a `head: true` count query did): on an inexplicable
    failure, re-probe the verbose path and check the column or resource exists on that table before blaming the client (2026-06-09).
41. `git status --porcelain` lies after EOL normalisation: stale stat-cache entries show ` M` with no content change. Use `git diff`
    for truth and `git status` only to find untracked files (2026-08-03).
42. Testing propagation against a pristine target proves nothing: `git am` succeeds unmodified and fails diverged (`-3` lacks
    pre-image blobs on a fresh `git init`). Test against a deliberately diverged target (2026-08-03).
43. A path-matching guard is only as real as the path: a deny matcher written for a flat layout matched nothing in the real nested
    one while reporting itself installed. Resolve every guard path against the real layout (2026-08-03).
44. Hooks in a project-level `.claude/settings.json` are inert for the installing session and need workspace trust. Require a fresh
    session and a liveness heartbeat before trusting an installed hook guard (2026-08-03).
45. A bash loop over `git` output word-splits on paths with spaces, silently, with exit 0. Iterate with `-z` and
    `while IFS= read -r -d ''`, never bare `for` or `$(...)` splitting (2026-08-03).
46. An unquoted path with spaces fails as absence, not as an error (`git show` exits 128 for an existing file). Quote every path,
    use `-LiteralPath` in PowerShell, and check `$LASTEXITCODE` before concluding a file is absent (2026-08-03).
47. `git diff` on a CRLF-normalised repo prints one EOL warning per file, which can use up the tool's output cap before the first
    diff line. Redirect with `2>/dev/null` unless the warnings are the measurement (2026-08-03).
48. PowerShell 5.1 re-splits a single-quoted here-string at embedded double quotes when passed to a native exe
    (`git commit -m @'…"…"…'@` becomes pathspecs). Write the message to a file and use `git commit -F <file>` (2026-08-08).
49. `$LASTEXITCODE` keeps its previous value after `CommandNotFoundException`, so a harness that never ran reads `exit=0`. Run `.sh`
    harnesses through a POSIX shell and confirm the command ran before reading it (2026-08-08).
50. PowerShell resolves aliases before functions before executables: `r` is `Invoke-History`, and a helper function named `Git` that
    called `git` recursed into itself and hung. Name helpers with three or more letters, never after a command (2026-08-08, 2026-09-29).
51. A gitignored build artefact goes stale silently, and a test that consumes rather than builds it passes against an old payload.
    Rebuild it and prove its currency first (2026-08-08).
52. A flag on the runner is not the flag on the command it launches: `claude mcp add -e VAR` writes the secret to disk, the
    inheriting `-e VAR` is docker's. A green end-to-end run validates the configuration, never the rule (2026-08-08).
53. A mutation test can fail for the wrong reason and read like success: `Set-Content -Encoding utf8` (PS 5.1) writes a BOM on
    whole-file rewrites, tripping a BOM guard before the assertion under test. Write BOM-less with
    `[System.IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding($false)))` and confirm why it failed (2026-08-08).
54. An invalid enum in agent frontmatter silently drops the definition (`effort` and `permissionMode` are validated at load; a bad
    `model:` fails only at dispatch). Read "not found" as malformed before stale, check enum values first, and exclude a probe's own
    fixture as the cause of the symptom before trusting it (2026-08-09).
55. The agent registry is not reliably live: a new `.claude/agents/` folder is not picked up mid-session, and edits to a definition
    may never apply mid-session (docs say hot reload; #75432 disagrees). Budget a restart per definition change, and never call an
    agent broken from a not-found alone (2026-08-09).
56. A hardcoded-literal mutation fixture zero-guards exactly when the real defect is present (the anchor is the string the defect
    removed), hiding every later assertion. Derive the fixture from the live parse and mutate with a non-throwing replace so a
    missing anchor fails loudly (2026-08-09).
57. A documented command with Windows separators hides its own breakage: `sh tests\check.sh` exits 127 (backslash escapes in sh)
    while quoting it accidentally succeeds. Write POSIX invocations with forward slashes, run the documented form verbatim and
    unquoted, and grep for the same literal elsewhere (2026-08-09).
58. `git checkout -- <path>` "restoring" an uncommitted implementation restores from the index, discarding the implementation, not
    the mutation. Snapshot bytes first, restore in a `finally`, commit before mutating (2026-08-15).
59. Restoring mutated source without rebuilding leaves the compiled mutant alive in a gitignored build output while `git diff` reads
    clean. Rebuild after every restore and assert currency with a sentinel from the change (2026-08-15).
60. A writing git command (`add`, `add -N`, `restore`, `commit`) given one pathspec that matches nothing aborts as a
    whole and does nothing (exit 128 or 1), while `git diff` and `git ls-files` accept such a pathspec. Every writing
    git command in the skills takes an explicit file list produced by a listing command, never a glob (2026-09-30).
61. A background helper's completion notice can fail to resume the session that dispatched it (observed once on the
    reference machine; reported in the harness's issues). Never re-dispatch on a "lost" notice alone: `/gcaas-status`
    shows the open batch row and `/gcaas-run` reconciles it from git and the evidence (2026-09-30).
