import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { SITE } from "@/site";

type Kind = "demo" | "contact";
type Errors = Record<string, string>;

const SCHOOL_TYPES = [
  ["nursery_primary", "Nursery / primary"],
  ["secondary", "Secondary"],
  ["tertiary", "College / university"],
  ["vocational", "Vocational / training"],
  ["group", "Group of schools"],
  ["other", "Other"],
] as const;

const INTERESTS = [
  ["students", "Student records"],
  ["admissions", "Admissions"],
  ["academics", "Academics & timetables"],
  ["attendance", "Attendance"],
  ["exams", "Exams & results"],
  ["finance", "Fees & finance"],
  ["communication", "Communication"],
  ["library_hostel_transport", "Library, hostel & transport"],
  ["reports", "Reports"],
  ["administration", "Roles & administration"],
] as const;

const TOPICS = [
  ["general", "General question"],
  ["pricing", "Pricing"],
  ["support", "Support"],
  ["partnership", "Partnership"],
  ["other", "Something else"],
] as const;

const CONTACTS = [
  ["email", "E-mail"],
  ["phone", "Phone call"],
  ["whatsapp", "WhatsApp"],
] as const;

const ENDPOINT = "/api/v1/public/enquiries/";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <div className="error" id={id}>
      {message}
    </div>
  ) : null;
}

