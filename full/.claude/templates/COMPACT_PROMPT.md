# COMPACT_PROMPT — the operator's compaction brief

`/compact` is the CLI's built-in; this file is the ARGUMENT that makes it obey AGENTS.md §8's
compaction contract. On 🟡 COMPACTION or a 🔵 HANDOFF context refresh — or the context nears its limit
mid-work — select the WHOLE block below (from `/compact` through the final line) and paste it.
Then re-kick: `/gcaas-run <NAME>` (it reconciles from `gcaas-ops/<NAME>/RESUME.md`) for a phased run,
or your own kickoff prompt otherwise.
On a ⏳ HANDS OFF context refresh, whatever restarts the session handles the compaction; you do nothing.

The block is deliberately MULTI-LINE, broken only at word boundaries: a multiline paste arrives
through the paste chip (`[Pasted text #N +M lines]` — watch for it; it is your proof the paste
arrived whole), while a single line this long trips a known paste-truncation defect in
VS Code-family terminals that silently drops the first 1,024 characters. The summarizer reads the
line breaks as spaces, so the wording below is verbatim-equivalent to the original one-liner.

Battle-tested on the build this constitution was forged in — including a full recovery after a destroyed
working tree — so edit the wording only on evidence that a compaction actually lost something. The closing
paragraph of the block names the six things the official Fable 5.1 prompting guide says a compaction
summary must retain (platform.claude.com, "Prompting Claude Fable 5.1", read 2026-09-20).

The linebreak in the middle is to make it easier to paste.

---

/compact Factually preserve the proven progress, and retain the plan for next steps. Keep verbatim
the mission-critical details that must persist — decisions already made, decisions still pending,
any action awaiting an operator YES, and any blocker or divergence findings — plus concrete paths
and file references. Preserve verbatim, with their reasoning, every RULING and ADJUDICATION I made
and every scope extension I granted, so a later session cannot silently re-decide them; and every
ENVIRONMENT CONSTRAINT proven by execution (tooling quirks, encoding traps, commands that lie),

because re-discovering those costs more than carrying them. Distinguish what was EXECUTED and
observed from what was merely asserted, and drop the merely asserted rather than promoting it.
Compress everything verbose (tool output, listings, exploration, turn-by-turn dialogue) into terse
factual notes, and maintain pointers to the on-disk docs and trackers over re-narrating them.
Ground every retained claim in what was actually proven; never carry forward unproven or invented
progress. Most importantly, think about the meticulous nuances that were found, as they provide
mission critical guidance.

Be complete on these six even at the cost of length, and keep everything else concise: (1) any
difficulties or problems that came up, and how they were handled or resolved; (2) any options or
approaches that were raised, tried, or set aside, and why; (3) anything asked for, decided, agreed,
ruled out, or established as a preference, constraint, or boundary — stated exactly; (4) exactly where
things stand now — what is covered, settled, or completed; (5) anything still open, unresolved,
promised, or expected to happen next; (6) specific details that would be hard to reconstruct — names,
numbers, dates, exact wording, paths, links — kept exactly. Keep what I said, asked for, or established
close to my own words; condense your own reasoning to what it concluded or produced.
