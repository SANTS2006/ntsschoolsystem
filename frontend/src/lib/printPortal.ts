/** Printing a page section on its own.
 *
 * The app shell (sidebar, header, scrolling panes) must not end up on paper, and a tall section inside a
 * scrolling pane would be cut off at one screen. So the section is copied into a plain block directly on
 * <body>, the rest of the app is hidden for printing (see `.print-portal` in index.css), the browser's print
 * dialog is opened, and the copy is removed again afterwards. */
export function printNode(node: HTMLElement): void {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-print-hidden]").forEach((el) => el.remove());
  const wrapper = document.createElement("div");
  wrapper.className = "print-clone";
  wrapper.setAttribute("data-printable-root", "");
  wrapper.appendChild(copy);
  document.body.appendChild(wrapper);
  runPrint(() => wrapper.remove());
}

/** Print with the app hidden but without copying anything — for pages that already render their own
 * print-only block (the ID card sheet). */
export function printWithPortal(): void {
  runPrint(() => undefined);
}

function runPrint(cleanup: () => void): void {
  document.body.classList.add("print-portal");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener("afterprint", finish);
    document.body.classList.remove("print-portal");
    cleanup();
  };
  window.addEventListener("afterprint", finish);
  // Some mobile browsers never report the dialog closing; don't leave the page hidden.
  window.setTimeout(finish, 5 * 60 * 1000);
  // Give the copy a frame to lay out (images included) before the dialog snapshots the page.
  window.requestAnimationFrame(() => window.setTimeout(() => window.print(), 50));
}
