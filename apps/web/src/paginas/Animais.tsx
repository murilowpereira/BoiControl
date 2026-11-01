import { useMemo, useState } from "react";
import { Link } from "react-router";
import { formatarCodigo, formatarPesoKg, SITUACOES, type SituacaoAnimal } from "@boicontrol/core";
import { pode, useDados } from "../dados";

/** RF-06: busca por brinco/código e filtro por situação e categoria, com peso e data mais recentes. */
export function Animais() {
  const { animais, categorias, vinculo } = useDados();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoAnimal | "">("ATIVO");
  const [categoria, setCategoria] = useState("");
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));

  const lista = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return animais
      .filter((a) => !situacao || a.situacao === situacao)
      .filter((a) => !categoria || a.categoriaId === categoria)
      .filter((a) => !termo || a.brinco.includes(termo) || formatarCodigo(a.codigoNumero).includes(termo))
      .sort((a, b) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true }));
  }, [animais, busca, situacao, categoria]);

  return (
    <section>
      <div className="filtros">
        <input
          type="search"
          inputMode="search"
          placeholder="Buscar brinco ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar brinco ou código"
        />
        <select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoAnimal | "")} aria-label="Situação">
          <option value="">Todas as situações</option>
          {SITUACOES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {pode(vinculo, "administrar") && (
        <Link to="/animais/novo" className="botao">
          + Novo animal
        </Link>
      )}

      <p className="contagem">{lista.length} animal(is)</p>
      <ul className="lista">
        {lista.map((a) => (
          <li key={a.id}>
            <Link to={`/animais/${a.id}`}>
              <div>
                <strong>{a.brinco}</strong>
                <small>
                  {formatarCodigo(a.codigoNumero)} · {nomeCategoria.get(a.categoriaId) ?? "—"}
                  {a.situacao !== "ATIVO" ? ` · ${a.situacao.toLowerCase()}` : ""}
                </small>
              </div>
              <div className="direita">
                <span>{formatarPesoKg(a.resumo.pesoAtualG)}</span>
                <small>
                  {a.resumo.dataUltimaPesagem ? a.resumo.dataUltimaPesagem.toLocaleDateString("pt-BR") : "sem pesagem"}
                </small>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
