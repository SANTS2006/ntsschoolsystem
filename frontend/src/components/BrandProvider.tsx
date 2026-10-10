import { useEffect } from "react";

import { useCurrentUser } from "@/features/auth/useAuth";
import { useSchoolBranding } from "@/features/schools/useSchoolsCrud";
import { setBrand } from "@/lib/brandTheme";
import { useSchoolSlug } from "@/lib/schoolSlug";

/** Dresses the whole app as the school whose address is in the URL — its colours, logo and name — from the
 * login page onwards. Outside a school's address (the platform console, the generic sign-in) it uses the
 * NTS logo and the logo's colours. Renders nothing. */
export function BrandProvider() {
  const urlSlug = useSchoolSlug();
  const { data: user } = useCurrentUser();
  // The address wins; a signed-in school user on a neutral page still gets their own school's look.
  const slug = urlSlug ?? (user?.is_platform_admin ? null : (user?.school?.slug ?? null));
  const { data: school } = useSchoolBranding(slug ?? undefined);

  useEffect(() => {
    if (slug && school) {
      setBrand({
        name: school.name,
        logo: school.logo || school.logo_url || null,
        primary: school.primary_color,
        secondary: school.secondary_color,
      });
    } else if (!slug) {
      setBrand(null);
    }
    // While a school's branding is still loading, keep whatever is showing rather than flashing the default.
  }, [slug, school]);

  return null;
}
