"use client";

export function CelebrationSky({ grand = false }: { grand?: boolean }) {
  const colors = ["#f7d45c", "#ff6b78", "#6ee7ff", "#b7ed62", "#b98cff", "#ff9f43"];
  const bursts = [
    { x: "12%", y: "24%", delay: "0s", distance: "118px" },
    { x: "31%", y: "15%", delay: ".55s", distance: "145px" },
    { x: "52%", y: "28%", delay: "1.05s", distance: "132px" },
    { x: "72%", y: "13%", delay: ".25s", distance: "154px" },
    { x: "89%", y: "31%", delay: "1.35s", distance: "124px" },
    { x: "22%", y: "57%", delay: "1.7s", distance: "138px" },
    { x: "79%", y: "61%", delay: "2.05s", distance: "142px" },
    ...(grand
      ? [
          { x: "8%", y: "72%", delay: "2.45s", distance: "128px" },
          { x: "94%", y: "73%", delay: ".85s", distance: "134px" },
        ]
      : []),
  ];
  return (
    <div className="celebration-sky" aria-hidden="true">
      {bursts.map((burst, burstIndex) => (
        <span
          className="firework-burst"
          key={`${burst.x}-${burst.y}`}
          style={
            {
              "--burst-x": burst.x,
              "--burst-y": burst.y,
              "--burst-delay": burst.delay,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: grand ? 24 : 18 }, (_, sparkIndex) => (
            <i
              key={sparkIndex}
              style={
                {
                  "--spark-angle": `${sparkIndex * (grand ? 15 : 20)}deg`,
                  "--spark-distance": burst.distance,
                  "--spark-color": colors[(sparkIndex + burstIndex) % colors.length],
                  "--spark-delay": `${(sparkIndex % 3) * 0.035}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      ))}
    </div>
  );
}

export function FocusCelebration({ onClose }: { onClose: () => void }) {
  return (
    <div className="focus-celebration" role="status" aria-live="polite">
      <CelebrationSky />
      <section>
        <span className="celebration-kicker">6 HOURS OF DEEP WORK</span>
        <h2>Research moved forward today.</h2>
        <p>Six focused hours. A serious day of scholarship—well done.</p>
        <button onClick={onClose}>
          Keep going <b>→</b>
        </button>
      </section>
      <button className="celebration-close" aria-label="Close celebration" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export type PaperMilestone = {
  id: string;
  title: string;
  milestone: "Accepted" | "Published";
  journal?: string;
};
export function PaperCelebration({
  paper,
  onClose,
  ref,
}: {
  paper: PaperMilestone;
  onClose: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className="focus-celebration paper-celebration"
      role="dialog"
      aria-modal="true"
      aria-label={`${paper.title} ${paper.milestone}`}
    >
      <CelebrationSky grand />
      <section>
        <span className="celebration-kicker">PAPER {paper.milestone.toUpperCase()}</span>
        <div
          className="celebration-languages"
          aria-label="热烈祝贺. Congratulations. Herzlichen Glückwunsch."
        >
          <h2 style={{ "--language-index": 0 } as React.CSSProperties}>热烈祝贺</h2>
          <h2 style={{ "--language-index": 1 } as React.CSSProperties}>Congratulations</h2>
          <h2 style={{ "--language-index": 2 } as React.CSSProperties}>Herzlichen Glückwunsch</h2>
        </div>
        <p>
          <strong>{paper.title}</strong>
          <br />
          has been {paper.milestone.toLowerCase()}
          {paper.journal
            ? paper.milestone === "Accepted"
              ? ` by ${paper.journal}.`
              : ` in ${paper.journal}.`
            : "."}
        </p>
        <button onClick={onClose}>
          Celebrate this milestone <b>→</b>
        </button>
      </section>
      <button
        className="celebration-close"
        aria-label="Close publication celebration"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
