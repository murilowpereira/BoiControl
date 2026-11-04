import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { dataIsoNoFuso, lerReais, normalizarBrinco } from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { criarAnimal, type DadosAnimal } from "../operacoes";
import { cadastrarSemInternet } from "../cadastrosOffline";

/**
 * RF-03: com internet, o cadastro é uma transação (brinco e código conferidos
 * no servidor na hora). Sem internet, confere no que já está no aparelho e
 * grava para enviar depois, como a pesagem (ver cadastrosOffline.ts).
 */
export function NovoAnimal() {
  const { animais, categorias, lotes, vinculo, usuario, online, fuso } = useDados();
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
    const dados: Omit<DadosAnimal, "id" | "maeId"> = {
      brinco: b.brinco,
      categoriaId,
      loteId: loteId || null,
      sexo,
      nome,
      dataNascimento,
      compra,
    };
    const pid = vinculo!.propriedadeId;
    const uid = usuario!.uid;
    const semInternet = () =>
      cadastrarSemInternet(db, pid, uid, fuso, dados, {
        ultimoCodigo: animais.reduce((m, a) => Math.max(m, a.codigoNumero), 0),
        brincosEmUso: new Set(animais.map((a) => a.brinco)),
        categoriasAtivas: new Set(ativas.map((c) => c.id)),
        lotesAtivos: new Set(lotesAtivos.map((l) => l.id)),
      });
    setEnviando(true);
    try {
      let r: { id: string };
      try {
        r = online ? await criarAnimal(db, pid, uid, dados) : semInternet();
      } catch (err) {
        // Sinal fraco: o celular diz que tem internet, mas o servidor não responde.
        if ((err as { code?: string }).code !== "unavailable") throw err;
        r = semInternet();
      }
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
      {!online && (
        <p className="aviso">Sem internet. O animal fica salvo no aparelho e é enviado quando a conexão voltar.</p>
      )}
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
        <button className="primario grande" disabled={enviando}>
          {enviando ? "Salvando…" : "Cadastrar"}
        </button>
      </form>
    </section>
  );
}
