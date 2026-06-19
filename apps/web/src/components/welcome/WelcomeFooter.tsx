import { Link } from "react-router-dom";
import { SonarLogo } from "../SonarLogo";

export function WelcomeFooter() {
  return (
    <footer style={{ borderTop: "1px solid color-mix(in srgb, var(--text-3) 8%, transparent)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
        {/* Logo */}
        <div className="flex items-center">
          <SonarLogo size={26} variant="full" />
        </div>

        <p className="text-[11px] text-center" style={{ color: "var(--text-3)" }}>
          © 2026 Sonaralabs. Built for game developers.
        </p>

        {/* Links */}
        <div className="flex items-center gap-6">
          <Link
            to="/explore"
            className="text-[11px] font-semibold tracking-widest uppercase transition-colors"
            style={{ color: "var(--text-3)", textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            Explore
          </Link>
          <a
            href="mailto:yunuseaslan427@gmail.com"
            className="text-[11px] font-semibold tracking-widest uppercase transition-colors"
            style={{ color: "var(--text-3)", textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
