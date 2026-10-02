export const meta = {
  name: 'gcaas-wave',
  description: 'One wave of an approved GCAAS plan: per track locked failing tests, a builder, a fresh validator and, when called for, a test adversary, with retries; then commits and suite.full',
  whenToUse: 'Called by /gcaas-run for one wave of an approved plan; args: root, ops, name, branch, wave, preset, routing, suite, tracks (built by /gcaas-run)',
  phases: [
    { title: 'Preflight', detail: 'committer checks the run branch and a clean working tree (evidence files excepted) and runs suite.full once as the baseline' },
    { title: 'Tracks', detail: 'parallel_ok tracks side by side, then the rest one by one: tests, build, validate, retry, save and restore failures' },
    { title: 'Wave end', detail: 'HEAD, control-file and stray-write check, one commit per passed track by pathspec, suite.full once; new failures get a flake re-run, then a revert' },
  ],
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'], MODELS = ['opus', 'sonnet', 'haiku'], CLASSES = ['missed_case', 'wrong_approach', 'unclear', 'environment']
const NOTE_FIELDS = ['concerns', 'follow_ups', 'assumptions', 'questions'], NOTE_CAP = 5, LIST_CAP = 25, FILLER = /^(none|unknown|n\/a|null|no|not blocked|false|-)\.?$/i
const fail = msg => { throw new Error('gcaas-wave: ' + msg) }, isStr = v => typeof v === 'string' && v.trim() !== ''
const needStrs = (v, what, empty) => { if (!Array.isArray(v) || (!empty && !v.length) || !v.every(isStr)) fail(`${what} must be ${empty ? 'an' : 'a non-empty'} array of non-empty strings`) }
const clip = (s, n = 400) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 3) + '...' : t }
// A commit subject: the goal's first line whole when it fits in 60 characters (code points, so an emoji astride the cut is never split), else cut at the last word
// boundary within 60; when that leaves fewer characters than the track id has (one long word, or a short word before it), it is cut at 60 instead.
const subject = (g, id = '') => { const c = [...String(g).split(/\r?\n/)[0].trim()]; if (c.length <= 60) return c.join(''); const i = c.lastIndexOf(' ', 60)
  const w = i > 0 ? c.slice(0, i).join('').trim() : ''; return [...w].length >= [...String(id)].length ? w : c.slice(0, 60).join('').trim() }
