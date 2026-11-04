import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { pode, useDados } from "../dados";
import { tempoDesde } from "../estado";
import { InstalarApp } from "./InstalarApp";
import { AvisoNovaVersao } from "./AvisoNovaVersao";
import { conferirPendentes, useCadastrosOffline } from "../cadastrosOffline";

export function BarraSync() {
  const { online, pesagens, ultimaSincronizacao, vinculo } = useDados();
  const pendentes = pesagens.filter((p) => p.pendente).length;
  const cadastros = useCadastrosOffline().filter((c) => c.pid === vinculo?.propriedadeId && c.estado === "AGUARDANDO").length;
  const partes = [
    cadastros > 0 ? `${cadastros} cadastro(s)` : null,
    pendentes > 0 ? `${pendentes} pesagem(ns)` : null,
  ].filter(Boolean);
  return (
    <div className={`barra-sync ${online ? "" : "offline"}`} role="status">
      <span>{online ? "Online" : "Sem internet"}</span>
      <span>
        {partes.length > 0 ? `${partes.join(" e ")} não sincronizado(s)` : "Tudo sincronizado"} · atualizado{" "}
        {tempoDesde(ultimaSincronizacao)}
      </span>
    </div>
  );
}

export function Layout() {
  const { nomePropriedade, pesagens, vinculo, usuario, online, fuso } = useDados();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const cadastros = useCadastrosOffline();
  const pid = vinculo?.ativo ? vinculo.propriedadeId : null;
  const uid = usuario?.uid ?? null;

  // Cadastros feitos sem internet em outra sessão: confere quando há conexão.
  useEffect(() => {
    if (!online || !pid || !uid) return;
    conferirPendentes(db, pid, uid, fuso).catch((e) => console.error("Falha ao conferir cadastros", e));
  }, [online, pid, uid, fuso]);

  async function sair() {
    const pendentes = pesagens.filter((p) => p.pendente).length;
    const naoEnviados = cadastros.filter((c) => c.pid === pid).length;
    const itens = [
      naoEnviados > 0 ? `${naoEnviados} cadastro(s) de animal` : null,
      pendentes > 0 ? `${pendentes} pesagem(ns)` : null,
    ].filter(Boolean);
    if (
      itens.length > 0 &&
      !window.confirm(
        `Há ${itens.join(" e ")} ainda não enviado(s). Se sair agora serão perdidos. Deseja sair mesmo assim?`,
      )
    ) {
      return;
    }
    await signOut(auth);
    await terminate(db);
    await clearIndexedDbPersistence(db).catch(() => undefined);
    navegar("/");
    window.location.reload();
  }

  return (
    <div className="app">
      <header className="topo">
        <strong>{nomePropriedade || "BoiControl"}</strong>
        <button className="link" onClick={sair}>
          Sair
        </button>
      </header>
      <BarraSync />
      <main>
        <AvisoNovaVersao />
        {pathname !== "/configuracoes" && <InstalarApp />}
        <Outlet />
      </main>
      <nav className="abas">
        <NavLink to="/" end>
          Painel
        </NavLink>
        <NavLink to="/animais">Animais</NavLink>
        <NavLink to="/pesar">Pesar</NavLink>
        {pode(vinculo, "administrar") && <NavLink to="/configuracoes">Ajustes</NavLink>}
        <NavLink to="/sobre">Sobre</NavLink>
      </nav>
    </div>
  );
}
