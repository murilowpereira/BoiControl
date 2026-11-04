import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { GerenciarGrupo } from "../componentes/GerenciarGrupo";
import { ProtocolosSanitarios } from "../componentes/ProtocolosSanitarios";
import { collection, onSnapshot } from "firebase/firestore";
import { caminhos, PERFIS, type Perfil } from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { InstalarApp } from "../componentes/InstalarApp";
import { alterarMembro, cancelarConvite, convidarPessoa, renomearPropriedade, salvarDiasAlerta, salvarPesoAbate } from "../operacoes";

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
  const { vinculo, usuario, nomePropriedade, online, categorias, lotes, vacinas, diasAlerta, pesoAbateKg } = useDados();
  const [pesoAlvo, setPesoAlvo] = useState(String(pesoAbateKg));
  useEffect(() => setPesoAlvo(String(pesoAbateKg)), [pesoAbateKg]);
  const [dias, setDias] = useState(String(diasAlerta));
  useEffect(() => setDias(String(diasAlerta)), [diasAlerta]);
  const admin = pode(vinculo, "administrar");
  const pid = vinculo?.propriedadeId;

  const [nome, setNome] = useState(nomePropriedade);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [novo, setNovo] = useState({ email: "", nome: "", perfil: "OPERADOR" as Perfil });
  const [mensagem, setMensagem] = useState<{ tipo: "aviso" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => setNome(nomePropriedade), [nomePropriedade]);

  // A mensagem aparece fixa na parte de baixo e some sozinha depois de alguns segundos.
  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(() => setMensagem(null), mensagem.tipo === "erro" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [mensagem]);

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
      {mensagem && (
        <p className={`${mensagem.tipo} toast`} role="status">
          {mensagem.texto}
        </p>
      )}

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

      <h2>Alerta de pesagem</h2>
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          void executar(() => salvarDiasAlerta(db, pid!, Number(dias)), `O painel vai avisar sobre animais sem pesagem há mais de ${dias} dias.`);
        }}
      >
        <label>
          Avisar no painel quando um animal ficar sem pesagem por mais de (dias)
          <input type="number" inputMode="numeric" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} required />
        </label>
        <button className="primario" disabled={bloqueado || dias === String(diasAlerta)}>
          Salvar
        </button>
      </form>

      <h2>Peso de abate</h2>
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          void executar(() => salvarPesoAbate(db, pid!, Number(pesoAlvo)), `A previsão de abate agora usa ${pesoAlvo} kg.`);
        }}
      >
        <label>
          Peso vivo de abate (kg), usado na previsão dos indicadores
          <input type="number" inputMode="numeric" min={100} max={1500} value={pesoAlvo} onChange={(e) => setPesoAlvo(e.target.value)} required />
        </label>
        <p className="ajuda">Exemplo: 540 kg de peso vivo dão cerca de 18 @ de carcaça.</p>
        <button className="primario" disabled={bloqueado || pesoAlvo === String(pesoAbateKg)}>
          Salvar
        </button>
      </form>

      <h2>Categorias</h2>
      <GerenciarGrupo
        pid={pid}
        colecao="categorias"
        itens={categorias}
        singular="categoria"
        exemplo="Novilha prenha"
        bloqueado={bloqueado}
        executar={executar}
      />

      <h2>Lotes</h2>
      <p className="ajuda">
        Agrupe os animais para ver o ganho médio de cada lote no painel e pesar um lote por vez. Os pastos, com a área e a
        rotação dos lotes, ficam em <Link to="/pastos">Pastos e piquetes</Link>.
      </p>
      <GerenciarGrupo
        pid={pid}
        colecao="lotes"
        itens={lotes}
        singular="lote"
        exemplo="Engorda 2026"
        bloqueado={bloqueado}
        executar={executar}
      />

      <h2>Vacinas e vermífugos</h2>
      <p className="ajuda">Os ativos aparecem na tela de pesagem e na agenda sanitária para marcar o que foi aplicado.</p>
      <GerenciarGrupo
        pid={pid}
        colecao="vacinas"
        itens={vacinas}
        singular="vacina ou vermífugo"
        exemplo="Ivermectina"
        bloqueado={bloqueado}
        executar={executar}
      />
      {vacinas.some((v) => v.ativo) && (
        <>
          <h3>Carência e repetição</h3>
          <p className="ajuda">
            Carência: dias depois da aplicação em que o animal não pode ir para o abate (veja na bula). Repetir a cada: a agenda
            sanitária avisa quando a próxima dose do lote vence.
          </p>
          <ProtocolosSanitarios pid={pid} itens={vacinas} bloqueado={bloqueado} executar={executar} />
        </>
      )}

      <h2>Histórico de alterações</h2>
      <Link to="/historico" className="botao">
        Ver quem alterou o quê
      </Link>

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
