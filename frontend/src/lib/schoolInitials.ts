/** A school's name boiled down to its capital letters for tight spaces: "Greenwood High School" -> "GHS",
 * "St. Mary's Academy" -> "SMA". Small words ("of", "the", "and") are skipped; at most four letters. */
const SKIPPED = new Set(["of", "the", "and", "for", "in", "at", "de", "la"]);

export function schoolInitials(name: string): string {
  const words = name
    .split(/[\s\-_/]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const significant = words.filter((word) => !SKIPPED.has(word.toLowerCase()));
  const picked = (significant.length > 0 ? significant : words).slice(0, 4);
  return picked.map((word) => word[0].toUpperCase()).join("") || name.slice(0, 2).toUpperCase();
}
