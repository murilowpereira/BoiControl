import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { novidadesDesde, VERSAO_ATUAL } from "../versoes";

const CHAVE = "boicontrol:versaoVista";

function ler(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function marcarVista() {
  try {
    localStorage.setItem(CHAVE, VERSAO_ATUAL);
  } catch {
    /* sem armazenamento: o aviso só não é lembrado */
  }
}

/**
 * Depois de uma atualização, avisa uma vez que há novidades. Na primeira vez
 * que o app abre neste aparelho não há aviso: só guardamos a versão.
 */
export function AvisoNovaVersao() {
  const { pathname } = useLocation();
  const [novas, setNovas] = useState(() => novidadesDesde(ler()));

  useEffect(() => {
    if (ler() === null || pathname === "/sobre") {
      marcarVista();
      setNovas([]);
    }
  }, [pathname]);

  if (novas.length === 0) return null;
  return (
    <div className="aviso-versao" role="status">
      <span>
        App atualizado para a versão <strong>{VERSAO_ATUAL}</strong>: {novas[0]!.titulo.toLowerCase()}.
      </span>
      <span className="aviso-versao-acoes">
        <Link to="/sobre">Ver novidades</Link>
        <button
          className="link"
          onClick={() => {
            marcarVista();
            setNovas([]);
          }}
        >
          Fechar
        </button>
      </span>
    </div>
  );
}
