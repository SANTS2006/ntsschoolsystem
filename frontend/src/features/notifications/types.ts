/** This is the one self-service feature in the whole app — every authenticated user (any role,
 * either account type) sees exactly their own inbox, with no permission code gating it at all
 * (bare `IsAuthenticated`). The API is read-only plus two mark-read actions — there's no
 * create/update/delete anywhere, notifications only ever come from server-side triggers. */
export type NotificationPriority = "low" | "normal" | "high";

/** `category` is free text on the backend (a plain `CharField`, not an enum) — real values in use
 * today are "announcement", "assignment", "assignment_graded", but new ones can appear as more
 * triggers get wired up, so this type is deliberately `string`, not a union. `link` is a plain
 * relative path (e.g. "/assignments/{id}"), not a generic entity_type/entity_id reference. */
export interface Notification {
  id: string;
  category: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListParams {
  category?: string;
  priority?: NotificationPriority;
  is_read?: boolean;
}
