# BRIEFS.md — how helper briefs are written

Every helper brief follows this file: the saved `/gcaas-*` workflows build theirs from it, and the orchestrator follows
it for ad hoc briefs. A helper sees its brief, AGENTS.md and any user-level instructions and memory (context, never
an approval), so the brief carries every decision, exact value and path the job needs; but the built-in Explore and
Plan agents skip CLAUDE.md, and with it AGENTS.md, so restate the rules they need, and a fork inherits the parent
conversation [CCSA PV]. Pick the route first (`ROUTING.md` §A); the brief is the same on every delegated route. A
one-off subagent gets model and effort from its `gcaas-*` rung agent; a workflow helper gets them in its `agent()` call
and cannot ask mid-run, so its brief says to return `assumptions` and `questions` (plus a `status` or `blocked` field
where the role can block) instead of stopping. Tags in square brackets name the sources in §8.

## 1. The template
Nine slots, context first and contract last [BP V]; the filled slots are the dispatch record.

| # | Slot | Carries | Why it exists |
|---|---|---|---|
| 1 | Goal | The outcome, who uses it, what it enables | Models generalise from reasons [BP V] |
| 2 | Given | Settled facts ("use, don't re-test"), decisions, exact values, paths; upstream output tagged as data; what siblings cover | No parent context [CCSA PV]; vague briefs duplicate work [MAR V]; authority-styled text sways [CI V] |
| 3 | Task | The target state, the scope named outright, what is out of scope; then the optional marked priority | Sonnet reads literally [S5 V] |
| 4 | Rules | Five at most, each "do X; never Y, because Z"; only what AGENTS.md lacks, plus named departures from it | Rules compete as they grow [IFScale V]; AGENTS.md loads anyway [CCSA PV] |
| 5 | Yours to decide | The method, granted in words; the `concerns` field | Freedom matched to fragility [SKBP V] |
| 6 | Evidence | Named checks; every claim tied to a tool result or `file:line` | "prove the evidence first" [pad] |
| 7 | Return | `status` or `blocked` where the role can block, literal fields, shape plus ceiling, `unknown` for gaps, `assumptions`, `questions`, `follow_ups` | Named fields hold their structure [build] |
| 8 | Stop | The done condition, the allowed stops, and the unwanted early stop | Named stops work [O55 V]; no mid-run input |
| 9 | Model line | Optional, always last (§4) | Guidance is model-specific [BP V] |

Never ask a helper to write out its reasoning ("show your reasoning", "explain your thinking"): Opus 5.5 and
Sonnet 5.5 can refuse it under the `reasoning_extraction` safeguard, and fallback does not retry that refusal
[O55 V, S55 V]. Ask for decisions and evidence instead; whether a one-line rationale can trigger it is unknown.

Finder briefs (validators, adversaries, review lenses) are coverage-first: every finding, including the unsure and the
minor, with a confidence and a severity. Filtering is the judge's job; a quality bar makes a finder hold back findings
it already made [S5 V].

## 2. Emphasis policy
- Write plain sentence-case imperatives, "do X when Y" [BP PV]; bold labels slots only; no capitals for emphasis.
- Name the set behind "every", "all" or "only" [S5 V]; pair each "never" with the behaviour wanted instead [pad].
- One marked priority at most: a lowercase `*importantly*` after the task, or a closing "Most importantly, ...".
  Place it on the role's blind spot, never on the task itself, and give its reason [pad]. Blind spots: builder,
  edge cases the tests don't pin; validator, passing while broken; researcher, stale evidence; editor, the whole scope.
- Two lowercase "never"s at most, each naming the exact action and why [BP V, O5 V, O55 PV].
- Capitals are a remedy, not a style: one line, only after a run showed it being skipped, with that run recorded
  [CCBP V]. Anthropic's "dial back aggressive language" was about tool-pushing prompts on older Opus [BP PV].
- The package's build test linted every saved brief for one marker at most, two "never"s at most, no emphasis capitals
  and no request for reasoning (2026-09-29). That test does not ship: check a brief you add or change by hand.

