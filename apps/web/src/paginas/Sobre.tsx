import { useDados } from "../dados";
import { VERSAO_ATUAL, VERSOES } from "../versoes";

const NOME_PERFIL = { ADMIN: "Administrador", OPERADOR: "Operador", CONSULTA: "Consulta" } as const;

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Versão instalada e o que mudou em cada versão. */
export function Sobre() {
  const { nomePropriedade, vinculo, usuario } = useDados();
  return (
    <section className="sobre">
      <h1>Sobre o BoiControl</h1>
      <div className="cartao sobre-resumo">
        <div>
          <span>Versão instalada</span>
          <strong>{VERSAO_ATUAL}</strong>
        </div>
        <div>
          <span>Publicada em</span>
          <strong>{new Date(__DATA_BUILD__).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong>
        </div>
        {nomePropriedade && (
          <div>
            <span>Fazenda</span>
            <strong>{nomePropriedade}</strong>
          </div>
        )}
        {vinculo && (
          <div>
            <span>Seu acesso</span>
            <strong>{NOME_PERFIL[vinculo.perfil]}</strong>
            {usuario?.email && <small>{usuario.email}</small>}
          </div>
        )}
      </div>
      <p className="ajuda">O app se atualiza sozinho quando há internet. Se esta versão parecer antiga, feche e abra o app de novo.</p>

      <h2>O que há em cada versão</h2>
      <ol className="versoes">
        {VERSOES.map((v) => (
          <li key={v.versao} className="cartao">
            <div className="versao-topo">
              <strong>
                {v.versao} · {v.titulo}
              </strong>
              <small>{dataBr(v.data)}</small>
            </div>
            {v.versao === VERSAO_ATUAL && <span className="selo-ok">Instalada</span>}
            <ul>
              {v.novidades.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
