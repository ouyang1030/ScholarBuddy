"use client";

import { BrandLogo } from "../BrandLogo";

export function LandingModule({
  enterWorkbench,
  openModule,
  openConnections,
  openGuide,
}: {
  enterWorkbench: () => void;
  openModule: (module: "dashboard" | "manuscript" | "operations") => void;
  openConnections: () => void;
  openGuide: () => void;
}) {
  return (
    <article className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="eyebrow">SCHOLARBUDDY · SPORTS RESEARCH OS</span>
          <h1>Keep today’s work connected to the paper it moves forward.</h1>
          <p>
            Plan the next concrete output, work with your research context, and keep deadlines,
            evidence, and decisions in one local-first workspace.
          </p>
          <div className="landing-actions">
            <button className="primary-button" onClick={enterWorkbench}>
              Enter workbench <b>→</b>
            </button>
            <button className="quiet-button" onClick={openConnections}>
              Review connections
            </button>
            <button className="quiet-button" onClick={openGuide}>
              User Guide
            </button>
          </div>
        </div>
        <div className="landing-demo card" aria-label="Demonstration of the Today workspace">
          <header>
            <span>DEMO WORKSPACE</span>
            <b>Today</b>
          </header>
          <section>
            <span>NEXT OUTPUT</span>
            <h2>Revise the discussion around match-load uncertainty</h2>
            <p>50-minute focus block · linked to Paper 02</p>
            <i>
              <em />
            </i>
          </section>
          <div>
            <span>
              <i /> 09:30 Supervisor meeting
            </span>
            <span>
              <i /> 14:00 Analysis review
            </span>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-scenarios">
        <span className="eyebrow">THREE WORKING SURFACES</span>
        <h2 id="landing-scenarios">Move from intention to a recorded result.</h2>
        <div className="landing-scenarios">
          <button onClick={() => openModule("dashboard")}>
            <span>01</span>
            <strong>Arrange today</strong>
            <p>Put the next output beside real calendar commitments and start a focus block.</p>
            <b>Open Today →</b>
          </button>
          <button onClick={() => openModule("manuscript")}>
            <span>02</span>
            <strong>Advance a paper</strong>
            <p>Keep evidence, reviewer feedback, revisions, and submission history together.</p>
            <b>Open Manuscripts →</b>
          </button>
          <button onClick={() => openModule("operations")}>
            <span>03</span>
            <strong>See deadline pressure</strong>
            <p>Scan PhD commitments by due date, remaining time, and current status.</p>
            <b>Open Operations →</b>
          </button>
        </div>
      </section>

      <section className="landing-process card" aria-labelledby="landing-process">
        <div>
          <span className="eyebrow">ONE RESEARCH LOOP</span>
          <h2 id="landing-process">A clear handoff for your future self.</h2>
        </div>
        <ol>
          <li>
            <span>1</span>
            <strong>Choose one output</strong>
            <small>Concrete enough to finish.</small>
          </li>
          <li>
            <span>2</span>
            <strong>Work in context</strong>
            <small>Paper, evidence, and calendar stay visible.</small>
          </li>
          <li>
            <span>3</span>
            <strong>Record what changed</strong>
            <small>Save the decision, result, or next step.</small>
          </li>
        </ol>
      </section>

      <section className="landing-section" aria-labelledby="landing-connections">
        <span className="eyebrow">LOCAL RESEARCH SYSTEMS</span>
        <h2 id="landing-connections">Your tools remain the sources of truth.</h2>
        <div className="landing-integrations">
          <article>
            <BrandLogo brand="obsidian" />
            <strong>Obsidian</strong>
            <p>Readable project, paper, deadline, and research-log records.</p>
          </article>
          <article>
            <BrandLogo brand="zotero" />
            <strong>Zotero</strong>
            <p>Live literature search, saved readings, and citable highlighted passages.</p>
          </article>
          <article>
            <BrandLogo brand="calendar" />
            <strong>Calendar</strong>
            <p>Today’s commitments and optional local reminders without copying event notes.</p>
          </article>
        </div>
      </section>

      <section className="landing-faq card" aria-labelledby="landing-faq">
        <div>
          <span className="eyebrow">START USING IT</span>
          <h2 id="landing-faq">What to know first.</h2>
        </div>
        <div>
          <details>
            <summary>Where is research data saved?</summary>
            <p>
              ScholarBuddy keeps its research records as readable Markdown in your configured
              Obsidian vault. Daily focus preferences remain on this device.
            </p>
          </details>
          <details>
            <summary>Do connections leave this Mac?</summary>
            <p>
              The local Bridge connects the workbench to Obsidian, Zotero, Calendar, and your
              configured AI providers. Pairing controls which browser may use it.
            </p>
          </details>
          <details>
            <summary>Are reminders required?</summary>
            <p>
              No. Calendar and PhD deadline reminders are optional and off by default. Each category
              can be controlled separately.
            </p>
          </details>
        </div>
      </section>
    </article>
  );
}
