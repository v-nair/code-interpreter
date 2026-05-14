import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import CodeRequest
from services.agent_service import get_agent, stream_code_task

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in environment variables")
    get_agent()
    logger.info("Code interpreter agent compiled and ready")
    yield
    logger.info("Shutting down code-api")


app = FastAPI(
    title="Code Interpreter API",
    description="LangGraph agent that writes and executes Python code to solve tasks",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health"])
def root():
    return {"status": "code-api is running"}


@app.post("/code/run/stream", tags=["Code"])
async def run_code_stream(req: CodeRequest):
    return StreamingResponse(
        stream_code_task(req.task),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
