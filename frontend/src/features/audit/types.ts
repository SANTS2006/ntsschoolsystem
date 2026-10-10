/** `AuditLog` rows are append-only and fully read-only via the API (the backend model's own
 * `save()`/`delete()` block any update/delete outside the one `log_action()` write path) — there
 * is no create/update/delete anywhere in this feature, only list and detail. */
export type AuditSeverity = "info" | "warning" | "critical";

/** `action` is free-text (dot-separated, e.g. "auth.login_success", "platform.school_created") —
 * there's no fixed enum on the backend, new values appear as new features log new actions, so this
 * type is deliberately `string`, not a union. `actor_email` is a denormalized snapshot (survives
 * the actor being deleted/disabled later) — there's no actor id or name exposed, only this. */
export interface AuditLog {
  id: string;
  school: string | null;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  severity: AuditSeverity;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogListParams {
  search?: string;
  severity?: AuditSeverity;
  ordering?: string;
}
