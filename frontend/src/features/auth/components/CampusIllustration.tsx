/** Inline campus scene used as the brand panel's backdrop (no external image dependency). */
export function CampusIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="campus-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "color-mix(in srgb, var(--brand-primary) 45%, #050b1f)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--brand-primary)" }} />
          <stop offset="1" style={{ stopColor: "color-mix(in srgb, var(--brand-primary) 55%, white)" }} />
        </linearGradient>
        <linearGradient id="campus-building" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dbeafe" stopOpacity="0.95" />
          <stop offset="1" stopColor="#93c5fd" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="600" height="640" fill="url(#campus-sky)" />
      <circle cx="470" cy="120" r="46" fill="#e0f2fe" opacity="0.5" />
      <circle cx="470" cy="120" r="80" fill="#e0f2fe" opacity="0.12" />
      <g transform="translate(0 40)">
        <rect x="90" y="330" width="420" height="190" fill="url(#campus-building)" />
        <polygon points="70,330 300,230 530,330" fill="#eff6ff" />
        <rect x="255" y="270" width="90" height="60" fill="#bfdbfe" />
        <circle cx="300" cy="300" r="14" fill="#1e40af" />
        <rect x="260" y="390" width="80" height="130" fill="#1e3a8a" />
        {[120, 170, 380, 430].map((x) =>
          [360, 435].map((y) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="34" height="48" rx="3" fill="#1e40af" opacity="0.85" />
          )),
        )}
        <rect x="50" y="520" width="500" height="12" fill="#eff6ff" opacity="0.9" />
        <rect x="250" y="500" width="100" height="10" fill="#eff6ff" opacity="0.9" />
      </g>
      <line x1="300" y1="228" x2="300" y2="178" stroke="#eff6ff" strokeWidth="3" />
      <polygon points="300,178 336,190 300,202" style={{ fill: "var(--brand-secondary)" }} />
      <rect y="572" width="600" height="68" fill="#071c48" opacity="0.55" />
    </svg>
  );
}
