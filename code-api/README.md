# code-api

FastAPI backend for the [Code Interpreter](../README.md) project. Runs a LangGraph ReAct agent that writes and executes Python code, streaming each step to the UI over SSE.

## Relationship to Other Services

| Service | Direction | Description |
| --- | --- | --- |
| `code-ui` | ← receives requests | UI sends a task description, reads the SSE step stream |
| OpenAI API | → calls | LLM reasoning, code generation, final explanation |
| OS subprocess | → spawns | Python child process to execute generated code |

## Service Structure

```text
app/
├── main.py                  # FastAPI app, lifespan, /code/run/stream route
├── models.py                # CodeRequest (Pydantic)
├── config.py                # Model, timeout, system prompt
└── services/
    ├── sandbox.py           # subprocess execution: tempfile → run → capture → cleanup
    └── agent_service.py     # LangGraph graph, run_python_code @tool, SSE generator
```

## Configuration

| Constant | Value | Purpose |
| --- | --- | --- |
| `CHAT_MODEL` | `gpt-4o` | LLM for the agent |
| `EXECUTION_TIMEOUT` | `10` | Max seconds for subprocess execution |
| `MAX_OUTPUT_CHARS` | `3000` | Truncation limit for stdout |

## Starting This Service

```bash
cp .env.example .env   # add OPENAI_API_KEY
docker compose up --build
```

Runs on `http://localhost:8005`

## Logic — Pseudocode

```text
// Sandbox (sandbox.py)
FUNCTION execute_python(code):
    write code to temp .py file
    result = subprocess.run([python, temp_file], timeout=10, capture_output=True)
    cleanup temp file
    RETURN { stdout, stderr, success: returncode == 0 }

// Agent (agent_service.py)
FUNCTION stream_code_task(task):
    state = [SystemMessage, HumanMessage(task)]
    STREAM astream_events on LangGraph ReAct graph:
        on_chat_model_stream  → YIELD SSE { type: "token" }
        on_tool_start         → YIELD SSE { type: "code_start", code }
        on_tool_end           → YIELD SSE { type: "code_result", output, success }
    YIELD SSE { type: "done" }
```

## Design Notes

- **Stateless per task** — each POST starts a fresh conversation; no session history between tasks
- **Temp file execution** — code is written to a `NamedTemporaryFile`, executed, then deleted regardless of success/failure
- **Agent iterates automatically** — if the code fails, the LLM reads the stderr and retries without any UI interaction
- **lifespan startup** — graph compiled once at startup via `get_agent()` in the lifespan handler
