/** The one place the company, product and contact details live. Change them here and every page, the footer, the
 * structured data and the forms follow. */

export const SITE = {
  company: "NTS Digital Solutions",
  /** The product's working name (change here if a different name is chosen). */
  product: "NTS School System",
  tagline: "One platform for the whole school.",
  email: "hello@ntsdigitalsolutions.com",
  phoneDisplay: "+232 31 034 604",
  phoneLink: "tel:+23231034604",
  whatsappLink: "https://wa.me/23231034604",
  /** Where people sign in and where the application itself lives (the same site, different pages). */
  appFindSchool: "/find-school",
  appSignIn: "/login",
  /** Absolute origin for canonical links, the sitemap and social cards. Set SITE_URL when building for another domain. */
  url: (import.meta.env?.VITE_SITE_URL as string | undefined) ?? "https://nts-school-system.onrender.com",
} as const;

export const NAV = [
  { to: "/product", label: "Product" },
  {
    to: "/features",
    label: "Features",
    children: [
      { to: "/features/student-records", label: "Students & admissions" },
      { to: "/features/academics-and-exams", label: "Academics & exams" },
      { to: "/features/finance", label: "Fees & finance" },
      { to: "/features/communication", label: "Communication" },
      { to: "/features/campus-operations", label: "Campus operations" },
      { to: "/features/administration-and-security", label: "Administration & security" },
    ],
  },
  { to: "/who-its-for", label: "Who it's for" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/resources", label: "Resources" },
] as const;

export const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { to: "/product", label: "Overview" },
      { to: "/features", label: "Features" },
      { to: "/who-its-for", label: "Who it's for" },
      { to: "/how-it-works", label: "How it works" },
      { to: "/benefits", label: "Benefits" },
      { to: "/security", label: "Security & privacy" },
      { to: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About NTS Digital Solutions" },
      { to: "/resources", label: "Resources" },
      { to: "/faq", label: "FAQ" },
      { to: "/support", label: "Support" },
      { to: "/contact", label: "Contact" },
      { to: "/request-demo", label: "Request a demo" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/legal/privacy", label: "Privacy policy" },
      { to: "/legal/terms", label: "Terms of service" },
      { to: "/legal/cookies", label: "Cookie policy" },
      { to: "/legal/acceptable-use", label: "Acceptable use" },
      { to: "/legal/accessibility", label: "Accessibility" },
      { to: "/legal", label: "All legal documents" },
    ],
  },
] as const;
