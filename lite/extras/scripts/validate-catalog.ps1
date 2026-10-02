#requires -Version 5.1
# Tooling-catalog validator -- the executable half of the catalog contract.
#
# WHERE THIS LIVES. It installs to .claude/scripts/validate-catalog.ps1 (from extras/scripts/), or to
# ~/.claude/scripts/ for a global install. The /gcaas-tooling-install skill resolves the global copy first
# (then the repo copy, then a path the operator names) and HALTS if it cannot find it: an install that
# skips validation is the failure the catalog exists to prevent.
#
# A catalog is a Markdown document. Its MACHINE-READ content is every fenced block whose info string
# is exactly `catalog-entry`; the surrounding prose is documentation and is never parsed. That split is
# deliberate: a catalog is repo-local and therefore attacker-controllable in a hostile clone, so the
# region this script trusts has to be one an author declares on purpose rather than "whatever looked
# like a table". `.claude/templates/CATALOG_TEMPLATE.md` is itself a valid catalog, so running this
# script against that template is the check that keeps template and parser in agreement -- run it
# after any edit to either. Cite this file by NAME, not line number: line numbers rot on the next edit.
#
# EXIT CODES ARE THE CONTRACT. A caller must be able to tell WHICH refusal fired without parsing prose,
# and a refusal-for-the-wrong-reason must be impossible to mistake for the refusal that was tested:
#   0  valid
#   1  usage / unreadable input          (the catalog was never validated - do not read as a pass)
#   2  schema violation
#   3  DENY-LIST refusal                 (only reachable with -Entry)
#   4  unanchored allow-glob
#   5  secret-shaped literal in a field
# Every finding is printed; the exit code is the highest-priority class present, ordered 3 > 5 > 4 > 2.
# Deny outranks everything because it is the one refusal this feature cannot get wrong.
[CmdletBinding()]
param(
  # The catalog to validate.
  [Parameter(Mandatory = $true)][string]$Path,
  # The entry being REQUESTED for install. Optional: without it this is a lint of the whole catalog,
  # and a deny-listed entry is reported but not refused - a deny list that failed its own catalog
  # would make deny lists unusable, since documenting the denial is the entire point of the section.
  [string]$Entry = ''
)
$ErrorActionPreference = 'Stop'

# One line to stderr, then exit 1. A bare throw prints a PowerShell error record - message, source
# line, caret diagram, CategoryInfo - at a caller that only needs the reason.
function Fail([string]$Message) { [Console]::Error.WriteLine($Message); exit 1 }
trap { [Console]::Error.WriteLine("ERROR: " + $_.Exception.Message); exit 1 }

$KnownFields = @('name', 'type', 'publisher', 'install', 'tools', 'scoping', 'denied', 'deny-reason')
$RequiredFields = @('name', 'type', 'publisher', 'install', 'tools', 'scoping', 'denied')
$ValidTypes = @('mcp', 'plugin', 'skill', 'subagent', 'cli')

