import { NavLink, Outlet, useNavigate } from "react-router";
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { useDados } from "../dados";
import { tempoDesde } from "../estado";

export function BarraSync() {
  const { online, pesagens, ultimaSincronizacao } = useDados();
  const pendentes = pesagens.filter((p) => p.pendente).length;
  return (
    <div className={`barra-sync ${online ? "" : "offline"}`} role="status">
      <span>{online ? "Online" : "Sem internet"}</span>
      <span>
        {pendentes > 0 ? `${pendentes} pesagem(ns) não sincronizada(s)` : "Tudo sincronizado"} · atualizado{" "}
        {tempoDesde(ultimaSincronizacao)}
      </span>
    </div>
  );
}

export function Layout() {
  const { nomePropriedade, pesagens } = useDados();
  const navegar = useNavigate();

  async function sair() {
    const pendentes = pesagens.filter((p) => p.pendente).length;
    if (
      pendentes > 0 &&
      !window.confirm(
        `Há ${pendentes} pesagem(ns) ainda não enviada(s). Se sair agora elas serão perdidas. Deseja sair mesmo assim?`,
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
        <Outlet />
      </main>
      <nav className="abas">
        <NavLink to="/" end>
          Painel
        </NavLink>
        <NavLink to="/animais">Animais</NavLink>
        <NavLink to="/pesar">Pesar</NavLink>
      </nav>
    </div>
  );
}
