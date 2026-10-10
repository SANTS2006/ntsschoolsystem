import { Link } from "react-router-dom";

import { Seo } from "@/seo";

export default function NotFound() {
  return (
    <>
      <Seo title="Page not found" description="This page does not exist." path="/404" noindex />
      <section className="section">
        <div className="container prose">
          <p className="eyebrow">404</p>
          <h1>We could not find that page.</h1>
          <p className="lead">The link may be old or mistyped. Try one of these instead.</p>
          <div className="btn-row">
            <Link className="btn btn-blue" to="/">
              Home
            </Link>
            <Link className="btn btn-ghost" to="/features">
              Features
            </Link>
            <Link className="btn btn-ghost" to="/contact">
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
