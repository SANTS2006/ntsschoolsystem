import { Wrench } from "lucide-react";
import { useLocation } from "react-router-dom";

import { useMaintenance } from "@/features/maintenance/useMaintenance";

/** Shown while the platform administrator has maintenance mode on: on every page, or only on the pages they
 * picked. Reads the public maintenance setting, so it also appears on the sign-in pages. */
export function MaintenanceBanner() {
  const { data } = useMaintenance();
  const { pathname } = useLocation();

  if (!data?.enabled) return null;
  const applies = data.all_pages || data.pages.some((page) => pathname === page || pathname.startsWith(`${page}/`));
  if (!applies) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-3 border-b border-amber-500/40 bg-amber-100 px-4 py-2.5 text-sm text-amber-950 dark:bg-amber-500/15 dark:text-amber-100 sm:px-6"
    >
      <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 whitespace-pre-line break-words">
        <strong className="font-semibold">Under maintenance. </strong>
        {data.message}
      </p>
    </div>
  );
}
