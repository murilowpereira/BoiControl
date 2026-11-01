import { formatarPesoKg } from "@boicontrol/core";

interface Ponto {
  id: string;
  data: Date;
  pesoG: number;
}

const L = 640;
const A = 240;
const M = { esq: 56, dir: 16, topo: 16, base: 36 };

/**
 * RF-11: peso por data, com cada pesagem como ponto identificável.
 * Os segmentos ligam pesagens reais; não há pontos interpolados.
 */
export function GraficoPeso({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length === 0) return <p className="vazio">Sem pesagens para o gráfico.</p>;

  const tempos = pontos.map((p) => p.data.getTime());
  const pesos = pontos.map((p) => p.pesoG / 1000);
  const t0 = Math.min(...tempos);
  const t1 = Math.max(...tempos);
  const folga = Math.max(5, (Math.max(...pesos) - Math.min(...pesos)) * 0.15);
  const p0 = Math.floor(Math.min(...pesos) - folga);
  const p1 = Math.ceil(Math.max(...pesos) + folga);

  const x = (t: number) => M.esq + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (L - M.esq - M.dir);
  const y = (kg: number) => M.topo + (1 - (kg - p0) / (p1 - p0)) * (A - M.topo - M.base);
  const marcasY = [p0, (p0 + p1) / 2, p1].map((v) => Math.round(v));
  const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Evolução do peso por data">
        {marcasY.map((v) => (
          <g key={v}>
            <line x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)} className="grade" />
            <text x={M.esq - 8} y={y(v) + 4} textAnchor="end" className="rotulo">
              {v} kg
            </text>
          </g>
        ))}
        <polyline className="linha" points={pontos.map((p) => `${x(p.data.getTime())},${y(p.pesoG / 1000)}`).join(" ")} />
        {pontos.map((p) => (
          <g key={p.id}>
            <circle cx={x(p.data.getTime())} cy={y(p.pesoG / 1000)} r={5} className="ponto">
              <title>{`${p.data.toLocaleDateString("pt-BR")}: ${formatarPesoKg(p.pesoG)}`}</title>
            </circle>
          </g>
        ))}
        <text x={x(t0)} y={A - 10} textAnchor="start" className="rotulo">
          {fmtData.format(new Date(t0))}
        </text>
        {t1 !== t0 && (
          <text x={x(t1)} y={A - 10} textAnchor="end" className="rotulo">
            {fmtData.format(new Date(t1))}
          </text>
        )}
      </svg>
    </figure>
  );
}
