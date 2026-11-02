import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  centavosParaTexto,
  dataIsoNoFuso,
  formatarCodigo,
  formatarGmd,
  formatarPesoKg,
  formatarReais,
  lerPesoKg,
  lerReais,
  margemDoAnimal,
  preverAbate,
  SITUACOES,
  type SituacaoAnimal,
} from "@boicontrol/core";
import { pode, useDados, type Pesagem, type ValoresAnimal } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { alterarSituacaoAnimal, corrigirPesagem, editarAnimal, salvarValoresAnimal } from "../operacoes";
import { GraficoPeso } from "../componentes/Grafico";
import { SeloEstado } from "../componentes/SeloEstado";

function formatarVariacao(g: number | null | undefined): string {
  if (g === null || g === undefined) return "—";
  return `${g > 0 ? "+" : ""}${formatarPesoKg(g)}`;
}

/** RF-08 (histórico), RF-11 (gráfico), RF-05 (situação) e RF-09 (correção). */
export function Ficha() {
  const { id } = useParams();
  const { animais, categorias, lotes, pesagens, calculadas, vinculo, usuario, online, pesoAbateKg, valores, fuso } = useDados();
  const [mensagem, setMensagem] = useState("");
  const [mudando, setMudando] = useState<SituacaoAnimal | null>(null);
  const [motivo, setMotivo] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [dataVenda, setDataVenda] = useState("");
  const [enviandoSituacao, setEnviandoSituacao] = useState(false);
  const animal = animais.find((a) => a.id === id);
  if (!animal) return <p>Animal não encontrado neste aparelho.</p>;

  const admin = pode(vinculo, "administrar");
  const historico = pesagens
    .filter((p) => p.animalId === animal.id)
    .sort((a, b) => b.dataHoraPesagem.toMillis() - a.dataHoraPesagem.toMillis());
  const validas = historico.filter((p) => p.estado === "VALIDA").reverse();
  const categoria = categorias.find((c) => c.id === animal.categoriaId)?.nome ?? "—";
  const lote = animal.loteId ? lotes.find((l) => l.id === animal.loteId) : undefined;

  async function mudarLote(loteId: string) {
    try {
      await editarAnimal(db, vinculo!.propriedadeId, usuario!.uid, animal!.id, { loteId: loteId || null });
      setMensagem(loteId ? "Lote atualizado." : "Animal tirado do lote.");
    } catch (e) {
      setMensagem(mensagemDeErro(e));
    }
  }

  function abrirSituacao(situacao: SituacaoAnimal) {
    setMudando(situacao);
    setMotivo(situacao === "VENDIDO" ? "Venda" : "");
    setValorVenda("");
    setDataVenda(dataIsoNoFuso(new Date(), fuso));
    setMensagem("");
  }

  async function confirmarSituacao(e: FormEvent) {
    e.preventDefault();
    if (!mudando) return;
    if (!motivo.trim()) return setMensagem("Informe o motivo.");
    let venda: { centavos: number; data: string } | null = null;
    if (mudando === "VENDIDO") {
      const centavos = lerReais(valorVenda);
      if (centavos === null) return setMensagem("Informe o valor de venda. Exemplo: 4.500,00");
      if (!dataVenda) return setMensagem("Informe a data da venda.");
      venda = { centavos, data: dataVenda };
    }
    setEnviandoSituacao(true);
    try {
      await alterarSituacaoAnimal(db, vinculo!.propriedadeId, usuario!.uid, animal!.id, mudando, motivo, venda);
      setMensagem(mudando === "VENDIDO" ? `Venda registrada por ${formatarReais(venda!.centavos)}.` : "Situação atualizada.");
      setMudando(null);
    } catch (err) {
      setMensagem(mensagemDeErro(err));
    } finally {
      setEnviandoSituacao(false);
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
      await corrigirPesagem(db, vinculo!.propriedadeId, usuario!.uid, { pesagemId: p.id, pesoG, motivo, anular });
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
        {animal.brinco} <small>{formatarCodigo(animal.codigoNumero)}</small>
      </h1>
      <p className="detalhes">
        {categoria} · {animal.sexo === "M" ? "Macho" : "Fêmea"} · {animal.situacao.toLowerCase()}
        {lote ? ` · ${lote.nome}` : ""}
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
        {animal.situacao === "ATIVO" && <IndicadorAbate resumo={animal.resumo} pesoAbateKg={pesoAbateKg} />}
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
              {historico.map((p) => {
                const c = calculadas.get(p.id);
                return (
                <tr key={p.id} className={p.estado === "ANULADA" ? "anulada" : ""}>
                  <td>{p.dataHoraPesagem.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{formatarPesoKg(p.pesoG)}</td>
                  <td>{formatarVariacao(c?.variacaoG)}</td>
                  <td title={c?.diasPeriodo ? `Período de ${c.diasPeriodo} dia(s)` : undefined}>
                    {formatarGmd(c?.gmdKgDia ?? null)}
                    {c?.diasPeriodo ? <small> em {c.diasPeriodo} d</small> : null}
                  </td>
                  <td>
                    <SeloEstado pesagem={p} animal={animal} />
                    {p.motivoCorrecao && <small className="motivo">Corrigida: {p.motivoCorrecao}</small>}
                  </td>
                  {admin && (
                    <td className="acoes">
                      {p.estado === "VALIDA" && !p.pendente && (
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {admin && lotes.length > 0 && (
        <>
          <h2>Lote</h2>
          <label className="campo-lote">
            Lote ou pasto deste animal
            <select value={animal.loteId ?? ""} onChange={(e) => mudarLote(e.target.value)} disabled={!online}>
              <option value="">Sem lote</option>
              {lotes
                .filter((l) => l.ativo || l.id === animal.loteId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}

      {admin && (
        <>
          <h2>Situação</h2>
          <div className="acoes-situacao">
            {SITUACOES.filter((s) => s !== animal.situacao).map((s) => (
              <button key={s} onClick={() => abrirSituacao(s)} className={mudando === s ? "escolhido" : ""} disabled={!online}>
                Marcar como {s.toLowerCase()}
              </button>
            ))}
          </div>
          {!online && <p className="ajuda">Mudar a situação precisa de internet.</p>}
          {mudando && (
            <form className="cartao" onSubmit={confirmarSituacao}>
              <strong>Marcar como {mudando.toLowerCase()}</strong>
              {mudando === "VENDIDO" && (
                <>
                  <label>
                    Valor de venda
                    <input inputMode="decimal" placeholder="R$ 0,00" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} required autoFocus />
                  </label>
                  <label>
                    Data da venda
                    <input type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} required />
                  </label>
                </>
              )}
              <label>
                Motivo
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} required />
              </label>
              <div className="botoes">
                <button type="button" className="link" onClick={() => setMudando(null)}>
                  Cancelar
                </button>
                <button className="primario" disabled={enviandoSituacao}>
                  {enviandoSituacao ? "Salvando…" : "Confirmar"}
                </button>
              </div>
            </form>
          )}

          <h2>Valores</h2>
          <ValoresDoAnimal
            key={animal.id}
            valores={valores.get(animal.id) ?? null}
            vendido={animal.situacao === "VENDIDO"}
            online={online}
            fuso={fuso}
            salvar={async (v) => {
              try {
                await salvarValoresAnimal(db, vinculo!.propriedadeId, usuario!.uid, animal.id, v);
                setMensagem("Valores atualizados.");
                return true;
              } catch (err) {
                setMensagem(mensagemDeErro(err));
                return false;
              }
            }}
          />
        </>
      )}
    </section>
  );
}

function IndicadorAbate({ resumo, pesoAbateKg }: { resumo: Parameters<typeof preverAbate>[0]; pesoAbateKg: number }) {
  const p = preverAbate(resumo, pesoAbateKg * 1000);
  return (
    <div className="indicador">
      <span>Abate ({pesoAbateKg} kg)</span>
      <strong>
        {p.situacao === "ATINGIDO"
          ? "No peso"
          : p.situacao === "PREVISTO"
            ? p.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
            : "—"}
      </strong>
      {p.situacao === "SEM_PREVISAO" && <small>precisa de ganho de peso</small>}
    </div>
  );
}

interface PropsValores {
  valores: ValoresAnimal | null;
  vendido: boolean;
  online: boolean;
  fuso: string;
  salvar: (v: ValoresAnimal) => Promise<boolean>;
}

/** Compra, venda e margem do animal (só ADMIN). */
function ValoresDoAnimal({ valores, vendido, online, fuso, salvar }: PropsValores) {
  const [editando, setEditando] = useState(false);
  const [compra, setCompra] = useState(centavosParaTexto(valores?.compraCentavos));
  const [dataCompra, setDataCompra] = useState(valores?.dataCompra ?? "");
  const [venda, setVenda] = useState(centavosParaTexto(valores?.vendaCentavos));
  const [dataVenda, setDataVenda] = useState(valores?.dataVenda ?? "");
  const [erro, setErro] = useState("");
  const margem = valores ? margemDoAnimal(valores) : null;
  const dataBr = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "");

  function abrir() {
    setCompra(centavosParaTexto(valores?.compraCentavos));
    setDataCompra(valores?.dataCompra ?? dataIsoNoFuso(new Date(), fuso));
    setVenda(centavosParaTexto(valores?.vendaCentavos));
    setDataVenda(valores?.dataVenda ?? (vendido ? dataIsoNoFuso(new Date(), fuso) : ""));
    setErro("");
    setEditando(true);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const c = compra.trim() ? lerReais(compra) : null;
    if (compra.trim() && c === null) return setErro("Valor de compra inválido. Exemplo: 2.850,00");
    const v = venda.trim() ? lerReais(venda) : null;
    if (venda.trim() && v === null) return setErro("Valor de venda inválido. Exemplo: 4.500,00");
    if (c !== null && !dataCompra) return setErro("Informe a data da compra.");
    if (v !== null && !dataVenda) return setErro("Informe a data da venda.");
    const ok = await salvar({
      compraCentavos: c,
      dataCompra: c === null ? null : dataCompra,
      vendaCentavos: v,
      dataVenda: v === null ? null : dataVenda,
    });
    if (ok) setEditando(false);
  }

  if (!editando) {
    return (
      <div className="cartao valores-animal">
        <div className="valores-linhas">
          <div>
            <span>Valor pago</span>
            <strong>{formatarReais(valores?.compraCentavos)}</strong>
            {valores?.dataCompra && <small>{dataBr(valores.dataCompra)}</small>}
          </div>
          <div>
            <span>Valor de venda</span>
            <strong>{formatarReais(valores?.vendaCentavos)}</strong>
            {valores?.dataVenda && <small>{dataBr(valores.dataVenda)}</small>}
          </div>
          {margem !== null && (
            <div>
              <span>Diferença</span>
              <strong className={margem < 0 ? "negativo" : "positivo"}>{formatarReais(margem)}</strong>
            </div>
          )}
        </div>
        <button onClick={abrir} disabled={!online}>
          Alterar valores
        </button>
      </div>
    );
  }

  return (
    <form className="cartao" onSubmit={enviar}>
      <label>
        Valor pago
        <input inputMode="decimal" placeholder="R$ 0,00" value={compra} onChange={(e) => setCompra(e.target.value)} />
      </label>
      <label>
        Data da compra
        <input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
      </label>
      <label>
        Valor de venda
        <input inputMode="decimal" placeholder="R$ 0,00" value={venda} onChange={(e) => setVenda(e.target.value)} />
      </label>
      <label>
        Data da venda
        <input type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
      </label>
      <p className="ajuda">Deixe o valor em branco para apagar. Só administradores veem estes valores.</p>
      {erro && <p className="erro">{erro}</p>}
      <div className="botoes">
        <button type="button" className="link" onClick={() => setEditando(false)}>
          Cancelar
        </button>
        <button className="primario">Salvar valores</button>
      </div>
    </form>
  );
}
