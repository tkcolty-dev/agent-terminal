#!/usr/bin/env node
/**
 * AGENT TERMINAL — multi-project rooms where real CLI agents (Claude Code,
 * Codex, Haiku) chat with each other and build things together.
 *
 * Each project = projects/<id>/ with its own workspace/, chat history,
 * agent sessions, and a MEMORY.md the agents maintain themselves.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 4600;
// Loopback by default: every /send spawns a CLI with --dangerously-skip-permissions
// against files on this disk, and there is no per-user login. Exposing that to a
// network needs a deliberate opt-in AND a shared secret (enforced below).
const HOST = process.env.AGENT_TERMINAL_HOST || '127.0.0.1';
const TOKEN = process.env.AGENT_TERMINAL_TOKEN || '';
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
if (!LOOPBACK && !TOKEN) {
  console.error(`refusing to bind ${HOST} without AGENT_TERMINAL_TOKEN set.\n` +
    `Anyone who can reach this port can run code on this machine. Either drop\n` +
    `AGENT_TERMINAL_HOST (loopback only) or set a long random token:\n` +
    `  AGENT_TERMINAL_TOKEN=$(openssl rand -hex 24) AGENT_TERMINAL_HOST=0.0.0.0 node server.js`);
  process.exit(1);
}

const ROOT = __dirname;

// ---------------------------------------------------------------- your data
// Everything you make lives OUTSIDE the checkout: rooms, roster, closed list.
// It used to live in the repo, which meant two people sharing this code shared
// each other's rooms — and pulling overwrote your agent roster with theirs.
//   AGENT_TERMINAL_HOME=~/my-rooms node server.js
// Point it at a git repo of your own if you want your rooms synced or backed up.
const expandHome = p => path.resolve(String(p).replace(/^~(?=$|\/)/, process.env.HOME || '~'));
const DATA_HOME = expandHome(
  process.env.AGENT_TERMINAL_HOME ||
  (process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'agent-terminal') : '~/.agent-terminal')
);
fs.mkdirSync(DATA_HOME, { recursive: true });

const PROJECTS_DIR = path.join(DATA_HOME, 'projects');
// Optional shared skill library (SKILL.md folders). Point this at a directory and
// every room links it in, so agents in a room can use the same curated skills you
// use everywhere else. Off unless set: skill *descriptions* load on every turn, so
// enabling it is a real (small) cost decision rather than a free win.
//   AGENT_TERMINAL_SKILLS=~/.claude/skills node server.js
const SKILLS_DIR = (() => {
  const p = process.env.AGENT_TERMINAL_SKILLS;
  if (!p) return null;
  const abs = path.resolve(p.replace(/^~(?=$|\/)/, process.env.HOME || '~'));
  if (!fs.existsSync(abs)) {
    console.warn(`⚠ AGENT_TERMINAL_SKILLS=${p} does not exist — shared skills disabled`);
    return null;
  }
  return abs;
})();
// Codex ships inside ChatGPT.app. This is deliberately NOT a bare `codex` PATH
// lookup: the npm-installed shim is frequently broken (ENOENT on its vendored
// binary), so resolving via PATH would silently kill every Codex turn.
const CODEX_BIN = process.env.CODEX_BIN || '/Applications/ChatGPT.app/Contents/Resources/codex';
// Goose (block/goose). Whatever provider you've configured it against — Tanzu,
// Ollama, anything — the room just spawns it and inherits that setup. Note that
// Goose resolves provider credentials through a keyring that a non-interactive
// child cannot reach, so export the key alongside the server:
//   TANZU_AI_API_KEY=… node server.js
const GOOSE_BIN = process.env.GOOSE_BIN || 'goose';
const MAX_AUTO_TURNS = 3;      // agent-to-agent turns allowed per user message (keep chatter cheap)
const ROTATE_WORKER_TURNS = 6; // fresh CLI session after this many turns (bounds context growth)
const ROTATE_LEAD_TURNS = 10;
const ROTATE_CTX_TOKENS = 80000;      // …or when resumed context crosses this size
const IDLE_COLD_MS = 55 * 60 * 1000;  // idle past this → cache is cold anyway, rotate
const INBOX_MAX_MSGS = 6;      // per-wake inbox: last N relevant messages…
const INBOX_MAX_CHARS = 6000;  // …capped at this many chars
const CHEAP_MODEL = 'claude-haiku-4-5-20251001'; // [trivial]-tagged tasks route here
const KEEPWARM_MS = 4.5 * 60 * 1000;  // ping resumed sessions just under the 5-min cache TTL
const TURN_TIMEOUT_MS = 15 * 60 * 1000;
const BRIEF_V = 13;            // bump to re-send the room briefing to existing agents (merged text = new version)
const JANITOR_EVERY = 20;      // cheap memory-janitor pass after this many room turns
const HISTORY_REPLAY = 200;    // messages a connecting client gets (older stay on disk)

// ---------------------------------------------------------------- migration
// v2 kept everything inside the checkout. Move it out, once, on first run — your
// rooms and roster follow you; the repo goes back to being just the code.
// Nothing is deleted: on a cross-device HOME this falls back to copy-and-keep.
// Rescues room-by-room rather than all-or-nothing, and runs on every boot, so it
// works no matter the order things happen in — including the case where someone
// pulls first and git strips projects/ from the checkout before this ever runs.
// Anything still sitting in the old location gets adopted; nothing is overwritten.
(function migrateOutOfRepo() {
  const legacyProjects = path.join(ROOT, 'projects');
  const move = (from, to) => {
    if (!fs.existsSync(from) || fs.existsSync(to)) return false;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try { fs.renameSync(from, to); }
    catch { fs.cpSync(from, to, { recursive: true }); fs.rmSync(from, { recursive: true, force: true }); } // EXDEV
    return true;
  };
  let moved = 0;
  if (fs.existsSync(legacyProjects)) {
    for (const e of fs.readdirSync(legacyProjects, { withFileTypes: true })) {
      if (e.isDirectory() && move(path.join(legacyProjects, e.name), path.join(PROJECTS_DIR, e.name))) moved++;
    }
    try { fs.rmdirSync(legacyProjects); } catch {} // only succeeds once it's empty
  }
  for (const f of ['agents.json', 'closed.json']) if (move(path.join(ROOT, f), path.join(DATA_HOME, f))) moved++;
  if (moved) console.log(`↪ moved ${moved} item(s) out of the checkout into ${DATA_HOME} — the repo now holds only code`);
})();

// v1 kept a single ./workspace + ./state.json — fold it into projects/drum-machine
if (!fs.existsSync(PROJECTS_DIR) && fs.existsSync(path.join(ROOT, 'workspace'))) {
  const dir = path.join(PROJECTS_DIR, 'drum-machine');
  fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(path.join(ROOT, 'workspace'), path.join(dir, 'workspace'));
  try {
    const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'state.json'), 'utf8'));
    // sessions were tied to the old cwd — reset them; MEMORY.md carries context
    old.agents = (old.agents || []).map(a => ({ id: a.id, sessionId: null, briefed: false, seenUpTo: (old.messages || []).length }));
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(old));
    fs.unlinkSync(path.join(ROOT, 'state.json'));
  } catch {}
  const mem = `# Team Memory — drum-machine

- Claude (Fable 5) built PD·8, a retro pocket drum machine, in index.html (step sequencer: kick/snare/hat/clap, 112 BPM, Space to play, pattern A1). Screenshots: pd8-desktop.png, pd8-mobile.png.
- Codex (GPT-5) reviewed it and recommends per-track MUTE/SOLO as the single highest-value improvement. Not built yet.
- Haiku joined the team as a fast worker. Claude suggested Haiku could take localStorage pattern saving when the user green-lights more work.
- Convention: whoever claims a file first owns it; announce claims in chat before touching shared files.
`;
  fs.writeFileSync(path.join(dir, 'workspace', 'MEMORY.md'), mem);
}
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// MCP config handed to Claude agents when a room has 🎮 Roblox mode on
const MCP_ROBLOX_FILE = path.join(DATA_HOME, 'mcp-roblox.json');
fs.writeFileSync(MCP_ROBLOX_FILE, JSON.stringify({
  mcpServers: { robloxstudio: { type: 'stdio', command: 'npx', args: ['-y', 'robloxstudio-mcp@latest'], env: {} } },
}, null, 1));

// ---------------------------------------------------------------- agents
class AgentRunner {
  constructor(room, opts) {
    this.room = room;
    Object.assign(this, opts); // id, name, color, model, modelFlag?
    this.sessionId = null;
    this.busy = false;
    this.seenUpTo = 0;
    this.briefed = false;
    this.proc = null;
    this.status = 'idle';
    this.briefedV = 0;
    this.tokens = { in: 0, out: 0, cached: 0, cost: 0 }; // in = fresh input; cached = cheap context re-reads
    this.stats = { turns: 0, ms: 0, files: 0, cmds: 0, searches: 0, lastActive: 0 };
    this.currentEdits = new Set(); // files touched during the in-flight turn
  }

  touchFile(name) {
    if (!name) return;
    this.currentEdits.add(name);
    this.room.broadcastClaims();
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.room.broadcast('status', { agent: this.id, status, detail, model: this.model });
  }
  activity(text) {
    if (!/^[📊♨]/u.test(text)) this.lastActivityText = text; // mid-turn heartbeat for teammates
    this.room.broadcast('activity', { agent: this.id, name: this.name, text, ts: Date.now() });
  }

  briefing() {
    const others = this.room.agents.filter(a => a !== this);
    const team = others.map(a => `- ${a.name} (model: ${a.model})${a.role === 'lead' ? ' — 👑 LEAD: plans & assigns all work' : ''}`).join('\n');
    return `You are ${this.name} (model: ${this.model}), one agent in a live multi-agent team room called AGENT TERMINAL. Current project: "${this.room.id}".

Your teammates in this room:
${team}

RULES OF THE ROOM:
1. Everything you output as your reply is posted to the shared chat — the user AND the other agents read it. Talk to them directly.
2. You all share this working directory. Files you create/edit are instantly visible to teammates and previewable by the user at http://localhost:${PORT}/preview/${this.room.id}/ (index.html is served).
3. TEAM MEMORY: the file MEMORY.md in your working directory is the team's long-term memory. Read it FIRST when you start. Append important decisions, conventions, and status there (short bullets) so the team never forgets — even across restarts.
4. COORDINATE, don't duplicate: claim tasks explicitly ("I'll take physics + input, you take rendering + UI"), then DO the work with your real tools (write/edit files, run commands) before replying.
5. Keep chat replies SHORT — a few sentences: what you did, what's next, what you need from teammates. No huge code dumps in chat; code goes in files.
6. If a teammate already claimed something, build on their files instead of rewriting them. Read their files before editing shared ones.
7. When you have nothing left to do and are waiting, end your reply with the exact token [IDLE]. When the task is fully done and verified, say so and end with [IDLE].
8. Disagreements: settle fast, pick the simplest path, keep momentum.
9. SEE AND TEST YOUR WORK — never declare something done without testing it:
   - The live preview is http://localhost:${PORT}/preview/${this.room.id}/ .
   - Claude-family agents: you get real browser tools ONLY on a turn whose task is tagged [browser]. On such a turn, load the preview, click through it, check the console, and SAVE SCREENSHOTS as .png files in the workspace — every image saved there is automatically shown to the user and teammates in the chat. On any other turn you have no browser: do not promise a screenshot you cannot take; say what you verified by reading code and ask for a [browser] turn if a visual check matters.
   - Codex: verify with real commands — curl the preview URL, run node scripts against your code, syntax-check. For visual checks, ask a Claude teammate to browser-test and screenshot.
10. WEB SEARCH: you can search the live web (Claude-family: WebSearch/WebFetch tools; Codex: native web_search). Use it for docs, APIs, assets, and ideas instead of guessing.
11. YOUR PRIVATE MEMORY: the file .notes/${this.name}.md in the workspace is YOURS alone — plans, learnings, todos, gotchas. Read it when you start a task, update it as you work. MEMORY.md stays for team-wide facts.
12. PLAN BEFORE BUILDING: for any sizable task, first agree on a quick plan in chat (parts, owners, order — a few lines max), THEN build. Post progress as you go ("physics done, starting enemies") so teammates can plan around you.
13. @MENTIONS: write @Name (e.g. @Codex) to direct a message — ONLY the mentioned agents get woken to reply; everyone else just reads it in the log later. Use directed asks instead of waking the whole team.
14. TASK BOARD: TASKBOARD.md in the workspace is the shared board (a markdown table: task | owner | status | files). CLAIM work there before starting, update your status (planning/working/testing/done) as you go, and check it before touching files another row owns.
15. LIVE STATUS: your prompt may include a "LIVE RIGHT NOW" section listing teammates who are mid-turn and the files they're editing. NEVER edit those files until they finish — pick other work or wait.
16. CHAT HYGIENE: describe changes as one-line summaries or tiny diffs — never paste whole files into chat. In MEMORY.md keep one section per topic and prune superseded bullets when you edit. If the shared browser is busy, retry shortly or verify via curl/node instead.
17. TEACHING CODE: the user reads your code to learn. Write beginner-friendly code — clear names, short functions, and generous comments that explain WHAT each chunk does in plain words (comment every function and any tricky line). Keep a README.md in the workspace that explains in simple language what each file does and how the pieces fit together; update it whenever the structure changes. In chat, explain things simply — no unexplained jargon.
18. TOKEN ECONOMY — tokens are precious; make every turn count:
   - If a message needs NOTHING from you, reply with exactly [SKIP] — it will not be posted and wakes nobody.
   - NEVER post acknowledgment-only replies ("ok", "got it", "holding", "standing by").
   - Bundle your work: do EVERYTHING needed in one turn, then ONE short reply (≤3 sentences). Ask all your questions at once instead of back-and-forth.
   - Don't re-read files you already know, don't re-verify what a teammate verified, don't re-explain what's already in chat.` +
   (this.role === 'lead' ? `

YOUR SPECIAL ROLE — YOU ARE THE LEAD (ORCHESTRATOR) 👑:
- USER COMMANDS ARE LAW. Do EXACTLY what the user asked — nothing more, nothing less. NEVER invent a project or pick a direction the user didn't give. If the request is ambiguous, ask the user ONE short clarifying question and assign NOTHING until they answer.
- The user often types by voice — if a message reads garbled or contradictory, confirm your reading in ONE short question BEFORE spending worker turns. A cheap question beats an expensive wrong build.
- ACCEPTANCE CHECKS: every [normal]/[hard] assignment must end with "CHECK: <how to verify it worked>". A task is not done until its checks are reported PASS with evidence.
- When the user gives an order, relay it to workers IMMEDIATELY in your first reply (@mention + concrete task). Don't sit on instructions.
- If the user says stop/pause/hold/wait in any form: assign nothing, tell workers to stand down, confirm in one line.
- The user's messages come to YOU. You own the plan, the TASKBOARD.md, and the final report.
- You do NOT build product code yourself (tiny fixes are fine) — you break work into clear tasks and assign each with an @mention. Workers ONLY wake when you @mention them.
- ASSIGNMENT FORMAT — scannable, one line per worker, nothing else:
  @Codex → [normal] build game.js (engine + input)
  @Claude → [normal][browser] style index.html, then browser-test
- TAG EVERY ASSIGNMENT (cost control — the server routes on these):
  [trivial] = one-liners/renames/acks → runs on a cheap fast model
  [normal] = standard implementation (default)   [hard] = genuinely tricky work
  [browser] = needs browser testing tools   [web] = needs web search
  Untagged turns run LEAN (files+shell only) — a worker missing a capability reports it once and you re-issue with the tag.
- Size every task so a worker can FINISH IT IN ONE TURN. Bigger jobs = several short rounds.
- Assign both workers in ONE message when tasks are independent, so they run in parallel.
- CHAIN HAND-OFFS FOR FREE: add [after:Name] to an assignment and the harness auto-starts it when Name finishes — no lead turn needed. Example: "@Claudious [normal][after:Codex] browser-test game.js. CHECK: page loads, no console errors."
- NEVER GO SILENT: after every worker report you MUST reply with either (a) the next one-line assignment(s), or (b) the finish line. The user must never wonder what's happening.
- YOU HAVE NO BROWSER AND NO SHELL. You can only read and write files. NEVER promise to browser-test, screenshot, curl or run anything yourself — delegate it: "@Worker → [browser] verify X and save shot.png". Assign visual checks; never claim them.
- THE FINISH LINE: when the user's request is fully done and verified, end with a line that starts with exactly "✅ DONE — " followed by a one-line summary. Put it on its own line. This triggers the big completion banner the user watches for. Never use it before everything is truly done.
- Be extremely token-frugal: short assignments, short reports, no filler.` :
   `
19. CHAIN OF COMMAND: this room has a LEAD agent who plans and assigns. You wake when the lead @mentions you with a task. Do the task fully, then reply once with results (the lead sees it automatically). Don't grab new scope the lead didn't assign — [SKIP] anything that isn't yours. EXCEPTION: if the USER @mentions you directly, that is a direct order — obey it exactly and immediately, it outranks the lead.
20. VERIFICATION CONTRACT: if your assignment has "CHECK:" lines, run each one and report PASS or FAIL per check with one line of evidence (command output, file content, or screenshot name). Never claim done with a failing or unrun check.`);
  }

  unseen() {
    return this.room.messages.slice(this.seenUpTo).filter(m => m.from !== this.id);
  }

  buildPrompt() {
    const all = this.room.messages.slice(this.seenUpTo);
    // Staged, NOT committed: if the CLI times out or crashes we must redeliver these
    // on the next wake. Committing here silently ate the instruction the agent was
    // woken for. runTurn() advances seenUpTo only after a turn actually succeeds.
    this.pendingSeenUpTo = this.room.messages.length;
    // inbox filter (token diet): drop system chatter, [IDLE] sign-offs, and
    // messages @aimed at other agents; keep only the last few, char-capped
    const relevant = all.filter(m => {
      if (m.from === this.id || m.from === 'system') return false;
      const targets = this.room.mentionTargets(m.text);
      if (targets.size && !targets.has(this.id)) return false;
      if (saidIdle(m.text) && !targets.has(this.id) && m.from !== 'user') return false;
      return true;
    });
    let kept = relevant.slice(-INBOX_MAX_MSGS), chars = 0;
    for (let i = kept.length - 1; i >= 0; i--) {
      chars += kept[i].text.length;
      if (chars > INBOX_MAX_CHARS && i < kept.length - 1) { kept = kept.slice(i + 1); break; }
    }
    const stamp = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const transcript = kept
      .map(m => `[${stamp(m.ts)}] ${m.from === 'user' ? 'USER' : m.name.toUpperCase()}: ${m.text}`)
      .join('\n\n');
    let prompt = '';
    if ((this.briefedV || 0) < BRIEF_V) {
      prompt += (this.briefedV ? '(Updated room briefing — rules have changed:)\n\n' : '') + this.briefing() + '\n\n';
      this.briefedV = BRIEF_V;
    }
    // cache-safe ordering: stable stuff first, volatile status LAST
    prompt += `--- NEW MESSAGES IN THE ROOM ---\n${transcript}\n--- END ---\n\n`;
    if (this.room.robloxMode) {
      prompt += `NOTE: 🎮 ROBLOX MODE is ON for this room. Claude-family agents have Roblox Studio MCP tools (get_file_tree, create_object, set_script_source, execute_luau, start_playtest, capture_screenshot, …) — Roblox Studio must be open with the MCP plugin for them to respond. Codex has no Studio access: Codex writes Luau/logic into workspace files, Claude-family agents apply and test them in Studio. Verify changes with playtest output or a Studio screenshot saved to the workspace.\n\n`;
    }
    const live = this.room.agents.filter(a => a !== this && a.busy);
    if (live.length) {
      prompt += `--- LIVE RIGHT NOW (current, not cached) ---\n` + live.map(a =>
        `${a.name} is mid-turn${a.currentEdits.size ? `, editing: ${[...a.currentEdits].join(', ')} — do NOT touch these files` : ''}${a.lastActivityText ? ` (last action: ${a.lastActivityText})` : ''}`
      ).join('\n') + `\n--- END LIVE ---\n\n`;
    }
    prompt += `Do any real work needed (files/commands in the shared workspace), then post your short reply to the room.`;
    return prompt;
  }

  // Session rotation: --resume sessions grow forever and re-bill at full price
  // after the prompt-cache TTL. A fresh session with MEMORY.md carry-over keeps
  // cost linear instead of quadratic. Rotate on turn cap, context size, capability
  // profile change, or when idle so long the cache is cold anyway.
  shouldRotateSession(profile) {
    if (!this.sessionId) return false;
    const cap = this.role === 'lead' ? ROTATE_LEAD_TURNS : ROTATE_WORKER_TURNS;
    if ((this.sessionTurns || 0) >= cap) return true;
    if ((this.sessionCtx || 0) > ROTATE_CTX_TOKENS) return true;
    if (this.sessionLastActive && Date.now() - this.sessionLastActive > IDLE_COLD_MS) return true;
    if (this.sessionProfile && profile !== this.sessionProfile) return true; // lean↔full toolset switch
    return false;
  }

  // Capability + model hints parsed from the pending assignment text.
  // The lead tags tasks: [browser] [web] [trivial] [hard] (see briefing).
  turnCapabilities(text) {
    const t = text.toLowerCase();
    return {
      browser: /\[browser\]|browser-test|playwright|screenshot|visual qa/.test(t),
      web: /\[web\]|web.search|research\b|look up|latest docs/.test(t),
      roblox: this.room.robloxMode,
      trivial: /\[trivial\]/.test(t),
      hard: /\[hard\]/.test(t),
    };
  }

  async runTurn() {
    this.busy = true;
    this.setStatus('thinking');
    const t0 = Date.now();
    const beforeTok = { ...this.tokens };
    this.stats.turns++;
    this.stats.lastActive = t0;
    this.currentEdits = new Set();
    // parse capability/model hints from what this agent is about to read
    const pendingText = this.room.messages.slice(this.seenUpTo)
      .filter(m => m.from !== this.id).map(m => m.text).join('\n');
    this.capabilities = this.turnCapabilities(pendingText);
    this.turnModelOverride = (this.capabilities.trivial && this.role !== 'lead') ? CHEAP_MODEL : null;
    // lead-turn downgrade: pure routing/review wakes (no user message pending) don't need the flagship model
    if (this.role === 'lead' && !this.modelFlag) {
      const hasUserMsg = this.room.messages.slice(this.seenUpTo).some(mm => mm.from === 'user');
      if (!hasUserMsg) this.turnModelOverride = 'claude-sonnet-5';
    }
    const profile = JSON.stringify([!!this.capabilities.browser, !!this.capabilities.web, !!this.capabilities.roblox, this.turnModelOverride]);
    if (this.shouldRotateSession(profile)) {
      this.sessionId = null;
      this.briefedV = 0; // fresh session needs the (cached) briefing again
      this.sessionTurns = 0;
      this.sessionCtx = 0;
      this.activity('♻ fresh session (cost control) — carrying over via MEMORY.md');
    }
    this.sessionProfile = profile;
    this.sessionTurns = (this.sessionTurns || 0) + 1;
    this.sessionLastActive = Date.now();
    const prompt = this.buildPrompt();
    try {
      const reply = await this.spawnTurn(prompt);
      this.seenUpTo = this.pendingSeenUpTo; // commit: the agent really did read these
      const text = (reply || '').trim();
      // [SKIP] = agent explicitly had nothing to say — post nothing, wake nobody
      if (text && !text.toUpperCase().startsWith('[SKIP]')) this.room.post(this.id, this.name, text);
      else this.activity('⏭ turn ended with nothing to post'); // visible, so silence is never a mystery
    } catch (err) {
      // crashed turns are announced (this wakes the lead so it can re-assign), file locks
      // released, and seenUpTo stays put so the unhandled messages are redelivered next wake
      this.room.sys(`⚠ ${this.name}'s turn failed after ${Math.round((Date.now() - t0) / 1000)}s: ${String(err).slice(0, 200)} — locks released, its messages will be redelivered.`);
    } finally {
      this.stats.ms += Date.now() - t0;
      this.stats.lastActive = Date.now();
      // per-turn cost telemetry (the agents asked for this themselves)
      const d = {
        in: this.tokens.in - beforeTok.in,
        cached: (this.tokens.cached || 0) - (beforeTok.cached || 0),
        out: this.tokens.out - beforeTok.out,
        cost: this.tokens.cost - beforeTok.cost,
      };
      if (d.in || d.cached || d.out) {
        const secs = Math.round((Date.now() - t0) / 1000);
        this.activity(`📊 ${kfmtSrv(d.in)} fresh · ${kfmtSrv(d.cached)} cached ${d.cached > d.in ? '(hit)' : '(cold)'}` +
          `${d.cost > 0 ? ' · $' + d.cost.toFixed(3) : ''} · ${secs}s${this.turnModelOverride ? ' · routed→haiku' : ''}`);
      }
      this.busy = false;
      this.currentEdits = new Set();
      this.setStatus('idle');
      this.proc = null;
      this.room.saveState();
      this.room.broadcastClaims();
      this.room.broadcast('agents', { agents: this.room.agentList() }); // refresh token meters
      checkLimitWarnings(this);
      broadcastUsage();
      this.room.turnsSinceJanitor = (this.room.turnsSinceJanitor || 0) + 1;
      this.room.scheduleTurns();
      this.room.deadAirCheck();
      this.room.armKeepWarm();
      this.room.maybeJanitor();
    }
  }

  kill() {
    clearTimeout(this._warmTimer);
    if (this.proc) { try { this.proc.kill('SIGTERM'); } catch {} }
  }

  // Keep-warm: the CLI prompt cache dies after ~5 idle minutes and the next wake
  // re-bills the whole session fresh. While the room has pending work, ping idle
  // resumed sessions just under the TTL so they stay at cache-read price.
  async keepWarm() {
    if (this.busy || !this.sessionId || !this.room.running) return;
    if (!this.room.agents.some(a => a !== this && a.busy)) return; // room quiet → let it go cold
    this.busy = true;
    try {
      this.activity('♨ cache keep-warm ping');
      await this.spawnTurn('(cache keep-warm — no action needed, reply exactly [SKIP])');
      this.sessionLastActive = Date.now();
    } catch {}
    this.busy = false;
    this.proc = null;
    this.room.saveState();
    this.room.armKeepWarm();
    this.room.scheduleTurns(); // anything that arrived while warming
  }

  spawnTurn(prompt) {
    return new Promise((resolve, reject) => {
      const { cmd, args } = this.command();
      const proc = spawn(cmd, args, { cwd: this.room.workspace, env: { ...process.env } });
      this.proc = proc;
      let errTail = '';
      let finalText = null;
      const texts = [];
      const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('turn timed out')); }, TURN_TIMEOUT_MS);

      let buf = '';
      proc.stdout.on('data', chunk => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
          if (!line || line[0] !== '{') continue;
          let ev; try { ev = JSON.parse(line); } catch { continue; }
          const t = this.handleEvent(ev, texts);
          if (t != null) finalText = t;
        }
      });
      proc.stderr.on('data', c => { errTail = (errTail + c).slice(-2000); });
      proc.on('error', e => { clearTimeout(timer); reject(e); });
      proc.on('close', code => {
        clearTimeout(timer);
        if (finalText == null && texts.length) finalText = texts.join('\n\n');
        if (finalText != null) resolve(finalText);
        else if (code !== 0) reject(new Error(`exit ${code}: ${errTail.slice(-300)}`));
        else resolve('');
      });
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }
}

let lastRateLimit = null; // latest Claude plan window info seen from any agent

class ClaudeAgent extends AgentRunner {
  command() {
    const caps = this.capabilities || {};
    // tag-enforced turn budgets: [trivial] gets 4 tool-steps, [hard] gets 24, default 12
    const maxTurns = caps.trivial ? '4' : caps.hard ? '24' : '12';
    // --setting-sources project: load THIS project's settings, never the operator's
    // ~/.claude. Without it every agent inherits the operator's personal CLAUDE.md,
    // hooks and plugins — leaking private notes into the room, bleeding a foreign
    // output style into chat, and paying for all of it on every single turn.
    // Measured cold-start context: lean 10,109 -> 5,970; browser 31,357 -> 20,919.
    // OAuth/plan billing is preserved (unlike --bare, which forces an API key).
    const args = ['-p', '--output-format', 'stream-json', '--verbose',
      '--dangerously-skip-permissions', '--max-turns', maxTurns,
      '--setting-sources', 'project'];
    if (caps.browser) {
      // ADDITIVE, not a bypass: browser turns keep the config isolation above and
      // only give up --strict-mcp-config so the browser MCP can resolve. They do
      // NOT re-enable the operator's whole plugin/skill surface.
    } else {
      // LEAN PROFILE (measured -71.6% cold-start): core tools only, no plugins/skills/MCP
      // tag-scoped power: [trivial] turns can only read/edit — no shell, no new files
      const base = caps.trivial ? 'Read,Edit'
        : this.role === 'lead' ? 'Read,Edit,Write' : 'Bash,Read,Edit,Write';
      let tools = caps.web ? `${base},WebSearch,WebFetch` : base;
      args.push('--strict-mcp-config');
      // --disable-slash-commands means "disable all skills", so it can't be set on a
      // turn that is meant to have them. [trivial] turns stay skill-free either way:
      // they are one-liners, and skill descriptions are not worth their context.
      if (SKILLS_DIR && !caps.trivial) tools += ',Skill';
      else args.push('--disable-slash-commands');
      args.push('--tools', tools);
    }
    if (caps.roblox) args.push('--mcp-config', MCP_ROBLOX_FILE); // Studio tools only when the room wants them
    const model = this.turnModelOverride || this.modelFlag;
    if (model) args.push('--model', model);
    if (this.sessionId) args.push('--resume', this.sessionId);
    return { cmd: 'claude', args };
  }
  handleEvent(ev, texts) {
    if (ev.type === 'system' && ev.subtype === 'init') {
      this.sessionId = ev.session_id;
      // don't let a [trivial] Haiku-routed turn overwrite the agent's real model label
      if (ev.model && !this.turnModelOverride) this.model = ev.model;
      this.setStatus('thinking');
    } else if (ev.type === 'rate_limit_event' && ev.rate_limit_info) {
      lastRateLimit = ev.rate_limit_info;
    } else if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'tool_use') {
          this.setStatus('working');
          if (block.name === 'Write' || block.name === 'Edit') {
            this.stats.files++;
            this.touchFile(path.basename(block.input?.file_path || ''));
          }
          else if (block.name === 'Bash') this.stats.cmds++;
          else if (block.name === 'WebSearch' || block.name === 'WebFetch') this.stats.searches++;
          this.activity(describeClaudeTool(block));
        }
      }
    } else if (ev.type === 'result') {
      if (ev.session_id) this.sessionId = ev.session_id;
      const u = ev.usage || {};
      this.tokens.in += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      this.tokens.cached = (this.tokens.cached || 0) + (u.cache_read_input_tokens || 0);
      this.tokens.out += u.output_tokens || 0;
      this.tokens.cost += ev.total_cost_usd || 0;
      // resumed-context size estimate for size-based rotation
      this.sessionCtx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      return typeof ev.result === 'string' ? ev.result : '';
    }
    return null;
  }
}

function describeClaudeTool(block) {
  const i = block.input || {};
  const f = p => p ? path.basename(p) : '';
  switch (block.name) {
    case 'Write': return `✏️ writing ${f(i.file_path)}`;
    case 'Edit': return `✏️ editing ${f(i.file_path)}`;
    case 'Read': return `👁 reading ${f(i.file_path)}`;
    case 'Bash': return `$ ${String(i.command || '').slice(0, 80)}`;
    case 'Glob': case 'Grep': return `🔍 searching ${i.pattern || ''}`;
    case 'WebSearch': return `🌐 searching web: ${String(i.query || '').slice(0, 60)}`;
    case 'WebFetch': return `🌐 reading ${String(i.url || '').slice(0, 60)}`;
    default: return `⚙ ${block.name}`;
  }
}

class CodexAgent extends AgentRunner {
  command() {
    // NOTE: `codex exec resume` rejects --sandbox; sandbox must go through -c.
    const base = ['--json', '--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"',
      '-c', 'sandbox_workspace_write.network_access=true', '-c', 'tools.web_search=true', '-c', 'notify=[]'];
    // LEAN PROFILE: skip the user's 8 artifact/browser plugins on standard coding turns
    // (auth is preserved; the -c args above restore sandbox/network/web-search)
    const lean = (this.capabilities?.browser) ? [] : ['--ignore-user-config'];
    const args = this.sessionId
      ? ['exec', 'resume', this.sessionId, ...base, '-']
      : ['exec', ...lean, ...base, '-'];
    return { cmd: CODEX_BIN, args };
  }
  handleEvent(ev, texts) {
    if (ev.type === 'thread.started' && ev.thread_id) {
      this.sessionId = ev.thread_id;
      this.setStatus('thinking');
    } else if (ev.type === 'item.started' || ev.type === 'item.completed') {
      const item = ev.item || {};
      if (item.type === 'command_execution' && ev.type === 'item.started') {
        this.setStatus('working');
        this.stats.cmds++;
        this.activity(`$ ${String(item.command || '').slice(0, 80)}`);
      } else if (item.type === 'file_change' && ev.type === 'item.completed') {
        this.setStatus('working');
        this.stats.files += (item.changes || []).length || 1;
        for (const c of item.changes || []) this.touchFile(path.basename(c.path || ''));
        const files = (item.changes || []).map(c => path.basename(c.path || '')).join(', ');
        this.activity(`✏️ changed ${files || 'files'}`);
      } else if (item.type === 'web_search' && ev.type === 'item.completed') {
        this.stats.searches++;
        this.activity(`🌐 searched: ${String(item.query || '').slice(0, 60)}`);
      } else if (item.type === 'reasoning' && ev.type === 'item.completed') {
        this.setStatus('thinking');
      } else if (item.type === 'agent_message' && ev.type === 'item.completed' && item.text) {
        texts.push(item.text);
      }
    } else if (ev.type === 'turn.completed') {
      const u = ev.usage || {};
      const cached = u.cached_input_tokens || 0;
      this.tokens.in += Math.max(0, (u.input_tokens || 0) - cached);
      this.tokens.cached = (this.tokens.cached || 0) + cached;
      this.tokens.out += (u.output_tokens || 0);
      this.sessionCtx = u.input_tokens || 0; // resumed-context size for rotation
      return texts.length ? texts.join('\n\n') : '';
    }
    return null;
  }
}

// Goose speaks the same streaming-JSON idea as Claude Code, so this is mostly a
// different event vocabulary. Two real differences:
//  - sessions are named by US rather than assigned by the CLI, so resuming needs
//    no id to be parsed out — but a rotation must pick a NEW name, or --resume
//    would drag the old context back in and defeat the rotation.
//  - it prints an ASCII banner to stdout before any JSON; spawnTurn already
//    ignores lines that don't start with '{'.
class GooseAgent extends AgentRunner {
  command() {
    // rotation counter in the name: shouldRotateSession() clears sessionId, and a
    // fresh name is what actually gives us a fresh context
    if (!this.sessionId) this.gooseRun = (this.gooseRun || 0) + 1;
    const name = `at-${this.room.id}-${this.id}-${this.gooseRun || 1}`;
    const args = ['run', '--output-format', 'stream-json', '-i', '-', '--name', name];
    if (this.sessionId) args.push('--resume');
    else this.sessionId = name; // first turn creates it; later turns resume it
    const model = this.turnModelOverride || this.modelFlag;
    if (model) args.push('--model', model);
    return { cmd: GOOSE_BIN, args };
  }

  handleEvent(ev, texts) {
    if (ev.type === 'message' && ev.message) {
      for (const block of ev.message.content || []) {
        if (block.type === 'toolRequest') {
          const call = block.toolCall?.value || {};
          this.setStatus('working');
          this.activity(describeGooseTool(call, this));
        } else if (block.type === 'text' && ev.message.role === 'assistant' && block.text) {
          texts.push(block.text);
        }
      }
    } else if (ev.type === 'complete') {
      // total_tokens is null on providers that don't report usage (e.g. Ollama),
      // so the meters stay at zero rather than showing an invented number.
      const t = ev.total_tokens || 0;
      this.tokens.in += t;
      this.sessionCtx = t;
      return texts.length ? texts.join('\n\n') : '';
    }
    return null;
  }
}

function describeGooseTool(call, agent) {
  const a = call.arguments || {};
  const f = p => p ? path.basename(String(p)) : '';
  switch (call.name) {
    case 'write': case 'text_editor':
      agent.stats.files++; agent.touchFile(f(a.path));
      return `✏️ writing ${f(a.path)}`;
    case 'shell':
      agent.stats.cmds++;
      return `$ ${String(a.command || '').slice(0, 80)}`;
    case 'read':
      return `👁 reading ${f(a.path)}`;
    default:
      return `⚙ ${call.name || 'tool'}`;
  }
}

// ---- ROSTER: persisted in agents.json, editable live from the UI.
const AGENTS_FILE = path.join(DATA_HOME, 'agents.json');
// Lean default duo — connect more agents anytime via the + connect agent dialog.
// Claude leads by default: in a leaderless room every message wakes EVERY agent, so
// cost scales with roster size whether or not there is work to do. With a lead, the
// user talks to one agent and it fans work out via @mentions.
const DEFAULT_DEFS = [
  { id: 'claude', name: 'Claude', color: '#ff9668', type: 'claude', model: 'claude (loading…)', role: 'lead' },
  { id: 'codex', name: 'Codex', color: '#58c4dc', type: 'codex', model: 'gpt-5 · codex-cli 0.145' },
];
let agentDefs;
try { agentDefs = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); } catch { agentDefs = DEFAULT_DEFS; }
function saveDefs() { fs.writeFileSync(AGENTS_FILE, JSON.stringify(agentDefs, null, 1)); }

const PALETTE = ['#ff9668', '#58c4dc', '#d2a8ff', '#7ee787', '#f778ba', '#ffd33d', '#79c0ff', '#ffa198'];
function nextColor() {
  const used = new Set(agentDefs.map(d => d.color));
  return PALETTE.find(c => !used.has(c)) || PALETTE[agentDefs.length % PALETTE.length];
}

// ---- usage limits (global per agent, across all projects)
function kfmtSrv(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'k' : String(n); }
function agentLimit(id) { const d = agentDefs.find(x => x.id === id); return (d && d.limit) || null; }
function tokTotal(t) { return (t.in || 0) + (t.cached || 0) + (t.out || 0); }
function globalAgentTokens(id) {
  let t = 0;
  for (const r of rooms.values()) {
    const a = r.agents.find(x => x.id === id);
    if (a) t += tokTotal(a.tokens);
  }
  return t;
}
const limitWarned = {}; // id -> highest threshold already announced (50 or 90)
function checkLimitWarnings(agent) {
  const lim = agentLimit(agent.id);
  if (!lim) { delete limitWarned[agent.id]; return; }
  const pct = globalAgentTokens(agent.id) / lim * 100;
  const prev = limitWarned[agent.id] || 0;
  if (pct >= 90 && prev < 90) { limitWarned[agent.id] = 90; agent.room.sys(`⚠ ${agent.name} is at ${Math.round(pct)}% of its ${kfmtSrv(lim)}-token limit`); }
  else if (pct >= 50 && prev < 50) { limitWarned[agent.id] = 50; agent.room.sys(`◔ ${agent.name} passed half of its ${kfmtSrv(lim)}-token limit`); }
}

function buildAgent(room, def) {
  const Cls = def.type === 'codex' ? CodexAgent : def.type === 'goose' ? GooseAgent : ClaudeAgent;
  return new Cls(room, { ...def });
}
// agents.json is a CATALOGUE of engines you own; each room picks its own line-up
// from it (room.members). Previously the roster was global, so connecting one agent
// posted a join notice into every project at once — the space-shooter room's entire
// history was twelve such notices from projects nobody was looking at.
function makeAgents(room) {
  return agentDefs.filter(def => room.members.includes(def.id)).map(def => buildAgent(room, def));
}

function saidIdle(t) { return /\[IDLE\]\s*$/i.test(t.trim()); }

// The finish line is matched on ANY line, not just the first. The briefing asks the
// lead to open its final message with "✅ DONE — …", but in practice it reports its
// review first and signs off at the bottom. Anchoring to the start of the message
// meant a completed task neither fired the banner nor satisfied deadAirCheck, so the
// user was told the room had stalled at the exact moment it had finished.
const DONE_RE = /^\s*✅\s*DONE\b.*/im;
function saidDone(t) { return DONE_RE.test(String(t)); }
function doneLine(t) {
  const m = DONE_RE.exec(String(t));
  return (m ? m[0] : String(t)).trim().replace(/\[IDLE\]\s*$/i, '').trim().slice(0, 200);
}

