import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; r: number; vx: number; vy: number; a: number };

export default function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1,
      W = 0,
      H = 0,
      raf = 0;
    let dots: Dot[] = [];

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = window.innerWidth * dpr;
      H = canvas.height = window.innerHeight * dpr;
      const n = Math.min(90, Math.floor((window.innerWidth * window.innerHeight) / 16000));
      dots = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: (Math.random() * 1.6 + 0.6) * dpr,
        vx: (Math.random() - 0.5) * 0.22 * dpr,
        vy: (Math.random() - 0.5) * 0.22 * dpr,
        a: Math.random() * 0.3 + 0.25,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const L = 120 * dpr;

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];

        if (!reduce) {
          d.x += d.vx;
          d.y += d.vy;
          if (d.x < 0 || d.x > W) d.vx *= -1;
          if (d.y < 0 || d.y > H) d.vy *= -1;
        }

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,166,186,${d.a})`;
        ctx.fill();

        for (let j = i + 1; j < dots.length; j++) {
          const dx = d.x - dots[j].x,
            dy = d.y - dots[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < L) {
            ctx.strokeStyle = `rgba(160,166,186,${0.12 * (1 - dist / L)})`;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.stroke();
          }
        }
      }

      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const onResize = () => {
      size();
      if (reduce) draw();
    };

    window.addEventListener("resize", onResize);
    size();
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="auth-dust" aria-hidden="true" />;
}
