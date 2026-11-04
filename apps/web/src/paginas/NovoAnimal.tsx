import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { dataIsoNoFuso, lerReais, normalizarBrinco } from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { criarAnimal } from "../operacoes";

/** RF-03: cadastro exige conexão (decisão de produto, spec 8.4): é uma transação. */
export function NovoAnimal() {
  const { categorias, lotes, vinculo, usuario, online, fuso } = useDados();
  const navegar = useNavigate();
  const ativas = categorias.filter((c) => c.ativo);
  const [brinco, setBrinco] = useState("");
  const [categoriaId, setCategoriaId] = useState(ativas[0]?.id ?? "");
  const [sexo, setSexo] = useState<"M" | "F">("M");
  const [loteId, setLoteId] = useState("");
  const lotesAtivos = lotes.filter((l) => l.ativo);
  const [nome, setNome] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [valorCompra, setValorCompra] = useState("");
  const [dataCompra, setDataCompra] = useState(() => dataIsoNoFuso(new Date(), fuso));
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!pode(vinculo, "administrar")) return <p>Apenas administradores cadastram animais.</p>;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const b = normalizarBrinco(brinco);
    if (!b.ok) return setErro("Brinco inválido. Use letras, números ou hífen.");
    if (!categoriaId) return setErro("Cadastre uma categoria antes.");
    let compra: { centavos: number; data: string } | null = null;
    if (valorCompra.trim()) {
      const centavos = lerReais(valorCompra);
      if (centavos === null) return setErro("Valor pago inválido. Exemplo: 2.850,00");
      if (!dataCompra) return setErro("Informe a data da compra.");
      compra = { centavos, data: dataCompra };
    }
    setEnviando(true);
    try {
      const r = await criarAnimal(db, vinculo!.propriedadeId, usuario!.uid, {
        brinco: b.brinco,
        categoriaId,
        loteId: loteId || null,
        sexo,
        nome,
        dataNascimento,
        compra,
      });
      navegar(`/animais/${r.id}`);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h1>Novo animal</h1>
      {!online && <p className="erro">Sem internet. O cadastro de animais precisa de conexão.</p>}
      <form onSubmit={salvar} className="cartao">
        <label>
          Brinco
          <input value={brinco} onChange={(e) => setBrinco(e.target.value)} autoCapitalize="characters" required />
        </label>
        <label>
          Categoria
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        {lotesAtivos.length > 0 && (
          <label>
            Lote (opcional)
            <select value={loteId} onChange={(e) => setLoteId(e.target.value)}>
              <option value="">Sem lote</option>
              {lotesAtivos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="opcoes">
          <legend>Sexo</legend>
          <label>
            <input type="radio" checked={sexo === "M"} onChange={() => setSexo("M")} /> Macho
          </label>
          <label>
            <input type="radio" checked={sexo === "F"} onChange={() => setSexo("F")} /> Fêmea
          </label>
        </fieldset>
        <label>
          Nome (opcional)
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
        </label>
        <label>
          Data de nascimento (opcional)
          <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
        </label>
        <label>
          Valor pago pelo animal (opcional)
          <input
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={valorCompra}
            onChange={(e) => setValorCompra(e.target.value)}
          />
        </label>
        {valorCompra.trim() && (
          <label>
            Data da compra
            <input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} required />
          </label>
        )}
        <p className="ajuda">Os valores só aparecem para administradores.</p>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario grande" disabled={enviando || !online}>
          {enviando ? "Salvando…" : "Cadastrar"}
        </button>
      </form>
    </section>
  );
}
