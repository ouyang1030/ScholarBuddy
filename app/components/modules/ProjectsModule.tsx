"use client";

import { useState } from "react";
import { clampProgress } from "../../lib/format";
import type { DataProps } from "../../lib/workbench";
import type { CollectionKey } from "../../types";
import { EmptyState, MetaPill } from "../primitives";
import { RecordModule } from "./RecordModule";

export function ProjectPortfolio({ state, openEditor }: Pick<DataProps, "state" | "openEditor">) {
  const projects = state.projects;
  return (
    <>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">PROJECT PORTFOLIO</p>
          <h1>
            Research <em>projects.</em>
          </h1>
          <p>Questions, experiments, and papers stay inside the project that gives them meaning.</p>
        </div>
        <button className="primary-button" onClick={() => openEditor("projects")}>
          New Project <b>+</b>
        </button>
      </section>
      {!projects.length ? (
        <section className="record-board">
          <EmptyState title="No project yet" />
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
                label: "Questions",
                items: questions,
                collection: "research-questions" as CollectionKey,
                empty: "No questions",
                defaults: { linkedProject: project.id },
              },
              {
                key: "experiments",
                label: "Experiments",
                items: experiments,
                collection: "experiments" as CollectionKey,
                empty: "No experiments",
                defaults: { linkedProject: project.id },
              },
              {
                key: "papers",
                label: "Papers",
                items: papers,
                collection: "manuscripts" as CollectionKey,
                empty: "No papers",
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
                        {project.active ? "Active" : project.status || "Planned"}
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
                      Edit project
                    </button>
                  </span>
                </header>
                <div className="project-flow-meta">
                  {project.phase && (
                    <span>
                      Phase <b>{project.phase}</b>
                    </span>
                  )}
                  <span>
                    Progress <b>{clampProgress(project.progress)}%</b>
                  </span>
                  <span>
                    Outputs <b>{questions.length + experiments.length + papers.length}</b>
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
                          aria-label={`Add ${group.label.slice(0, -1).toLowerCase()} to ${project.title}`}
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
                                  ? item.stage || item.status || "Concept"
                                  : item.status || "Active"}
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
  const [tab, setTab] = useState<"projects" | "research-questions" | "experiments" | "ideas">(
    "projects",
  );
  const configs = {
    "research-questions": {
      title: (
        <>
          Research <em>questions.</em>
        </>
      ),
      eyebrow: "QUESTION MAP",
      description: "Keep questions connected to the project that gives them meaning.",
    },
    experiments: {
      title: (
        <>
          Data & <em>experiments.</em>
        </>
      ),
      eyebrow: "EXPERIMENT REGISTER",
      description: "Track methods, reproducible runs, outcomes, and blockers.",
    },
    ideas: {
      title: (
        <>
          Idea <em>inbox.</em>
        </>
      ),
      eyebrow: "CAPTURED IDEAS",
      description:
        "Everything captured on Today, including the ideas already promoted to a question or dropped.",
    },
  };
  return (
    <>
      <div className="module-tabs">
        <button className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>
          Projects
        </button>
        <button
          className={tab === "experiments" ? "active" : ""}
          onClick={() => setTab("experiments")}
        >
          Experiments
        </button>
        <button
          className={tab === "research-questions" ? "active" : ""}
          onClick={() => setTab("research-questions")}
        >
          Questions
        </button>
        <button className={tab === "ideas" ? "active" : ""} onClick={() => setTab("ideas")}>
          Ideas
        </button>
      </div>
      {tab === "projects" ? (
        <ProjectPortfolio state={state} openEditor={openEditor} />
      ) : (
        <RecordModule
          collection={tab}
          title={configs[tab].title}
          eyebrow={configs[tab].eyebrow}
          description={configs[tab].description}
          state={state}
          openEditor={openEditor}
          showProgress={tab !== "ideas"}
        />
      )}
    </>
  );
}
