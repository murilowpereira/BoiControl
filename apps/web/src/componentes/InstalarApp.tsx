import { useEffect, useState } from "react";

/** Evento do Chrome/Edge/Samsung Internet que permite abrir o pedido de instalação. */
interface EventoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// O navegador pode disparar o evento antes de o React montar: guardamos desde já.
let eventoGuardado: EventoInstalacao | null = null;
const ouvintes = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    eventoGuardado = e as EventoInstalacao;
    ouvintes.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    eventoGuardado = null;
    ouvintes.forEach((f) => f());
  });
}

const CHAVE_DISPENSADO = "boicontrol:instalarDispensado";

function jaInstalado(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ehIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function lerDispensado(): boolean {
  try {
    return localStorage.getItem(CHAVE_DISPENSADO) === "1";
  } catch {
    return false;
  }
}

/**
 * Convite para instalar o app no celular (PWA). No Android abre o pedido de
 * instalação do navegador; no iPhone, que não tem esse pedido, explica o caminho
 * pelo botão Compartilhar. Some quando o app já está instalado.
 */
export function InstalarApp({ sempre = false }: { sempre?: boolean }) {
  const [, forcar] = useState(0);
  const [dispensado, setDispensado] = useState(lerDispensado);
  const [mostrarPassos, setMostrarPassos] = useState(false);

  useEffect(() => {
    const f = () => forcar((n) => n + 1);
    ouvintes.add(f);
    return () => void ouvintes.delete(f);
  }, []);

  if (jaInstalado() || (dispensado && !sempre)) return null;
  const ios = ehIos();
  if (!eventoGuardado && !ios && !sempre) return null;

  async function instalar() {
    if (eventoGuardado) {
      const evento = eventoGuardado;
      await evento.prompt();
      const { outcome } = await evento.userChoice;
      if (outcome === "accepted") eventoGuardado = null;
      forcar((n) => n + 1);
    } else {
      setMostrarPassos(true);
    }
  }

  function dispensar() {
    try {
      localStorage.setItem(CHAVE_DISPENSADO, "1");
    } catch {
      /* sem armazenamento: só esconde nesta sessão */
    }
    setDispensado(true);
  }

  return (
    <div className="instalar" role="region" aria-label="Instalar o app">
      <div className="instalar-texto">
        <strong>Instale o BoiControl no celular</strong>
        <small>Abre como aplicativo, direto da tela inicial, e funciona sem internet.</small>
      </div>
      <div className="instalar-acoes">
        <button className="primario" onClick={instalar}>
          Instalar
        </button>
        {!sempre && (
          <button className="link" onClick={dispensar}>
            Agora não
          </button>
        )}
      </div>
      {mostrarPassos && (
        <ol className="instalar-passos">
          {ios ? (
            <>
              <li>
                Abra este endereço no <strong>Safari</strong>.
              </li>
              <li>
                Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).
              </li>
              <li>
                Escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.
              </li>
            </>
          ) : (
            <>
              <li>
                Abra este endereço no <strong>Chrome</strong>.
              </li>
              <li>
                Toque no menu <strong>⋮</strong> no canto de cima.
              </li>
              <li>
                Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
              </li>
            </>
          )}
        </ol>
      )}
    </div>
  );
}
