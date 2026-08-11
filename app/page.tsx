"use client";

import { useEffect, useMemo, useState } from "react";

type ModuleKey =
  | "dashboard"
  | "research"
  | "data"
  | "manuscript"
  | "workspace"
  | "review"
  | "projects";

type Action = {
  label: string;
  meta: string;
  tone: string;
  command: string;
};

const navItems: { key: ModuleKey; label: string; icon: string; badge?: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "⌂" },
  { key: "research", label: "Research", icon: "⌁", badge: "8" },
  { key: "data", label: "Data & Experiments", icon: "∿", badge: "3" },
  { key: "manuscript", label: "Manuscript", icon: "¶" },
  { key: "workspace", label: "AI Workspace", icon: "✦" },
  { key: "review", label: "Review", icon: "✓", badge: "4" },
  { key: "projects", label: "Projects", icon: "▦" },
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

function Dashboard({ runAction, openContext }: { runAction: (a: Action) => void; openContext: () => void }) {
  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">Tuesday · Research cycle 08</p>
          <h1>Your research, <em>in focus.</em></h1>
          <p>One study is active. Two outputs need verification before they can move into the manuscript.</p>
        </div>
        <div className="intro-stat">
          <span className="live-pulse" />
          <div><strong>All systems ready</strong><small>Obsidian · Zotero · GitHub</small></div>
        </div>
      </section>

      <section className="hero-grid">
        <article className="current-study card">
          <div className="study-copy">
            <div className="card-topline">
              <span className="label">Current study</span>
              <span className="status-pill lime"><i /> Analysis</span>
            </div>
            <span className="object-id">STUDY-02 / WOMEN’S FOOTBALL</span>
            <h2>Formation recognition from tracking data</h2>
            <p className="study-description">Validating a representation-learning approach for identifying dynamic team formations during open play.</p>
            <div className="rq-callout">
              <span>ACTIVE RESEARCH QUESTION</span>
              <p>How reliably can team formations be recognized across possession phases and match contexts?</p>
            </div>
            <div className="study-actions">
              <button className="primary-button" onClick={() => runAction({ label: "Continue EXP-024", meta: "Analysis", tone: "mint", command: "@continue-experiment" })}>Continue EXP-024 <b>→</b></button>
              <button className="quiet-button" onClick={openContext}>View assembled context</button>
            </div>
          </div>
          <PitchMap />
        </article>

        <article className="attention-card card">
          <div className="card-topline">
            <span className="label">Requires attention</span>
            <span className="count-badge">4</span>
          </div>
          <div className="attention-list">
            <button onClick={() => runAction({ label: "Verify GMM result", meta: "Statistics", tone: "orange", command: "@stat-check" })}>
              <span className="attention-icon amber">!</span>
              <span><strong>Result awaiting verification</strong><small>EXP-024 · GMM model selection</small></span><b>↗</b>
            </button>
            <button onClick={() => runAction({ label: "Resolve evidence gap", meta: "Zotero", tone: "blue", command: "@evidence-for-claim" })}>
              <span className="attention-icon blue">⌕</span>
              <span><strong>Claim needs direct evidence</strong><small>Introduction · paragraph 6</small></span><b>↗</b>
            </button>
            <button onClick={() => runAction({ label: "Review methodological note", meta: "Methods", tone: "violet", command: "@reviewer-critique" })}>
              <span className="attention-icon violet">?</span>
              <span><strong>Method concern unresolved</strong><small>Phase segmentation threshold</small></span><b>↗</b>
            </button>
          </div>
          <button className="text-button">View review queue <span>→</span></button>
        </article>
      </section>

      <section className="progress-card card">
        <div className="section-heading">
          <div><span className="label">Research progress</span><p>Study 02 · Formation Recognition</p></div>
          <span className="updated">Updated 18 min ago</span>
        </div>
        <div className="progress-grid">
          {progress.map((item) => (
            <div className="progress-item" key={item.label}>
              <div><span>{item.label}</span><strong>{item.value}%</strong></div>
              <div className="progress-track"><i style={{ width: `${Math.max(item.value, 2)}%` }} /></div>
              <small>{item.note}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-lower">
        <article className="quick-actions card">
          <div className="section-heading"><div><span className="label">Research actions</span><p>Start with a structured workflow</p></div><span className="key-hint">⌘ K</span></div>
          <div className="action-grid">
            {quickActions.map((action) => (
              <button key={action.command} onClick={() => runAction(action)}>
                <span className={`action-mark ${action.tone}`}>{action.command.includes("knowledge") ? "⌁" : action.command.includes("evidence") ? "⌕" : action.command.includes("result") ? "∿" : "✓"}</span>
                <span><strong>{action.label}</strong><small>{action.meta}</small></span>
                <b>↗</b>
              </button>
            ))}
          </div>
        </article>

        <article className="activity-card card">
          <div className="section-heading"><div><span className="label">Recent research outputs</span><p>Traceable work from the last 7 days</p></div></div>
          <div className="timeline">
            <div><i className="violet" /><span><small>STATISTICAL RESULT · EXP-023</small><strong>Three-cluster solution retained after stability analysis</strong><em>Verified · 2h</em></span></div>
            <div><i className="mint" /><span><small>RESEARCH DECISION · DEC-041</small><strong>Possession phases shorter than 8s excluded</strong><em>Saved to Obsidian · Yesterday</em></span></div>
            <div><i className="blue" /><span><small>LITERATURE GAP · RQ-02</small><strong>Cross-competition validation remains limited</strong><em>5 papers linked · Monday</em></span></div>
          </div>
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
  const activeLabel = navItems.find((item) => item.key === activeModule)?.label ?? "Dashboard";

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
          <button className="project-switcher" onClick={() => setProjectMenu((value) => !value)}><span className="project-avatar">S2</span><span><small>ACTIVE PROJECT</small><strong>{activeProject}</strong></span><b>⌄</b></button>
          {projectMenu && <div className="project-menu">{projects.map((project) => <button key={project.name} onClick={() => changeProject(project.name)}><i style={{ background: project.color }} /><span><strong>{project.name}</strong><small>{project.code}</small></span>{project.name === activeProject && <b>✓</b>}</button>)}</div>}
        </div>
        <nav aria-label="Main navigation"><span className="nav-label">WORKBENCH</span>{navItems.map((item) => <button key={item.key} className={activeModule === item.key ? "active" : ""} onClick={() => selectModule(item.key)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => setCommandOpen(true)}><span className="nav-icon">⌘</span><span>Command library</span></button><button onClick={() => setToast("Settings are ready for connection setup") }><span className="nav-icon">⚙</span><span>Settings</span></button><div className="sync-status"><span className="sync-orbit"><i /><b /></span><span><strong>Research systems</strong><small><SourceDot /> 3 sources connected</small></span></div></div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><button className="mobile-menu" onClick={() => setMobileNav(true)}>☰</button><span>Workbench</span><b>/</b><strong>{activeLabel}</strong></div><button className="command-trigger" onClick={() => setCommandOpen(true)}><span>⌕</span><span>Search or run a research action…</span><kbd>⌘ K</kbd></button><div className="top-actions"><button className="icon-button" aria-label="Notifications"><span>°</span>♢</button><button className="context-button" onClick={() => setContextOpen(true)}><span className="context-diamond">◇</span><span><small>CONTEXT</small><strong>Ready · 94%</strong></span></button><button className="profile-button" aria-label="Profile">DR</button></div></header>
        <main className="content">
          {activeModule === "dashboard" && <Dashboard runAction={setAction} openContext={() => setContextOpen(true)} />}
          {activeModule === "research" && <Research runAction={setAction} />}
          {activeModule === "data" && <DataExperiments runAction={setAction} />}
          {activeModule === "manuscript" && <Manuscript runAction={setAction} />}
          {activeModule === "workspace" && <Workspace runAction={setAction} />}
          {activeModule === "review" && <Review runAction={setAction} />}
          {activeModule === "projects" && <Projects changeProject={changeProject} />}
        </main>
      </div>

      {action && <ActionDrawer action={action} onClose={() => setAction(null)} />}
      {contextOpen && <ContextDrawer onClose={() => setContextOpen(false)} />}
      {commandOpen && <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}><div className="command-palette" onMouseDown={(e) => e.stopPropagation()}><div className="command-search"><span>⌕</span><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search research actions…" /><kbd>ESC</kbd></div><div className="command-results"><span className="label">Suggested workflows</span>{filteredCommands.length ? filteredCommands.map((item) => <button key={item.command} onClick={() => { setCommandOpen(false); setAction(item); setCommandQuery(""); }}><span className={`action-mark ${item.tone}`}>✦</span><span><strong>{item.label}</strong><small>{item.command}</small></span><b>{item.meta}</b></button>) : <p className="empty-command">No workflow matches “{commandQuery}”.</p>}</div><div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span>Context-aware search</span></div></div></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}