## 3. Latitude policy
Be strict where a script checks the output or a mistake is costly; elsewhere grant freedom openly, in words, because
Sonnet will not assume it [S5 V, SKBP V].
- Every brief has a `concerns` field: pushback is one sentence there, then the helper carries on as asked [O5 PV].
- Routine ambiguity takes the reading the wording best supports, recorded under `assumptions`: helpers cannot ask.
- A house rule: effort sets depth, so never write "think hard" or "be quick" into a brief [S55 PV]. Sonnet 5.5's
  measured "Think the problem through before you answer." (JSON answers) is left out, untested in briefs [S55 V].
- Extras a helper wants to add go under `follow_ups`, not into the diff; both families tend to add them [S55 V, O5 PV].

| Role | Open (granted in words) | Fixed |
|---|---|---|
| Builder | Approach, design, order, scratch checks | Locked tests, owned paths, the done-check; extras to `follow_ups` |
| Test writer | Which cases, test design | Test paths, the command, tests seen red before return |
| Validator, adversaries | Probes, depth, attack angles | The verdict rule; every finding with confidence and severity, no bar [S5 V] |
| Researcher | Queries, sources, which leads | The budget, Firecrawl first with `-o`, the four evidence labels |
| Planner | Alternatives, decomposition | The goal, constraints, the decision record |
| Editor, gatherer | Route and wording inside the named scope | The scope, spelled out |
| Committer | Commit message wording | Pathspecs per track, no history rewrites |
| Judge | The report's shape | Verdict from the evidence only; a concrete bar: wrong behaviour, a test failure or a misleading result [S5 PV] |

## 4. Per-model lines
Sonnet 5.5 skips checks at low effort and over-extends at xhigh and max [S55 V]; Opus 5 over-verified when told to
verify [O5 V]. Each line below condenses a paragraph Anthropic measured, in its own wording, as system-prompt text; a
brief is the subagent's task message, not its system prompt [CCSA V], so the lines' effect in a brief is untested.

| Model and effort | Line to add last | Basis |
|---|---|---|
| Opus 5.5, any effort | None. No "double-check", "verify your work" or "use a subagent to verify" lines; the validator verifies. | Measured on Opus 5 [O5 V]; the Opus 5.5 page calls Opus 5's patterns a reasonable starting point [O55 V] |
| Sonnet 5.5 low, writing | "When you change something that can be run, built or type-checked, run a real check that exercises it before reporting it done. A syntax-only check, or a command that failed to start, doesn't count. If dependencies are missing, don't install them; name the check you couldn't run and why." | Condensed from the paragraph measured at low [S55 V]: "code" became "something", the example checks were dropped, and the install clause is swapped to match AGENTS.md §5 |
| Sonnet 5.5 xhigh or max | "When the work is done and its checks pass, stop and report. Don't start extra review rounds or launch reviewer subagents; if a deeper review is worth doing, say so at the end." | Condensed from the paragraph measured at max, about a third cheaper (it also names hardening rounds and excepts a requested review); xhigh not measured separately [S55 V] |

## 5. Author vocabulary
Reuse, each tied to one behaviour [pad]: "prove the evidence first" (done means shown); "account for the edge cases
that could occur: <class>; list each with evidence" (name the class; manner words alone are unmeasured); "keep
verbatim ...; compress the rest" (handoffs, synthesis); "ground every claim in what was actually proven"; "straight to
the point, explanatory, no jargon, the full scope" and "a clear (not overly full) table" (output the operator reads); "ground
the steps in factual directions" (cited steps); "the optimal, safe, secure and effective path" (what to optimise).
A house phrase, not the author's, for verifiers: "assume it is false; try to disconfirm it" (it drew real corrections [build]).

Retire: `HARD GATE`, `IN ORDER`, `CRITICAL: You MUST`; "think step by step", "show your reasoning"; "double-check" (for
Opus); "be conservative", "only important", "don't nitpick"; "you have no other context" (false: AGENTS.md loads
[CCSA PV]); a bare "rigorously" or "methodically"; copied boilerplate.

