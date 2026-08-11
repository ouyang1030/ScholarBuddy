"use client";

import { useEffect, useMemo, useState } from "react";

type ModuleKey =
  | "dashboard"
  | "research"
  | "data"
  | "manuscript"
  | "workspace"
  | "review"
  | "projects"
  | "operations";

type Action = {
  label: string;
  meta: string;
  tone: string;
  command: string;
};

const navItems: { key: ModuleKey; label: string; icon: string; badge?: string }[] = [
  { key: "dashboard", label: "Today", icon: "⌂", badge: "3" },
  { key: "research", label: "Research Map", icon: "⌁", badge: "8" },
  { key: "data", label: "Data & Experiments", icon: "∿", badge: "3" },
  { key: "manuscript", label: "Manuscript", icon: "¶" },
  { key: "workspace", label: "AI Workspace", icon: "✦" },
  { key: "review", label: "Review Room", icon: "✓", badge: "4" },
  { key: "projects", label: "Projects & Tasks", icon: "▦" },
  { key: "operations", label: "PhD Operations", icon: "◫", badge: "2" },
];

const quickActions: Action[] = [
  { label: "Ask research knowledge", meta: "Obsidian", tone: "mint", command: "@ask-knowledge" },
  { label: "Find evidence for a claim", meta: "Zotero", tone: "blue", command: "@evidence-for-claim" },
  { label: "Explain a result", meta: "Statistics", tone: "violet", command: "@result-explain" },
  { label: "Review manuscript section", meta: "Reviewer", tone: "orange", command: "@reviewer-critique" },
];

const commands: Action[] = [
  ...quickActions,
  { label: "Read a paper", meta: "Literature", tone: "blue", command: "@paper-read" },
  { label: "Compare selected papers", meta: "Literature", tone: "blue", command: "@compare-papers" },
  { label: "Inspect dataset", meta: "Data", tone: "mint", command: "@dataset-inspect" },
  { label: "Select a method", meta: "Methods", tone: "violet", command: "@method-select" },
  { label: "Run statistical check", meta: "Statistics", tone: "orange", command: "@stat-check" },
  { label: "Draft methods", meta: "Writing", tone: "violet", command: "@write-methods" },
  { label: "Save research decision", meta: "Obsidian", tone: "mint", command: "@save-decision" },
];

const progress = [
  { label: "Literature", value: 82, note: "Evidence map stable" },
  { label: "Data", value: 100, note: "v2.4 frozen" },
  { label: "Analysis", value: 64, note: "2 experiments active" },
  { label: "Writing", value: 41, note: "Methods in review" },
  { label: "Internal review", value: 18, note: "4 concerns open" },
  { label: "Submission", value: 0, note: "Not started" },
];

const manuscriptSections = [
  { name: "Introduction", state: "Needs evidence", value: 72 },
  { name: "Methods", state: "Internal review", value: 88 },
  { name: "Results", state: "In progress", value: 46 },
  { name: "Discussion", state: "Outline", value: 21 },
  { name: "Figures", state: "3 of 5 ready", value: 60 },
  { name: "Supplementary", state: "Not started", value: 4 },
];

const papers = [
  { year: "2024", title: "Deep learning approaches for football formation recognition from tracking data", authors: "Bialkowski et al.", tag: "Direct evidence" },
  { year: "2023", title: "Dynamic team formations in elite women's football", authors: "Forcher et al.", tag: "Context" },
  { year: "2022", title: "Space control and collective tactical behaviour in association football", authors: "Memmert et al.", tag: "Method" },
];

const agents = [
  ["Statistics Agent", "Model assumptions, diagnostics, uncertainty", "available"],
  ["Football Analytics Agent", "Tactical validity and domain interpretation", "available"],
  ["Literature Agent", "Evidence retrieval and synthesis", "available"],
  ["Methods Editor", "Methodological completeness and precision", "available"],
  ["Computer Vision Agent", "Detection, tracking and validation", "available"],
  ["Reviewer Agent", "Independent critical review", "available"],
];

const projects = [
  { code: "STUDY 02", name: "Formation Recognition", phase: "Analysis", progress: 64, color: "#b8f05a", detail: "Tracking data · Computer vision" },
  { code: "STUDY 01", name: "Pace of Play", phase: "Writing", progress: 81, color: "#7db5ff", detail: "Event data · Mixed models" },
  { code: "PILOT 03", name: "Defensive Assignment", phase: "Literature", progress: 27, color: "#bf9bff", detail: "Tracking data · Network analysis" },
];

function ProgressRing({ value }: { value: number }) {
  return (
    <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{value}</strong><span>%</span></div>
    </div>
  );
}

function SourceDot({ tone = "green" }: { tone?: string }) {
  return <span className={`source-dot ${tone}`} aria-hidden="true" />;
}

