import { useEffect, useRef, useState } from "react";

/** How long with no mouse/keyboard/touch/scroll activity before the warning appears. */
const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** How long the warning stays up before the session is actually ended. */
const WARNING_MS = 60 * 1000;

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"] as const;

/**
 * Ends the session after a stretch of inactivity — the backstop for shared school computers, where
 * the next person to sit down must not inherit the previous user's open session. The heartbeat and
 * silent token refresh would otherwise keep an abandoned tab signed in forever.
 *
 * Activity in ANY tab counts: it's broadcast through localStorage, so a user working in one tab
 * isn't logged out because a second tab sat untouched.
 *
 * Returns `secondsLeft` (non-null only while the warning is showing) and `stayActive()`.
 */
export function useIdleLogout(enabled: boolean, onIdle: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(0); // set to "now" when the effect starts (never during render)
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  });

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();

    const markActive = () => {
      // While the warning is showing only an explicit "Stay signed in" click may dismiss it.
      if (Date.now() - lastActivity.current < IDLE_LIMIT_MS) {
        lastActivity.current = Date.now();
        try {
          localStorage.setItem("nts-last-activity", String(lastActivity.current));
        } catch {
          /* storage unavailable — this tab still tracks its own activity */
        }
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "nts-last-activity" && event.newValue) {
        lastActivity.current = Math.max(lastActivity.current, Number(event.newValue));
      }
    };

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
    window.addEventListener("storage", onStorage);

    const timer = window.setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= IDLE_LIMIT_MS + WARNING_MS) {
        window.clearInterval(timer);
        onIdleRef.current();
      } else if (idleFor >= IDLE_LIMIT_MS) {
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_LIMIT_MS + WARNING_MS - idleFor) / 1000)));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive));
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [enabled]);

  const stayActive = () => {
    lastActivity.current = Date.now();
    setSecondsLeft(null);
    try {
      localStorage.setItem("nts-last-activity", String(lastActivity.current));
    } catch {
      /* see above */
    }
  };

  return { secondsLeft, stayActive };
}
