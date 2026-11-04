import { useState, type FormEvent } from "react";
import { CARENCIA_MAX_DIAS, INTERVALO_MAX_DIAS, TIPOS_PRODUTO, type TipoProduto } from "@boicontrol/core";
import type { Vacina } from "../dados";
import { db } from "../firebase";
import { salvarProtocolo } from "../operacoes";

interface Props {
  pid: string;
  itens: Vacina[];
  bloqueado: boolean;
  executar: (acao: () => Promise<unknown>, sucesso: string) => Promise<boolean>;
}

const lerDias = (v: string) => (v.trim() === "" ? null : Number(v));

/** Tipo, carência e intervalo de repetição de cada vacina ou vermífugo ativo. */
export function ProtocolosSanitarios({ pid, itens, bloqueado, executar }: Props) {
  const ativos = itens.filter((i) => i.ativo);
  if (ativos.length === 0) return null;
  return (
    <div className="cartao lista-pessoas">
      {ativos.map((v) => (
        <LinhaProtocolo key={`${v.id}:${v.tipo}:${v.carenciaDias}:${v.intervaloDias}`} pid={pid} v={v} bloqueado={bloqueado} executar={executar} />
      ))}
    </div>
  );
}

function LinhaProtocolo({ pid, v, bloqueado, executar }: { pid: string; v: Vacina } & Omit<Props, "pid" | "itens">) {
  const [tipo, setTipo] = useState<string>(v.tipo ?? "");
  const [carencia, setCarencia] = useState(v.carenciaDias ? String(v.carenciaDias) : "");
  const [intervalo, setIntervalo] = useState(v.intervaloDias ? String(v.intervaloDias) : "");
  const mudou =
    tipo !== (v.tipo ?? "") ||
    carencia !== (v.carenciaDias ? String(v.carenciaDias) : "") ||
    intervalo !== (v.intervaloDias ? String(v.intervaloDias) : "");

  function salvar(e: FormEvent) {
    e.preventDefault();
    void executar(
      () =>
        salvarProtocolo(db, pid, v.id, {
          tipo: (tipo || null) as TipoProduto | null,
          carenciaDias: lerDias(carencia),
          intervaloDias: lerDias(intervalo),
        }),
      `${v.nome} atualizado.`,
    );
  }

  return (
    <form className="pessoa protocolo" onSubmit={salvar}>
      <strong>{v.nome}</strong>
      <div className="protocolo-campos">
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">—</option>
            {TIPOS_PRODUTO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Carência (dias)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={CARENCIA_MAX_DIAS}
            placeholder="sem"
            value={carencia}
            onChange={(e) => setCarencia(e.target.value)}
          />
        </label>
        <label>
          Repetir a cada (dias)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={INTERVALO_MAX_DIAS}
            placeholder="não repete"
            value={intervalo}
            onChange={(e) => setIntervalo(e.target.value)}
          />
        </label>
      </div>
      <button className="primario" disabled={bloqueado || !mudou}>
        Salvar
      </button>
    </form>
  );
}
