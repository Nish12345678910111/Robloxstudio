import { useEffect, useRef } from "react";
import "./HilltopAd.css";

const HILLTOP_ZONE_7656109 = "https://juvenilechoice.com/bzXoVXs.dAGcld0nYvWpce/Wenmh9/u/Z/UEl/kcPDTnc/2MNSTBYqxCM/DSkgtNNWznYv1GN/jME_xfMYwa";

export default function HilltopAd() {
  const slotRef = useRef(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    // Equivalent to HilltopAds' Zone 7656109 loader, mounted only in the
    // Cloudflare login/signup and dashboard views.
    const script = document.createElement("script");
    script.settings = {};
    script.src = HILLTOP_ZONE_7656109;
    script.async = true;
    script.referrerPolicy = "no-referrer-when-downgrade";
    slot.appendChild(script);

    return () => script.remove();
  }, []);

  return (
    <aside className="hilltopAd" aria-label="Advertisement">
      <span className="hilltopAdLabel">Advertisement</span>
      <div className="hilltopAdContent" ref={slotRef} />
    </aside>
  );
}
