import { useState } from "react";
import { carenciasAtivas, formatarQuantidade, MAX_VACINAS_PESAGEM } from "@boicontrol/core";
import { useDados, type Pesagem } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { alterarVacinasPesagem } from "../operacoes";

interface Props {
  pesagem: Pesagem;
  aoFechar: (mensagem?: string) => void;
}

/**
 * Informa ou troca as vacinas de uma pesagem já gravada (pesagens antigas).
 * Mostra antes de salvar o que muda no estoque e na carência.
 */
export function VacinasDaPesagem({ pesagem, aoFechar }: Props) {
  const { vacinas, insumos, vinculo, usuario, online } = useDados();
  const atuais = pesagem.vacinas ?? [];
  const [marcadas, setMarcadas] = useState<string[]>(atuais);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Ativas e as que já estão na pesagem (mesmo se desativadas depois).
  const opcoes = vacinas.filter((v) => v.ativo || atuais.includes(v.id));
  const nome = (id: string) => vacinas.find((v) => v.id === id)?.nome ?? id;
  const dataPesagem = pesagem.dataHoraPesagem.toDate();
  const incluidas = marcadas.filter((v) => !atuais.includes(v));
  const retiradas = atuais.filter((v) => !marcadas.includes(v));

  function alternar(id: string) {
    setErro("");
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  // Estoque: a baixa só vale para pesagens gravadas depois que a vacina foi ligada ao insumo.
  const criadoEm = (pesagem.criadoEm ?? pesagem.dataHoraPesagem).toDate();
  const efeitosEstoque = insumos
    .filter((i) => i.vacinaId && i.doseMil && (incluidas.includes(i.vacinaId) || retiradas.includes(i.vacinaId)))
    .map((i) => {
      const conta = !i.vacinaDesde || criadoEm >= i.vacinaDesde.toDate();
      const dose = formatarQuantidade(i.doseMil, i.unidade);
      if (!conta) return `${i.nome}: não mexe no estoque (pesagem anterior ao controle deste insumo).`;
      return incluidas.includes(i.vacinaId!) ? `${i.nome}: sai ${dose} do estoque.` : `${i.nome}: volta ${dose} para o estoque.`;
    });

  // Carência: só avisa se a vacina incluída ainda está dentro do prazo.
  const carencia = carenciasAtivas(
    incluidas.map((produtoId) => ({ animalId: pesagem.animalId, produtoId, data: dataPesagem })),
    vacinas,
    new Date(),
  ).get(pesagem.animalId);

  async function salvar() {
    if (marcadas.length > MAX_VACINAS_PESAGEM) return setErro(`Marque no máximo ${MAX_VACINAS_PESAGEM} vacinas.`);
    setSalvando(true);
    try {
      const r = await alterarVacinasPesagem(db, vinculo!.propriedadeId, usuario!.uid, pesagem.id, marcadas);
      aoFechar(r.alterado ? "Vacinas da pesagem atualizadas." : "Nada mudou nas vacinas.");
    } catch (e) {
      setErro(mensagemDeErro(e));
      setSalvando(false);
    }
  }

  return (
    <div className="cartao editar-vacinas">
      <strong>
        Vacinas da pesagem de {dataPesagem.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
      </strong>
      {opcoes.length === 0 ? (
        <p className="ajuda">Nenhuma vacina cadastrada. Cadastre em Ajustes.</p>
      ) : (
        <div className="sugestoes">
          {opcoes.map((v) => {
            const marcada = marcadas.includes(v.id);
            return (
              <button
                type="button"
                key={v.id}
                className={marcada ? "escolhido" : ""}
                aria-pressed={marcada}
                onClick={() => alternar(v.id)}
              >
                {marcada ? "✓ " : ""}
                {v.nome}
                {!v.ativo ? " (desativada)" : ""}
              </button>
            );
          })}
        </div>
      )}
      {efeitosEstoque.map((t) => (
        <small key={t} className="baixa-estoque">
          {t}
        </small>
      ))}
      {carencia && (
        <p className="alerta-peso" role="status">
          Com {nome(carencia.produtoId)}, o animal fica em carência até {carencia.ate.toLocaleDateString("pt-BR")}.
        </p>
      )}
      {!online && <p className="ajuda">Alterar as vacinas precisa de internet.</p>}
      {erro && <p className="erro">{erro}</p>}
      <div className="botoes">
        <button type="button" className="link" onClick={() => aoFechar()}>
          Cancelar
        </button>
        <button type="button" className="primario" onClick={() => void salvar()} disabled={salvando || !online}>
          {salvando ? "Salvando…" : "Salvar vacinas"}
        </button>
      </div>
    </div>
  );
}
