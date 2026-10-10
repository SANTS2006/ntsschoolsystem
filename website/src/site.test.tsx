import { render as rtl, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnquiryForm } from "@/components/EnquiryForm";
import { Faq } from "@/components/Bits";
import { render } from "./entry-server";
import { ROUTE_PATHS } from "./routes";
import { SITE } from "./site";

describe("every prerendered page", () => {
  const pages = ROUTE_PATHS.map((p) => ({ path: p, ...render(p) }));

  it("declares unique, sensibly sized titles and descriptions", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const { path, meta } of pages) {
      expect(meta, path).not.toBeNull();
      expect(meta!.title.length, path).toBeLessThanOrEqual(70);
      expect(meta!.description.length, path).toBeGreaterThan(50);
      expect(meta!.description.length, path).toBeLessThanOrEqual(220);
      titles.add(meta!.title);
      descriptions.add(meta!.description);
    }
    expect(titles.size).toBe(pages.length);
    expect(descriptions.size).toBe(pages.length);
  });

  it("has exactly one h1 and a main landmark", () => {
    for (const { path, html } of pages) {
      expect((html.match(/<h1[\s>]/g) ?? []).length, path).toBe(1);
      expect(html, path).toContain('id="main"');
    }
  });

  it("has canonical URLs and structured data in the head", () => {
    for (const { path, head } of pages) {
      expect(head, path).toContain(`<link rel="canonical" href="${SITE.url}${path === "/" ? "/" : path}"`);
      expect(head, path).toContain("application/ld+json");
    }
  });

  it("links only to pages that exist", () => {
    const known = new Set(ROUTE_PATHS);
    const external = ["/find-school", "/login", "/nts-logo-small.png"];
    for (const { path, html } of pages) {
      for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
        const clean = href.length > 1 ? href.replace(/\/$/, "") : href;
        expect(known.has(clean) || external.includes(clean), `${path} -> ${href}`).toBe(true);
      }
    }
  });

  it("uses the contact details from one place", () => {
    const home = pages.find((p) => p.path === "/contact")!.html;
    expect(home).toContain("hello@ntsdigitalsolutions.com");
    expect(home).toContain("tel:+23231034604");
    expect(home).toContain("https://wa.me/23231034604");
  });

  it("sets no inline scripts or styles (the content-security policy forbids them)", () => {
    for (const { path, html } of pages) {
      expect(html, path).not.toMatch(/<script(?![^>]*type="application\/ld\+json")/);
      expect(html, path).not.toMatch(/<style[\s>]/);
    }
  });

  it("does not claim things the product does not do", () => {
    const text = pages.map((p) => p.html).join(" ").toLowerCase();
    for (const banned of ["soc 2", "iso 27001", "gdpr compliant", "99.9%", "trusted by", "testimonial", "unhackable"]) expect(text).not.toContain(banned);
  });
});

describe("FAQ", () => {
  it("opens and closes an answer", async () => {
    rtl(<Faq items={[{ q: "Question one?", a: "Answer one." }]} />);
    const button = screen.getByRole("button", { name: /Question one/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Answer one.")).toBeVisible();
  });
});

describe("enquiry form", () => {
  afterEach(() => vi.restoreAllMocks());
  const form = (kind: "demo" | "contact") => rtl(<MemoryRouter><EnquiryForm kind={kind} /></MemoryRouter>);

  it("shows errors and does not call the server when fields are missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    form("demo");
    await userEvent.click(screen.getByRole("button", { name: /Request my demo/ }));
    expect(await screen.findByText("Please enter your name.")).toBeVisible();
    expect(screen.getByText(/agree to the privacy notice/)).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("only says thank you after the server confirms it stored the message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, reference: "ABC12345" }), { status: 201 }));
    form("contact");
    await userEvent.type(screen.getByLabelText("Full name"), "Joe Bangura");
    await userEvent.type(screen.getByLabelText("E-mail"), "joe@example.com");
    await userEvent.type(screen.getByLabelText("Your message"), "How is pricing worked out?");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Send message/ }));
    expect(await screen.findByText(/has been received/)).toBeVisible();
    expect(screen.getByText("ABC12345")).toBeVisible();
  });

  it("keeps the form and says so when the server fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    form("contact");
    await userEvent.type(screen.getByLabelText("Full name"), "Joe Bangura");
    await userEvent.type(screen.getByLabelText("E-mail"), "joe@example.com");
    await userEvent.type(screen.getByLabelText("Your message"), "How is pricing worked out?");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Send message/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not send/i);
    expect(screen.queryByText(/has been received/)).toBeNull();
    expect(screen.getByLabelText("Full name")).toHaveValue("Joe Bangura");
  });
});
