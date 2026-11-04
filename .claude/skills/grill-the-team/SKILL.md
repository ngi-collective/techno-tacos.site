---
name: grill-the-team
description: Grill a kids' team about their project in a live session, one question at a time.
disable-model-invocation: true
---

Interview the team relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

An adult reads each question aloud and brings the answer back through `transcript.md`. Record each answer in `decisions.md`.

Work the tree **one question at a time**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the frontier question that unblocks the most, then wait for the answer before the next one.

Format a question like so, with nothing else in the reply:

```
❓ <question>
```

Write each question for a 10-year-old to hear: 15 words or fewer, with no suggested answer, so the ideas stay theirs.

Each answer reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next question.

Finding _facts_ is your job, never the team's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it; don't ask the team for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the team's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the adult confirms you have reached a shared understanding.
