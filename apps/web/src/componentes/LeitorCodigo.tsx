import { useEffect, useRef, useState } from "react";

/** Formatos comuns em brincos e etiquetas: QR, barras de varejo/logística e Data Matrix. */
const FORMATOS = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "itf", "upc_a", "upc_e", "codabar", "data_matrix"];

interface Props {
  /** Chamado uma vez, com o texto do primeiro código lido. */
  onLer: (texto: string) => void;
  onFechar: () => void;
}

function mensagemDeErro(e: unknown): string {
  const nome = e instanceof DOMException || e instanceof Error ? e.name : "";
  if (nome === "NotAllowedError" || nome === "SecurityError")
    return "O acesso à câmera foi negado. Libere a câmera para este app nas configurações do navegador e tente de novo.";
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "Nenhuma câmera encontrada neste aparelho.";
  if (nome === "NotReadableError") return "A câmera está sendo usada por outro app. Feche-o e tente de novo.";
  return "Não foi possível abrir a câmera. Digite o brinco.";
}

/**
 * Abre a câmera traseira e lê o QR ou código de barras do brinco.
 * Usa o leitor nativo do navegador (BarcodeDetector) quando existe; no iPhone e
 * em navegadores sem ele, carrega o ZXing, que fica guardado no aparelho e
 * funciona sem internet.
 */
export function LeitorCodigo({ onLer, onFechar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState("");
  const [lanterna, setLanterna] = useState<boolean | null>(null);
  const trilha = useRef<MediaStreamTrack | null>(null);
  const aoLer = useRef(onLer);
  aoLer.current = onLer;

  useEffect(() => {
    let ativo = true;
    let lido = false;
    let fluxo: MediaStream | null = null;
    let parar: () => void = () => {};

    function entregar(texto: string) {
      if (lido || !ativo || !texto.trim()) return;
      lido = true;
      navigator.vibrate?.(80);
      aoLer.current(texto);
    }

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro("Este navegador não dá acesso à câmera. Abra o app pelo endereço https ou digite o brinco.");
        return;
      }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
        return;
      }
      if (!ativo || !video.current) return fluxo.getTracks().forEach((t) => t.stop());
      const v = video.current;
      v.srcObject = fluxo;
      await v.play().catch(() => {});

      const t = fluxo.getVideoTracks()[0] ?? null;
      trilha.current = t;
      const capacidades = (t?.getCapabilities?.() ?? {}) as { torch?: boolean };
      if (capacidades.torch) setLanterna(false);

      const nativos = typeof BarcodeDetector !== "undefined" ? await BarcodeDetector.getSupportedFormats().catch(() => []) : [];
      const formatos = FORMATOS.filter((f) => nativos.includes(f));
      if (typeof BarcodeDetector !== "undefined" && formatos.length > 0) {
        const detector = new BarcodeDetector({ formats: formatos });
        let ocupado = false;
        const timer = window.setInterval(async () => {
          if (ocupado || v.readyState < 2) return;
          ocupado = true;
          try {
            const [codigo] = await detector.detect(v);
            if (codigo) entregar(codigo.rawValue);
          } catch {
            // Quadro ruim: tenta no próximo.
          } finally {
            ocupado = false;
          }
        }, 200);
        parar = () => window.clearInterval(timer);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (!ativo) return;
        const leitor = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 200 });
        const controles = await leitor.decodeFromVideoElement(v, (resultado) => {
          if (resultado) entregar(resultado.getText());
        });
        parar = () => controles.stop();
      }
      if (!ativo) parar();
    }

    iniciar().catch((e) => ativo && setErro(mensagemDeErro(e)));
    return () => {
      ativo = false;
      parar();
      fluxo?.getTracks().forEach((t) => t.stop());
      trilha.current = null;
    };
  }, []);

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [onFechar]);

  async function alternarLanterna() {
    const t = trilha.current;
    if (!t || lanterna === null) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !lanterna } as MediaTrackConstraintSet] });
      setLanterna(!lanterna);
    } catch {
      setLanterna(null);
    }
  }

  return (
    <div className="leitor" role="dialog" aria-modal="true" aria-label="Ler brinco pela câmera">
      <div className="leitor-video">
        <video ref={video} playsInline muted />
        {!erro && <div className="leitor-mira" aria-hidden="true" />}
      </div>
      <div className="leitor-rodape">
        {erro ? <p className="erro">{erro}</p> : <p>Aponte para o QR ou código de barras do brinco.</p>}
        <div className="leitor-botoes">
          {lanterna !== null && (
            <button type="button" onClick={alternarLanterna} aria-pressed={lanterna}>
              {lanterna ? "Apagar lanterna" : "Lanterna"}
            </button>
          )}
          <button type="button" className="primario" onClick={onFechar} autoFocus>
            Digitar o brinco
          </button>
        </div>
      </div>
    </div>
  );
}
