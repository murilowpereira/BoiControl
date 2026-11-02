import { useState } from "react";
import { Link } from "react-router";
import {
  evolucaoMensal,
  formatarGmd,
  formatarPesoKg,
  gmdPorGrupo,
  preverAbate,
  rankingGmd,
  saidasNoPeriodo,
  type Mes,
} from "@boicontrol/core";
import { useDados, type Animal } from "../dados";

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (m: string) => `${NOMES_MES[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;

const PERIODOS = [
  { id: "30", nome: "Últimos 30 dias", dias: 30 },
  { id: "90", nome: "Últimos 3 meses", dias: 90 },
  { id: "365", nome: "Últimos 12 meses", dias: 365 },
  { id: "tudo", nome: "Desde o início", dias: null },
] as const;

/** Métricas do rebanho calculadas no aparelho a partir das pesagens válidas. */
export function Indicadores() {
  const { animais, pesagens, calculadas, categorias, fuso, pesoAbateKg } = useDados();
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("365");
  const agora = new Date();
  const ativos = animais.filter((a) => a.situacao === "ATIVO");

  // ---- previsão de abate
  const previsoes = ativos
    .map((a) => ({ a, p: preverAbate(a.resumo, pesoAbateKg * 1000) }))
    .sort((x, y) => ordemPrevisao(x.p) - ordemPrevisao(y.p) || x.a.brinco.localeCompare(y.a.brinco, "pt-BR", { numeric: true }));
  const prontos = previsoes.filter((x) => x.p.situacao === "ATINGIDO").length;
  const em30 = previsoes.filter((x) => x.p.situacao === "PREVISTO" && x.p.data.getTime() - agora.getTime() <= 30 * 86_400_000).length;
  const [verTodasPrevisoes, setVerTodasPrevisoes] = useState(false);

  // ---- ranking e grupos
  const ranking = rankingGmd(animais, 5);
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const porCategoria = gmdPorGrupo(animais, (a) => nomeCategoria.get(a.categoriaId) ?? a.categoriaId);
  const porSexo = gmdPorGrupo(animais, (a) => (a.sexo === "M" ? "Machos" : "Fêmeas"));

  // ---- evolução mensal
  const meses = evolucaoMensal(
    pesagens
      .filter((p) => p.estado === "VALIDA")
      .map((p) => ({
        animalId: p.animalId,
        dataHoraPesagem: p.dataHoraPesagem.toDate(),
        pesoG: p.pesoG,
        gmdKgDia: calculadas.get(p.id)?.gmdKgDia ?? null,
      })),
    agora,
    fuso,
    12,
  );

  // ---- saídas
  const dias = PERIODOS.find((p) => p.id === periodo)!.dias;
  const inicio = dias === null ? new Date(0) : new Date(agora.getTime() - dias * 86_400_000);
  const saidas = saidasNoPeriodo(
    animais.map((a) => ({ situacao: a.situacao, situacaoDesde: a.situacaoDesde?.toDate() ?? null })),
    inicio,
    agora,
  );

  return (
    <section className="indicadores-pagina">
      <Link to="/" className="voltar">
        ← Painel
      </Link>
      <h1>Indicadores do rebanho</h1>

      <h2>Previsão de abate</h2>
      <p className="ajuda">
        Quando cada animal chega a {pesoAbateKg} kg mantendo o ganho da última pesagem.
        {" "}O peso-alvo é definido em Ajustes.
      </p>
      <div className="indicadores">
        <div className="indicador">
          <span>Já no peso</span>
          <strong>{prontos}</strong>
        </div>
        <div className="indicador">
          <span>Nos próximos 30 dias</span>
          <strong>{em30}</strong>
        </div>
      </div>
      {previsoes.length === 0 ? (
        <p className="vazio">Nenhum animal ativo.</p>
      ) : (
        <>
          <ul className="lista">
            {(verTodasPrevisoes ? previsoes : previsoes.slice(0, 8)).map(({ a, p }) => (
              <li key={a.id}>
                <Link to={`/animais/${a.id}`}>
                  <div>
                    <strong>{a.brinco}</strong>
                    <small>
                      {formatarPesoKg(a.resumo.pesoAtualG)} · {formatarGmd(a.resumo.gmdUltimoKgDia)}
                    </small>
                  </div>
                  <div className="direita">
                    {p.situacao === "ATINGIDO" ? (
                      <span className="selo-ok">No peso</span>
                    ) : p.situacao === "PREVISTO" ? (
                      <>
                        <span>{FORMATO_DATA.format(p.data)}</span>
                        <small>{textoDias(p.data, agora)}</small>
                      </>
                    ) : (
                      <small>{a.resumo.pesoAtualG === null ? "sem pesagem" : "sem ganho para prever"}</small>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {previsoes.length > 8 && (
            <button className="link" onClick={() => setVerTodasPrevisoes(!verTodasPrevisoes)}>
              {verTodasPrevisoes ? "Mostrar menos" : `Ver todos (${previsoes.length})`}
            </button>
          )}
        </>
      )}

      <h2>Quem mais e quem menos ganha peso</h2>
      {ranking.melhores.length === 0 ? (
        <p className="vazio">Os animais precisam de duas pesagens em dias diferentes para ter ganho diário.</p>
      ) : (
        <div className="ranking">
          <ListaRanking titulo="Maiores ganhos" animais={ranking.melhores} />
          {ranking.piores.length > 0 && <ListaRanking titulo="Menores ganhos" animais={ranking.piores} alerta />}
        </div>
      )}

      <h2>Ganho por categoria</h2>
      <ListaGrupos grupos={porCategoria} />

      <h2>Ganho por sexo</h2>
      <ListaGrupos grupos={porSexo} />

      <h2>Evolução mês a mês</h2>
      <GraficoMensal meses={meses} />
      <ul className="lista meses">
        {[...meses]
          .reverse()
          .filter((m) => m.animais > 0)
          .map((m) => (
            <li key={m.mes} className="linha-grupo">
              <div>
                <strong>{nomeMes(m.mes)}</strong>
                <small>{m.animais} animal(is) pesado(s)</small>
              </div>
              <div className="direita">
                <span>{formatarPesoKg(m.pesoMedioG)}</span>
                <small>GMD {formatarGmd(m.gmdMedioKgDia)}</small>
              </div>
            </li>
          ))}
      </ul>

      <h2>Saídas do rebanho</h2>
      <label className="periodo">
        Período
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)}>
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="indicadores">
        <div className="indicador">
          <span>Vendidos</span>
          <strong>{saidas.vendidos}</strong>
        </div>
        <div className={`indicador ${saidas.mortos ? "alerta" : ""}`}>
          <span>Mortos</span>
          <strong>{saidas.mortos}</strong>
        </div>
        <div className="indicador">
          <span>Transferidos</span>
          <strong>{saidas.transferidos}</strong>
        </div>
        <div className="indicador">
          <span>Mortalidade</span>
          <strong>{saidas.mortalidade === null ? "—" : `${(saidas.mortalidade * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</strong>
        </div>
      </div>
      <p className="ajuda">Mortalidade = mortos no período ÷ (animais ativos + saídas do período).</p>
    </section>
  );
}

