import json
import logging
import operator
import os
from typing import Annotated, AsyncIterator, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from config import CHAT_MODEL, SYSTEM_PROMPT
from services.sandbox import execute_python

logger = logging.getLogger(__name__)


@tool
def run_python_code(code: str) -> str:
    """Execute Python code in a sandboxed subprocess and return the output.
    Use this to run calculations, data processing, sorting algorithms, generate sequences,
    or anything requiring actual computation. Standard library modules are available.
    If the code raises an error, fix it and try again.
    """
    result = execute_python(code)
    if result["success"]:
        output = result["stdout"]
        return f"Execution successful.\nOutput:\n{output}" if output else "Execution successful. (no output)"
    return f"Execution failed.\nError:\n{result['stderr']}\nStdout:\n{result['stdout']}"


TOOLS = [run_python_code]


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]


def _build_agent():
    llm_with_tools = ChatOpenAI(
        model=CHAT_MODEL,
        temperature=0,
        api_key=os.getenv("OPENAI_API_KEY"),
    ).bind_tools(TOOLS)

    def call_model(state: AgentState) -> dict:
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    graph = StateGraph(AgentState)
    graph.add_node("agent", call_model)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")
    return graph.compile()


_agent = None


def get_agent() -> object:
    """Return the compiled LangGraph ReAct agent, building it on first call."""
    global _agent
    if _agent is None:
        _agent = _build_agent()
    return _agent


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def stream_code_task(task: str) -> AsyncIterator[str]:  # type: ignore[override]
    """Run the code-interpreter agent on ``task`` and yield SSE-formatted strings.

    Yields one of the following event types:
    - ``token``        — a streamed token from the LLM's final explanation
    - ``code_start``   — the Python code the agent is about to execute
    - ``code_result``  — stdout/stderr after code execution, with a success flag
    - ``error``        — emitted if an unexpected exception occurs
    - ``done``         — always the last event, signals stream completion
    """
    initial_state: AgentState = {
        "messages": [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=task),
        ]
    }
    agent = get_agent()

    try:
        async for event in agent.astream_events(initial_state, version="v2"):
            kind = event["event"]
            name = event.get("name", "")

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if chunk.content:
                    yield _sse({"type": "token", "content": chunk.content})

            elif kind == "on_tool_start" and name == "run_python_code":
                code = event["data"].get("input", {}).get("code", "")
                yield _sse({"type": "code_start", "code": code})

            elif kind == "on_tool_end" and name == "run_python_code":
                output = str(event["data"].get("output", ""))
                success = "Execution successful" in output
                yield _sse({"type": "code_result", "output": output, "success": success})

        yield _sse({"type": "done"})

    except Exception as e:
        logger.error(f"Code agent error: {e}", exc_info=True)
        yield _sse({"type": "error", "content": "An error occurred during execution."})
        yield _sse({"type": "done"})
