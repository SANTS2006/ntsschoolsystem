import { useEffect, useRef } from "react";

/** A decorative CSS 3D stack of four layers (records, results, fees, notices). It tilts a little with the pointer on
 * devices that have one, and is static for people who prefer reduced motion. It carries no information, so assistive
 * technology skips it; the labels are illustrative and show no real data. */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) / r.width;
        const y = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.setProperty("--rx", String(Math.max(-1, Math.min(1, x)) * 12));
        el.style.setProperty("--ry", String(Math.max(-1, Math.min(1, y)) * -8));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="scene" ref={ref} aria-hidden="true">
      <div className="scene-stage">
        <div className="scene-layer l1">
          <span className="tag">Students</span>
          <div className="dot-row">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="lines">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="scene-layer l2">
          <span className="tag">Attendance</span>
          <div className="bars">
            <i style={{ height: "70%" }} />
            <i style={{ height: "90%" }} />
            <i style={{ height: "60%" }} />
            <i style={{ height: "80%" }} />
            <i style={{ height: "95%" }} />
          </div>
        </div>
        <div className="scene-layer l3">
          <span className="tag">Fees</span>
          <div className="lines">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="scene-layer l4">
          <span className="tag">Results</span>
          <div className="bars">
            <i style={{ height: "55%" }} />
            <i style={{ height: "85%" }} />
            <i style={{ height: "70%" }} />
            <i style={{ height: "100%" }} />
          </div>
        </div>
      </div>
      <span className="scene-orb o1" />
      <span className="scene-orb o2" />
      <span className="scene-orb o3" />
      <div className="scene-note">Illustration</div>
    </div>
  );
}
