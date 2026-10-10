import { useQuery } from "@tanstack/react-query";

import { listRoles } from "./api";

export function useRoles() {
  return useQuery({ queryKey: ["authorization", "roles"], queryFn: listRoles });
}