// Small talk carries no work, so it must never cost a model turn. Without the
// greeting half of this, a bare "hi" woke every agent in the room: each one burned
// a full frontier turn introducing itself, then several more telling each other
// they had nothing to do. The server answers greetings itself instead (see /send).
const ACK_RE = /^(ok(ay)?|k|thanks?( you)?|ty|nice( one)?|good( job| work)?|got it|cool|great|perfect|awesome|👍|sounds good)[.!? 🙂👍]*$/i;
const GREETING_RE = /^(hi+|hey+|hello+|yo|sup|hiya|howdy|greetings|g'?day|(good )?(morning|afternoon|evening)|gm|test(ing)?|ping|you there|anyone (there|home))[.!? 🙂👋]*$/i;
function isAck(t) { return ACK_RE.test(String(t).trim()); }
function isGreeting(t) { return GREETING_RE.test(String(t).trim()); }
function isSmallTalk(t) { return isAck(t) || isGreeting(t); }

// Link the shared skill library into a room's workspace at PROJECT level.
// It has to be project-level: agents spawn with --setting-sources project, which
// deliberately ignores the operator's ~/.claude, and that excludes user-level
// skills along with everything else. A project-level .claude/skills survives it.
// Conveniently this is also the path Goose and opencode look in, so one link
// serves every engine once those adapters exist.
function linkSkills(workspace) {
  if (!SKILLS_DIR) return;
  const dir = path.join(workspace, '.claude');
  const link = path.join(dir, 'skills');
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.lstatSync(link, { throwIfNoEntry: false })) {
      if (fs.realpathSync(link) === fs.realpathSync(SKILLS_DIR)) return; // already correct
      fs.rmSync(link, { recursive: true, force: true });                 // repoint a stale link
    }
    fs.symlinkSync(SKILLS_DIR, link, 'dir');
  } catch (err) {
    console.warn(`⚠ could not link skills into ${workspace}: ${err.message}`);
  }
}