const uniq = a => [...new Set(a)], list = a => (a && a.length ? a.join(', ') : 'none'), ids = a => a.map(x => x.id).join(', '), flat = s => String(s).replace(/\s+/g, ' ').trim()
const norm = p => String(p).trim().replace(/^"(.*)"$/, '$1').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
// A drive, UNC or POSIX path; a lone leading backslash is relative to the current drive on Windows, so it does not count.
const isAbs = p => /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p)
// A returned path holding a quote (PowerShell ends a quoted string at the typographic ones too), a separator, a control character or $( ${ is never
// handed on to act on, nor is a path that climbs ('..') or leaves the root (drive or absolute). CTRL: an adversary command holding one is refused too
// (PowerShell reads a lone CR as a statement break). A helper's HEAD or sha counts only in git object-name shape, since later briefs run it verbatim.
const CTRL = /[\u0000-\u001F\u007F]/, RISKY = /['"`;|&\u0000-\u001F\u007F\u2018-\u201E]|\$[({]/
const gitSha = s => (typeof s === 'string' && /^[0-9a-f]{7,64}$/i.test(s.trim()) ? s.trim() : ''), away = p => isAbs(p) || /^[A-Za-z]:/.test(p) || p.split('/').includes('..')

if (!args || typeof args !== 'object') fail('args must be an object')
for (const k of ['root', 'ops', 'name', 'branch']) if (!isStr(args[k])) fail(`args.${k} must be a non-empty string`)
for (const k of ['root', 'ops']) if (/["'\u2018-\u201E\r\n]/.test(args[k])) fail(`args.${k} must not contain quotes (typographic ones included) or line breaks: the briefs quote paths with them`)
if (!isAbs(args.root.trim())) fail(`args.root must be an absolute path, since every brief aims its commands at it (got '${args.root}')`)

// Windows paths compare case-insensitively (core.ignorecase): there the matcher folds case and the git pathspecs add icase.
const FOLD = /^[A-Za-z]:[\\/]/.test(args.root.trim()), key = p => (FOLD ? p.toLowerCase() : p)
// Same semantics as git's :(glob) pathspec magic (probed on git 2.46, 2026-09-29): * stays within one folder, ** as a whole
// segment crosses folders (elsewhere it acts as *), and a pattern without wildcards matches that path and everything under it.
function globRegex(glob, re = '') {
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i], whole = c === '*' && glob[i + 1] === '*' && (i === 0 || glob[i - 1] === '/') && (i + 2 === glob.length || glob[i + 2] === '/')
    if (whole) { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?' } else re += '.*' } else re += c === '*' ? '[^/]*' : c === '?' ? '[^/]' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$')
}
const matchGlob = (glob, path) => { const g = key(norm(glob)), p = key(norm(path)); return /[*?]/.test(g) ? globRegex(g).test(p) : p === g || p.startsWith(g + '/') }
const matchesAny = (globs, path) => globs.some(g => matchGlob(g, path))
// A tests.paths entry is a file, a glob, or a folder written with a trailing slash, owned when the globs cover what lies under it.
const ownsEntry = (t, p) => (/[\\/]\s*$/.test(p) ? ['/f', '/d/f'].every(s => matchesAny(t.owned, norm(p) + s)) : matchesAny(t.owned, p))
// Conservative, as in gcaas-plan-draft: two globs may overlap when one's literal stem (up to its first wildcard) covers the other's.
const stem = g => { const i = g.search(/[*?]/); return i < 0 ? g : g.slice(0, i) }
const covers = (s, full, t) => t === s || (t.startsWith(s) && (s !== full || s.endsWith('/') || t[s.length] === '/'))
const overlaps = (x, y) => { const p = key(norm(x)), q = key(norm(y)); return covers(stem(p), p, stem(q)) || covers(stem(q), q, stem(p)) }

if (!Number.isInteger(args.wave) || args.wave < 0) fail('args.wave must be an integer of 0 or more')
if (!['quick', 'default', 'rigorous'].includes(args.preset)) fail('args.preset must be quick, default or rigorous')
if (!args.suite || !isStr(args.suite.full)) fail('args.suite.full must be a non-empty command')
if (args.suite.fast !== undefined && typeof args.suite.fast !== 'string') fail('args.suite.fast must be a string when given')
const MAX_INNER = args.max_inner_attempts === undefined ? 2 : args.max_inner_attempts
if (!Number.isInteger(MAX_INNER) || MAX_INNER < 1 || MAX_INNER > 5) fail('args.max_inner_attempts is the number of tries per track in this call: an integer from 1 to 5, or omitted for 2')

// The test adversary runs on every track in rigorous and on high-risk tracks in default; routing needs it whenever one can run.
const PRESET = args.preset, ADV = t => PRESET === 'rigorous' || (PRESET === 'default' && String(t.risk).toLowerCase() === 'high')
const ROLES = ['committer', 'builder', 'validator'].concat(PRESET === 'quick' ? [] : ['test_writer'], Array.isArray(args.tracks) && args.tracks.some(t => t && ADV(t)) ? ['test_adversary'] : [])
if (!args.routing || typeof args.routing !== 'object') fail('args.routing must be { role: { model, effort } } built from ROUTING.md')
for (const [r, v] of ROLES.map(r => [r, args.routing[r]])) {
  if (!v || typeof v !== 'object') fail(`args.routing is missing role "${r}" (preset ${PRESET} with these tracks uses ${ROLES.join(', ')})`)
  if (!MODELS.includes(v.model)) fail(`args.routing.${r}.model is missing or not one of ${MODELS.join(', ')}`)
  if (!EFFORTS.includes(v.effort)) fail(`args.routing.${r}.effort is missing or not one of ${EFFORTS.join(', ')}`)
}
const R = args.routing, route = r => ({ model: r.model, effort: r.effort })

if (!Array.isArray(args.tracks) || !args.tracks.length) fail('args.tracks must be a non-empty array of track contracts')
const byId = {}, TRACKS = args.tracks
for (const t of args.tracks) {
  const at = `track ${t && isStr(t.id) ? t.id : '(no id)'}`
  if (!t || !isStr(t.id) || !/^[A-Za-z0-9._-]+$/.test(t.id)) fail(`${at}: id must use letters, digits, dot, dash or underscore (it names evidence files)`)
  if (byId[t.id]) fail(`${at}: duplicate id`)
  if (!isStr((byId[t.id] = t).goal)) fail(`${at}: goal must be a non-empty string`)
  needStrs(t.owned, `${at}: owned`); if (!t.tests || !isStr(t.tests.command)) fail(`${at}: tests.command must be a non-empty command`)
  needStrs(t.tests.paths, `${at}: tests.paths`); const odd = t.owned.concat(t.tests.paths).filter(p => /['\u2018-\u201E[\]{}]/.test(p))
  if (odd.length) fail(`${at}: ${odd.join(', ')}: quotes, brackets and braces are not supported in owned globs or tests.paths`)
  if (t.tests.file_form !== undefined && !(isStr(t.tests.file_form) && /<file>|<name>/.test(t.tests.file_form))) fail(`${at}: tests.file_form must be a command holding <file> or <name>`)
  needStrs(t.done, `${at}: done`, true); if (typeof t.parallel_ok !== 'boolean') fail(`${at}: parallel_ok must be true or false`)
  if (!Number.isInteger(t.attempt) || t.attempt < 1 || t.attempt > 5) fail(`${at}: attempt must be an integer from 1 to 5 (the five-attempt ceiling)`)
  if (t.prior_evidence !== undefined) needStrs(t.prior_evidence, `${at}: prior_evidence`, true)
  const loose = (t.prior_evidence || []).filter(p => !isAbs(p.trim())), outside = t.tests.paths.filter(p => !ownsEntry(t, p))
  if (loose.length) fail(`${at}: prior_evidence entries must be absolute paths: ${loose.join(', ')}`)
  if (t.wave !== undefined && t.wave !== args.wave) fail(`${at}: belongs to wave ${t.wave}, not wave ${args.wave} (a retried track runs in a call with its own plan wave)`)
  if (outside.length) fail(`${at}: tests.paths outside its owned globs: ${outside.join(', ')} (a folder entry ends in "/" and needs an owned glob covering all under it, like <folder>/**)`)
}
// A failed track's restore covers every path its globs match, so two tracks of one wave never share a path.
for (let i = 0; i < TRACKS.length; i++) for (let j = i + 1; j < TRACKS.length; j++) {
  const a = TRACKS[i], b = TRACKS[j], hit = a.owned.find(g => b.owned.some(h => overlaps(g, h)))
  if (hit) fail(`tracks ${a.id} and ${b.id} may own the same paths (at '${hit}'): a failed track's restore would undo the other's work, so give each track of a wave its own paths`)
}

const WAVE = args.wave, NAME = args.name.trim(), BRANCH = args.branch.trim(), SUITE_FULL = args.suite.full, SUITE_FAST = isStr(args.suite.fast) ? args.suite.fast : ''
const ROOT = args.root.trim().replace(/[\\/]+$/, ''), SEP = ROOT.includes('\\') ? '\\' : '/'
const OPS = isAbs(args.ops.trim()) ? args.ops.trim().replace(/[\\/]+$/, '') : ROOT + SEP + norm(args.ops).split('/').join(SEP)
const ROOT_KEY = norm(ROOT).toLowerCase(), rel = p => { const n = norm(p); return n.toLowerCase().startsWith(ROOT_KEY + '/') ? n.slice(ROOT_KEY.length + 1) : n }
const OPS_REL = isAbs(rel(OPS)) ? '' : rel(OPS), OPS_KEY = OPS_REL.toLowerCase()
const inOps = p => OPS_REL !== '' && (p.toLowerCase() === OPS_KEY || p.toLowerCase().startsWith(OPS_KEY + '/'))
// Only <ops>/evidence/ may be uncommitted during a wave. The control files hold the run's approvals, so gcaas-run commits them
// before each call, and an uncommitted or changed one halts the wave (a helper may have written an approval there).
const inEvidence = p => OPS_REL !== '' && p.toLowerCase().startsWith(OPS_KEY + '/evidence/')
const isControl = p => OPS_REL !== '' && ['plan.md', 'ledger.md', 'decisions.md', 'resume.md'].some(f => p.toLowerCase() === OPS_KEY + '/' + f)
// No track may own this plan's run records or another plan's, since a commit of its paths would carry them.
for (const t of OPS_REL ? TRACKS : []) if ([OPS_REL, OPS_REL.replace(/[^/]*$/, '') + '_other_plan_'].some(d => matchesAny(t.owned, d + '/PLAN.md')))
  fail(`track ${t.id}: its owned globs cover the plan folders under ${OPS_REL.replace(/\/?[^/]*$/, '') || OPS_REL} (the run records); narrow them`)
const noOwner = p => !TRACKS.some(x => matchesAny(x.owned, p))
let BASE = [] // the one baseline: keys of the test files the preflight's own suite.full run reports failing
const evPath = file => OPS + SEP + 'evidence' + SEP + file, MAGIC = FOLD ? 'glob,icase' : 'glob'
// Wave-level evidence names carry the track (for a one-track retry call) and the highest attempt, so re-runs of a wave differ.
const WTAG = `w${WAVE}-${TRACKS.length === 1 ? TRACKS[0].id : 'wave'}-a${Math.max(...TRACKS.map(t => t.attempt))}`, waveEv = step => evPath(`${WTAG}-committer-${step}.md`)
const pathspecs = (globs, extra = []) => globs.map(g => `':(${MAGIC})${norm(g)}'`).concat(extra.map(p => `':(literal)${p}'`), OPS_REL ? [`':(exclude)${OPS_REL}'`] : []).join(' ')

// Retry ladder (ROUTING.md §C): missed_case/unclear -> effort +1; wrong_approach -> sonnet becomes opus at the same effort,
// opus goes effort +1. Builders and sonnet writers cap at xhigh, an opus test writer at max; haiku moves to sonnet/high.
function escalate(role, r, cls) {
  if (cls === 'environment') return r; if (r.model === 'haiku') return { model: 'sonnet', effort: 'high' }
  const model = cls === 'wrong_approach' ? 'opus' : r.model, cap = EFFORTS.indexOf(role === 'builder' || model === 'sonnet' ? 'xhigh' : 'max'), i = EFFORTS.indexOf(r.effort)
  return { model, effort: EFFORTS[Math.max(i, cls === 'wrong_approach' && r.model === 'sonnet' ? i : Math.min(i + 1, cap))] }
}

const STR = { type: 'string' }, STRS = { type: 'array', items: STR }, BOOL = { type: 'boolean' }, EXIT = { type: 'integer' }
const LEVEL = { type: 'string', enum: ['high', 'medium', 'low'] }, VERDICT = { type: 'string', enum: ['PASS', 'FAIL'] }
const items = props => ({ type: 'array', items: { type: 'object', properties: props, required: Object.keys(props) } }), FILE_HASHES = items({ path: STR, sha256: STR })
const schema = props => { const all = Object.assign({}, props, { concerns: STRS, assumptions: STRS, questions: STRS }); return { type: 'object', properties: all, required: Object.keys(all) } }
const SUITE = { suite_exit: EXIT, suite_excerpt: STR, failing_files: STRS }
const STATUS_SCHEMA = schema({ branch: STR, head: STR, changed: STRS, untracked: STRS, hashes: FILE_HASHES }), PRE_SCHEMA = schema({ branch: STR, head: STR, changed: STRS, ...SUITE, written: STRS })
const TW_SCHEMA = schema({ files: FILE_HASHES, red: BOOL, excerpt: STR }), BUILDER_SCHEMA = schema({ changed_files: STRS, green: BOOL, excerpt: STR, blocked: STR, follow_ups: STRS })
const VALIDATOR_SCHEMA = schema({ verdict: VERDICT, failure_class: { type: 'string', enum: CLASSES.concat(['']) },
  findings: items({ severity: LEVEL, confidence: LEVEL, claim: STR, evidence: STR }), hashes: FILE_HASHES, checks: items({ command: STR, exit: EXIT, excerpt: STR }) })
const ADV_SCHEMA = schema({ new_tests: FILE_HASHES, command: STR, locked: FILE_HASHES, failures: STRS, verdict: VERDICT })
const CLEANUP_SCHEMA = schema({ patch: STR, untracked: STRS, restored: STRS, deleted: STRS, clean: BOOL })
const COMMIT_SCHEMA = schema({ head_moved: BOOL, commits: items({ id: STR, sha: STR, error: STR, files: STRS }), head: STR, ...SUITE })
const REVERT_SCHEMA = schema({ flaky: BOOL, reverted: items({ id: STR, revert_sha: STR, error: STR }), head: STR, ...SUITE })

// Brief text shared by several briefs.
const GIT = `git -c core.quotePath=false -C '${ROOT}'`, HASH_CMD = '(Get-FileHash -LiteralPath <absolute path> -Algorithm SHA256).Hash.ToLower()', ROOT_LINE = `Project root: '${ROOT}'. Your ` +
  `working folder may be another one, so aim every command at the root: Set-Location -LiteralPath '${ROOT}' at the start of each PowerShell call, ${GIT} for git, absolute paths. Use the ` +
  `PowerShell tool and quote every path.`, CHANGED = `${GIT} diff --name-only --no-renames HEAD (changed tracked files; 2>$null drops line-ending warnings) and ${GIT} ls-files --others ` +
  `--exclude-standard (new files)`, GLOB_NOTE = `In the owned globs, * stays within one folder, ** crosses folders, and a pattern without wildcards covers that path and everything under ` +
  `it${FOLD ? '; letter case does not matter' : ''}.`, RELF = 'relative to the root with forward slashes', MAX400 = 'at most 400 characters', SHARED = 'other tracks share this folder',
  RUN_TC = ' Then run tests.command', FILE_RUN = "tests.file_form when the contract has one (<file>: the file's path relative to the root; <name>: its " +
  "file name without folder or last extension), else tests.command without its tests.paths entries followed by the file's path",
  LONG_RUN = "Give a long command the tool's maximum timeout, or run it in the background and wait for it; a timed-out run is not a result.", LOCAL = 'no ' +
  'installs, live services or subagents; run the commands this brief names, not suite.full unless it is one of them (a departure from AGENTS.md §3): the wave runs the full suite once at the end.',
  NO_GIT = `No git, because ${SHARED} and the orchestrator commits; ${LOCAL}`, NO_ASK = 'You cannot ask anyone mid-run: take the reading the wording best supports and record it under ' +
  'assumptions, put open questions under questions, and return your fields instead of waiting. The structured return replaces any stop banner.', SONNET_LOW = `When you change something that ` +
  `can be run, built or type-checked, run a real check that exercises it before reporting it done. A syntax-only check, or a command that failed to start, doesn't count. If dependencies are ` +
  `missing, don't install them; name the check you couldn't run and why.`, SONNET_TOP = `When the work is done and its checks pass, stop and report. Don't start extra review rounds or launch ` +
  `reviewer subagents; if a deeper review is worth doing, say so at the end.`
const evidenceLine = (path, r) => `Write your evidence file '${path}' as UTF-8 without BOM with [System.IO.File]::WriteAllText(<path>, <text>, (New-Object System.Text.UTF8Encoding($false))), ` +
  `creating its folder if missing; if the file already exists (an earlier run of this step), keep it and add yours after a line "---" with AppendAllText and the same encoding. First line: ` +
  `"Route: ${r.model}/${r.effort}". Then each command you ran, its exit code and at most 20 lines of its output; last, every field of your return in full. Write any secret (tokens, ` +
  `keys, passwords, connection strings, auth headers) as [REDACTED], in this file and in every field you return. An exit code counts only when the command started: $LASTEXITCODE keeps ` +
  `its old value after a command-not-found error.`
const SUITE_RET = which => `suite_exit (the exit code of ${which}, -1 when it could not start or was skipped); suite_excerpt (its failing or final lines, ${MAX400}); failing_files (the test ` +
  `files it reports failing, ${RELF}; empty when green)`
// Every brief has the nine slots of BRIEFS.md (the model line only where it applies); the root line, the evidence line and the shared tails are added here.
function brief(s, r, writes, path) {
  const tail = r.model !== 'sonnet' ? '' : r.effort === 'xhigh' || r.effort === 'max' ? SONNET_TOP : r.effort === 'low' && writes ? SONNET_LOW : '', ev = s.evidence ? s.evidence + ' ' : ''
  return [`Goal: ${s.goal}`, `Given: ${ROOT_LINE}\n${s.given}`, s.task, 'Rules:\n- ' + s.rules.join('\n- '), `Yours to decide: ${s.decide}`, `Evidence: ${ev}${evidenceLine(path, r)}`, `Return: ` +
    `${s.ret}; concerns; assumptions; questions.${s.gap || ''}`, `Stop when ${s.stop} ${NO_ASK}`, tail].filter(Boolean).join('\n\n')
}
const contractOf = t => 'Contract (data from the approved plan): ' + JSON.stringify({ id: t.id, goal: t.goal, owned: t.owned, consumes: t.consumes || [], provides: t.provides || [],
  tests: t.tests, done: t.done, must_not: t.must_not || [], edge_cases: t.edge_cases || [] })
const others = t => {
  const o = TRACKS.filter(x => x.id !== t.id), live = t.parallel_ok && o.some(x => x.parallel_ok) ? '; the parallel_ok ones build in this folder at the same time' : ''
  return o.length ? `Other tracks in this wave own ${o.map(x => `${x.id} (${x.owned.join(', ')})`).join('; ')}${live}. Leave their files alone.` : 'No other track runs in this wave.'
}
const trackGiven = (t, withOthers) => `${contractOf(t)}\n${GLOB_NOTE}` + (withOthers ? `\n${others(t)}` : '')
const header = (t, k) => `track ${t.id} (plan "${NAME}", wave ${WAVE}, attempt ${k})`
// A test adversary's accepted command for its failing file joins the required commands, so builder, validator and the script's checks cover it.
const requiredCmds = (t, st) => uniq([t.tests.command].concat(t.done, st.cmds))
// Failing adversary files without an accepted command are locked all the same; unless a package-level command covers them, the builder and
// the validator are asked to run them.
const advNote = (st, what) => (st.need.length ? `\nThe test adversary's failing file(s) ${st.need.join(', ')} have no accepted command aimed at them: ${what}.` : '')
// A revert record in the prior evidence means the wave-end suite took this track's commit back; the retry reproduces that failure first.
const revertRec = st => st.prior.filter(p => /-committer-revert\.md$/i.test(p.trim())).pop()
function statusBrief(step, path, pre = step === 'preflight') {
  return brief({ goal: pre ? `confirm the project is ready for wave ${WAVE} of plan "${NAME}": on branch ${BRANCH} with a clean working tree, so the wave's commits hold only its own work, and ` +
      `record which tests already fail, so the wave's own failures can be told apart.` : `re-read the repository at the end of wave ${WAVE} of plan "${NAME}", so the script can tell whether ` +
      `HEAD moved during the wave and which changed files belong to which track.`, given: `Expected branch: ${BRANCH}. Uncommitted files under the evidence folder '${OPS}${SEP}evidence' ` +
      `are expected.` + (pre ? `\nsuite.full: ${SUITE_FULL}` : ''), task: `Task: run ${GIT} rev-parse --abbrev-ref HEAD, ${GIT} rev-parse HEAD, ${CHANGED}, and report what they print` +
      (pre ? `. Then, when the branch is ${BRANCH} and the change listing names no path outside the evidence folder, run suite.full once from the root; otherwise skip it, since the ` +
      `wave stops there. ${LONG_RUN} After it, run the two change-listing commands again.` : `, then hash each changed path outside the evidence folder with ${HASH_CMD}.`) +
      ' The script judges the result.', rules: [`Read only${pre ? ', suite.full aside' : ''}; never switch branches, stash, commit, restore or clean, because the orchestrator owns those ` +
      `decisions.`], decide: 'how you run and parse the commands.', stop: pre ? 'the four commands have run and suite.full has run (and the listing after it) or was skipped.'
      : 'the four commands have run and each changed path is hashed.', ret: `branch; head (the full sha); changed (every path the two change-listing commands print, ${RELF}, ` +
      'without quotes)' + (pre ? `; ${SUITE_RET('suite.full')}; written (each path the listing after suite.full prints that the first did not; empty when it was skipped)`
      : `; untracked (the paths the second change-listing command prints, ${RELF}); hashes (path and sha256 of each path you hashed, with sha256 "missing" for a deleted one)`),
  }, route(R.committer), false, path)
}
function testWriterBrief(t, k, mode, st, path) {
  const f = st.todo, lf = st.lastFail, tp = list(t.tests.paths), rec = revertRec(st)
  const task = { write: `Task: write the failing tests the contract describes into tests.paths (${tp}): its goal, what it provides and each listed edge case.${RUN_TC} and confirm they fail ` +
    `because the behaviour is missing.`, rewrite: `Task: an earlier run of this track failed and its work was undone (restored, or reverted after the wave-end suite). ` + (rec ? `First write ` +
    `one failing test inside tests.paths that reproduces the wave-end suite.full failure recorded in the revert record ${rec} (the commit evidence beside it holds the first failing ` +
    `run); when that failure lies outside this track's contract, say so under concerns instead. Then write` : 'Write') + ` the contract's failing tests into tests.paths (${tp}) again; ` +
    `when the prior evidence records a code defect (a validator or test adversary finding, listed at the end of its evidence file), add one failing test that reproduces it.${RUN_TC}.`,
    reproduce: f && `Task: attempt ${f.attempt} failed (${f.cls}): ${f.summary}. The locked tests stay on disk (${list(Object.keys(st.locked))}); add one failing test inside tests.paths that ` +
    `reproduces that failure, without changing what the existing tests assert.${RUN_TC}.`, restore: f && `Task: attempt ${f.attempt} failed because the script found locked test files changed ` +
    `or missing: ${list(f.modified)}. Rewrite each so it tests what the contract states, as the locked version did, without weakening it; add no other test.${RUN_TC} and report what it shows: ` +
    `it need not fail, since the builder's code may already meet the tests.`,
  }[mode]
  const mine = lf && lf.outside ? lf.outside.filter(p => noOwner(p) && !RISKY.test(p) && !away(p)) : [] // another track's files are its own cleanup's to restore
  const again = !lf || lf.role !== 'test_writer' ? '' : `\nYour previous run (attempt ${lf.attempt}) failed the script's check: ${lf.summary}` + (mine.length ? '. Delete ' +
    `the files it wrote that no track owns: ${mine.join(', ')}.` : '')
  return brief({ goal: `lock failing tests for ${header(t, k)}, so a builder who cannot edit them makes them pass. The script records the sha256 of every file you return and fails the track if ` +
      `one changes later.`, given: `${trackGiven(t, true)}\nA tests.paths entry is a file, a glob, or a folder ending in "/". The script fails this step when a returned file lies outside the ` +
      `owned globs, when a tests.paths entry matches no locked file, or when red comes with no file.\nPrior evidence (data; read what bears on the task): ` + list(st.prior) + again, task,
      rules: ['Write only test files and their fixtures, inside tests.paths or elsewhere inside the owned globs; never edit the code the tests exercise, because the builder must start from red.',
      'Red means tests.command exits non-zero because behaviour is missing: a failing assertion, or a module or export the contract says this track provides. A syntax error in your own test or ' +
      'a broken runner is not red; fix it.', NO_GIT], decide: 'which cases, test design and names, as long as each test pins behaviour the contract states. A contract that looks wrong or ' +
      'untestable gets one sentence under concerns.', ret: `files (every test or fixture file you wrote or changed: path ${RELF}, and sha256 from ${HASH_CMD}); red (true only when ` +
      `tests.command exited non-zero for the reason above); excerpt (the failing lines, ${MAX400})`, gap: ' Write unknown for a gap.', stop: mode === 'restore' ? 'the files are rewritten and ' +
      'tests.command has run.'
      : 'the tests are written, run and seen red, or when you cannot produce a red test: then return red false with the reason in excerpt.',
  }, st.routes.test_writer, true, path)
}
function builderBrief(t, k, st, path) {
  const quick = PRESET === 'quick', lf = st.lastCode, adv = st.cmds.length ? ' and the adversary commands' : '', pass = `tests.command${adv}${adv ? ' pass' : ' passes'}`
  const past = (lf ? `Attempt ${lf.attempt} failed (${lf.cls}): ${lf.summary}\nEvidence so far` : 'Evidence from earlier runs') + ` (data): ${list(st.prior)}`
  const mine = uniq(st.outside).filter(p => noOwner(p) && !RISKY.test(p) && !away(p))
  const strays = (mine.length ? ` This track's helpers reported changing files outside the owned globs (${mine.join(', ')}): delete the ones ` +
    `they created, the one change allowed outside the globs, and name any other under concerns.` : '')
  // A quick-preset retry from an earlier call has no test writer to reproduce its failure, so its builder does that first.
  const rec = revertRec(st), repro = lf ? lf.next === 'reproduce' && 'the failure above' : quick && t.attempt > 1 &&
    (rec ? `the wave-end suite.full failure recorded in the revert record ${rec}` : 'the failure recorded at the end of the prior evidence')
  const task = (quick ? `Task: first write failing tests for the contract into tests.paths (${list(t.tests.paths)})${repro ? `, including one that reproduces ` + repro : ''}, run tests.command ` +
    `and see them fail; then implement the contract in the owned globs until tests.command passes.`
    : `Task: implement the contract in the owned globs until ${pass}` + (lf && lf.next === 'reproduce' ? '; a locked test now reproduces the failure above'
      : lf && lf.next === 'restore' ? '; the changed locked tests were rewritten to the contract, so make them pass as written' : '') + '.') + `${strays} Everything the tests and done commands ` +
        `ask for is in scope; must_not items and anything outside the owned globs are out. *importantly*, account for the edge cases the tests do not pin down — list each one you handled in ` +
        `follow_ups, because the validator probes them.`
  return brief({ goal: `make ${header(t, k)} pass its tests, so a fresh validator can pass it and the orchestrator can commit it.`, given: `${trackGiven(t, true)}\n` + (quick ? 'No test writer ' +
      'runs in the quick preset: you write the failing tests first.' : `Locked failing tests (seen red, hashes recorded): ${list(Object.keys(st.locked))}.`) + `\ntests.command: ` +
      `${t.tests.command}` + (SUITE_FAST ? `\nsuite.fast (an optional wider check): ` + SUITE_FAST : '') + `\nRequired commands, which the validator runs verbatim after you: ` +
      `${JSON.stringify(requiredCmds(t, st))}` + advNote(st, `they are locked tests too; run each with ${FILE_RUN}, and make it pass`) + `\n${past}`, task,
      rules: [quick ? 'Once your tests are red, they are the contract; weakening them to reach green fails the track at validation.' : 'Make the locked tests pass as written; never edit, skip ' +
      'or weaken them, because the script compares their sha256 hashes and fails the track on any change. If one looks wrong, return blocked with "a locked test looks wrong: <why>" instead.',
      `Change only paths matching the owned globs; never run git, because ${SHARED} and the committer commits by pathspec.`, 'Work locally: ' + LOCAL], decide: 'approach, design, order and ' +
      'scratch checks; keep scratch files under $env:TEMP, since a file left inside the owned globs is committed. Resolve ambiguity as the wording and code best support and record it ' +
      'under assumptions. A contract that looks wrong gets one sentence under concerns; keep building. Extras and adjacent bugs go under follow_ups, not into the diff.', evidence: `run each ` +
      `required command; prove the evidence first, then claim done. ${LONG_RUN}`, ret: `changed_files (every path you created, changed or deleted, ${RELF}, leaving out your evidence file); ` +
      `green (tests.command${adv} exited 0 on your last run); excerpt (its last lines, ${MAX400}); blocked (empty when not blocked; else the reason, when you stopped on a wrong locked test or ` +
      `on something only the operator can resolve); follow_ups`, gap: ' Write unknown for a gap in any other field.', stop: `${pass} and every required command has run, or when you are ` +
      `blocked. A summary naming a next step is not a stop: take the step.`,
  }, st.routes.builder, true, path)
}
function validatorBrief(t, k, st, path, gap) {
  const locked = Object.keys(st.locked)
  return brief({ goal: `decide whether ${header(t, k)} meets its contract, so the orchestrator can commit it or send it back. A wrong PASS ships a defect; a wrong FAIL costs one retry.`,
      given: `${trackGiven(t, false)}\nRequired commands, in this order: ${JSON.stringify(requiredCmds(t, st))}` + advNote(st, `run each with ${FILE_RUN}, and report ` +
      `that run under checks; a failing run fails the track`) + '\n' + (locked.length ? `Locked test files (their hashes are recorded): ${locked.join(', ')}.` : `No locked tests: in the quick ` +
      `preset the builder wrote the tests under tests.paths, so judge whether they really exercise the contract.`) + `\nOther tracks may be changing their own files in this folder; judge the ` +
      `paths matching this track's owned globs. You get neither the builder's report nor its reasoning, on purpose: judge the code on disk.\nThe script compares your hashes with the locked ` +
      `ones and, at the wave end, with the files it commits (a changed owned file you did not hash is not committed), matches each check to a required ` +
      `command by its exact text (report each command as you ran it, with no output filter such as | Select-Object added), and fails a PASS whose checks miss ` +
      `a required command or show a non-zero exit.` + (gap ? `\nAn earlier validator run of ` +
      `this attempt ${gap}; this run starts fresh, so report a hash for every locked test file and a check for every required command.` : ''), task: `Task: assume the change is wrong and try ` +
      `to prove where. Run each required command verbatim from the root. Hash each locked test file, and each changed or new file under the owned globs, with ` +
      `${HASH_CMD}. List changed paths with ${CHANGED}, read ${GIT} diff HEAD -- ` +
      `${pathspecs(t.owned)}, and read each new owned file in full. Look for stubs, special-cased test inputs, skipped, disabled or weakened tests, swallowed errors and must_not breaches, then ` +
      `probe the contract's edge cases with inputs of your own. Look in particular for ways the change passes while broken, because green tests are exactly what a broken change can fake.`,
      rules: ['Read and run only; never edit files under the root, so your verdict describes the code as submitted. Probes and scratch files go under $env:TEMP; git only to read.', 'Open no ' +
      "other file in the folder of your evidence file: the builder's report sits there, and a verdict shaped by it is the self-blessed pass this role exists to prevent.", 'Verdict ' +
      'FAIL when a required command exits non-zero or cannot run, a locked test is missing or changed, a test is stubbed, skipped or weakened, or a must_not is broken; PASS otherwise.',
      'failure_class for FAIL: missed_case (the approach holds but a case or check is missing), wrong_approach (the design cannot meet the contract, or tests or scope were tampered with), ' +
      'unclear (the contract or tests are ambiguous or contradict each other), environment (a tool, dependency or runner failed, not the code); empty for PASS.', 'Local only: ' + LOCAL],
      decide: 'which probes to add, their order and depth. If the contract itself looks wrong, say so under concerns.', evidence: `every finding cites the command and its observed output, or a ` +
      `file:line; your evidence file keeps every finding with its evidence, because a retry reproduces the failure from it. ${LONG_RUN}`, ret: `verdict; failure_class; findings (severity ` +
      `high|medium|low, confidence high|medium|low, claim, evidence), every issue including the ones you are unsure of or think minor, because the orchestrator filters and coverage is your ` +
      `job; hashes (path ${RELF}, sha256) for every locked test file and every other changed or new file under the owned globs, with sha256 "missing" for a file ` +
      `that is gone; checks (one entry per required command in the order given, the command exactly as given, its exit code or -1 when it could not start, and an ` +
      `excerpt of ${MAX400}; your own probes go under findings)`, stop: 'every check has run and every finding is written.',
  }, route(R.validator), false, path)
}
function adversaryBrief(t, k, st, path) {
  return brief({ goal: `find the edge cases the tests of ${header(t, k)} miss, before the orchestrator commits it. The validator passed it; your failing tests send it back to the builder and ` +
      `become locked tests.`, given: `${trackGiven(t, true)}\nLocked tests: ${list(Object.keys(st.locked))}\nThe script re-checks the locked tests' hashes, and that your file is new and inside ` +
      `the owned globs, from your return; when a test of yours fails, your command joins the track's required commands if it has the form given under Return.`, task: `Task: write adversarial ` +
      `edge-case tests for the contract into one new test file inside the owned globs, next to tests.paths (for example <name>.adversarial.<ext>), its path of ` +
      `letters, digits and _ . - / only (no '..' part, none starting with '-'), and run it ` +
      `with a command of the form given under Return. Aim at boundaries, empty and malformed inputs, error paths, ordering, and whatever the contract implies ` +
      `but the tests leave open.`, rules: ['Create only that new file; never edit existing ' +
      'files, because the validated code and the locked tests must stay as validated.', 'Each test pins behaviour the contract states or clearly implies; an invented requirement sends a ' +
      'correct track back for nothing, so put a doubtful case under concerns instead of in a test.', NO_GIT], decide: 'the angles, how many tests and how deep.', stop: 'the file is written and ' +
      'run.', ret: `new_tests (the file you created: path ${RELF}, sha256 from ${HASH_CMD}); command (the exact command you ran on your file, from the root: tests.command, or ${FILE_RUN} ` +
      `(your file, ${RELF}), with nothing added; the builder and the validator run it verbatim, and any other form is ignored); locked ` +
      `(path and sha256 of each locked test file, hashed after your run, with sha256 "missing" for a file that is gone); failures (one ` +
      `entry per failing test: its name and the assertion lines, ${MAX400}), every failing case including the ones you are unsure of; verdict (PASS when every new test passes, FAIL otherwise)`,
  }, route(R.test_adversary), true, path)
}
function cleanupBrief(t, k, patch, path, extra) {
  const magic = [`glob (${GLOB_NOTE.replace(/^In the owned globs, /, '').replace(/\.$/, '')})`].concat(extra.length ? ["literal (one exact path: a file this track's helpers wrote outside its " +
    "globs)"] : [], OPS_REL ? ['exclude (the ops folder stays out)'] : [])
  return brief({ goal: `save the failed work of ${header(t, k)} as a patch and restore its paths, so the next wave starts from a clean tree. The work is committed nowhere, so the patch is its ` +
      `only copy.`, given: `Pathspecs, written <ps> below: ${pathspecs(t.owned, extra)}\nGit pathspec magic used: ${magic.join('; ')}.\nPatch file: '${patch}'.\nOther tracks' files share this ` +
      `folder and may still be in use.`, task: ['Task, in this order:', `1. List the new files: ${GIT} ls-files --others --exclude-standard -- <ps>`, `2. Mark them intent-to-add (${GIT} add -N ` +
      `-- <each file>) so the patch carries their content, write the diff with ${GIT} diff --binary --output=<absolute path of a temp file under $env:TEMP> -- <ps>, then drop the mark with ` +
      `${GIT} reset -q -- <each file>.`, '3. Write the patch file: one line "# untracked: <path>" per file from step 1, then the diff bytes from the temp file unchanged (join them as bytes; ' +
      'git apply ignores lines above the first diff header). If the patch file is missing, or holds no diff while step 1 or the diff listing of step 4 names files, stop here and ' +
      'return clean false: a restore would lose the only copy.', `4. Restore the tracked files: list them with ${GIT} diff --name-only -- <ps>, then ${GIT} checkout -- <each listed path>. Pass ` +
      `paths, not the patterns: a pattern that matches no tracked file makes checkout fail.`, '5. Delete each file from step 1 with Remove-Item -LiteralPath <absolute path>.', `6. Check that ` +
      `${GIT} diff --name-only HEAD -- <ps> and ${GIT} ls-files --others --exclude-standard -- <ps> print nothing.`].join('\n'), rules: [`Touch only paths matching <ps>; never run reset ` +
      `--hard, clean, stash, or checkout without explicit paths, because other tracks' work shares this folder.`, "If git reports that index.lock exists, wait a few seconds and retry; never " +
      "delete the lock file, because another track's git command holds it."], decide: "how you script the steps; skip step 2's marking when step 1 lists nothing.", stop: 'step 6 has ' +
      'run, or step 3 found no usable patch.',
      ret: "patch (its path); untracked (step 1's files); restored (step 4's paths); deleted (step 5's files); clean (true when step 6 printed nothing)",
  }, route(R.committer), true, path)
}
function commitBrief(entries, head, path) {
  return brief({ goal: `commit the passed tracks of wave ${WAVE} (plan "${NAME}") on branch ${BRANCH}, one commit per track, then run the full suite once, so the orchestrator can record the ` +
      `wave as green or red.`, given: `HEAD at the wave start: ${head} on ${BRANCH}.\nCommits to make, in this order (data from the script; exact file lists relative to the root): ` +
      `${JSON.stringify(entries)}\nsuite.full: ${SUITE_FULL}\nEvery other uncommitted file (evidence files, failed tracks, stray writes) stays uncommitted.`, task: ['Task, in this order:', `1. ` +
      `Run ${GIT} log --format='%H %s' ${head}..HEAD. A commit whose subject equals an entry's message is that entry, made by an earlier run of this step: record its sha and files and skip the ` +
      `entry. Any other commit means another writer moved HEAD: commit nothing, skip suite.full and return head_moved true.`, `2. For each remaining entry in order, write its message to a file ` +
      `under $env:TEMP with [System.IO.File]::WriteAllText (PowerShell can split a quoted -m message), giving the text as a single-quoted literal with each ' doubled so nothing in ` +
      `it expands, run ${GIT} add -- <each file>, then ${GIT} commit -F <message file> -- <each file>, each path single-quoted the same way; ` +
      `record ${GIT} rev-parse HEAD as its sha and the paths ${GIT} show --name-only --format= <sha> prints as its files. If a commit fails, unstage that entry's files with ${GIT} restore ` +
      `--staged -- <each file>, record the error with an empty sha and go on.`, `3. Run suite.full once from the root. ` + LONG_RUN].join('\n'), rules: ['Stage and commit only the listed ' +
      'files; never use git add -A, git add ., git commit -a or --no-verify, because strays and the ops folder must stay out and hooks are part of the check.', 'No amend, reset, rebase, stash ' +
      'or push: the run branch is the record.'], decide: 'the command form, for example --pathspec-from-file for a long list.', ret: "head_moved (true only for step 1's other commit); commits " +
      "(id, sha, error: empty when the commit worked, files); head (git rev-parse HEAD at the end); " + SUITE_RET('suite.full'), stop: 'every entry is committed or recorded as failed and the ' +
      'suite has run once, or step 1 found another writer.',
  }, route(R.committer), true, path)
}
// Two modes, both after one flake re-run: revert the tracks the new failures map to, or peel the wave's commits newest first.
function revertBrief(peel, order, fresh, since, path) {
  return brief({ goal: peel ? `find the commit of wave ${WAVE} (plan "${NAME}") that broke the wave-end suite and take it back off branch ${BRANCH}, reverting commits newest first only until ` +
      `the new failures clear, so the branch ends in a known state with the fewest reverts.` : `take the tracks implicated in the red wave-end suite of wave ${WAVE} (plan "${NAME}") back off ` +
      `branch ${BRANCH} with revert commits, then re-run the suite once, so the branch ends in a known state.`, given: `Commits, newest first (data from the script): ` +
      `${JSON.stringify(order)}\nNew failures (test files that did not fail before the wave): ${clip(list(fresh), 1500)}\nsuite.full: ${SUITE_FULL}\nA run clears the new failures when it exits ` +
      `0, or when it names its failing test files and none of them is a new failure.`, task: ['Task, in this order:', `1. For each entry, run ${GIT} log --format=%H --grep='This reverts commit ` +
      `<sha>' ${since}..HEAD. A printed commit means an earlier run of this step reverted it: record that commit as its revert_sha.`, "2. Unless step 1 found one, re-run suite.full once. If " +
      "that run clears the new failures, they were flaky: return flaky true with that run's results and revert nothing.", (peel ? `3. For each entry in order: unless step 1 found its revert, ` +
      `run ${GIT} revert --no-edit <sha> and record ${GIT} rev-parse HEAD as its revert_sha; then run suite.full once. As soon as a run clears the new failures, stop, and record each later ` +
      `entry step 1 did not find with the error "not needed".` : `3. For each entry in order that step 1 did not find, run ${GIT} revert --no-edit <sha> and record ${GIT} rev-parse HEAD as its ` +
      `revert_sha. Then run suite.full once.`) + ` Stop reverting when a revert stops on a conflict (run ${GIT} revert --abort and record the error) or when a suite.full run cannot start ` +
      `(return that run's -1), and record each remaining entry with the error "not attempted"${peel ? '' : '; after a conflict, still run suite.full once'}. ${LONG_RUN}`].join('\n'),
      rules: ['Revert commits are the only undo; never amend, reset, rebase, force or push, because the run branch is the record. Commit nothing else.'], decide: 'the command form.',
      stop: 'step 3 is done, or step 2 found a flake.', ret: `flaky (true only when step 2's run cleared the new failures); reverted (one entry per commit listed: id, revert_sha, error: empty ` +
      `when the revert worked, else the reason, "not needed" or "not attempted"; none when flaky); head (git rev-parse HEAD at the end); ` + SUITE_RET('the last suite.full run'),
  }, route(R.committer), true, path)
}

// MORE: helper notes, capped at finish() (the latest kept; the script's own notes, one per failed attempt, always stay).
// OUT: each track's outside paths; SEEN: the file hashes its last passing validator reported; NEWF: a passing test adversary's new file(s), kept
// apart so a helper's hash never replaces one SEEN holds, and counted at the wave end only for a file the survey lists as untracked.
const notes = () => Object.fromEntries(NOTE_FIELDS.map(f => [f, []])), MORE = Object.fromEntries(TRACKS.map(t => [t.id, notes()])), PROGRESS = {}, OUT = {}, SEEN = {}, NEWF = {}
const blank = (t, cls) => ({ id: t.id, verdict: 'FAIL', attempts_used: 0, failure_class: cls, changed_files: [], commit: '', evidence: [], ...notes() })
const absorb = (id, out, tag) => { for (const f of NOTE_FIELDS) if (Array.isArray(out[f])) MORE[id][f].push(...out[f].map(s => `${tag}: ${clip(s, 200)}`)) }
const hashOf = s => String(s).trim().toLowerCase(), hashMap = hs => { const m = {}; for (const h of hs) m[key(rel(h.path))] = hashOf(h.sha256); return m }
// A check stands for a required command only when its text is the same, whitespace aside, allowing a leading Set-Location to the root.
// Line breaks count as ';' here, and every leading change to the root (Set-Location, sl, cd, chdir, Push-Location, pushd; then ; or &&) is stripped.
const CD = /^(?:set-location|sl|cd|chdir|push-location|pushd)\s+(?:-(?:literal)?path\s+)?(['"]?)([^'";&]+)\1\s*(?:;|&&)\s*/i
const bare = s => { let f = flat(String(s).replace(/\s*;?\s*\r?\n\s*/g, '; ')), m; while ((m = CD.exec(f)) && key(norm(m[2])) === key(norm(ROOT))) f = f.slice(m[0].length); return f }
const changedLocks = (st, got) => Object.keys(st.locked).filter(p => got[key(p)] !== undefined && got[key(p)] !== st.locked[p])
const unhashed = (st, got) => Object.keys(st.locked).filter(p => got[key(p)] === undefined), sameCmd = (got, want) => bare(got) === bare(want)
// Other helpers run an adversary's command, so it counts only as tests.command, as the plan's tests.file_form for one of the adversary's own
// files (<name> is the file name without folder or last extension), or as tests.command's runner (without its tests.paths entries) followed
// by one of those files; a separator or line break, or anything else, and it is ignored. A control character other than a line break (which bare()
// reads as ';') is refused before any normalising.
const formOf = (t, f) => (t.tests.file_form ? t.tests.file_form.split('<file>').join(f).split('<name>').join(f.replace(/^.*\//, '').replace(/\.[^.]*$/, '')) : '')
const spell = s => key(bare(s).replace(/\\/g, '/'))
function advCmdOk(t, cmd, files) {
  if (CTRL.test(String(cmd).replace(/\r?\n/g, ''))) return false
  const c = bare(cmd), want = bare(t.tests.command); if (c === want || files.some(f => formOf(t, f) && spell(c) === spell(formOf(t, f)))) return true
  if (/[;|&]/.test(c)) return false
  const runner = flat(t.tests.paths.reduce((s, p) => s.split(p.trim()).join(' '), want))
  const rest = (c.startsWith(runner + ' ') ? c.slice(runner.length + 1) : '').replace(/^(['"])([^'"]*)\1$/, '$2')
  return runner !== '' && /^[\w./\\:-]+$/.test(rest) && files.some(f => key(rel(rest)) === key(f))
}
// A command runs one adversary file when it has an accepted form aimed at that file; tests.command itself names none.
const runsFile = (t, cmd, f) => bare(cmd) !== bare(t.tests.command) && advCmdOk(t, cmd, [f])
const RANK = { high: 0, medium: 1, low: 2 }, bySeverity = (a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3), flunk = (r, cls) => Object.assign(r, { verdict: 'FAIL', failure_class: cls })
const logNotes = (label, out) => { if (out && out.concerns && out.concerns.length) log(`${label} concerns: ${clip(out.concerns.join(' | '))}`) }
// A thrown agent() call (for example five failed schema validations) is treated like a null result, and logged. The wave-end survey and
// commit steps are safe to repeat (the commit brief finds its own earlier commits), so they pass tries = 2.
const helper = async (prompt, label, phaseName, sch, r, tries = 1) => {
  for (let n = 1; n <= tries; n++) {
    try { const o = await agent(prompt, { label, phase: phaseName, schema: sch, model: r.model, effort: r.effort }); if (o) return o; log(`${label}: no result`) }
    catch (e) { log(`${label}: helper failed (${clip(e && e.message ? e.message : e, 200)}); counted as no result`) }
    if (n < tries) log(`${label}: runs once more`)
  }
  return null
}
// A check names an adversary file when its command holds the path, whatever the quotes or slashes: enough for a failing run to count.
const namesFile = (cmd, f) => key(flat(cmd).replace(/\\/g, '/')).includes(key(f))
function reportGap(t, st, v) {
  const noHash = unhashed(st, hashMap(v.hashes)), noCheck = requiredCmds(t, st).filter(c => !v.checks.some(x => sameCmd(x.command, c)))
    .concat(st.need.filter(f => !v.checks.some(x => runsFile(t, x.command, f))))
  return [noHash.length ? 'reported no hash for ' + noHash.join(', ') : '', noCheck.length ? 'reported no check for ' + noCheck.join(' ; ') : ''].filter(Boolean).join(' and ')
}
// Deterministic checks override the validator's verdict: locked hashes, the required commands and their exit codes.
function judgeValidator(t, k, st, v, gap, path) {
  const vf = (cls, next, summary) => ({ cls, role: 'validator', next, summary: clip(summary) })
  if (!v) return vf('environment', 'keep', 'the validator returned no result')
  const modified = changedLocks(st, hashMap(v.hashes))
  if (modified.length) return { cls: 'wrong_approach', role: 'builder', next: 'restore', script: true, modified, summary: clip('locked tests modified: ' + modified.join(', ')) }
  if (v.verdict !== 'PASS') {
    const cls = CLASSES.includes(v.failure_class) ? v.failure_class : 'missed_case', sorted = v.findings.slice().sort(bySeverity)
    if (cls !== v.failure_class) log(`${t.id} a${k}: validator FAIL without a failure_class; counted as missed_case`)
    if (sorted.length > 3) log(`${t.id} a${k}: ${sorted.length - 3} more validator finding(s) in ${path}`)
    const bad = v.checks.filter(c => c.exit !== 0).map(c => `${c.command} exited ${c.exit}`)
    return vf(cls, cls === 'environment' ? 'keep' : 'reproduce', sorted.slice(0, 3).map(f => f.claim).concat(bad).join(' | ') || 'verdict FAIL without findings')
  }
  if (gap) return vf('environment', 'keep', 'the validator ' + gap)
  // A failing run of a required command, or of an adversary file that came without a command, overrides the PASS.
  const bad = v.checks.filter(c => c.exit !== 0 && (requiredCmds(t, st).some(c2 => sameCmd(c.command, c2)) || st.adv.some(f => namesFile(c.command, f) ||
    runsFile(t, c.command, f))))
  if (bad.length) {
    const summary = clip('validator PASS overridden: ' + bad.map(c => `${c.command} exited ${c.exit}`).join('; '))
    log(`${t.id} a${k}: ${summary}`); return vf(bad.some(c => c.exit === -1) ? 'environment' : 'missed_case', 'keep', summary)
  }
  const keep = v.findings.filter(f => f.severity !== 'low').sort(bySeverity)
  MORE[t.id].follow_ups.push(...keep.map(f => `a${k} validator ${f.severity}: ${clip(f.claim, 200)}`))
  if (v.findings.length > keep.length) log(`${t.id} a${k}: ${v.findings.length - keep.length} low-severity validator finding(s) stay in ${path}`)
  return null
}
function judgeAdversary(t, st, a, outside, res, known) {
  const env = s => ({ cls: 'environment', role: 'test_adversary', next: 'keep', summary: clip(s) })
  const wrong = (next, extra, s) => Object.assign({ cls: 'wrong_approach', role: 'test_adversary', next, script: true, summary: clip(s) }, extra)
  if (!a) return env('the test adversary returned no result')
  const got = hashMap(a.locked), modified = changedLocks(st, got), missing = unhashed(st, got), lock = a.new_tests.filter(f => matchesAny(t.owned, rel(f.path))), files = lock.map(f => rel(f.path))
  if (modified.length) return wrong('restore', { modified }, 'locked tests modified by the test adversary: ' + modified.join(', '))
  // Its file path reaches commands unquoted (tests.file_form, the runner+path form), so a path of other characters, a '..' part or a part starting
  // with '-' (an option) is refused like one outside. A refused file is never handed on to delete: it stays for the late-edit and stray checks.
  const bad = files.filter(p => !p.split('/').every(s => s !== '..' && /^[\w.][\w.-]*$/.test(s))), odd = uniq(outside.concat(bad))
  if (odd.length) return wrong('keep', {}, "adversarial tests outside the owned globs or not named with letters, digits and _ . - / only (no '..' part, none starting with '-'): " +
    odd.join(', '))
  // Its tests must be new files: one its validator hashed, a locked test or a file this track's helpers reported is an existing file it edited.
  const old = files.filter(p => known.concat(Object.keys(SEEN[t.id] || {}), Object.keys(st.locked).map(key)).includes(key(p)))
  if (old.length) return wrong('keep', {}, 'the test adversary listed existing files as its new tests: ' + old.join(', '))
  if (a.failures.length && !files.length) return env('the test adversary reported failing tests but no file: ' + list(a.failures))
  if (a.failures.length) {
    // Its failing file is locked; an accepted command joins the required commands, and a file no accepted command names goes to the builder and validator to run.
    for (const f of lock) st.locked[rel(f.path)] = hashOf(f.sha256)
    const cmd = isStr(a.command) ? a.command.trim() : '', ok = cmd !== '' && advCmdOk(t, a.command, files)
    if (ok) st.cmds = uniq(st.cmds.concat(cmd)); else if (cmd) log(`${t.id}: the test adversary's command is ignored (not tests.command or a form aimed at its file): ${clip(flat(cmd), 200)}`)
    const unnamed = files.filter(f => !runsFile(t, cmd, f)); st.adv = uniq(st.adv.concat(unnamed))
    // A package-level tests.command (one that names no test file, in a plan without tests.file_form) returned by the adversary runs its file
    // too; otherwise a check must run the file.
    const fileLevel = !!t.tests.file_form || t.tests.paths.some(p => !/[\\/]\s*$|[*?]/.test(p) && key(norm(bare(t.tests.command))).includes(key(norm(p))))
    const covered = ok && bare(cmd) === bare(t.tests.command) && !fileLevel; st.need = uniq(st.need.concat(covered ? [] : unnamed))
    if (unnamed.length) res.concerns.push(clip(covered ? `adversary file(s) ${unnamed.join(', ')} run through the accepted package-level command ${clip(flat(cmd), 120)}`
      : `adversary file(s) ${unnamed.join(', ')} have no accepted command aimed at them: locked, and a validator check must run them`))
    return { cls: 'missed_case', role: 'test_adversary', next: 'keep', summary: clip('adversarial tests failed: ' + list(a.failures)) }
  }
  if (a.verdict !== 'PASS') return env('the test adversary reported FAIL with no failing test; its file is not locked')
  return missing.length ? env('the test adversary reported no hash for ' + missing.join(', ')) : null
}
async function cleanupTrack(t, k, res, outside) {
  const foreign = uniq(outside).filter(p => TRACKS.some(x => x.id !== t.id && matchesAny(x.owned, p)))
  const extra = uniq(outside).filter(p => !inOps(p) && !foreign.includes(p) && !RISKY.test(p) && !away(p))
  if (foreign.length) res.concerns.push(clip(`helpers of ${t.id} reported changing files other tracks own, left for them: ${foreign.join(', ')}`))
  if (extra.length) log(`${t.id}: the restore also covers files its helpers wrote outside the owned globs: ${extra.join(', ')}`)
  const patch = evPath(`w${WAVE}-${t.id}-a${k}-failed.patch`), path = evPath(`w${WAVE}-${t.id}-a${k}-committer.md`)
  const c = await helper(cleanupBrief(t, k, patch, path, extra), `${t.id} a${k} cleanup`, 'Tracks', CLEANUP_SCHEMA, route(R.committer))
  if (!c) { res.concerns.push(`the cleanup helper returned no result: the owned paths may still hold the failed work and ${patch} may be missing`); return }
  res.evidence.push(path, patch); absorb(t.id, c, `a${k} cleanup`)
  if (c.clean) res.changed_files = []; else res.concerns.push(clip('cleanup left changes under the owned paths; restored: ' + list(c.restored)))
}

async function runTrack(t) {
  // todo: the failure the next test writer must answer (reproduce it as a test, or restore changed locked tests); cmds: the test adversary's commands;
  // adv: its failing files that came without one; outside: paths the helpers reported changing outside the owned globs. One no track owns counts once (a
  // later helper deleting it on request is no new breach, and one left in place is a stray write); one another track owns counts every time.
  const res = blank(t, ''), st = { routes: { test_writer: R.test_writer ? route(R.test_writer) : null, builder: route(R.builder) }, locked: {}, cmds: [], adv: [], need: [],
    wrote: false, todo: null, lastFail: null, lastCode: null, prior: (t.prior_evidence || []).slice(), outside: (OUT[t.id] = []) }
  // A returned path holding a quote or shell text counts as outside, since other helpers would hash, run and commit it.
  const outsideOf = files => files.filter(p => RISKY.test(p) || (!inEvidence(p) && !matchesAny(t.owned, p) && !(st.outside.includes(p) && noOwner(p))))
  const record = (ps, who) => { st.outside.push(...ps); const far = ps.filter(away); if (far.length) res.concerns.push(clip(`${who} reported paths that climb out of ` +
    `the root or lie outside it, never handed on to delete or restore: ${far.join(', ')}`)) }
  const ask = async (role, k, make, sch, r) => {
    const path = evPath(`w${WAVE}-${t.id}-a${k}-${role}.md`), out = await helper(make(path), `${t.id} a${k} ${role}`, 'Tracks', sch, r)
    if (out) { res.evidence.push(path); absorb(t.id, out, `a${k} ${role}`) } return out
  }
  const n = Math.min(MAX_INNER, 6 - t.attempt); let twMiss = 0, blocked = ''
  if (n < MAX_INNER) log(`${t.id}: ${n} attempt(s) this run, capped by the five-attempt ceiling (it starts at attempt ${t.attempt})`)
  for (let i = 0; i < n; i++) {
    const k = t.attempt + i; let failed = null; PROGRESS[t.id] = k; res.attempts_used = i + 1
    if (PRESET !== 'quick' && st.wrote && !st.todo) log(`${t.id} a${k}: test writer skipped; the locked tests stand after ${st.lastFail.cls} (${st.lastFail.role})`)
    else if (PRESET !== 'quick') {
      const mode = !st.wrote ? (t.attempt > 1 ? 'rewrite' : 'write') : st.todo.next
      const tw = await ask('test_writer', k, p => testWriterBrief(t, k, mode, st, p), TW_SCHEMA, st.routes.test_writer)
      const files = tw ? uniq(tw.files.map(f => rel(f.path))) : [], outside = outsideOf(files), have = Object.keys(st.locked).concat(files)
      // Each tests.paths entry (a file, a glob or a folder) needs a locked or returned test file that it matches.
      const unwritten = t.tests.paths.filter(p => !have.some(f => matchGlob(p, f)))
      const miss = !tw ? '' : outside.length ? 'test files outside the owned globs: ' + outside.join(', ') : mode !== 'restore' && !tw.red ? 'tests were not red: ' + clip(tw.excerpt, 300)
        : mode !== 'restore' && !files.length ? 'red was reported with no test file' : unwritten.length ? 'tests.paths entries with no test file: ' + unwritten.join(', ') : ''
      res.changed_files.push(...files); record(outside, `a${k} test_writer`)
      if (!tw) { twMiss = 0; failed = { cls: 'environment', role: 'test_writer', summary: 'the test writer returned no result' } }
      else if (!miss) { for (const f of tw.files) if (matchesAny(t.owned, rel(f.path))) st.locked[rel(f.path)] = hashOf(f.sha256); twMiss = 0; st.wrote = true; st.todo = null }
      else {
        failed = { cls: outside.length ? 'wrong_approach' : 'unclear', role: 'test_writer', outside, summary: clip(miss) }
        if (++twMiss >= 2) { res.failure_class = failed.cls; blocked = 'the test writer failed twice in a row: ' + clip(miss, 300); break }
      }
    }
    if (!failed) {
      const b = await ask('builder', k, p => builderBrief(t, k, st, p), BUILDER_SCHEMA, st.routes.builder)
      const files = b ? uniq(b.changed_files.map(rel)).filter(p => !inEvidence(p)) : [], outside = outsideOf(files), stop = b && isStr(b.blocked) ? b.blocked.trim() : ''
      res.changed_files.push(...files); record(outside, `a${k} builder`)
      // The brief asks for an empty blocked field; a filler word there is no block.
      if (FILLER.test(stop)) log(`${t.id} a${k}: the builder wrote "${stop}" under blocked; read as not blocked`)
      else if (stop) { res.failure_class = 'unclear'; blocked = clip(stop); break }
      if (!b) failed = { cls: 'environment', role: 'builder', next: 'keep', summary: 'the builder returned no result' }
      else if (outside.length) failed = { cls: 'wrong_approach', role: 'builder', next: 'keep', script: true, summary: clip('changed files outside the owned globs: ' + outside.join(', ')) }
      else if (!b.green) failed = { cls: 'missed_case', role: 'builder', next: 'keep', summary: clip('tests.command was not green when the builder stopped: ' + b.excerpt) }
    }
    if (!failed) {
      // A PASS that misses a hash or a required check, or no result at all, gets one fresh validator before it counts.
      let v = null, gap = ''
      for (let run = 1; run <= 2; run++) {
        v = await ask('validator', k, p => validatorBrief(t, k, st, p, gap), VALIDATOR_SCHEMA, route(R.validator))
        gap = !v ? 'returned no result' : v.verdict === 'PASS' ? reportGap(t, st, v) : ''
        if (!gap) break; log(`${t.id} a${k}: the validator ${gap}${run === 1 ? '; a fresh validator runs once more' : ''}`)
      }
      failed = judgeValidator(t, k, st, v, gap, evPath(`w${WAVE}-${t.id}-a${k}-validator.md`)); if (!failed) SEEN[t.id] = hashMap(v.hashes)
    }
    if (!failed && ADV(t)) {
      const a = await ask('test_adversary', k, p => adversaryBrief(t, k, st, p), ADV_SCHEMA, route(R.test_adversary))
      const files = a ? uniq(a.new_tests.map(f => rel(f.path))) : [], outside = outsideOf(files), known = uniq(res.changed_files.map(key))
      res.changed_files.push(...files); record(outside, `a${k} test_adversary`); failed = judgeAdversary(t, st, a, outside, res, known)
      if (!failed) NEWF[t.id] = hashMap(a.new_tests.filter(f => matchesAny(t.owned, rel(f.path))))
    }
    if (!failed) { res.verdict = 'PASS'; res.failure_class = ''; break }
    failed.attempt = k; res.failure_class = failed.cls; st.lastFail = failed
    res.concerns.push(clip(`a${k} ${failed.role} ${failed.cls}: ${failed.summary}`))
    if (failed.role !== 'test_writer') { st.lastCode = failed; st.todo = failed.next === 'keep' ? null : failed }; st.prior = uniq(st.prior.concat(res.evidence))
    log(`${t.id} a${k}: failed (${failed.cls}, ${failed.role}): ${clip(failed.summary, 200)}`)
    // A helper with no result (an outage, a usage limit, a stall) gets no instant retry: the track ends this call, and gcaas-run re-runs it once.
    if (/returned no result$/.test(failed.summary)) break
    // The test adversary's own scope or tamper failure is no reason to escalate the builder.
    const who = failed.role === 'test_writer' ? 'test_writer' : failed.role === 'test_adversary' && failed.script ? '' : 'builder'
    if (i + 1 >= n || !who) continue
    const from = st.routes[who], to = escalate(who, from, failed.cls), next = `after ${failed.cls}, for attempt ${k + 1}`
    if (to.model === from.model && to.effort === from.effort) { log(`${t.id}: ${who} stays ${from.model}/${from.effort} ${next}`); continue }
    st.routes[who] = to; res.concerns.push(`a${k + 1} route: ${who} ${to.model}/${to.effort} after ${failed.cls}`)
    log(`${t.id}: escalated ${who} ${from.model}/${from.effort} -> ${to.model}/${to.effort} ${next}`)
  }
  if (blocked) { res.verdict = 'BLOCKED'; res.concerns.unshift('blocked: ' + blocked); log(`${t.id}: blocked: ${clip(blocked, 200)}`) }
  if (res.verdict !== 'PASS') await cleanupTrack(t, t.attempt + res.attempts_used - 1, res, st.outside)
  return res
}
async function crashed(t, why) {
  const res = blank(t, 'environment'), k = PROGRESS[t.id] || t.attempt
  res.attempts_used = PROGRESS[t.id] ? k - t.attempt + 1 : 0; res.concerns.push(clip(`the track chain stopped (${why}); its owned paths went to the cleanup`))
  log(`${t.id}: the track chain stopped (${clip(why, 200)}); restoring its owned paths`); await cleanupTrack(t, k, res, OUT[t.id] || []); return res
}

const out = { wave: WAVE, head_start: '', head_end: '', head_moved: false, baseline: { status: 'not_run', failing: [] }, tracks: [], stray_writes: [],
  suite: { command: SUITE_FULL, status: 'not_run', excerpt: '', new_failures: [] }, reverted: [] }
const finish = () => {
  for (const r of out.tracks) {
    for (const f of NOTE_FIELDS) {
      const extra = uniq(MORE[r.id][f]), more = extra.length - NOTE_CAP
      if (more > 0) log(`${r.id}: ${more} more ${f} not returned; its evidence files hold every helper's return`)
      r[f] = uniq(r[f].concat(more > 0 ? extra.slice(-NOTE_CAP).concat(`(+${more} earlier ${f} in this track's evidence files)`) : extra))
    }
    const all = uniq(r.changed_files); r.evidence = uniq(r.evidence); r.changed_files = all.slice(0, LIST_CAP)
    if (all.length > LIST_CAP) log(`${r.id}: ${all.length - LIST_CAP} more changed files not returned; its commit or patch evidence lists them`)
  }
  return out
}
const halt = msg => { out.error = clip(msg); log(out.error); return finish() }, suiteStatus = code => (code === 0 ? 'green' : code === -1 ? 'not_started' : 'red')
const cap = (a, what) => { if (a.length > LIST_CAP) log(`${a.length - LIST_CAP} more ${what} not returned; the evidence files list them`); return a.slice(0, LIST_CAP) }
// New failures: failing test files the baseline lacks; a red run that names no failing file counts as one unnamed failure.
const UNNAMED = 'suite.full failed without naming a failing file'
// Runners name failing files as paths, file:/// URLs or path:line:col; all become paths relative to the root before any comparison.
const failFile = p => { let s = String(p).trim().replace(/:\d+(?::\d+)?$/, ''); if (/^file:/i.test(s)) { s = s.replace(/^file:\/\/\/?/i, ''); try { s = decodeURI(s) } catch (e) { } } return rel(s) }
const newOf = s => { const all = uniq((s.failing_files || []).map(failFile)); return s.suite_exit === 0 || s.suite_exit === -1 ? [] : all.length ? all.filter(p => !BASE.includes(key(p))) : [UNNAMED] }
const suiteOut = (s, how, fresh) => ({ command: SUITE_FULL, status: how || suiteStatus(s.suite_exit), excerpt: clip(strayNote + s.suite_excerpt), new_failures: cap(fresh, 'new failing files') })

phase('Preflight')
const pre = await helper(statusBrief('preflight', waveEv('preflight')), 'preflight', 'Preflight', PRE_SCHEMA, route(R.committer))
if (!pre) return halt('the preflight helper returned no result; no work done')
out.head_start = out.head_end = gitSha(pre.head)
const dirty = uniq(pre.changed.map(rel)).filter(p => !inEvidence(p)), ctl = dirty.filter(isControl), other = dirty.filter(p => !isControl(p))
const wrote = uniq((pre.written || []).map(rel)).filter(p => !inEvidence(p) && !dirty.includes(p))
const why = [!out.head_start && 'the reported HEAD is not a git sha', pre.branch.trim() !== BRANCH && `on branch ${pre.branch.trim()}, not ${BRANCH}`,
  wrote.length && `suite.full changes files git does not ignore (${wrote.join(', ')}): gitignore what it creates and keep it from rewriting tracked files, ` +
    'or they read as stray writes',
  other.length && `working tree dirty outside the evidence folder (${other.length} paths): ${other.join(', ')}`,
  ctl.length && `control files uncommitted (${ctl.join(', ')}): commit them before each wave, since the run's approvals are read from them`].filter(Boolean)
if (why.length) return halt('preflight failed, no work done: ' + why.join('; '))
// The baseline is what the preflight's suite.full run already fails, returned whole, since gcaas-run compares later runs with it. A run that could not
// start, or is red without naming a failing file, leaves the wave's new failures impossible to tell apart, so no track work starts.
const baseExit = pre.suite_exit, known = Number.isInteger(baseExit), baseFiles = baseExit === 0 ? [] : uniq((pre.failing_files || []).map(failFile))
out.baseline = { status: known ? suiteStatus(baseExit) : 'unknown', failing: baseFiles }; BASE = baseFiles.map(key); const preEx = ` (${clip(pre.suite_excerpt, 200)})`
if (baseExit === -1) return halt('preflight: suite.full could not start, so there is no baseline; no track work done' + preEx)
if (known && baseExit && !baseFiles.length) return halt("preflight: suite.full is red but names no failing file, so the wave's new failures could not be told apart; no track work done" + preEx)
if (!known) log('the preflight reported no suite.full exit code; the baseline is empty, so every failure at the wave end counts as new')
if (baseFiles.length) log(`baseline: suite.full already fails in ${baseFiles.length} file(s) before the wave: ${clip(baseFiles.join(', '))}`)

phase('Tracks')
const par = TRACKS.filter(t => t.parallel_ok), ser = TRACKS.filter(t => !t.parallel_ok), results = {}
log(`Wave ${WAVE} (${PRESET}): ${par.length} parallel_ok track(s) side by side [${ids(par)}], then ${ser.length} one after another [${ids(ser)}]`)
const guarded = async t => { try { return await runTrack(t) } catch (e) { return crashed(t, e && e.message ? e.message : String(e)) } }
const done = par.length ? await pipeline(par, (_, t) => guarded(t)) : []
for (let i = 0; i < par.length; i++) results[par[i].id] = done[i] || await crashed(par[i], 'the pipeline returned no result')
for (const t of ser) results[t.id] = await guarded(t)
// A passed track whose files another track's helpers changed may hold edits no validator saw: it is restored, its work kept in a patch, and retries.
for (const t of TRACKS) {
  const r = results[t.id], by = TRACKS.filter(x => x !== t).map(x => [x.id, uniq(OUT[x.id] || []).filter(p => matchesAny(t.owned, p))]).filter(e => e[1].length)
  if (r.verdict !== 'PASS' || !by.length) continue
  flunk(r, 'environment').concerns.unshift(clip(`not committed, since its work may hold edits no validator saw: helpers of ${by.map(([id, ps]) => `${id} changed ${ps.join(', ')}`).join('; ')}`))
  log(`${t.id}: ${r.concerns[0]}`); await cleanupTrack(t, t.attempt + r.attempts_used - 1, r, [])
}
out.tracks = TRACKS.map(t => results[t.id])

phase('Wave end')
const surveyEv = waveEv('survey'), sv = await helper(statusBrief('survey', surveyEv), 'wave-end survey', 'Wave end', STATUS_SCHEMA, route(R.committer), 2)
if (!sv) { out.head_end = ''; return halt('the wave-end survey returned no result twice; nothing committed') }
out.head_end = gitSha(sv.head); const moved = msg => { out.head_moved = true; log(msg); return finish() }
if (!out.head_end) return halt('the wave-end survey reported a HEAD that is not a git sha; nothing committed')
if (out.head_end !== out.head_start || sv.branch.trim() !== BRANCH) return moved(`HEAD moved during the wave (${out.head_start} -> ${out.head_end} on ${sv.branch.trim()}); nothing committed`)
const changed = uniq(sv.changed.map(rel)).filter(p => !inEvidence(p)), strays = changed.filter(noOwner)
if (strays.length) log(`${strays.length} stray write(s), left uncommitted: ` +
  `${clip(strays.join(', '), 600)}${strays.length > LIST_CAP ? ` (the first ${LIST_CAP} are returned; ${surveyEv} lists all)` : ''}`)
out.stray_writes = strays.slice(0, LIST_CAP); const strayNote = strays.length ? `${strays.length} stray write(s) were in the tree during this run; ` : '', commitEv = waveEv('commit'), entries = []
if (changed.some(isControl)) return halt(`control files changed during the wave (${changed.filter(isControl).join(', ')}), where a helper may have written an approval: ` +
  'nothing committed; compare them with the last commit')
// A passed track is not committed when a changed owned file is one its last validator (or, for a file the survey lists as untracked, a passing
// test adversary) did not hash, or has changed since (an edit no validator saw), or holds a quote or shell text, or when a file its helpers wrote
// outside every track's globs is still in the tree; its work goes to a patch and its paths are restored, as for a failed track. A survey that
// omits a hash leaves a hashed file's check open.
const now = hashMap(sv.hashes || []), untr = (sv.untracked || []).map(p => key(rel(p)))
for (const t of TRACKS.filter(x => results[x.id].verdict === 'PASS')) {
  const r = results[t.id], seen = SEEN[t.id] || {}, own = changed.filter(p => noOwner(p) && (OUT[t.id] || []).some(q => key(q) === key(p)))
  const was = k => (seen[k] !== undefined ? seen[k] : untr.includes(k) ? (NEWF[t.id] || {})[k] : undefined)
  const late = changed.filter(p => matchesAny(t.owned, p) && (RISKY.test(p) || was(key(p)) === undefined || (now[key(p)] !== undefined && now[key(p)] !== was(key(p)))))
  if (!late.length && !own.length) continue
  flunk(r, 'environment').concerns.unshift(clip('not committed: ' + [late.length && `${late.join(', ')} unhashed by its validator, changed after it ` +
    'passed or holding a quote or shell text', own.length &&
    `${own.join(', ')}, written by its helpers outside every track's globs, is still in the tree`].filter(Boolean).join('; ')))
  log(`${t.id}: ${r.concerns[0]}`); await cleanupTrack(t, t.attempt + r.attempts_used - 1, r, own)
}
for (const t of TRACKS.filter(x => results[x.id].verdict === 'PASS')) {
  const r = results[t.id], files = changed.filter(p => matchesAny(t.owned, p))
  if (!files.length) { r.concerns.push('passed, but no changed file matches its owned globs; nothing to commit'); continue }
  r.changed_files = files; r.evidence.push(commitEv); entries.push({ id: t.id, message: `gcaas(${NAME}) w${WAVE} ${t.id}: ${subject(t.goal, t.id)}`, files })
}
if (!entries.length) { log('no passed track has changes to commit; suite.full not run'); return finish() }
const cm = await helper(commitBrief(entries, out.head_start, commitEv), 'commit + suite', 'Wave end', COMMIT_SCHEMA, route(R.committer), 2)
if (!cm) return halt('the commit helper returned no result twice; read git log before the next wave')
logNotes('committer', cm); out.head_end = gitSha(cm.head)
if (cm.head_moved) return moved('HEAD moved before the commit step (another writer); nothing committed, suite.full not run')
for (const e of entries) {
  const r = results[e.id], c = cm.commits.find(x => x.id === e.id)
  if (!c || !gitSha(c.sha) || isStr(c.error)) {
    flunk(r, 'environment').concerns.push(clip('commit failed: ' + (c ? c.error || 'no git sha reported' : 'not reported by the committer'))); continue
  }
  r.commit = c.sha.trim()
  const got = uniq(c.files.map(p => key(rel(p)))), want = e.files.map(key), extra = got.filter(p => !want.includes(p)), lack = want.filter(p => !got.includes(p))
  const m = clip(`commit ${r.commit} ${[extra.length ? 'holds unlisted files: ' + extra.join(', ') : '', lack.length ? 'lacks listed files: ' + lack.join(', ') : ''].filter(Boolean).join('; ')}`)
  if (extra.length || lack.length) { r.concerns.unshift(m); log(`${e.id}: ${m}`) }
}
const fresh = newOf(cm); out.suite = suiteOut(cm, '', fresh)
if (!out.head_end) return halt('the commit helper reported a HEAD that is not a git sha; nothing reverted, read git log before the next wave')
if (!fresh.length) { if (out.suite.status === 'red') log('suite.full is red only in files that already failed before the wave; nothing reverted'); return finish() }

// Only new failures act. A failure that maps to a track (its tests.paths or owned globs) reverts that track's commit; failures that map to no track
// peel the wave's commits newest first, unless the tree holds changes no revert undoes (stray writes, or a track's uncommitted work) or none is named.
const named = fresh.filter(f => f !== UNNAMED), hits = id => named.filter(f => matchesAny(byId[id].tests.paths, f) || matchesAny(byId[id].owned, f))
const mapped = TRACKS.filter(t => hits(t.id).length), committed = entries.filter(e => results[e.id].commit), implicated = committed.filter(e => hits(e.id).length)
const kept = changed.filter(p => TRACKS.some(t => !results[t.id].commit && matchesAny(t.owned, p))), peel = !mapped.length
const stay = !named.length ? 'it names no failing file' : !peel ? (implicated.length ? '' : `they map only to ${ids(mapped)}, which have no commit to revert`)
  : strays.length ? 'no track owns them while stray writes are in the tree' : kept.length ? `no track owns them while uncommitted changes of this wave are in the tree (${kept.join(', ')})`
    : !committed.length ? 'no commit of this wave is left to revert' : ''
if (stay) log(`suite.full has new failures (${clip(list(fresh), 300)}) and ${clip(stay, 300)}: nothing reverted, the wave ends red`)
if (stay) { out.suite.excerpt = clip(`nothing reverted: ${stay}; ${out.suite.excerpt}`); return finish() }
const order = (peel ? committed : implicated).slice().reverse().map(e => ({ id: e.id, sha: results[e.id].commit })), revertEv = waveEv('revert')
log(`suite.full has new failures (${clip(list(named), 300)}): one flake re-run, then ` + (peel ? "peeling the wave's commits newest first until they clear"
  : `reverting ${ids(order)}, newest first`))
const rv = await helper(revertBrief(peel, order, named, out.head_end, revertEv), 'revert + suite', 'Wave end', REVERT_SCHEMA, route(R.committer))
if (!rv) return halt('the revert helper returned no result; read git log and re-run suite.full before the next wave')
logNotes('revert committer', rv); out.head_end = gitSha(rv.head)
if (!out.head_end) log('the revert helper reported a HEAD that is not a git sha; read git log before the next wave')
// A "not needed" entry counts only after a peel's revert that cleared the failures; a flake reverts nothing.
for (const o of order) {
  const r = results[o.id], x = rv.reverted.find(y => y.id === o.id), err = x && isStr(x.error) ? x.error.trim() : '', sha = x ? gitSha(x.revert_sha) : ''
  if (sha && !err) {
    out.reverted.push({ id: o.id, commit: o.sha, revert_commit: sha }); flunk(r, peel ? 'unclear' : 'missed_case').commit = ''; r.evidence.push(revertEv)
    r.concerns.push(clip(`reverted ${o.sha} by ${sha} after suite.full failed in: ` + (peel ? `${list(named)} (no track owns them, so the wave's commits were peeled newest first)`
      : list(hits(o.id)))))
  } else if (!(peel && out.reverted.length && /^not needed$/i.test(err)) && !(rv.flaky && !x)) {
    r.evidence.push(revertEv); r.concerns.push(clip('revert failed: ' + (x ? err || 'no git sha reported as revert_sha' : 'not reported by the committer')))
  }
}
// A flake counts only when the re-run started, shows no new failure and nothing was reverted.
const left = newOf(rv), clear = rv.suite_exit !== -1 && !left.length, flaky = rv.flaky === true && clear && !out.reverted.length
if (flaky) log('the new failures did not recur on the re-run: flaky; nothing reverted')
else if (rv.flaky === true) log(`the committer reported a flake the script cannot confirm (new failures: ${clip(list(left), 300)}); status from the exit code`)
// In a peel, the revert that cleared the failures names the culprit: its work clashes with something no track's tests own, so it comes back
// unclear for the operator's decision. Tracks peeled before it, or in a peel that never cleared, retry without escalation.
const last = out.reverted[out.reverted.length - 1]
if (peel && clear && last) results[last.id].concerns.push(clip(`clash: its revert cleared the new failures in ${clip(list(named), 120)} (${clip(flat(cm.suite_excerpt), 120)}), which no ` +
  `track's tests own, so its work clashes with another track's or with code outside the plan; it waits for the operator's decision, not a retry`))
for (const x of peel ? out.reverted.filter(y => !clear || y !== last) : []) {
  results[x.id].failure_class = 'environment'
  results[x.id].concerns.push(clip(clear ? `peeled before ${last.id}, whose revert cleared the new failures; its own revert did not`
    : `the peel did not clear the new failures${out.reverted.length === order.length ? ", so their cause may lie outside this wave's commits" : ''}`))
}
out.suite = suiteOut(rv, flaky ? 'flaky' : '', left)
return finish()
