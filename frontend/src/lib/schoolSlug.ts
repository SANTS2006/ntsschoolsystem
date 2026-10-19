import { createContext, useContext } from "react";

/** Every school lives under its own address: `/<school slug>/dashboard`, `/<school slug>/login`, ... The
 * web app also has a few top-level paths of its own (the platform console, the generic sign-in, public
 * pages and — for old bookmarks — the bare module names). A path that starts with one of these is NOT
 * a school. Keep in step with `apps/tenants/reserved.py`, which stops a school taking one of these as
 * its slug. */
export const RESERVED_PATHS = new Set([
  "academics", "admin", "admissions", "api", "apply", "assets", "assignments", "attendance", "audit",
  "change-password", "communications", "complaints", "dashboard", "discipline", "documents", "education",
  "events", "examinations", "finance", "forgot-password", "hostel", "idcards", "inventory", "library",
  "live-sessions", "login", "logout", "media", "medical", "meetings", "notifications", "parents",
  "permissions", "platform", "procurement", "quizzes", "records", "reports", "reset-password", "roles",
  "salary", "settings", "static", "staff", "students", "subjects", "timetable", "transcript", "transport",
  "two-factor", "verify-card", "verify-email", "accept-invitation", "find-school", "sw.js", "manifest.webmanifest",
  "favicon.ico", "robots.txt", "my-attendance", "my-discipline", "my-documents", "my-graduation-status",
  "my-id-card", "my-lessons", "my-live-sessions", "my-medical", "my-meetings", "my-quizzes", "my-results",
  "my-staff-attendance", "my-fees", "my-salary", "my-subjects", "my-timetable", "my-transport", "health", "www", "app", "nts",
]);

/** The school slug a URL path belongs to, or null for the platform / generic / public pages. */
export function schoolSlugFromPath(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first || RESERVED_PATHS.has(first.toLowerCase())) return null;
  return first;
}

/** The school this page is being viewed under (null for the platform console and generic pages). */
export const SchoolSlugContext = createContext<string | null>(null);

export function useSchoolSlug(): string | null {
  return useContext(SchoolSlugContext);
}

/** The full path of a page inside a school. */
export function schoolPath(slug: string, path = "/"): string {
  return `/${slug}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Leaves the router for another part of the site (a different school, or the platform console). The app's
 * router is mounted under one school's address, so crossing between them needs a real page load. */
export function goTo(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.location.replace(path);
  else window.location.assign(path);
}
