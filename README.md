# Agent Terminal

A multi-agent room where real CLI agents (Claude Code, Codex) chat with each other
and build software together in a shared workspace. Each project is a room with its
own files, chat history, task board, and team memory.

```bash
node server.js          # → http://localhost:4600
```

No dependencies — just Node and the agent CLIs you already have installed.

## How a room works

- **Projects** are tabs. Each one is `projects/<id>/` with a `workspace/` the agents share.
- **The lead** (👑) is the only agent you talk to. It plans, assigns work with
  `@mentions`, and posts `✅ DONE — …` when everything is finished.
- **Workers** wake only when the lead `@mentions` them, do the task, and report back.
- **`MEMORY.md`** is the team's long-term memory; **`TASKBOARD.md`** is who-owns-what.
  The agents maintain both themselves.
- Screenshots saved into the workspace are posted into the chat automatically.

### Task tags control cost

The lead tags every assignment, and the server routes on the tag:

| tag | effect |
|-----|--------|
| `[trivial]` | runs on a cheap fast model |
| `[normal]` | standard implementation (default) |
| `[hard]` | genuinely tricky work |
| `[browser]` | grants browser tools for that turn only |
| `[web]` | grants web search for that turn only |

Untagged turns run lean — files and shell only. That lean profile is roughly **40%
less context** than a full-surface turn, so keep tags off unless a task needs them.

## Configuration

All optional — the defaults are the safe local setup.

| env var | default | what it does |
|---------|---------|--------------|
| `AGENT_TERMINAL_HOME` | `~/.agent-terminal` | Where **your** rooms, roster and settings live. |
| `AGENT_TERMINAL_SKILLS` | *(unset)* | Directory of `SKILL.md` folders to share with every room. |
| `AGENT_TERMINAL_HOST` | `127.0.0.1` | Interface to bind. |
| `AGENT_TERMINAL_TOKEN` | *(unset)* | Shared secret. **Required** for any non-loopback host. |
| `CODEX_BIN` | ChatGPT.app's `codex` | Path to the Codex binary. |
| `GOOSE_BIN` | `goose` | Path to the Goose binary. |

### Engines

| engine | what it runs on |
|--------|-----------------|
| **Claude** | Claude Code CLI, your Anthropic plan |
| **Codex** | GPT-5 via the ChatGPT app's `codex` |
| **Goose** | whatever provider *your* Goose config points at — Ollama, a hosted endpoint, anything |

Goose is the easy way to bring local or self-hosted models into a room: configure
it once with `goose configure`, and the room just spawns it. Leave the model field
blank to use your Goose default, or set it explicitly (`ollama/qwen3-coder:30b`).

> Goose reads provider credentials from a keyring that a non-interactive child
> process can't reach, so export the key alongside the server or you'll get a
> misleading "no provider configured":
> ```bash
> TANZU_AI_API_KEY=… node server.js
> ```

### Your rooms live outside the checkout

Everything you make — projects, workspaces, agent roster, hidden-project list —
lives in `AGENT_TERMINAL_HOME`, **not** in this repo. That way two people can work
from the same code without seeing each other's rooms, and without `git pull`
overwriting one person's agent roster with the other's.

```
~/.agent-terminal/
  projects/<id>/state.json      chat history, sessions, token counters
  projects/<id>/workspace/      the files agents build
  agents.json                   your agent roster
  closed.json                   projects hidden from the tabs
```

Point it anywhere — including a private git repo of your own if you want your
rooms backed up or synced between machines:

```bash
AGENT_TERMINAL_HOME=~/my-agent-rooms node server.js
```

The first run after upgrading moves anything still sitting in the checkout into
your home directory automatically, one room at a time, without overwriting
anything already there.

### Reaching it from another device

The server binds loopback only, because every message you send spawns a CLI with
`--dangerously-skip-permissions` against files on this disk. Anyone who can reach
the port can run code on your machine, so exposing it takes a deliberate opt-in
**and** a token:

```bash
AGENT_TERMINAL_TOKEN=$(openssl rand -hex 24) \
AGENT_TERMINAL_HOST=0.0.0.0 node server.js
```

Open it once as `http://<host>:4600/?token=<your-token>`; the token is stored in a
cookie, so links, uploads and the live preview keep working after that.

> `CODEX_BIN` points inside ChatGPT.app on purpose. The `codex` on your `PATH` is
> often a broken npm shim (`ENOENT` on its vendored binary), which would kill every
> Codex turn. The server warns at startup if the binary is missing.

## Agents are per-project

`agents.json` is a **catalogue** of the engines you own. Each room picks its own
line-up from it:

- **+ connect agent** — adds to *this* project. Re-using the name of an agent you
  already own invites that same agent into this project instead of duplicating it.
- **✕ on an agent card** — removes it from *this* project only; it stays in the
  catalogue and in every other room.

Each agent has a token limit (its fuel gauge). When it runs out the agent is benched
until you raise the limit on its card.
