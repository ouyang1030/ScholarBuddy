"use client";

export function GuideDrawer({
  onClose,
  openConnections,
  ref,
}: {
  onClose: () => void;
  openConnections: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const modules = [
    [
      "Today",
      "Choose one concrete output, start a focus session, see today’s schedule, write the research log, capture ideas, and respond only to submission alerts that need attention.",
    ],
    [
      "Projects",
      "Manage projects, research questions, experiments, and the full idea inbox together instead of switching between separate modules.",
    ],
    [
      "Manuscripts",
      "Track writing, submission history, reviewer feedback, and research gaps in one manuscript workspace.",
    ],
    [
      "Library",
      "Search Zotero highlights in card or list view, use suggested manuscript sections, and copy passages with APA 7 in-text citations.",
    ],
    [
      "Operations",
      "Track supervision, meetings, submissions, commitments, and administrative deadlines, and read the full research log in its own tab.",
    ],
  ];
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={ref}
        className="action-drawer guide-drawer"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="ScholarBuddy user guide"
      >
        <div className="drawer-head">
          <button onClick={onClose}>×</button>
          <span className="label">USER GUIDE</span>
          <span className="action-mark mint">?</span>
        </div>
        <div className="drawer-title">
          <span>SCHOLARBUDDY / SPORTS RESEARCH OS</span>
          <h2>How to use your workbench</h2>
          <p>A practical guide to the daily workflow, real data sources, editing, and AI tools.</p>
        </div>
        <nav className="guide-jump" aria-label="Guide sections">
          <a href="#guide-start">Start here</a>
          <a href="#guide-daily">Daily routine</a>
          <a href="#guide-modules">Modules</a>
          <a href="#guide-capture">Log &amp; ideas</a>
          <a href="#guide-passages">Passages</a>
          <a href="#guide-milestones">Focus & milestones</a>
          <a href="#guide-ai">AI</a>
          <a href="#guide-storage">Data</a>
          <a href="#guide-help">Help</a>
        </nav>
        <section className="guide-section" id="guide-start">
          <span className="guide-number">01</span>
          <div>
            <h3>Start here</h3>
            <ol className="guide-steps">
              <li>
                <b>Define today’s output.</b>
                <span>Add one concrete result on Today and start focused work immediately.</span>
              </li>
              <li>
                <b>Create the research frame.</b>
                <span>
                  In Projects, add the active project, its questions, and related experiments.
                </span>
              </li>
              <li>
                <b>Add the manuscript.</b>
                <span>
                  Track writing first, then create a separate submission attempt for each journal.
                </span>
              </li>
              <li>
                <b>Connect sources when useful.</b>
                <span>
                  Open Connections → Configure this Mac to add AI keys securely, choose a vault,
                  detect Zotero, and enable Calendar.
                </span>
              </li>
            </ol>
            <button
              className="quiet-button"
              onClick={() => {
                onClose();
                openConnections();
              }}
            >
              Open Connections →
            </button>
          </div>
        </section>
        <section className="guide-section" id="guide-daily">
          <span className="guide-number">02</span>
          <div>
            <h3>A simple daily routine</h3>
            <div className="guide-routine">
              <p>
                <b>1 · Decide</b>
                <span>Choose one visible result worth finishing today.</span>
              </p>
              <p>
                <b>2 · Focus</b>
                <span>Start the linked timer; its waveform moves while the session is active.</span>
              </p>
              <p>
                <b>3 · Pause</b>
                <span>
                  Pause to finish a focus block and save its real start and end time to macOS
                  Calendar.
                </span>
              </p>
              <p>
                <b>4 · Record</b>
                <span>
                  Write one research log entry about what actually changed, and update the current
                  project or paper.
                </span>
              </p>
              <p>
                <b>5 · Capture</b>
                <span>
                  Drop any idea that arrived mid-work into the inbox instead of chasing it now.
                </span>
              </p>
              <p>
                <b>6 · Watch</b>
                <span>Handle a submission alert only when Today says attention is needed.</span>
              </p>
              <p>
                <b>7 · Continue</b>
                <span>Leave the next concrete output ready for tomorrow.</span>
              </p>
            </div>
          </div>
        </section>
        <section className="guide-section" id="guide-modules">
          <span className="guide-number">03</span>
          <div>
            <h3>What each module is for</h3>
            <div className="guide-module-list">
              {modules.map(([name, description]) => (
                <article key={name}>
                  <b>{name}</b>
                  <p>{description}</p>
                </article>
              ))}
            </div>
            <div className="guide-callout">
              <b>Editing rule</b>
              <p>
                Use New to create a record. Open an existing card or row to edit it. Progress is
                manual and remains authoritative until you change it. Delete requires a second
                confirmation.
              </p>
            </div>
          </div>
        </section>
        <section className="guide-section" id="guide-capture">
          <span className="guide-number">04</span>
          <div>
            <h3>Research log and idea inbox</h3>
            <p className="guide-lead">
              Both live on Today, directly under the working panels. They ask for one thing only:
              the text. Everything else — the date, the active project, the current paper — is
              attached for you.
            </p>
            <ol className="guide-steps">
              <li>
                <b>Write the log entry.</b>
                <span>
                  Say what changed: a result, a decision, a dead end. The first line becomes the
                  entry title. Save with the button or <kbd>⌘ ⏎</kbd>.
                </span>
              </li>
              <li>
                <b>Capture an idea in one line.</b>
                <span>
                  Press Enter and it is saved to the inbox. Do not classify it now; that is the
                  point of an inbox.
                </span>
              </li>
              <li>
                <b>Capture from anywhere.</b>
                <span>
                  <kbd>⌘ J</kbd> opens the research log and <kbd>⌘ I</kbd> the idea inbox from any
                  module, returning you to Today with the cursor already in the box.
                </span>
              </li>
              <li>
                <b>Judge ideas later.</b>
                <span>
                  Question promotes an idea to a real research question in one click and keeps a
                  link to it. × drops it. Neither is a deletion: both remain readable in Projects →
                  Ideas.
                </span>
              </li>
              <li>
                <b>Read the history.</b>
                <span>
                  Operations → Research log lists every entry. Open any entry to edit its text,
                  date, or paper link.
                </span>
              </li>
            </ol>
            <div className="guide-callout">
              <b>Why this feeds the AI</b>
              <p>
                The last three days of log entries and the ideas still waiting in the inbox travel
                with the project context into every AI workflow. Plan today’s research therefore
                knows where yesterday stopped instead of planning from a project title alone.
              </p>
            </div>
            <div className="guide-callout">
              <b>Nothing typed is lost</b>
              <p>
                Unsaved text in either box is kept in this browser until it reaches Obsidian. If the
                Bridge is offline the panel says so and keeps your text ready to retry.
              </p>
            </div>
          </div>
        </section>
        <section className="guide-section" id="guide-passages">
          <span className="guide-number">05</span>
          <div>
            <h3>Using Passage Library</h3>
            <ol className="guide-steps">
              <li>
                <b>Highlight in Zotero.</b>
                <span>
                  Keep the original passage and any annotation note in Zotero; ScholarBuddy reads
                  them live without replacing the source.
                </span>
              </li>
              <li>
                <b>Search and filter.</b>
                <span>
                  Search passage text, notes, sources, authors, Zotero tags, or ScholarBuddy
                  keywords. Filter by current paper and usage state.
                </span>
              </li>
              <li>
                <b>Choose a view.</b>
                <span>
                  Cards expose all organization controls. List keeps the passage prominent, places
                  Section below the year, and shows three compact actions.
                </span>
              </li>
              <li>
                <b>Confirm the Section.</b>
                <span>
                  ScholarBuddy first reads Zotero tags and comments, then suggests a section from
                  the text. Uncertain passages remain Unassigned; you can always correct the
                  selection.
                </span>
              </li>
              <li>
                <b>Link and write.</b>
                <span>
                  Link the passage to a paper and section. It then appears in Manuscripts → Develop.
                  Copy Citation produces an APA 7 author–year in-text citation without a page
                  locator.
                </span>
              </li>
            </ol>
            <div className="guide-callout">
              <b>Source of truth</b>
              <p>
                Zotero remains authoritative for passage text, source, authors, year, and page.
                Obsidian stores only the paper link, chosen section, ScholarBuddy keywords, and
                usage state.
              </p>
            </div>
          </div>
        </section>
        <section className="guide-section" id="guide-milestones">
          <span className="guide-number">06</span>
          <div>
            <h3>Focus sessions and research milestones</h3>
            <ol className="guide-steps">
              <li>
                <b>Daily focus total.</b>
                <span>
                  Pause and resume as often as needed; Today keeps one cumulative total for the
                  current day.
                </span>
              </li>
              <li>
                <b>Calendar record.</b>
                <span>
                  Each completed focus block is saved to macOS Calendar when you pause. If Calendar
                  is unavailable, use Retry Calendar after reconnecting the Bridge.
                </span>
              </li>
              <li>
                <b>Six-hour celebration.</b>
                <span>
                  At six cumulative hours, an eight-second fireworks celebration appears once for
                  that day.
                </span>
              </li>
              <li>
                <b>Accepted and Published.</b>
                <span>
                  Set the paper stage in Manuscripts or record the status in Submission Tracker.
                  Each milestone receives its own multilingual celebration once per paper.
                </span>
              </li>
              <li>
                <b>Accessible motion.</b>
                <span>
                  Close a celebration at any time or press Esc. ScholarBuddy follows the device’s
                  Reduce Motion preference.
                </span>
              </li>
            </ol>
            <div className="guide-callout">
              <b>Milestones stay distinct</b>
              <p>
                Accepted means the journal has accepted the paper. Published means the paper is
                available as a publication. Record both stages so the publication journey remains
                accurate.
              </p>
            </div>
          </div>
        </section>
        <section className="guide-section" id="guide-ai">
          <span className="guide-number">07</span>
          <div>
            <h3>Using AI workflows</h3>
            <ol className="guide-steps">
              <li>
                <b>Open the workflow menu.</b>
                <span>
                  Use the top search bar or press <kbd>⌘ K</kbd>.
                </span>
              </li>
              <li>
                <b>Choose a structured task.</b>
                <span>
                  Examples include finding evidence, explaining a result, reviewing a section, and
                  drafting text.
                </span>
              </li>
              <li>
                <b>Select the model.</b>
                <span>
                  Choose DeepSeek, Kimi, ChatGPT, Claude, Grok, or Gemini inside the workflow panel.
                </span>
              </li>
              <li>
                <b>Check sources.</b>
                <span>
                  Keep Zotero and Obsidian enabled when the task needs evidence or project context.
                </span>
              </li>
              <li>
                <b>Review before saving.</b>
                <span>
                  AI output is a draft. Check claims and citations, then save useful results to
                  Obsidian.
                </span>
              </li>
            </ol>
            <div className="guide-callout warning">
              <b>Important</b>
              <p>
                ScholarBuddy reports missing context instead of inventing it. AI output still
                requires your scientific judgment and source verification.
              </p>
            </div>
          </div>
        </section>
        <section className="guide-section" id="guide-storage">
          <span className="guide-number">08</span>
          <div>
            <h3>Where your data lives</h3>
            <div className="guide-data">
              <p>
                <b>Research records</b>
                <span>Readable Markdown files in Obsidian → ScholarBuddy.</span>
              </p>
              <p>
                <b>Research log and ideas</b>
                <span>
                  Saved as readable Markdown records in Obsidian → ScholarBuddy, one file per entry
                  and per idea.
                </span>
              </p>
              <p>
                <b>Tasks, daily focus total, and unsaved capture text</b>
                <span>
                  Stored locally in this browser on this device. Capture drafts are cleared as soon
                  as the entry reaches Obsidian.
                </span>
              </p>
              <p>
                <b>Focus blocks and schedule</b>
                <span>
                  Completed focus blocks and schedule events are written to macOS Calendar through
                  the local Bridge.
                </span>
              </p>
              <p>
                <b>Celebration history</b>
                <span>
                  Stored locally so daily and paper milestones do not replay after a refresh.
                </span>
              </p>
              <p>
                <b>Literature and passages</b>
                <span>
                  Papers, highlights, and notes are read live from Zotero Desktop. Reading
                  selections and passage links, sections, keywords, and usage state are saved as
                  readable Obsidian records.
                </span>
              </p>
              <p>
                <b>Hosted access</b>
                <span>
                  ScholarBuddy is available at scholarbuddy.tech. The link alone grants no access
                  unless the Site is explicitly shared with that visitor or published publicly.
                </span>
              </p>
              <p>
                <b>AI credentials</b>
                <span>
                  Kept by the local bridge on this Mac, never entered into the hosted page.
                </span>
              </p>
            </div>
          </div>
        </section>
        <section className="guide-section" id="guide-help">
          <span className="guide-number">09</span>
          <div>
            <h3>Quick troubleshooting</h3>
            <div className="guide-help">
              <p>
                <b>“Bridge unreachable”</b>
                <span>
                  Open ScholarBuddy in Safari or Chrome on this Mac, allow Local Network access if
                  prompted, then open Connections and use Test again. Embedded browsers may not
                  expose Mac-local services.
                </span>
              </p>
              <p>
                <b>“Pairing required”</b>
                <span>
                  Choose Configure this Mac for guided setup and automatic pairing. Manual
                  five-minute pairing codes remain available as a fallback.
                </span>
              </p>
              <p>
                <b>Calendar sync pending</b>
                <span>
                  Open the local setup page, test Calendar, and approve the macOS permission
                  request.
                </span>
              </p>
              <p>
                <b>No Zotero literature</b>
                <span>
                  Keep Zotero Desktop open, clear overly narrow search terms, or add project
                  keywords.
                </span>
              </p>
              <p>
                <b>Dashboard looks empty</b>
                <span>
                  This is expected until you create real project, manuscript, or research-debt
                  records.
                </span>
              </p>
              <p>
                <b>AI lacks context</b>
                <span>
                  Create an Active project and research question, then add clear descriptions and
                  retrieval keywords. A few research log entries also tell the model where the work
                  actually stopped.
                </span>
              </p>
            </div>
          </div>
        </section>
        <div className="drawer-footer guide-footer">
          <span className="small-note">
            ⌘ K runs an AI workflow · ⌘ J writes the log · ⌘ I captures an idea
          </span>
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