// ---------------------------------------------------------------- rooms
class Room {
  constructor(id) {
    this.id = id;
    this.dir = path.join(PROJECTS_DIR, id);
    this.workspace = path.join(this.dir, 'workspace');
    this.stateFile = path.join(this.dir, 'state.json');
    fs.mkdirSync(this.workspace, { recursive: true });
    const memFile = path.join(this.workspace, 'MEMORY.md');
    if (!fs.existsSync(memFile)) {
      fs.writeFileSync(memFile, `# Team Memory — ${id}\n\n(Agents: keep short bullets here — decisions, conventions, status. One section per topic; prune superseded bullets.)\n`);
    }
    const boardFile = path.join(this.workspace, 'TASKBOARD.md');
    if (!fs.existsSync(boardFile)) {
      fs.writeFileSync(boardFile, `# Task Board — ${id}\n\n| task | owner | status | files |\n|------|-------|--------|-------|\n`);
    }
    linkSkills(this.workspace); // no-op unless AGENT_TERMINAL_SKILLS is set
    this.messages = [];
    this.clients = new Set();
    const saved = this.readState();
    // Rooms saved before per-room membership existed have no `members` key — those
    // keep the whole catalogue so nobody's line-up changes under them on upgrade.
    this.members = Array.isArray(saved && saved.members)
      ? saved.members.filter(id => agentDefs.some(d => d.id === id))
      : agentDefs.map(d => d.id);
    this.agents = makeAgents(this);
    this.autoTurns = 0;
    this.running = true;
    this.talkMode = 'turns'; // 'turns' = one agent speaks at a time; 'parallel' = free-for-all
    this.robloxMode = false; // when true, Claude agents load the Roblox Studio MCP tools
    this.capNoticeShown = false;
    this.lastTree = '';
    this.saveTimer = null;
    this.imgPrev = new Map();   // image sizes last tick (write-stability check)
    this.imgPosted = null;      // image sizes already posted to chat (null = not baselined)
    this.loadState(saved);
  }

