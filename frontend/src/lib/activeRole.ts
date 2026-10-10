/** Which of their roles a person with several is working as right now.
 *
 * Kept in the browser (per device) as `{ userId, slug }` and sent to the server on every request as `X-Active-Role`.
 * The server only honours it for a role the person really holds, and then gives them exactly that role's permissions
 * and nothing from their other roles — so this is a genuine switch, not just a tidier menu. The user id is stored with
 * it so a choice made by one person on a shared computer is never applied to the next person who signs in. */

const KEY = "nts:active-role";

interface Stored {
  userId: string;
  slug: string;
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return typeof parsed.userId === "string" && typeof parsed.slug === "string" ? { userId: parsed.userId, slug: parsed.slug } : null;
  } catch {
    return null;
  }
}

export function getActiveRoleSlug(): string | null {
  return read()?.slug ?? null;
}

export function getStoredActiveRoleOwner(): string | null {
  return read()?.userId ?? null;
}

export function setStoredActiveRole(userId: string, slug: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, slug }));
  } catch {
    // Private window / blocked storage: the choice just won't survive a reload.
  }
}

export function clearStoredActiveRole(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