## 6. Anti-patterns
1. Shouting: the earlier package's AGENTS.md ran about 36-45 emphasis capitals per 1,000 words; the author's prompts have none [old, pad; CCBP V].
2. Re-teaching the constitution to a helper that already loads AGENTS.md [old; CCSA PV].
3. No room and no voice: "execute in order" with no `concerns` field [old; SKBP V].
4. No return contract, so the orchestrator parses prose [old].
5. Qualitative bars on finders, which hide findings already made [S5 V].
6. Model-blind verification wording: verify lines cost Opus tokens for no quality; Anthropic's verbatim real-check
   paragraph tells Sonnet to install dependencies [O5 V, S55 V].
7. Asking for reasoning in the output, which draws refusals that are never retried [O55 V, S55 V].
8. Soft caps: most of the build's word-capped research reports overran, by up to about 34%; measure, don't trust [build].
9. Stale boilerplate: source counts a run cannot afford and old model names [old].
10. "Minimize tool calls" budgets: Sonnet 5.5 then answers from memory where a search would catch what changed [S55 V].

## 7. Example: builder (opus/high, default preset, no model line)
An ad hoc brief. `gcaas-wave`'s builder uses the same slots but returns `green`, `excerpt` and `blocked` in place of
`status`, `checks` and `edge_cases`.
```text
Goal: ship <outcome> for <user>, so <what it enables>; a fresh validator checks it before the orchestrator commits.

Given: root <path>; locked failing tests <paths> (seen red; hashes recorded; run <cmd>); read-only interfaces <paths>.
(Parallel tracks only:) other tracks build in this folder at the same time and own <paths>.

Task: implement <behaviours> in <owned paths> until <cmd> passes; everything the tests ask for is in scope, nothing
else. *importantly*, account for the edge cases the contract names but the tests don't pin (<class>): the validator
probes them.

Rules:
- Make the locked tests pass as written; never edit, skip or weaken them, because the script compares their hashes.
  If one looks wrong, return blocked with "a locked test looks wrong: <why>".
- Change only <owned paths>, and never run git, because the orchestrator commits and parallel tracks share this folder.
- Work alone, with no subagents (the track is sized for one agent). Run <targeted group>, not the full suite: the wave
  runs it once (a departure from AGENTS.md §3).

Yours to decide: approach, design, order, scratch checks. Resolve ambiguity as the wording and code best support and
record it under assumptions. A contract that looks wrong gets one sentence under concerns; keep building.

Evidence: run <done-check>; prove the evidence first, then claim done.

Return: status (done | blocked), changed_files, checks (command, exit code, last lines), edge_cases with evidence,
assumptions, concerns, follow_ups, questions; unknown for gaps.

Stop when the done-check is green, or nothing can move without an answer; return questions instead of waiting.
A summary naming a next step is not a stop: take the step.
```

## 8. Sources
All read 2026-09-29 (Anthropic's docs pages are undated). V: checked against the source that day; PV: holds only in the scope the text gives.
- BP: Anthropic, "Prompting best practices", https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- O5, O55, S5, S55: Anthropic, "Prompting Claude Opus 5" (then Opus 5.5, Sonnet 5, Sonnet 5.5), in BP's folder at
  prompting-claude-<model>, where <model> is opus-5, opus-5-5, sonnet-5 or sonnet-5-5
- SKBP: Anthropic, "Skill authoring best practices", https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- CCSA and CCBP: Claude Code docs, https://code.claude.com/docs/en/sub-agents and "Best practices for Claude Code", https://code.claude.com/docs/en/best-practices
- MAR: Anthropic, "How we built our multi-agent research system" (2025-06-13), https://www.anthropic.com/engineering/multi-agent-research-system
- IFScale: Jaroslawicz et al. (2025-07-15), https://arxiv.org/abs/2507.11538; CI: Geng et al., "Control Illusion"
  (2025-02-21), https://arxiv.org/abs/2502.15851
- Local, measured 2026-09-29: pad, the author's own saved prompts; old, the earlier operating package this one was distilled from; build, this build.
