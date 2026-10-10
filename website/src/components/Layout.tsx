import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { FOOTER_GROUPS, NAV, SITE } from "@/site";

import { Icon } from "./Icon";

function BrandMark() {
  return (
    <Link to="/" className="brand">
      <img src="/nts-logo-small.png" alt="" width={80} height={40} />
      <span className="brand-text">
        {SITE.product}
        <small>by {SITE.company}</small>
      </span>
    </Link>
  );
}

function FeaturesMenu({ item }: { item: Extract<(typeof NAV)[number], { children: unknown }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <li ref={ref} className={`has-menu${open ? " open" : ""}`}>
      <button type="button" className="nav-link" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {item.label}
        <Icon name="chevron" className="chev" />
      </button>
      <ul className="menu">
        <li>
          <Link to={item.to}>All features</Link>
        </li>
        {item.children.map((c) => (
          <li key={c.to}>
            <Link to={c.to}>{c.label}</Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <BrandMark />
        <nav className="nav" aria-label="Main">
          <ul>
            {NAV.map((item) =>
              "children" in item ? (
                <FeaturesMenu key={item.to} item={item} />
              ) : (
                <li key={item.to}>
                  <NavLink to={item.to} className="nav-link">
                    {item.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>
        <div className="header-cta">
          <a className="btn btn-ghost" href={SITE.appFindSchool}>
            Sign in
          </a>
          <Link className="btn btn-primary" to="/request-demo">
            Request a demo
          </Link>
        </div>
        <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "close" : "menu"} />
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Main">
          <div className="container">
            <ul>
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={"children" in item}>
                    {item.label}
                  </NavLink>
                  {"children" in item && (
                    <ul className="sub">
                      {item.children.map((c) => (
                        <li key={c.to}>
                          <NavLink to={c.to}>{c.label}</NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              <li>
                <NavLink to="/contact">Contact</NavLink>
              </li>
            </ul>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/request-demo">
                Request a demo
              </Link>
              <a className="btn btn-ghost" href={SITE.appFindSchool}>
                Sign in
              </a>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <BrandMark />
            <p>{SITE.tagline} Student records, academics, fees, communication and campus operations for schools of every size.</p>
            <p>
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              <br />
              <a href={SITE.phoneLink}>{SITE.phoneDisplay}</a>
              <br />
              <a href={SITE.whatsappLink} rel="noopener noreferrer" target="_blank">
                WhatsApp us<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </div>
          {FOOTER_GROUPS.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2>{g.title}</h2>
              <ul>
                {g.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {SITE.company}. All rights reserved.
          </span>
          <span>This site sets no cookies and uses no analytics or advertising trackers.</span>
        </div>
      </div>
    </footer>
  );
}

function WhatsAppFloat() {
  const text = encodeURIComponent(`Hello ${SITE.company}, I would like to know more about the ${SITE.product}.`);
  return (
    <a className="whatsapp-float" href={`${SITE.whatsappLink}?text=${text}`} target="_blank" rel="noopener noreferrer">
      <span className="wa-icon">
        <Icon name="whatsapp" />
      </span>
      <span className="wa-label">Chat on WhatsApp</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setShow(window.scrollY > 700);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <>
      <button
        type="button"
        className={`back-to-top${show ? " show" : ""}`}
        aria-label="Back to top"
        tabIndex={show ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      >
        <Icon name="arrow" />
      </button>
    </>
  );
}

/** Moves focus to the page heading after a client-side navigation so keyboard and screen-reader users land at the top
 * of the new page, and returns the scroll position to the top. */
function RouteAnnouncer() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    const main = document.getElementById("main");
    main?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header />
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        {children}
      </main>
      <Footer />
      <BackToTop />
      <WhatsAppFloat />
      <RouteAnnouncer />
    </>
  );
}
