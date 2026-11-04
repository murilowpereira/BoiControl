import { useState } from "react";
import { Link } from "react-router";
import {
  dataIsoNoFuso,
  formatarDataIso,
  NOMES_SITUACAO_REPRODUCAO,
  previsaoParto,
  situacaoReproducao,
  TIPOS_SERVICO,
} from "@boicontrol/core";
import { pode, useDados, type Animal, type Reproducao } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { excluirReproducao } from "../operacoes";
import { FormParto } from "./Reproducao";

/** Histórico reprodutivo e crias na ficha da fêmea. */
export function ReproducaoDaFemea({ femea }: { femea: Animal }) {
  const { animais, reproducoes, vinculo, online, fuso } = useDados();
  const [mensagem, setMensagem] = useState("");
  const [bezerroDe, setBezerroDe] = useState<Reproducao | null>(null);
  const admin = pode(vinculo, "administrar");
  const hoje = dataIsoNoFuso(new Date(), fuso);
  const registros = reproducoes.filter((r) => r.femeaId === femea.id);
  const crias = animais.filter((a) => a.maeId === femea.id).sort((a, b) => (b.dataNascimento ?? "").localeCompare(a.dataNascimento ?? ""));
  const porId = new Map(animais.map((a) => [a.id, a]));

  async function excluir(r: Reproducao) {
    if (!window.confirm(`Excluir o registro de ${formatarDataIso(r.dataServico)}? Use só para lançamento errado.`)) return;
    try {
      await excluirReproducao(db, vinculo!.propriedadeId, r.id);
      setMensagem("Registro excluído.");
    } catch (e) {
      setMensagem(mensagemDeErro(e));
    }
  }

  return (
    <>
      <h2>Reprodução</h2>
      {mensagem && <p className="aviso">{mensagem}</p>}
      {femea.situacao === "ATIVO" && pode(vinculo, "registrarPesagem") && (
        <Link to={`/reproducao?femea=${femea.id}`} className="botao">
          Registrar cobertura ou inseminação
        </Link>
      )}
      {bezerroDe && (
        <FormParto
          key={bezerroDe.id}
          registro={bezerroDe}
          mae={femea}
          hoje={hoje}
          aoTerminar={(m) => {
            setBezerroDe(null);
            if (m) setMensagem(m);
          }}
          aoFalhar={(e) => setMensagem(mensagemDeErro(e))}
        />
      )}
      {registros.length === 0 ? (
        <p className="vazio">Nenhuma cobertura registrada.</p>
      ) : (
        <ul className="lista">
          {registros.map((r) => {
            const s = situacaoReproducao(r);
            const bezerro = r.bezerroId ? porId.get(r.bezerroId) : undefined;
            return (
              <li key={r.id} className="linha-reproducao">
                <div>
                  <strong>
                    {TIPOS_SERVICO.find((t) => t.id === r.tipo)?.nome} em {formatarDataIso(r.dataServico)}
                  </strong>
                  <small>
                    {r.reprodutor ? `${r.reprodutor} · ` : ""}
                    {r.dataDiagnostico && s !== "PARIU" ? `diagnóstico em ${formatarDataIso(r.dataDiagnostico)}` : ""}
                    {s === "PRENHE" ? ` · parto previsto ${formatarDataIso(previsaoParto(r.dataServico))}` : ""}
                    {s === "PARIU" ? `parto em ${formatarDataIso(r.dataParto)}` : ""}
                    {r.observacao ? ` · ${r.observacao}` : ""}
                  </small>
                  {bezerro && (
                    <small>
                      Bezerro: <Link to={`/animais/${bezerro.id}`}>{bezerro.brinco}</Link>
                    </small>
                  )}
                </div>
                <div className="direita">
                  <span className={`selo ${s === "PRENHE" || s === "PARIU" ? "selo-sincronizado" : s === "VAZIA" ? "selo-anulada" : "selo-pendente"}`}>
                    {NOMES_SITUACAO_REPRODUCAO[s]}
                  </span>
                  {admin && s === "PARIU" && !r.bezerroId && (
                    <button className="link" onClick={() => setBezerroDe(r)} disabled={!online}>
                      Cadastrar bezerro
                    </button>
                  )}
                  {admin && !r.bezerroId && (
                    <button className="link" onClick={() => excluir(r)} disabled={!online}>
                      Excluir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {crias.length > 0 && (
        <p className="detalhes">
          Crias:{" "}
          {crias.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link to={`/animais/${c.id}`}>{c.brinco}</Link>
            </span>
          ))}
        </p>
      )}
    </>
  );
}
