"use client";

import { useLocale } from "../../i18n";
import { GUIDES } from "../../i18n/guide";
import { closeWithTransition, DrawerHeader } from "../primitives";

export function GuideDrawer({
  onClose,
  openConnections,
  ref,
}: {
  onClose: () => void;
  openConnections: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const guide = GUIDES[useLocale().locale];
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => closeWithTransition(onClose, event.currentTarget)}
    >
      <aside
        ref={ref}
        className="action-drawer guide-drawer"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        aria-label={guide.label}
      >
        <DrawerHeader
          label={guide.label}
          mark="?"
          eyebrow={guide.eyebrow}
          title={guide.title}
          onClose={onClose}
        />
        <nav className="guide-jump" aria-label={guide.jump}>
          {guide.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.nav}
            </a>
          ))}
        </nav>
        {guide.sections.map((section, index) => (
          <section className="guide-section" id={section.id} key={section.id}>
            <span className="guide-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{section.title}</h3>
              {section.layout === "steps" ? (
                <ol className="guide-steps">
                  {section.items.map(([title, detail]) => (
                    <li key={title}>
                      <b>{title}</b>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ol>
              ) : section.layout === "modules" ? (
                <div className="guide-module-list">
                  {section.items.map(([title, detail]) => (
                    <article key={title}>
                      <b>{title}</b>
                      <p>{detail}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={`guide-${section.layout}`}>
                  {section.items.map(([title, detail]) => (
                    <p key={title}>
                      <b>{title}</b>
                      <span>{detail}</span>
                    </p>
                  ))}
                </div>
              )}
              {section.callouts?.map((callout) => (
                <div
                  className={`guide-callout ${callout.warning ? "warning" : ""}`}
                  key={callout.title}
                >
                  <b>{callout.title}</b>
                  <p>{callout.text}</p>
                </div>
              ))}
              {section.openConnections && (
                <button
                  className="quiet-button"
                  onClick={() => {
                    onClose();
                    openConnections();
                  }}
                >
                  {guide.openConnections}
                </button>
              )}
            </div>
          </section>
        ))}
        <div className="drawer-footer guide-footer">
          <span className="small-note">{guide.footer}</span>
          <button className="primary-button" onClick={onClose}>
            {guide.done}
          </button>
        </div>
      </aside>
    </div>
  );
}