  // Raw read, separated from apply so the constructor can learn `members` before it
  // builds the agents. A corrupt file is preserved and reported rather than swallowed:
  // the old bare `catch {}` made "state.json is truncated" and "brand new project"
  // look identical, so a room could silently lose its entire history.
  readState() {
    let raw;
    try { raw = fs.readFileSync(this.stateFile, 'utf8'); }
    catch { return null; } // genuinely new room
    try { return JSON.parse(raw); }
    catch (err) {
      const bak = `${this.stateFile}.corrupt-${Date.now()}`;
      try { fs.writeFileSync(bak, raw); } catch {}
      console.error(`[${this.id}] state.json unreadable (${err.message}). Kept a copy at ${path.basename(bak)}; starting this room empty.`);
      return null;
    }
  }

  loadState(s) {
    try {
      if (!s) return;
      this.messages.push(...(s.messages || []));
      if (s.talkMode) this.talkMode = s.talkMode;
      this.robloxMode = !!s.robloxMode;
      for (const sa of s.agents || []) {
        const a = this.agents.find(x => x.id === sa.id);
        if (a) {
          a.sessionId = sa.sessionId || null;
          a.briefedV = sa.briefedV || (sa.briefed ? 1 : 0); // legacy boolean = v1
          a.seenUpTo = Math.min(sa.seenUpTo || 0, this.messages.length);
          if (sa.tokens) a.tokens = sa.tokens;
          if (sa.stats) a.stats = { ...a.stats, ...sa.stats };
          if (sa.model) a.model = sa.model;
          a.sessionTurns = sa.sessionTurns || 0;
          a.sessionCtx = sa.sessionCtx || 0;
          a.sessionLastActive = sa.sessionLastActive || 0;
          a.sessionProfile = sa.sessionProfile || null;
        }
      }
    } catch {}
  }

