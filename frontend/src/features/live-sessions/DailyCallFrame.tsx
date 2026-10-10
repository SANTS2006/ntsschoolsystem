import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { useEffect, useRef } from "react";

/** Mounts Daily.co's prebuilt call UI into a container div. A school name/logo header rendered
 * above this by the page (see LiveSessionRoomPage) satisfies "customized with school info"
 * without needing Daily's paid custom-branding tier — the call UI itself stays their default. */
export function DailyCallFrame({ roomUrl }: { roomUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const call = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: { width: "100%", height: "100%", border: "0" },
      showLeaveButton: true,
    });
    callRef.current = call;
    call.join({ url: roomUrl });

    return () => {
      call.destroy();
      callRef.current = null;
    };
  }, [roomUrl]);

  return <div ref={containerRef} className="h-[70vh] w-full overflow-hidden rounded-[var(--radius-lg)]" />;
}
