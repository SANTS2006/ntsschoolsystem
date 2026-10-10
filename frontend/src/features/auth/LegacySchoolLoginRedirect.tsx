import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { FullPageSpinner } from "@/components/ui/Spinner";
import { goTo, schoolPath } from "@/lib/schoolSlug";

/** `/login/<slug>` was the school sign-in address before schools had their own: send it to `/<slug>/login`. */
export function LegacySchoolLoginRedirect() {
  const { slug } = useParams<{ slug: string }>();
  useEffect(() => {
    goTo(slug ? schoolPath(slug, "/login") : "/login", { replace: true });
  }, [slug]);
  return <FullPageSpinner />;
}
