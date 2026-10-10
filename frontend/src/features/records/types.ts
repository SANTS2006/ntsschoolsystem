/** Named `SchoolRecord`, not `Record` — the latter shadows TypeScript's built-in `Record<K, V>`
 * utility type, which other files in this codebase use.
 *
 * `created_by`/`created_by_name` are server-computed from `request.user` on create, never
 * client-writable. `file` is a plain Django `FileField` — write as multipart/form-data when a
 * new file is picked, read back as a media URL string. Either `body` or `file` (or both) must be
 * present — enforced both client- and server-side. */
export interface SchoolRecord {
  /** You created it — only then can you edit or delete it. */
  is_mine: boolean;
  id: string;
  title: string;
  category: string;
  body: string;
  file: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordPayload {
  title: string;
  category?: string;
  body?: string;
  file?: File;
}

export interface RecordListParams {
  category?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}