# Named patterns, so a refusal says WHICH shape it recognised instead of "something looked secret".
# The matched text is NEVER echoed: this script exists partly to stop credentials entering artifacts,
# and a validator that quotes the secret into a log has moved it rather than caught it.
# Only `assigned-secret-literal` carries an Exempt pattern - it is the one rule general enough to fire
# on an ordinary field that merely NAMES a credential. The prefix-shaped rules get no exemption, and
# that is a deliberate TRADE rather than a claim they never false-fire: a placeholder spelled like a
# real key does refuse here, which an author can see and reword, whereas exempting the prefix rules
# would let anyone append the word EXAMPLE to a live key and walk it straight through.
$SecretPatterns = @(
  [pscustomobject]@{ Name = 'aws-access-key-id'; Rx = '(?<![A-Z0-9])(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}(?![A-Z0-9])'; Exempt = '' },
  [pscustomobject]@{ Name = 'github-token'; Rx = '\bgh[pousr]_[A-Za-z0-9]{36,255}\b'; Exempt = '' },
  [pscustomobject]@{ Name = 'github-fine-grained-pat'; Rx = '\bgithub_pat_[A-Za-z0-9_]{50,}'; Exempt = '' },
  [pscustomobject]@{ Name = 'slack-token'; Rx = '\bxox[baprse]-[A-Za-z0-9-]{10,}'; Exempt = '' },
  [pscustomobject]@{ Name = 'json-web-token'; Rx = '\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'; Exempt = '' },
  [pscustomobject]@{ Name = 'openai-anthropic-key'; Rx = '\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}'; Exempt = '' },
  [pscustomobject]@{ Name = 'vercel-project-token'; Rx = '\bvcp_[A-Za-z0-9]{20,}'; Exempt = '' },
  [pscustomobject]@{ Name = 'private-key-block'; Rx = '-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----'; Exempt = '' },
  # scheme://user:password@host - the shape a connection string leaks a password in.
  [pscustomobject]@{ Name = 'uri-inline-password'; Rx = '[A-Za-z][A-Za-z0-9+.\-]*://[^\s:/?#@]+:[^\s:/?#@]+@'; Exempt = '' },
  # The catch-all for a credential whose shape nobody enumerated: a secret-named key assigned a long
  # opaque literal. Exempt covers the ways a catalog legitimately NAMES a credential without carrying
  # one - <PAT>, ${VAR}, %TOKEN%, $env:X, an ellipsis, or a spelled-out placeholder word.
  [pscustomobject]@{
    Name   = 'assigned-secret-literal'
    Rx     = '(?i)\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|credential)\b\s*[:=]\s*(?<v>\S{20,})'
    Exempt = '[<>{}$%]|\.\.\.|(?i)(redacted|example|changeme|placeholder|your[-_a-z]*|x{4,})'
  }
)

# The command family each `type` installs through. `type` stopped being decorative when the install
# skill grew from one surface to five: it is now the field the cycle BRANCHES on, selecting the command,
# the diff baseline and the liveness check. AGENTS.md s12 asks that a control-flow rule be enforced
# rather than left in prose and hoped for, and this is now one.
# The families come from catalogued install stanzas: `claude mcp add`, `npm i -g vercel`,
# `npx plugins add vercel/vercel-plugin`, `npx skills add` and `gh skill install`.
# `claude plugin marketplace add` / `claude plugin install` come from
# `claude plugin --help`, executed 2026-08-08. Subagents and file-dropped skills have no command at
# all - their stanza names the destination path, so the path IS the signature.
# The list is deliberately not exhaustive. An unlisted manager simply matches nothing, and the rule
# below only ever fires on a POSITIVE match of a foreign family, so incompleteness costs a missed
# catch and never a false refusal.
$InstallFamilies = @(
  [pscustomobject]@{ Type = 'mcp'; Rx = '(?i)\bclaude\s+mcp\s+add\b' },
  [pscustomobject]@{ Type = 'plugin'; Rx = '(?i)\bclaude\s+plugin\s+(?:marketplace\s+add|install)\b|\bnpx\s+plugins\s+add\b' },
  [pscustomobject]@{ Type = 'skill'; Rx = '(?i)\bgh\s+skill\s+install\b|\bnpx\s+skills\s+add\b|\.claude[\\/]skills[\\/]' },
  [pscustomobject]@{ Type = 'subagent'; Rx = '(?i)\.claude[\\/]agents[\\/]' },
  [pscustomobject]@{ Type = 'cli'; Rx = '(?i)\bnpm\s+(?:i|install)\s+(?:-g|--global)\b|\b(?:choco|winget|scoop|brew|pipx|cargo|go)\s+install\b' }
)

$findings = New-Object System.Collections.ArrayList
function Add-Finding([int]$Code, [string]$Message) {
  [void]$findings.Add([pscustomobject]@{ Code = $Code; Message = $Message })
}

