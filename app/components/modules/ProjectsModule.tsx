"use client";

import { useState } from "react";
import { useT, valueLabel } from "../../i18n";
import { clampProgress } from "../../lib/format";
import type { DataProps } from "../../lib/workbench";
import type { CollectionKey } from "../../types";
import { EmptyState, MetaPill } from "../primitives";
import { RecordModule } from "./RecordModule";

export function ProjectPortfolio({ state, openEditor }: Pick<DataProps, "state" | "openEditor">) {
  const t = useT();
  const projects = state.projects;
  return (
    <>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">{t.projects.eyebrow}</p>
          <h1>
            {t.projects.titleLead}
            <em>{t.projects.titleEm}</em>
          </h1>
        </div>
        <button className="primary-button" onClick={() => openEditor("projects")}>
          {t.projects.new} <b>+</b>
        </button>
      </section>
      {!projects.length ? (
        <section className="record-board">
          <EmptyState title={t.projects.none} />
        </section>
      ) : (
        <section className="project-flow-board">
          {projects.map((project) => {
            const questions = state["research-questions"].filter(
              (item) =>
                item.linkedProject === project.id ||
                item.projectId === project.id ||
                item.projectTitle === project.title,
            );
            const experiments = state.experiments.filter(
              (item) =>
                item.linkedProject === project.id ||
                item.projectId === project.id ||
                item.projectTitle === project.title,
            );
            const papers = state.manuscripts.filter(
              (item) => item.projectId === project.id || item.projectTitle === project.title,
            );
            const flow = [
              {
                key: "questions",
                label: t.projects.questions,
                items: questions,
                collection: "research-questions" as CollectionKey,
                empty: t.projects.noQuestions,
                defaults: { linkedProject: project.id },
              },
              {
                key: "experiments",
                label: t.projects.experiments,
                items: experiments,
                collection: "experiments" as CollectionKey,
                empty: t.projects.noExperiments,
                defaults: { linkedProject: project.id },
              },
              {
                key: "papers",
                label: t.projects.papers,
                items: papers,
                collection: "manuscripts" as CollectionKey,
                empty: t.projects.noPapers,
                defaults: { projectId: project.id, projectTitle: project.title, stage: "Concept" },
              },
            ];
            return (
              <article className="project-flow-card card" key={project.id}>
                <header>
                  <div>
                    <span className="project-flow-id">
                      <span className="object-id">{project.id}</span>
                      <MetaPill tone={project.active ? "lime" : "blue"}>
                        {project.active
                          ? t.projects.active
                          : valueLabel(t.values.status, project.status || "Planned")}
                      </MetaPill>
                    </span>
                    <h2>{project.title}</h2>
                    {project.description && <p>{project.description}</p>}
                  </div>
                  <span>
                    <button
                      className="quiet-button"
                      onClick={() => openEditor("projects", project)}
                    >
                      {t.projects.edit}
                    </button>
                  </span>
                </header>
                <div className="project-flow-meta">
                  {project.phase && (
                    <span>
                      {t.projects.phase} <b>{project.phase}</b>
                    </span>
                  )}
                  <span>
                    {t.projects.progress} <b>{clampProgress(project.progress)}%</b>
                  </span>
                  <span>
                    {t.projects.outputs}{" "}
                    <b>{questions.length + experiments.length + papers.length}</b>
                  </span>
                </div>
                <div className="project-flow-columns">
                  {flow.map((group, index) => (
                    <section key={group.key}>
                      <div className="project-flow-heading">
                        <span>
                          <small>0{index + 1}</small>
                          <strong>{group.label}</strong>
                          <b>{group.items.length}</b>
                        </span>
                        <button
                          aria-label={t.projects.addTo(
                            t.collections[group.collection],
                            project.title,
                          )}
                          onClick={() => openEditor(group.collection, group.defaults)}
                        >
                          ＋
                        </button>
                      </div>
                      {!group.items.length ? (
                        <p className="project-flow-empty">{group.empty}</p>
                      ) : (
                        <div className="project-flow-items">
                          {group.items.slice(0, 4).map((item) => (
                            <button
                              key={item.id}
                              onClick={() => openEditor(group.collection, item)}
                            >
                              <span>{item.title}</span>
                              <small>
                                {group.key === "papers"
                                  ? valueLabel(
                                      t.values.stage,
                                      item.stage || item.status || "Concept",
                                    )
                                  : valueLabel(t.values.status, item.status || "Active")}
                              </small>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

export function ProjectsModule({ state, openEditor }: Pick<DataProps, "state" | "openEditor">) {
  const t = useT();
  const [tab, setTab] = useState<"projects" | "research-questions" | "experiments" | "ideas">(
    "projects",
  );
  const configs = {
    "research-questions": {
      title: (
        <>
          {t.projects.questionsLead}
          <em>{t.projects.questionsEm}</em>
        </>
      ),
      eyebrow: t.projects.questionMap,
    },
    experiments: {
      title: (
        <>
          {t.projects.experimentsLead}
          <em>{t.projects.experimentsEm}</em>
        </>
      ),
      eyebrow: t.projects.experimentRegister,
    },
    ideas: {
      title: (
        <>
          {t.projects.ideasLead}
          <em>{t.projects.ideasEm}</em>
        </>
      ),
      eyebrow: t.projects.capturedIdeas,
    },
  };
  return (
    <>
      <div className="module-tabs">
        <button className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>
          {t.nav.projects}
        </button>
        <button
          className={tab === "experiments" ? "active" : ""}
          onClick={() => setTab("experiments")}
        >
          {t.projects.experiments}
        </button>
        <button
          className={tab === "research-questions" ? "active" : ""}
          onClick={() => setTab("research-questions")}
        >
          {t.projects.questions}
        </button>
        <button className={tab === "ideas" ? "active" : ""} onClick={() => setTab("ideas")}>
          {t.projects.ideas}
        </button>
      </div>
      {tab === "projects" ? (
        <ProjectPortfolio state={state} openEditor={openEditor} />
      ) : (
        <RecordModule
          collection={tab}
          title={configs[tab].title}
          eyebrow={configs[tab].eyebrow}
          state={state}
          openEditor={openEditor}
          showProgress={tab !== "ideas"}
        />
      )}
    </>
  );
}
