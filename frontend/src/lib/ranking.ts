/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", 21 -> "21st". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Competition ranking by score, highest first: equal scores share a position and the next one skips ahead
 * (1st, 1st, 3rd). Items without a score are not ranked (position `null`). */
export function rankByScore<T>(items: T[], score: (item: T) => number | null): Map<T, number | null> {
  const scored = items
    .map((item) => ({ item, value: score(item) }))
    .filter((entry): entry is { item: T; value: number } => entry.value !== null && !Number.isNaN(entry.value))
    .sort((a, b) => b.value - a.value);
  const positions = new Map<T, number | null>(items.map((item) => [item, null]));
  scored.forEach((entry, index) => {
    const previous = scored[index - 1];
    positions.set(entry.item, previous && previous.value === entry.value ? positions.get(previous.item)! : index + 1);
  });
  return positions;
}
