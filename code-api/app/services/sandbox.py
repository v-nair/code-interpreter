import logging
import os
import subprocess
import sys
import tempfile

from config import EXECUTION_TIMEOUT, MAX_OUTPUT_CHARS

logger = logging.getLogger(__name__)


def execute_python(code: str) -> dict[str, object]:
    """Execute a Python code string in an isolated subprocess.

    Writes ``code`` to a temporary file, runs it with the current interpreter,
    and captures stdout/stderr.  The subprocess is forcibly killed if it exceeds
    ``EXECUTION_TIMEOUT`` seconds, preventing zombie processes.

    Returns:
        A dict with keys ``stdout`` (str), ``stderr`` (str), and
        ``success`` (bool).  Outputs are truncated to avoid unbounded memory.
    """
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        with subprocess.Popen(
            [sys.executable, temp_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ) as proc:
            try:
                stdout, stderr = proc.communicate(timeout=EXECUTION_TIMEOUT)
                return {
                    "stdout": stdout.strip()[:MAX_OUTPUT_CHARS],
                    "stderr": stderr.strip()[:1000],
                    "success": proc.returncode == 0,
                }
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()  # drain pipes so the process can exit cleanly
                logger.warning("Code execution timed out after %ss", EXECUTION_TIMEOUT)
                return {
                    "stdout": "",
                    "stderr": f"Execution timed out after {EXECUTION_TIMEOUT}s",
                    "success": False,
                }
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
