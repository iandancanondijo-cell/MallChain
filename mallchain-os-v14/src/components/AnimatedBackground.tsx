/**
 * AnimatedBackground — slow-moving particles and gradient orbs that float
 * beneath the entire application. Uses CSS animations for performance, with
 * multiple layered elements creating depth and movement.
 *
 * The particles are intentionally slow and subtle to avoid distraction while
 * adding visual interest and a sense of life to the interface.
 */
import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

export default function AnimatedBackground() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Generate particles on mount
    const count = 30;
    const generated: Particle[] = [];
    for (let i = 0; i < count; i++) {
      generated.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        duration: Math.random() * 40 + 60, // 60-100 seconds
        delay: Math.random() * -60, // negative delay for staggered start
        opacity: Math.random() * 0.3 + 0.1,
      });
    }
    setParticles(generated);
  }, []);

  return (
    <div className="animated-bg" aria-hidden="true">
      {/* Gradient orbs — large, slow-moving color blobs */}
      <div className="animated-bg__orb animated-bg__orb--1" />
      <div className="animated-bg__orb animated-bg__orb--2" />
      <div className="animated-bg__orb animated-bg__orb--3" />

      {/* Particles — small floating dots */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="animated-bg__particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            opacity: p.opacity,
          }}
        />
      ))}

      {/* Mesh gradient overlay */}
      <div className="animated-bg__mesh" />
    </div>
  );
}
