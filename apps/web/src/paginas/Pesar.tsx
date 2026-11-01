import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { formatarCodigo, formatarPesoKg, lerPesoKg, TOLERANCIA_FUTURO_MS, type ErroPeso } from "@boicontrol/core";
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

/**
 * Registro de pesagem em poucos passos: brinco, peso, salvar (princípios de produto, 1.3).
 * Valida aqui o mesmo que as regras de segurança, para que o servidor não recuse
 * depois uma pesagem feita offline.
 */
export function Pesar() {
  const { animais, vinculo, usuario, fuso, online } = useDados();
  const [params] = useSearchParams();
  const [brinco, setBrinco] = useState(() => animais.find((a) => a.id === params.get("animal"))?.brinco ?? "");
  const [peso, setPeso] = useState("");
  const [dataHora, setDataHora] = useState(() => paraInputLocal(new Date()));
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [ultimo, setUltimo] = useState<string | null>(null);
  const campoPeso = useRef<HTMLInputElement>(null);

  const ativos = useMemo(() => animais.filter((a) => a.situacao === "ATIVO"), [animais]);
  const termo = brinco.trim().toUpperCase();
  const animal = ativos.find((a) => a.brinco === termo || formatarCodigo(a.codigoNumero) === termo);
  const sugestoes = termo && !animal ? ativos.filter((a) => a.brinco.includes(termo)).slice(0, 6) : [];

  if (!pode(vinculo, "registrarPesagem")) return <p>Seu perfil permite apenas consulta.</p>;

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!animal) return setErro("Escolha um animal ativo pelo brinco.");
    const r = lerPesoKg(peso);
    if (!r.ok) return setErro(ERRO_PESO[r.erro]);
    const data = new Date(dataHora);
    if (Number.isNaN(data.getTime())) return setErro("Data e hora inválidas.");
    if (data.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) return setErro("A data da pesagem não pode estar no futuro.");

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
    setUltimo(`${animal.brinco}: ${formatarPesoKg(r.pesoG)}${online ? "" : " (salva no aparelho, será enviada quando houver internet)"}`);
    setBrinco("");
    setPeso("");
    setObservacao("");
    setDataHora(paraInputLocal(new Date()));
  }

  return (
    <section>
      <h1>Registrar pesagem</h1>
      {ultimo && <p className="aviso">Registrada: {ultimo}</p>}
      <form onSubmit={salvar} className="cartao">
        <label>
          Brinco
          <input
            value={brinco}
            onChange={(e) => setBrinco(e.target.value)}
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
                onClick={() => {
                  setBrinco(a.brinco);
                  campoPeso.current?.focus();
                }}
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
        <label>
          Data e hora da pesagem
          <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} required />
        </label>
        <label>
          Observação (opcional)
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario grande">Salvar pesagem</button>
      </form>
    </section>
  );
}
