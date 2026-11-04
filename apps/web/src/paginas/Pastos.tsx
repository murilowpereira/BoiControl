import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  calcularLotacao,
  dataIsoNoFuso,
  diasEntreDatas,
  formatarHectares,
  hectaresParaTexto,
  historicoRotacao,
  lerHectares,
  M2_POR_HA,
  ocupacaoAtualPorLote,
  UA_KG,
} from "@boicontrol/core";
import { pode, useDados, type Ocupacao, type Pasto } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { excluirOcupacao, moverLote, salvarPasto } from "../operacoes";

const dataBr = (d: string) => d.split("-").reverse().join("/");
const decimal = (n: number, casas = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
const FORM_PASTO = { id: undefined as string | undefined, nome: "", area: "" };

/** Pastos e piquetes: área, lotação (UA/ha) e rotação dos lotes. */
export function Pastos() {
  const { vinculo, usuario, online, fuso, animais, lotes, pastos, ocupacoes } = useDados();
  const hoje = dataIsoNoFuso(new Date(), fuso);
  const [mensagem, setMensagem] = useState<{ tipo: "aviso" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mudanca, setMudanca] = useState({ loteId: "", pastoId: "", data: hoje });
  const [formPasto, setFormPasto] = useState(FORM_PASTO);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(() => setMensagem(null), mensagem.tipo === "erro" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [mensagem]);

  if (!vinculo) return null;
  const pid = vinculo.propriedadeId;
  const admin = pode(vinculo, "administrar");
  const podeMover = pode(vinculo, "registrarPesagem");

  const lotacao = calcularLotacao(pastos, ocupacoes, animais, hoje);
  const atualDoLote = ocupacaoAtualPorLote(ocupacoes);
  const nomeLote = new Map(lotes.map((l) => [l.id, l.nome]));
  const nomePasto = new Map(pastos.map((p) => [p.id, p.nome]));
  // Pastos desativados só aparecem na lotação se ainda tiverem lote dentro.
  const visiveis = pastos.filter((p) => p.ativo || (lotacao.get(p.id)?.atuais.length ?? 0) > 0);
  const areaTotal = visiveis.reduce((t, p) => t + p.areaM2, 0);
  const uaTotal = visiveis.reduce((t, p) => t + (lotacao.get(p.id)?.ua ?? 0), 0);
  const areaOcupada = visiveis.filter((p) => lotacao.get(p.id)!.atuais.length > 0).reduce((t, p) => t + p.areaM2, 0);
  const lotesAtivos = lotes.filter((l) => l.ativo || atualDoLote.has(l.id));
  const loteEscolhido = mudanca.loteId ? atualDoLote.get(mudanca.loteId) ?? null : null;

  async function executar(acao: () => Promise<unknown>, sucesso: string): Promise<boolean> {
    setMensagem(null);
    setEnviando(true);
    try {
      await acao();
      setMensagem({ tipo: "aviso", texto: sucesso });
      return true;
    } catch (err) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(err) });
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function mover(e: FormEvent) {
    e.preventDefault();
    const destino = mudanca.pastoId === "__fora" ? null : mudanca.pastoId;
    const lote = nomeLote.get(mudanca.loteId) ?? "Lote";
    const ok = await executar(async () => {
      const { gravado } = moverLote(db, pid, usuario!.uid, {
        loteId: mudanca.loteId,
        pastoId: destino,
        data: mudanca.data,
        atual: loteEscolhido,
      });
      // Sem internet a mudança já aparece na tela e é enviada quando a conexão voltar.
      if (navigator.onLine) await gravado;
      else gravado.catch((err) => console.error("Falha ao sincronizar a mudança de pasto", err));
    }, destino ? `${lote} foi para ${nomePasto.get(destino)}.` : `${lote} saiu de ${nomePasto.get(loteEscolhido!.pastoId)}.`);
    if (ok) setMudanca({ loteId: "", pastoId: "", data: mudanca.data });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const nome = formPasto.nome.trim();
    const areaM2 = lerHectares(formPasto.area);
    if (areaM2 === null) return setMensagem({ tipo: "erro", texto: "Área inválida. Informe em hectares, por exemplo 12,5." });
    if (pastos.some((p) => p.id !== formPasto.id && p.nome.toLowerCase() === nome.toLowerCase())) {
      return setMensagem({ tipo: "erro", texto: `Já existe "${nome}".` });
    }
    const atual = pastos.find((p) => p.id === formPasto.id);
    const ok = await executar(
      () => salvarPasto(db, pid, { id: formPasto.id, nome, areaM2, ativo: atual?.ativo ?? true }, pastos.map((p) => p.id)),
      formPasto.id ? `${nome} alterado.` : `${nome} adicionado.`,
    );
    if (ok) setFormPasto(FORM_PASTO);
  }

  function alternar(p: Pasto) {
    if (p.ativo && lotacao.get(p.id)!.atuais.length > 0) {
      setMensagem({ tipo: "erro", texto: `Tire os lotes de ${p.nome} antes de desativá-lo.` });
      return;
    }
    void executar(
      () => salvarPasto(db, pid, { ...p, ativo: !p.ativo }, []),
      p.ativo ? `${p.nome} desativado. O histórico continua guardado.` : `${p.nome} reativado.`,
    );
  }

  function excluir(o: Ocupacao) {
    const texto = `${nomeLote.get(o.loteId) ?? "Lote"} em ${nomePasto.get(o.pastoId) ?? "pasto"} desde ${dataBr(o.entrada)}`;
    if (!window.confirm(`Apagar o registro "${texto}"? Use só para corrigir um lançamento errado.`)) return;
    void executar(() => excluirOcupacao(db, pid, o.id), "Registro apagado.");
  }

  return (
    <section className="pastos">
      <Link to="/" className="voltar">
        ← Painel
      </Link>
      <h1>Pastos e piquetes</h1>
      {mensagem && (
        <p className={`${mensagem.tipo} toast`} role="status">
          {mensagem.texto}
        </p>
      )}
      <p className="ajuda">
        Lotação em UA (unidade animal = {UA_KG} kg de peso vivo), pelo último peso de cada animal dos lotes que estão no pasto.
      </p>

      {visiveis.length > 0 && (
        <div className="indicadores">
          <div className="indicador">
            <span>Área total</span>
            <strong>{formatarHectares(areaTotal)}</strong>
            <small>{visiveis.length} pasto(s)</small>
          </div>
          <div className="indicador">
            <span>UA nos pastos</span>
            <strong>{decimal(uaTotal, 1)}</strong>
          </div>
          <div className="indicador">
            <span>Lotação média</span>
            <strong>{areaTotal > 0 ? `${decimal(uaTotal / (areaTotal / M2_POR_HA))} UA/ha` : "—"}</strong>
            <small>
              {areaOcupada > 0 ? `${decimal(uaTotal / (areaOcupada / M2_POR_HA))} UA/ha na área ocupada` : "nenhum pasto ocupado"}
            </small>
          </div>
        </div>
      )}

      {podeMover && lotesAtivos.length > 0 && pastos.some((p) => p.ativo) && (
        <>
          <h2>Mudar lote de pasto</h2>
          <form className="cartao" onSubmit={mover}>
            <label>
              Lote
              <select value={mudanca.loteId} onChange={(e) => setMudanca({ ...mudanca, loteId: e.target.value, pastoId: "" })} required>
                <option value="">Escolha o lote</option>
                {lotesAtivos.map((l) => (
                  <option key={l.id} value={l.id}>
                    {`${l.nome}${atualDoLote.has(l.id) ? ` (em ${nomePasto.get(atualDoLote.get(l.id)!.pastoId) ?? "?"})` : " (sem pasto)"}`}
                  </option>
                ))}
              </select>
            </label>
            {loteEscolhido && (
              <p className="ajuda">
                Está em {nomePasto.get(loteEscolhido.pastoId)} desde {dataBr(loteEscolhido.entrada)} (
                {dias(Math.max(0, diasEntreDatas(loteEscolhido.entrada, hoje)))}).
              </p>
            )}
            <label>
              Vai para
              <select value={mudanca.pastoId} onChange={(e) => setMudanca({ ...mudanca, pastoId: e.target.value })} required>
                <option value="">Escolha o pasto</option>
                {pastos
                  .filter((p) => p.ativo && p.id !== loteEscolhido?.pastoId)
                  .map((p) => {
                    const l = lotacao.get(p.id)!;
                    const estado = l.atuais.length > 0 ? "ocupado" : l.diasDescanso !== null ? `descanso há ${dias(l.diasDescanso)}` : "sem uso";
                    return (
                      <option key={p.id} value={p.id}>
                        {p.nome} · {formatarHectares(p.areaM2)} · {estado}
                      </option>
                    );
                  })}
                {loteEscolhido && <option value="__fora">Tirar do pasto (sem pasto)</option>}
              </select>
            </label>
            <label>
              Data
              <input type="date" value={mudanca.data} max={hoje} onChange={(e) => setMudanca({ ...mudanca, data: e.target.value })} required />
            </label>
            <div className="botoes">
              <button className="primario" disabled={enviando || !mudanca.loteId || !mudanca.pastoId}>
                Registrar mudança
              </button>
            </div>
          </form>
        </>
      )}

      <h2>Lotação</h2>
      {visiveis.length === 0 && (
        <p className="vazio">{admin ? "Cadastre os pastos abaixo, com a área de cada um." : "Nenhum pasto cadastrado ainda."}</p>
      )}
      {lotes.length === 0 && visiveis.length > 0 && (
        <p className="ajuda">Crie lotes em Ajustes e coloque os animais neles para acompanhar a lotação de cada pasto.</p>
      )}
      <ul className="lista">
        {visiveis.map((p) => {
          const l = lotacao.get(p.id)!;
          const historico = historicoRotacao(ocupacoes, { pastoId: p.id }, hoje);
          const alta = l.uaPorHa !== null && l.uaPorHa > 3;
          return (
            <li key={p.id} className={`cartao pasto ${alta ? "pasto-alerta" : ""}`}>
              <div className="pasto-topo">
                <div className="pessoa-dados">
                  <strong>{p.nome}</strong>
                  <small>{formatarHectares(p.areaM2)}</small>
                </div>
                <span className={`selo ${l.atuais.length > 0 ? "selo-sincronizado" : "selo-anulada"}`}>
                  {l.atuais.length > 0
                    ? l.diasOcupado ? `Ocupado há ${dias(l.diasOcupado)}` : "Ocupado desde hoje"
                    : l.diasDescanso !== null
                      ? `Descanso há ${dias(l.diasDescanso)}`
                      : "Sem uso"}
                </span>
              </div>
              {l.atuais.length > 0 && (
                <>
                  <p className="pasto-lotes">
                    {l.atuais.map((o) => nomeLote.get(o.loteId) ?? "Lote apagado").join(", ")}
                  </p>
                  <div className="valores-linhas pasto-numeros">
                    <div>
                      <small>Animais</small>
                      <strong>{l.animais}</strong>
                    </div>
                    <div>
                      <small>UA</small>
                      <strong>{decimal(l.ua, 1)}</strong>
                    </div>
                    <div>
                      <small>Lotação</small>
                      <strong>{l.uaPorHa === null ? "—" : `${decimal(l.uaPorHa)} UA/ha`}</strong>
                    </div>
                  </div>
                  {l.semPeso > 0 && <small className="ajuda">{l.semPeso} animal(is) sem pesagem não entram na conta.</small>}
                  {alta && <small className="ajuda">Lotação alta: confira se o pasto aguenta.</small>}
                </>
              )}
              {historico.length > 0 && (
                <button className="link alinhar-esquerda" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                  {aberto === p.id ? "Esconder histórico" : `Histórico de rotação (${historico.length})`}
                </button>
              )}
              {aberto === p.id && (
                <ul className="lista-rotacao">
                  {historico.map((o) => (
                    <li key={o.id}>
                      <span>
                        <strong>{nomeLote.get(o.loteId) ?? "Lote apagado"}</strong>: {dataBr(o.entrada)} a{" "}
                        {o.saida ? dataBr(o.saida) : "hoje"} ({dias(o.dias)})
                      </span>
                      {admin && (
                        <button className="link" onClick={() => excluir(o)} disabled={enviando}>
                          Apagar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {admin && (
        <>
          <h2>Cadastro de pastos</h2>
          <p className="ajuda">Nada é apagado: desative o pasto que não usa mais para manter o histórico.</p>
          <div className="cartao lista-pessoas">
            {pastos.map((p) => (
              <div key={p.id} className={`pessoa ${p.ativo ? "" : "inativa"}`}>
                <div className="pessoa-dados">
                  <strong>{p.nome}</strong>
                  <small>{formatarHectares(p.areaM2)}</small>
                  {!p.ativo && <small className="sem-acesso">Desativado</small>}
                </div>
                <div className="pessoa-acoes">
                  <button
                    className="link"
                    onClick={() => setFormPasto({ id: p.id, nome: p.nome, area: hectaresParaTexto(p.areaM2) })}
                    disabled={enviando}
                  >
                    Alterar
                  </button>
                  <button className="link" onClick={() => alternar(p)} disabled={enviando || !online}>
                    {p.ativo ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </div>
            ))}
            <form className="pessoa novo-grupo form-pasto" onSubmit={salvar}>
              <input
                aria-label="Nome do pasto"
                placeholder="Ex.: Piquete 3"
                value={formPasto.nome}
                onChange={(e) => setFormPasto({ ...formPasto, nome: e.target.value })}
                maxLength={40}
                required
              />
              <input
                aria-label="Área em hectares"
                placeholder="Área (ha)"
                inputMode="decimal"
                value={formPasto.area}
                onChange={(e) => setFormPasto({ ...formPasto, area: e.target.value })}
                required
              />
              <div className="pessoa-acoes">
                <button className="primario" disabled={enviando || !online}>
                  {formPasto.id ? "Salvar" : "Adicionar"}
                </button>
                {formPasto.id && (
                  <button type="button" className="link" onClick={() => setFormPasto(FORM_PASTO)}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
          {!online && <p className="ajuda">O cadastro de pastos precisa de internet.</p>}
        </>
      )}
    </section>
  );
}
