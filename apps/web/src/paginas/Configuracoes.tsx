import { useEffect, useState, type FormEvent } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { caminhos, PERFIS, type Perfil } from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { InstalarApp } from "../componentes/InstalarApp";
import { alterarMembro, cancelarConvite, convidarPessoa, renomearPropriedade } from "../operacoes";

interface Membro {
  uid: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

interface Convite {
  email: string;
  nome: string;
  perfil: Perfil;
}

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  ADMIN: "Administrador: faz tudo",
  OPERADOR: "Operador: registra pesagens",
  CONSULTA: "Consulta: só visualiza",
};

const NOME_PERFIL: Record<Perfil, string> = { ADMIN: "Administrador", OPERADOR: "Operador", CONSULTA: "Consulta" };

/** Dados da fazenda e pessoas com acesso. Só para ADMIN; tudo aqui exige internet. */
export function Configuracoes() {
  const { vinculo, usuario, nomePropriedade, online } = useDados();
  const admin = pode(vinculo, "administrar");
  const pid = vinculo?.propriedadeId;

  const [nome, setNome] = useState(nomePropriedade);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [novo, setNovo] = useState({ email: "", nome: "", perfil: "OPERADOR" as Perfil });
  const [mensagem, setMensagem] = useState<{ tipo: "aviso" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => setNome(nomePropriedade), [nomePropriedade]);

  useEffect(() => {
    if (!admin || !pid) return;
    const cancelar = [
      onSnapshot(collection(db, caminhos.membros(pid)), (s) =>
        setMembros(
          s.docs
            .map((d) => ({ uid: d.id, ...(d.data() as Omit<Membro, "uid">) }))
            .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "")),
        ),
      ),
      onSnapshot(collection(db, caminhos.convites(pid)), (s) =>
        setConvites(s.docs.map((d) => d.data() as Convite).sort((a, b) => a.nome.localeCompare(b.nome))),
      ),
    ];
    return () => cancelar.forEach((c) => c());
  }, [admin, pid]);

  if (!admin || !pid) return <p>Apenas administradores acessam as configurações.</p>;

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    setMensagem(null);
    setEnviando(true);
    try {
      await acao();
      setMensagem({ tipo: "aviso", texto: sucesso });
      return true;
    } catch (e) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(e) });
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function salvarNome(e: FormEvent) {
    e.preventDefault();
    await executar(() => renomearPropriedade(db, pid!, nome), "Nome da fazenda atualizado.");
  }

  async function convidar(e: FormEvent) {
    e.preventDefault();
    const existente = membros.find((m) => m.email?.toLowerCase() === novo.email.trim().toLowerCase());
    if (existente) {
      setMensagem({
        tipo: "erro",
        texto: existente.ativo
          ? `${existente.nome} já tem acesso. Mude o perfil na lista acima.`
          : `${existente.nome} já foi cadastrado. Use "Devolver acesso" na lista acima.`,
      });
      return;
    }
    const ok = await executar(
      () => convidarPessoa(db, pid!, usuario!.uid, novo),
      `Convite criado. ${novo.nome.trim()} já pode entrar com o Google usando ${novo.email.trim().toLowerCase()}.`,
    );
    if (ok) setNovo({ email: "", nome: "", perfil: "OPERADOR" });
  }

  function mudarPerfil(m: Membro, perfil: Perfil) {
    void executar(() => alterarMembro(db, pid!, m.uid, { perfil }), `${m.nome} agora é ${NOME_PERFIL[perfil]}.`);
  }

  function mudarAtivo(m: Membro) {
    if (m.ativo && !window.confirm(`Tirar o acesso de ${m.nome}? A pessoa não verá mais os dados da fazenda.`)) return;
    void executar(
      () => alterarMembro(db, pid!, m.uid, { ativo: !m.ativo }),
      m.ativo ? `${m.nome} não tem mais acesso.` : `${m.nome} voltou a ter acesso.`,
    );
  }

  function cancelar(c: Convite) {
    void executar(() => cancelarConvite(db, pid!, c.email), `Convite de ${c.nome} cancelado.`);
  }

  const bloqueado = enviando || !online;

  return (
    <section className="configuracoes">
      <h1>Configurações</h1>
      {!online && <p className="erro">Sem internet. As configurações precisam de conexão.</p>}
      {mensagem && <p className={mensagem.tipo}>{mensagem.texto}</p>}

      <h2>Fazenda</h2>
      <form onSubmit={salvarNome} className="cartao">
        <label>
          Nome da fazenda
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required />
        </label>
        <button className="primario" disabled={bloqueado || nome.trim() === nomePropriedade}>
          Salvar nome
        </button>
      </form>

      <h2>Pessoas com acesso</h2>
      <div className="cartao lista-pessoas">
        {membros.map((m) => {
          const eu = m.uid === usuario?.uid;
          return (
            <div key={m.uid} className={`pessoa ${m.ativo ? "" : "inativa"}`}>
              <div className="pessoa-dados">
                <strong>
                  {m.nome || m.email}
                  {eu && <small> (você)</small>}
                </strong>
                <small>{m.email}</small>
                {!m.ativo && <small className="sem-acesso">Sem acesso</small>}
              </div>
              {eu ? (
                <span className="perfil-fixo">{NOME_PERFIL[m.perfil]}</span>
              ) : (
                <div className="pessoa-acoes">
                  <select
                    aria-label={`Perfil de ${m.nome}`}
                    value={m.perfil}
                    onChange={(e) => mudarPerfil(m, e.target.value as Perfil)}
                    disabled={bloqueado || !m.ativo}
                  >
                    {PERFIS.map((p) => (
                      <option key={p} value={p}>
                        {NOME_PERFIL[p]}
                      </option>
                    ))}
                  </select>
                  <button className="link" onClick={() => mudarAtivo(m)} disabled={bloqueado}>
                    {m.ativo ? "Tirar acesso" : "Devolver acesso"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {convites.length > 0 && (
        <>
          <h2>Convites aguardando o primeiro acesso</h2>
          <div className="cartao lista-pessoas">
            {convites.map((c) => (
              <div key={c.email} className="pessoa">
                <div className="pessoa-dados">
                  <strong>{c.nome}</strong>
                  <small>
                    {c.email} · {NOME_PERFIL[c.perfil]}
                  </small>
                </div>
                <button className="link" onClick={() => cancelar(c)} disabled={bloqueado}>
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Adicionar pessoa</h2>
      <form onSubmit={convidar} className="cartao">
        <label>
          Nome
          <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} maxLength={80} required />
        </label>
        <label>
          E-mail do Google (Gmail)
          <input
            type="email"
            value={novo.email}
            onChange={(e) => setNovo({ ...novo, email: e.target.value })}
            autoCapitalize="none"
            required
          />
        </label>
        <label>
          Perfil
          <select value={novo.perfil} onChange={(e) => setNovo({ ...novo, perfil: e.target.value as Perfil })}>
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {DESCRICAO_PERFIL[p]}
              </option>
            ))}
          </select>
        </label>
        <p className="ajuda">
          A pessoa abre o app, clica em <strong>Entrar com Google</strong> com esse e-mail e já entra na fazenda.
        </p>
        <button className="primario" disabled={bloqueado}>
          Adicionar
        </button>
      </form>

      <h2>Instalar no celular</h2>
      <InstalarApp sempre />
      <p className="ajuda">Se o app já estiver instalado neste aparelho, este botão não aparece.</p>
    </section>
  );
}
