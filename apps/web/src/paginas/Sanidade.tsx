import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { agendaSanitaria, carenciasAtivas, dataIsoNoFuso, type ItemAgenda } from "@boicontrol/core";
import { pode, useDados, type Animal } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { anularAplicacao, registrarAplicacao } from "../operacoes";

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const data = (d: Date) => FORMATO_DATA.format(d);
const ordenarBrinco = (a: Animal, b: Animal) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true });

/** Lembretes de vacina e vermífugo por lote e animais em carência (não podem ir para o abate). */
export function Sanidade() {
  const { animais, lotes, vacinas, aplicacoes, aplicacoesAnimais, vinculo, usuario, fuso } = useDados();
  const [params] = useSearchParams();
  const [mensagem, setMensagem] = useState<{ tipo: "aviso" | "erro"; texto: string } | null>(null);
  const [form, setForm] = useState<{ vacinaId: string; loteId: string; data: string; marcados: string[]; observacao: string } | null>(null);
  const [verTodasAplicacoes, setVerTodasAplicacoes] = useState(false);
  const agora = new Date();
  const podeAplicar = pode(vinculo, "registrarPesagem");
  const admin = pode(vinculo, "administrar");

  const porId = useMemo(() => new Map(animais.map((a) => [a.id, a])), [animais]);
  const nomeProduto = (id: string) => vacinas.find((v) => v.id === id)?.nome ?? id;
  const nomeLote = (id: string | null) => (id ? (lotes.find((l) => l.id === id)?.nome ?? id) : "Sem lote");
  const brinco = (id: string) => porId.get(id)?.brinco ?? "?";
  const ativos = animais.filter((a) => a.situacao === "ATIVO");

  const carencias = carenciasAtivas(aplicacoesAnimais, vacinas, agora);
  const emCarencia = ativos
    .filter((a) => carencias.has(a.id))
    .map((a) => ({ a, c: carencias.get(a.id)! }))
    .sort((x, y) => x.c.ate.getTime() - y.c.ate.getTime());
  const agenda = agendaSanitaria(ativos, vacinas, aplicacoesAnimais, agora);
  const temProtocolo = vacinas.some((v) => v.ativo && (v.carenciaDias || v.intervaloDias));
  const vacinasAtivas = vacinas.filter((v) => v.ativo);

  const animaisDoLote = (loteId: string) =>
    ativos.filter((a) => loteId === "*" || (a.loteId ?? "") === loteId).sort(ordenarBrinco);

  function abrir(vacinaId = params.get("vacina") ?? vacinasAtivas[0]?.id ?? "", loteId = "*", marcados?: string[]) {
    setMensagem(null);
    setForm({
      vacinaId,
      loteId,
      data: dataIsoNoFuso(agora, fuso),
      marcados: marcados ?? animaisDoLote(loteId).map((a) => a.id),
      observacao: "",
    });
  }

  function abrirDoItem(i: ItemAgenda) {
    const pendentes = [...i.atrasados.map((x) => x.animalId), ...i.proximos.map((x) => x.animalId), ...i.semRegistro];
    abrir(i.produtoId, i.loteId ?? "", pendentes);
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form || !vinculo || !usuario) return;
    const hoje = dataIsoNoFuso(new Date(), fuso);
    // Hoje: hora atual. Outro dia: meio-dia, para não cair no dia vizinho em outro fuso.
    const quando = form.data === hoje ? new Date() : new Date(`${form.data}T12:00:00`);
    try {
      registrarAplicacao(
        db,
        {
          pid: vinculo.propriedadeId,
          uid: usuario.uid,
          vacinaId: form.vacinaId,
          data: quando,
          animalIds: form.marcados,
          loteId: form.loteId === "*" || form.loteId === "" ? null : form.loteId,
          observacao: form.observacao,
        },
        (erro) => setMensagem({ tipo: "erro", texto: `A aplicação foi recusada pelo servidor: ${mensagemDeErro(erro)}` }),
      );
      setMensagem({ tipo: "aviso", texto: `${nomeProduto(form.vacinaId)} registrado em ${form.marcados.length} animal(is).` });
      setForm(null);
    } catch (erro) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(erro) });
    }
  }

  async function anular(id: string) {
    if (!vinculo || !usuario) return;
    if (!window.confirm("Anular esta aplicação? Ela sai da agenda e da carência, mas continua no histórico.")) return;
    try {
      await anularAplicacao(db, vinculo.propriedadeId, usuario.uid, id);
      setMensagem({ tipo: "aviso", texto: "Aplicação anulada." });
    } catch (erro) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(erro) });
    }
  }

  const listaAplicacoes = verTodasAplicacoes ? aplicacoes : aplicacoes.slice(0, 5);

  return (
    <section className="sanidade">
      <Link to="/" className="voltar">
        ← Painel
      </Link>
      <h1>Agenda sanitária</h1>

      {vacinasAtivas.length === 0 ? (
        <p className="vazio">
          Cadastre as vacinas e os vermífugos em {admin ? <Link to="/configuracoes">Ajustes</Link> : "Ajustes (peça a um administrador)"}.
        </p>
      ) : (
        !temProtocolo && (
          <p className="ajuda">
            Informe a carência e de quantos em quantos dias repetir cada produto em{" "}
            {admin ? <Link to="/configuracoes">Ajustes</Link> : "Ajustes"} para ver os lembretes e os avisos de carência.
          </p>
        )
      )}

      {mensagem && (
        <p className={mensagem.tipo} role={mensagem.tipo === "erro" ? "alert" : "status"}>
          {mensagem.texto}
        </p>
      )}

      {podeAplicar && vacinasAtivas.length > 0 && !form && (
        <button className="primario grande" onClick={() => abrir()}>
          Registrar aplicação
        </button>
      )}

      {form && (
        <form className="cartao" onSubmit={salvar}>
          <strong>Registrar aplicação</strong>
          <label>
            Vacina ou vermífugo
            <select value={form.vacinaId} onChange={(e) => setForm({ ...form, vacinaId: e.target.value })} required>
              {vacinasAtivas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lote
            <select
              value={form.loteId}
              onChange={(e) => setForm({ ...form, loteId: e.target.value, marcados: animaisDoLote(e.target.value).map((a) => a.id) })}
            >
              <option value="*">Todos os animais ativos</option>
              {lotes
                .filter((l) => l.ativo)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              {lotes.length > 0 && <option value="">Sem lote</option>}
            </select>
          </label>
          <label>
            Data
            <input
              type="date"
              value={form.data}
              max={dataIsoNoFuso(agora, fuso)}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
              required
            />
          </label>
          <fieldset className="vacinas-pesagem">
            <legend>
              Animais ({form.marcados.length} de {animaisDoLote(form.loteId).length})
            </legend>
            <div className="marcar-animais">
              {animaisDoLote(form.loteId).map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={form.marcados.includes(a.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        marcados: e.target.checked ? [...form.marcados, a.id] : form.marcados.filter((x) => x !== a.id),
                      })
                    }
                  />
                  {a.brinco}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Observação (opcional)
            <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} maxLength={200} />
          </label>
          <div className="acoes-situacao">
            <button className="primario" disabled={form.marcados.length === 0 || !form.vacinaId}>
              Salvar
            </button>
            <button type="button" className="link" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <h2>Em carência</h2>
      {emCarencia.length === 0 ? (
        <p className="vazio">Nenhum animal em carência.</p>
      ) : (
        <div className="cartao alerta-carencia">
          <strong>{emCarencia.length} animal(is) não podem ir para o abate ainda</strong>
          <ul className="lista">
            {emCarencia.map(({ a, c }) => (
              <li key={a.id}>
                <Link to={`/animais/${a.id}`}>
                  <div>
                    <strong>{a.brinco}</strong>
                    <small>
                      {nomeProduto(c.produtoId)} em {data(c.aplicadoEm)}
                    </small>
                  </div>
                  <span className="direita">liberado em {data(c.ate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>Próximas doses por lote</h2>
      {agenda.length === 0 ? (
        <p className="vazio">
          Nada a repetir. Os lembretes aparecem depois da primeira aplicação de um produto que tem "repetir a cada" em Ajustes.
        </p>
      ) : (
        agenda.map((i) => {
          const pendentes = i.atrasados.length + i.proximos.length + i.semRegistro.length;
          return (
            <div key={`${i.loteId}|${i.produtoId}`} className={`cartao item-agenda ${i.atrasados.length ? "atrasada" : ""}`}>
              <strong>
                {nomeLote(i.loteId)} · {nomeProduto(i.produtoId)}
              </strong>
              {i.atrasados.length > 0 && (
                <span className="erro">
                  Atrasada desde {data(i.atrasados[0]!.vence)}: {i.atrasados.map((x) => brinco(x.animalId)).join(", ")}
                </span>
              )}
              {i.proximos.length > 0 && (
                <span>
                  Vence até {data(i.proximos[i.proximos.length - 1]!.vence)}: {i.proximos.map((x) => brinco(x.animalId)).join(", ")}
                </span>
              )}
              {i.semRegistro.length > 0 && <span className="ajuda">Sem registro: {i.semRegistro.map(brinco).join(", ")}</span>}
              {pendentes === 0 && i.proximaData && <span className="ajuda">Em dia. Próxima dose em {data(i.proximaData)}.</span>}
              {podeAplicar && pendentes > 0 && (
                <button onClick={() => abrirDoItem(i)} disabled={!!form}>
                  Registrar aplicação ({pendentes})
                </button>
              )}
            </div>
          );
        })
      )}

      {aplicacoes.length > 0 && (
        <>
          <h2>Aplicações no lote</h2>
          <ul className="lista">
            {listaAplicacoes.map((ap) => (
              <li key={ap.id} className={`linha-grupo ${ap.anulada ? "inativa" : ""}`}>
                <div>
                  <strong>
                    {nomeProduto(ap.vacinaId)} · {ap.animalIds.length} animal(is)
                  </strong>
                  <small>
                    {data(ap.data.toDate())} · {ap.loteId ? nomeLote(ap.loteId) : "vários lotes"}
                    {ap.observacao ? ` · ${ap.observacao}` : ""}
                    {ap.anulada ? " · anulada" : ""}
                    {ap.pendente ? " · não sincronizada" : ""}
                  </small>
                </div>
                {admin && !ap.anulada && !ap.pendente && (
                  <button className="link direita" onClick={() => void anular(ap.id)}>
                    Anular
                  </button>
                )}
              </li>
            ))}
          </ul>
          {aplicacoes.length > 5 && (
            <button className="link" onClick={() => setVerTodasAplicacoes(!verTodasAplicacoes)}>
              {verTodasAplicacoes ? "Mostrar menos" : `Ver todas (${aplicacoes.length})`}
            </button>
          )}
        </>
      )}

      <p className="ajuda">
        Também contam as vacinas e os vermífugos marcados na pesagem. O app avisa aqui e no painel; não há aviso no celular com o
        app fechado.
      </p>
    </section>
  );
}
