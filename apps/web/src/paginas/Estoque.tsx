import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  dataIsoNoFuso,
  formatarQuantidade,
  formatarReais,
  lerQuantidade,
  lerReais,
  nomeTipoInsumo,
  quantidadeParaTexto,
  TIPOS_INSUMO,
  UNIDADES_INSUMO,
  type TipoMovimento,
} from "@boicontrol/core";
import { pode, useDados, type Insumo } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { excluirMovimento, registrarMovimento, salvarInsumo } from "../operacoes";

const dataBr = (d: string) => d.split("-").reverse().join("/");

const INSUMO_VAZIO = { id: null as string | null, nome: "", tipo: "RACAO", unidade: "kg", minimo: "", vacinaId: "", dose: "", ativo: true };

/**
 * Estoque de ração, sal, vacinas e medicamentos. O saldo é calculado no aparelho:
 * entradas − saídas − doses das vacinas marcadas nas pesagens (baixa automática).
 */
export function Estoque() {
  const { vinculo, usuario, online, fuso, insumos, movimentos, saldos, vacinas } = useDados();
  const hoje = dataIsoNoFuso(new Date(), fuso);
  const [mensagem, setMensagem] = useState<{ tipo: "aviso" | "erro"; texto: string } | null>(null);
  const [mov, setMov] = useState({ insumoId: "", tipo: "ENTRADA" as TipoMovimento, quantidade: "", data: hoje, observacao: "", valor: "" });
  const [cad, setCad] = useState(INSUMO_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [verInativos, setVerInativos] = useState(false);

  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(() => setMensagem(null), mensagem.tipo === "erro" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [mensagem]);

  const admin = pode(vinculo, "administrar");
  const podeMovimentar = pode(vinculo, "registrarPesagem");
  const pid = vinculo!.propriedadeId;
  const ativos = insumos.filter((i) => i.ativo);
  const inativos = insumos.filter((i) => !i.ativo);
  const baixos = ativos.filter((i) => saldos.get(i.id)?.abaixoDoMinimo);
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const nomeVacina = (id: string) => vacinas.find((v) => v.id === id)?.nome ?? id;
  const escolhido = porId.get(mov.insumoId);
  const historico = mov.insumoId ? movimentos.filter((m) => m.insumoId === mov.insumoId) : movimentos;

  function registrar(e: FormEvent) {
    e.preventDefault();
    if (!escolhido) return setMensagem({ tipo: "erro", texto: "Escolha o insumo." });
    const quantidadeMil = lerQuantidade(mov.quantidade);
    if (quantidadeMil === null) return setMensagem({ tipo: "erro", texto: "Quantidade inválida. Exemplo: 25 ou 2,5" });
    let valorCentavos: number | null = null;
    if (admin && mov.tipo === "ENTRADA" && mov.valor.trim()) {
      valorCentavos = lerReais(mov.valor);
      if (valorCentavos === null) return setMensagem({ tipo: "erro", texto: "Valor inválido. Exemplo: 950,00" });
    }
    try {
      registrarMovimento(
        db,
        {
          pid,
          uid: usuario!.uid,
          insumoId: escolhido.id,
          nomeInsumo: escolhido.nome,
          tipoInsumo: escolhido.tipo,
          unidade: escolhido.unidade,
          tipo: mov.tipo,
          quantidadeMil,
          data: mov.data,
          observacao: mov.observacao,
          valorCentavos,
        },
        (err) => setMensagem({ tipo: "erro", texto: `Movimento de ${escolhido.nome} recusado: ${mensagemDeErro(err)}` }),
      );
    } catch (err) {
      return setMensagem({ tipo: "erro", texto: mensagemDeErro(err) });
    }
    const qtd = formatarQuantidade(quantidadeMil, escolhido.unidade);
    setMensagem({
      tipo: "aviso",
      texto:
        `${mov.tipo === "ENTRADA" ? "Entrada" : "Saída"} de ${qtd} de ${escolhido.nome} registrada.` +
        (valorCentavos !== null ? ` Despesa de ${formatarReais(valorCentavos)} lançada no financeiro.` : "") +
        (online ? "" : " Salva no aparelho; será enviada quando houver internet."),
    });
    setMov({ ...mov, quantidade: "", observacao: "", valor: "" });
  }

  async function excluir(id: string, lancamentoId: string | null, descricao: string) {
    if (!window.confirm(`Excluir ${descricao}?${lancamentoId ? " A despesa lançada no financeiro também será excluída." : ""}`)) return;
    try {
      await excluirMovimento(db, pid, id, lancamentoId);
      setMensagem({ tipo: "aviso", texto: "Movimento excluído." });
    } catch (err) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(err) });
    }
  }

  function editar(i: Insumo) {
    setCad({
      id: i.id,
      nome: i.nome,
      tipo: i.tipo,
      unidade: i.unidade,
      minimo: quantidadeParaTexto(i.minimoMil),
      vacinaId: i.vacinaId ?? "",
      dose: quantidadeParaTexto(i.doseMil),
      ativo: i.ativo,
    });
    document.getElementById("form-insumo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function cadastrar(e: FormEvent) {
    e.preventDefault();
    const minimoMil = cad.minimo.trim() ? (cad.minimo.trim() === "0" ? 0 : lerQuantidade(cad.minimo)) : null;
    if (cad.minimo.trim() && minimoMil === null) return setMensagem({ tipo: "erro", texto: "Estoque mínimo inválido." });
    const doseMil = cad.vacinaId ? lerQuantidade(cad.dose) : null;
    if (cad.vacinaId && doseMil === null) return setMensagem({ tipo: "erro", texto: "Informe quanto sai do estoque por animal vacinado. Exemplo: 1 ou 2,5" });
    const anterior = cad.id ? porId.get(cad.id) : undefined;
    setEnviando(true);
    try {
      await salvarInsumo(
        db,
        pid,
        { nome: cad.nome, tipo: cad.tipo, unidade: cad.unidade, ativo: cad.ativo, minimoMil, vacinaId: cad.vacinaId || null, doseMil },
        anterior ? { id: anterior.id, vacinaId: anterior.vacinaId ?? null, vacinaDesde: anterior.vacinaDesde ?? null } : null,
        insumos.map((i) => i.id),
      );
      setMensagem({ tipo: "aviso", texto: cad.id ? "Insumo alterado." : `${cad.nome.trim()} cadastrado.` });
      setCad(INSUMO_VAZIO);
    } catch (err) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  async function reativar(i: Insumo) {
    try {
      await salvarInsumo(
        db,
        pid,
        { nome: i.nome, tipo: i.tipo, unidade: i.unidade, ativo: true, minimoMil: i.minimoMil ?? null, vacinaId: i.vacinaId ?? null, doseMil: i.doseMil ?? null },
        { id: i.id, vacinaId: i.vacinaId ?? null, vacinaDesde: i.vacinaDesde ?? null },
        [],
      );
      setMensagem({ tipo: "aviso", texto: `${i.nome} reativado.` });
    } catch (err) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(err) });
    }
  }

  return (
    <section className="estoque">
      <Link to="/" className="voltar">
        ← Painel
      </Link>
      <h1>Estoque</h1>
      {mensagem && (
        <p className={`${mensagem.tipo} toast`} role="status">
          {mensagem.texto}
        </p>
      )}

      {baixos.length > 0 && (
        <div className="cartao alerta-atrasados">
          <strong>{baixos.length === 1 ? "1 insumo no estoque mínimo" : `${baixos.length} insumos no estoque mínimo`}</strong>
          <p className="ajuda">
            {baixos.map((i) => `${i.nome} (${formatarQuantidade(saldos.get(i.id)!.saldoMil, i.unidade)})`).join(", ")}
          </p>
        </div>
      )}

      {ativos.length === 0 ? (
        <p className="vazio">
          Nenhum insumo cadastrado.{admin ? " Cadastre ração, sal, vacinas ou medicamentos no fim da página." : " Peça ao administrador para cadastrar."}
        </p>
      ) : (
        <ul className="lista">
          {ativos.map((i) => {
            const s = saldos.get(i.id)!;
            const selecionado = mov.insumoId === i.id;
            return (
              <li key={i.id} className={`linha-grupo insumo ${selecionado ? "selecionado" : ""}`}>
                <div>
                  <strong>{i.nome}</strong>
                  <small>
                    {nomeTipoInsumo(i.tipo)}
                    {i.minimoMil !== null ? ` · mínimo ${formatarQuantidade(i.minimoMil, i.unidade)}` : ""}
                  </small>
                  {i.vacinaId && i.doseMil && (
                    <small>
                      Baixa automática: {nomeVacina(i.vacinaId)}, {formatarQuantidade(i.doseMil, i.unidade)} por animal
                      {s.aplicacoes > 0 ? ` · ${s.aplicacoes} aplicada(s)` : ""}
                    </small>
                  )}
                  <span className="lancamento-acoes">
                    <button className="link" onClick={() => setMov({ ...mov, insumoId: selecionado ? "" : i.id })}>
                      {selecionado ? "Ver todos" : "Movimentar"}
                    </button>
                    {admin && (
                      <button className="link" onClick={() => editar(i)}>
                        Alterar
                      </button>
                    )}
                  </span>
                </div>
                <div className="direita">
                  <strong className={s.saldoMil < 0 ? "negativo" : ""}>{formatarQuantidade(s.saldoMil, i.unidade)}</strong>
                  {s.abaixoDoMinimo && <span className="selo selo-alerta">{s.saldoMil < 0 ? "Negativo" : "Repor"}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {podeMovimentar && ativos.length > 0 && (
        <>
          <h2 id="form-movimento">Registrar entrada ou saída</h2>
          <form className="cartao" onSubmit={registrar}>
            <label>
              Insumo
              <select value={mov.insumoId} onChange={(e) => setMov({ ...mov, insumoId: e.target.value })} required>
                <option value="">Escolha…</option>
                {ativos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} ({formatarQuantidade(saldos.get(i.id)!.saldoMil, i.unidade)})
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="opcoes">
              <legend>Movimento</legend>
              <label>
                <input type="radio" name="tipo" checked={mov.tipo === "ENTRADA"} onChange={() => setMov({ ...mov, tipo: "ENTRADA" })} />
                Entrada (compra)
              </label>
              <label>
                <input type="radio" name="tipo" checked={mov.tipo === "SAIDA"} onChange={() => setMov({ ...mov, tipo: "SAIDA" })} />
                Saída (uso, perda)
              </label>
            </fieldset>
            <label>
              Quantidade{escolhido ? ` (${escolhido.unidade})` : ""}
              <input inputMode="decimal" placeholder="Ex.: 25 ou 2,5" value={mov.quantidade} onChange={(e) => setMov({ ...mov, quantidade: e.target.value })} required />
            </label>
            <label>
              Data
              <input type="date" value={mov.data} max={hoje} onChange={(e) => setMov({ ...mov, data: e.target.value })} required />
            </label>
            {admin && mov.tipo === "ENTRADA" && (
              <label>
                Valor pago (opcional)
                <input inputMode="decimal" placeholder="R$ 0,00" value={mov.valor} onChange={(e) => setMov({ ...mov, valor: e.target.value })} />
                <small className="ajuda">Se informar, a compra entra como despesa no Financeiro.</small>
              </label>
            )}
            <label>
              Observação (opcional)
              <input
                value={mov.observacao}
                onChange={(e) => setMov({ ...mov, observacao: e.target.value })}
                maxLength={200}
                placeholder={mov.tipo === "ENTRADA" ? "Ex.: nota 1234, Agropecuária Silva" : "Ex.: trato do lote 1"}
              />
            </label>
            <div className="botoes">
              <button className="primario">Registrar</button>
            </div>
            {escolhido?.vacinaId && mov.tipo === "SAIDA" && (
              <p className="ajuda">As doses aplicadas na pesagem já saem sozinhas; use a saída só para perdas ou uso fora da pesagem.</p>
            )}
          </form>
        </>
      )}

      <h2>{escolhido ? `Movimentos de ${escolhido.nome}` : "Últimos movimentos"}</h2>
      {escolhido && saldos.get(escolhido.id)!.aplicacoes > 0 && (
        <p className="ajuda">
          Baixa automática: {saldos.get(escolhido.id)!.aplicacoes} animal(is) vacinado(s) na pesagem ou no lote, −
          {formatarQuantidade(saldos.get(escolhido.id)!.usoPesagensMil, escolhido.unidade)}.
        </p>
      )}
      {historico.length === 0 ? (
        <p className="vazio">Nenhuma entrada ou saída registrada.</p>
      ) : (
        <ul className="lista">
          {historico.slice(0, escolhido ? 100 : 20).map((m) => {
            const i = porId.get(m.insumoId);
            const qtd = formatarQuantidade(m.quantidadeMil, i?.unidade);
            const entrada = m.tipo === "ENTRADA";
            return (
              <li key={m.id} className="linha-grupo">
                <div>
                  <strong>
                    {entrada ? "Entrada" : "Saída"}
                    {escolhido ? "" : ` · ${i?.nome ?? "—"}`}
                  </strong>
                  <small>
                    {dataBr(m.data)}
                    {m.observacao ? ` · ${m.observacao}` : ""}
                    {m.lancamentoId ? " · lançada no financeiro" : ""}
                  </small>
                  {admin && (
                    <span className="lancamento-acoes">
                      <button
                        className="link"
                        disabled={!online}
                        onClick={() => excluir(m.id, m.lancamentoId ?? null, `${entrada ? "a entrada" : "a saída"} de ${qtd} de ${i?.nome ?? "insumo"}`)}
                      >
                        Excluir
                      </button>
                    </span>
                  )}
                </div>
                <div className="direita">
                  <span className={entrada ? "positivo" : ""}>
                    {entrada ? "+" : "−"} {qtd}
                  </span>
                  {m.pendente && <span className="selo selo-pendente">Não enviado</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {admin && (
        <>
          <h2 id="form-insumo">{cad.id ? "Alterar insumo" : "Cadastrar insumo"}</h2>
          <form className="cartao" onSubmit={cadastrar}>
            <label>
              Nome
              <input value={cad.nome} onChange={(e) => setCad({ ...cad, nome: e.target.value })} maxLength={40} placeholder="Ex.: Sal mineral 80" required />
            </label>
            <label>
              Tipo
              <select value={cad.tipo} onChange={(e) => setCad({ ...cad, tipo: e.target.value })}>
                {TIPOS_INSUMO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unidade
              <select value={cad.unidade} onChange={(e) => setCad({ ...cad, unidade: e.target.value })}>
                {UNIDADES_INSUMO.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estoque mínimo (opcional)
              <input inputMode="decimal" value={cad.minimo} onChange={(e) => setCad({ ...cad, minimo: e.target.value })} placeholder={`Ex.: 100 ${cad.unidade}`} />
              <small className="ajuda">Ao chegar nesse saldo, o insumo aparece no aviso de repor.</small>
            </label>
            {(cad.tipo === "VACINA" || cad.tipo === "MEDICAMENTO" || cad.vacinaId) && (
              <>
                <label>
                  Baixa automática na pesagem (opcional)
                  <select value={cad.vacinaId} onChange={(e) => setCad({ ...cad, vacinaId: e.target.value })}>
                    <option value="">Não dar baixa sozinho</option>
                    {vacinas
                      .filter((v) => v.ativo || v.id === cad.vacinaId)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          Quando marcar {v.nome}
                        </option>
                      ))}
                  </select>
                  {vacinas.length === 0 && <small className="ajuda">Cadastre as vacinas em Ajustes para usar a baixa automática.</small>}
                </label>
                {cad.vacinaId && (
                  <label>
                    Quanto sai por animal ({cad.unidade})
                    <input inputMode="decimal" value={cad.dose} onChange={(e) => setCad({ ...cad, dose: e.target.value })} placeholder="Ex.: 1 ou 5" required />
                    <small className="ajuda">Vale para as pesagens registradas a partir de agora.</small>
                  </label>
                )}
              </>
            )}
            {cad.id && (
              <label className="linha">
                <input type="checkbox" checked={cad.ativo} onChange={(e) => setCad({ ...cad, ativo: e.target.checked })} />
                Ativo (desmarque para tirar da lista sem perder o histórico)
              </label>
            )}
            <div className="botoes">
              {cad.id && (
                <button type="button" className="link" onClick={() => setCad(INSUMO_VAZIO)}>
                  Cancelar
                </button>
              )}
              <button className="primario" disabled={enviando || !online}>
                {enviando ? "Salvando…" : cad.id ? "Salvar alteração" : "Cadastrar"}
              </button>
            </div>
            {!online && <p className="ajuda">Sem internet. O cadastro de insumos precisa de conexão.</p>}
          </form>

          {inativos.length > 0 && (
            <p>
              <button className="link" onClick={() => setVerInativos(!verInativos)}>
                {verInativos ? "Esconder" : "Ver"} insumos desativados ({inativos.length})
              </button>
            </p>
          )}
          {verInativos && (
            <ul className="lista">
              {inativos.map((i) => (
                <li key={i.id} className="linha-grupo">
                  <div>
                    <strong>{i.nome}</strong>
                    <small>Saldo {formatarQuantidade(saldos.get(i.id)?.saldoMil ?? 0, i.unidade)}</small>
                  </div>
                  <div className="direita">
                    <button className="link" onClick={() => reativar(i)} disabled={!online}>
                      Reativar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
