import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useFixedTheme } from "../hooks/useFixedTheme";
import { WelcomeStyles } from "../components/welcome/WelcomeStyles";
import { WelcomeNavbar } from "../components/welcome/WelcomeNavbar";
import { WelcomeHero } from "../components/welcome/WelcomeHero";
import { WelcomeStats } from "../components/welcome/WelcomeStats";
import { WelcomeLiveDemo } from "../components/welcome/WelcomeLiveDemo";
import { WelcomeFeatures } from "../components/welcome/WelcomeFeatures";
import { WelcomeHowItWorks } from "../components/welcome/WelcomeHowItWorks";
import { WelcomeProviders } from "../components/welcome/WelcomeProviders";
import { WelcomeFinalCta } from "../components/welcome/WelcomeFinalCta";
import { WelcomeFooter } from "../components/welcome/WelcomeFooter";

export default function WelcomePage() {
  useFixedTheme("cyber-red");

  const user      = useAuthStore(s => s.user);
  const isLoading = useAuthStore(s => s.isLoading);

  // Session doğrulaması bitmeden (isLoading) redirect kararı verme — aksi halde
  // persist edilmiş eski user ile landing yerine dashboard'a, oradan da login'e düşer.
  if (isLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <WelcomeStyles />

      <div lang="en" style={{ background: "var(--bg-page)", color: "var(--text-1)", overflowX: "hidden" }}>
        <WelcomeNavbar />
        <WelcomeHero />
        <WelcomeStats />
        <WelcomeLiveDemo />
        <WelcomeFeatures />
        <WelcomeHowItWorks />
        <WelcomeProviders />
        <WelcomeFinalCta />
        <WelcomeFooter />
      </div>
    </>
  );
}
