"use client";

import { useT } from "../../i18n";
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
  const t = useT();
  return (
    <article className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="eyebrow">{t.landing.eyebrow}</span>
          <h1>{t.landing.title}</h1>
          <p>{t.landing.lead}</p>
          <div className="landing-actions">
            <button className="quiet-button" onClick={enterWorkbench}>
              {t.landing.enter}
            </button>
            <button className="quiet-button" onClick={openConnections}>
              {t.landing.connections}
            </button>
            <button className="primary-button" onClick={openGuide}>
              {t.landing.guide} <b>→</b>
            </button>
          </div>
        </div>
        <div className="landing-demo card" aria-label={t.landing.demoAria}>
          <header>
            <span>{t.landing.demo}</span>
            <b>{t.landing.today}</b>
          </header>
          <section>
            <span>{t.landing.nextOutput}</span>
            <h2>{t.landing.demoTask}</h2>
            <p>{t.landing.demoMeta}</p>
            <i>
              <em />
            </i>
          </section>
          <div>
            <span>
              <i /> {t.landing.demoMeeting}
            </span>
            <span>
              <i /> {t.landing.demoReview}
            </span>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-scenarios">
        <span className="eyebrow">{t.landing.surfaces}</span>
        <h2 id="landing-scenarios">{t.landing.surfacesTitle}</h2>
        <div className="landing-scenarios">
          <button onClick={() => openModule("dashboard")}>
            <span>01</span>
            <strong>{t.landing.arrange}</strong>
            <p>{t.landing.arrangeText}</p>
            <b>{t.landing.openToday}</b>
          </button>
          <button onClick={() => openModule("manuscript")}>
            <span>02</span>
            <strong>{t.landing.advance}</strong>
            <p>{t.landing.advanceText}</p>
            <b>{t.landing.openManuscripts}</b>
          </button>
          <button onClick={() => openModule("operations")}>
            <span>03</span>
            <strong>{t.landing.deadlines}</strong>
            <p>{t.landing.deadlinesText}</p>
            <b>{t.landing.openOperations}</b>
          </button>
        </div>
      </section>

      <section className="landing-process card" aria-labelledby="landing-process">
        <div>
          <span className="eyebrow">{t.landing.loop}</span>
          <h2 id="landing-process">{t.landing.loopTitle}</h2>
        </div>
        <ol>
          <li>
            <span>1</span>
            <strong>{t.landing.choose}</strong>
            <small>{t.landing.chooseText}</small>
          </li>
          <li>
            <span>2</span>
            <strong>{t.landing.context}</strong>
            <small>{t.landing.contextText}</small>
          </li>
          <li>
            <span>3</span>
            <strong>{t.landing.record}</strong>
            <small>{t.landing.recordText}</small>
          </li>
        </ol>
      </section>

      <section className="landing-section" aria-labelledby="landing-connections">
        <span className="eyebrow">{t.landing.systems}</span>
        <h2 id="landing-connections">{t.landing.systemsTitle}</h2>
        <div className="landing-integrations">
          <article>
            <BrandLogo brand="obsidian" />
            <strong>Obsidian</strong>
            <p>{t.landing.obsidian}</p>
          </article>
          <article>
            <BrandLogo brand="zotero" />
            <strong>Zotero</strong>
            <p>{t.landing.zotero}</p>
          </article>
          <article>
            <BrandLogo brand="calendar" />
            <strong>{t.landing.calendar}</strong>
            <p>{t.landing.calendarText}</p>
          </article>
        </div>
      </section>

      <section className="landing-faq card" aria-labelledby="landing-faq">
        <div>
          <span className="eyebrow">{t.landing.start}</span>
          <h2 id="landing-faq">{t.landing.faqTitle}</h2>
        </div>
        <div>
          <details>
            <summary>{t.landing.q1}</summary>
            <p>{t.landing.a1}</p>
          </details>
          <details>
            <summary>{t.landing.q2}</summary>
            <p>{t.landing.a2}</p>
          </details>
          <details>
            <summary>{t.landing.q3}</summary>
            <p>{t.landing.a3}</p>
          </details>
        </div>
      </section>
    </article>
  );
}
