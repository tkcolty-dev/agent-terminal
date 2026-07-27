# Round-2 harness feedback — Codex seat — 2026-07-27

This round contains only new topics that do not appear in
`FEEDBACK-SUMMARY.md` or `FEEDBACK2-boss.md`.

## 1. A real Stop button for work that is no longer wanted

**What it means:** Once an agent starts a long turn, the user or lead cannot
clearly cancel it. A newer message may make the old job useless, but the old
commands can keep running and the agent can still edit files.

**Why it matters:** This wastes money and can let outdated work overwrite the
new direction. It is especially risky when a command starts a server, test
suite, download, or other long-running process.

**What to build:** Add a Stop button beside every active agent. Stopping should
end the agent turn and any commands it started, mark the task as cancelled, and
show which files had already changed. The lead can then decide whether to keep
or undo those changes.

## 2. A review step before several agents' changes are combined

**What it means:** All agents edit the same files immediately. There is no
built-in view showing exactly what each agent changed before those changes
become part of the shared result.

**Why it matters:** A worker can accidentally alter a teammate's code or include
an unrelated edit. The final result may work while still containing a change
that nobody meant to approve.

**What to build:** Record each task's edits as its own change set. A change set
is simply the list of added, removed, and changed lines from that task. Show a
plain before-and-after review, then let the lead accept the whole set or reject
individual files.

## 3. Automatic protection for passwords and private keys

**What it means:** Agents can print command output and paste file contents into
the shared chat. That output may contain a password, access token, private key,
or another secret by accident.

**Why it matters:** Everyone in the room can read the chat, and chat records may
live longer than the terminal output. One careless diagnostic command could
turn a local secret into a shared and stored secret.

**What to build:** Scan tool output and outgoing messages for common secret
patterns before displaying them. Replace likely secrets with `[hidden]`, warn
the agent, and require a clear user-approved action before revealing the real
value.

## 4. Limits for commands that consume too much computer power

**What it means:** A command started by one worker can use too much memory,
processor time, disk space, or too many background processes. There is no
visible per-task limit.

**Why it matters:** One stuck test or accidental endless loop can slow down
every teammate because they share the same machine. It can also fill the disk
and break unrelated work.

**What to build:** Give each task sensible limits for run time, memory, disk
growth, and number of processes. Show a warning as a limit gets close, stop the
command safely when it is exceeded, and report the exact reason in chat.

## 5. One downloadable record that explains how a result was made

**What it means:** The evidence for a finished task is scattered across chat,
commands, files, screenshots, and the task board. There is no single record
linking the user's request to the exact edits and checks that produced the
answer.

**Why it matters:** Later, the user may need to answer, “Who changed this, what
did they run, and what proved it worked?” Reconstructing that story from a long
chat is slow and uncertain.

**What to build:** When a task finishes, create a small task receipt containing
the original assignment, agent and model used, files changed, commands run,
check results, screenshots, and final message. Make it downloadable as a text
or JSON file. JSON is a structured text format that other programs can read.

## 6. Detect when two agents make decisions that contradict each other

**What it means:** Agents can produce individually reasonable answers that
cannot both be true—for example, one says a feature should be removed while
another builds new code that depends on it. File ownership alone cannot catch
this because the conflicting decisions may affect different files.

**Why it matters:** The conflict often appears only during final assembly, after
both workers have spent time and money. The lead then has to discover the
disagreement and send work back.

**What to build:** Let each task publish a few short decisions and assumptions
in a structured field. Before accepting a result, compare those fields across
active tasks and flag opposite statements for the lead, with links to the two
messages that disagree.

## 7. Pause a task when required user information is missing

**What it means:** An agent sometimes needs a choice only the user can make,
such as which design they prefer or which account is correct. Today that agent
either guesses, ends the task, or stays active while waiting.

**Why it matters:** Guessing can produce the wrong result, while staying active
makes the room look busy and may hold resources that other work needs.

**What to build:** Add a `waiting for user` task state. The agent asks one clear
question, saves its exact place, releases its active resources, and sleeps.
When the user answers, the harness resumes that task with the saved context
instead of starting it again.
