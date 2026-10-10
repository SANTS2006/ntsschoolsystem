import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";


import { MODULE_GROUPS } from "@/content/modules";

import { HeroArt, artForPath } from "./HeroArt";
import { Icon } from "./Icon";

/** Fades content in as it scrolls into view. Content already on screen, and everyone who prefers reduced motion, sees it
 * straight away; with scripts off nothing is ever hidden. */
export function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: { children: ReactNode; delay?: number; as?: "div" | "li" | "section"; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "hide" | "show">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState("hide");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("show");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const props = { ref: ref as never, className: `reveal ${className}`.trim(), "data-r": state === "idle" ? undefined : state, style: delay ? ({ "--d": `${delay}ms` } as React.CSSProperties) : undefined };
  return <Tag {...props}>{children}</Tag>;
}

export function PageHero({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="page-hero">
      <div className="container page-hero-inner">
        <div>
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
          {children}
        </div>
        <div className="page-hero-art">
          <HeroArt kind={artForPath(pathname)} />
        </div>
      </div>
    </div>
  );
}

export function CtaBand({ title = "See it with your own school in mind", text = "Tell us about your school and we will arrange a walk-through of the parts that matter to you." }: { title?: string; text?: string }) {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <div className="cta-band">
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/request-demo">
                Request a demo
              </Link>
              <Link className="btn btn-ghost" to="/contact">
                Talk to us
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="check-list">
      {items.map((t) => (
        <li key={t}>
          <Icon name="check" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export interface FaqItem {
  q: string;
  a: string;
}

export function Faq({ items }: { items: FaqItem[] }) {
  const base = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="faq">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div className="faq-item" key={it.q}>
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={`${base}-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                {it.q}
                <Icon name="chevron" />
              </button>
            </h3>
            <div id={`${base}-${i}`} role="region" aria-label={it.q} className="faq-answer" hidden={!isOpen}>
              <p>{it.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Tabbed explorer of the six feature areas, with arrow-key navigation. */
export function ModuleExplorer() {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const current = MODULE_GROUPS[index];

  const onKey = (e: React.KeyboardEvent) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % MODULE_GROUPS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + MODULE_GROUPS.length) % MODULE_GROUPS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = MODULE_GROUPS.length - 1;
    else return;
    e.preventDefault();
    setIndex(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="explorer">
      <div className="explorer-tabs" role="tablist" aria-label="Feature areas" onKeyDown={onKey}>
        {MODULE_GROUPS.map((m, i) => (
          <button
            key={m.slug}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-t${i}`}
            aria-selected={i === index}
            aria-controls={`${base}-p`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setIndex(i)}
          >
            {m.title}
          </button>
        ))}
      </div>
      <div className="explorer-panel" role="tabpanel" id={`${base}-p`} aria-labelledby={`${base}-t${index}`}>
        <div>
          <div className="icon-badge">
            <Icon name={current.icon} />
          </div>
          <h3>{current.title}</h3>
          <p>{current.summary}</p>
          <p style={{ color: "#c3cee2" }}>{current.benefit}</p>
          <Link className="text-link" to={`/features/${current.slug}`} style={{ color: "var(--amber)" }}>
            Explore {current.title} <Icon name="arrow" />
          </Link>
        </div>
        <ul className="check-list">
          {current.capabilities.slice(0, 5).map((c) => (
            <li key={c}>
              <Icon name="check" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
