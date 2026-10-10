import { createContext, useContext, useEffect } from "react";

import { SITE } from "./site";

export interface PageMeta {
  title: string;
  description: string;
  /** Path of this page, used for the canonical link and social cards. */
  path: string;
  /** JSON-LD objects to publish with the page. */
  jsonLd?: object[];
  /** Keep a page out of search results (used for the 404). */
  noindex?: boolean;
}

/** During the build, pages report their metadata here so it can be written into the prerendered <head>. */
export const HeadCollector = createContext<{ meta: PageMeta | null } | null>(null);

export function fullTitle(title: string): string {
  return title.includes(SITE.company) || title.includes(SITE.product) ? title : `${title} | ${SITE.product}`;
}

export function absoluteUrl(path: string): string {
  return `${SITE.url.replace(/\/$/, "")}${path === "/" ? "/" : path}`;
}

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The <head> markup for a page (also used to keep the browser's head in step after client-side navigation). */
export function headHtml(meta: PageMeta): string {
  const title = fullTitle(meta.title);
  const url = absoluteUrl(meta.path);
  const image = absoluteUrl("/og-image.png");
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    meta.noindex ? `<meta name="robots" content="noindex, follow" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE.product)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(SITE.product)} — ${esc(SITE.tagline)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];
  for (const data of meta.jsonLd ?? []) {
    // JSON in a script block is data, not code, so it is allowed under the site's content-security policy.
    lines.push(`<script type="application/ld+json" data-page-ld>${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  }
  return lines.join("\n    ");
}

/** Declares a page's metadata. In the build it feeds the prerender; in the browser it updates the title and tags when
 * the visitor moves between pages. */
export function Seo(meta: PageMeta) {
  const collector = useContext(HeadCollector);
  if (collector) collector.meta = meta;

  useEffect(() => {
    document.title = fullTitle(meta.title);
    const set = (selector: string, attr: string, value: string) => {
      const el = document.head.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    const url = absoluteUrl(meta.path);
    set('meta[name="description"]', "content", meta.description);
    set('link[rel="canonical"]', "href", url);
    set('meta[property="og:title"]', "content", fullTitle(meta.title));
    set('meta[property="og:description"]', "content", meta.description);
    set('meta[property="og:url"]', "content", url);
    set('meta[name="twitter:title"]', "content", fullTitle(meta.title));
    set('meta[name="twitter:description"]', "content", meta.description);
    set('meta[name="robots"]', "content", meta.noindex ? "noindex, follow" : "index, follow, max-image-preview:large");
    // Replace this page's structured data.
    document.head.querySelectorAll("script[data-page-ld]").forEach((n) => n.remove());
    for (const data of meta.jsonLd ?? []) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-page-ld", "");
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the structured data follows the page path
  }, [meta.title, meta.description, meta.path, meta.noindex]);
  return null;
}

export function organizationLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.company,
    url: SITE.url,
    email: SITE.email,
    telephone: SITE.phoneDisplay,
    contactPoint: [{ "@type": "ContactPoint", email: SITE.email, telephone: SITE.phoneDisplay, contactType: "sales and support" }],
  };
}

export function softwareLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.product,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web browser",
    description:
      "A multi-school (multi-tenant) school management system covering student records, admissions, academics, attendance, examinations, fees, communication and campus operations.",
    publisher: { "@type": "Organization", name: SITE.company },
    url: SITE.url,
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

export function faqLd(items: { q: string; a: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}
