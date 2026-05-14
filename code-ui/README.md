# code-ui

React frontend for the [Code Interpreter](../README.md) project. Renders a step-by-step timeline as the agent reasons, writes code, executes it, and explains the result.

## Relationship to Other Services

| Service | Direction | Description |
| --- | --- | --- |
| `code-api` | → calls | Sends task to `/code/run/stream`, reads SSE step stream |

## Service Structure

```text
src/
├── main.jsx      # React entry point
├── index.css     # Dark GitHub-style theme, spin + blink animations
└── App.jsx       # Task input, step-by-step StepCard timeline, sample tasks
```

## Starting This Service

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173` — requires `code-api` on port 8005.

## SSE Events Consumed

| Event type | What the UI renders |
| --- | --- |
| `token` | Appended to the current "Thinking" card (streaming text) |
| `code_start` | New "Code" card with monospace Python block |
| `code_result` | New "Output" card — green on success, red on error |
| `done` | Stops all animations |
| `error` | Shows error banner |

## Logic — Pseudocode

```text
ON task submitted:
    steps = [{ type: "thinking", content: "" }]
    SET phase = "running"

    OPEN fetch stream → POST /code/run/stream { task }

    WHILE stream not done:
        READ + decode chunks → parse SSE lines
        SWITCH event.type:
            "token"       → append to last thinking step
            "code_start"  → push { type: "code", content: code }
            "code_result" → push { type: "code_result", output, success }
            "done"        → SET phase = "done"

RENDER each step as StepCard:
    "thinking"     → grey reasoning text (blinking cursor while streaming)
    "code"         → syntax-highlighted pre block (indigo text)
    "code_result"  → green pre (success) or red pre (error)
```

## Design Notes

- **No session state** — each task is independent; the "New Task" button resets all steps
- **Sample tasks** — four example buttons demonstrate different task types (primes, fibonacci, sorting, filtering)
- **Dark terminal aesthetic** — styled to match the code-execution context
