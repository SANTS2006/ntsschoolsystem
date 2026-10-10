import { Link } from "react-router-dom";

import { Icon } from "@/components/Icon";
import { HeroScene } from "@/components/HeroScene";
import { CtaBand, Faq, ModuleExplorer, Reveal } from "@/components/Bits";
import { FAQ } from "@/content/faq";
import { MODULE_GROUPS, ROLES } from "@/content/modules";
import { Seo, faqLd, organizationLd, softwareLd } from "@/seo";

const PROBLEMS = [
  { t: "Records everywhere", d: "Student details in registers, marks in spreadsheets, fees in another book. Nobody sees the whole picture." },
  { t: "Slow, repeated work", d: "Marks are totalled by hand, timetables redrawn each term, notices copied out class by class." },
  { t: "Hard to trust the numbers", d: "When data lives in many places, it is hard to say who has paid, who attended or which results are final." },
];

const SPOTLIGHT = [
  { icon: "users", t: "Built for every role", d: "Principals, teachers, accountants, exams staff and students each get a dashboard made for their job." },
  { icon: "building", t: "Many schools, kept separate", d: "Each school has its own address, branding, users and data on one platform." },
  { icon: "megaphone", t: "The right message, to the right people", d: "Target announcements and events by class, section, department or individual, and notify people in the app and by e-mail." },
  { icon: "exams", t: "Results with a proper workflow", d: "Marks move from draft to approved to published, so only final results reach students." },
] as const;

export default function Home() {
  return (
    <>
      <Seo
        title="School management system for schools of every size"
        description="NTS School System brings student records, admissions, academics, attendance, exams, fees, communication and campus operations into one platform. Request a demo."
        path="/"
        jsonLd={[organizationLd(), softwareLd(), faqLd(FAQ.slice(0, 8))]}
      />
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <p className="eyebrow">School management, made simple</p>
            <h1>
              One platform for <em>the whole school.</em>
            </h1>
            <p className="lead">
              Student records, admissions, academics, attendance, exams, fees, communication and campus services — in one place, with the right access for every person in your school.
            </p>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/request-demo">
                Request a demo <Icon name="arrow" className="" />
              </Link>
              <Link className="btn btn-ghost" to="/features">
                Explore features
              </Link>
            </div>
            <ul className="hero-points">
              <li>
                <Icon name="check" /> Runs in any browser
              </li>
              <li>
                <Icon name="check" /> Role-based access
              </li>
              <li>
                <Icon name="check" /> Each school kept separate
              </li>
            </ul>
          </div>
          <HeroScene />
        </div>
      </section>

      <section className="glance" aria-label="Main areas">
        <div className="container">
          <div className="glance-grid">
            {MODULE_GROUPS.slice(0, 4).map((m) => (
              <Link key={m.slug} to={`/features/${m.slug}`} className="glance-item">
                <span className="icon-badge">
                  <Icon name={m.icon} />
                </span>
                <span>
                  <strong>{m.title}</strong>
                  <span>Learn more</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">The problem</p>
            <h2>Running a school should not mean chasing paper.</h2>
            <p className="lead">Schools run on information. When it is scattered, everyone loses time.</p>
          </Reveal>
          <div className="grid cols-3">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.t} delay={i * 90}>
                <div className="card" style={{ height: "100%" }}>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark" aria-labelledby="explore-h">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">What it covers</p>
            <h2 id="explore-h">Six areas, one connected system.</h2>
            <p className="lead">Choose an area to see what it does today. Everything listed exists in the product.</p>
          </Reveal>
          <ModuleExplorer />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Why schools choose it</p>
            <h2>Designed around how a school actually works.</h2>
          </Reveal>
          <div className="grid cols-2">
            {SPOTLIGHT.map((s, i) => (
              <Reveal key={s.t} delay={i * 80}>
                <div className="card" style={{ height: "100%" }}>
                  <div className="icon-badge">
                    <Icon name={s.icon} />
                  </div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Who it is for</p>
            <h2>A clear view for every person.</h2>
          </Reveal>
          <div className="grid cols-3">
            {ROLES.slice(0, 3).map((r, i) => (
              <Reveal key={r.id} delay={i * 90}>
                <Link to={`/who-its-for#${r.id}`} className="card" style={{ height: "100%" }}>
                  <h3>{r.title}</h3>
                  <p>{r.summary}</p>
                  <span className="text-link">
                    See the view <Icon name="arrow" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
          <p style={{ marginTop: "1.6rem" }}>
            <Link className="text-link" to="/who-its-for">
              All roles <Icon name="arrow" />
            </Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <Reveal>
            <p className="eyebrow">Getting started</p>
            <h2>From first call to first login.</h2>
            <p className="lead">We show you the system, set up your school, and you configure it your way.</p>
            <Link className="btn btn-blue" to="/how-it-works">
              See how it works
            </Link>
          </Reveal>
          <Reveal delay={120}>
            <ol className="steps">
              <li>
                <strong>Talk to us</strong>Tell us about your school.
              </li>
              <li>
                <strong>See a demo</strong>We walk through what matters to you.
              </li>
              <li>
                <strong>Set up</strong>Your school gets its own address and branding.
              </li>
              <li>
                <strong>Go live</strong>Staff and students sign in.
              </li>
            </ol>
          </Reveal>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <Reveal className="section-head">
            <p className="eyebrow">Questions</p>
            <h2>Straight answers.</h2>
            <p className="lead">We say plainly what the system does and does not do.</p>
          </Reveal>
          <Faq items={FAQ.slice(0, 6)} />
          <p style={{ marginTop: "1.5rem" }}>
            <Link className="text-link" to="/faq">
              More questions <Icon name="arrow" />
            </Link>
          </p>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
