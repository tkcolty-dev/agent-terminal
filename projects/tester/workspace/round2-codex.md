# Round 2: cutting the cold-wake floor without cutting work quality

## What the cold wake contains (measured)

I ran two new, one-turn Claude CLI sessions from the Agent Terminal workspace with
the prompt `hi`.

| CLI setup | Tool/MCP surface reported at init | Prompt tokens | Cost |
|---|---|---:|---:|
| Current/default | 27 built-ins, Context7 + Playwright pending, 17 skills, 5 plugins | 15,251 cache-read + 6,382 cache-create = **21,633** | **$0.1441** |
| Lean | Bash/Edit/Read, no MCP, no skills | **6,145 cache-create** | **$0.1240** |

Command used for the lean measurement:

```sh
claude -p hi --output-format stream-json --verbose --max-turns 1 \
  --strict-mcp-config --disable-slash-commands --tools Bash,Edit,Read
```

This A/B test isolates **15,488 tokens (71.6%)** of the default `hi` prompt surface
as removable tools/MCP/skills/customization. The remaining approximately 6.1k is the
Claude CLI/model floor. The dollar saving in this particular run was only 13.9%
because most of the large default surface hit the 1-hour cache; after a cache miss,
the monetary saving is much larger.

The Agent Terminal briefing was not present in that `hi` measurement. In current
`server.js`, `briefing()` is 1,181 source words / 7,236 characters, roughly another
1.6–2.3k model tokens on every fresh session. Room transcript and tool results account
for the difference between this 21.6k isolated test and the observed 36–38k real wake.

The CLI does not expose a byte-by-byte split between its system prompt and JSON tool
schemas. The controlled tool/MCP A/B is therefore the reliable empirical split:

- irreducible Claude CLI/system floor: about 6.1k;
- removable default tool/plugin/MCP/skill surface: about 15.5k;
- Agent Terminal briefing: about 1.6–2.3k;
- remaining real-wake tokens: assignment, transcript, project instructions, and any
  carried session context.

I attempted the same standalone Codex measurement, but the ChatGPT-bundled binary
failed before inference with `failed to initialize in-process app-server client:
Operation not permitted`. Its user config shows eight enabled artifact/browser
plugins plus `node_repl`; these are all loaded even for a one-line file task. The
server can remove them safely for standard worker turns with `--ignore-user-config`,
then explicitly add back its required sandbox/network settings.

## Ranked changes

### 1. Give each turn a capability profile (very high savings, medium effort)

Do not give every agent every tool on every wake. Most worker turns need only files,
shell, and occasionally web. Browser/Playwright, Roblox, document, spreadsheet, and
presentation tools should appear only on a turn explicitly assigned that capability.

Add a lightweight capability parser to `AgentRunner`:

```js
turnCapabilities(prompt) {
  const text = prompt.toLowerCase();
  return {
    browser: /\b(browser-test|playwright|screenshot|visual qa)\b/.test(text),
    web: /\b(web|research|search|docs|latest)\b/.test(text),
    roblox: this.room.robloxMode,
  };
}
```

Compute it from the kept assignment immediately before `command()`:

```js
this.capabilities = this.turnCapabilities(prompt);
const { cmd, args } = this.command();
```

Quality guardrail: the lead must label assignments that need `browser-test`,
`research`, or `roblox`. If a worker discovers it needs a missing capability, it
reports that once and the lead re-runs the next turn with the label.

Expected raw prompt-token saving on ordinary Claude wakes: **about 60–72% of the
CLI/tool floor**, or approximately **15.5k tokens per cold wake** in this measurement.

### 2. Make Claude strict and lean by default (very high savings, low effort)

Patch `ClaudeAgent.command()` from:

```js
const args = ['-p', '--output-format', 'stream-json', '--verbose',
  '--dangerously-skip-permissions', '--max-turns', '12'];
```

to:

```js
const standardTools = this.role === 'lead'
  ? 'Read,Edit,Write'
  : 'Bash,Read,Edit,Write';
const tools = this.capabilities?.web
  ? `${standardTools},WebSearch,WebFetch`
  : standardTools;
const args = [
  '-p', '--output-format', 'stream-json', '--verbose',
  '--dangerously-skip-permissions', '--max-turns', '12',
  '--strict-mcp-config', '--disable-slash-commands',
  '--tools', tools,
];
```

`--allowedTools` is not enough: it changes permission but can leave schemas in the
prompt. `--tools` selects the actual built-in tool surface. `--strict-mcp-config`
prevents the globally configured Context7 and Playwright servers from loading.
`--disable-slash-commands` removes 17 advertised skills from ordinary turns.

For Roblox, keep strict mode and add only the existing config:

