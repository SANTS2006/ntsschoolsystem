/** Renders a DOM node to a canvas using the browser's own renderer (html-to-image), so every CSS feature the
 * app uses — color-mix(), oklch(), gradients, variables — comes out exactly as on screen. The page is
 * forced to its light theme for the capture (a dark-mode viewer would otherwise get a dark PDF) and put
 * back immediately afterwards. Anything marked `data-print-hidden` (buttons etc.) is left out. */
export async function captureNode(
  node: HTMLElement,
  options: { scale?: number; skipImages?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import("html-to-image");
  const root = document.documentElement;
  const previousTheme = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");
  const render = (skipFonts: boolean) =>
    toCanvas(node, {
      pixelRatio: options.scale ?? 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      skipFonts,
      filter: (child) => {
        if (!(child instanceof HTMLElement)) return true;
        if (child.hasAttribute("data-print-hidden")) return false;
        return !(options.skipImages && child.tagName === "IMG");
      },
    });
  const withTimeout = <T>(work: Promise<T>) =>
    Promise.race([
      work,
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Rendering took too long.")), 25000)),
    ]);
  try {
    // Embedding the web fonts is what makes the text match the screen; if that step fails or stalls,
    // render once more with the system font rather than giving up.
    try {
      return await withTimeout(render(false));
    } catch {
      return await withTimeout(render(true));
    }
  } finally {
    if (previousTheme === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", previousTheme);
  }
}
