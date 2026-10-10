import { Icon } from "./Icon";

export type ArtKind = "dashboard" | "students" | "exams" | "finance" | "chat" | "campus" | "security" | "support";

/** Picks the illustration for a page from its path. */
export function artForPath(path: string): ArtKind {
  if (path.startsWith("/features/student")) return "students";
  if (path.startsWith("/features/academics")) return "exams";
  if (path.startsWith("/features/finance") || path.startsWith("/pricing")) return "finance";
  if (path.startsWith("/features/communication") || path.startsWith("/contact") || path.startsWith("/request-demo")) return "chat";
  if (path.startsWith("/features/campus")) return "campus";
  if (path.startsWith("/features/administration") || path.startsWith("/security") || path.startsWith("/legal")) return "security";
  if (path.startsWith("/support") || path.startsWith("/faq") || path.startsWith("/resources")) return "support";
  return "dashboard";
}

const CHIP_TEXT: Record<ArtKind, [[string, "check" | "users" | "shield" | "mail" | "chart"], [string, "check" | "users" | "shield" | "mail" | "chart"]]> = {
  dashboard: [["Role-based dashboards", "chart"], ["One connected system", "check"]],
  students: [["Records in one place", "users"], ["Guardians linked", "check"]],
  exams: [["Results workflow", "check"], ["Weighted CA", "chart"]],
  finance: [["Invoices & receipts", "check"], ["Balances kept in step", "chart"]],
  chat: [["Reply from our team", "mail"], ["Stored safely", "shield"]],
  campus: [["Library · Hostel · Transport", "users"], ["Own records, own view", "check"]],
  security: [["Roles & permissions", "shield"], ["Audit log", "check"]],
  support: [["Real people", "users"], ["E-mail · phone · WhatsApp", "mail"]],
};

function Body({ kind }: { kind: ArtKind }) {
  const bars = (heights: number[]) => (
    <div className="art-chart">
      {heights.map((h, i) => (
        <i key={i} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
  const rows = (n: number) => (
    <div className="art-rows">
      {Array.from({ length: n }, (_, i) => (
        <div className="art-row" key={i}>
          <span className="dot" />
          <span className="ln" style={{ maxWidth: `${88 - i * 12}%` }} />
          <span className="ln s" />
        </div>
      ))}
    </div>
  );
  switch (kind) {
    case "students":
      return rows(5);
    case "exams":
      return (
        <>
          <div className="art-grid">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} className={[0, 3, 5, 6, 10].includes(i) ? "on" : ""} />
            ))}
          </div>
          {bars([45, 70, 55, 90, 75, 100])}
        </>
      );
    case "finance":
      return (
        <>
          <div className="art-tiles">
            {[0, 1, 2].map((i) => (
              <div className="art-tile" key={i}>
                <b />
                <u />
              </div>
            ))}
          </div>
          {bars([30, 50, 40, 70, 60, 85, 95])}
        </>
      );
    case "chat":
      return (
        <>
          <div className="art-bubble">
            <i />
            <i />
          </div>
          <div className="art-bubble me">
            <i />
            <i />
            <i />
          </div>
          <div className="art-bubble">
            <i />
            <i />
          </div>
        </>
      );
    case "campus":
      return (
        <div className="art-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {(["library", "bed", "bus", "heart", "building", "calendar"] as const).map((n, i) => (
            <i key={n} className={i % 2 === 0 ? "on" : ""} style={{ color: "#fff" }}>
              <Icon name={n} className="art-ico" />
            </i>
          ))}
        </div>
      );
    case "security":
      return (
        <div className="art-shield">
          <Icon name="shield" />
        </div>
      );
    case "support":
      return (
        <>
          {rows(3)}
          <div className="art-bubble me">
            <i />
            <i />
          </div>
        </>
      );
    default:
      return (
        <>
          <div className="art-tiles">
            {[0, 1, 2].map((i) => (
              <div className="art-tile" key={i}>
                <b />
                <u />
              </div>
            ))}
          </div>
          {bars([40, 65, 50, 85, 70, 95])}
          {rows(2)}
        </>
      );
  }
}

/** A decorative product illustration for a page hero. It is built from shapes, not real screenshots or data, and is
 * hidden from assistive technology. */
export function HeroArt({ kind }: { kind: ArtKind }) {
  const [c1, c2] = CHIP_TEXT[kind];
  return (
    <div className="art" aria-hidden="true">
      <div className="art-window">
        <div className="art-bar">
          <i />
          <i />
          <i />
          <span />
        </div>
        <div className="art-body">
          <Body kind={kind} />
        </div>
      </div>
      <span className="art-chip c1">
        <Icon name={c1[1]} />
        {c1[0]}
      </span>
      <span className="art-chip c2">
        <Icon name={c2[1]} />
        {c2[0]}
      </span>
    </div>
  );
}