```js
if (this.capabilities?.roblox) {
  args.push('--mcp-config', MCP_ROBLOX_FILE);
}
```

For the one designated browser-test turn, either supply a dedicated Playwright-only
MCP JSON with `--mcp-config`, or deliberately omit strict mode for that turn until the
plugin command is moved into a dedicated config. Never load Context7 and Playwright
for the lead or normal coding workers.

Do not use `--bare`: it made the test CLI ignore the current subscription login and
return `Not logged in`. The strict/tools flags work with the existing authentication.

### 3. Start Codex standard turns without user plugins (high savings, low effort)

The current `~/.codex/config.toml` enables visualize, documents, PDF, spreadsheets,
presentations, templates, Sites, Browser, and the node REPL. A normal Agent Terminal
coding turn does not need those schemas.

Patch the non-resume command to include:

```js
const lean = this.capabilities?.browser || this.capabilities?.artifact
  ? []
  : ['--ignore-user-config'];
const args = this.sessionId
  ? ['exec', 'resume', this.sessionId, ...base, '-']
  : ['exec', ...lean, ...base, '-'];
```

Because `--ignore-user-config` preserves authentication, the existing `-c` arguments
still restore workspace sandboxing, network, web search, and disabled notifications.
However, a session must keep the same capability profile for its lifetime. Store
`sessionProfile`; rotate the session whenever the requested profile changes:

```js
if (this.sessionProfile !== requestedProfile) {
  this.sessionId = null;
  this.sessionTurns = 0;
  this.briefedV = 0;
}
this.sessionProfile = requestedProfile;
```

Quality guardrail: use the full existing config for browser/artifact assignments.
Standard code still retains shell, patching, file inspection, plans, and web search.

### 4. Replace the generated briefing with a compact contract (medium savings,
low effort)

The current briefing repeats 19 long rules, examples, and server-enforced behavior.
Keep detailed policy in a workspace `AGENTS.md`, but send a roughly 350-word core:

```text
You are NAME, a worker in project ID. Read MEMORY.md, TASKBOARD.md, and
.notes/NAME.md first. Do only the lead/user assignment. Shared workspace: never edit
a file another live agent owns. Claim work on TASKBOARD, implement, test, then report
in <=3 sentences. Use [SKIP] if no action; end [IDLE] when waiting. Files are served
at PREVIEW_URL. Preserve user changes and write beginner-friendly commented code.
```

Then add only the short lead or worker role paragraph. MEMORY/TASKBOARD carry-over is
unchanged. Estimated saving: **about 1.0–1.7k tokens per fresh session**.

### 5. Keep hot sessions when useful; rotate on size, not only turn count
(medium savings, medium effort)

The new 6/10-turn rotation bounds growth, but rotating a small session can throw away
a valuable 1-hour cache and recreate the 6k floor. Track each session's input tokens
and last-active time:

- keep it if under 80k context and active within 55 minutes;
- rotate above 80k, on capability-profile change, or after the current 6/10 hard cap;
- if idle longer than 55 minutes, rotate before the next turn because the cache is
  likely cold anyway.

This preserves cheap cache hits without allowing unbounded sessions. Persist
`sessionInputTokens`, `sessionLastActive`, and `sessionProfile` alongside
`sessionTurns`.

### 6. Avoid paying a model for mechanical acknowledgments (medium savings,
low effort)

The benchmark assignment “create one line and reply done” used a full model wake for
work the server could perform only because it was a test. In real workflows, do not
assign acknowledgment-only tasks. Also:

- batch all independent file changes into one worker turn;
- let the server post deterministic completion/status events rather than asking the
  lead to paraphrase each;
- debounce parallel worker reports for 500–800 ms so the lead receives one combined
  wake;
- keep the already-improved `MAX_AUTO_TURNS = 3` and 12-turn worker ceiling.

This saves an entire 6k–38k wake whenever a coordination-only round is eliminated,
with no reduction in implementation quality.

## Recommended safe rollout

1. Enable strict/lean Claude tools for the **lead only**, benchmark 10 normal commands.
2. Enable them for standard workers; keep one full-capability browser-test profile.
3. Add Codex `--ignore-user-config` only for fresh standard sessions and verify a
   code edit, web search, and syntax test.
4. Compact the briefing.
5. Add size/TTL/profile-aware session rotation and report tokens by capability profile.

Use a fixed benchmark with three meaningful tasks (small code edit, web research,
browser verification), not only `hi`. Compare task correctness, tool failures, fresh
input, cache input, output, cost, and elapsed time. The target is **50–65% fewer raw
input tokens on ordinary cold wakes** while keeping browser/artifact quality unchanged
through explicit full-capability turns.
