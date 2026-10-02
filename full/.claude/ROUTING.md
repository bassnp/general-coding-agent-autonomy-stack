# Routing — execution routes and models

Use this file to choose how each piece of work runs and which model and effort each helper gets.
It is the orchestrator's reference, with defaults and reasons, not a rigid rule: pick per helper and say why in one line.
Models are named by alias: `opus` (Opus 5.5 today), `sonnet` (Sonnet 5.5), `haiku` (Haiku 4.5 today, Haiku 5.5 when it ships); an alias does not always give the newest model (§D).
Bracketed keys such as [O55] name the primary sources in §F; "measured on the test machine" marks the package's own runs (Claude Code 2.1.285, Windows 11).

## A. Execution routes

Pick the lightest route that fits.

| Route | Use when | Not when |
|---|---|---|
| Inline | A few tool calls; every decision; talking to the operator. | The working set would crowd your context. |
| One subagent (Agent tool + a `gcaas-*` rung agent) | One bounded job: read many files, one research question, log digging, a surgical fix. It returns a tight summary. | The job is two or three tool calls; the helper's fixed context costs more than it saves. |
| Parallel subagents (several Agent calls in one message) | Two to four independent lookups or facets where you need answers, not verification. | The results must be cross-verified, looped or retried. |
| Ad hoc workflow (Workflow tool) | A systematic multi-stage job with a final output: fan-out plus verification, loops, retries or gates in code, more than four helpers. | One dependent chain; anything that needs the operator mid-run. |
| Saved workflow (`/gcaas-plan-draft`, `/gcaas-wave`, `/gcaas-review`, `/gcaas-research`) | The tested loops: planning, building a wave, review, research. | — (prefer them over an ad hoc workflow for these jobs) |

The design intent: workflows carry systematic multi-agent jobs to a final output, and surgical single subagents remain the right tool for research, collection and context offload.

Why the routes differ:
- Each helper carries about 46-66k tokens of fixed context before it starts (measured on the test machine, 2026-09-29). Batch small items; never one helper per trivial item.
- Multi-agent systems used about 15x the tokens of chat [MA], a 2025 measurement on Opus 4 and Sonnet 4 not re-measured for 5.5.
- Fan-out loses on one dependent chain, or on work that fits one context: the orchestrator adds a plan, a handoff and a merge that one model does without.
  Anthropic: "On work a single model could handle alone, the same model at lower effort was cheaper every time" [OPT].
