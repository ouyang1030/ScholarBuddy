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
  { key: "dashboard", label: "今日科研", icon: "⌂", badge: "3" },
  { key: "research", label: "研究地图", icon: "⌁", badge: "8" },
  { key: "data", label: "数据与实验", icon: "∿", badge: "3" },
  { key: "manuscript", label: "论文工作台", icon: "¶" },
  { key: "workspace", label: "AI 工作区", icon: "✦" },
  { key: "review", label: "独立审稿", icon: "✓", badge: "4" },
  { key: "projects", label: "项目与任务", icon: "▦" },
  { key: "operations", label: "博士运营", icon: "◫", badge: "2" },
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
  { id: 1, title: "验证三聚类方案的稳定性", object: "EXP-024", category: "统计分析", time: "09:30–11:00", priority: "Must", done: false },
  { id: 2, title: "为 Introduction §1.6 补充直接证据", object: "RQ-02", category: "文献", time: "11:30–12:00", priority: "Must", done: false },
  { id: 3, title: "澄清阶段分割阈值的研究决策", object: "DEC-041", category: "写作", time: "14:00–15:00", priority: "Should", done: false },
];

function Dashboard({ runAction, openContext }: { runAction: (a: Action) => void; openContext: () => void }) {
  const [tasks, setTasks] = useState<DailyTask[]>(starterTasks);
  const [newTask, setNewTask] = useState("");
  const [focusSeconds, setFocusSeconds] = useState(47 * 60 + 18);
  const [focusRunning, setFocusRunning] = useState(false);
  const [queuedPapers, setQueuedPapers] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem("workbuddy-daily-tasks");
    if (saved) {
      try { setTasks(JSON.parse(saved) as DailyTask[]); } catch { /* keep starter state */ }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("workbuddy-daily-tasks", JSON.stringify(tasks));
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
    setTasks((items) => [...items, { id: Date.now(), title: newTask.trim(), object: "INBOX", category: "临时任务", time: "待安排", priority: "Should", done: false }]);
    setNewTask("");
  };

  return (
    <>
      <section className="daily-intro">
        <div>
          <p className="eyebrow">2026年8月11日 · 星期二 · Research cycle 08</p>
          <h1>今日科研</h1>
          <p>把任务、时间、研究问题与证据放在同一屏，只推进真正影响论文的工作。</p>
        </div>
        <div className="daily-intro-actions">
          <button className="quiet-button" onClick={openContext}><span className="context-diamond small">◇</span> 当前上下文 94%</button>
          <button className="primary-button" onClick={() => runAction({ label: "Plan today’s research", meta: "Research planning", tone: "mint", command: "@plan-today" })}>AI 规划今日 <b>✦</b></button>
        </div>
      </section>

      <section className="daily-command-grid">
        <article className="today-tasks card">
          <div className="section-heading">
            <div><span className="label">TODAY / EXECUTION</span><p>今日全部任务</p></div>
            <span className="completion-count"><b>{completed}</b> / {tasks.length} 完成</span>
          </div>
          <div className="task-capture">
            <input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTask()} placeholder="添加临时科研任务…" aria-label="添加今日科研任务" />
            <button onClick={addTask}>+</button>
          </div>
          <div className="daily-task-list">
            {tasks.map((task) => (
              <div className={task.done ? "done" : ""} key={task.id}>
                <button className="task-check" onClick={() => toggleTask(task.id)} aria-label={`${task.done ? "恢复" : "完成"}${task.title}`}>{task.done ? "✓" : ""}</button>
                <span className="task-copy"><strong>{task.title}</strong><small><b>{task.object}</b> · {task.category}</small></span>
                <span className="task-plan"><strong>{task.time}</strong><small className={task.priority === "Must" ? "must" : "should"}>{task.priority}</small></span>
                <button className="task-open" onClick={() => runAction({ label: task.title, meta: task.object, tone: task.category === "文献" ? "blue" : "mint", command: task.category === "文献" ? "@evidence-for-claim" : "@continue-task" })}>↗</button>
              </div>
            ))}
          </div>
          <div className="task-footer"><span>任务完成后自动写入今日复盘与研究日志</span><button>打开项目任务表 →</button></div>
        </article>

        <article className="today-schedule card">
          <div className="section-heading"><div><span className="label">TIME BLOCKS</span><p>今日时间安排</p></div><button className="mini-add">＋ 时间块</button></div>
          <div className="schedule-list">
            <div><time>09:30</time><i className="mint" /><span><strong>EXP-024 稳定性诊断</strong><small>分析 · 90 min</small></span></div>
            <div><time>11:30</time><i className="blue" /><span><strong>Introduction 证据检索</strong><small>阅读 · 30 min</small></span></div>
            <div className="now"><time>14:00</time><i className="violet" /><span><strong>Methods 决策说明</strong><small>写作 · 60 min</small></span><b>NOW</b></div>
            <div><time>16:30</time><i className="neutral" /><span><strong>整理导师会议摘要</strong><small>沟通 · 30 min</small></span></div>
          </div>
          <button className="wide-button">查看科研日历 <span>→</span></button>
        </article>

        <article className="focus-session card">
          <div className="focus-top"><span className="label">FOCUS SESSION</span><span className={focusRunning ? "live" : "paused"}><i /> {focusRunning ? "记录中" : "已暂停"}</span></div>
          <span className="focus-object">EXP-024 · STATISTICAL CHECK</span>
          <h2>{focusTime}</h2>
          <p>验证三聚类方案的稳定性</p>
          <div className="focus-wave">{[4,8,13,21,12,17,25,10,18,8,5].map((height, index) => <i key={index} style={{ height }} />)}</div>
          <button onClick={() => setFocusRunning((value) => !value)}>{focusRunning ? "暂停专注" : "继续专注"}<span>{focusRunning ? "Ⅱ" : "▶"}</span></button>
        </article>
      </section>

      <section className="daily-progress-row">
        <article className="writing-today card">
          <div className="section-heading"><div><span className="label">WRITING / MANUSCRIPT-02</span><p>当前写作进度</p></div><button className="quiet-button" onClick={() => runAction(commands[9])}>继续写作 →</button></div>
          <div className="writing-main">
            <div><span className="writing-section-tag">METHODS · §2.4</span><h2>Phase segmentation and formation representation</h2><p>下一步：解释 8 秒阈值的理论依据，并关联 DEC-041。</p></div>
            <div className="writing-numbers"><span><strong>4,286</strong><small>当前字数</small></span><span><strong>8,000</strong><small>章节目标</small></span><span><strong>54%</strong><small>论证完整度</small></span><span><strong>82%</strong><small>引用覆盖率</small></span></div>
          </div>
          <div className="writing-track"><i style={{ width: "54%" }} /><span style={{ left: "54%" }}>4,286</span></div>
          <div className="writing-log"><span>本周写作 <b>312 分钟</b></span><span>新增 <b>1,240 字</b></span><span>待解决 <b className="warning-text">2 个 AUTHOR CHECK</b></span></div>
        </article>

        <article className="research-anchor card">
          <div className="card-topline"><span className="label">RESEARCH ANCHOR</span><button onClick={openContext}>查看上下文 ↗</button></div>
          <span className="object-id">RQ-02 · ACTIVE</span>
          <h3>How reliably can team formations be recognized across possession phases and match contexts?</h3>
          <div className="anchor-chain"><span><b>23</b> papers</span><i>→</i><span><b>3</b> experiments</span><i>→</i><span><b>5/7</b> verified</span></div>
          <div className="anchor-health"><span><i /> Context coverage</span><strong>94%</strong></div>
        </article>
      </section>

      <section className="daily-lower-grid">
        <article className="literature-radar card">
          <div className="section-heading"><div><span className="label">ZOTERO / LITERATURE RADAR</span><p>今日文献推荐</p></div><button className="text-button" onClick={() => runAction(commands[1])}>打开 Literature Lab →</button></div>
          <div className="radar-list">
            {papers.map((paper, index) => (
              <div key={paper.title}>
                <span className="paper-score"><strong>{index === 0 ? 94 : index === 1 ? 87 : 82}</strong><small>相关度</small></span>
                <span className="radar-copy"><small>{paper.year} · {paper.authors}</small><strong>{paper.title}</strong><em>{paper.tag} · linked to RQ-02</em></span>
                <button className={queuedPapers.includes(paper.title) ? "queued" : ""} onClick={() => setQueuedPapers((items) => items.includes(paper.title) ? items.filter((item) => item !== paper.title) : [...items, paper.title])}>{queuedPapers.includes(paper.title) ? "已加入" : "+ 待读"}</button>
                <button className="paper-open" onClick={() => runAction(commands[4])}>↗</button>
              </div>
            ))}
          </div>
        </article>

        <article className="research-debt card">
          <div className="section-heading"><div><span className="label">RESEARCH DEBT</span><p>待清理的科研欠账</p></div><span className="count-badge">4</span></div>
          <div className="debt-list">
            <button onClick={() => runAction(commands[8])}><span className="debt-rank critical">01</span><span><strong>结果尚未验证</strong><small>EXP-024 · GMM model selection</small></span><b>统计</b></button>
            <button onClick={() => runAction(quickActions[1])}><span className="debt-rank high">02</span><span><strong>Claim 缺少直接证据</strong><small>Introduction · paragraph 6</small></span><b>证据</b></button>
            <button onClick={() => runAction(quickActions[3])}><span className="debt-rank medium">03</span><span><strong>方法决策尚未留痕</strong><small>Phase segmentation threshold</small></span><b>决策</b></button>
          </div>
          <div className="debt-foot"><span>完成今日任务预计减少 <b>3 项</b></span><button>查看全部 →</button></div>
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
  const [reflection, setReflection] = useState("完成了 EXP-024 的稳定性检查框架；仍需确认 bootstrap 次数与报告标准。\n明天优先：验证结果后更新 Results §3.2。 ");

  const tabs = [
    ["pipeline", "投稿管线"],
    ["mentor", "导师沟通"],
    ["review", "科研复盘"],
  ] as const;

  return (
    <>
      <section className="page-intro compact operations-intro">
        <div><p className="eyebrow">PHD OPERATIONS</p><h1>博士 <em>运营台.</em></h1><p>管理投稿、导师决策与科研复盘；让行政和沟通服务于研究，而不是打断研究。</p></div>
        <div className="energy-check"><span>今日精力</span>{[1,2,3,4,5].map((value) => <button key={value} className={energy === value ? "active" : ""} onClick={() => setEnergy(value)}>{value}</button>)}<strong>{energy >= 4 ? "适合深度工作" : energy >= 3 ? "保持节奏" : "减少负荷"}</strong></div>
      </section>

      <div className="operations-tabs">{tabs.map(([key, label]) => <button key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}{key === "mentor" && <span>2</span>}</button>)}</div>

      {activeTab === "pipeline" && <>
        <section className="ops-overview card"><div><span className="label">SUBMISSION OVERVIEW</span><h2>从稿件到发表，一条可追踪的管线。</h2></div><div className="ops-stats"><span><strong>3</strong><small>进行中</small></span><span><strong>1</strong><small>等待反馈</small></span><span><strong>24d</strong><small>最近截止</small></span></div><button className="primary-button">添加投稿项目 <b>＋</b></button></section>
        <section className="submission-board">
          <article className="pipeline-column card"><div><span>DRAFTING</span><b>1</b></div><button className="submission-ticket"><small>MANUSCRIPT-02</small><strong>Formation recognition in elite women’s football</strong><span>Journal of Sports Sciences</span><i><b style={{ width: "54%" }} /></i><em>Methods · internal review</em></button></article>
          <article className="pipeline-column card"><div><span>INTERNAL REVIEW</span><b>1</b></div><button className="submission-ticket warning"><small>MANUSCRIPT-01</small><strong>Pace of play across match contexts</strong><span>Sports Biomechanics</span><p><b>2</b> major concerns remain</p><em>Review due · 18 Aug</em></button></article>
          <article className="pipeline-column card"><div><span>SUBMITTED</span><b>1</b></div><button className="submission-ticket blue"><small>CONF-004</small><strong>Tracking-derived tactical compactness</strong><span>World Congress of Performance Analysis</span><p>Waiting for decision</p><em>Submitted · 29 Jul</em></button></article>
          <article className="pipeline-column card"><div><span>REVISION</span><b>0</b></div><div className="empty-pipeline"><span>◇</span><p>No active revisions</p></div></article>
        </section>
        <section className="submission-deadline card"><span className="deadline-date"><strong>04</strong><small>SEP</small></span><div><span className="label">NEXT DEADLINE</span><strong>MANUSCRIPT-01 · Internal circulation</strong><small>24 days · argument check, statistical review and figure audit required</small></div><div className="deadline-gates"><span className="done">✓ Argument</span><span>○ Statistics</span><span>○ Figures</span></div><button onClick={() => runAction(quickActions[3])}>Prepare review →</button></section>
      </>}

      {activeTab === "mentor" && <section className="mentor-grid">
        <article className="mentor-brief card"><div className="section-heading"><div><span className="label">NEXT SUPERVISION · 14 AUG</span><p>导师会议简报</p></div><span className="status-pill lime"><i /> 80% ready</span></div><h2>用证据请求决策，而不是汇报所有进展。</h2><div className="brief-sections"><div><span>01</span><p><strong>本周核心进展</strong>EXP-024 已完成模型选择，需要确认报告稳定性结果的最低标准。</p></div><div><span>02</span><p><strong>需要导师决策</strong>跨比赛验证是否作为主分析，还是放入 supplementary material。</p></div><div><span>03</span><p><strong>已准备证据</strong>Figure 3、稳定性诊断、5 篇直接相关文献。</p></div></div><button className="primary-button" onClick={() => runAction({ label: "Prepare supervisor briefing", meta: "Meeting", tone: "violet", command: "@supervisor-brief" })}>AI 生成一页简报 <b>✦</b></button></article>
        <article className="mentor-commitments card"><div className="section-heading"><div><span className="label">COMMITMENT TRACKER</span><p>导师承诺与待反馈</p></div><span className="count-badge">2</span></div><div className="commitment-list"><div><span className="commit-status overdue">!</span><span><strong>反馈 Methods 初稿</strong><small>导师 · 原计划 8 Aug</small><em>已逾期 3 天</em></span><button>跟进</button></div><div><span className="commit-status waiting">…</span><span><strong>确认目标期刊</strong><small>共同决定 · 核对 14 Aug</small><em>等待讨论</em></span><button>准备</button></div><div><span className="commit-status done">✓</span><span><strong>同意排除短于 8s 的阶段</strong><small>Meeting · 31 Jul</small><em>已保存为 DEC-041</em></span><button>查看</button></div></div></article>
        <article className="decision-recall card"><span className="label">DECISION MEMORY</span><blockquote>“先把跨比赛验证做出来，再决定是主结果还是补充材料。”</blockquote><p>记录于 31 Jul 组会 · 关联 EXP-026 · 下次核对 14 Aug</p><button>转换为研究决策 →</button></article>
      </section>}

      {activeTab === "review" && <section className="reflection-grid">
        <article className="daily-reflection card"><div className="section-heading"><div><span className="label">STRUCTURED DAILY REVIEW</span><p>PhD 学术复盘</p></div><span className="updated">自动汇总 7 个来源</span></div><div className="reflection-summary"><span><strong>2</strong><small>完成任务</small></span><span><strong>47m</strong><small>深度工作</small></span><span><strong>1</strong><small>新研究决策</small></span><span><strong>3↓</strong><small>Research debt</small></span></div><label><span>今日核心成果、未竟分析与明日优先</span><textarea value={reflection} onChange={(event) => { setReflection(event.target.value); setReviewSaved(false); }} /></label><div className="reflection-actions"><button className="quiet-button" onClick={() => runAction({ label: "Synthesize daily research log", meta: "Reflection", tone: "mint", command: "@daily-review" })}>AI 整理复盘</button><button className="primary-button" onClick={() => setReviewSaved(true)}>{reviewSaved ? "已保存到 Obsidian ✓" : "保存科研复盘"}</button></div></article>
        <article className="research-week card"><div className="section-heading"><div><span className="label">THIS WEEK</span><p>科研投入分布</p></div></div><div className="week-bars"><div><span>分析</span><i><b style={{ width: "82%" }} /></i><strong>6.4h</strong></div><div><span>写作</span><i><b style={{ width: "61%" }} /></i><strong>4.8h</strong></div><div><span>阅读</span><i><b style={{ width: "39%" }} /></i><strong>3.1h</strong></div><div><span>沟通</span><i><b style={{ width: "17%" }} /></i><strong>1.3h</strong></div></div><div className="week-insight"><span>◇</span><p><strong>节奏提醒</strong>本周分析投入高于计划，但 Results 写作尚未同步跟进。</p></div></article>
        <article className="tomorrow-plan card"><span className="label">TOMORROW / RECOMMENDED</span><h3>验证结果后，立即把科学事实写入 Results。</h3><p>这一步可以避免解释与统计事实逐渐分离。</p><button onClick={() => runAction({ label: "Plan tomorrow", meta: "Planning", tone: "blue", command: "@plan-tomorrow" })}>加入明日 Must →</button></article>
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
  const [projectMenu, setProjectMenu] = useState(false);
  const [activeProject, setActiveProject] = useState("Formation Recognition");
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
  const activeLabel = navItems.find((item) => item.key === activeModule)?.label ?? "今日科研";

  const selectModule = (key: ModuleKey) => {
    setActiveModule(key);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const changeProject = (name: string) => { setActiveProject(name); setProjectMenu(false); setToast(`Context switched to ${name}`); };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><i /><b /></span><span><strong>WORKBUDDY</strong><small>SPORTS RESEARCH OS</small></span><button className="mobile-close" onClick={() => setMobileNav(false)}>×</button></div>
        <div className="project-switcher-wrap">
          <button className="project-switcher" onClick={() => setProjectMenu((value) => !value)}><span className="project-avatar">S2</span><span><small>当前项目</small><strong>{activeProject}</strong></span><b>⌄</b></button>
          {projectMenu && <div className="project-menu">{projects.map((project) => <button key={project.name} onClick={() => changeProject(project.name)}><i style={{ background: project.color }} /><span><strong>{project.name}</strong><small>{project.code}</small></span>{project.name === activeProject && <b>✓</b>}</button>)}</div>}
        </div>
        <nav aria-label="Main navigation"><span className="nav-label">RESEARCH WORKBENCH</span>{navItems.map((item) => <button key={item.key} className={activeModule === item.key ? "active" : ""} onClick={() => selectModule(item.key)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => setCommandOpen(true)}><span className="nav-icon">⌘</span><span>科研命令库</span></button><button onClick={() => setToast("数据源与偏好设置已就绪") }><span className="nav-icon">⚙</span><span>系统设置</span></button><div className="sync-status"><span className="sync-orbit"><i /><b /></span><span><strong>研究系统</strong><small><SourceDot /> 已连接 3 个来源</small></span></div></div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><button className="mobile-menu" onClick={() => setMobileNav(true)}>☰</button><span>科研工作台</span><b>/</b><strong>{activeLabel}</strong></div><button className="command-trigger" onClick={() => setCommandOpen(true)}><span>⌕</span><span>搜索或运行科研工作流…</span><kbd>⌘ K</kbd></button><div className="top-actions"><button className="icon-button" aria-label="Notifications"><span>°</span>♢</button><button className="context-button" onClick={() => setContextOpen(true)}><span className="context-diamond">◇</span><span><small>CONTEXT</small><strong>就绪 · 94%</strong></span></button><button className="profile-button" aria-label="Profile">DR</button></div></header>
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
