# Code Interpreter

A LangGraph agent that writes Python code to solve any task and executes it in a sandboxed subprocess — streaming reasoning, code, and output live to the UI.

## How It Works

```text
User describes a task
    │
    ▼
GPT-4o reasons → writes Python code → calls run_python_code tool
    │
    ├── subprocess executes the code (10s timeout)
    │   ├── Success → output returned as ToolMessage
    │   └── Error   → error returned, agent fixes code and retries
    │
    ▼
GPT-4o reads output → writes final explanation
    │
    ▼ SSE stream → UI shows reasoning, code block, output, answer
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | FastAPI, Python 3.11, Uvicorn |
| Agent | LangGraph (`StateGraph`, `ToolNode`, `astream_events`) |
| LLM | OpenAI GPT-4o with `bind_tools` |
| Sandbox | Python `subprocess` with 10s timeout |
| Streaming | Server-Sent Events via `StreamingResponse` |
| Frontend | React 19, Vite |
| Infrastructure | Docker, Docker Compose |

## Project Structure

```text
code-interpreter/
├── code-api/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, /code/run/stream route
│   │   ├── models.py                # CodeRequest (Pydantic)
│   │   ├── config.py                # Model, timeout, system prompt
│   │   └── services/
│   │       ├── sandbox.py          # subprocess execution with timeout
│   │       └── agent_service.py    # LangGraph graph, run_python_code tool, SSE generator
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
└── code-ui/
    └── src/
        └── App.jsx                  # Step-by-step timeline: reasoning → code → output → answer
```

## Running Locally

**Prerequisites:** Docker, Node.js, OpenAI API key

**Backend:**

```bash
cd code-api
cp .env.example .env   # add OPENAI_API_KEY
docker compose up --build
```

**Frontend:**

```bash
cd code-ui
npm install
npm run dev
```

| Service | URL |
| --- | --- |
| API | <http://localhost:8005> |
| API docs | <http://localhost:8005/docs> |
| UI | <http://localhost:5173> |

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `POST` | `/code/run/stream` | Stream a code-solving task |

**POST /code/run/stream — request:**

```json
{ "task": "Calculate the first 20 prime numbers" }
```

**SSE event stream — response:**

```text
data: {"type": "token",       "content": "I'll write a Python function..."}
data: {"type": "code_start",  "code": "def is_prime(n):\n    ..."}
data: {"type": "code_result", "output": "Execution successful.\nOutput:\n2 3 5 7...", "success": true}
data: {"type": "token",       "content": "The first 20 prime numbers are: 2, 3, 5..."}
data: {"type": "done"}
```

## What This Demonstrates

- **LangGraph ReAct** — same graph pattern as Project 3, now applied to code execution
- **Custom tool** — `run_python_code` uses `subprocess` to execute generated code and return stdout/stderr
- **Sandboxed execution** — `subprocess.run` with `capture_output=True` and `timeout=10` isolates code from the server process
- **Iterative debugging** — if the code fails, the agent reads the error output and retries automatically
- **astream_events** — `on_tool_start`/`on_tool_end` used to extract code and output from the graph event stream