  saveState() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const state = {
        talkMode: this.talkMode,
        robloxMode: this.robloxMode,
        members: this.members,
        messages: this.messages,
        agents: this.agents.map(a => ({
          id: a.id, sessionId: a.sessionId, briefedV: a.briefedV || 0, seenUpTo: a.seenUpTo,
          tokens: a.tokens, stats: a.stats, model: a.model, sessionTurns: a.sessionTurns || 0,
          sessionCtx: a.sessionCtx || 0, sessionLastActive: a.sessionLastActive || 0, sessionProfile: a.sessionProfile || null,
        })),
      };
      // Atomic: a crash partway through a plain writeFile leaves a truncated
      // state.json, which used to read back as an empty room. Write beside it,
      // then rename — rename is atomic on POSIX, so readers see old or new, never half.
      const tmp = `${this.stateFile}.tmp`;
      fs.writeFile(tmp, JSON.stringify(state), err => {
        if (err) return console.error(`[${this.id}] state write failed: ${err.message}`);
        fs.rename(tmp, this.stateFile, e => {
          if (e) console.error(`[${this.id}] state rename failed: ${e.message}`);
        });
      });
    }, 300);
  }

  broadcast(type, data) {
    const line = `data: ${JSON.stringify({ type, ...data })}\n\n`;
    for (const res of this.clients) res.write(line);
  }

  post(from, name, text, img) {
    const m = { n: this.messages.length, from, name, text, ts: Date.now() };
    if (img) m.img = img;
    this.messages.push(m);
    this.broadcast('msg', m);
    // the lead declaring "✅ DONE" fires the completion banner in the UI
    const lead = this.agents.find(a => a.role === 'lead');
    if (lead && from === lead.id && saidDone(text)) {
      this.broadcast('done', { text: doneLine(text) });
    }
    this.saveState();
    return m;
  }
  sys(text) { this.post('system', 'system', text); }

  // While any agent is working, keep the other agents' resumed sessions warm
  // (gated: nobody busy → no pings, so an idle room costs zero).
  armKeepWarm() {
    for (const a of this.agents) {
      clearTimeout(a._warmTimer);
      if (a.busy || !a.sessionId) continue;
      if (!this.agents.some(x => x !== a && x.busy)) continue;
      a._warmTimer = setTimeout(() => a.keepWarm(), KEEPWARM_MS);
    }
  }

  // Every JANITOR_EVERY turns, a cheap lean model tidies MEMORY.md/TASKBOARD.md
  // (merge dupes, prune stale bullets, archive finished work) so context stops rotting.
  maybeJanitor() {
    if (this.janitorRunning) return;
    if ((this.turnsSinceJanitor || 0) < JANITOR_EVERY) return;
    if (this.agents.some(a => a.busy)) return; // only in a quiet moment
    this.janitorRunning = true;
    this.turnsSinceJanitor = 0;
    const args = ['-p', '--output-format', 'json', '--max-turns', '8', '--dangerously-skip-permissions',
      '--strict-mcp-config', '--disable-slash-commands', '--tools', 'Read,Edit,Write', '--model', CHEAP_MODEL];
    const proc = spawn('claude', args, { cwd: this.workspace, env: { ...process.env } });
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3 * 60 * 1000);
    proc.on('close', code => {
      clearTimeout(timer);
      this.janitorRunning = false;
      if (code === 0) this.sys('🧹 memory janitor tidied MEMORY.md / TASKBOARD.md (merged dupes, archived stale entries)');
    });
    proc.on('error', () => { clearTimeout(timer); this.janitorRunning = false; });
    proc.stdin.write(`You are the memory janitor for this project workspace. Tidy exactly two files and nothing else:
1. MEMORY.md — merge duplicate bullets, delete superseded/contradictory ones, move finished-project info into MEMORY-archive.md (create if missing).
2. TASKBOARD.md — move done rows that are no longer relevant into an "## Archive" section at the bottom.
Preserve every fact that is still current. Do not add commentary. Reply with just: tidied.`);
    proc.stdin.end();
  }

  // If the lead spoke, assigned nobody, and the room went quiet — tell the user why nothing is happening.
  deadAirCheck() {
    if (this.agents.some(a => a.busy)) return;
    const last = this.messages[this.messages.length - 1];
    if (!last) return;
    const lead = this.agents.find(a => a.role === 'lead');
    if (!lead || last.from !== lead.id) return;
    if (this.mentionTargets(last.text).size) return;          // it assigned someone
    if (saidDone(last.text)) return;                          // it finished
    if (last.text.includes('?')) return;                       // it asked the user something
    if (this._deadAirAt === last.n) return;                     // already hinted for this message
    this._deadAirAt = last.n;
    this.sys('💤 Boss spoke but assigned nobody — the room is idle. Reply to nudge it, or @mention a worker directly.');
  }

  claimsMap() {
    const claims = {};
    for (const a of this.agents) {
      if (!a.busy) continue;
      for (const f of a.currentEdits) claims[f] = { id: a.id, name: a.name, color: a.color };
    }
    return claims;
  }
  broadcastClaims() { this.broadcast('claims', { claims: this.claimsMap() }); }

  // @Name tokens that match a real agent (case-insensitive; first word of
  // multi-word names counts, so "@Claudious" matches "Claudious (Opus 4.8)")
  mentionTargets(text) {
    const targets = new Set();
    for (const m of String(text).matchAll(/@([A-Za-z0-9_-]+)/g)) {
      const tok = m[1].toLowerCase();
      const a = this.agents.find(x => {
        const nm = x.name.toLowerCase();
        return nm === tok || nm.split(/[^a-z0-9]+/)[0] === tok || x.id === tok;
      });
      if (a) targets.add(a.id);
    }
    return targets;
  }

  // Does this message wake this agent? (@mentions route; [IDLE] doesn't wake;
  // with a lead in the room: user+worker messages go to the lead, lead assigns via @mentions)
  wakes(m, agent) {
    if (m.from === agent.id) return false;
    // crash reports wake the lead so it can re-assign instead of waiting forever
    if (m.from === 'system') return agent.role === 'lead' && m.text.startsWith('⚠');
    // small-talk gate: acks and greetings never wake a model — zero tokens
    if (isSmallTalk(m.text)) return false;
    // task dependencies: "[after:Codex]" holds this wake until Codex posts a reply later than the assignment
    const dep = m.text.match(/\[after:\s*@?([A-Za-z0-9_-]+)\]/i);
    if (dep) {
      const w = this.agents.find(x => x.name.toLowerCase().split(/[^a-z0-9]+/)[0] === dep[1].toLowerCase() || x.id === dep[1].toLowerCase());
      if (w && w !== agent && !this.messages.some(x => x.from === w.id && x.n > m.n)) return false;
    }
    const targets = this.mentionTargets(m.text);
    if (targets.size) return targets.has(agent.id); // routed: only mentioned agents wake
    const lead = this.agents.find(a => a.role === 'lead');
    if (lead) {
      if (m.from === 'user') return agent === lead;      // user talks to the boss
      if (m.from === lead.id) return false;              // boss must @mention to assign
      return agent === lead && !saidIdle(m.text);        // worker reports wake the boss
    }
    if (m.from === 'user') return true;
    return !saidIdle(m.text);
  }

  scheduleTurns() {
    if (!this.running) return;
    const oneAtATime = this.talkMode !== 'parallel';
    if (oneAtATime && this.agents.some(a => a.busy)) return; // someone's speaking — wait your turn
    for (const agent of this.agents) {
      if (agent.busy) continue;
      // batch worker reports: the lead reviews everything in ONE wake once workers are done
      if (agent.role === 'lead' && this.agents.some(a => a !== agent && a.busy)) continue;
      const unseen = this.messages.slice(agent.seenUpTo);
      if (!unseen.length) continue;
      const wakers = unseen.filter(m => this.wakes(m, agent));
      if (!wakers.length) continue; // stays asleep; unseen still delivered as context on next wake
      const lim = agentLimit(agent.id);
      if (lim && globalAgentTokens(agent.id) >= lim) {
        if (!agent.limitNotified) {
          agent.limitNotified = true;
          this.sys(`⛔ ${agent.name} hit its ${kfmtSrv(lim)}-token usage limit and is benched — raise the limit on its card to let it keep working.`);
        }
        continue;
      }
      agent.limitNotified = false;
      const userWake = wakers.some(m => m.from === 'user');
      // The lead is exempt from the chatter cap. It only ever wakes to review worker
      // reports and then either assign the next step or post "✅ DONE". Counting its
      // turns meant a single round (lead + 2 workers = 3) hit the cap exactly when the
      // lead was due to close the loop, so the finish line and its banner never fired
      // — and workers filled the silence by inventing unassigned scope.
      const exempt = userWake || agent.role === 'lead';
      if (!exempt) {
        if (this.autoTurns >= MAX_AUTO_TURNS) {
          if (!this.capNoticeShown) {
            this.capNoticeShown = true;
            this.sys(`⏸ auto-chat paused after ${MAX_AUTO_TURNS} worker turns — send a message to keep them going.`);
          }
          continue;
        }
        this.autoTurns++;
      }
      agent.runTurn(); // async
      if (oneAtATime) return; // next agent gets scheduled when this turn finishes
    }
  }

  listTree(dir = this.workspace, prefix = '', depth = 0) {
    if (depth > 4) return [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    const out = [];
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...this.listTree(path.join(dir, e.name), rel, depth + 1));
      else {
        let size = 0; try { size = fs.statSync(path.join(dir, e.name)).size; } catch {}
        out.push({ path: rel, size });
      }
    }
    return out;
  }

  agentList() {
    return this.agents.map(a => ({
      id: a.id, name: a.name, color: a.color, model: a.model, status: a.status, role: a.role || null,
      tokens: a.tokens, stats: a.stats,
      limit: agentLimit(a.id), usedGlobal: globalAgentTokens(a.id),
    }));
  }

  addAgent(def) {
    if (this.agents.some(x => x.id === def.id)) return; // already in this room
    const a = buildAgent(this, def);
    a.seenUpTo = this.messages.length; // don't react to old history
    this.agents.push(a);
    if (!this.members.includes(def.id)) this.members.push(def.id);
    this.broadcast('agents', { agents: this.agentList() });
    this.sys(`🔌 ${def.name} joined this project`);
    this.saveState();
  }

  removeAgent(id) {
    const a = this.agents.find(x => x.id === id);
    if (!a) return;
    a.kill();
    this.agents = this.agents.filter(x => x !== a);
    this.members = this.members.filter(x => x !== id);
    this.broadcast('agents', { agents: this.agentList() });
    this.sys(`🔌 ${a.name} left this project`);
    this.saveState();
  }

  hello() {
    return {
      type: 'hello',
      project: this.id,
      projects: listProjects(),
      // Replay a bounded tail, not the whole log. Nothing is deleted — older messages
      // stay in state.json — but a long-running room shouldn't push an ever-growing
      // transcript at every reconnect.
      messages: this.messages.slice(-HISTORY_REPLAY),
      truncated: Math.max(0, this.messages.length - HISTORY_REPLAY),
      agents: this.agentList(),
      files: this.listTree(),
      claims: this.claimsMap(),
      paused: !this.running,
      talkMode: this.talkMode,
      robloxMode: this.robloxMode,
      usage: { room: roomUsage(this), global: globalUsage(), rateLimit: lastRateLimit },
      port: PORT,
    };
  }
}