- A workflow has "No mid-run user input" [WF], so an approval gate falls between runs. Subagents other than forks cannot launch a workflow [SUB], so the
  orchestrator is the main session. Nesting stops at one level (the Workflow tool's own reference in Claude Code 2.1.285).
- The Agent tool has no effort parameter, while a workflow `agent()` call has one (checked in Claude Code 2.1.285, 2026-09-29), so the rung agent fixes both
  model and effort. Rungs: `gcaas-opus-xhigh`, `gcaas-opus-high`, `gcaas-sonnet-high`, `gcaas-haiku`. A cell no rung covers runs as a workflow `agent()` call;
  a rung stands in for it only with the reason recorded.
- Builders run one at a time unless the plan proves their tracks truly separate (AGENTS.md §6). Readers and validators fan out freely; test
  writers too, each inside its own track.
- On small coupled work one builder alone was faster, cheaper and caught both cross-track conflicts a parallel wave has to find at its end
  (the four-track sandbox run in the calibration notes, §E): split into tracks for size or independence, not by habit.

## B. The lookup table

Each cell is model/effort. The operator's words "quick" or "rigorous" pick that column for the run; otherwise use default. Always pass model and effort
together: an omitted effort inherits the session's level. The orchestrator may deviate from any cell for a specific helper, with a one-line reason recorded in the evidence.

| Role key | quick | default | rigorous | Why |
|---|---|---|---|---|
| orchestrator (the session) | opus/high | opus/xhigh | opus/xhigh | Set with `/effort` or `--effort`; max adds 2 index points for about 1.7x the cost and 4.9x the time per call. |
| `planner` | opus/high | opus/xhigh | opus/max | Effort downstream cannot fix a wrong plan; GDPval rises 1692 to 1820 from high to xhigh. |
| `reviewer` | opus/high | opus/xhigh | opus/max | The plan adversary, review lenses and research verification; at least the planner's level. |
| `test_writer` | builder writes its own tests | opus/high | opus/xhigh | Weak tests pass weak code; TB4.0 peaks at xhigh (66.4). |
| `builder` | sonnet/high (calibrated, §E) | opus/high | opus/high | Quick: sonnet/high matched every calibrated config at the lowest time and cost; give a hard or unfamiliar track opus/medium. Default and rigorous: high, xhigh and max tie within TB4.0 noise (±2.6) and xhigh loses on the scope-penalised FrontierCode (51.4 vs 54.0), so rigor goes to checking. |
| `editor` (docs, config, simple edits, review reports) | sonnet/medium | sonnet/high | opus/high | Sonnet may write as an editor (a design decision); surgical code stays on opus. |
| `validator` | opus/high | opus/high | opus/xhigh | Gates never relax; high is Anthropic's level "where verification is important". |
| `test_adversary` | — | — (tracks with risk high: opus/xhigh) | opus/xhigh | Effort cuts missed edge cases; rigorous runs one on every track. |
| `researcher` (web) | sonnet/high | sonnet/high | opus/high | Sonnet stops early at low or medium; a verifier cross-checks; opus/high beats sonnet/xhigh on index and cost. |
| `gatherer` (recon, read-only) | sonnet/medium | sonnet/high | sonnet/high | "Move down to Sonnet or Haiku for lookups, not for writing code." |
| `sweep` (mechanical, non-code) | haiku/low | haiku/low | sonnet/high | Checkable bulk work only, never judged work; `low` is set so Haiku 5.5 should not inherit the session's effort (unverified until it ships). |
| `committer` (integrator) | sonnet/high | sonnet/high | opus/high | Commits by pathspec after the scripted checks; rigorous moves to opus. |
| `judge` (synthesis, refute pass) | opus/high | opus/xhigh | opus/max | The final gate does not relax; GDPval is best at max (1846); fresh context. |

A mechanical code edit across many files is the `builder` role at opus/low (rigorous: opus/medium), following Anthropic's "For a mechanical edit across many
files, keep Opus 5.5 and set effort to low" [TASK]. Rigorous keeps builders at high because effort cuts missed cases, not wrong approaches [EFF], so rigor
is spent on validators and adversaries. Sources for the "why" column: benchmark and GDPval figures from [O55] and §E; index, cost and time from [AA];
Sonnet stopping early from [PS55]; the lookups quote from [TASK]; the verification quote from [EFF].

## C. Retry ladder

Before each retry, name the failure class from the evidence, then set the next attempt.

| failure_class | Next attempt |
|---|---|
| `missed_case` or `unclear` | Same model, effort +1. Builders and sonnet writers cap at xhigh; every other role caps at max. |
| `wrong_approach` | sonnet moves to opus at the same effort; opus goes effort +1, up to the role's cap. |
| `environment` | No escalation. Report it (a missing tool, a flaky suite, a usage limit) and fix the environment first. |

- The effort order is low, medium, high, xhigh, max. At a cap, the next attempt stays at the cap.
- Haiku 4.5 has no effort step: a haiku sweep that fails as `missed_case`, `unclear` or `wrong_approach` moves to sonnet/high, the rigorous sweep cell.
  Re-check this line when Haiku 5.5 ships.
- Why effort first for missed cases: effort cut "missed a case" failures from 59 to 24 of 370 attempts, but "made the wrong call" only from 133 to 107
  (Terminal-Bench 3.0, low to max, on a model outside this ladder [EFF]). A wrong approach needs a stronger model.
- Why effort first when unclear: it is the cheaper move. On Anthropic's SWE-bench Pro subset, Opus low with failures re-run at high solved about 97% at
  about $0.17 per solved task, against 95.3% at $0.29 all at high [OPT].
- Every retry starts fresh and carries all earlier evidence; a code failure is first reproduced as a red test. A track
  reverted at wave end in mapped mode comes back `missed_case`, and its next test writer (the builder in quick) first
  reproduces the recorded suite failure.
- In a peel (a wave-end failure no track's tests own), the track whose revert cleared the failure comes back `unclear`
  with a concern naming the clash. Hold it for the operator's decision instead of escalating: more effort cannot settle
  a clash between two tracks' contracts. Tracks peeled before it, or in a peel that never cleared, come back
  `environment` and retry at the same cells.
- A gate gets five attempts. Write the evidence and next step to disk before the fifth; after the fifth, halt BLOCKED.
- The ladder tops out at opus; a model above it runs only when the operator asks for it by name (a design decision),
  and then as the session's own model or through an agent definition they approve (a governance edit): the saved
  workflows accept `opus`, `sonnet` and `haiku` only, and no `gcaas-*` rung names another model.

## D. Rules and traps

- Never run a builder at max. On FrontierCode, Opus max (54.4) buys nothing over medium (54.6) [O55] and costs about 3.3x high per task [AA].
- Never run Sonnet at max for writing. At max it more often ran Claude Code's code-review skill, which splits the review across many subagents and, in two
  cases Cognition examined, led to a timeout or out-of-scope edits; FrontierCode drops from 52.1 at xhigh to 46.2 [S55].
- The environment and model traps (the effort variable, a user-level `effortLevel`, alias drift, the Haiku model variable, Haiku's missing effort,
  the cyber reroute) are kept once, in `EDGE_CASES.md`, "Model and effort routing": read that group before routing a run.
- After any model release, re-run the routing probe: dispatch one tiny agent per alias and read `message.model` and `effort` in its transcript.
  `/tasks` also shows the model each subagent runs on [SUB].
- Haiku 5.5 was announced as coming "in the coming weeks" [S55]; treat it like Haiku 4.5, for mechanical work
  and never judged work (a design decision).
- A blocked alias steps down to the newest allowed model of its family; any other blocked model request runs on the parent's model, with a warning only
  in interactive sessions [SUB]. When a result looks off, check which model actually ran.
- Siblings share a prompt cache only when model, effort, agent type, tools, output schema and working directory all match [WF]. Prefer one model/effort
  pair per role per run; escalations and recorded deviations are the exceptions.

## E. Evidence summary

Benchmark columns are Anthropic's launch charts [O55] [S55]; index, time and cost are Artificial Analysis [AA], read 2026-09-29. Those are live medians
that drift: some moved about 26% between two reads that day, and the provider page gave Opus high 62 s. Total response is the time to the first answer
token, thinking included, plus about 500 tokens.

| Model · effort | TB4.0 % | FrontierCode % | CursorBench 4.0 % | AA Intelligence Index | Total response s | $ per task |
|---|---|---|---|---|---|---|
| Opus 5.5 · low | 38.5 | 47.3 | 43.7 | 42 | 19.3 | 0.55 |
| Opus 5.5 · medium | 57.6 | 54.6 | 52.5 | 51 | 28.6 | 1.34 |
| Opus 5.5 · high | 64.2 | 54.0 | 56.0 | 54 | 59.6 | 1.82 |
| Opus 5.5 · xhigh | 66.4 | 51.4 | 56.0 | 56 | 142.6 | 3.46 |
| Opus 5.5 · max | 64.8 | 54.4 | 57.8 | 58 | 698.0 | 5.98 |
| Sonnet 5.5 · low | 20.0 | 29.3 | 35.8 | 36 | 7.1 | 0.41 |
| Sonnet 5.5 · medium | 28.8 | 36.5 | 39.2 | 41 | 7.0 | 0.59 |
| Sonnet 5.5 · high | 43.0 | 49.4 | 47.8 | 47 | 21.8 | 1.08 |
| Sonnet 5.5 · xhigh | 61.5 | 52.1 | 53.1 | 52 | 39.1 | 2.74 |
| Sonnet 5.5 · max | 70.6 | 46.2 | 55.5 | 56 | 378.4 | 7.60 |
| Haiku 4.5 (no effort) | unknown | unknown | unknown | 17 | 21.5 reasoning / 6.7 not | 0.28 (reasoning) |

- Sonnet 5.5 index cells are provisional (measured pre-release), and the live board now shows "--" for Sonnet low.
- TB4.0's standard error of ±2.6 ties Opus high, xhigh and max [O55]. Vendor scores include tasks that production safeguards handed to other models [O55].
- Haiku 5.5 has no published data yet: every cell is unknown until it ships and the probe is re-run.

Builder calibration (measured on the test machine, 2026-09-29): 10 small single-file TDD tasks per config, each a fresh `claude -p` run with the
gcaas-wave builder brief and AGENTS.md loaded; pass = locked tests green, only the owned file changed, test hashes unchanged; then 24 hidden edge-case
tests written from the contracts (planted bugs that pass the visible tests fail them).

| Config | Pass | Hidden tests | Median s | Mean $ | Mean output tokens |
|---|---|---|---|---|---|
| sonnet/high | 10/10 | 24/24 | 39.5 | 0.25 | 4,840 |
| opus/medium | 10/10 | 24/24 | 42.8 | 0.43 | 4,254 |
| opus/high | 10/10 | 24/24 | 57.0 | 0.47 | 5,478 |
| sonnet/xhigh | 10/10 | 24/24 | 89.0 | 0.41 | 12,643 |

- Quality hit the ceiling on these tasks, so time and cost decide the quick cell; small, clear tasks cannot show the gap the launch benchmarks show on
  harder multi-step work, which is why default and rigorous stay on opus/high. Re-run after a model release.
- The four-track sandbox run, one opus/high builder alone on a four-track job in the sandbox: 106 s and $0.71, in scope, suite green, and it caught both planted conflicts
  (two tracks claiming one plugin name; a contract against a check it could not edit) because both contracts sat in one context.

## F. Sources

All read 2026-09-29.
- [O55] Anthropic, "Introducing Claude Opus 5.5", 2026-09-22: https://www.anthropic.com/claude-opus-5-5
- [S55] Anthropic, "Introducing Claude Sonnet 5.5", 2026-09-28: https://www.anthropic.com/claude-sonnet-5-5
- [PS55] Anthropic docs, "Prompting Claude Sonnet 5.5": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5
- [EFF] Thariq Shihipar, "Spending your effort", 2026-09-25: https://claude.dev/blog/spending-your-effort/
- [TASK] Addy Osmani, "What a task costs on Opus 5.5", 2026-09-25: https://claude.dev/blog/what-a-task-costs-on-opus-5-5/
- [OPT] Anthropic docs, "Optimizing for cost and intelligence": https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence
- [MA] Anthropic, "How we built our multi-agent research system", 2025-06-13: https://www.anthropic.com/engineering/multi-agent-research-system
- [WF] [SUB] Claude Code docs, the workflows and sub-agents pages: https://code.claude.com/docs/en/workflows and
  https://code.claude.com/docs/en/sub-agents
- [AA] Artificial Analysis models leaderboard: https://artificialanalysis.ai/leaderboards/models
