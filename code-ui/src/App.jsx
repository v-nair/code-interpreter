import { useRef, useState } from "react"

const API_URL = "http://localhost:8005"

const SAMPLES = [
  "Calculate the first 20 prime numbers",
  "Generate the Fibonacci sequence up to 500",
  "Sort this list using bubble sort: [64, 25, 12, 22, 11, 90, 3]",
  "Find all palindromes in the word list: ['racecar', 'hello', 'level', 'world', 'noon']",
]

export default function App() {
  const [task, setTask] = useState("")
  const [phase, setPhase] = useState("idle") // idle | running | done
  const [steps, setSteps] = useState([])
  const [error, setError] = useState("")
  const bottomRef = useRef(null)

  const reset = () => {
    setPhase("idle")
    setSteps([])
    setError("")
    setTask("")
  }

  const runTask = async (taskOverride) => {
    const t = (taskOverride ?? task).trim()
    if (!t || phase === "running") return
    setTask("")
    setPhase("running")
    setSteps([{ type: "thinking", content: "" }])
    setError("")

    try {
      const res = await fetch(`${API_URL}/code/run/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: t }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const ev = JSON.parse(line.slice(6))

            if (ev.type === "token") {
              setSteps((prev) => {
                const last = prev[prev.length - 1]
                if (last?.type === "thinking") {
                  return [...prev.slice(0, -1), { type: "thinking", content: last.content + ev.content }]
                }
                return [...prev, { type: "thinking", content: ev.content }]
              })
            } else if (ev.type === "code_start") {
              setSteps((prev) => {
                const filtered = prev.filter((s) => s.type !== "thinking" || s.content.trim())
                return [...filtered, { type: "code", content: ev.code }]
              })
            } else if (ev.type === "code_result") {
              setSteps((prev) => [
                ...prev,
                { type: "code_result", content: ev.output, success: ev.success },
              ])
            } else if (ev.type === "error") {
              setError(ev.content)
            } else if (ev.type === "done") {
              setPhase("done")
              setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
            }
          } catch {
            // malformed line
          }
        }
      }
    } catch {
      setError("Connection error. Is the API running on port 8005?")
      setPhase("idle")
    }
  }

  return (
    <div style={s.layout}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.titleRow}>
            <h1 style={s.title}>Code Interpreter</h1>
            {phase !== "idle" && (
              <button onClick={reset} style={s.newBtn}>+ New Task</button>
            )}
          </div>
          <p style={s.subtitle}>
            LangGraph agent · GPT-4o · writes and runs Python to solve tasks
          </p>
        </div>
      </header>

      <main style={s.main}>
        {phase === "idle" && (
          <div style={s.heroSection}>
            <div style={s.inputCard}>
              <label style={s.inputLabel}>Describe a task for the agent</label>
              <div style={s.inputRow}>
                <input
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runTask()}
                  placeholder="e.g. Calculate the first 20 prime numbers"
                  style={s.input}
                  autoFocus
                />
                <button
                  onClick={() => runTask()}
                  disabled={!task.trim()}
                  style={{
                    ...s.runBtn,
                    background: task.trim() ? "#6366f1" : "#374151",
                    cursor: task.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Run
                </button>
              </div>
              <div style={s.samples}>
                <span style={s.samplesLabel}>Examples:</span>
                {SAMPLES.map((ex, i) => (
                  <button key={i} onClick={() => runTask(ex)} style={s.sampleBtn}>{ex}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase !== "idle" && (
          <div style={s.stepsSection}>
            {steps.map((step, i) => (
              <StepCard key={i} step={step} isLast={i === steps.length - 1} running={phase === "running"} />
            ))}
            {error && <div style={s.errorBox}>{error}</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </main>
    </div>
  )
}

function StepCard({ step, isLast, running }) {
  if (step.type === "thinking") {
    return (
      <div style={s.card}>
        <div style={s.cardLabel}>
          <span style={{ color: "#818cf8" }}>
            {running && isLast
              ? <><span className="spin" style={{ marginRight: 6 }}>⟳</span>Thinking…</>
              : "↳ Reasoning"}
          </span>
        </div>
        <p style={s.thinkingText}>
          {step.content}
          {running && isLast && <span className="blink" style={{ color: "#6366f1" }}>▋</span>}
        </p>
      </div>
    )
  }

  if (step.type === "code") {
    return (
      <div style={s.card}>
        <div style={s.cardLabel}>
          <span style={{ color: "#34d399" }}>{"</>"} Code</span>
        </div>
        <pre style={s.codeBlock}>{step.content}</pre>
      </div>
    )
  }

  if (step.type === "code_result") {
    return (
      <div style={s.card}>
        <div style={s.cardLabel}>
          <span style={{ color: step.success ? "#34d399" : "#f87171" }}>
            {step.success ? "✓ Output" : "✗ Error"}
          </span>
        </div>
        <pre style={{ ...s.codeBlock, background: step.success ? "#0a1a12" : "#1a0a0a", color: step.success ? "#86efac" : "#fca5a5" }}>
          {step.content}
        </pre>
      </div>
    )
  }

  return null
}

const s = {
  layout: { minHeight: "100vh", display: "flex", flexDirection: "column" },
  header: { background: "#161b22", borderBottom: "1px solid #30363d", flexShrink: 0 },
  headerInner: { maxWidth: 780, margin: "0 auto", padding: "16px 24px 12px" },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: 700, margin: 0, color: "#f0f6fc" },
  subtitle: { fontSize: 12, color: "#6e7681", margin: "4px 0 0" },
  newBtn: { padding: "6px 14px", background: "#21262d", border: "1px solid #30363d", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#c9d1d9" },
  main: { flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "28px 24px 48px" },
  heroSection: { display: "flex", justifyContent: "center", paddingTop: 40 },
  inputCard: { background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: "26px 26px 20px", width: "100%", maxWidth: 620 },
  inputLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "#8b949e", marginBottom: 10 },
  inputRow: { display: "flex", gap: 8 },
  input: { flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #30363d", fontSize: 14, background: "#0d1117", color: "#f0f6fc", outline: "none" },
  runBtn: { padding: "10px 20px", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600 },
  samples: { marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  samplesLabel: { fontSize: 12, color: "#6e7681" },
  sampleBtn: { padding: "4px 10px", background: "#21262d", border: "1px solid #30363d", borderRadius: 20, cursor: "pointer", fontSize: 12, color: "#8b949e" },
  stepsSection: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "#161b22", border: "1px solid #30363d", borderRadius: 10, overflow: "hidden" },
  cardLabel: { padding: "8px 14px", background: "#0d1117", borderBottom: "1px solid #21262d", fontSize: 12, fontWeight: 600 },
  thinkingText: { margin: 0, padding: "12px 14px", fontSize: 13, color: "#8b949e", lineHeight: 1.65, whiteSpace: "pre-wrap" },
  codeBlock: { margin: 0, padding: "14px 16px", fontSize: 13, color: "#79c0ff", overflowX: "auto", lineHeight: 1.6, background: "#0d1117" },
  errorBox: { background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", color: "#f87171", fontSize: 13 },
}