export function EnquiryForm({ kind }: { kind: Kind }) {
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [reference, setReference] = useState("");
  const [failMessage, setFailMessage] = useState("");
  const summary = useRef<HTMLDivElement>(null);
  const isDemo = kind === "demo";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "").trim();
    const payload = {
      kind,
      name: text("name"),
      email: text("email"),
      phone: text("phone"),
      organization: text("organization"),
      school_type: text("school_type"),
      student_count: text("student_count"),
      interests: data.getAll("interests").map(String),
      preferred_contact: text("preferred_contact"),
      topic: text("topic"),
      message: text("message"),
      consent: data.get("consent") === "on",
      website: text("website"),
    };

    // The same rules the server applies, so people hear about mistakes straight away.
    const local: Errors = {};
    if (payload.name.length < 2) local.name = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) local.email = "Enter an e-mail address we can reply to.";
    if (isDemo && !payload.organization) local.organization = "Tell us the name of your school or organisation.";
    if (!isDemo && payload.message.length < 10) local.message = "Please tell us a little more (at least a sentence).";
    if (payload.phone && !/^[0-9+()\-. ]+$/.test(payload.phone)) local.phone = "Use digits, spaces and + only.";
    if (!payload.consent) local.consent = "Please agree to the privacy notice so we can reply to you.";
    setErrors(local);
    if (Object.keys(local).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }

    setStatus("sending");
    setFailMessage("");
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setReference(body.reference ?? "");
        setStatus("done");
        form.reset();
        requestAnimationFrame(() => summary.current?.focus());
        return;
      }
      if (res.status === 429) {
        setFailMessage(`You have sent several messages in a short time. Please try again later, or write to ${SITE.email}.`);
      } else if (res.status === 400 && Array.isArray(body.errors)) {
        const server: Errors = {};
        for (const err of body.errors) if (err.field && err.field !== "non_field_errors") server[err.field] = String(err.message ?? err.detail ?? "Please check this field.");
        setErrors(server);
        setFailMessage("Please check the highlighted fields and send again.");
      } else {
        setFailMessage(`We could not send your message just now. Please try again, or write to ${SITE.email} or call ${SITE.phoneDisplay}.`);
      }
      setStatus("failed");
      requestAnimationFrame(() => summary.current?.focus());
    } catch {
      setFailMessage(`We could not reach the server. Check your connection and try again, or write to ${SITE.email} or call ${SITE.phoneDisplay}.`);
      setStatus("failed");
      requestAnimationFrame(() => summary.current?.focus());
    }
  }

  if (status === "done") {
    return (
      <div className="form-status ok" role="status" tabIndex={-1} ref={summary}>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>Thank you — your {isDemo ? "demo request" : "message"} has been received.</p>
        <p style={{ marginBottom: 6 }}>
          A member of the {SITE.company} team will reply to the e-mail address you gave. {reference && <>Your reference is <strong>{reference}</strong>.</>}
        </p>
        <p style={{ marginBottom: 0 }}>
          Need us sooner? <a href={SITE.phoneLink}>Call {SITE.phoneDisplay}</a> or <a href={SITE.whatsappLink}>message us on WhatsApp</a>.
        </p>
      </div>
    );
  }

  const err = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `err-${k}` } : {});

  return (
    <form className="form" onSubmit={onSubmit} noValidate aria-label={isDemo ? "Request a demo" : "Contact us"}>
      {status === "failed" && (
        <div className="form-status bad" role="alert" tabIndex={-1} ref={summary}>
          {failMessage}
        </div>
      )}
      <div className="form-row two">
        <div className="field">
          <label htmlFor={`${kind}-name`}>Full name</label>
          <input id={`${kind}-name`} name="name" type="text" autoComplete="name" placeholder="Enter your full name" required {...err("name")} />
          <FieldError id="err-name" message={errors.name} />
        </div>
        <div className="field">
          <label htmlFor={`${kind}-email`}>E-mail</label>
          <input id={`${kind}-email`} name="email" type="email" autoComplete="email" placeholder="Enter your email" required {...err("email")} />
          <FieldError id="err-email" message={errors.email} />
        </div>
      </div>
      <div className="form-row two">
        <div className="field">
          <label htmlFor={`${kind}-phone`}>Phone / WhatsApp (optional)</label>
          <input id={`${kind}-phone`} name="phone" type="tel" autoComplete="tel" placeholder="Enter your phone number" {...err("phone")} />
          <FieldError id="err-phone" message={errors.phone} />
        </div>
        {isDemo ? (
          <div className="field">
            <label htmlFor="demo-org">School or organisation</label>
            <input id="demo-org" name="organization" type="text" autoComplete="organization" placeholder="Enter your school or organisation name" required {...err("organization")} />
            <FieldError id="err-organization" message={errors.organization} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="contact-topic">Topic</label>
            <select id="contact-topic" name="topic" defaultValue="general">
              {TOPICS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {isDemo && (
        <>
          <div className="form-row two">
            <div className="field">
              <label htmlFor="demo-type">Type of school</label>
              <select id="demo-type" name="school_type" defaultValue="">
                <option value="">Select your type of school</option>
                {SCHOOL_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="demo-count">Approximate number of students</label>
              <input id="demo-count" name="student_count" type="text" inputMode="numeric" maxLength={40} placeholder="e.g. 450" />
            </div>
          </div>
          <fieldset className="field">
            <legend>What are you most interested in? (optional)</legend>
            <div className="checks">
              {INTERESTS.map(([v, l]) => (
                <label key={v} className="check">
                  <input type="checkbox" name="interests" value={v} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="demo-contact">How should we reach you?</label>
            <select id="demo-contact" name="preferred_contact" defaultValue="email">
              {CONTACTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor={`${kind}-message`}>{isDemo ? "Anything we should know? (optional)" : "Your message"}</label>
        <textarea id={`${kind}-message`} name="message" maxLength={4000} required={!isDemo} placeholder={isDemo ? "Type any questions or details you would like us to know" : "Type your message"} {...err("message")} />
        <FieldError id="err-message" message={errors.message} />
      </div>
      {/* Honeypot: hidden from people, often filled by bots. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor={`${kind}-website`}>Leave this field empty</label>
        <input id={`${kind}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="field">
        <label className="check" htmlFor={`${kind}-consent`}>
          <input id={`${kind}-consent`} name="consent" type="checkbox" {...err("consent")} />
          <span>
            I agree that {SITE.company} may use these details to reply to me, as described in the <Link to="/legal/privacy">privacy policy</Link>.
          </span>
        </label>
        <FieldError id="err-consent" message={errors.consent} />
      </div>
      <div>
        <button className="btn btn-blue" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : isDemo ? "Request my demo" : "Send message"}
        </button>
      </div>
      <p className="hint" style={{ margin: 0, fontSize: ".85rem", color: "var(--muted)" }}>
        We store your message so the team can answer it, and e-mail it to {SITE.email}. We do not share it for marketing.
      </p>
    </form>
  );
}
