import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";
import { SonarLogo } from "../SonarLogo";

export function WelcomeNavbar() {
  const user = useAuthStore(s => s.user);

  // ── Easter egg: logoya 3 kez tıklayınca dönüş yönü tersine döner ──────────────
  const [logoReverse, setLogoReverse] = useState(false);
  const logoClicks = useRef(0);
  const handleLogoClick = () => {
    logoClicks.current += 1;
    if (logoClicks.current % 3 === 0) setLogoReverse(r => !r);
  };

  return (
    <div className="wu-nav-wrap">
      <nav className="wu-nav">
        {/* Logo — döner; 3 tık easter egg'i yönü çevirir */}
        <div
          className="flex items-center shrink-0"
          style={{ position: "relative", zIndex: 1, cursor: "pointer" }}
          onClick={handleLogoClick}
          title="3 kez tıkla 😉"
        >
          <SonarLogo size={30} variant="full" animated reverse={logoReverse} />
        </div>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center" style={{ position: "relative", zIndex: 1 }}>
          {(["Features","How it works","Explore"] as const).map(label => (
            <a
              key={label}
              href={label === "Explore" ? "/explore" : `#${label.toLowerCase().replace(/ /g,"-")}`}
              className="wu-nav-link"
            >
              {label}
            </a>
          ))}
        </div>

        {/* Auth buttons */}
        <div className="flex items-center gap-2 shrink-0" style={{ position: "relative", zIndex: 1 }}>
          {user ? (
            <Link to="/generate" className="wu-cta-btn">
              Dashboard →
            </Link>
          ) : (
            <>
              <Link to="/login" className="wu-signin">
                Sign in
              </Link>
              <Link to="/register" className="wu-cta-btn">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
