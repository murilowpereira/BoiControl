import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { dataIsoNoFuso, formatarChuva, lerChuvaMm } from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { excluirChuva, registrarChuva } from "../operacoes";

const dataBr = (d: string) => d.split("-").reverse().join("/");
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Anotação diária do pluviômetro. Funciona sem internet, como a pesagem. */
export function Chuva() {
  const { vinculo, usuario, fuso, chuvas } = useDados();
  const hoje = dataIsoNoFuso(new Date(), fuso);
  const [data, setData] = useState(hoje);
  const [mm, setMm] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "aviso" | "erro"; texto: string } | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(() => setMensagem(null), mensagem.tipo === "erro" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [mensagem]);

  const podeRegistrar = pode(vinculo, "registrarPesagem");
  const pid = vinculo!.propriedadeId;
  const existente = chuvas.find((c) => c.data === data);
  const falhou = (e: unknown) => setMensagem({ tipo: "erro", texto: mensagemDeErro(e) });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const decimosMm = lerChuvaMm(mm);
    if (decimosMm === null) {
      setMensagem({ tipo: "erro", texto: "Informe a chuva em mm, de 0 a 500 (uma casa decimal, ex.: 12,5)." });
      return;
    }
    if (data > hoje) {
      setMensagem({ tipo: "erro", texto: "A data não pode ser no futuro." });
      return;
    }
    try {
      registrarChuva(db, pid, usuario!.uid, { data, decimosMm }, falhou);
      setMensagem({ tipo: "aviso", texto: `${formatarChuva(decimosMm)} anotados em ${dataBr(data)}.` });
      setMm("");
    } catch (erro) {
      falhou(erro);
    }
  }

  function excluir(d: string) {
    if (!window.confirm(`Apagar a chuva de ${dataBr(d)}?`)) return;
    excluirChuva(db, pid, d, falhou);
  }

  // Total por mês, do mais recente para o mais antigo.
  const meses = new Map<string, { total: number; dias: number }>();
  for (const c of chuvas) {
    const m = c.data.slice(0, 7);
    const g = meses.get(m) ?? { total: 0, dias: 0 };
    g.total += c.decimosMm;
    g.dias++;
    meses.set(m, g);
  }
  const listadas = verTodas ? chuvas : chuvas.slice(0, 15);

  return (
    <section className="chuva-pagina">
      <Link to="/" className="voltar">
        ← Painel
      </Link>
      <h1>Chuva</h1>
      <p className="ajuda">
        Anote a leitura do pluviômetro de cada dia. Dias sem chuva podem ser anotados com 0 mm. A comparação com o
        ganho de peso fica em <Link to="/indicadores">Indicadores</Link>.
      </p>

      {podeRegistrar && (
        <form className="cartao" onSubmit={enviar}>
          <label>
            Data
            <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} required />
          </label>
          <label>
            Chuva (mm)
            <input
              inputMode="decimal"
              value={mm}
              onChange={(e) => setMm(e.target.value)}
              placeholder="ex.: 12,5"
              required
              autoFocus
            />
          </label>
          {existente && (
            <small className="ajuda">Já há {formatarChuva(existente.decimosMm)} nesta data; salvar substitui.</small>
          )}
          <button className="primario">Salvar</button>
          {mensagem && <p className={mensagem.tipo}>{mensagem.texto}</p>}
        </form>
      )}

      <h2>Total por mês</h2>
      {meses.size === 0 ? (
        <p className="vazio">Nenhuma chuva anotada ainda.</p>
      ) : (
        <ul className="lista">
          {[...meses].map(([m, g]) => (
            <li key={m} className="linha-grupo">
              <div>
                <strong>
                  {NOMES_MES[Number(m.slice(5)) - 1]} de {m.slice(0, 4)}
                </strong>
                <small>{g.dias} dia(s) anotado(s)</small>
              </div>
              <div className="direita">
                <span>{formatarChuva(g.total)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {chuvas.length > 0 && (
        <>
          <h2>Leituras</h2>
          <ul className="lista">
            {listadas.map((c) => (
              <li key={c.data} className="linha-grupo">
                <div>
                  <strong>{dataBr(c.data)}</strong>
                  {c.pendente && <small>aguardando internet</small>}
                </div>
                <div className="direita linha-acoes">
                  <span>{formatarChuva(c.decimosMm)}</span>
                  {podeRegistrar && (
                    <button className="link" onClick={() => excluir(c.data)} aria-label={`Apagar chuva de ${dataBr(c.data)}`}>
                      Apagar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {chuvas.length > 15 && (
            <button className="link" onClick={() => setVerTodas(!verTodas)}>
              {verTodas ? "Mostrar menos" : `Ver todas (${chuvas.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
