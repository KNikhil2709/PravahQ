import { useEffect, useRef } from "react";

// Verbatim from Round 1 (pages/Dashboard.tsx): traffic particles moving along a city grid.
// Only change: honours prefers-reduced-motion by drawing a single static frame.
export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    const GRID = 80;

    interface Particle {
      x: number; y: number;
      vx: number; vy: number;
      life: number; maxLife: number;
      hue: number;
      trail: { x: number; y: number }[];
    }

    const snap = (v: number) => Math.round(v / GRID) * GRID;

    const mkParticle = (): Particle => {
      const ang = Math.floor(Math.random() * 4) * (Math.PI / 2);
      const spd = 0.5 + Math.random() * 0.7;
      return {
        x: snap(Math.random() * W),
        y: snap(Math.random() * H),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: Math.random() * 180,
        maxLife: 160 + Math.random() * 220,
        hue: 255 + Math.random() * 65, // purple → pink
        trail: [],
      };
    };

    const particles: Particle[] = Array.from({ length: 65 }, mkParticle);

    let animId: number;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // ── Grid lines (road network) ──
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(124,58,237,0.045)";
      for (let x = 0; x <= W; x += GRID) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y <= H; y += GRID) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // ── Intersection nodes ──
      for (let x = 0; x <= W; x += GRID) {
        for (let y = 0; y <= H; y += GRID) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(157,95,245,0.14)";
          ctx.fill();
        }
      }

      // ── Particles ──
      for (const p of particles) {
        p.life++;

        // Turn at intersections
        const sx = snap(p.x), sy = snap(p.y);
        if (Math.abs(p.x - sx) < 1.8 && Math.abs(p.y - sy) < 1.8 && Math.random() < 0.07) {
          const ang = Math.floor(Math.random() * 4) * (Math.PI / 2);
          const spd = Math.hypot(p.vx, p.vy);
          p.vx = Math.cos(ang) * spd;
          p.vy = Math.sin(ang) * spd;
          p.x = sx; p.y = sy;
        }

        p.x += p.vx; p.y += p.vy;

        // Wrap
        if (p.x < -GRID) p.x = W + GRID;
        if (p.x > W + GRID) p.x = -GRID;
        if (p.y < -GRID) p.y = H + GRID;
        if (p.y > H + GRID) p.y = -GRID;

        // Store trail
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 10) p.trail.shift();

        if (p.life >= p.maxLife) {
          Object.assign(p, mkParticle());
        }

        const alpha = Math.sin((p.life / p.maxLife) * Math.PI);

        // Trail
        p.trail.forEach((pt, i) => {
          const ta = (i / p.trail.length) * alpha * 0.35;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue},75%,65%,${ta})`;
          ctx.fill();
        });

        // Head glow
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
        grd.addColorStop(0, `hsla(${p.hue},80%,70%,${alpha * 0.22})`);
        grd.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Head dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + alpha, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},80%,72%,${alpha * 0.85})`;
        ctx.fill();
      }

      if (!still) animId = requestAnimationFrame(draw);
    }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    draw();

    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}
