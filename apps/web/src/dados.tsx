import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import {
  caminhos,
  calcularPorAnimal,
  calcularSaldos,
  type PesagemComVacinas,
  type SaldoInsumo,
  type TipoMovimento,
  DIAS_ALERTA_PADRAO,
  PESO_ABATE_PADRAO_KG,
  type EstadoPesagem,
  type PesagemCalculada,
  type Perfil,
  type ResumoAnimal,
  type SituacaoAnimal,
  type RegistroChuva,
  type ValoresAnimalBase,
  type AplicacaoAnimal,
  type ProdutoSanitario,
  type OcupacaoBase,
  type PastoBase,
} from "@boicontrol/core";
import { auth, db } from "./firebase";
import { aceitarConvite } from "./operacoes";

export interface Animal {
  id: string;
  codigoNumero: number;
  brinco: string;
  categoriaId: string;
  loteId?: string | null;
  sexo: "M" | "F";
  nome: string | null;
  dataNascimento?: string | null;
  observacao?: string | null;
  situacao: SituacaoAnimal;
  situacaoDesde: Timestamp | null;
  versao: number;
  /** Calculado no aparelho a partir das pesagens válidas (plano Spark). */
  resumo: ResumoAnimal;
}

export interface Categoria {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Lote: mesmo formato da categoria. */
export type Lote = Categoria;

/** Vacina ou vermífugo, com carência e intervalo de repetição opcionais. */
export type Vacina = ProdutoSanitario;

/** Vacina/vermífugo aplicado em vários animais sem pesagem. */
export interface Aplicacao {
  id: string;
  vacinaId: string;
  data: Timestamp;
  animalIds: string[];
  loteId: string | null;
  observacao: string | null;
  anulada?: boolean;
  criadoEm?: Timestamp | null;
  pendente: boolean;
}

/** Pasto ou piquete, com a área em m². */
export type Pasto = PastoBase;

/** Período de um lote num pasto (saida null = ainda está lá). */
export type Ocupacao = OcupacaoBase;

export interface Pesagem {
  id: string;
  animalId: string;
  pesoG: number;
  dataHoraPesagem: Timestamp;
  observacao: string | null;
  /** IDs das vacinas aplicadas na pesagem (ausente nas pesagens antigas). */
  vacinas?: string[];
  estado: EstadoPesagem;
  versao: number;
  motivoCorrecao?: string;
  criadoEm: Timestamp | null;
  /** O Firestore ainda não confirmou a gravação no servidor. */
  pendente: boolean;
}

/** Despesa ou receita do financeiro (só ADMIN). */
export interface Lancamento {
  id: string;
  categoria: string;
  descricao: string | null;
  valorCentavos: number;
  data: string;
}

export type ValoresAnimal = ValoresAnimalBase;

/** Leitura do pluviômetro do dia. */
export interface Chuva extends RegistroChuva {
  /** O Firestore ainda não confirmou a gravação no servidor. */
  pendente: boolean;
}

/** Item do estoque (ração, sal, vacina, medicamento). */
export interface Insumo {
  id: string;
  nome: string;
  tipo: string;
  unidade: string;
  ativo: boolean;
  minimoMil: number | null;
  vacinaId: string | null;
  doseMil: number | null;
  vacinaDesde: Timestamp | null;
}

export interface MovimentoEstoque {
  id: string;
  insumoId: string;
  tipo: TipoMovimento;
  quantidadeMil: number;
  data: string;
  observacao: string | null;
  lancamentoId?: string;
  criadoPor: string;
  criadoEm: Timestamp | null;
  pendente: boolean;
}

const RESUMO_VAZIO: ResumoAnimal = { pesoAtualG: null, dataUltimaPesagem: null, gmdUltimoKgDia: null, totalPesagens: 0 };

export interface Vinculo {
  propriedadeId: string;
  perfil: Perfil;
  ativo: boolean;
}

interface Dados {
  usuario: User | null | undefined;
  vinculo: Vinculo | null | undefined;
  nomePropriedade: string;
  fuso: string;
  animais: Animal[];
  categorias: Categoria[];
  lotes: Lote[];
  vacinas: Vacina[];
  /** Aplicações no lote (inclui as anuladas, para o histórico). */
  aplicacoes: Aplicacao[];
  /** Cada dose de vacina/vermífugo por animal, da pesagem e do lote (sem anuladas). */
  aplicacoesAnimais: AplicacaoAnimal[];
  insumos: Insumo[];
  movimentos: MovimentoEstoque[];
  /** Saldo de cada insumo por id, já com as baixas das vacinas aplicadas nas pesagens. */
  saldos: Map<string, SaldoInsumo>;
  pastos: Pasto[];
  /** Histórico de rotação dos lotes nos pastos. */
  ocupacoes: Ocupacao[];
  /** Dias sem pesagem até o animal entrar no alerta do painel. */
  diasAlerta: number;
  /** Peso vivo (kg) usado na previsão de abate. */
  pesoAbateKg: number;
  pesagens: Pesagem[];
  /** Leituras do pluviômetro, da mais recente para a mais antiga. */
  chuvas: Chuva[];
  /** Compra e venda por id do animal (vazio para quem não é ADMIN). */
  valores: Map<string, ValoresAnimal>;
  /** Despesas e receitas (vazio para quem não é ADMIN). */
  lancamentos: Lancamento[];
  /** Série de cada animal com variação e GMD, por id da pesagem. */
  calculadas: Map<string, PesagemCalculada>;
  carregando: boolean;
  /** Quando o app recebeu dados confirmados pelo servidor pela última vez. */
  ultimaSincronizacao: Date | null;
  online: boolean;
}

const Contexto = createContext<Dados | null>(null);
const CHAVE_SYNC = "boicontrol:ultimaSincronizacao";

function lerUltimaSync(): Date | null {
  try {
    const v = localStorage.getItem(CHAVE_SYNC);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

/**
 * Mantém a propriedade inteira sincronizada no cache local (design, seção 2:
 * até 50 animais cabem no aparelho). Tudo o que o app lê sai daqui.
 */
export function ProvedorDados({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined);
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);
  const [propriedade, setPropriedade] = useState({ nome: "", fuso: "America/Sao_Paulo", diasAlerta: DIAS_ALERTA_PADRAO, pesoAbateKg: PESO_ABATE_PADRAO_KG });
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [vacinas, setVacinas] = useState<Vacina[]>([]);
  const [chuvas, setChuvas] = useState<Chuva[]>([]);
  const [aplicacoes, setAplicacoes] = useState<Aplicacao[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoEstoque[]>([]);
  const [pastos, setPastos] = useState<Pasto[]>([]);
  const [ocupacoes, setOcupacoes] = useState<Ocupacao[]>([]);
  const [animais, setAnimais] = useState<Animal[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pesagens, setPesagens] = useState<Pesagem[] | null>(null);
  const [valores, setValores] = useState<Map<string, ValoresAnimal>>(new Map());
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<Date | null>(lerUltimaSync);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => onAuthStateChanged(auth, setUsuario), []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!usuario) {
      setVinculo(usuario === null ? null : undefined);
      return;
    }
    const q = query(collectionGroup(db, "membros"), where("uid", "==", usuario.uid));
    let tentouConvite = false;
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const d = snap.docs.find((m) => m.ref.parent.parent?.parent.id === "propriedades");
        // Sem vínculo no cache: com internet, espera a resposta do servidor antes de concluir.
        if (!d && snap.metadata.fromCache && navigator.onLine) return;
        if (!d && !tentouConvite && !snap.metadata.fromCache) {
          // Primeiro acesso: se houver convite para o e-mail, o vínculo é criado e
          // esta mesma consulta recebe o novo documento.
          tentouConvite = true;
          aceitarConvite(db, usuario)
            .then((pid) => {
              if (!pid) setVinculo(null);
            })
            .catch((erro) => {
              console.error("Falha ao aceitar o convite", erro);
              setVinculo(null);
            });
          return;
        }
        setVinculo(
          d
            ? { propriedadeId: d.ref.parent.parent!.id, perfil: d.get("perfil"), ativo: d.get("ativo") === true }
            : null,
        );
      },
      (erro) => {
        console.error("Falha ao buscar o vínculo do usuário", erro);
        setVinculo(null);
      },
    );
  }, [usuario]);

  const pid = vinculo?.ativo ? vinculo.propriedadeId : null;

  useEffect(() => {
    if (!pid) return;
    setAnimais(null);
    setPesagens(null);
    const marcarSync = (doServidor: boolean) => {
      if (!doServidor) return;
      const agora = new Date();
      setUltimaSincronizacao(agora);
      try {
        localStorage.setItem(CHAVE_SYNC, agora.toISOString());
      } catch {
        /* armazenamento indisponível: só não lembramos a data */
      }
    };
    const cancelar = [
      onSnapshot(doc(db, caminhos.propriedade(pid)), (s) =>
        setPropriedade({
          nome: s.get("nome") ?? "",
          fuso: s.get("fuso") ?? "America/Sao_Paulo",
          diasAlerta: s.get("configuracoes.diasAlertaPesagem") ?? DIAS_ALERTA_PADRAO,
          pesoAbateKg: s.get("configuracoes.pesoAbateKg") ?? PESO_ABATE_PADRAO_KG,
        }),
      ),
      onSnapshot(collection(db, caminhos.lotes(pid)), (s) =>
        setLotes(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Lote, "id">) }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
        ),
      ),
      onSnapshot(collection(db, caminhos.vacinas(pid)), (s) =>
        setVacinas(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Vacina, "id">) }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
        ),
      ),
      onSnapshot(collection(db, caminhos.chuvas(pid)), { includeMetadataChanges: true }, (s) =>
        setChuvas(
          s.docs
            .map((d) => ({ data: d.id, decimosMm: d.get("decimosMm") as number, pendente: d.metadata.hasPendingWrites }))
            .sort((a, b) => b.data.localeCompare(a.data)),
        ),
      ),
      onSnapshot(collection(db, caminhos.aplicacoes(pid)), { includeMetadataChanges: true }, (s) =>
        setAplicacoes(
          s.docs
            .map((d) => ({
              id: d.id,
              ...(d.data({ serverTimestamps: "estimate" }) as Omit<Aplicacao, "id" | "pendente">),
              pendente: d.metadata.hasPendingWrites,
            }))
            .sort((a, b) => b.data.toMillis() - a.data.toMillis()),
        ),
      ),
      onSnapshot(collection(db, caminhos.insumos(pid)), (s) =>
        setInsumos(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Insumo, "id">) }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
        ),
      ),
      onSnapshot(collection(db, caminhos.movimentosEstoque(pid)), { includeMetadataChanges: true }, (s) =>
        setMovimentos(
          s.docs
            .map((d) => ({
              id: d.id,
              ...(d.data({ serverTimestamps: "estimate" }) as Omit<MovimentoEstoque, "id" | "pendente">),
              pendente: d.metadata.hasPendingWrites,
            }))
            .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm?.toMillis() ?? 0) - (a.criadoEm?.toMillis() ?? 0)),
        ),
      ),
      onSnapshot(collection(db, caminhos.pastos(pid)), (s) =>
        setPastos(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Pasto, "id">) }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
        ),
      ),
      onSnapshot(collection(db, caminhos.ocupacoes(pid)), (s) =>
        setOcupacoes(
          s.docs.map((d) => {
            const o = d.data();
            return { id: d.id, loteId: o.loteId, pastoId: o.pastoId, entrada: o.entrada, saida: o.saida ?? null };
          }),
        ),
      ),
      onSnapshot(collection(db, caminhos.categorias(pid)), (s) =>
        setCategorias(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Categoria, "id">) }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
        ),
      ),
      onSnapshot(collection(db, caminhos.animais(pid)), { includeMetadataChanges: true }, (s) => {
        setAnimais(
          s.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: "estimate" }) as Omit<Animal, "id" | "resumo">), resumo: RESUMO_VAZIO })),
        );
        marcarSync(!s.metadata.fromCache);
      }),
      onSnapshot(collection(db, caminhos.pesagens(pid)), { includeMetadataChanges: true }, (s) => {
        setPesagens(
          s.docs.map((d) => ({
            id: d.id,
            ...(d.data({ serverTimestamps: "estimate" }) as Omit<Pesagem, "id" | "pendente">),
            pendente: d.metadata.hasPendingWrites,
          })),
        );
        marcarSync(!s.metadata.fromCache && !s.metadata.hasPendingWrites);
      }),
    ];
    return () => cancelar.forEach((c) => c());
  }, [pid]);

  // Financeiro: só o ADMIN pode ler (as regras recusam para os outros perfis).
  const adminPid = vinculo?.ativo && vinculo.perfil === "ADMIN" ? vinculo.propriedadeId : null;
  useEffect(() => {
    setValores(new Map());
    setLancamentos([]);
    if (!adminPid) return;
    const falha = (e: unknown) => console.error("Falha ao ler o financeiro", e);
    const cancelar = [
      onSnapshot(
        collection(db, caminhos.valoresAnimais(adminPid)),
        (s) => setValores(new Map(s.docs.map((d) => [d.id, d.data() as ValoresAnimal]))),
        falha,
      ),
      onSnapshot(
        collection(db, caminhos.lancamentos(adminPid)),
        (s) =>
          setLancamentos(
            s.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Lancamento, "id">) }))
              .sort((a, b) => b.data.localeCompare(a.data)),
          ),
        falha,
      ),
    ];
    return () => cancelar.forEach((c) => c());
  }, [adminPid]);

  const calculo = useMemo(() => {
    const porAnimal = calcularPorAnimal(
      (pesagens ?? []).map((p) => ({
        id: p.id,
        animalId: p.animalId,
        estado: p.estado,
        pesoG: p.pesoG,
        dataHoraPesagem: p.dataHoraPesagem.toDate(),
        criadoEm: (p.criadoEm ?? p.dataHoraPesagem).toDate(),
      })),
      propriedade.fuso,
    );
    const calculadas = new Map<string, PesagemCalculada>();
    for (const { serie } of porAnimal.values()) for (const s of serie) calculadas.set(s.id, s);
    const comResumo = (animais ?? []).map((a) => ({ ...a, resumo: porAnimal.get(a.id)?.resumo ?? RESUMO_VAZIO }));
    return { calculadas, comResumo };
  }, [animais, pesagens, propriedade.fuso]);

  const aplicacoesAnimais = useMemo<AplicacaoAnimal[]>(() => {
    const r: AplicacaoAnimal[] = [];
    for (const p of pesagens ?? []) {
      if (p.estado !== "VALIDA" || !p.vacinas) continue;
      for (const produtoId of p.vacinas) r.push({ animalId: p.animalId, produtoId, data: p.dataHoraPesagem.toDate() });
    }
    for (const a of aplicacoes) {
      if (a.anulada) continue;
      for (const animalId of a.animalIds) r.push({ animalId, produtoId: a.vacinaId, data: a.data.toDate() });
    }
    return r;
  }, [pesagens, aplicacoes]);

  const saldos = useMemo(() => {
    // Doses que saem do estoque: vacinas marcadas na pesagem e aplicadas no lote (uma por animal).
    const usos: PesagemComVacinas[] = (pesagens ?? []).map((p) => ({ estado: p.estado, criadoEm: (p.criadoEm ?? p.dataHoraPesagem).toDate(), vacinas: p.vacinas }));
    for (const a of aplicacoes) {
      const uso = { estado: a.anulada ? "ANULADA" : "VALIDA", criadoEm: (a.criadoEm ?? a.data).toDate(), vacinas: [a.vacinaId] };
      for (let n = 0; n < a.animalIds.length; n++) usos.push(uso);
    }
    return calcularSaldos(
      insumos.map((i) => ({ id: i.id, minimoMil: i.minimoMil ?? null, vacinaId: i.vacinaId ?? null, doseMil: i.doseMil ?? null, vacinaDesde: i.vacinaDesde?.toDate() ?? null })),
      movimentos,
      usos,
    );
  }, [insumos, movimentos, pesagens, aplicacoes]);

  const valor = useMemo<Dados>(
    () => ({
      usuario,
      vinculo,
      nomePropriedade: propriedade.nome,
      fuso: propriedade.fuso,
      animais: calculo.comResumo,
      categorias,
      lotes,
      vacinas,
      aplicacoes,
      aplicacoesAnimais,
      insumos,
      movimentos,
      saldos,
      pastos,
      ocupacoes,
      diasAlerta: propriedade.diasAlerta,
      pesoAbateKg: propriedade.pesoAbateKg,
      pesagens: pesagens ?? [],
      chuvas,
      valores,
      lancamentos,
      calculadas: calculo.calculadas,
      carregando: usuario === undefined || vinculo === undefined || (!!pid && (animais === null || pesagens === null)),
      ultimaSincronizacao,
      online,
    }),
    [usuario, vinculo, propriedade, animais, categorias, lotes, vacinas, aplicacoes, aplicacoesAnimais, insumos, movimentos, saldos, pastos, ocupacoes, pesagens, chuvas, valores, lancamentos, calculo, pid, ultimaSincronizacao, online],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDados(): Dados {
  const v = useContext(Contexto);
  if (!v) throw new Error("useDados fora do ProvedorDados");
  return v;
}

export function pode(vinculo: Vinculo | null | undefined, acao: "registrarPesagem" | "administrar"): boolean {
  if (!vinculo?.ativo) return false;
  if (acao === "administrar") return vinculo.perfil === "ADMIN";
  return vinculo.perfil === "ADMIN" || vinculo.perfil === "OPERADOR";
}
