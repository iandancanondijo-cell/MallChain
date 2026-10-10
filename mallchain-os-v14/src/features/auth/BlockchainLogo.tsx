import { useRef, useEffect } from 'react';
import { config } from '../../services/config';

const API_URL = `${config.apiBaseUrl}/api/explorer`;
const POLL_MS = 3000;
const SYMBOL = 'MLCNS';

export default function BlockchainLogo() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    const NS = 'http://www.w3.org/2000/svg';
    const C: [number, number] = [400, 380];

    const ring = (rx: number, ry: number, a0: number) =>
      [0, 1, 2, 3, 4, 5].map((i) => {
        const a = ((a0 + 60 * i) * Math.PI) / 180;
        return [Math.round(400 + rx * Math.cos(a)), Math.round(380 + ry * Math.sin(a))] as [number, number];
      });

    const R1 = ring(170, 140, 0);
    const R2 = ring(300, 250, 30);
    const nodes: [number, number][] = [C, ...R1, ...R2];
    const links: [number, number, number, number][] = [];
    R1.forEach((p) => links.push([C[0], C[1], p[0], p[1]]));
    R1.forEach((p, i) => links.push([p[0], p[1], R1[(i + 1) % 6][0], R1[(i + 1) % 6][1]]));
    R2.forEach((p, i) => {
      links.push([p[0], p[1], R1[i][0], R1[i][1]]);
      links.push([p[0], p[1], R1[(i + 1) % 6][0], R1[(i + 1) % 6][1]]);
    });

    let cubes = '';
    let labels = '';
    nodes.forEach((p, i) => {
      if (i === 0) return;
      const sc = i < 7 ? 0.36 : 0.3;
      const d = ((i * 1.37) % 7).toFixed(2);
      const r = sc * 100;
      cubes += `<use href="#cube-bl" transform="translate(${p[0]},${p[1]}) scale(${sc})" style="--d:${d}s"/>`;
      labels += `<g class="bl-d1"><text class="bl-lb" id="bla${i}" x="${p[0]}" y="${p[1] + r + 7}" text-anchor="middle"></text><text class="bl-lb bl-sm" id="blb${i}" x="${p[0]}" y="${p[1] + r + 12.5}" text-anchor="middle"></text></g>`;
    });
    labels += `<g class="bl-d1"><text class="bl-lb" id="bla0" x="400" y="288" text-anchor="middle"></text><text class="bl-lb bl-sm" id="blb0" x="400" y="293" text-anchor="middle"></text></g>`;

    const minis = [
      [700, 380], [100, 380], [255, 610], [545, 610],
      [255, 150], [545, 150], [400, 255], [400, 505],
    ]
      .map(
        (p, i) =>
          `<use class="bl-s" href="#mini-bl" transform="translate(${p[0]},${p[1]}) scale(.09)" style="--d:${(i * 0.8).toFixed(1)}s"/>`
      )
      .join('');

    svg.innerHTML = `
<defs>
<linearGradient id="gold-bl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc9a"/><stop offset=".5" stop-color="#c8963a"/><stop offset="1" stop-color="#8a5f1d"/></linearGradient>
<radialGradient id="glow-bl"><stop offset="0" stop-color="#f0c15a" stop-opacity=".5"/><stop offset="1" stop-color="#f0c15a" stop-opacity="0"/></radialGradient>
<clipPath id="face-bl"><circle r="68"/></clipPath>
<path id="arcTop-bl" d="M-80,0 A80,80 0 0 1 80,0"/><path id="arcBot-bl" d="M-81,0 A81,81 0 0 0 81,0"/>
<g id="cube-bl"><path d="M0,-100 L87,-50 L87,50 L0,100 L-87,50 L-87,-50Z" fill="#121317"/>
<path class="bl-o" pathLength="100" d="M0,-100 L87,-50 L87,50 L0,100 L-87,50 L-87,-50Z"/>
<path class="bl-o" pathLength="100" d="M-87,-50 L0,0 L87,-50 M0,0 L0,100"/>
<path class="bl-t" pathLength="100" d="M0,-45 L39,-22 L39,22 L0,45 L-39,22 L-39,-22Z"/></g>
<g id="mini-bl"><path d="M0,-100 L87,-50 L87,50 L0,100 L-87,50 L-87,-50Z M-87,-50 L0,0 L87,-50 M0,0 L0,100" fill="#121317" stroke="#3fd6c6" stroke-width="10" stroke-linejoin="round"/></g>
<g id="mc-bl"><circle r="7.5" fill="url(#gold-bl)"/><circle r="5" fill="#1c1c1f"/><path d="M-2.8,2.6 V-2.6 H-1.7 L0,-.3 L1.7,-2.6 H2.8 V2.6 H1.7 V-.9 L0,1.5 L-1.7,-.9 V2.6Z" fill="#f0c15a"/></g>
</defs>
<g id="world-bl">
<circle class="bl-halo" cx="400" cy="380" r="110"><animateTransform attributeName="transform" type="rotate" from="0 400 380" to="360 400 380" dur="40s" repeatCount="indefinite"/></circle>
<circle class="bl-halo" cx="400" cy="380" r="205"><animateTransform attributeName="transform" type="rotate" from="360 400 380" to="0 400 380" dur="70s" repeatCount="indefinite"/></circle>
<g>${links.map((l) => `<path class="bl-l" d="M${l[0]},${l[1]} L${l[2]},${l[3]}"/>`).join('')}</g>
<g id="coins-bl"></g>
${cubes}${minis}
<g id="pulses-bl"><circle class="bl-pulse" cx="400" cy="380" r="60"/><circle class="bl-pulse" cx="400" cy="380" r="60" style="animation-delay:2s"/></g>
<g transform="translate(400,380) scale(.78)"><path d="M0,-100 L87,-50 L87,50 L0,100 L-87,50 L-87,-50Z" fill="#121317" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
<path d="M-87,-50 L0,0 L87,-50 M0,0 L0,100" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
<path d="M0,-70 L61,-35 L61,35 L0,70 L-61,35 L-61,-35Z" fill="none" stroke="#3fd6c6" stroke-width="3.5" stroke-linejoin="round"/></g>
<g transform="translate(400,372)"><circle r="72" fill="url(#glow-bl)"><animate attributeName="r" values="62;80;62" dur="2.4s" repeatCount="indefinite"/></circle>
<g transform="scale(.5)"><g><animateTransform attributeName="transform" type="scale" values="1 1;.1 1;-1 1;.1 1;1 1" dur="6s" repeatCount="indefinite"/>
<circle r="100" fill="url(#gold-bl)"/><circle r="94" fill="#1c1c1f"/><circle r="70" fill="#242426" stroke="url(#gold-bl)" stroke-width="2.5"/>
<g clip-path="url(#face-bl)"><path class="bl-g" d="M-60,-30 H-40 V-50 H-20 M-62,-10 H-44 M-55,10 H-35 V30 M50,-45 L30,-25 H10 M62,-15 H45 V5 M55,25 H30 M20,-60 V-40 M-10,-62 V-45 H-25"/>
<path class="bl-g" d="M-30,45 A25,25 0 0 1 30,45 M-40,52 A38,38 0 0 1 40,52"/><rect class="bl-g" x="-8" y="42" width="16" height="16"/></g>
<path d="M-42,38 V-38 H-28 L0,-4 L28,-38 H42 V38 H28 V-8 L0,26 L-28,-8 V38Z" fill="url(#gold-bl)" stroke="#f6dc9a" stroke-width="1.5" stroke-linejoin="round"/>
</g></g></g>
<g id="ctl-bl"></g>
${labels}
</g>`;

    const world = svg.querySelector('#world-bl') as SVGGElement;
    let k = 1,
      tx = 0,
      ty = 0;
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const sm = (v: number, a: number, b: number) => {
      const t = clamp((v - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    function apply() {
      tx = clamp(tx, 800 * (1 - k), 0);
      ty = clamp(ty, 800 * (1 - k), 0);
      world.setAttribute('transform', `translate(${tx},${ty}) scale(${k})`);
      svg!.style.setProperty('--o1', String(sm(k, 2.2, 3.6)));
      svg!.style.setProperty('--o2', String(sm(k, 5, 7)));
    }
    const toSvg = (x: number, y: number) => {
      const p = svg.createSVGPoint();
      p.x = x;
      p.y = y;
      return p.matrixTransform(svg.getScreenCTM()!.inverse());
    };
    function zoomAt(cx: number, cy: number, f: number) {
      const p = toSvg(cx, cy);
      const nk = clamp(k * f, 1, 14);
      const r = nk / k;
      tx = p.x - (p.x - tx) * r;
      ty = p.y - (p.y - ty) * r;
      k = nk;
      apply();
    }

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0018));
    };
    const dblHandler = () => {
      k = 1;
      tx = ty = 0;
      apply();
    };
    const ptrs = new Map<number, [number, number]>();
    const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    const pointerDownHandler = (e: PointerEvent) => {
      svg.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    };
    const pointerMoveHandler = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = [...ptrs.values()];
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      const old = prev[ptrs.size - 1] || [e.clientX, e.clientY];
      if (ptrs.size === 1) {
        const s = svg.getScreenCTM()!.a;
        tx += (e.clientX - old[0]) / s;
        ty += (e.clientY - old[1]) / s;
        apply();
      } else if (ptrs.size === 2) {
        const n = [...ptrs.values()];
        zoomAt((n[0][0] + n[1][0]) / 2, (n[0][1] + n[1][1]) / 2, dist(n[0], n[1]) / dist(prev[0], prev[1]));
      }
    };
    const pointerUpHandler = (e: Event) => ptrs.delete((e as PointerEvent).pointerId);

    svg.addEventListener('wheel', wheelHandler, { passive: false });
    svg.addEventListener('dblclick', dblHandler);
    svg.addEventListener('pointerdown', pointerDownHandler);
    svg.addEventListener('pointermove', pointerMoveHandler);
    ['pointerup', 'pointercancel'].forEach((t) => svg.addEventListener(t, pointerUpHandler as EventListener));
    apply();

    const coinsG = svg.querySelector('#coins-bl') as SVGGElement;
    const ctl = svg.querySelector('#ctl-bl') as SVGGElement;
    interface Coin {
      pts: [number, number][];
      len: number[];
      tot: number;
      d: number;
      v: number;
      g: SVGGElement;
      t: SVGTextElement | null;
    }
    const coins: Coin[] = [];

    function mk(pts: [number, number][], label?: string) {
      const g = document.createElementNS(NS, 'g') as SVGGElement;
      g.innerHTML = '<use href="#mc-bl"/><circle r="10" fill="none" stroke="#fff" stroke-width="1.2" opacity=".8"/>';
      coinsG.appendChild(g);
      let t: SVGTextElement | null = document.createElementNS(NS, 'text') as SVGTextElement;
      t.setAttribute('class', 'bl-ct bl-d2');
      t.textContent = label || '';
      ctl.appendChild(t);
      const len: number[] = [];
      let tot = 0;
      for (let i = 1; i < pts.length; i++) {
        tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        len.push(tot);
      }
      coins.push({ pts, len, tot, d: 0, v: 55, g, t });
    }

    let last = performance.now();
    let animId: number;
    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.d += c.v * dt;
        if (c.d >= c.tot) {
          c.g.remove();
          c.t?.remove();
          coins.splice(i, 1);
          continue;
        }
        let s = 0;
        while (s < c.len.length - 1 && c.d > c.len[s]) s++;
        const a = c.pts[s],
          b = c.pts[s + 1],
          base = s ? c.len[s - 1] : 0,
          f = (c.d - base) / (c.len[s] - base);
        const x = a[0] + (b[0] - a[0]) * f,
          y = a[1] + (b[1] - a[1]) * f;
        c.g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(1.25)`);
        if (c.t) {
          c.t.setAttribute('x', (x + 9).toFixed(1));
          c.t.setAttribute('y', (y - 6).toFixed(1));
        }
      }
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);

    const blocks: any[] = [];
    let head = -1;
    const short = (h: string, n = 6) => (h ? h.slice(0, n + 2) + '...' + h.slice(-4) : '--');

    async function apiGet(path: string) {
      const r = await fetch(API_URL + path);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }

    async function getBlock(height: number | 'latest') {
      const path = height === 'latest' ? '/latest' : `/block/${height}`;
      const data = await apiGet(path);
      const block = data.block || data;
      return {
        num: block.height || 0,
        hash: block.hash || '',
        time: block.blockTime?.iso || block.time || new Date().toISOString(),
        txCount: block.txCount ?? block.numTxs ?? 0,
        txs: (block.transactions || []).map((tx: any, i: number) => ({
          index: i,
          hash: `TX${i}-${block.height}`,
          from: '',
          to: '',
          val: 0,
        })),
      };
    }

    async function getRecentBlocks(limit = 13) {
      const data = await apiGet(`/blocks?limit=${limit}`);
      return (data.blocks || []).map((b: any) => ({
        num: b.height || 0,
        hash: b.hash || '',
        time: b.time || new Date().toISOString(),
        txCount: b.numTxs || 0,
        txs: [],
      }));
    }

    function add(b: any, fresh: boolean) {
      blocks.unshift(b);
      blocks.length = Math.min(blocks.length, 13);
      show();
      if (fresh) {
        const p = document.createElementNS(NS, 'circle');
        p.setAttribute('class', 'bl-pulse bl-burst');
        p.setAttribute('cx', '400');
        p.setAttribute('cy', '380');
        p.setAttribute('r', '60');
        (svg!.querySelector('#pulses-bl') as SVGGElement).appendChild(p);
        setTimeout(() => p.remove(), 4000);

        b.txs.slice(0, 14).forEach((t: any, i: number) =>
          setTimeout(() => {
            const j = Math.floor(Math.random() * 6);
            const k2 = Math.random() < 0.5 ? j : (j + 5) % 6;
            const v = t.val;
            const vs = v > 0 ? (v < 1 ? v.toFixed(3) : v.toFixed(2)) + ' ' + SYMBOL : '';
            const label = vs + (t.from ? '  ' + short(t.from, 4) + ' -> ' + short(t.to, 4) : '  tx#' + t.index);
            mk([C, R1[j], R2[k2]], label);
          }, i * 350)
        );
      }
    }

    function show() {
      for (let i = 0; i < 13; i++) {
        const b = blocks[i];
        const A = svg!.querySelector('#bla' + i) as SVGTextElement;
        const B = svg!.querySelector('#blb' + i) as SVGTextElement;
        if (A) A.textContent = b ? '#' + b.num : '';
        if (B) B.textContent = b ? b.txCount + ' tx' : '';
      }
    }

    let pollTimer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function poll() {
      if (stopped) return;
      try {
        const latestBlock = await getBlock('latest');
        const n = latestBlock.num;
        if (head < 0) {
          const recentBlocks = await getRecentBlocks(13);
          recentBlocks.forEach((b: any) => add(b, false));
          head = n;
        } else if (n > head) {
          for (let i = head + 1; i <= n; i++) {
            const b = await getBlock(i);
            add(b, true);
          }
          head = n;
        }
      } catch {
        // API unreachable — show empty state, no demo data
      }
      pollTimer = setTimeout(poll, POLL_MS);
    }

    poll();

    return () => {
      stopped = true;
      clearTimeout(pollTimer);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: 160, height: 160, margin: '0 auto 20px', cursor: 'grab' }}
    >
      <style>{`
        .bl-o{fill:none;stroke:#fff;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;animation:bl-form 8s ease-in-out infinite backwards;animation-delay:var(--d)}
        .bl-t{fill:none;stroke:#3fd6c6;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;animation:bl-form 8s ease-in-out infinite backwards;animation-delay:calc(var(--d) + .8s)}
        @keyframes bl-form{0%{stroke-dashoffset:100;opacity:1}30%{stroke-dashoffset:0}85%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
        .bl-s{transform-box:fill-box;transform-origin:center;animation:bl-pop 6s ease-in-out infinite backwards;animation-delay:var(--d)}
        @keyframes bl-pop{0%{transform:scale(0);opacity:0}12%{transform:scale(1.25);opacity:1}20%{transform:scale(1)}80%{opacity:1}100%{transform:scale(1);opacity:0}}
        .bl-l{fill:none;stroke:#ff1f78;stroke-width:1.6;opacity:.55}
        .bl-halo{fill:none;stroke:#ff1f78;stroke-width:2.5;stroke-dasharray:1 8;stroke-linecap:round;opacity:.7}
        .bl-g{fill:none;stroke:#d9a441;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.75}
        .bl-pulse{fill:none;stroke:#f0c15a;stroke-width:2;transform-box:fill-box;transform-origin:center;animation:bl-pl 4s ease-out infinite}
        .bl-burst{animation-iteration-count:1;stroke:#fff}
        @keyframes bl-pl{0%{transform:scale(.6);opacity:.7}100%{transform:scale(2.2);opacity:0}}
        .bl-d1{opacity:var(--o1,0);pointer-events:none}
        .bl-d2{opacity:var(--o2,0);pointer-events:none}
        .bl-lb{fill:#c8cbd4;font-size:5px;paint-order:stroke;stroke:#121317;stroke-width:1.6px;font-family:Roboto,Arial,sans-serif}
        .bl-lb.bl-sm{fill:#7c7f88;font-size:4px}
        .bl-ct{fill:#f6dc9a;font-size:3.2px;paint-order:stroke;stroke:#121317;stroke-width:1px;font-family:Roboto,Arial,sans-serif}
      `}</style>
      <svg
        viewBox="0 0 800 800"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' }}
        aria-label="Mallchain live blockchain visualization"
      />
    </div>
  );
}
