# Round-2 harness feedback — Claudious (browser/testing seat) — 2026-07-27

Written for the user in plain language. Rule for this round: **only NEW topics**
not already in `FEEDBACK-SUMMARY.md`, `FEEDBACK2-boss.md`, or `FEEDBACK2-codex.md`.
Every item is: what it means / why it matters / what to build. Jargon gets defined.
These all come from my seat — the agent that actually opens the browser and tests.

---

## 1. Console and network errors should be captured for me, not hunted by hand

**What it means:** When I open the preview in a browser, the page can quietly log
errors ("console errors" = the red warnings a browser prints when JavaScript
breaks) or fail to load a file ("network error" = a request for an image or
script that came back missing/broken). Right now I have to remember to go look at
each of these panels myself, every time.

**Why it matters:** A page can *look* fine in a screenshot while the console is
full of errors that will bite the user later. If I forget to check, a real bug
sails through as "verified."

**What to build:** On any [browser] turn, the harness should automatically record
every console error and every failed network request that happened while I was on
the page, and hand them to me (and show them in chat) alongside the screenshot.
Verification stops depending on me remembering to look.

---

## 2. Screenshots get re-sent (and re-charged) on every following turn

**What it means:** When I save a screenshot, it shows in chat — good. But because
each wake replays the history, that same image gets bundled and paid for again on
turn after turn. Images are far heavier than text, so a few screenshots become a
recurring tax on every future turn, not a one-time cost.

**Why it matters:** Testing is the most image-heavy job in the room, so my work
quietly inflates the price of everyone's later turns. The more I test, the more
every teammate's wakes cost.

**What to build:** Show a screenshot in full once, then replace it in later turns
with a lightweight reference — a small text line like "screenshot: breakout.png
(seen)" — that an agent can re-open on demand. Pay for each image once, not
forever.

---

## 3. Test more than one screen size in a single pass

**What it means:** A web page looks different on a phone, a tablet, and a desktop
("viewport" = the size of the window the page is squeezed into). Today I can only
point the browser at one size per turn, so checking phone + desktop means two
separate expensive turns.

**Why it matters:** Layout bugs almost always hide at a size you didn't check —
buttons off-screen on mobile, huge gaps on desktop. Testing one size gives false
confidence, and testing each size separately is slow and pricey.

**What to build:** One command that snaps the same page at a few named sizes
(e.g. phone / tablet / desktop) in a single turn and saves all the screenshots
together. One turn, full coverage.

---

## 4. The preview only ever serves index.html

**What it means:** The live preview URL always shows `index.html` and nothing
else. If a project has more than one page, a sub-folder, or (like the status
dashboard the Boss proposed) a *different* HTML file, I have no way to open it in
the browser to test it.

**Why it matters:** Real projects are rarely one page. And several of our own
round-2 ideas — the status dashboard, a task-receipt page — are separate files
that literally cannot be previewed or tested under today's setup.

**What to build:** Let the preview serve any file or path in the workspace
(`/preview/tester/status.html`, `/preview/tester/about/`), not just index.html,
so multi-page work and our own tooling can actually be opened and checked.

---

## 5. An automatic page-quality check for the easy, boring mistakes

**What it means:** Some page problems are mechanical and catchable without human
judgment: a link that points nowhere ("broken link"), an image with no text
description for screen-reader users ("missing alt text" — the label a blind user's
software reads aloud), or text too pale to read against its background ("low
contrast").

**Why it matters:** These are exactly the errors a quick glance at a screenshot
misses, they hurt real users (especially anyone using assistive tech), and
catching them by eye every time is unreliable.

**What to build:** A one-command automatic scan of the previewed page that lists
broken links, images missing alt text, and low-contrast text, reported as a plain
pass/fail list. It runs fast, needs no human judgment, and catches the dull
mistakes so I can spend attention on the real behavior.

---

## 6. Browser tests need a "wait until ready" instead of racing the page

**What it means:** When I script the browser to click a button and screenshot the
result, the script can run *before the page has finished loading or animating*.
The result is a "flaky" test — one that passes or fails at random depending on
timing, not on whether the code is actually correct.

**Why it matters:** A flaky test is worse than no test: it either cries wolf
(fails on good code) or gives a false green (screenshots a half-drawn page and
calls it done). Both waste turns and erode trust in "verified."

**What to build:** Give browser tests a way to *wait for a condition* — "wait
until this element appears," "wait until the network is quiet," "wait until this
text shows" — instead of blind fixed-time pauses. Then a screenshot is always
taken of a settled, finished page, and pass/fail means what it says.

---

## Plain-words shortlist for this round (my seat)
1. **Auto-capture console + network errors** on browser turns (#1) — stops silent bugs passing as "verified."
2. **Charge for a screenshot once, not every turn after** (#2) — testing shouldn't tax everyone's future turns.
3. **Preview any file, not just index.html** (#4) — unblocks multi-page work and our own status/receipt tools.
4. **One-pass multi-size snapshots** (#3) — full layout coverage in a single turn.
5. **Wait-for-ready browser tests** (#6) — kills flaky, false-green results.
