import { MODULE_GROUPS } from "@/content/modules";

/** Every page that is prerendered, in sitemap order. The server only serves the marketing site for paths listed here. */
export const LEGAL_SLUGS = ["privacy", "terms", "cookies", "acceptable-use", "accessibility"] as const;

export const ROUTE_PATHS: string[] = [
  "/",
  "/product",
  "/features",
  ...MODULE_GROUPS.map((m) => `/features/${m.slug}`),
  "/who-its-for",
  "/how-it-works",
  "/benefits",
  "/security",
  "/pricing",
  "/request-demo",
  "/contact",
  "/about",
  "/support",
  "/resources",
  "/faq",
  "/legal",
  ...LEGAL_SLUGS.map((s) => `/legal/${s}`),
];
