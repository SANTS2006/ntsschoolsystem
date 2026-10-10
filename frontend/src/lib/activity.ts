import { queryClient } from "@/lib/query-client";

/** How many saves/sends/other mutations are in flight right now, app-wide. Buttons use it to show that the
 * click they just received is being worked on, even when the page forgot to pass `isLoading`. */
let pending = queryClient.isMutating();
const listeners = new Set<() => void>();

queryClient.getMutationCache().subscribe(() => {
  const next = queryClient.isMutating();
  if (next === pending) return;
  pending = next;
  listeners.forEach((listener) => listener());
});

export function subscribePendingMutations(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingMutations(): number {
  return pending;
}
