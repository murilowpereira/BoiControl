import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatarGmd, formatarPesoKg, lerPesoKg, SITUACOES } from "@boicontrol/core";
import { pode, useDados, type Pesagem } from "../dados";
import { chamar, mensagemDeErro } from "../firebase";
import { GraficoPeso } from "../componentes/Grafico";
import { SeloEstado } from "../componentes/SeloEstado";

function formatarVariacao(g: number | null | undefined): string {
  if (g === null || g === undefined) return "—";
  return `${g > 0 ? "+" : ""}${formatarPesoKg(g)}`;
}

/** RF-08 (histórico), RF-11 (gráfico), RF-05 (situação) e RF-09 (correção). */
export function Ficha() {
  const { id } = useParams();
  const { animais, categorias, pesagens, vinculo } = useDados();
  const [mensagem, setMensagem] = useState("");
  const animal = animais.find((a) => a.id === id);
  if (!animal) return <p>Animal não encontrado neste aparelho.</p>;

  const admin = pode(vinculo, "administrar");
  const historico = pesagens
    .filter((p) => p.animalId === animal.id)
    .sort((a, b) => b.dataHoraPesagem.toMillis() - a.dataHoraPesagem.toMillis());
  const validas = historico.filter((p) => p.estado === "VALIDA").reverse();
  const categoria = categorias.find((c) => c.id === animal.categoriaId)?.nome ?? "—";

  async function alterarSituacao(situacao: string) {
    const motivo = window.prompt(`Motivo para marcar como ${situacao.toLowerCase()}:`);
    if (!motivo?.trim()) return;
    try {
      await chamar.alterarSituacaoAnimal({ pid: vinculo!.propriedadeId, animalId: animal!.id, situacao, motivo });
      setMensagem("Situação atualizada.");
    } catch (e) {
      setMensagem(mensagemDeErro(e));
    }
  }

  async function corrigir(p: Pesagem, anular: boolean) {
    let pesoG: number | undefined;
    if (!anular) {
      const novo = window.prompt("Peso correto (kg):", (p.pesoG / 1000).toString().replace(".", ","));
      if (novo === null) return;
      const r = lerPesoKg(novo);
      if (!r.ok) return setMensagem("Peso inválido.");
      pesoG = r.pesoG;
    }
    const motivo = window.prompt(anular ? "Motivo da anulação:" : "Motivo da correção:");
    if (!motivo?.trim()) return setMensagem("A correção exige um motivo.");
    try {
      await chamar.corrigirPesagem({ pid: vinculo!.propriedadeId, pesagemId: p.id, pesoG, motivo, anular });
      setMensagem(anular ? "Pesagem anulada." : "Pesagem corrigida.");
    } catch (e) {
      setMensagem(mensagemDeErro(e));
    }
  }

  return (
    <section>
      <Link to="/animais" className="voltar">
        ← Animais
      </Link>
      <h1>
        {animal.brinco} <small>{animal.codigoInterno}</small>
      </h1>
      <p className="detalhes">
        {categoria} · {animal.sexo === "M" ? "Macho" : "Fêmea"} · {animal.situacao.toLowerCase()}
        {animal.nome ? ` · ${animal.nome}` : ""}
      </p>

      <div className="indicadores">
        <div className="indicador">
          <span>Peso atual</span>
          <strong>{formatarPesoKg(animal.resumo.pesoAtualG)}</strong>
        </div>
        <div className="indicador">
          <span>Último GMD</span>
          <strong>{formatarGmd(animal.resumo.gmdUltimoKgDia)}</strong>
        </div>
      </div>

      {mensagem && <p className="aviso">{mensagem}</p>}

      {animal.situacao === "ATIVO" && pode(vinculo, "registrarPesagem") && (
        <Link to={`/pesar?animal=${animal.id}`} className="botao primario grande">
          Registrar pesagem
        </Link>
      )}

      <h2>Evolução</h2>
      <GraficoPeso pontos={validas.map((p) => ({ id: p.id, data: p.dataHoraPesagem.toDate(), pesoG: p.pesoG }))} />

      <h2>Histórico</h2>
      {historico.length === 0 ? (
        <p className="vazio">Nenhuma pesagem.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Peso</th>
                <th>Variação</th>
                <th>GMD</th>
                <th>Estado</th>
                {admin && <th />}
              </tr>
            </thead>
            <tbody>
              {historico.map((p) => (
                <tr key={p.id} className={p.estado === "ANULADA" ? "anulada" : ""}>
                  <td>{p.dataHoraPesagem.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{formatarPesoKg(p.pesoG)}</td>
                  <td>{formatarVariacao(p.variacaoG)}</td>
                  <td title={p.diasPeriodo ? `Período de ${p.diasPeriodo} dia(s)` : undefined}>
                    {formatarGmd(p.gmdKgDia ?? null)}
                    {p.diasPeriodo ? <small> em {p.diasPeriodo} d</small> : null}
                  </td>
                  <td>
                    <SeloEstado pesagem={p} />
                  </td>
                  {admin && (
                    <td className="acoes">
                      {(p.estado === "VALIDA" || p.estado === "REJEITADA") && !p.pendente && (
                        <>
                          <button className="link" onClick={() => corrigir(p, false)}>
                            Corrigir
                          </button>
                          <button className="link" onClick={() => corrigir(p, true)}>
                            Anular
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {admin && (
        <>
          <h2>Situação</h2>
          <div className="acoes-situacao">
            {SITUACOES.filter((s) => s !== animal.situacao).map((s) => (
              <button key={s} onClick={() => alterarSituacao(s)}>
                Marcar como {s.toLowerCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
