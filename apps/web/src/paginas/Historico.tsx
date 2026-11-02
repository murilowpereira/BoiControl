import { useEffect, useState } from "react";
import { Link } from "react-router";
import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { caminhos, formatarPesoKg } from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { db } from "../firebase";

interface Registro {
  id: string;
  usuarioId: string;
  entidade: "animal" | "pesagem";
  registroId: string;
  acao: string;
  motivo: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  em: Timestamp | null;
}

const ACOES: Record<string, string> = {
  CRIAR_ANIMAL: "Cadastrou o animal",
  EDITAR_ANIMAL: "Editou o animal",
  ALTERAR_SITUACAO: "Mudou a situação do animal",
  CORRIGIR_PESAGEM: "Corrigiu uma pesagem",
  ANULAR_PESAGEM: "Anulou uma pesagem",
};

const CAMPOS: Record<string, string> = {
  brinco: "brinco",
  categoriaId: "categoria",
  loteId: "lote",
  sexo: "sexo",
  nome: "nome",
  dataNascimento: "nascimento",
  observacao: "observação",
  situacao: "situação",
  pesoG: "peso",
  dataHoraPesagem: "data",
  estado: "estado",
};

const LIMITE = 200;

/** Auditoria (RF-15): quem alterou o quê, quando e por quê. Só ADMIN. */
export function Historico() {
  const { vinculo, animais, pesagens, categorias, lotes } = useDados();
  const admin = pode(vinculo, "administrar");
  const pid = vinculo?.propriedadeId;
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!admin || !pid) return;
    const cancelar = [
      onSnapshot(query(collection(db, caminhos.auditoria(pid)), orderBy("em", "desc"), limit(LIMITE)), (s) =>
        setRegistros(s.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: "estimate" }) as Omit<Registro, "id">) }))),
      ),
      onSnapshot(collection(db, caminhos.membros(pid)), (s) =>
        setNomes(new Map(s.docs.map((d) => [d.id, (d.get("nome") as string) || (d.get("email") as string) || "—"]))),
      ),
    ];
    return () => cancelar.forEach((c) => c());
  }, [admin, pid]);

  if (!admin) return <p>Apenas administradores veem o histórico.</p>;

  const animalPorId = new Map(animais.map((a) => [a.id, a]));
  const pesagemPorId = new Map(pesagens.map((p) => [p.id, p]));
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const nomeLote = new Map(lotes.map((l) => [l.id, l.nome]));

  function animalDo(r: Registro) {
    const id = r.entidade === "animal" ? r.registroId : pesagemPorId.get(r.registroId)?.animalId;
    return id ? animalPorId.get(id) : undefined;
  }

  function valor(campo: string, v: unknown): string {
    if (v === null || v === undefined || v === "") return "vazio";
    if (campo === "pesoG" && typeof v === "number") return formatarPesoKg(v);
    if (campo === "categoriaId") return nomeCategoria.get(String(v)) ?? String(v);
    if (campo === "loteId") return nomeLote.get(String(v)) ?? String(v);
    if (campo === "sexo") return v === "M" ? "macho" : "fêmea";
    if (campo === "estado") return v === "ANULADA" ? "anulada" : "válida";
    if (typeof v === "string") return v.toLowerCase() === v.toUpperCase() ? v : v.charAt(0) + v.slice(1).toLowerCase();
    if (typeof v === "object" && v && "toDate" in v) {
      return (v as Timestamp).toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    }
    return String(v);
  }

  function mudancas(r: Registro): string[] {
    if (r.acao === "CRIAR_ANIMAL" || !r.depois) return [];
    return Object.keys(r.depois)
      .filter((k) => k in CAMPOS && JSON.stringify(r.antes?.[k] ?? null) !== JSON.stringify(r.depois?.[k] ?? null))
      .map((k) => `${CAMPOS[k]}: ${valor(k, r.antes?.[k])} → ${valor(k, r.depois?.[k])}`);
  }

  return (
    <section>
      <Link to="/configuracoes" className="voltar">
        ← Ajustes
      </Link>
      <h1>Histórico de alterações</h1>
      <p className="ajuda">Cadastros, edições, mudanças de situação e correções de pesagem. Mostra as {LIMITE} mais recentes.</p>
      {registros === null ? (
        <p className="carregando">Carregando…</p>
      ) : registros.length === 0 ? (
        <p className="vazio">Nenhuma alteração registrada ainda.</p>
      ) : (
        <ul className="lista historico">
          {registros.map((r) => {
            const a = animalDo(r);
            return (
              <li key={r.id}>
                <div className="historico-item">
                  <div className="historico-topo">
                    <strong>{ACOES[r.acao] ?? r.acao}</strong>
                    {a && (
                      <Link to={`/animais/${a.id}`} className="historico-animal">
                        {a.brinco}
                      </Link>
                    )}
                  </div>
                  <small>
                    {nomes.get(r.usuarioId) ?? "Usuário removido"} ·{" "}
                    {r.em ? r.em.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "agora"}
                  </small>
                  {mudancas(r).map((m) => (
                    <span key={m} className="historico-mudanca">
                      {m}
                    </span>
                  ))}
                  {r.motivo && <span className="historico-motivo">Motivo: {r.motivo}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
