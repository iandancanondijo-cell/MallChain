import Hero from "../../components/landing/Hero";
import Stats from "../../components/landing/Stats";
import Features from "../../components/landing/Features";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black">
      <Hero />
      <Stats />
      <Features />
    </div>
  );
}
