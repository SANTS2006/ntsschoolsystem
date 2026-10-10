import { SITE } from "@/site";

import { Icon } from "./Icon";

/** "Other ways to reach us": three large, clearly clickable rows. */
export function ContactAside({ title = "Other ways to reach us" }: { title?: string }) {
  return (
    <aside className="card contact-aside" aria-labelledby="reach-us">
      <div>
        <h2 id="reach-us">{title}</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: ".93rem" }}>Prefer to talk? Choose whichever is easiest for you.</p>
      </div>
      <a className="contact-item" href={`mailto:${SITE.email}`}>
        <span className="ci-icon">
          <Icon name="mail" />
        </span>
        <span>
          <small>E-mail</small>
          <span className="ci-value">{SITE.email}</span>
        </span>
      </a>
      <a className="contact-item" href={SITE.phoneLink}>
        <span className="ci-icon">
          <Icon name="phone" />
        </span>
        <span>
          <small>Phone</small>
          <span className="ci-value">{SITE.phoneDisplay}</span>
        </span>
      </a>
      <a className="contact-item wa" href={SITE.whatsappLink} target="_blank" rel="noopener noreferrer">
        <span className="ci-icon">
          <Icon name="whatsapp" />
        </span>
        <span>
          <small>WhatsApp</small>
          <span className="ci-value">Start a chat<span className="sr-only"> (opens in a new tab)</span></span>
        </span>
      </a>
    </aside>
  );
}
