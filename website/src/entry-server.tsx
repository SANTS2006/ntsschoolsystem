import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";

import App from "./App";
export { ROUTE_PATHS } from "./routes";
import { HeadCollector, headHtml, type PageMeta } from "./seo";

/** Renders one page to HTML for the build, returning the markup and the <head> tags the page declared. */
export function render(url: string): { html: string; head: string; meta: PageMeta | null } {
  const collector: { meta: PageMeta | null } = { meta: null };
  const html = renderToString(
    <HeadCollector.Provider value={collector}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </HeadCollector.Provider>,
  );
  return { html, head: collector.meta ? headHtml(collector.meta) : "", meta: collector.meta };
}
