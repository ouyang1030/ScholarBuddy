"use client";

import type { RecordItem, WorkbenchState } from "../../types";
import { zoteroPassageUrl } from "../../../shared/zotero.mjs";
import { EmptyState } from "../primitives";

export function LinkedPassages({ paper, state }: { paper: RecordItem; state: WorkbenchState }) {
  const records = state.passages.filter((item) => item.manuscriptId === paper.id);
  return (
    <section className="linked-passages card">
      <div className="section-heading">
        <div>
          <span className="label">LINKED PASSAGES</span>
        </div>
        <b>{records.length}</b>
      </div>
      {!records.length ? (
        <EmptyState
          title="No linked passages"
          detail="Open Library → Passage Library to connect Zotero highlights to this paper."
        />
      ) : (
        <div>
          {records.map((item) => (
            <article key={item.id}>
              <span style={{ background: item.status === "Used" ? "#aee65b" : "#d8e7cf" }} />
              <blockquote>{item.quote || item.comment}</blockquote>
              <p>
                {[
                  item.sourceTitle,
                  item.year,
                  item.pageLabel && `p. ${item.pageLabel}`,
                  item.manuscriptSection,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <button
                onClick={() => {
                  const url = zoteroPassageUrl(item);
                  if (url) window.location.href = url;
                }}
              >
                Open
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
