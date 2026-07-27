# Round-2 harness feedback — Boss (lead seat) — 2026-07-27

Written for the user, in plain language. Rule for this round: **only NEW topics**
that were NOT in FEEDBACK-SUMMARY.md, and every item explains itself —
what it means, why it matters, what to build. No jargon without a definition.

---

## 1. Crash recovery — what happens when an agent dies mid-task?

**What it means:** Right now, if a worker's turn errors out halfway (API hiccup,
timeout, killed process), the room just... goes quiet. The task board still says
"working", the file lock may still look held, and nobody is told.

**Why it matters:** The lead can't tell "still thinking" apart from "dead".
I either wait forever or wake the worker again and pay for a full re-run.

**What to build:** When a turn ends abnormally, post an automatic system line in
chat ("⚠ Codex's turn failed: timeout after 120s") and clear that worker's file
locks. Then the lead can re-assign immediately instead of guessing.

---

## 2. Task dependencies — "do B after A finishes"

**What it means:** I can only assign tasks *now*. I can't say "when Codex
finishes game.js, automatically wake Claudious to test it." I have to sit in the
middle and manually relay every hand-off.

**Why it matters:** Every hand-off costs one full lead turn on the most
expensive model, just to say "your turn now."

**What to build:** Let an assignment declare a dependency ("start after task #4
is done"). The harness watches the board and fires the next wake itself. The
lead only gets involved when something goes wrong.

---

## 3. Direct agent-to-agent replies without bouncing through the lead

**What it means:** Workers can @mention each other, but the culture (and cost
rules) push everything through me. A tiny question like "Codex, what did you
name the score variable?" becomes: worker asks → I wake → I relay → other
worker wakes → answers → I confirm.

**Why it matters:** Three expensive turns for a one-word answer.

**What to build:** A cheap "quick question" lane: a worker can send one short
question to one teammate and get one short answer back, capped in length, on a
cheap model, without the lead waking at all. The exchange still shows in the log.

---

## 4. Memory files grow forever — nobody's job is to prune them

**What it means:** MEMORY.md and the .notes files only ever get *appended* to.
The rules say "prune superseded bullets," but no one is ever woken specifically
to do that, so old, wrong, or finished-project info piles up.

**Why it matters:** Every agent reads MEMORY.md every session. Stale bullets
waste tokens on every single wake, and worse, agents may act on outdated facts
(e.g. "Breakout is the current project" when it isn't).

**What to build:** A scheduled cheap-model "janitor" pass (say, every 20 turns):
merge duplicates, delete superseded bullets, archive finished projects into a
MEMORY-archive.md that is NOT auto-loaded. Same for the task board — done rows
older than the current project move to an archive section.

---

## 5. The user has no "dashboard" — only the chat scroll

**What it means:** The user's only window into the room is the chat log. To know
"what is everyone doing right now, what's done, what's blocked, what did today
cost," they have to scroll and read.

**Why it matters:** Chat is a *stream*; status is a *snapshot*. Mixing them
means the answer to "where are we?" is always buried.

**What to build:** A tiny always-current status page (could be one HTML file we
already know how to serve): each agent's current task and state, the last
finish line, open blockers, and running cost today. The harness updates it; no
agent tokens spent.

---

## 6. Permissions are all-or-nothing

**What it means:** Every agent in the room has the same powers: full shell, any
file, web access. A [trivial] one-line rename task runs with the same authority
as a [hard] refactor.

**Why it matters:** Mistakes scale with power. A confused cheap-model turn with
full shell access can delete files it was never meant to touch. (It also makes
the user's approval prompts noisier than they need to be.)

**What to build:** Tie permissions to the task tag: [trivial] = can only edit
the files named in the assignment; [normal] = workspace only; [hard] = full
powers. The assignment already names the files — enforce it.

---

## 7. No way to practice on a copy — every experiment is live

**What it means:** When we tried risky changes (like editing server.js — the
very program running us), we edited the real thing. There's no built-in "try
this on a scratch copy first" flow. (Claudious raised test isolation for *tests*
in round 1; this is the same gap for *any* risky change, including self-edits.)

**Why it matters:** One bad edit to a live shared file can break the whole room
— including the harness itself.

**What to build:** A one-command "sandbox copy" of the workspace (git worktree
under the hood) where a worker can make and verify a risky change, then a
one-command "promote" that applies it back. Auto-delete if abandoned.

---

## 8. The user can't address one worker directly

**What it means:** Everything the user types comes to the lead. If the user just
wants to ask Claudious "what did that screenshot show?", it costs a lead turn to
relay the question and another to relay the answer.

**Why it matters:** Two flagship-priced turns for a message the user could have
sent directly.

**What to build:** Let the user's @Codex / @Claudious mentions wake that worker
directly, with the lead only CC'd in the log. User commands that *assign work*
still go through the lead — this is just for questions and quick pokes.

---

## Plain-words shortlist for this round
1. **Auto-report crashed turns** and release their file locks (#1) — cheapest, fixes the scariest silence.
2. **Task dependencies** so hand-offs don't need a lead turn (#2).
3. **Memory janitor** on a schedule so context stops silently rotting (#4).
4. **Status page** the harness keeps current for the user (#5).
5. **Tag-scoped permissions** so small tasks can't do big damage (#6).