function PitchMap() {
  const players = [
    [50, 88, "gk"], [18, 68, "p"], [40, 67, "p"], [62, 67, "p"], [84, 68, "p"],
    [25, 43, "p"], [50, 48, "p"], [76, 43, "p"], [22, 20, "p"], [50, 18, "p"], [78, 20, "p"],
  ];
  return (
    <div className="pitch-map" aria-label="4-3-3 formation diagram">
      <div className="pitch-half" />
      <div className="pitch-circle" />
      <div className="pitch-box" />
      {players.map(([x, y, kind], index) => (
        <span key={index} className={`player-dot ${kind}`} style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      <span className="formation-label">4–3–3</span>
    </div>
  );
}

type DailyTask = {
  id: number;
  title: string;
  object: string;
  category: string;
  time: string;
  priority: "Must" | "Should";
  done: boolean;
};

const starterTasks: DailyTask[] = [
  { id: 1, title: "Verify the stability of the three-cluster solution", object: "EXP-024", category: "Statistical analysis", time: "09:30–11:00", priority: "Must", done: false },
  { id: 2, title: "Find direct evidence for Introduction §1.6", object: "RQ-02", category: "Literature", time: "11:30–12:00", priority: "Must", done: false },
  { id: 3, title: "Document the phase-segmentation threshold decision", object: "DEC-041", category: "Writing", time: "14:00–15:00", priority: "Should", done: false },
];

function Dashboard({ runAction, openContext }: { runAction: (a: Action) => void; openContext: () => void }) {
  const [tasks, setTasks] = useState<DailyTask[]>(starterTasks);
  const [newTask, setNewTask] = useState("");
  const [focusSeconds, setFocusSeconds] = useState(47 * 60 + 18);
  const [focusRunning, setFocusRunning] = useState(false);
  const [queuedPapers, setQueuedPapers] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem("workbuddy-daily-tasks-en-v2");
    if (saved) {
      try { setTasks(JSON.parse(saved) as DailyTask[]); } catch { /* keep starter state */ }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("workbuddy-daily-tasks-en-v2", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (!focusRunning) return;
    const timer = window.setInterval(() => setFocusSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning]);

  const completed = tasks.filter((task) => task.done).length;
  const focusTime = `${String(Math.floor(focusSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((focusSeconds % 3600) / 60)).padStart(2, "0")}:${String(focusSeconds % 60).padStart(2, "0")}`;
  const toggleTask = (id: number) => setTasks((items) => items.map((item) => item.id === id ? { ...item, done: !item.done } : item));
  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks((items) => [...items, { id: Date.now(), title: newTask.trim(), object: "INBOX", category: "Ad hoc", time: "Unscheduled", priority: "Should", done: false }]);
    setNewTask("");
  };

  return (
    <>
      <section className="daily-intro">
        <div>
          <p className="eyebrow">Tuesday, 11 August 2026 · Research cycle 08</p>
          <h1>Today’s Research</h1>
          <p>Tasks, time, research questions, and evidence—together in one place, focused on work that moves the thesis forward.</p>
        </div>
        <div className="daily-intro-actions">
          <button className="quiet-button" onClick={openContext}><span className="context-diamond small">◇</span> Context ready · 94%</button>
          <button className="primary-button" onClick={() => runAction({ label: "Plan today’s research", meta: "Research planning", tone: "mint", command: "@plan-today" })}>Plan today with AI <b>✦</b></button>
        </div>
      </section>

      <section className="daily-command-grid">
        <article className="today-tasks card">
          <div className="section-heading">
            <div><span className="label">TODAY / EXECUTION</span><p>Today’s tasks</p></div>
            <span className="completion-count"><b>{completed}</b> / {tasks.length} complete</span>
          </div>
          <div className="task-capture">
            <input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTask()} placeholder="Add an ad hoc research task…" aria-label="Add today’s research task" />
            <button onClick={addTask}>+</button>
          </div>
          <div className="daily-task-list">
            {tasks.map((task) => (
              <div className={task.done ? "done" : ""} key={task.id}>
                <button className="task-check" onClick={() => toggleTask(task.id)} aria-label={`${task.done ? "Reopen " : "Complete "}${task.title}`}>{task.done ? "✓" : ""}</button>
                <span className="task-copy"><strong>{task.title}</strong><small><b>{task.object}</b> · {task.category}</small></span>
                <span className="task-plan"><strong>{task.time}</strong><small className={task.priority === "Must" ? "must" : "should"}>{task.priority}</small></span>
                <button className="task-open" onClick={() => runAction({ label: task.title, meta: task.object, tone: task.category === "Literature" ? "blue" : "mint", command: task.category === "Literature" ? "@evidence-for-claim" : "@continue-task" })}>↗</button>
              </div>
            ))}
          </div>
          <div className="task-footer"><span>Completed tasks feed the daily review and research log</span><button>Open project task table →</button></div>
        </article>

        <article className="today-schedule card">
          <div className="section-heading"><div><span className="label">TIME BLOCKS</span><p>Today’s schedule</p></div><button className="mini-add">＋ Time block</button></div>
          <div className="schedule-list">
            <div><time>09:30</time><i className="mint" /><span><strong>EXP-024 stability diagnostics</strong><small>Analysis · 90 min</small></span></div>
            <div><time>11:30</time><i className="blue" /><span><strong>Introduction evidence search</strong><small>Reading · 30 min</small></span></div>
            <div className="now"><time>14:00</time><i className="violet" /><span><strong>Methods decision rationale</strong><small>Writing · 60 min</small></span><b>NOW</b></div>
            <div><time>16:30</time><i className="neutral" /><span><strong>Prepare supervision meeting brief</strong><small>Meeting · 30 min</small></span></div>
          </div>
          <button className="wide-button">Open research calendar <span>→</span></button>
        </article>

        <article className="focus-session card">
          <div className="focus-top"><span className="label">FOCUS SESSION</span><span className={focusRunning ? "live" : "paused"}><i /> {focusRunning ? "Recording" : "Paused"}</span></div>
          <span className="focus-object">EXP-024 · STATISTICAL CHECK</span>
          <h2>{focusTime}</h2>
          <p>Verify the stability of the three-cluster solution</p>
          <div className="focus-wave">{[4,8,13,21,12,17,25,10,18,8,5].map((height, index) => <i key={index} style={{ height }} />)}</div>
          <button onClick={() => setFocusRunning((value) => !value)}>{focusRunning ? "Pause session" : "Resume session"}<span>{focusRunning ? "Ⅱ" : "▶"}</span></button>
        </article>
      </section>

      <section className="daily-progress-row">
        <article className="writing-today card">
          <div className="section-heading"><div><span className="label">WRITING / MANUSCRIPT-02</span><p>Current writing progress</p></div><button className="quiet-button" onClick={() => runAction(commands[9])}>Continue writing →</button></div>
          <div className="writing-main">
            <div><span className="writing-section-tag">METHODS · §2.4</span><h2>Phase segmentation and formation representation</h2><p>Next: justify the 8-second threshold and link DEC-041.</p></div>
            <div className="writing-numbers"><span><strong>4,286</strong><small>Current words</small></span><span><strong>8,000</strong><small>Section target</small></span><span><strong>54%</strong><small>Argument coverage</small></span><span><strong>82%</strong><small>Citation coverage</small></span></div>
          </div>
          <div className="writing-track"><i style={{ width: "54%" }} /><span style={{ left: "54%" }}>4,286</span></div>
          <div className="writing-log"><span>This week <b>312 min</b></span><span>Added <b>1,240 words</b></span><span>Open <b className="warning-text">2 AUTHOR CHECKS</b></span></div>
        </article>

        <article className="research-anchor card">
          <div className="card-topline"><span className="label">RESEARCH ANCHOR</span><button onClick={openContext}>View context ↗</button></div>
          <span className="object-id">RQ-02 · ACTIVE</span>
          <h3>How reliably can team formations be recognized across possession phases and match contexts?</h3>
          <div className="anchor-chain"><span><b>23</b> papers</span><i>→</i><span><b>3</b> experiments</span><i>→</i><span><b>5/7</b> verified</span></div>
          <div className="anchor-health"><span><i /> Context coverage</span><strong>94%</strong></div>
        </article>
      </section>

      <section className="daily-lower-grid">
        <article className="literature-radar card">
          <div className="section-heading"><div><span className="label">ZOTERO / LITERATURE RADAR</span><p>Today’s recommendations</p></div><button className="text-button" onClick={() => runAction(commands[1])}>Open Literature Lab →</button></div>
          <div className="radar-list">
            {papers.map((paper, index) => (
              <div key={paper.title}>
                <span className="paper-score"><strong>{index === 0 ? 94 : index === 1 ? 87 : 82}</strong><small>relevance</small></span>
                <span className="radar-copy"><small>{paper.year} · {paper.authors}</small><strong>{paper.title}</strong><em>{paper.tag} · linked to RQ-02</em></span>
                <button className={queuedPapers.includes(paper.title) ? "queued" : ""} onClick={() => setQueuedPapers((items) => items.includes(paper.title) ? items.filter((item) => item !== paper.title) : [...items, paper.title])}>{queuedPapers.includes(paper.title) ? "Queued" : "+ Queue"}</button>
                <button className="paper-open" onClick={() => runAction(commands[4])}>↗</button>
              </div>
            ))}
          </div>
        </article>

        <article className="research-debt card">
          <div className="section-heading"><div><span className="label">RESEARCH DEBT</span><p>Research debt to clear</p></div><span className="count-badge">4</span></div>
          <div className="debt-list">
            <button onClick={() => runAction(commands[8])}><span className="debt-rank critical">01</span><span><strong>Result not yet verified</strong><small>EXP-024 · GMM model selection</small></span><b>Statistics</b></button>
            <button onClick={() => runAction(quickActions[1])}><span className="debt-rank high">02</span><span><strong>Claim lacks direct evidence</strong><small>Introduction · paragraph 6</small></span><b>Evidence</b></button>
            <button onClick={() => runAction(quickActions[3])}><span className="debt-rank medium">03</span><span><strong>Method decision not documented</strong><small>Phase segmentation threshold</small></span><b>Decision</b></button>
          </div>
          <div className="debt-foot"><span>Today’s tasks can clear <b>3 items</b></span><button>View all →</button></div>
        </article>
      </section>
    </>
  );
}

function Research({ runAction }: { runAction: (a: Action) => void }) {
  return (
    <>
      <section className="page-intro compact">
        <div><p className="eyebrow">Knowledge + evidence</p><h1>Research <em>map.</em></h1><p>Follow the chain from a question to the evidence, experiment, and manuscript.</p></div>
        <button className="primary-button" onClick={() => runAction(commands[10])}>Save research decision <b>+</b></button>
      </section>
      <section className="research-layout">
        <article className="rq-map card">
          <div className="card-topline"><span className="label">Active research question</span><span className="object-id">RQ-02</span></div>
          <h2>How reliably can team formations be recognized across possession phases and match contexts?</h2>
          <div className="object-chain">
            <div><small>SUPPORTED BY</small><strong>23 Papers</strong><span>Zotero collection</span></div><b>→</b>
            <div><small>TESTED BY</small><strong>3 Experiments</strong><span>2 currently active</span></div><b>→</b>
            <div><small>PRODUCES</small><strong>7 Results</strong><span>5 verified</span></div><b>→</b>
            <div><small>REPORTED IN</small><strong>Results §3.2</strong><span>Draft in progress</span></div>
          </div>
          <div className="linked-objects">
            <span>Hypothesis <b>H2.1</b></span><span>Dataset <b>TRK-WF-v2.4</b></span><span>Method <b>GMM</b></span><span>Concept <b>Formation</b></span>
          </div>
        </article>
        <article className="knowledge-gateway card">
          <div className="card-topline"><span className="label">Knowledge gateway</span><span className="source-chip"><SourceDot /> Obsidian</span></div>
          <h3>Ask what you already know.</h3>
          <p>Retrieve focused notes and decisions without dumping the whole vault into context.</p>
          <button className="gateway-input" onClick={() => runAction(quickActions[0])}><span>What have I decided about…</span><kbd>⌘ ↵</kbd></button>
          <div className="suggestion-list">
            <button onClick={() => runAction(quickActions[0])}>Retrieve my definition of formation <span>→</span></button>
            <button onClick={() => runAction(quickActions[0])}>Show decisions relevant to phase segmentation <span>→</span></button>
          </div>
        </article>
      </section>
      <section className="literature-card card">
        <div className="section-heading">
          <div><span className="label">Literature lab</span><p>Retrieved for RQ-02</p></div>
          <div className="button-row"><button className="quiet-button" onClick={() => runAction(commands[5])}>Compare papers</button><button className="primary-button small" onClick={() => runAction(commands[4])}>Read paper</button></div>
        </div>
        <div className="paper-table">
          <div className="paper-head"><span>Paper</span><span>Relevance</span><span>Evidence link</span></div>
          {papers.map((paper) => (
            <button className="paper-row" key={paper.title} onClick={() => runAction(commands[4])}>
              <span className="paper-main"><b>{paper.year}</b><span><strong>{paper.title}</strong><small>{paper.authors}</small></span></span>
              <span><i className="relevance-bar"><b style={{ width: paper.tag === "Direct evidence" ? "92%" : paper.tag === "Context" ? "71%" : "84%" }} /></i></span>
              <span className="paper-tag">{paper.tag}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function DataExperiments({ runAction }: { runAction: (a: Action) => void }) {
  return (
    <>
      <section className="page-intro compact">
        <div><p className="eyebrow">Computational record</p><h1>Data & <em>experiments.</em></h1><p>Every result anchored to a dataset version, code revision, and model specification.</p></div>
        <button className="primary-button" onClick={() => runAction({ label: "Start new analysis", meta: "Experiment", tone: "mint", command: "@start-analysis" })}>Start analysis <b>+</b></button>
      </section>
      <section className="registry-top">
        <article className="dataset-card card">
          <div className="card-topline"><span className="label">Active dataset</span><span className="status-pill blue"><i /> Validated</span></div>
          <div className="dataset-title"><span>TRK</span><div><small>DATASET-006 · VERSION 2.4</small><h2>Women’s football tracking data</h2></div></div>
          <div className="data-stats"><div><strong>52</strong><span>matches</span></div><div><strong>25 Hz</strong><span>frequency</span></div><div><strong>1.2%</strong><span>missing</span></div><div><strong>114</strong><span>variables</span></div></div>
          <div className="trace-line"><span><i /> Source</span><b>Second Spectrum</b><span><i /> Version</span><b>SHA · a83f2c1</b></div>
          <button className="wide-button" onClick={() => runAction(commands[6])}>Inspect dataset <span>→</span></button>
        </article>
        <article className="method-selector card">
          <span className="label">Method selector</span><h3>Fit the method to the question.</h3><p>Recommendations use the research question, data structure, nesting, sample size and analytical objective.</p>
          <div className="method-tags"><span>Repeated measures</span><span>Nested matches</span><span>Unsupervised</span></div>
          <button className="primary-button" onClick={() => runAction(commands[7])}>Evaluate methods <b>→</b></button>
        </article>
      </section>
      <section className="experiment-card card">
        <div className="section-heading"><div><span className="label">Experiment registry</span><p>Study 02 · 3 experiments</p></div><button className="quiet-button">View archive</button></div>
        <div className="experiment-table">
          <div className="experiment-head"><span>ID / objective</span><span>Method</span><span>Traceability</span><span>Status</span><span /></div>
          <div className="experiment-row active"><span><b>EXP-024</b><strong>Pace of play — model selection</strong><small>Updated 18 min ago</small></span><span>Gaussian mixture</span><span><i className="trace-dots"><b /><b /><b /></i> Complete</span><span className="status-pill lime"><i /> Running</span><button onClick={() => runAction({ label: "Continue EXP-024", meta: "Analysis", tone: "mint", command: "@continue-experiment" })}>Open ↗</button></div>
          <div className="experiment-row"><span><b>EXP-023</b><strong>Formation cluster stability</strong><small>Updated 2h ago</small></span><span>Bootstrapped GMM</span><span><i className="trace-dots"><b /><b /><b /></i> Complete</span><span className="status-pill blue"><i /> Verified</span><button onClick={() => runAction(commands[2])}>Open ↗</button></div>
          <div className="experiment-row"><span><b>EXP-021</b><strong>Representation ablation</strong><small>Updated 3 days ago</small></span><span>Random forest</span><span><i className="trace-dots"><b /><b className="off" /><b /></i> 1 warning</span><span className="status-pill neutral"><i /> Paused</span><button onClick={() => runAction(commands[8])}>Open ↗</button></div>
        </div>
      </section>
    </>
  );
}

function Manuscript({ runAction }: { runAction: (a: Action) => void }) {
  return (
    <>
      <section className="page-intro compact">
        <div><p className="eyebrow">Argument before prose</p><h1>Manuscript <em>workspace.</em></h1><p>Structure first. Every claim traceable, every result verified.</p></div>
        <button className="primary-button" onClick={() => runAction(commands[9])}>Continue Methods <b>→</b></button>
      </section>
      <section className="manuscript-overview card">
        <div className="manuscript-meta"><span className="label">MANUSCRIPT-02</span><span className="status-pill violet"><i /> Drafting</span></div>
        <div className="manuscript-main"><div><h2>Automated recognition of dynamic team formations in elite women’s football</h2><p>Target journal · Journal of Sports Sciences <span>·</span> 4,286 words</p></div><ProgressRing value={54} /></div>
        <div className="section-progress-grid">
          {manuscriptSections.map((section) => <button key={section.name} onClick={() => runAction({ label: `Open ${section.name}`, meta: "Manuscript", tone: "violet", command: "@polish-structure" })}><div><strong>{section.name}</strong><span>{section.value}%</span></div><i><b style={{ width: `${section.value}%` }} /></i><small>{section.state}</small></button>)}
        </div>
      </section>
      <section className="manuscript-lower">
        <article className="argument-map card">
          <div className="section-heading"><div><span className="label">Introduction argument map</span><p>7 logical moves · 1 weak connection</p></div><button className="quiet-button">Edit map</button></div>
          <div className="argument-flow">
            {["Problem", "Existing knowledge", "Current approaches", "Limitation", "Research gap", "Why it matters", "Present study"].map((item, index) => <div key={item} className={item === "Research gap" ? "warning" : ""}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong>{index < 6 && <b>→</b>}</div>)}
          </div>
          <div className="map-warning"><span>!</span><p><strong>Weak transition detected</strong>The move from methodological limitation to the research gap needs direct evidence.</p><button onClick={() => runAction(quickActions[1])}>Find evidence</button></div>
        </article>
        <article className="editorial-rule card">
          <span className="label">Editorial rule</span>
          <div className="rule-stack"><div><b>01</b><span><strong>Section</strong><small>Argument sequence</small></span></div><i /><div><b>02</b><span><strong>Paragraph</strong><small>One clear function</small></span></div><i /><div><b>03</b><span><strong>Sentence</strong><small>Precision and tone</small></span></div></div>
          <button className="wide-button" onClick={() => runAction({ label: "Check argument flow", meta: "Writing", tone: "violet", command: "@polish-structure" })}>Check argument flow <span>→</span></button>
        </article>
      </section>
    </>
  );
}

function Workspace({ runAction }: { runAction: (a: Action) => void }) {
  return (
    <>
      <section className="page-intro compact"><div><p className="eyebrow">Orchestration layer</p><h1>AI <em>workspace.</em></h1><p>Choose the task. WorkBuddy selects an agent and assembles only the context it needs.</p></div><span className="context-health"><i /> Context systems healthy</span></section>
      <section className="workspace-grid">
        <article className="agent-panel card">
          <div className="card-topline"><span className="label">Specialist agents</span><span className="count-badge">12</span></div>
          <div className="agent-list">{agents.map(([name, detail, status], index) => <button key={name} onClick={() => runAction({ label: name, meta: "Specialist agent", tone: index % 2 ? "blue" : "mint", command: "@new-task" })}><span className={`agent-avatar a${index}`}>{name.split(" ").map((w) => w[0]).join("")}</span><span><strong>{name}</strong><small>{detail}</small></span><i className={status} /></button>)}</div>
        </article>
        <article className="workspace-composer card">
          <div className="composer-top"><span className="spark">✦</span><div><span className="label">New research task</span><h2>What do you want to investigate?</h2></div></div>
          <div className="composer-box"><textarea aria-label="Describe research task" defaultValue="Assess whether the three-cluster solution is stable enough to report, and identify the diagnostics I should verify." /><div><span>EXP-024 attached</span><button onClick={() => runAction(commands[8])}>Build context & run <b>↑</b></button></div></div>
          <div className="context-preview"><div className="context-preview-head"><span>CONTEXT PREVIEW</span><strong>6 sources · 3,840 tokens</strong></div><div className="context-source-list"><span><SourceDot /> Project <b>Study 02</b></span><span><SourceDot /> RQ <b>RQ-02</b></span><span><SourceDot /> Experiment <b>EXP-024</b></span><span><SourceDot /> Dataset <b>v2.4</b></span><span><SourceDot tone="blue" /> Literature <b>5 papers</b></span><span><SourceDot tone="violet" /> Decisions <b>3 notes</b></span></div></div>
          <p className="context-note"><span>◇</span> Irrelevant project history and unverified outputs will be excluded.</p>
        </article>
      </section>
      <section className="skills-strip card"><div><span className="label">Skills library</span><p>Stable, reusable research workflows</p></div><div className="skill-chips">{commands.slice(4, 10).map((command) => <button key={command.command} onClick={() => runAction(command)}>{command.command}</button>)}</div><button className="text-button">View all 18 →</button></section>
    </>
  );
}

function Review({ runAction }: { runAction: (a: Action) => void }) {
  const reviewerCards = [
    ["Scientific reviewer", "Argument, novelty, interpretation", "2 major", "orange"],
    ["Statistical reviewer", "Models, assumptions, uncertainty", "1 major", "violet"],
    ["Football analysis reviewer", "Tactical and ecological validity", "3 minor", "mint"],
    ["Machine learning reviewer", "Validation, leakage, generalization", "Ready", "blue"],
  ];
  return (
    <>
      <section className="page-intro compact"><div><p className="eyebrow">Independent challenge</p><h1>Review <em>room.</em></h1><p>Separate reviewer lenses surface concerns before they reach peer review.</p></div><button className="primary-button" onClick={() => runAction(quickActions[3])}>Run full review <b>→</b></button></section>
      <section className="review-summary card"><div><span className="label">Manuscript readiness</span><ProgressRing value={68} /></div><div className="readiness-copy"><h2>Promising, with two issues to resolve.</h2><p>The analytical story is coherent. Validation reporting and the novelty claim need stronger support before internal circulation.</p></div><div className="review-counts"><span><strong>3</strong><small>Major concerns</small></span><span><strong>7</strong><small>Minor concerns</small></span><span><strong>5</strong><small>Resolved</small></span></div></section>
      <section className="reviewer-grid">{reviewerCards.map(([name, detail, issue, tone], index) => <article className="reviewer-card card" key={name}><div className={`reviewer-mark ${tone}`}>{index === 0 ? "SC" : index === 1 ? "ST" : index === 2 ? "FA" : "ML"}</div><h3>{name}</h3><p>{detail}</p><div><span className={`status-pill ${tone}`}><i /> {issue}</span><button onClick={() => runAction({ label: `Open ${name}`, meta: "Review", tone, command: "@reviewer-critique" })}>Open report ↗</button></div></article>)}</section>
      <section className="concerns card"><div className="section-heading"><div><span className="label">Priority concerns</span><p>Ranked by impact on scientific validity</p></div><span className="updated">Last review · 34 min ago</span></div><div className="concern-row"><span className="severity">01</span><span><strong>External validation is underspecified</strong><small>The held-out competition and selection criteria need explicit reporting.</small></span><b>MAJOR</b><button onClick={() => runAction(quickActions[3])}>Resolve →</button></div><div className="concern-row"><span className="severity">02</span><span><strong>Novelty claim exceeds retrieved evidence</strong><small>Two adjacent approaches should be acknowledged in the Introduction.</small></span><b>MAJOR</b><button onClick={() => runAction(quickActions[1])}>Resolve →</button></div></section>
    </>
  );
}

function Projects({ changeProject }: { changeProject: (name: string) => void }) {
  return (
    <>
      <section className="page-intro compact"><div><p className="eyebrow">Isolated research contexts</p><h1>PhD <em>projects.</em></h1><p>Switch studies without mixing research questions, decisions, datasets, or evidence.</p></div><button className="primary-button">New project <b>+</b></button></section>
      <section className="project-grid">
        {projects.map((project, index) => <article className={`project-card card ${index === 0 ? "selected" : ""}`} key={project.name} style={{ "--project-color": project.color } as React.CSSProperties}><div className="project-top"><span>{project.code}</span>{index === 0 && <b>ACTIVE</b>}</div><div className="project-orbit"><span /><i /><b /></div><h2>{project.name}</h2><p>{project.detail}</p><div className="project-phase"><span>Current phase</span><strong>{project.phase}</strong></div><div className="project-progress"><i><b style={{ width: `${project.progress}%` }} /></i><span>{project.progress}%</span></div><div className="project-links"><span><b>{index === 0 ? 3 : 2}</b> RQs</span><span><b>{index === 1 ? 11 : index === 0 ? 7 : 2}</b> Results</span><span><b>{index === 2 ? 9 : 23}</b> Papers</span></div><button onClick={() => changeProject(project.name)}>{index === 0 ? "Open project" : "Switch context"} <span>→</span></button></article>)}
        <button className="new-project-card"><span>+</span><strong>Create research project</strong><small>Start with a clean, isolated context</small></button>
      </section>
      <section className="portfolio-note card"><span>◇</span><div><strong>Cross-project insight</strong><p>The operational definition of “possession phase” differs between Study 01 and Study 02. Consider documenting why.</p></div><button>Review definitions →</button></section>
    </>
  );
}

function Operations({ runAction }: { runAction: (a: Action) => void }) {
  const [activeTab, setActiveTab] = useState<"pipeline" | "mentor" | "review">("pipeline");
  const [energy, setEnergy] = useState(4);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [reflection, setReflection] = useState("Built the stability-check framework for EXP-024; bootstrap iterations and reporting criteria still need confirmation.\nTomorrow’s priority: verify the result, then update Results §3.2.");

  const tabs = [
    ["pipeline", "Submission pipeline"],
    ["mentor", "Supervision"],
    ["review", "Research review"],
  ] as const;

  return (
    <>
      <section className="page-intro compact operations-intro">
        <div><p className="eyebrow">PHD OPERATIONS</p><h1>PhD <em>operations.</em></h1><p>Manage submissions, supervisory decisions, and reflection without letting administration interrupt the research.</p></div>
        <div className="energy-check"><span>Energy</span>{[1,2,3,4,5].map((value) => <button key={value} className={energy === value ? "active" : ""} onClick={() => setEnergy(value)}>{value}</button>)}<strong>{energy >= 4 ? "Ready for deep work" : energy >= 3 ? "Steady pace" : "Reduce the load"}</strong></div>
      </section>

      <div className="operations-tabs">{tabs.map(([key, label]) => <button key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}{key === "mentor" && <span>2</span>}</button>)}</div>

      {activeTab === "pipeline" && <>
        <section className="ops-overview card"><div><span className="label">SUBMISSION OVERVIEW</span><h2>A traceable path from manuscript to publication.</h2></div><div className="ops-stats"><span><strong>3</strong><small>Active</small></span><span><strong>1</strong><small>Awaiting feedback</small></span><span><strong>24d</strong><small>Next deadline</small></span></div><button className="primary-button">Add submission <b>＋</b></button></section>
        <section className="submission-board">
          <article className="pipeline-column card"><div><span>DRAFTING</span><b>1</b></div><button className="submission-ticket"><small>MANUSCRIPT-02</small><strong>Formation recognition in elite women’s football</strong><span>Journal of Sports Sciences</span><i><b style={{ width: "54%" }} /></i><em>Methods · internal review</em></button></article>
          <article className="pipeline-column card"><div><span>INTERNAL REVIEW</span><b>1</b></div><button className="submission-ticket warning"><small>MANUSCRIPT-01</small><strong>Pace of play across match contexts</strong><span>Sports Biomechanics</span><p><b>2</b> major concerns remain</p><em>Review due · 18 Aug</em></button></article>
          <article className="pipeline-column card"><div><span>SUBMITTED</span><b>1</b></div><button className="submission-ticket blue"><small>CONF-004</small><strong>Tracking-derived tactical compactness</strong><span>World Congress of Performance Analysis</span><p>Waiting for decision</p><em>Submitted · 29 Jul</em></button></article>
          <article className="pipeline-column card"><div><span>REVISION</span><b>0</b></div><div className="empty-pipeline"><span>◇</span><p>No active revisions</p></div></article>
        </section>
        <section className="submission-deadline card"><span className="deadline-date"><strong>04</strong><small>SEP</small></span><div><span className="label">NEXT DEADLINE</span><strong>MANUSCRIPT-01 · Internal circulation</strong><small>24 days · argument check, statistical review and figure audit required</small></div><div className="deadline-gates"><span className="done">✓ Argument</span><span>○ Statistics</span><span>○ Figures</span></div><button onClick={() => runAction(quickActions[3])}>Prepare review →</button></section>
      </>}

      {activeTab === "mentor" && <section className="mentor-grid">
        <article className="mentor-brief card"><div className="section-heading"><div><span className="label">NEXT SUPERVISION · 14 AUG</span><p>Supervision brief</p></div><span className="status-pill lime"><i /> 80% ready</span></div><h2>Ask for decisions with evidence—not a full progress dump.</h2><div className="brief-sections"><div><span>01</span><p><strong>Core progress</strong>EXP-024 model selection is complete; agree the minimum reporting standard for stability.</p></div><div><span>02</span><p><strong>Decision required</strong>Should cross-match validation be a primary analysis or supplementary material?</p></div><div><span>03</span><p><strong>Evidence prepared</strong>Figure 3, stability diagnostics, and five directly relevant papers.</p></div></div><button className="primary-button" onClick={() => runAction({ label: "Prepare supervisor briefing", meta: "Meeting", tone: "violet", command: "@supervisor-brief" })}>Generate one-page brief <b>✦</b></button></article>
        <article className="mentor-commitments card"><div className="section-heading"><div><span className="label">COMMITMENT TRACKER</span><p>Commitments & feedback</p></div><span className="count-badge">2</span></div><div className="commitment-list"><div><span className="commit-status overdue">!</span><span><strong>Review the Methods draft</strong><small>Supervisor · due 8 Aug</small><em>3 days overdue</em></span><button>Follow up</button></div><div><span className="commit-status waiting">…</span><span><strong>Confirm the target journal</strong><small>Joint decision · review 14 Aug</small><em>Awaiting discussion</em></span><button>Prepare</button></div><div><span className="commit-status done">✓</span><span><strong>Approved exclusion of phases under 8s</strong><small>Meeting · 31 Jul</small><em>Saved as DEC-041</em></span><button>View</button></div></div></article>
        <article className="decision-recall card"><span className="label">DECISION MEMORY</span><blockquote>“Run the cross-match validation first; then decide whether it belongs in the main results or supplementary material.”</blockquote><p>Recorded at the 31 Jul meeting · linked to EXP-026 · review on 14 Aug</p><button>Convert to research decision →</button></article>
      </section>}

      {activeTab === "review" && <section className="reflection-grid">
        <article className="daily-reflection card"><div className="section-heading"><div><span className="label">STRUCTURED DAILY REVIEW</span><p>PhD research review</p></div><span className="updated">Compiled from 7 sources</span></div><div className="reflection-summary"><span><strong>2</strong><small>Tasks completed</small></span><span><strong>47m</strong><small>Deep work</small></span><span><strong>1</strong><small>New decisions</small></span><span><strong>3↓</strong><small>Research debt</small></span></div><label><span>Core output, unfinished analysis, and tomorrow’s priority</span><textarea value={reflection} onChange={(event) => { setReflection(event.target.value); setReviewSaved(false); }} /></label><div className="reflection-actions"><button className="quiet-button" onClick={() => runAction({ label: "Synthesize daily research log", meta: "Reflection", tone: "mint", command: "@daily-review" })}>Refine with AI</button><button className="primary-button" onClick={() => setReviewSaved(true)}>{reviewSaved ? "Saved to Obsidian ✓" : "Save research review"}</button></div></article>
        <article className="research-week card"><div className="section-heading"><div><span className="label">THIS WEEK</span><p>Research effort</p></div></div><div className="week-bars"><div><span>Analysis</span><i><b style={{ width: "82%" }} /></i><strong>6.4h</strong></div><div><span>Writing</span><i><b style={{ width: "61%" }} /></i><strong>4.8h</strong></div><div><span>Reading</span><i><b style={{ width: "39%" }} /></i><strong>3.1h</strong></div><div><span>Meetings</span><i><b style={{ width: "17%" }} /></i><strong>1.3h</strong></div></div><div className="week-insight"><span>◇</span><p><strong>Pacing note</strong>Analysis is ahead of plan this week, but Results writing has not kept pace.</p></div></article>
        <article className="tomorrow-plan card"><span className="label">TOMORROW / RECOMMENDED</span><h3>Once the result is verified, write the statistical fact into Results immediately.</h3><p>This prevents scientific interpretation from drifting away from the statistical evidence.</p><button onClick={() => runAction({ label: "Plan tomorrow", meta: "Planning", tone: "blue", command: "@plan-tomorrow" })}>Add to tomorrow’s Must list →</button></article>
      </section>}
    </>
  );
}

function ActionDrawer({ action, onClose }: { action: Action; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="action-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={`${action.label} workflow`}>
        <div className="drawer-head"><button onClick={onClose}>×</button><span className="label">Structured AI workflow</span><span className={`action-mark ${action.tone}`}>✦</span></div>
        <div className="drawer-title"><span>{action.command}</span><h2>{action.label}</h2><p>The task will run with verified, project-specific context and a structured output.</p></div>
        <div className="drawer-section"><div className="drawer-section-title"><span>01</span><strong>Task input</strong><b>Required</b></div><textarea defaultValue={action.command.includes("evidence") ? "Team formations become less stable during defensive transitions." : action.command.includes("result") ? "Interpret the selected three-cluster solution from EXP-024." : "Focus on the active research question and current analysis."} /></div>
        <div className="drawer-section"><div className="drawer-section-title"><span>02</span><strong>Assembled context</strong><b className="ready">Ready</b></div><div className="drawer-sources"><label><input type="checkbox" defaultChecked /><span>Project + RQ</span><b>2 objects</b></label><label><input type="checkbox" defaultChecked /><span>Research decisions</span><b>3 notes</b></label><label><input type="checkbox" defaultChecked /><span>Zotero literature</span><b>5 papers</b></label><label><input type="checkbox" defaultChecked /><span>Experiment + results</span><b>EXP-024</b></label></div></div>
        <div className="drawer-section output-contract"><div className="drawer-section-title"><span>03</span><strong>Output contract</strong></div><p><i /> Separate evidence from inference</p><p><i /> Flag missing information as [AUTHOR CHECK]</p><p><i /> Preserve source links and object IDs</p></div>
        <div className="drawer-footer"><div><SourceDot /><span><strong>Context ready</strong><small>3,840 tokens · 6 sources</small></span></div><button className="primary-button" disabled={running} onClick={() => setRunning(true)}>{running ? "Agent is working…" : "Run workflow"} <b>{running ? "···" : "↑"}</b></button></div>
        {running && <div className="running-state"><span className="running-orb">✦</span><div><strong>Specialist agent is working</strong><p>Checking sources and applying the output contract…</p></div><button onClick={() => setRunning(false)}>Cancel</button></div>}
      </aside>
    </div>
  );
}

function ContextDrawer({ onClose }: { onClose: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="action-drawer context-drawer" onMouseDown={(e) => e.stopPropagation()}><div className="drawer-head"><button onClick={onClose}>×</button><span className="label">Context builder</span><span className="action-mark mint">◇</span></div><div className="drawer-title"><span>ACTIVE CONTEXT · RQ-02</span><h2>What WorkBuddy knows right now</h2><p>Assembled for relevance, with source boundaries and verification state preserved.</p></div><div className="context-meter"><div><strong>94</strong><span>/100</span></div><p><b>Excellent context coverage</b><span>One operational definition needs confirmation.</span></p></div><div className="context-groups"><section><div><span>PROJECT FRAME</span><b>3 objects</b></div><p><i className="checked">✓</i><span><strong>Study 02 · Formation Recognition</strong><small>Project · active</small></span></p><p><i className="checked">✓</i><span><strong>RQ-02 · Cross-context reliability</strong><small>Research question</small></span></p></section><section><div><span>KNOWLEDGE</span><b>6 notes</b></div><p><i className="checked">✓</i><span><strong>Formation · operational definition</strong><small>Obsidian · updated 4d ago</small></span></p><p><i className="warning">!</i><span><strong>Possession phase threshold</strong><small>Obsidian · author check required</small></span></p></section><section><div><span>EVIDENCE + COMPUTATION</span><b>9 sources</b></div><p><i className="checked">✓</i><span><strong>5 directly relevant papers</strong><small>Zotero · metadata verified</small></span></p><p><i className="checked">✓</i><span><strong>EXP-024 + TRK-WF-v2.4</strong><small>GitHub · a83f2c1</small></span></p></section></div><div className="drawer-footer"><span className="small-note">Last assembled 18 min ago</span><button className="primary-button" onClick={onClose}>Use this context <b>→</b></button></div></aside></div>;
}

export default function Home() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [action, setAction] = useState<Action | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setAction(null);
        setContextOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredCommands = useMemo(() => commands.filter((item) => `${item.label} ${item.meta} ${item.command}`.toLowerCase().includes(commandQuery.toLowerCase())), [commandQuery]);
  const activeLabel = navItems.find((item) => item.key === activeModule)?.label ?? "Today";

  const selectModule = (key: ModuleKey) => {
    setActiveModule(key);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const changeProject = (name: string) => setToast(`Opened ${name}`);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><i /><b /></span><span><strong>WORKBUDDY</strong><small>SPORTS RESEARCH OS</small></span><button className="mobile-close" onClick={() => setMobileNav(false)}>×</button></div>
        <nav aria-label="Main navigation"><span className="nav-label">RESEARCH WORKBENCH</span>{navItems.map((item) => <button key={item.key} className={activeModule === item.key ? "active" : ""} onClick={() => selectModule(item.key)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => setCommandOpen(true)}><span className="nav-icon">⌘</span><span>Command library</span></button><button onClick={() => setToast("Data sources and preferences are ready") }><span className="nav-icon">⚙</span><span>Settings</span></button><div className="sync-status"><span className="sync-orbit"><i /><b /></span><span><strong>Research systems</strong><small><SourceDot /> 3 sources connected</small></span></div></div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><button className="mobile-menu" onClick={() => setMobileNav(true)}>☰</button><span>Research Workbench</span><b>/</b><strong>{activeLabel}</strong></div><button className="command-trigger" onClick={() => setCommandOpen(true)}><span>⌕</span><span>Search or run a research workflow…</span><kbd>⌘ K</kbd></button><div className="top-actions"><button className="icon-button" aria-label="Notifications"><span>°</span>♢</button><button className="context-button" onClick={() => setContextOpen(true)}><span className="context-diamond">◇</span><span><small>CONTEXT</small><strong>Ready · 94%</strong></span></button><button className="profile-button" aria-label="Profile">DR</button></div></header>
        <main className="content">
          {activeModule === "dashboard" && <Dashboard runAction={setAction} openContext={() => setContextOpen(true)} />}
          {activeModule === "research" && <Research runAction={setAction} />}
          {activeModule === "data" && <DataExperiments runAction={setAction} />}
          {activeModule === "manuscript" && <Manuscript runAction={setAction} />}
          {activeModule === "workspace" && <Workspace runAction={setAction} />}
          {activeModule === "review" && <Review runAction={setAction} />}
          {activeModule === "projects" && <Projects changeProject={changeProject} />}
          {activeModule === "operations" && <Operations runAction={setAction} />}
        </main>
      </div>

      {action && <ActionDrawer action={action} onClose={() => setAction(null)} />}
      {contextOpen && <ContextDrawer onClose={() => setContextOpen(false)} />}
      {commandOpen && <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}><div className="command-palette" onMouseDown={(e) => e.stopPropagation()}><div className="command-search"><span>⌕</span><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search research actions…" /><kbd>ESC</kbd></div><div className="command-results"><span className="label">Suggested workflows</span>{filteredCommands.length ? filteredCommands.map((item) => <button key={item.command} onClick={() => { setCommandOpen(false); setAction(item); setCommandQuery(""); }}><span className={`action-mark ${item.tone}`}>✦</span><span><strong>{item.label}</strong><small>{item.command}</small></span><b>{item.meta}</b></button>) : <p className="empty-command">No workflow matches “{commandQuery}”.</p>}</div><div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span>Context-aware search</span></div></div></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}
