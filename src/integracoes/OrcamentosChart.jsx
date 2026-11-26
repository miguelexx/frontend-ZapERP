import { useId, useMemo, useState } from "react";
import { formatDataCurta, formatInteiro, formatMoeda } from "./integracoesFormat";

const W = 640;
const H = 180;
const PAD_T = 14;
const PAD_B = 22;

/**
 * Área + linha do valor criado por dia, com barras finas de quantidade ao fundo.
 * SVG puro (sem lib de gráfico): escala por viewBox, hover por coluna.
 */
export default function OrcamentosChart({ serie = [] }) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);

  const geo = useMemo(() => {
    const n = serie.length;
    if (!n) return null;
    const maxV = Math.max(1, ...serie.map((p) => p.valor));
    const maxQ = Math.max(1, ...serie.map((p) => p.quantidade));
    const passo = n > 1 ? W / (n - 1) : W;
    const y = (v) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxV);
    const pts = serie.map((p, i) => [n > 1 ? i * passo : W / 2, y(p.valor)]);
    // Curva suave (Catmull-Rom → Bézier), sem ultrapassar muito os pontos.
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const t = 0.18;
      const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
      const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
      d += ` C ${c1[0]} ${Math.min(H - PAD_B, c1[1])}, ${c2[0]} ${Math.min(H - PAD_B, c2[1])}, ${p2[0]} ${p2[1]}`;
    }
    const area = `${d} L ${pts[pts.length - 1][0]} ${H - PAD_B} L ${pts[0][0]} ${H - PAD_B} Z`;
    const larguraBarra = Math.max(2, Math.min(14, passo * 0.42));
    const barras = serie.map((p, i) => {
      const h = ((H - PAD_T - PAD_B) * 0.55 * p.quantidade) / maxQ;
      return { x: pts[i][0] - larguraBarra / 2, y: H - PAD_B - h, w: larguraBarra, h };
    });
    return { pts, d, area, barras, passo, maxV };
  }, [serie]);

  if (!geo) return null;
  const vazio = serie.every((p) => p.quantidade === 0);
  const ativo = hover != null ? serie[hover] : null;
  const marcasX = [0, Math.floor((serie.length - 1) / 2), serie.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="intg-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Valor de orçamentos criados por dia">
        <defs>
          <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--intg-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--intg-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`l${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--intg-accent-2)" />
            <stop offset="100%" stopColor="var(--intg-accent)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={PAD_T + (H - PAD_T - PAD_B) * f} y2={PAD_T + (H - PAD_T - PAD_B) * f} className="intg-chart-grid" />
        ))}
        {geo.barras.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="2" className={`intg-chart-bar${hover === i ? " is-on" : ""}`} />
        ))}
        {!vazio ? (
          <>
            <path d={geo.area} fill={`url(#a${gid})`} className="intg-chart-area" />
            <path d={geo.d} fill="none" stroke={`url(#l${gid})`} strokeWidth="2.4" vectorEffect="non-scaling-stroke" className="intg-chart-line" />
          </>
        ) : null}
        {ativo ? (
          <line x1={geo.pts[hover][0]} x2={geo.pts[hover][0]} y1={PAD_T} y2={H - PAD_B} className="intg-chart-cross" vectorEffect="non-scaling-stroke" />
        ) : null}
        {serie.map((p, i) => (
          <rect
            key={p.dia}
            x={geo.pts[i][0] - geo.passo / 2}
            y="0"
            width={geo.passo}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {ativo ? (
        <>
          <span
            className="intg-chart-dot"
            style={{ left: `${(geo.pts[hover][0] / W) * 100}%`, top: `${(geo.pts[hover][1] / H) * 100}%` }}
            aria-hidden="true"
          />
          <div
            className={`intg-chart-tip${geo.pts[hover][0] / W > 0.7 ? " is-left" : ""}`}
            style={{ left: `${(geo.pts[hover][0] / W) * 100}%` }}
            role="status"
          >
            <small>{formatDataCurta(`${ativo.dia}T12:00:00`)}</small>
            <strong>{formatMoeda(ativo.valor)}</strong>
            <span>
              {formatInteiro(ativo.quantidade)} orçamento{ativo.quantidade === 1 ? "" : "s"}
            </span>
          </div>
        </>
      ) : null}
      <div className="intg-chart-axis" aria-hidden="true">
        {marcasX.map((i) => (
          <span key={i}>{formatDataCurta(`${serie[i].dia}T12:00:00`)}</span>
        ))}
      </div>
      {vazio ? <p className="intg-chart-empty">Nenhum orçamento criado neste período</p> : null}
    </div>
  );
}
