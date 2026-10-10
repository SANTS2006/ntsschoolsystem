import { Link } from "react-router-dom";

import { CheckList, CtaBand, Faq, PageHero, Reveal } from "@/components/Bits";
import { ContactAside } from "@/components/ContactAside";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Icon } from "@/components/Icon";
import { FAQ } from "@/content/faq";
import { Seo, breadcrumbLd, faqLd } from "@/seo";
import { SITE } from "@/site";

const crumb = (name: string, path: string) => breadcrumbLd([{ name: "Home", path: "/" }, { name, path }]);

export function Security() {
  return (
    <>
      <Seo
        title="Security & privacy"
        description="How the NTS School System separates schools, controls access, records activity and protects data, stated plainly and without unverified guarantees."
        path="/security"
        jsonLd={[crumb("Security & privacy", "/security")]}
      />
      <PageHero title="Security & privacy" lead="What the system does to protect a school's information — described plainly, without promises we cannot prove." />
      <section className="section">
        <div className="container grid cols-2">
          {[
            ["building", "Each school kept separate", "Every school's data is tied to that school, and the application scopes what each signed-in person can read and change to their own school."],
            ["key", "Roles and permissions", "People see and do only what their role allows. Schools can edit roles, create their own and review who holds what."],
            ["lock", "Two-factor authentication", "Required for the principal and platform administrators, and available to other users."],
            ["file", "Audit log", "Important actions are recorded so a school can see who did what and when."],
            ["shield", "Browser protections", "Pages are served over HTTPS with a strict content-security policy, and sign-in and public forms are rate limited."],
            ["settings", "Backups and recovery", "Encrypted database backups with verification and retention, a guided restore, and optional storage in S3-compatible object storage."],
          ].map(([icon, t, d], i) => (
            <Reveal key={t} delay={(i % 2) * 80}>
              <div className="card" style={{ height: "100%" }}>
                <div className="icon-badge">
                  <Icon name={icon as never} />
                </div>
                <h2 style={{ fontSize: "1.25rem" }}>{t}</h2>
                <p>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="section alt">
        <div className="container split">
          <Reveal>
            <h2>Your data and this website</h2>
            <p>This website sets no cookies, loads no analytics or advertising trackers, and loads fonts from our own server. The only information it collects is what you type into the demo and contact forms.</p>
            <p>
              Details are in the <Link to="/legal/privacy">privacy policy</Link> and the <Link to="/legal/cookies">cookie policy</Link>.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h3>What we do not claim</h3>
            <CheckList
              items={[
                "We do not claim any security certification or third-party audit.",
                "We do not claim that attacks or incidents can never happen.",
                "We do not publish uptime guarantees on this website.",
                "Questions about compliance with a specific law should go to your own legal adviser; we are happy to explain how the system works.",
              ]}
            />
          </Reveal>
        </div>
      </section>
      <CtaBand title="Questions about security?" text="Ask us how the system handles your school's specific concerns and we will answer honestly." />
    </>
  );
}

export function Pricing() {
  return (
    <>
      <Seo
        title="Pricing"
        description="Pricing for the NTS School System depends on your school. Request a quote and we will give you a clear figure after understanding your needs."
        path="/pricing"
        jsonLd={[crumb("Pricing", "/pricing")]}
      />
      <PageHero title="Pricing" lead="Priced for your school, not for a generic one." />
      <section className="section">
        <div className="container split">
          <Reveal>
            <h2>Request a quote</h2>
            <p>Schools differ in size, in the areas they want to use and in how much help they need to get started. Instead of publishing a price list that fits nobody, we ask a few questions and give you a clear figure.</p>
            <h3>What we will ask about</h3>
            <CheckList items={["How many students and staff you have", "Which areas of the system you want to use", "Whether you need help setting up and training your team", "Your timeline"]} />
            <div className="btn-row" style={{ marginTop: "1.5rem" }}>
              <Link className="btn btn-blue" to="/request-demo">
                Request a demo and quote
              </Link>
              <Link className="btn btn-ghost" to="/contact">
                Ask about pricing
              </Link>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="card">
              <h3>What you can expect from us</h3>
              <ul>
                <li>A written quote that states what is included.</li>
                <li>An honest answer if the system is not the right fit for your school.</li>
              </ul>
              <p className="hint" style={{ fontSize: ".88rem", color: "var(--muted)" }}>Terms are set out in the agreement we give you; the website does not create a contract.</p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export function About() {
  return (
    <>
      <Seo title="About NTS Digital Solutions" description="NTS Digital Solutions builds and supports the NTS School System, a multi-school management platform." path="/about" jsonLd={[crumb("About", "/about")]} />
      <PageHero title="About NTS Digital Solutions" lead="We build software that helps schools run with less paperwork and more clarity." />
      <section className="section">
        <div className="container split">
          <Reveal>
            <h2>Who we are</h2>
            <p>
              {SITE.company} designs, builds and supports the {SITE.product}. The system is developed and maintained by our team, and we look after the platform that schools use.
            </p>
            <p>We keep what we say about the product tied to what the product does. If something is not built, we tell you so.</p>
          </Reveal>
          <Reveal delay={100}>
            <div className="card">
              <h3>Get in touch</h3>
              <ul style={{ listStyle: "none", padding: 0 }}>
                <li>
                  <Icon name="mail" className="" /> <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
                </li>
                <li>
                  <Icon name="phone" className="" /> <a href={SITE.phoneLink}>{SITE.phoneDisplay}</a>
                </li>
                <li>
                  <Icon name="whatsapp" className="" /> <a href={SITE.whatsappLink}>WhatsApp</a>
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function Support() {
  return (
    <>
      <Seo title="Support" description="How to reach NTS Digital Solutions for help with the NTS School System." path="/support" jsonLd={[crumb("Support", "/support")]} />
      <PageHero title="Support" lead="Real people, reachable three ways." />
      <section className="section">
        <div className="container grid cols-3">
          {[
            ["mail", "E-mail us", SITE.email, `mailto:${SITE.email}`, "Write to us any time"],
            ["phone", "Call us", SITE.phoneDisplay, SITE.phoneLink, "Tap to call"],
            ["whatsapp", "WhatsApp", "Message us", SITE.whatsappLink, "Chat with the team"],
          ].map(([icon, t, label, href, hint]) => (
            <Reveal key={t}>
              <div className="card contact-card" style={{ height: "100%" }}>
                <div className="icon-badge">
                  <Icon name={icon as never} />
                </div>
                <h2 style={{ fontSize: "1.2rem" }}>{t}</h2>
                <a className="stretched" href={href} {...(icon === "whatsapp" ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  {label}
                </a>
                <p>{hint}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="container prose" style={{ marginTop: "2.5rem" }}>
          <h2>When you write to us</h2>
          <p>To help us help you quickly, include your school's name, what you were trying to do, what happened, and a screenshot if you can. If the app showed an error with a request reference, quote it.</p>
          <p>We do not publish response-time promises on this website. For general questions, see the <Link to="/faq">FAQ</Link>; for other enquiries, use the <Link to="/contact">contact form</Link>.</p>
        </div>
      </section>
    </>
  );
}

export function Resources() {
  return (
    <>
      <Seo title="Resources" description="Practical guidance for schools choosing and starting with a school management system." path="/resources" jsonLd={[crumb("Resources", "/resources")]} />
      <PageHero title="Resources" lead="Short, practical guidance for schools. More will be added over time." />
      <section className="section">
        <div className="container grid cols-2">
          <Reveal>
            <article className="card" style={{ height: "100%" }}>
              <h2 style={{ fontSize: "1.3rem" }}>Before you ask for a demo</h2>
              <p>A short list that makes the first conversation more useful:</p>
              <CheckList items={["Roughly how many students, teachers and other staff you have", "What you use today — registers, spreadsheets, another system", "The two or three problems that cost you the most time", "Who in the school will lead the change", "Any must-have: a report, a workflow, a process"]} />
            </article>
          </Reveal>
          <Reveal delay={90}>
            <article className="card" style={{ height: "100%" }}>
              <h2 style={{ fontSize: "1.3rem" }}>Getting your data ready</h2>
              <p>Whichever system you choose, tidy records make the start easier:</p>
              <CheckList items={["One list of current students with class and a unique admission number", "A list of staff with roles and contact details", "Your class, section and subject structure for this year", "Your current fee structure by class and term", "Your grading scale and how continuous assessment counts towards the final mark"]} />
            </article>
          </Reveal>
          <Reveal>
            <article className="card" style={{ height: "100%" }}>
              <h2 style={{ fontSize: "1.3rem" }}>Questions to ask any vendor</h2>
              <CheckList items={["What does the system not do today?", "How is each school's data kept separate?", "What happens to our data if we leave?", "How are backups taken and restored?", "Who do we call when something goes wrong?"]} />
            </article>
          </Reveal>
          <Reveal delay={90}>
            <article className="card" style={{ height: "100%" }}>
              <h2 style={{ fontSize: "1.3rem" }}>Need something specific?</h2>
              <p>Browse the <Link to="/faq">FAQ</Link>, read about <Link to="/security">security</Link>, or <Link to="/contact">ask us directly</Link>.</p>
            </article>
          </Reveal>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function FaqPage() {
  return (
    <>
      <Seo title="Frequently asked questions" description="Answers about what the NTS School System does and does not do, access, pricing and support." path="/faq" jsonLd={[crumb("FAQ", "/faq"), faqLd(FAQ)]} />
      <PageHero title="Frequently asked questions" lead="Straight answers, including what the system does not do." />
      <section className="section">
        <div className="container">
          <Faq items={FAQ} />
        </div>
      </section>
      <CtaBand title="Did not find your answer?" text="Ask us directly and we will reply." />
    </>
  );
}

export function RequestDemo() {
  return (
    <>
      <Seo title="Request a demo" description="Ask for a walk-through of the NTS School System tailored to your school." path="/request-demo" jsonLd={[crumb("Request a demo", "/request-demo")]} />
      <PageHero title="Request a demo" lead="Tell us about your school and we will arrange a walk-through of the parts that matter to you." />
      <section className="section">
        <div className="container split wide-left">
          <Reveal>
            <EnquiryForm kind="demo" />
          </Reveal>
          <Reveal delay={100}>
            <div style={{ display: "grid", gap: "1.2rem" }}>
              <div className="card">
                <h2 style={{ fontSize: "1.25rem" }}>What happens next</h2>
                <ol className="next-steps">
                  <li>Your request reaches our team.</li>
                  <li>We reply by the contact method you chose.</li>
                  <li>We agree a time and show you the system.</li>
                </ol>
              </div>
              <ContactAside title="Prefer to talk now?" />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export function Contact() {
  return (
    <>
      <Seo title="Contact us" description="Contact NTS Digital Solutions by form, e-mail, phone or WhatsApp." path="/contact" jsonLd={[crumb("Contact", "/contact")]} />
      <PageHero title="Contact us" lead="Questions about the system, pricing or support — we read every message." />
      <section className="section">
        <div className="container split wide-left">
          <Reveal>
            <EnquiryForm kind="contact" />
          </Reveal>
          <Reveal delay={100}>
            <ContactAside />
          </Reveal>
        </div>
      </section>
    </>
  );
}
