export const PIE_COLORS = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
];

export const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
};

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
