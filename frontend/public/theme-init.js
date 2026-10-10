// Applied before any stylesheet loads, so a stored light/dark choice paints correctly on the very
// first frame instead of flashing the OS-default theme first. Lives in its own file (not inline in
// index.html) so the production Content-Security-Policy can forbid inline scripts entirely.
(function () {
  try {
    var stored = localStorage.getItem("nts-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch {
    /* localStorage unavailable (private mode, disabled storage) — falls back to OS theme */
  }
})();