# -1 when the string holds no glob metacharacter, else the index of the first one.
# `*` is the character the allow-glob trap (CATALOG_TEMPLATE.md, "The allow-glob trap") documents. `?` is treated as a glob too, and
# that is an ASSUMPTION WITH NO SOURCE IN THIS REPO - nothing here says whether Claude Code's matcher
# reads it as a single-character wildcard. It is included because the error is one-directional: if the
# assumption is wrong this script refuses a rule that would have worked, which an author sees and can
# argue with, rather than passing a permission file that authorises nothing while looking scoped.
function Get-FirstGlobIndex([string]$Text) {
  $a = $Text.IndexOf('*'); $b = $Text.IndexOf('?')
  if ($a -lt 0) { return $b }
  if ($b -lt 0) { return $a }
  if ($a -lt $b) { return $a }
  return $b
}

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
  Fail "ERROR: catalog not found (or is not a file): $Path"
}
$bytes = [System.IO.File]::ReadAllBytes($Path)
if ($bytes -contains 0) {
  Fail "ERROR: $Path contains NUL bytes. A catalog is UTF-8 text; this is binary or UTF-16."
}
# STRICT decode. The lenient one turns an unexpected byte into U+FFFD silently, and every check below
# would then run against text the author never wrote.
try { $text = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes) }
catch { Fail "ERROR: $Path is not valid UTF-8. Re-save it as UTF-8 before validating it." }

$lines = @($text.Replace("`r`n", "`n").Replace("`r", "`n") -split "`n")

# --- Fence scan -------------------------------------------------------------------------------
# Two hazards this has to survive:
#   1. A `catalog-entry` fence DEMONSTRATED inside a longer outer fence is documentation, not an
#      entry. A scanner that only looks for its own opener parses the template's own worked example
#      as a real entry - which is how a doc edit becomes a validation failure nobody can explain.
#   2. An entry hidden inside an HTML comment is invisible in rendered markdown and would otherwise
#      validate. This file is repo-local and therefore attacker-controllable in a hostile clone, so
#      "renders as nothing, parses as an authorised entry" is a smuggling route, not a curiosity.
# Comments are blanked LINE BY LINE rather than deleted, so every line number reported below stays true.
$scan = New-Object 'System.Collections.Generic.List[string]'
$inComment = $false
foreach ($raw in $lines) {
  $line = $raw
  if ($inComment) {
    $i = $line.IndexOf('-->', [System.StringComparison]::Ordinal)
    if ($i -lt 0) { $scan.Add(''); continue }
    $line = $line.Substring($i + 3)
    $inComment = $false
  }
  while ($true) {
    $i = $line.IndexOf('<!--', [System.StringComparison]::Ordinal)
    if ($i -lt 0) { break }
    $j = $line.IndexOf('-->', $i + 4, [System.StringComparison]::Ordinal)
    if ($j -lt 0) { $line = $line.Substring(0, $i); $inComment = $true; break }
    $line = $line.Substring(0, $i) + $line.Substring($j + 3)
  }
  $scan.Add($line)
}

# EVERY fence is tracked, not just this script's own: that is what makes hazard 1 above impossible.
# A fence closes only on the same character, at least as long as the opener, with nothing after it.
$blocks = New-Object System.Collections.ArrayList
$fenceRun = ''
$isEntry = $false
$blockStart = 0
$blockLines = $null
for ($i = 0; $i -lt $scan.Count; $i++) {
  $ln = $scan[$i]
  $no = $i + 1
  if ($fenceRun -eq '') {
    $m = [regex]::Match($ln, '^\s{0,3}((?:`{3,})|(?:~{3,}))(.*)$')
    if (-not $m.Success) { continue }
    $fenceRun = $m.Groups[1].Value
    # Case-SENSITIVE and exact. An info string that merely resembles the marker is another language's
    # block, and guessing at it is how prose starts being validated as configuration.
    $isEntry = ($m.Groups[2].Value.Trim() -ceq 'catalog-entry')
    if ($isEntry) { $blockStart = $no; $blockLines = New-Object System.Collections.ArrayList }
    continue
  }
  if ($ln -match ('^\s{0,3}' + [regex]::Escape($fenceRun.Substring(0, 1)) + '{' + $fenceRun.Length + ',}\s*$')) {
    if ($isEntry) { [void]$blocks.Add([pscustomobject]@{ Start = $blockStart; Lines = $blockLines }) }
    $fenceRun = ''
    $isEntry = $false
    continue
  }
  if ($isEntry) { [void]$blockLines.Add([pscustomobject]@{ No = $no; Text = $ln }) }
}
# An unterminated block is DISCARDED rather than validated: where the author meant it to end is
# unknowable, so anything parsed out of it is a guess. Reported, and it also leaves the entry missing.
if ($fenceRun -ne '' -and $isEntry) {
  Add-Finding 2 "${Path}:${blockStart}: a ``catalog-entry`` block is opened here and never closed. It is not validated."
}

