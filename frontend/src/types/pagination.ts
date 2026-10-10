export interface PaginatedResponse<T> {
  success: boolean;
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
