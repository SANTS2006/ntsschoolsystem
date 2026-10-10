import { Link, useParams } from "react-router-dom";

import { CheckList, CtaBand, PageHero, Reveal } from "@/components/Bits";
import { Icon } from "@/components/Icon";
import { MODULE_BY_SLUG, MODULE_GROUPS, ROLES } from "@/content/modules";
import { Seo, breadcrumbLd } from "@/seo";
import { SITE } from "@/site";

import NotFound from "./NotFound";

const NAME_SUFFIX = "See what it does and who uses it.";

export function Product() {
  return (
    <>
      <Seo
        title="The product"
        description="What the NTS School System is: a multi-school platform for student records, academics, exams, fees, communication and campus operations, with role-based access."
        path="/product"
        jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Product", path: "/product" }])]}
      />
      <PageHero title="The product" lead={`${SITE.product} is a web-based school management system. It gives each school one connected place for the records and routines that keep it running.`} />
      <section className="section">
        <div className="container split">
          <Reveal>
            <h2>One system instead of many books.</h2>
            <p>
              Students, staff, classes, marks, attendance, fees and notices all live in the same system, so a change made in one place is visible everywhere it matters. A teacher who marks attendance, an exams director who publishes results and an accountant who records a payment are all working on the same, current records.
            </p>
            <p>
              Each person signs in and sees only what their role allows. A school can edit the standard roles or create its own, and decide exactly what each can do.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h3>At a glance</h3>
            <CheckList
              items={[
                "Runs in a web browser; can be installed like an app on a phone or computer",
                "Many schools on one platform, each with its own address, branding, users and data",
                "Role-based dashboards, including for roles a school creates itself",
                "Notifications in the app and by e-mail, shown within seconds",
                "Two-factor authentication, an audit log and encrypted backups",
              ]}
            />
          </Reveal>
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <Reveal className="section-head">
            <h2>What is inside</h2>
          </Reveal>
          <div className="grid cols-3">
            {MODULE_GROUPS.map((m, i) => (
              <Reveal key={m.slug} delay={i * 60}>
                <Link to={`/features/${m.slug}`} className="card" style={{ height: "100%" }}>
                  <div className="icon-badge">
                    <Icon name={m.icon} />
                  </div>
                  <h3>{m.title}</h3>
                  <p>{m.summary}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <h2>What it does not do today</h2>
            <p className="lead">Being clear about limits helps you decide with confidence.</p>
          </Reveal>
          <Reveal>
            <div className="callout info">
              <ul style={{ margin: 0 }}>
                <li>No online payment gateway: fee payments are recorded by your staff.</li>
                <li>No SMS messaging: notifications are in the app and by e-mail.</li>
                <li>No native app in app stores: the web app can be installed from the browser.</li>
                <li>No separate parent login or portal: guardians are recorded and reached by e-mail.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function Features() {
  return (
    <>
      <Seo
        title="Features"
        description="Explore what the NTS School System does: students and admissions, academics and exams, fees and finance, communication, campus operations, and administration and security."
        path="/features"
        jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }])]}
      />
      <PageHero title="Features" lead="Six connected areas. Every capability listed is part of the product today." />
      <section className="section">
        <div className="container grid cols-2">
          {MODULE_GROUPS.map((m, i) => (
            <Reveal key={m.slug} delay={(i % 2) * 90}>
              <div className="card" style={{ height: "100%" }}>
                <div className="icon-badge">
                  <Icon name={m.icon} />
                </div>
                <h2 style={{ fontSize: "1.45rem" }}>
                  <Link to={`/features/${m.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {m.title}
                  </Link>
                </h2>
                <p>{m.summary}</p>
                <ul>
                  {m.capabilities.slice(0, 4).map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <Link className="text-link" to={`/features/${m.slug}`}>
                  Full details <Icon name="arrow" />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function FeatureDetail() {
  const { slug = "" } = useParams();
  const m = MODULE_BY_SLUG[slug];
  if (!m) return <NotFound />;
  const path = `/features/${m.slug}`;
  return (
    <>
      <Seo
        title={m.title}
        description={`${m.summary} ${NAME_SUFFIX}`}
        path={path}
        jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }, { name: m.title, path }])]}
      />
      <PageHero title={m.title} lead={m.summary} />
      <section className="section">
        <div className="container split wide-left">
          <Reveal>
            <h2>What it replaces</h2>
            <p>{m.problem}</p>
            <h2 style={{ marginTop: "2rem" }}>What it does</h2>
            <CheckList items={m.capabilities} />
          </Reveal>
          <Reveal delay={100}>
            <div className="card">
              <h3>The benefit</h3>
              <p>{m.benefit}</p>
              <h3 style={{ marginTop: "1.4rem" }}>Who uses it</h3>
              <ul className="pill-list">
                {m.users.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <Reveal className="section-head">
            <h2>How it works in practice</h2>
          </Reveal>
          <ol className="steps">
            {m.workflow.map((w, i) => (
              <Reveal as="li" key={w} delay={i * 70}>
                {w}
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>Other areas</h2>
          <ul className="pill-list">
            {MODULE_GROUPS.filter((o) => o.slug !== m.slug).map((o) => (
              <li key={o.slug}>
                <Link to={`/features/${o.slug}`}>{o.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function WhoItsFor() {
  return (
    <>
      <Seo
        title="Who it's for"
        description="See the NTS School System through the eyes of administrators, teachers, students, accountants, exams directors, school service staff and platform administrators."
        path="/who-its-for"
        jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Who it's for", path: "/who-its-for" }])]}
      />
      <PageHero title="Who it's for" lead="Everyone gets a view that fits their job — and sees nothing they should not." />
      <section className="section">
        <div className="container" style={{ display: "grid", gap: "1.6rem" }}>
          {ROLES.map((r) => (
            <Reveal key={r.id}>
              <article className="card" id={r.id}>
                <h2 style={{ fontSize: "1.5rem" }}>{r.title}</h2>
                <p className="lead">{r.summary}</p>
                <CheckList items={r.points} />
              </article>
            </Reveal>
          ))}
          <p className="callout info">Guardians (parents) are recorded against students and can be invited to meetings and reached by e-mail. A separate parent login is not part of the product today.</p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function HowItWorks() {
  const steps = [
    ["Talk to us", "Request a demo or contact us. Tell us about your school: its size, what you use today and what you most want to improve."],
    ["See it in action", "We walk you through the parts that matter to you, using the real system."],
    ["Your school is set up", "Your school gets its own address, sign-in page, name, logo and colour on the platform."],
    ["Configure it your way", "Your administrator sets up academic years, terms, classes, subjects and roles, then adds staff and students."],
    ["Start using it", "Teachers take attendance and record marks, accountants issue invoices, students sign in to their own view."],
    ["Keep improving", "Adjust roles and permissions as your needs change. Write to us whenever you need help."],
  ];
  return (
    <>
      <Seo
        title="How it works"
        description="From first conversation to first login: how a school gets started on the NTS School System."
        path="/how-it-works"
        jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "How it works", path: "/how-it-works" }])]}
      />
      <PageHero title="How it works" lead="A simple path from first conversation to first login." />
      <section className="section">
        <div className="container">
          <ol className="steps">
            {steps.map(([t, d], i) => (
              <Reveal as="li" key={t} delay={i * 70}>
                <strong>{t}</strong>
                {d}
              </Reveal>
            ))}
          </ol>
          <p className="callout" style={{ marginTop: "2rem" }}>
            Timelines depend on your school. We will discuss them with you rather than promise a number here.
          </p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function Benefits() {
  const items = [
    ["Less repeated work", "Enter information once and it appears where it is needed: classes, attendance, results, invoices and notices."],
    ["One version of the truth", "Everyone works from the same current records, so there is no arguing over which spreadsheet is right."],
    ["Results with a clear process", "Marks follow a draft, review, approve and publish path, so only final results reach students."],
    ["Messages that reach the right people", "Choose an audience for each announcement or event, and people are told in the app and by e-mail."],
    ["Access that matches the job", "Roles and permissions keep sensitive information with the people who need it."],
    ["A record of what happened", "An audit log of important actions and encrypted backups help a school answer questions and recover."],
  ];
  return (
    <>
      <Seo
        title="Benefits"
        description="How a connected school management system saves time, reduces errors and keeps everyone informed."
        path="/benefits"
        jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Benefits", path: "/benefits" }])]}
      />
      <PageHero title="Benefits" lead="What changes when a school runs on one connected system." />
      <section className="section">
        <div className="container grid cols-3">
          {items.map(([t, d], i) => (
            <Reveal key={t} delay={(i % 3) * 80}>
              <div className="card" style={{ height: "100%" }}>
                <h2 style={{ fontSize: "1.2rem" }}>{t}</h2>
                <p>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="container" style={{ marginTop: "2rem" }}>
          <p className="callout info">These are the outcomes the design aims for. We do not publish percentage savings or customer figures because we have no verified numbers to share.</p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