# --- Per-entry parse and schema --------------------------------------------------------------
$records = New-Object System.Collections.ArrayList
foreach ($b in $blocks) {
  $fields = @{}
  foreach ($l in $b.Lines) {
    $t = $l.Text.Trim()
    if ($t -eq '') { continue }
    if ($t.StartsWith('#')) { continue }
    $m = [regex]::Match($l.Text, '^\s*([^\s:]+)\s*:\s*(.*)$')
    if (-not $m.Success) {
      Add-Finding 2 "${Path}:$($l.No): not a 'key: value' line, and a catalog entry holds nothing else."
      continue
    }
    $k = $m.Groups[1].Value
    $v = $m.Groups[2].Value.Trim()
    # UNKNOWN keys are refused rather than ignored. Ignoring them is what turns a typo'd `nmae:` into a
    # silently missing `name:` plus a field nobody notices, which is the same defect twice.
    if ($KnownFields -cnotcontains $k) {
      Add-Finding 2 "${Path}:$($l.No): unknown field '$k'. Allowed: $($KnownFields -join ', ')."
      continue
    }
    if ($fields.ContainsKey($k)) {
      Add-Finding 2 "${Path}:$($l.No): field '$k' appears twice in one entry; which one is authoritative is undefined."
      continue
    }
    $fields[$k] = [pscustomobject]@{ Value = $v; No = $l.No }
  }

  $name = ''
  if ($fields.ContainsKey('name')) { $name = $fields['name'].Value }
  $label = "entry at ${Path}:$($b.Start)"
  if ($name -ne '') { $label = "entry '$name' (${Path}:$($b.Start))" }

  foreach ($k in $RequiredFields) {
    if (-not $fields.ContainsKey($k)) {
      Add-Finding 2 "SCHEMA: $label is missing the required field '$k'."
    }
    elseif ($fields[$k].Value -eq '') {
      Add-Finding 2 "SCHEMA: $label has required field '$k' present but EMPTY (${Path}:$($fields[$k].No))."
    }
  }
  if ($fields.ContainsKey('type') -and $fields['type'].Value -ne '' -and ($ValidTypes -cnotcontains $fields['type'].Value)) {
    Add-Finding 2 "SCHEMA: $label has type '$($fields['type'].Value)'; must be exactly one of $($ValidTypes -join '|')."
  }

  # --- type / install-mechanism agreement ---
  # ONE-DIRECTIONAL AND LENIENT ON PURPOSE. `install` is documented as "the exact command OR CONFIG
  # STANZA, verbatim", so an unrecognised stanza - a JSON block, a `docker run` line, "package
  # manager", the deny list's own `install: none - ...` - is legitimate and passes untouched. Requiring
  # a stanza to MATCH its own family would refuse every one of those, including the shipped template's
  # deny entry. So this fires only when the stanza matches ANOTHER surface's family and NOT its own.
  # The direction that hurts is a host package-manager install wearing the `skill` label: it reads as a
  # file drop, gets approved as one, and is not one - the highest-risk class disguised as the lowest.
  # Reported as a SCHEMA violation rather than a new exit code: the entry's own fields contradict each
  # other, and a sixth code would ripple into the documented 3 > 5 > 4 > 2 priority order for no gain.
  if ($fields.ContainsKey('type') -and $fields.ContainsKey('install')) {
    $ty = $fields['type'].Value
    $inst = $fields['install'].Value
    # An invalid `type` is already reported above; re-reporting it here as a mismatch would name the
    # wrong defect and send the author to the wrong field.
    if ($ty -ne '' -and $inst -ne '' -and ($ValidTypes -ccontains $ty)) {
      # Guarded rather than indexed blind: a type added to $ValidTypes without a family row here must
      # degrade to "no opinion", never to a crash inside the validator.
      $own = @($InstallFamilies | Where-Object { $_.Type -ceq $ty })
      $ownHit = ($own.Count -eq 1 -and [regex]::IsMatch($inst, $own[0].Rx))
      $foreign = @($InstallFamilies | Where-Object { $_.Type -cne $ty -and [regex]::IsMatch($inst, $_.Rx) })
      if ((-not $ownHit) -and $foreign.Count -gt 0) {
        Add-Finding 2 ("SCHEMA: $label declares type '$ty' but its install stanza (${Path}:$($fields['install'].No)) is a $(($foreign | ForEach-Object { $_.Type }) -join '/') install." + "`n" +
          "  The install cycle BRANCHES on 'type' - it picks the command family, the diff baseline and the liveness check - so this entry would be" + "`n" +
          "  staged and approved as a '$ty' and applied as something else. Correct whichever of the two fields is wrong." + "`n" +
          "  A stanza matching no known family is never refused here, so a config block or a bare path stays legal.")
      }
    }
  }

  # --- a $ reference a shell would expand ---
  # A recognised command stanza runs verbatim in a shell, and bash, zsh and PowerShell all expand a $
  # reference ($VAR, ${VAR}, $env:VAR) outside single quotes: the token itself, or an empty value, lands
  # in the config. Only single-quoted text is literal in all three. The scan runs left to right, and a '
  # inside "..." opens no literal span. Escapes are not parsed: bash and PowerShell read a \ or ` next to a
  # quote differently, and PowerShell also takes typographic quotes as quotes, so a command stanza holding
  # either is refused outright (fail closed), whatever its $ references. Two more ways to pull a value in
  # need no $: a backtick outside single quotes (bash command substitution) and a %NAME% pair anywhere
  # (cmd, reached through PowerShell's --%, expands it inside any quotes). Both are refused.
  # An unrecognised stanza (a config block written to a file) is left alone, as above.
  if ($fields.ContainsKey('install')) {
    $inst = $fields['install'].Value
    $isCommand = @($InstallFamilies | Where-Object { [regex]::IsMatch($inst, $_.Rx) }).Count -gt 0
    $escaped = [regex]::IsMatch($inst, '[\\`][''"]|[''"][\\`]|[\u2018-\u201F]')
    $exposed = $false; $tick = $false; $q = ''
    for ($ci = 0; $ci -lt $inst.Length; $ci++) {
      $c = [string]$inst[$ci]
      if ($q -eq "'") { if ($c -eq "'") { $q = '' } }
      elseif ($c -eq '$') { $exposed = $true }
      elseif ($c -eq '`') { $tick = $true }
      elseif ($q -eq '"') { if ($c -eq '"') { $q = '' } }
      elseif ($c -eq "'" -or $c -eq '"') { $q = $c }
    }
    if ($isCommand -and $escaped) {
      Add-Finding 2 ('SCHEMA: ' + $label + ' has a backslash or backtick next to a quote, or a typographic quote, in its install stanza (' +
        $Path + ':' + $fields['install'].No + ').' + "`n" +
        '  Bash and PowerShell read these differently, so which text is literal, and whether a $ reference expands, cannot be known.' + "`n" +
        '  Rewrite the stanza with plain quotes and no escaped quote.')
    }
    elseif ($isCommand -and $exposed) {
      Add-Finding 2 ('SCHEMA: ' + $label + ' has a $ reference outside single quotes in its install stanza (' +
        $Path + ':' + $fields['install'].No + ').' + "`n" +
        '  A shell expands it before the command sees it, writing the token itself or an empty value into the config.' + "`n" +
        "  Single-quote it, for example -H 'Authorization: Bearer `${VAR}'.")
    }
    elseif ($isCommand -and ($tick -or [regex]::IsMatch($inst, '%[^%]+%'))) {
      Add-Finding 2 ('SCHEMA: ' + $label + ' has a backtick outside single quotes or a %NAME% pair in its install stanza (' +
        $Path + ':' + $fields['install'].No + ').' + "`n" +
        '  Bash runs the backtick text as a command and cmd expands %NAME%, so either can write a token into the config.' + "`n" +
        '  Remove it, and name the credential in a single-quoted ${VAR} reference instead.')
    }
  }

  $deniedRaw = ''
  if ($fields.ContainsKey('denied')) { $deniedRaw = $fields['denied'].Value }
  if ($deniedRaw -ne '' -and $deniedRaw -cne 'true' -and $deniedRaw -cne 'false') {
    Add-Finding 2 "SCHEMA: $label has denied '$deniedRaw'; must be exactly 'true' or 'false' (lowercase). Anything else is not a boolean and must not be guessed at."
  }
  $isDenied = ($deniedRaw -ceq 'true')
  $reason = ''
  $reasonLine = $b.Start
  if ($fields.ContainsKey('deny-reason')) { $reason = $fields['deny-reason'].Value; $reasonLine = $fields['deny-reason'].No }
  if ($isDenied -and $reason -eq '') {
    Add-Finding 2 "SCHEMA: $label is 'denied: true' with no non-empty 'deny-reason'. A refusal that cannot state its reason teaches the operator nothing, so the reason is part of the schema."
  }
  if ($deniedRaw -ceq 'false' -and $reason -ne '') {
    Add-Finding 2 "SCHEMA: $label carries a 'deny-reason' while 'denied: false'. That is the shape of a deny flag someone flipped and a reason they left behind - resolve it explicitly."
  }

  # --- allow-glob anchoring ---
  # Only `allow:`-prefixed tokens are permission ALLOW rules. `deny:` tokens are exempt on purpose:
  # "Deny and ask accept globs anywhere ... an unanchored allow such as `"*"` is silently skipped ...
  # and grants nothing" (CATALOG_TEMPLATE.md, "The allow-glob trap"). Every other token is an ordinary CLI scoping flag
  # (--read-only, --project-ref=<id>) and is never inspected, which is what stops this rule firing on
  # a legitimate scoping flag.
  if ($fields.ContainsKey('scoping')) {
    foreach ($tok in ($fields['scoping'].Value -split ',')) {
      $t = $tok.Trim()
      if ($t -eq '') { continue }
      if ($t -notmatch '^allow:') { continue }
      $rule = $t.Substring(6).Trim()
      if ($rule -eq '') { continue }
      $g = Get-FirstGlobIndex $rule
      if ($g -lt 0) { continue }
      $unanchored = $false
      if ($rule.StartsWith('mcp__', [System.StringComparison]::Ordinal)) {
        # A glob is legal ONLY after a literal, glob-free `mcp__<server>__` prefix
        # (CATALOG_TEMPLATE.md, "The allow-glob trap").
        if ($rule.Substring(0, $g) -cnotmatch '^mcp__[A-Za-z0-9_-]+__') { $unanchored = $true }
      }
      else {
        # SOURCED: a bare `"*"` allow "is silently skipped ... and grants nothing"
        # (CATALOG_TEMPLATE.md, "The allow-glob trap") - that is the case this branch exists to refuse.
        # ASSUMED, with no source in this repo: that a non-MCP rule is written `Tool` or
        # `Tool(specifier)` and may legally carry a glob INSIDE the specifier - Bash(git status:*).
        # Only the tool-NAME segment is inspected, so the assumption errs lenient: a specifier this
        # repo cannot vouch for passes rather than being refused on a guess.
        $paren = $rule.IndexOf('(')
        $seg = $rule
        if ($paren -ge 0) { $seg = $rule.Substring(0, $paren) }
        if ((Get-FirstGlobIndex $seg) -ge 0) { $unanchored = $true }
      }
      if ($unanchored) {
        Add-Finding 4 ("UNANCHORED ALLOW-GLOB: $label scoping rule 'allow:$rule' (${Path}:$($fields['scoping'].No))." + "`n" +
          "  An allow rule only accepts a glob after a literal, glob-free 'mcp__<server>__' prefix. This one is skipped at startup and grants NOTHING," + "`n" +
          "  so the permission file reads as scoped while authorising zero. Write 'mcp__<server>__*' or name the tools literally.")
      }
    }
  }

  # --- secret-shaped literals ---
  foreach ($k in ($fields.Keys | Sort-Object)) {
    $val = $fields[$k].Value
    if ($val -eq '') { continue }
    foreach ($p in $SecretPatterns) {
      $hit = [regex]::Match($val, $p.Rx)
      if (-not $hit.Success) { continue }
      if ($p.Exempt -ne '' -and [regex]::IsMatch($hit.Value, $p.Exempt)) { continue }
      Add-Finding 5 ("SECRET-SHAPED LITERAL: $label field '$k' (${Path}:$($fields[$k].No)) matches the <$($p.Name)> pattern." + "`n" +
        "  The value is withheld deliberately - printing it would move the credential rather than catch it." + "`n" +
        "  A catalog records HOW to obtain a credential (env var name, secret store, 'aws sts assume-role'), never the credential itself.")
      break
    }
  }

  [void]$records.Add([pscustomobject]@{
      Name       = $name
      Denied     = $isDenied
      Reason     = $reason
      ReasonLine = $reasonLine
      Start      = $b.Start
    })
}

