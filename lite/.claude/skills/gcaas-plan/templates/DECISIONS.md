# Decisions: {NAME}

Append only: never edit a row. To change a decision, append a new row with the same key; the last row for a key wins.
Write each decision as `key: choice`, where the key names the decision in a few stable words.
Status: MADE (settled), PENDING (still open), AWAITING-YES (needs the operator's approval).
By: operator or orchestrator.

| Date | Decision | Status | By |
|---|---|---|---|
| {date} | {key}: {choice} | {status} | {by} |
