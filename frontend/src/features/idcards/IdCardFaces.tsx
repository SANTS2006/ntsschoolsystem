import type { CSSProperties } from "react";

import type { IdCard } from "./types";

/** Standard CR80 card (85.6 × 54 mm) at 5 px/mm. Fixed hex colours and inline sizes on purpose:
 * the card is a printed/exported artefact, so it must not change with the app's light/dark theme. */
export const CARD_WIDTH = 428;
export const CARD_HEIGHT = 270;
const BRAND = "#1565c0";

const faceStyle: CSSProperties = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  borderRadius: 14,
  overflow: "hidden",
  background: "#ffffff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  position: "relative",
  boxSizing: "border-box",
  flexShrink: 0,
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function detailRows(card: IdCard): [string, string][] {
  const p = card.payload;
  const rows: [string, string | undefined][] =
    card.holder_type === "student"
      ? [
          ["Class", [p.class, p.section].filter(Boolean).join(" · ")],
          ["DOB", formatDate(p.date_of_birth)],
          ["Gender", p.gender],
        ]
      : [
          ["Dept", p.department],
          ["Email", p.email],
          ["Phone", p.phone],
        ];
  return rows.filter((row): row is [string, string] => !!row[1]);
}

export function IdCardFront({ card }: { card: IdCard }) {
  const initials = card.holder_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div style={faceStyle} data-testid="idcard-front">
      <div style={{ background: BRAND, color: "#fff", height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 14px" }}>
        {card.school_logo && (
          <img
            src={card.school_logo}
            alt=""
           
            style={{ height: 34, width: 34, objectFit: "contain", background: "#fff", borderRadius: 6, padding: 2 }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {card.school_name}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>
            {card.holder_type === "student" ? "Student ID" : "Staff ID"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, padding: "14px 16px 0" }}>
        <div
          style={{
            width: 96,
            height: 120,
            borderRadius: 8,
            background: "#e2e8f0",
            border: "2px solid #cbd5e1",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            fontWeight: 700,
            color: "#64748b",
            flexShrink: 0,
          }}
        >
          {card.photo ? (
            <img src={card.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initials
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, color: "#0f172a" }}>{card.payload.name}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: BRAND, marginTop: 2 }}>{card.payload.role}</div>
          <div style={{ fontSize: 12, marginTop: 8, color: "#475569" }}>
            <span style={{ fontWeight: 600 }}>{card.holder_type === "student" ? "Adm. No" : "Staff No"}:</span>{" "}
            {card.payload.number || "—"}
          </div>
          {detailRows(card).map(([label, value]) => (
            <div key={label} style={{ fontSize: 11, marginTop: 3, color: "#475569", overflowWrap: "anywhere" }}>
              <span style={{ fontWeight: 600 }}>{label}:</span> {value}
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: BRAND }} />
    </div>
  );
}

export function IdCardBack({ card }: { card: IdCard }) {
  return (
    <div style={faceStyle} data-testid="idcard-back">
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, height: "100%", boxSizing: "border-box" }}>
        <div
          aria-label={`QR code for card ${card.card_number}`}
          style={{ width: 170, height: 170, flexShrink: 0, background: "#fff", border: "1px solid #e2e8f0", padding: 6, borderRadius: 8, boxSizing: "border-box" }}
          // The SVG is generated server-side by segno from a URL we built — never user-supplied markup.
          dangerouslySetInnerHTML={{ __html: card.qr_svg.replace("<svg", '<svg style="width:100%;height:100%"') }}
        />
        <div style={{ minWidth: 0, flex: 1, fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Scan to verify</div>
          <div>Card no: <strong style={{ color: "#0f172a" }}>{card.card_number}</strong></div>
          <div>Issued: {formatDate(card.issued_at)}</div>
          {card.expires_at && <div>Valid until: {formatDate(card.expires_at)}</div>}
          <div style={{ marginTop: 8, fontSize: 10, color: "#64748b" }}>
            This card is the property of {card.school_name}. If found, please return it to the school office.
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: BRAND }} />
    </div>
  );
}