# Zero-guard. Without it, this script exits 0 on an empty file, a renamed file, or a catalog whose
# fences were reformatted - reporting "valid" for a document it read nothing out of.
if ($records.Count -eq 0) {
  Add-Finding 2 "SCHEMA: $Path contains no ``catalog-entry`` blocks. An empty catalog is not a valid catalog - it would report every request as unlisted."
}

# Case-INSENSITIVE, matching the lookup below. Two entries differing only in case would otherwise let
# a deny-listed name be re-declared in another case and resolved to the permitted twin.
$dupes = @($records | Where-Object { $_.Name -ne '' } | Group-Object { $_.Name.ToLowerInvariant() } | Where-Object { $_.Count -gt 1 })
foreach ($d in $dupes) {
  Add-Finding 2 "SCHEMA: the name '$($d.Group[0].Name)' is declared by $($d.Count) entries (lines $(($d.Group | ForEach-Object { $_.Start }) -join ', ')). A request naming it is ambiguous."
}

# --- The requested entry ----------------------------------------------------------------------
if ($Entry -ne '') {
  $hits = @($records | Where-Object { $_.Name -ne '' -and [string]::Equals($_.Name, $Entry, [System.StringComparison]::OrdinalIgnoreCase) })
  if ($hits.Count -eq 0) {
    # NOT a pass. An install request naming an entry this catalog does not contain has to fail, or a
    # typo (or a renamed deny-listed entry) resolves to "nothing objected".
    Add-Finding 2 "REQUEST: no entry named '$Entry' exists in $Path. Nothing was authorised."
  }
  foreach ($h in $hits) {
    if ($h.Denied) {
      Add-Finding 3 ("REFUSED: catalog entry '$($h.Name)' is on the DENY LIST and must not be installed." + "`n" +
        "  reason: $($h.Reason)" + "`n" +
        "  recorded at: ${Path}:$($h.ReasonLine)")
    }
  }
}

