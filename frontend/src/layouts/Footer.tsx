interface FooterProps {
  schoolName?: string;
}

export function Footer({ schoolName }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="flex shrink-0 flex-col items-center justify-between gap-1.5 border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-text-muted)] sm:flex-row sm:px-6">
      <p>
        © {year} {schoolName ?? "NTS School System"}. All rights reserved.
      </p>
      <p>NTS School System</p>
    </footer>
  );
}
