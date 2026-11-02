import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import {
  avaliarNovoPeso,
  diaNoFuso,
  formatarCodigo,
  formatarGmd,
  formatarPesoKg,
  lerPesoKg,
  TOLERANCIA_FUTURO_MS,
  type ErroPeso,
} from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { db } from "../firebase";
import { registrarPesagem } from "../operacoes";
import { recusadas } from "../recusadas";

const ERRO_PESO: Record<ErroPeso, string> = {
  VAZIO: "Informe o peso.",
  FORMATO_INVALIDO: "Use um número com até duas casas, ex.: 356,5",
  NAO_POSITIVO: "O peso deve ser maior que zero.",
  ACIMA_DO_MAXIMO: "Peso acima do máximo aceito (2.000 kg).",
};

/** Valor para <input type="datetime-local"> no horário local do aparelho. */
function paraInputLocal(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

interface Registro {
  brinco: string;
  pesoG: number;
  variacaoG: number | null;
  desde: Date | null;
  gmdKgDia: number | null;
  offline: boolean;
}

/**
 * Registro de pesagem em poucos passos: brinco, peso, salvar (princípios de produto, 1.3).
 * Feito para o curral: depois de salvar, já prepara o próximo animal (do lote, se
 * escolhido), mostra o ganho na hora e pede confirmação de peso muito diferente.
 * Valida aqui o mesmo que as regras de segurança, para que o servidor não recuse
 * depois uma pesagem feita offline.
 */
export function Pesar() {
  const { animais, lotes, vinculo, usuario, fuso, online } = useDados();
  const [params] = useSearchParams();
  const [brinco, setBrinco] = useState(() => animais.find((a) => a.id === params.get("animal"))?.brinco ?? "");
  const [peso, setPeso] = useState("");
  const [dataHora, setDataHora] = useState(() => paraInputLocal(new Date()));
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [ultimo, setUltimo] = useState<Registro | null>(null);
  const [loteId, setLoteId] = useState("");
  /** Peso que a pessoa confirmou mesmo parecendo errado. */
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const campoBrinco = useRef<HTMLInputElement>(null);
  const campoPeso = useRef<HTMLInputElement>(null);

  const ativos = useMemo(() => animais.filter((a) => a.situacao === "ATIVO"), [animais]);
  const termo = brinco.trim().toUpperCase();
  const animal = ativos.find((a) => a.brinco === termo || formatarCodigo(a.codigoNumero) === termo);
  const sugestoes = termo && !animal ? ativos.filter((a) => a.brinco.includes(termo)).slice(0, 6) : [];

  // Animais do lote escolhido que ainda não foram pesados hoje.
  const hoje = diaNoFuso(new Date(), fuso);
  const faltamNoLote = loteId
    ? ativos
        .filter((a) => (a.loteId ?? "") === loteId)
        .filter((a) => !a.resumo.dataUltimaPesagem || diaNoFuso(a.resumo.dataUltimaPesagem, fuso) !== hoje)
        .sort((a, b) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true }))
    : [];
  const lotesAtivos = lotes.filter((l) => l.ativo);

  const leitura = peso ? lerPesoKg(peso) : null;
  const avaliacao = animal && leitura?.ok ? avaliarNovoPeso(leitura.pesoG, animal.resumo.pesoAtualG) : null;
  const pedirConfirmacao = !!avaliacao?.suspeito && confirmado !== peso;

  if (!pode(vinculo, "registrarPesagem")) return <p>Seu perfil permite apenas consulta.</p>;

  function escolher(b: string) {
    setBrinco(b);
    setConfirmado(null);
    campoPeso.current?.focus();
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!animal) return setErro("Escolha um animal ativo pelo brinco.");
    const r = lerPesoKg(peso);
    if (!r.ok) return setErro(ERRO_PESO[r.erro]);
    const data = new Date(dataHora);
    if (Number.isNaN(data.getTime())) return setErro("Data e hora inválidas.");
    if (data.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) return setErro("A data da pesagem não pode estar no futuro.");
    if (pedirConfirmacao) {
      setConfirmado(peso);
      return setErro("Confira o peso: está muito diferente do último. Se estiver certo, toque em Salvar de novo.");
    }

    // Ganho em relação à última pesagem válida, calculado antes de gravar.
    const anteriorG = animal.resumo.pesoAtualG;
    const desde = animal.resumo.dataUltimaPesagem;
    const dias = desde ? diaNoFuso(data, fuso) - diaNoFuso(desde, fuso) : null;
    const variacaoG = anteriorG !== null ? r.pesoG - anteriorG : null;

    const id = registrarPesagem(
      db,
      { pid: vinculo!.propriedadeId, uid: usuario!.uid, animalId: animal.id, pesoG: r.pesoG, dataHora: data, fuso, observacao },
      () =>
        recusadas.adicionar({
          id,
          animalId: animal.id,
          brinco: animal.brinco,
          pesoG: r.pesoG,
          dataHora: data.toISOString(),
          observacao,
          recusadaEm: new Date().toISOString(),
        }),
    );
    setUltimo({
      brinco: animal.brinco,
      pesoG: r.pesoG,
      variacaoG,
      desde,
      gmdKgDia: variacaoG !== null && dias && dias > 0 ? variacaoG / 1000 / dias : null,
      offline: !online,
    });
    setPeso("");
    setObservacao("");
    setConfirmado(null);
    setDataHora(paraInputLocal(new Date()));

    // Próximo animal: o seguinte do lote, se houver; senão, volta ao brinco.
    const proximo = faltamNoLote.find((a) => a.id !== animal.id);
    if (proximo) {
      setBrinco(proximo.brinco);
      campoPeso.current?.focus();
    } else {
      setBrinco("");
      campoBrinco.current?.focus();
    }
  }

  return (
    <section>
      <h1>Registrar pesagem</h1>
      {ultimo && (
        <div className="aviso registro" role="status">
          <strong>
            {ultimo.brinco}: {formatarPesoKg(ultimo.pesoG)}
          </strong>
          {ultimo.variacaoG !== null && ultimo.desde && (
            <span>
              {ultimo.variacaoG >= 0 ? "+" : ""}
              {formatarPesoKg(ultimo.variacaoG)} desde {ultimo.desde.toLocaleDateString("pt-BR")}
              {ultimo.gmdKgDia !== null ? ` · ${formatarGmd(ultimo.gmdKgDia)}` : ""}
            </span>
          )}
          {ultimo.variacaoG === null && <span>Primeira pesagem deste animal.</span>}
          {ultimo.offline && <small>Salva no aparelho; será enviada quando houver internet.</small>}
        </div>
      )}

      {lotesAtivos.length > 0 && (
        <div className="cartao lote-sequencia">
          <label>
            Pesar por lote
            <select value={loteId} onChange={(e) => setLoteId(e.target.value)}>
              <option value="">Qualquer animal</option>
              {lotesAtivos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>
          {loteId &&
            (faltamNoLote.length === 0 ? (
              <p className="aviso">Todos os animais deste lote já foram pesados hoje.</p>
            ) : (
              <>
                <small>Faltam {faltamNoLote.length} hoje. Toque para escolher:</small>
                <div className="sugestoes">
                  {faltamNoLote.map((a) => (
                    <button type="button" key={a.id} className={a.id === animal?.id ? "escolhido" : ""} onClick={() => escolher(a.brinco)}>
                      {a.brinco}
                    </button>
                  ))}
                </div>
              </>
            ))}
        </div>
      )}

      <form onSubmit={salvar} className="cartao">
        <label>
          Brinco
          <input
            ref={campoBrinco}
            value={brinco}
            onChange={(e) => {
              setBrinco(e.target.value);
              setConfirmado(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            required
          />
        </label>
        {animal && (
          <p className="animal-escolhido">
            {formatarCodigo(animal.codigoNumero)} · último peso {formatarPesoKg(animal.resumo.pesoAtualG)}
          </p>
        )}
        {sugestoes.length > 0 && (
          <div className="sugestoes">
            {sugestoes.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => escolher(a.brinco)}
              >
                {a.brinco}
              </button>
            ))}
          </div>
        )}
        <label>
          Peso (kg)
          <input ref={campoPeso} value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" required />
        </label>
        {avaliacao?.suspeito && animal && (
          <p className="alerta-peso" role="alert">
            Atenção: {Math.round(Math.abs(avaliacao.variacaoRelativa!) * 100)}%{" "}
            {avaliacao.variacaoRelativa! > 0 ? "acima" : "abaixo"} do último peso ({formatarPesoKg(animal.resumo.pesoAtualG)}). Confira
            antes de salvar.
          </p>
        )}
        <label>
          Data e hora da pesagem
          <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} required />
        </label>
        <label>
          Observação (opcional)
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario grande">{confirmado === peso && avaliacao?.suspeito ? "Salvar mesmo assim" : "Salvar pesagem"}</button>
      </form>
    </section>
  );
}