# --- Verdict ------------------------------------------------------------------------------------
if ($findings.Count -eq 0) {
  $denied = @($records | Where-Object { $_.Denied })
  Write-Output ("OK: {0} entr{1} validated in {2}." -f $records.Count, $(if ($records.Count -eq 1) { 'y' } else { 'ies' }), $Path)
  if ($Entry -ne '') {
    Write-Output ("  requested entry '{0}' is present and is NOT deny-listed. Schema, allow-glob anchoring and secret scan all clean." -f $Entry)
  }
  # Surfaced even on a clean lint: the deny list is the reason this file is worth reading, and a
  # silent pass is how an operator learns the catalog had nothing to say about risk.
  if ($denied.Count -gt 0) {
    Write-Output ("  note: {0} entr{1} deny-listed and will be REFUSED if requested: {2}" -f $denied.Count, $(if ($denied.Count -eq 1) { 'y is' } else { 'ies are' }), (($denied | ForEach-Object { $_.Name }) -join ', '))
  }
  exit 0
}

foreach ($f in $findings) { [Console]::Error.WriteLine($f.Message) }
[Console]::Error.WriteLine("")
[Console]::Error.WriteLine("$($findings.Count) finding(s) in $Path. Nothing in this catalog is authorised for install.")
# Priority order, not first-found: a deny-list refusal must never be masked by a schema error that
# happens to be reported earlier, and the caller branches on this code.
foreach ($c in @(3, 5, 4, 2)) {
  if (@($findings | Where-Object { $_.Code -eq $c }).Count -gt 0) { exit $c }
}
exit 1