function ordemPrevisao(p: ReturnType<typeof preverAbate>): number {
  if (p.situacao === "ATINGIDO") return -Infinity;
  if (p.situacao === "PREVISTO") return p.data.getTime();
  return Infinity;
}

function textoDias(data: Date, agora: Date): string {
  const d = Math.ceil((data.getTime() - agora.getTime()) / 86_400_000);
  if (d <= 0) return "já deve estar no peso";
  return d === 1 ? "em 1 dia" : `em ${d} dias`;
}

function ListaRanking({ titulo, animais, alerta = false }: { titulo: string; animais: Animal[]; alerta?: boolean }) {
  return (
    <div className={`cartao ${alerta ? "ranking-alerta" : ""}`}>
      <strong>{titulo}</strong>
      <ol className="ranking-lista">
        {animais.map((a) => (
          <li key={a.id}>
            <Link to={`/animais/${a.id}`}>{a.brinco}</Link>
            <span>{formatarGmd(a.resumo.gmdUltimoKgDia)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ListaGrupos({ grupos }: { grupos: ReturnType<typeof gmdPorGrupo> }) {
  if (grupos.length === 0) return <p className="vazio">Nenhum animal ativo.</p>;
  return (
    <ul className="lista">
      {grupos.map((g) => (
        <li key={g.chave} className="linha-grupo">
          <div>
            <strong>{g.chave}</strong>
            <small>
              {g.animais} animal(is){g.comGmd < g.animais ? ` · ${g.comGmd} com ganho calculado` : ""}
            </small>
          </div>
          <div className="direita">
            <span>{formatarGmd(g.gmdMedioKgDia)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

const L = 640;
const A = 220;
const M = { esq: 56, dir: 16, topo: 16, base: 32 };

/** Peso médio do rebanho em cada mês; meses sem pesagem ficam sem ponto. */
function GraficoMensal({ meses }: { meses: Mes[] }) {
  const comDado = meses.map((m, i) => ({ m, i })).filter((x) => x.m.pesoMedioG !== null);
  if (comDado.length === 0) return <p className="vazio">Sem pesagens nos últimos 12 meses.</p>;
  const kgs = comDado.map((x) => x.m.pesoMedioG! / 1000);
  const folga = Math.max(5, (Math.max(...kgs) - Math.min(...kgs)) * 0.15);
  const p0 = Math.floor(Math.min(...kgs) - folga);
  const p1 = Math.ceil(Math.max(...kgs) + folga);
  const x = (i: number) => M.esq + (meses.length === 1 ? 0.5 : i / (meses.length - 1)) * (L - M.esq - M.dir);
  const y = (kg: number) => M.topo + (1 - (kg - p0) / (p1 - p0)) * (A - M.topo - M.base);
  const marcas = [p0, Math.round((p0 + p1) / 2), p1];
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Peso médio do rebanho por mês">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)} className="grade" />
            <text x={M.esq - 8} y={y(v) + 4} textAnchor="end" className="rotulo">
              {v} kg
            </text>
          </g>
        ))}
        <polyline className="linha" points={comDado.map(({ m, i }) => `${x(i)},${y(m.pesoMedioG! / 1000)}`).join(" ")} />
        {comDado.map(({ m, i }) => (
          <circle key={m.mes} cx={x(i)} cy={y(m.pesoMedioG! / 1000)} r={5} className="ponto">
            <title>{`${nomeMes(m.mes)}: ${formatarPesoKg(m.pesoMedioG)}`}</title>
          </circle>
        ))}
        {meses.map((m, i) =>
          i % 2 === meses.length % 2 ? null : (
            <text key={m.mes} x={x(i)} y={A - 10} textAnchor="middle" className="rotulo">
              {NOMES_MES[Number(m.mes.slice(5)) - 1]}
            </text>
          ),
        )}
      </svg>
    </figure>
  );
}
