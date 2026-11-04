import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import {
  acompanharReproducao,
  dataIsoNoFuso,
  diasEntre,
  formatarDataIso,
  normalizarBrinco,
  resumirReproducao,
  somarDias,
  TIPOS_SERVICO,
  type Diagnostico,
  type TipoServico,
} from "@boicontrol/core";
import { pode, useDados, type Animal, type Reproducao as RegistroTela } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { criarAnimal, registrarDiagnostico, registrarPartoSemBezerro, registrarServico } from "../operacoes";

const nomeTipo = (t: TipoServico) => TIPOS_SERVICO.find((x) => x.id === t)?.nome ?? t;

function textoDias(dias: number): string {
  if (dias === 0) return "hoje";
  if (dias > 0) return `em ${dias} dia(s)`;
  return `atrasado ${-dias} dia(s)`;
}

/** Cobertura/inseminação, diagnóstico de prenhez, previsão de parto e bezerro ligado à mãe. */
export function Reproducao() {
  const { animais, reproducoes, vinculo, usuario, fuso } = useDados();
  const [params, setParams] = useSearchParams();
  const [mensagem, setMensagem] = useState("");
  const [parto, setParto] = useState<RegistroTela | null>(null);
  const hoje = dataIsoNoFuso(new Date(), fuso);
  const podeRegistrar = pode(vinculo, "registrarPesagem");
  const femeaInicial = params.get("femea");
  const [novo, setNovo] = useState(!!femeaInicial);

  const porId = new Map(animais.map((a) => [a.id, a]));
  const emAberto = reproducoes.filter((r) => porId.get(r.femeaId)?.situacao === "ATIVO");
  const acomp = acompanharReproducao(emAberto, hoje);
  const ultimoAno = resumirReproducao(reproducoes.filter((r) => r.dataServico >= somarDias(hoje, -365)));
  const femeas = animais
    .filter((a) => a.sexo === "F" && a.situacao === "ATIVO")
    .sort((a, b) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true }));
  const brinco = (id: string) => porId.get(id)?.brinco ?? "—";

  const aoFalhar = (e: unknown) => setMensagem(`O servidor recusou a gravação: ${mensagemDeErro(e)}`);
  const salvo = () => (navigator.onLine ? "Salvo." : "Salvo no aparelho. Será enviado quando houver internet.");

  function diagnosticar(r: RegistroTela, d: Diagnostico) {
    setMensagem("");
    try {
      registrarDiagnostico(db, vinculo!.propriedadeId, usuario!.uid, r, d, hoje, hoje, aoFalhar);
      setMensagem(`${brinco(r.femeaId)} marcada como ${d === "PRENHE" ? "prenhe" : "vazia"}. ${salvo()}`);
    } catch (e) {
      setMensagem(mensagemDeErro(e));
    }
  }

  return (
    <section>
      <Link to="/" className="voltar">
        ← Painel
      </Link>
      <h1>Reprodução</h1>

      <div className="indicadores">
        <div className="indicador">
          <span>Prenhes</span>
          <strong>{acomp.prenhes.length}</strong>
        </div>
        <div className={`indicador ${acomp.partosProximos ? "alerta" : ""}`}>
          <span>Partos em 30 dias</span>
          <strong>{acomp.partosProximos}</strong>
        </div>
        <div className={`indicador ${acomp.diagnosticosPendentes ? "alerta" : ""}`}>
          <span>Para diagnosticar</span>
          <strong>{acomp.diagnosticosPendentes}</strong>
          <small>30 dias ou mais da cobertura</small>
        </div>
        <div className="indicador">
          <span>Taxa de prenhez</span>
          <strong>{ultimoAno.taxaPrenhez === null ? "—" : `${Math.round(ultimoAno.taxaPrenhez * 100)}%`}</strong>
          <small>últimos 12 meses</small>
        </div>
      </div>

      {mensagem && <p className="aviso">{mensagem}</p>}

      {podeRegistrar &&
        (novo ? (
          <FormServico
            femeas={femeas}
            femeaInicial={femeaInicial}
            hoje={hoje}
            cancelar={() => {
              setNovo(false);
              setParams({});
            }}
            salvar={(s) => {
              try {
                registrarServico(db, vinculo!.propriedadeId, usuario!.uid, s, hoje, aoFalhar);
                setMensagem(`${nomeTipo(s.tipo)} de ${brinco(s.femeaId)} registrada. ${salvo()}`);
                setNovo(false);
                setParams({});
                return null;
              } catch (e) {
                return mensagemDeErro(e);
              }
            }}
          />
        ) : (
          <button className="primario grande" onClick={() => setNovo(true)} disabled={femeas.length === 0}>
            Registrar cobertura ou inseminação
          </button>
        ))}
      {podeRegistrar && femeas.length === 0 && <p className="ajuda">Cadastre fêmeas para registrar a reprodução.</p>}

      {parto && (
        <FormParto
          key={parto.id}
          registro={parto}
          mae={porId.get(parto.femeaId)}
          hoje={hoje}
          aoTerminar={(m) => {
            setParto(null);
            if (m) setMensagem(m);
          }}
          aoFalhar={aoFalhar}
        />
      )}

      <h2>Partos previstos</h2>
      {acomp.prenhes.length === 0 ? (
        <p className="vazio">Nenhuma fêmea prenhe.</p>
      ) : (
        <ul className="lista">
          {acomp.prenhes.map(({ registro: r, previsao, diasParaParto }) => (
            <li key={r.id} className={`linha-reproducao ${diasParaParto <= 30 ? "proximo" : ""}`}>
              <div>
                <Link to={`/animais/${r.femeaId}`}>
                  <strong>{brinco(r.femeaId)}</strong>
                </Link>
                <small>
                  {nomeTipo(r.tipo)} em {formatarDataIso(r.dataServico)}
                  {r.reprodutor ? ` · ${r.reprodutor}` : ""}
                </small>
              </div>
              <div className="direita">
                <span>{formatarDataIso(previsao)}</span>
                <small>{textoDias(diasParaParto)}</small>
                {podeRegistrar && (
                  <button className="link" onClick={() => setParto(r)}>
                    Registrar parto
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Aguardando diagnóstico</h2>
      {acomp.aguardando.length === 0 ? (
        <p className="vazio">Nenhuma cobertura aguardando diagnóstico.</p>
      ) : (
        <ul className="lista">
          {acomp.aguardando.map(({ registro: r, diasDesdeServico, pronto }) => (
            <li key={r.id} className="linha-reproducao">
              <div>
                <Link to={`/animais/${r.femeaId}`}>
                  <strong>{brinco(r.femeaId)}</strong>
                </Link>
                <small>
                  {nomeTipo(r.tipo)} em {formatarDataIso(r.dataServico)} · há {diasDesdeServico} dia(s)
                  {r.pendente ? " · não sincronizado" : ""}
                </small>
              </div>
              <div className="direita">
                {!pronto && <small>diagnóstico a partir de {formatarDataIso(somarDias(r.dataServico, 30))}</small>}
                {podeRegistrar && (
                  <span className="acoes">
                    <button onClick={() => diagnosticar(r, "PRENHE")}>Prenhe</button>
                    <button onClick={() => diagnosticar(r, "VAZIA")}>Vazia</button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="ajuda">
        Previsão de parto com gestação de 285 dias a partir da cobertura. O histórico de cada fêmea fica na ficha do animal.
      </p>
    </section>
  );
}

interface PropsServico {
  femeas: Animal[];
  femeaInicial: string | null;
  hoje: string;
  cancelar: () => void;
  /** Devolve a mensagem de erro, ou null se gravou. */
  salvar: (s: { femeaId: string; tipo: TipoServico; dataServico: string; reprodutor: string; observacao: string }) => string | null;
}

function FormServico({ femeas, femeaInicial, hoje, cancelar, salvar }: PropsServico) {
  const [femeaId, setFemeaId] = useState(femeas.some((f) => f.id === femeaInicial) ? femeaInicial! : (femeas[0]?.id ?? ""));
  const [tipo, setTipo] = useState<TipoServico>("MONTA");
  const [data, setData] = useState(hoje);
  const [reprodutor, setReprodutor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!femeaId) return setErro("Escolha a fêmea.");
    setErro(salvar({ femeaId, tipo, dataServico: data, reprodutor, observacao }) ?? "");
  }

  return (
    <form className="cartao" onSubmit={enviar}>
      <strong>Cobertura ou inseminação</strong>
      <label>
        Fêmea
        <select value={femeaId} onChange={(e) => setFemeaId(e.target.value)} required>
          {femeas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.brinco}
              {f.nome ? ` · ${f.nome}` : ""}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="opcoes">
        <legend>Tipo</legend>
        {TIPOS_SERVICO.map((t) => (
          <label key={t.id}>
            <input type="radio" checked={tipo === t.id} onChange={() => setTipo(t.id)} /> {t.nome}
          </label>
        ))}
      </fieldset>
      <label>
        Data
        <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} required />
      </label>
      <label>
        {tipo === "IA" ? "Sêmen (touro ou partida, opcional)" : "Touro (opcional)"}
        <input value={reprodutor} onChange={(e) => setReprodutor(e.target.value)} maxLength={80} />
      </label>
      <label>
        Observação (opcional)
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="botoes">
        <button type="button" className="link" onClick={cancelar}>
          Cancelar
        </button>
        <button className="primario">Salvar</button>
      </div>
    </form>
  );
}

interface PropsParto {
  registro: RegistroTela;
  mae: Animal | undefined;
  hoje: string;
  aoTerminar: (mensagem: string | null) => void;
  aoFalhar: (e: unknown) => void;
}

/** Parto com o cadastro do bezerro (ADMIN, com internet) ou sem bezerro (natimorto, cadastro depois). */
export function FormParto({ registro, mae, hoje, aoTerminar, aoFalhar }: PropsParto) {
  const { categorias, lotes, vinculo, usuario, online } = useDados();
  const admin = pode(vinculo, "administrar");
  const ativas = categorias.filter((c) => c.ativo);
  /** Parto já registrado sem bezerro: aqui só se cadastra o bezerro. */
  const soBezerro = !!registro.dataParto;
  const [data, setData] = useState(registro.dataParto ?? hoje);
  const [comBezerro, setComBezerro] = useState(soBezerro || (admin && online));
  const [brinco, setBrinco] = useState("");
  const [sexo, setSexo] = useState<"M" | "F">("M");
  const [categoriaId, setCategoriaId] = useState(ativas.find((c) => /bezerr/i.test(c.nome))?.id ?? ativas[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const loteDaMae = mae?.loteId && lotes.some((l) => l.id === mae.loteId && l.ativo) ? mae.loteId : null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!data || data > hoje) return setErro("Informe a data do parto (não pode ser no futuro).");
    if (diasEntre(registro.dataServico, data) < 0) return setErro("O parto não pode ser antes da cobertura.");
    if (!comBezerro) {
      try {
        registrarPartoSemBezerro(db, vinculo!.propriedadeId, usuario!.uid, registro, data, hoje, observacao, aoFalhar);
        aoTerminar(`Parto de ${mae?.brinco ?? "—"} registrado.`);
      } catch (err) {
        setErro(mensagemDeErro(err));
      }
      return;
    }
    const b = normalizarBrinco(brinco);
    if (!b.ok) return setErro("Brinco do bezerro inválido. Use letras, números ou hífen.");
    if (!categoriaId) return setErro("Cadastre uma categoria antes.");
    setEnviando(true);
    try {
      await criarAnimal(
        db,
        vinculo!.propriedadeId,
        usuario!.uid,
        { brinco: b.brinco, categoriaId, sexo, nome, dataNascimento: data, loteId: loteDaMae, maeId: registro.femeaId },
        { reproducaoId: registro.id, dataParto: data, hoje },
      );
      aoTerminar(`Parto registrado e bezerro ${b.brinco} cadastrado como cria de ${mae?.brinco ?? "—"}.`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={enviar}>
      <strong>{soBezerro ? "Bezerro" : "Parto"} de {mae?.brinco ?? "—"}</strong>
      <label>
        Data do parto
        <input type="date" value={data} max={hoje} min={registro.dataServico} onChange={(e) => setData(e.target.value)} disabled={soBezerro} required />
      </label>
      {admin && !soBezerro && (
        <label className="marcar">
          <input type="checkbox" checked={comBezerro} onChange={(e) => setComBezerro(e.target.checked)} /> Cadastrar o bezerro agora
        </label>
      )}
      {comBezerro ? (
        <>
          {!online && <p className="erro">Sem internet. O cadastro do bezerro precisa de conexão.</p>}
          <label>
            Brinco do bezerro
            <input value={brinco} onChange={(e) => setBrinco(e.target.value)} autoCapitalize="characters" required />
          </label>
          <fieldset className="opcoes">
            <legend>Sexo</legend>
            <label>
              <input type="radio" checked={sexo === "M"} onChange={() => setSexo("M")} /> Macho
            </label>
            <label>
              <input type="radio" checked={sexo === "F"} onChange={() => setSexo("F")} /> Fêmea
            </label>
          </fieldset>
          <label>
            Categoria
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nome (opcional)
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
          </label>
          <p className="ajuda">O bezerro entra com a data de nascimento do parto{loteDaMae ? " e no mesmo lote da mãe" : ""}.</p>
        </>
      ) : (
        <>
          <label>
            Observação (opcional)
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} placeholder="Ex.: natimorto" />
          </label>
          {!admin && <p className="ajuda">O administrador cadastra o bezerro depois, pela ficha da mãe.</p>}
        </>
      )}
      {erro && <p className="erro">{erro}</p>}
      <div className="botoes">
        <button type="button" className="link" onClick={() => aoTerminar(null)}>
          Cancelar
        </button>
        <button className="primario" disabled={enviando || (comBezerro && !online)}>
          {enviando ? "Salvando…" : soBezerro ? "Cadastrar bezerro" : "Registrar parto"}
        </button>
      </div>
    </form>
  );
}
