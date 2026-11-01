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
  type EstadoPesagem,
  type PesagemCalculada,
  type Perfil,
  type ResumoAnimal,
  type SituacaoAnimal,
} from "@boicontrol/core";
import { auth, db } from "./firebase";

export interface Animal {
  id: string;
  codigoNumero: number;
  brinco: string;
  categoriaId: string;
  sexo: "M" | "F";
  nome: string | null;
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

export interface Pesagem {
  id: string;
  animalId: string;
  pesoG: number;
  dataHoraPesagem: Timestamp;
  observacao: string | null;
  estado: EstadoPesagem;
  versao: number;
  motivoCorrecao?: string;
  criadoEm: Timestamp | null;
  /** O Firestore ainda não confirmou a gravação no servidor. */
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
  pesagens: Pesagem[];
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
  const [propriedade, setPropriedade] = useState({ nome: "", fuso: "America/Sao_Paulo" });
  const [animais, setAnimais] = useState<Animal[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pesagens, setPesagens] = useState<Pesagem[] | null>(null);
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
    return onSnapshot(
      q,
      (snap) => {
        const d = snap.docs.find((m) => m.ref.parent.parent?.parent.id === "propriedades");
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
        setPropriedade({ nome: s.get("nome") ?? "", fuso: s.get("fuso") ?? "America/Sao_Paulo" }),
      ),
      onSnapshot(collection(db, caminhos.categorias(pid)), (s) =>
        setCategorias(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Categoria, "id">) }))),
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

  const valor = useMemo<Dados>(
    () => ({
      usuario,
      vinculo,
      nomePropriedade: propriedade.nome,
      fuso: propriedade.fuso,
      animais: calculo.comResumo,
      categorias,
      pesagens: pesagens ?? [],
      calculadas: calculo.calculadas,
      carregando: usuario === undefined || vinculo === undefined || (!!pid && (animais === null || pesagens === null)),
      ultimaSincronizacao,
      online,
    }),
    [usuario, vinculo, propriedade, animais, categorias, pesagens, calculo, pid, ultimaSincronizacao, online],
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
