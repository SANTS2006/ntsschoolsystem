import { School } from "lucide-react";

interface ColorFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function ColorField({ label, hint, value, onChange, error }: ColorFieldProps) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
        />
        <input
          type="text"
          aria-label={`${label} hex code`}
          value={value}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
          className="h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 font-mono text-sm uppercase text-[var(--color-text)]"
        />
      </div>
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : <p className="text-sm text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

/** The two colours a school is dressed in — its login page, every screen its users see, and the emails it
 * sends. A live sample shows how they combine. */
export function BrandColorFields({
  primary,
  secondary,
  onPrimaryChange,
  onSecondaryChange,
  primaryError,
  secondaryError,
  logo,
  schoolName,
}: {
  primary: string;
  secondary: string;
  onPrimaryChange: (value: string) => void;
  onSecondaryChange: (value: string) => void;
  primaryError?: string;
  secondaryError?: string;
  logo: string | null;
  schoolName: string;
}) {
  const ok = (value: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback);
  const p = ok(primary, "#1565c0");
  const s = ok(secondary, "#22d3ee");
  return (
    <fieldset className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <legend className="px-2 text-sm font-semibold text-[var(--color-text)]">School colours</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ColorField
          label="Primary colour"
          hint="Buttons, links, menus and headers."
          value={primary}
          onChange={onPrimaryChange}
          error={primaryError}
        />
        <ColorField
          label="Secondary colour"
          hint="Highlights, gradients and accents."
          value={secondary}
          onChange={onSecondaryChange}
          error={secondaryError}
        />
      </div>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]" aria-label="Preview">
        <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, ${s}, ${p} 60%)` }}>
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/90">
            {logo ? <img src={logo} alt="" className="size-full object-cover" /> : <School className="size-5" style={{ color: p }} aria-hidden="true" />}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold">{schoolName || "Your school"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-[var(--color-surface)] px-4 py-3">
          <span className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: `linear-gradient(135deg, ${s}, ${p} 70%)` }}>
            Sign in
          </span>
          <span className="text-sm font-medium" style={{ color: p }}>
            A link
          </span>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${s}26`, color: p }}>
            Badge
          </span>
        </div>
      </div>
    </fieldset>
  );
}
