import { useSyncExternalStore } from "react";

import { getActingSchool, subscribeActingSchool } from "@/lib/actingSchool";

/** Reactive read of the current acting-school (see `lib/actingSchool.ts`) — re-renders every
 * subscribed component (the shell's redirect guard, the exit banner) together whenever it
 * changes, without needing a full page reload. */
export function useActingSchool() {
  return useSyncExternalStore(subscribeActingSchool, getActingSchool, () => null);
}