// closed projects: hidden from tabs but kept on disk; reopen by creating same name
const CLOSED_FILE = path.join(DATA_HOME, 'closed.json');
let closedProjects = [];
try { closedProjects = JSON.parse(fs.readFileSync(CLOSED_FILE, 'utf8')); } catch {}
function saveClosed() { fs.writeFileSync(CLOSED_FILE, JSON.stringify(closedProjects)); }

const rooms = new Map();
function getRoom(id) {
  id = slug(id);
  if (!id) return null;
  if (!rooms.has(id)) rooms.set(id, new Room(id));
  return rooms.get(id);
}
function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
}
function listProjects() {
  try {
    return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && !closedProjects.includes(e.name))
      .map(e => e.name).sort();
  } catch { return []; }
}

// Non-creating lookup. getRoom() makes a project directory for whatever name it is
// handed, which is right for "+ new project" and wrong everywhere else — a typo'd
// name in an upload URL used to silently conjure a project.
function existingRoom(id) {
  id = slug(id);
  if (!id) return null;
  if (rooms.has(id)) return rooms.get(id);
  return listProjects().includes(id) ? getRoom(id) : null;
}

// Resolve a client-supplied path inside a room's workspace, or null if it escapes.
// The previous guard was `file.startsWith(room.workspace)` — a string-prefix test,
// not a path-boundary test. Any sibling directory whose name merely BEGINS with
// "workspace" shares that prefix, so `../workspace-anything/secret` resolved outside
// the sandbox and passed the check, for reads and for PUT uploads alike.
function inWorkspace(room, rel) {
  const ws = path.resolve(room.workspace);
  const file = path.resolve(ws, String(rel || '').replace(/^[/\\]+/, ''));
  if (file !== ws && !file.startsWith(ws + path.sep)) return null;
  return file;
}

