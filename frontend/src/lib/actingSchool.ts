/** A platform admin "viewing" one specific school's data (Students, Staff, Finance, every
 * normal module) rather than the platform-wide console. Backed by `localStorage` so it survives
 * a refresh, and a same-tab custom event (native `storage` events don't fire in the tab that made
 * the change) so every mounted consumer — the shell's redirect guard, the exit banner, the school
 * switcher button — reacts together without a full page reload. The backend only ever honors the
 * resulting `X-Acting-School` header for an actual platform admin (see
 * `apps.tenants.mixins.ACTING_SCHOOL_HEADER`); attaching it for a school user is harmless, it's
 * simply ignored, so this module never needs to know who's currently logged in. */

export interface ActingSchool {
  id: string;
  name: string;
}

const STORAGE_KEY = "nts-acting-school";
const EVENT_NAME = "nts-acting-school-changed";

// `useSyncExternalStore` (see `hooks/useActingSchool.ts`) requires `getSnapshot` to return a
// referentially stable value when the underlying data hasn't changed — re-parsing a new object
// out of localStorage on every call breaks that and causes an infinite render loop. Cache the
// parsed value, only re-parsing when the raw stored string actually changes.
let cachedRaw: string | null | undefined;
let cachedValue: ActingSchool | null = null;

export function getActingSchool(): ActingSchool | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = raw ? (JSON.parse(raw) as ActingSchool) : null;
    } catch {
      cachedValue = null;
    }
  }
  return cachedValue;
}

export function setActingSchool(school: ActingSchool): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(school));
  } catch {
    // Private browsing / storage disabled — the header just won't persist across a reload.
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function clearActingSchool(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeActingSchool(callback: () => void): () => void {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
