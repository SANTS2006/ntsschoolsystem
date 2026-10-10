import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { PageHero } from "@/components/Bits";
import { Seo, breadcrumbLd } from "@/seo";
import { SITE } from "@/site";

import NotFound from "./NotFound";

const UPDATED = "10 October 2026";

function Draft() {
  return (
    <p className="note-draft" role="note">
      <strong>Draft for legal review.</strong> This document describes how this website and the product work today. It has not yet been reviewed by a lawyer and should be checked against the laws that apply to {SITE.company} before it is relied on.
    </p>
  );
}

const DOCS: Record<string, { title: string; summary: string; body: () => ReactNode }> = {
  privacy: {
    title: "Privacy policy",
    summary: "What this website collects, why, who sees it and how to ask about it.",
    body: () => (
      <>
        <h2>Who we are</h2>
        <p>{SITE.company} runs this website and the {SITE.product}. Contact: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>, {SITE.phoneDisplay}.</p>
        <h2>What this website collects</h2>
        <p>Only what you type into the demo-request and contact forms: your name, e-mail address, optional phone number, school or organisation, school type, approximate student numbers, areas of interest, preferred contact method, topic and message, and your agreement to this policy.</p>
        <p>To protect the forms from abuse we also record the network (IP) address the submission came from, and we limit how many submissions one address can make in an hour.</p>
        <h2>What it does not collect</h2>
        <p>This website sets no cookies, runs no analytics, advertising or tracking scripts, and loads fonts and scripts from our own server rather than from third parties.</p>
        <h2>How we use it</h2>
        <p>We use your details to reply to your enquiry, to arrange a demo and to give you a quote. We do not sell them or use them for unrelated marketing.</p>
        <h2>Where it goes</h2>
        <p>Your enquiry is stored in our database and e-mailed to our team. Our current service providers are Render (hosting), Neon (database) and Brevo (e-mail delivery). These providers process data on our behalf to run the service.</p>
        <h2>How long we keep it</h2>
        <p>[To be confirmed with legal review: retention period for enquiries.]</p>
        <h2>Your choices</h2>
        <p>You can ask us what we hold about you, ask us to correct it, or ask us to delete it by writing to <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. Depending on where you live, you may have further rights under local law.</p>
        <h2>School data in the product</h2>
        <p>Schools that use the {SITE.product} control the student, staff and guardian information they enter. The terms for that data are set out in the agreement between the school and {SITE.company}, not in this website policy.</p>
        <h2>Changes</h2>
        <p>We will update this page and its date when this policy changes.</p>
      </>
    ),
  },
  terms: {
    title: "Terms of service",
    summary: "The terms for using the NTS School System website, including accuracy of content and use of the forms.",
    body: () => (
      <>
        <h2>This website</h2>
        <p>This website gives information about the {SITE.product}. By using it you agree to these terms. If you do not agree, please do not use it.</p>
        <h2>Information only</h2>
        <p>The content is general information, not an offer or contract. A school's use of the {SITE.product} is governed by a separate written agreement.</p>
        <h2>Accuracy</h2>
        <p>We aim to describe the product accurately and to say what it does not do. The product changes over time, so features may differ from this description; ask us to confirm anything important before you decide.</p>
        <h2>Using the forms</h2>
        <p>Please give accurate details and do not submit unlawful, abusive or automated content. We may block submissions that appear to be abuse.</p>
        <h2>Liability</h2>
        <p>[To be completed with legal review: limitation of liability and governing law.]</p>
        <h2>Contact</h2>
        <p><a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
      </>
    ),
  },
  cookies: {
    title: "Cookie policy",
    summary: "This website uses no cookies and no tracking scripts, so there is no cookie banner to accept or decline.",
    body: () => (
      <>
        <h2>Cookies on this website</h2>
        <p>This website does not set cookies and does not use analytics or advertising trackers, so there is no cookie banner to accept or decline.</p>
        <h2>The school application</h2>
        <p>The {SITE.product} application that schools sign in to is a separate part of the service. It stores a sign-in session and preferences in your browser so you stay signed in and the app works. Those are covered in the agreement with your school.</p>
        <h2>If this changes</h2>
        <p>If we ever add analytics or other optional cookies, we will ask for your consent first and update this page.</p>
      </>
    ),
  },
  "acceptable-use": {
    title: "Acceptable use",
    summary: "What we ask of people who use this website and its forms, and how to report a security problem.",
    body: () => (
      <>
        <p>Please do not misuse this website. In particular, do not:</p>
        <ul>
          <li>send unlawful, harassing or deceptive content through the forms;</li>
          <li>use automated tools to flood the forms or the site;</li>
          <li>try to gain access to systems or data that are not yours;</li>
          <li>probe or test the security of the website or platform without our written permission.</li>
        </ul>
        <p>If you find a security problem, please tell us at <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and give us a reasonable chance to fix it before sharing it.</p>
        <p>Rules for schools and their users inside the product are set by the agreement with each school.</p>
      </>
    ),
  },
  accessibility: {
    title: "Accessibility statement",
    summary: "Our accessibility aims for this website, what we have checked, known limits and how to tell us about a problem.",
    body: () => (
      <>
        <h2>Our aim</h2>
        <p>We aim for this website to meet WCAG 2.2 level AA. It is built with semantic HTML, a skip link, keyboard-operable menus and forms, visible focus, labelled form fields with error messages, sufficient colour contrast, and it respects the reduced-motion setting.</p>
        <h2>Known limits</h2>
        <ul>
          <li>We have run automated checks and manual keyboard checks, but have not had the site audited by an independent accessibility specialist.</li>
          <li>The hero graphic is decorative and hidden from assistive technology.</li>
          <li>The school application itself is a separate product and has not been audited against WCAG.</li>
        </ul>
        <h2>Tell us about a problem</h2>
        <p>If something on this site is hard to use, write to <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or call {SITE.phoneDisplay} and tell us what happened. We will try to fix it or give you the information another way.</p>
      </>
    ),
  },
};

export function LegalIndex() {
  return (
    <>
      <Seo title="Legal" description="Privacy, terms, cookies, acceptable use and accessibility for the NTS School System website." path="/legal" jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Legal", path: "/legal" }])]} />
      <PageHero title="Legal" lead="How this website and the service handle your information." />
      <section className="section">
        <div className="container prose">
          <Draft />
          <ul>
            {Object.entries(DOCS).map(([slug, d]) => (
              <li key={slug}>
                <Link to={`/legal/${slug}`}>{d.title}</Link> — {d.summary}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

export function LegalPage() {
  const { slug = "" } = useParams();
  const doc = DOCS[slug];
  if (!doc) return <NotFound />;
  const path = `/legal/${slug}`;
  return (
    <>
      <Seo title={doc.title} description={doc.summary} path={path} jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Legal", path: "/legal" }, { name: doc.title, path }])]} />
      <PageHero title={doc.title} lead={doc.summary} />
      <section className="section">
        <div className="container prose">
          <Draft />
          <p>
            <em>Last updated: {UPDATED}</em>
          </p>
          {doc.body()}
        </div>
      </section>
    </>
  );
}