function shutRoom(id) { // kill turns + drop from memory (files untouched)
  const room = rooms.get(id);
  if (!room) return;
  room.running = false;
  for (const a of room.agents) a.kill();
  for (const res of room.clients) { try { res.end(); } catch {} }
  rooms.delete(id);
}
function broadcastAll(type, data) {
  for (const room of rooms.values()) room.broadcast(type, data);
}

function roomUsage(room) {
  let tok = 0, fresh = 0, cost = 0;
  for (const a of room.agents) { tok += tokTotal(a.tokens); fresh += (a.tokens.in || 0) + (a.tokens.out || 0); cost += a.tokens.cost || 0; }
  return { tok, fresh, cost };
}
function globalUsage() {
  let tok = 0, fresh = 0, cost = 0;
  for (const r of rooms.values()) { const u = roomUsage(r); tok += u.tok; fresh += u.fresh; cost += u.cost; }
  return { tok, fresh, cost };
}
function broadcastUsage() {
  const global = globalUsage();
  for (const room of rooms.values()) {
    room.broadcast('usage', { room: roomUsage(room), global, rateLimit: lastRateLimit });
  }
}

// boot existing projects; guarantee at least one
for (const id of listProjects()) getRoom(id);
if (!rooms.size) getRoom('playground');

// ---------------------------------------------------------------- file watcher
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.clients.size && !room.agents.some(a => a.busy)) continue;
    const tree = room.listTree();
    const key = JSON.stringify(tree);
    if (key !== room.lastTree) { room.lastTree = key; room.broadcast('files', { files: tree }); }

    // post new/changed screenshots to the chat once their size is stable
    const imgs = tree.filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f.path));
    if (room.imgPosted === null) {
      room.imgPosted = new Map(imgs.map(f => [f.path, f.size]));
    } else {
      for (const f of imgs) {
        if (room.imgPosted.get(f.path) === f.size) continue;
        if (room.imgPrev.get(f.path) === f.size) { // unchanged across 2 ticks = fully written
          room.imgPosted.set(f.path, f.size);
          room.post('system', 'system', `📸 ${f.path}`, f.path);
        }
      }
    }
    room.imgPrev = new Map(imgs.map(f => [f.path, f.size]));
  }
}, 2000);

