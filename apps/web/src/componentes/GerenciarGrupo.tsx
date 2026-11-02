import { useState, type FormEvent } from "react";
import type { Categoria } from "../dados";
import { db } from "../firebase";
import { ErroOperacao, salvarGrupo, type ColecaoGrupo } from "../operacoes";

interface Props {
  pid: string;
  colecao: ColecaoGrupo;
  itens: Categoria[];
  /** Nome no singular, minúsculo: "categoria", "lote", "vacina". */
  singular: string;
  exemplo: string;
  bloqueado: boolean;
  executar: (acao: () => Promise<unknown>, sucesso: string) => Promise<boolean>;
}

/** Lista para criar, renomear e desativar categorias, lotes ou vacinas. Nada é apagado, para não perder o histórico. */
export function GerenciarGrupo({ pid, colecao, itens, singular, exemplo, bloqueado, executar }: Props) {
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const ids = itens.map((i) => i.id);

  async function criar(e: FormEvent) {
    e.preventDefault();
    const nome = novo.trim();
    if (itens.some((i) => i.nome.toLowerCase() === nome.toLowerCase())) {
      await executar(() => Promise.reject(new ErroOperacao("NOME_OBRIGATORIO", `Já existe "${nome}".`)), "");
      return;
    }
    if (await executar(() => salvarGrupo(db, pid, colecao, { nome, ativo: true }, ids), `${nome} adicionado.`)) setNovo("");
  }

  async function renomear(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const item = itens.find((i) => i.id === editando.id)!;
    if (
      await executar(
        () => salvarGrupo(db, pid, colecao, { id: item.id, nome: editando.nome, ativo: item.ativo }, ids),
        `Renomeado para ${editando.nome.trim()}.`,
      )
    ) {
      setEditando(null);
    }
  }

  function alternar(item: Categoria) {
    void executar(
      () => salvarGrupo(db, pid, colecao, { id: item.id, nome: item.nome, ativo: !item.ativo }, ids),
      item.ativo ? `${item.nome} desativado. Os animais continuam com ele no histórico.` : `${item.nome} reativado.`,
    );
  }

  return (
    <div className="cartao lista-pessoas">
      {itens.length === 0 && <p className="vazio">Nada cadastrado ainda.</p>}
      {itens.map((item) =>
        editando?.id === item.id ? (
          <form key={item.id} className="pessoa" onSubmit={renomear}>
            <input
              aria-label={`Novo nome de ${item.nome}`}
              value={editando.nome}
              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
              maxLength={40}
              autoFocus
              required
            />
            <div className="pessoa-acoes">
              <button className="primario" disabled={bloqueado}>
                Salvar
              </button>
              <button type="button" className="link" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div key={item.id} className={`pessoa ${item.ativo ? "" : "inativa"}`}>
            <div className="pessoa-dados">
              <strong>{item.nome}</strong>
              {!item.ativo && <small className="sem-acesso">Desativado</small>}
            </div>
            <div className="pessoa-acoes">
              <button className="link" onClick={() => setEditando({ id: item.id, nome: item.nome })} disabled={bloqueado}>
                Renomear
              </button>
              <button className="link" onClick={() => alternar(item)} disabled={bloqueado}>
                {item.ativo ? "Desativar" : "Reativar"}
              </button>
            </div>
          </div>
        ),
      )}
      <form className="pessoa novo-grupo" onSubmit={criar}>
        <input
          aria-label={`Adicionar ${singular}`}
          placeholder={`Ex.: ${exemplo}`}
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          maxLength={40}
          required
        />
        <button className="primario" disabled={bloqueado}>
          Adicionar
        </button>
      </form>
    </div>
  );
}