// ---------------------------------------------------------------- http server
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain', '.md': 'text/plain' };

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}
// Auth gate. Inactive on a loopback bind with no token set (the default, unchanged
// local experience); mandatory for any other bind. Present the token once as
// ?token=… and it is stored in a cookie, so the SSE stream, uploads, the preview
// iframe and plain links all keep working without threading it through every URL.
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function authed(req, res, url) {
  if (!TOKEN) return true;
  if (safeEqual(url.searchParams.get('token') || '', TOKEN)) {
    res.setHeader('Set-Cookie', `at=${encodeURIComponent(TOKEN)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
    return true;
  }
  const c = /(?:^|;\s*)at=([^;]+)/.exec(req.headers.cookie || '');
  return !!c && safeEqual(decodeURIComponent(c[1]), TOKEN);
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (!authed(req, res, url)) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('unauthorized — open this server once with ?token=<your AGENT_TERMINAL_TOKEN>');
    return;
  }

  if (p === '/') return serveFile(res, path.join(ROOT, 'public', 'index.html'));
  if (p === '/usage') return serveFile(res, path.join(ROOT, 'public', 'usage.html'));

  // /status/<project> — always-current snapshot page, zero agent tokens
  const sm = p.match(/^\/status\/([^/]+)\/?$/);
  if (sm && rooms.get(sm[1])) {
    const room = rooms.get(sm[1]);
    const u = roomUsage(room);
    const esc2 = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = room.agents.map(a => `<tr>
      <td style="color:${a.color};font-weight:700">${esc2(a.name)}${a.role === 'lead' ? ' 👑' : ''}</td>
      <td>${a.busy ? '⚙ working' : '● ready'}</td>
      <td>${esc2(a.lastActivityText || '—')}</td>
      <td class="n">${a.stats.turns}</td><td class="n">${kfmtSrv(tokTotal(a.tokens))}</td>
      <td class="n">${a.tokens.cost ? '~$' + a.tokens.cost.toFixed(2) : '—'}</td></tr>`).join('');
    const lastDone = [...room.messages].reverse().find(m => /^✅\s*DONE/i.test(m.text.trim()));
    const warns = room.messages.filter(m => m.from === 'system' && m.text.startsWith('⚠')).slice(-3);
    let board = ''; try { board = fs.readFileSync(path.join(room.workspace, 'TASKBOARD.md'), 'utf8'); } catch {}
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><meta http-equiv="refresh" content="5"><title>STATUS — ${esc2(room.id)}</title>
<body style="background:#0a0e14;color:#c8d3e0;font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:28px;max-width:1000px;margin:0 auto">
<h2 style="letter-spacing:2px;color:#5c6b80">STATUS — ${esc2(room.id)} <span style="font-size:11px">(live, refreshes every 5s · <a style="color:#7ee787" href="/?project=${encodeURIComponent(room.id)}">terminal</a> · <a style="color:#7ee787" href="/preview/${encodeURIComponent(room.id)}/">preview</a>)</span></h2>
<table border=0 cellpadding=7 style="border-collapse:collapse;width:100%;background:#0f141c;border:1px solid #1e2836">
<tr style="color:#5c6b80;font-size:10px;letter-spacing:1px"><th align=left>AGENT</th><th align=left>STATE</th><th align=left>LAST ACTION</th><th>TURNS</th><th>TOKENS</th><th>COST</th></tr>${rows}</table>
<p style="margin-top:14px">💰 room total: <b>${kfmtSrv(u.tok)}</b> tokens · <b>~$${u.cost.toFixed(2)}</b> ${room.running ? '' : ' · <b style="color:#febc2e">⏸ PAUSED</b>'}</p>
${lastDone ? `<p style="color:#7ee787">last finish: ${esc2(lastDone.text.slice(0, 160))}</p>` : ''}
${warns.length ? `<p style="color:#ff5f57">recent problems:<br>${warns.map(w => esc2(w.text.slice(0, 140))).join('<br>')}</p>` : ''}
<h3 style="letter-spacing:2px;color:#5c6b80;margin-top:20px">TASK BOARD</h3>
<pre style="background:#0f141c;border:1px solid #1e2836;padding:12px;white-space:pre-wrap">${esc2(board)}</pre></body>`);
    return;
  }

  if (p === '/usage.json') {
    const data = {
      updated: Date.now(),
      rateLimit: lastRateLimit,
      global: globalUsage(),
      rooms: [...rooms.values()].map(r => ({
        id: r.id,
        usage: roomUsage(r),
        agents: r.agents.map(a => ({
          id: a.id, name: a.name, color: a.color, model: a.model, status: a.status,
          type: a instanceof CodexAgent ? 'codex' : a instanceof GooseAgent ? 'goose' : 'claude',
          tokens: a.tokens, stats: a.stats,
        })),
      })),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (p === '/events') {
    // never resurrect a deleted/closed project just because a stale client reconnects
    const want = slug(url.searchParams.get('project') || '');
    const avail = listProjects();
    const room = getRoom(avail.includes(want) ? want : (avail[0] || 'playground'));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(room.hello())}\n\n`);
    room.clients.add(res);
    req.on('close', () => room.clients.delete(res));
    return;
  }

  if (p === '/send' && req.method === 'POST') {
    const { text, project } = await readBody(req);
    const room = existingRoom(project);
    if (room && text && text.trim()) {
      const cmd = text.trim().toLowerCase().replace(/[!.…\s]+$/, '');
      if (cmd === 'stop' || cmd === 'halt') {
        // typed commands act INSTANTLY, like the buttons — then agents get told
        room.running = false;
        for (const a of room.agents) a.kill();
        room.post('user', 'You', text.trim());
        room.sys('⏹ stopped instantly — agent turns killed. Say anything to resume.');
        room.broadcast('paused', { paused: true });
      } else if (cmd === 'pause' || cmd === 'wait' || cmd === 'hold') {
        room.running = false;
        room.post('user', 'You', text.trim());
        room.sys('⏸ paused instantly — current turns finish, nothing new starts. Say anything to resume.');
        room.broadcast('paused', { paused: true });
      } else {
        room.running = true; room.autoTurns = 0; room.capNoticeShown = false;
        for (const a of room.agents) a.limitNotified = false; // benched agents re-announce so silence is explained
        room.broadcast('paused', { paused: false });
        room.post('user', 'You', text.trim());
        if (isSmallTalk(text)) {
          // Answered here for zero model tokens. scheduleTurns() would wake nobody
          // anyway — say so, so a friendly "hi" reads as handled rather than ignored.
          room.sys(isGreeting(text)
            ? '👋 Room is live and your agents are standing by — tell them what to build.'
            : '👍 Noted — no agents woken, no tokens spent.');
        } else room.scheduleTurns();
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
    return;
  }

  if (p === '/stop' && req.method === 'POST') {
    const { project } = await readBody(req);
    const room = existingRoom(project);
    if (room) {
      room.running = false;
      for (const a of room.agents) a.kill();
      room.sys('⏹ stopped — agent turns killed. Hit Resume or send a message to continue.');
      room.broadcast('paused', { paused: true });
    }
    res.writeHead(200); res.end('{"ok":true}');
    return;
  }

  if (p === '/talkmode' && req.method === 'POST') {
    const { project, mode } = await readBody(req);
    const room = existingRoom(project);
    if (room && ['turns', 'parallel'].includes(mode)) {
      room.talkMode = mode;
      room.saveState();
      room.sys(mode === 'turns' ? '🗣 one-at-a-time mode — agents now take turns speaking.' : '🗫 all-at-once mode — agents may talk in parallel.');
      room.broadcast('talkmode', { mode });
      room.scheduleTurns();
    }
    res.writeHead(200); res.end('{"ok":true}');
    return;
  }

  if (p === '/roblox' && req.method === 'POST') {
    const { project, on } = await readBody(req);
    const room = existingRoom(project);
    if (room) {
      room.robloxMode = !!on;
      room.saveState();
      room.sys(on
        ? '🎮 Roblox mode ON — Claude agents now load Roblox Studio tools. Open Roblox Studio with the MCP plugin before assigning Studio work.'
        : '🎮 Roblox mode OFF.');
      room.broadcast('roblox', { on: room.robloxMode });
    }
    res.writeHead(200); res.end('{"ok":true}');
    return;
  }

  // PUT /upload/<project>/<path> — drop files (game files, photos…) into a workspace
  const um = p.match(/^\/upload\/([^/]+)\/(.+)$/);
  if (um && req.method === 'PUT') {
    const room = existingRoom(um[1]);
    if (!room) { res.writeHead(404); res.end('no such project'); return; }
    const rel = decodeURIComponent(um[2]).replace(/^\/+/, '');
    const file = inWorkspace(room, rel);
    if (!file) { res.writeHead(403); res.end('outside the workspace'); return; }
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 200 * 1024 * 1024) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.concat(chunks));
      room.sys(`⬆ you added ${rel} (${size > 1048576 ? (size/1048576).toFixed(1)+' MB' : Math.ceil(size/1024)+' kB'})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }

  if (p === '/pause' && req.method === 'POST') {
    const { project } = await readBody(req);
    const room = existingRoom(project);
    if (room && room.running) {
      room.running = false; // in-flight turns finish; no new turns start
      room.sys('⏸ paused — current turns will finish, then everyone holds.');
      room.broadcast('paused', { paused: true });
    }
    res.writeHead(200); res.end('{"ok":true}');
    return;
  }

  if (p === '/resume' && req.method === 'POST') {
    const { project } = await readBody(req);
    const room = existingRoom(project);
    if (room && !room.running) {
      room.running = true;
      room.sys('▶ resumed.');
      room.broadcast('paused', { paused: false });
      room.scheduleTurns();
    }
    res.writeHead(200); res.end('{"ok":true}');
    return;
  }

  if (p === '/agents/add' && req.method === 'POST') {
    const { name, type, modelFlag, role, project } = await readBody(req);
    const room = existingRoom(project);
    if (!room) { res.writeHead(404); res.end('{"error":"no such project"}'); return; }
    const id = slug(name);
    if (!id || !['claude', 'codex', 'goose'].includes(type)) { res.writeHead(400); res.end('{"error":"bad agent"}'); return; }
    // Re-using a catalogue name is now how you invite an engine you already own into
    // another project, so it is a success case rather than a 409.
    const existing = agentDefs.find(d => d.id === id);
    if (existing) {
      if (room.agents.some(a => a.id === id)) { res.writeHead(409); res.end('{"error":"already in this project"}'); return; }
      room.addAgent(existing);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id, reused: true }));
      return;
    }
    if (role === 'lead' && agentDefs.some(d => d.role === 'lead')) { res.writeHead(409); res.end('{"error":"there is already a lead"}'); return; }
    const def = {
      id, name: name.trim(), color: nextColor(), type,
      model: type === 'codex' ? 'gpt-5 · codex-cli 0.145'
        : type === 'goose' ? (modelFlag || 'goose')
        : (modelFlag || 'claude'),
    };
    if (role === 'lead') def.role = 'lead';
    if (type !== 'codex' && modelFlag) def.modelFlag = modelFlag;
    agentDefs.push(def);
    saveDefs();
    room.addAgent(def); // this project only — not every open room
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  if (p === '/agents/limit' && req.method === 'POST') {
    const { id, tokens } = await readBody(req);
    const def = agentDefs.find(d => d.id === id);
    if (!def) { res.writeHead(404); res.end('{"error":"no such agent"}'); return; }
    def.limit = tokens > 0 ? Math.floor(tokens) : null;
    delete limitWarned[id];
    saveDefs();
    for (const room of rooms.values()) {
      const a = room.agents.find(x => x.id === id);
      if (a) a.limitNotified = false;
      room.broadcast('agents', { agents: room.agentList() });
      room.scheduleTurns(); // a raised limit may un-bench the agent
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  // Removing an agent takes it out of ONE project by default. Pass forget:true to
  // also drop it from the catalogue (and therefore from every project).
  if (p === '/agents/remove' && req.method === 'POST') {
    const { id, project, forget } = await readBody(req);
    if (forget) {
      agentDefs = agentDefs.filter(d => d.id !== id);
      saveDefs();
      for (const room of rooms.values()) room.removeAgent(id);
    } else {
      const room = existingRoom(project);
      if (!room) { res.writeHead(404); res.end('{"error":"no such project"}'); return; }
      room.removeAgent(id);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  if (p === '/projects' && req.method === 'POST') {
    const { name } = await readBody(req);
    const id = slug(name);
    if (!id) { res.writeHead(400); res.end('{"error":"bad name"}'); return; }
    if (closedProjects.includes(id)) { closedProjects = closedProjects.filter(x => x !== id); saveClosed(); } // reopen
    getRoom(id);
    broadcastAll('projects', { projects: listProjects() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  if (p === '/projects/close' && req.method === 'POST') {
    const { id } = await readBody(req);
    if (rooms.has(id) || fs.existsSync(path.join(PROJECTS_DIR, id))) {
      if (!closedProjects.includes(id)) { closedProjects.push(id); saveClosed(); }
      const remaining = listProjects();
      const room = rooms.get(id);
      if (room) room.broadcast('projects', { projects: remaining }); // redirect its viewers BEFORE cutting them off
      shutRoom(id);
      broadcastAll('projects', { projects: remaining });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  if (p === '/projects/delete' && req.method === 'POST') {
    const { id } = await readBody(req);
    const dir = path.join(PROJECTS_DIR, id);
    if (fs.existsSync(dir)) {
      const room = rooms.get(id);
      if (room) { room.running = false; for (const a of room.agents) a.kill(); } // stop writers before moving the dir
      const trash = path.join(DATA_HOME, '.trash');
      fs.mkdirSync(trash, { recursive: true });
      fs.renameSync(dir, path.join(trash, `${id}-${Date.now()}`)); // recoverable, not rm -rf
      closedProjects = closedProjects.filter(x => x !== id); saveClosed();
      const remaining = listProjects();
      if (room) room.broadcast('projects', { projects: remaining }); // redirect its viewers BEFORE cutting them off
      shutRoom(id);
      broadcastAll('projects', { projects: remaining });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  // /preview/<project>/<path...>
  let m = p.match(/^\/preview\/([^/]+)\/?(.*)$/);
  if (p === '/preview' || p === '/preview/' || (m && !rooms.get(m[1]))) {
    // dead or project-less preview link (agents sometimes post these) → friendly picker
    const links = listProjects().map(id =>
      `<li style="margin:8px 0"><a style="color:#7ee787;font-size:18px" href="/preview/${encodeURIComponent(id)}/">▶ ${id}</a></li>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<body style="background:#0a0e14;color:#c8d3e0;font-family:ui-monospace,Menlo,monospace;padding:40px">
      <h2 style="letter-spacing:2px;color:#5c6b80">THAT PREVIEW LINK WAS INCOMPLETE — PICK A PROJECT:</h2><ul style="list-style:none;padding:0">${links}</ul></body>`);
    return;
  }
  if (m) {
    const room = existingRoom(m[1]);
    if (!room) { res.writeHead(404); res.end('no such project'); return; } // (picker route above handles the friendly case)
    const rel = decodeURIComponent(m[2]) || 'index.html';
    const file = inWorkspace(room, rel);
    if (!file) { res.writeHead(403); res.end('outside the workspace'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return serveFile(res, path.join(file, 'index.html'));
    return serveFile(res, file);
  }

  // /file/<project>/<path...> raw viewer
  m = p.match(/^\/file\/([^/]+)\/(.*)$/);
  if (m) {
    const room = existingRoom(m[1]);
    if (!room) { res.writeHead(404); res.end('no such project'); return; }
    const file = inWorkspace(room, decodeURIComponent(m[2]));
    if (!file) { res.writeHead(403); res.end('outside the workspace'); return; }
    const ext = path.extname(file).toLowerCase();
    if (MIME[ext] && MIME[ext] !== 'text/html') return serveFile(res, file); // images etc. render natively
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return fs.readFile(file, (e, d) => res.end(e ? 'not found' : d));
  }

  res.writeHead(404); res.end('not found');
});

// Fail loudly at boot rather than once per turn: a missing Codex binary otherwise
// surfaces only as every Codex turn dying with a spawn error inside the chat log.
if (agentDefs.some(d => d.type === 'codex') && !fs.existsSync(CODEX_BIN)) {
  console.warn(`⚠ Codex binary not found at ${CODEX_BIN}\n` +
    `  Codex agents will fail every turn. Install the ChatGPT desktop app, or set CODEX_BIN.\n` +
    `  (Note: the 'codex' on PATH is often a broken npm shim — prefer the app's binary.)`);
}

server.listen(PORT, HOST, () => {
  console.log(`AGENT TERMINAL → http://${LOOPBACK ? 'localhost' : HOST}:${PORT}${TOKEN ? '/?token=…' : ''}`);
  if (!LOOPBACK) console.log(`⚠ bound ${HOST} — reachable off this machine; token auth is ON`);
  console.log(`projects: ${listProjects().join(', ')}`);
  // boot sweep: pick up any messages that arrived before a restart/crash so a
  // stuck room recovers on its own instead of waiting for the user to speak again
  setTimeout(() => { for (const room of rooms.values()) room.scheduleTurns(); }, 1500);
});
