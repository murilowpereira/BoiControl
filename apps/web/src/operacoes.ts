/**
 * Gravações do BoiControl no plano Spark (sem Cloud Functions).
 * Cada operação grava, numa única transação, o registro e o que as regras de
 * segurança exigem junto (brinco, contador, auditoria). As regras recusam a
 * gravação inteira se qualquer parte faltar ou estiver errada.
 *
 * Recebe a instância do Firestore para ser usada pelo app e pelos testes de regras.
 */
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import {
  caminhos,
  CHUVA_MAX_DECIMOS,
  CARENCIA_MAX_DIAS,
  diasValidos,
  INTERVALO_MAX_DIAS,
  MAX_ANIMAIS_APLICACAO,
  TOLERANCIA_FUTURO_MS,
  type TipoProduto,
  normalizarBrinco,
  CATEGORIAS_FINANCEIRAS,
  MAX_VACINAS_PESAGEM,
  QUANTIDADE_MAXIMA_MIL,
  TIPOS_INSUMO,
  UNIDADES_INSUMO,
  categoriaFinanceiraDoInsumo,
  formatarQuantidade,
  type TipoMovimento,
  PESO_ABATE_MAX_KG,
  VALOR_MAXIMO_CENTAVOS,
  type ValoresAnimalBase,
  PESO_ABATE_MIN_KG,
  AREA_MAXIMA_M2,
  pesoGValido,
  SITUACOES,
  type Perfil,
  type SituacaoAnimal,
  validarReproducao,
  type Diagnostico,
  type ErroReproducao,
  type TipoServico,
} from "@boicontrol/core";

export type CodigoErroOperacao =
  | "BRINCO_INVALIDO"
  | "BRINCO_DUPLICADO"
  | "CATEGORIA_INVALIDA"
  | "NAO_ENCONTRADO"
  | "MOTIVO_OBRIGATORIO"
  | "PESO_INVALIDO"
  | "DATA_INVALIDA"
  | "NAO_PERMITIDO"
  | "LOTE_INVALIDO"
  | "EMAIL_INVALIDO"
  | "NOME_OBRIGATORIO"
  | "VALOR_INVALIDO"
  | "VACINA_INVALIDA"
  | "QUANTIDADE_INVALIDA"
  | "PASTO_INVALIDO"
  | "AREA_INVALIDA"
  | "REPRODUCAO_INVALIDA";

export class ErroOperacao extends Error {
  constructor(
    readonly codigo: CodigoErroOperacao,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroOperacao";
  }
}

export const idAuditoria = (entidade: "animal" | "pesagem", id: string, versao: number) => `${entidade}_${id}_v${versao}`;

function auditar(
  db: Firestore,
  tx: Transaction,
  pid: string,
  uid: string,
  e: {
    entidade: "animal" | "pesagem";
    registroId: string;
    versao: number;
    acao: string;
    motivo?: string | null;
    antes?: Record<string, unknown> | null;
    depois?: Record<string, unknown> | null;
  },
) {
  tx.set(doc(db, caminhos.auditoria(pid), idAuditoria(e.entidade, e.registroId, e.versao)), {
    usuarioId: uid,
    entidade: e.entidade,
    registroId: e.registroId,
    versao: e.versao,
    acao: e.acao,
    motivo: e.motivo ?? null,
    antes: e.antes ?? null,
    depois: e.depois ?? null,
    em: serverTimestamp(),
  });
}

function lerBrinco(valor: string): string {
  const r = normalizarBrinco(valor);
  if (!r.ok) throw new ErroOperacao("BRINCO_INVALIDO", "Brinco inválido. Use letras, números ou hífen.");
  return r.brinco;
}

function opcional(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function exigirMotivo(motivo: string | undefined): string {
  const m = motivo?.trim();
  if (!m) throw new ErroOperacao("MOTIVO_OBRIGATORIO", "Informe o motivo.");
  return m;
}

export interface DadosAnimal {
  brinco: string;
  categoriaId: string;
  /** Lote (opcional). */
  loteId?: string | null;
  sexo: "M" | "F";
  nome?: string | null;
  dataNascimento?: string | null;
  observacao?: string | null;
  /** Valor pago pelo animal (só ADMIN vê). */
  compra?: ValorComData | null;
  /** Mãe (fêmea cadastrada); gravada só na criação. */
  maeId?: string | null;
}

/** Parto registrado junto com o cadastro do bezerro. */
export interface PartoDoBezerro {
  reproducaoId: string;
  dataParto: string;
  /** Data de hoje no fuso da propriedade (o parto não pode ser no futuro). */
  hoje: string;
}

/** Valor em centavos com a data (AAAA-MM-DD) da compra ou da venda. */
export interface ValorComData {
  centavos: number;
  data: string;
}

function validarValor(v: number | null | undefined, rotulo: string): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || v <= 0 || v > VALOR_MAXIMO_CENTAVOS) {
    throw new ErroOperacao("VALOR_INVALIDO", `${rotulo} inválido.`);
  }
  return v;
}

function validarData(d: string | null | undefined, rotulo: string): string | null {
  if (!d) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ErroOperacao("DATA_INVALIDA", `${rotulo} inválida.`);
  return d;
}

function documentoValores(v: ValoresAnimalBase, uid: string) {
  return {
    compraCentavos: validarValor(v.compraCentavos, "Valor de compra"),
    dataCompra: validarData(v.dataCompra, "Data de compra"),
    vendaCentavos: validarValor(v.vendaCentavos, "Valor de venda"),
    dataVenda: validarData(v.dataVenda, "Data de venda"),
    atualizadoPor: uid,
    atualizadoEm: serverTimestamp(),
  };
}

/** RF-03: exige conexão (transação). Código interno sequencial e brinco único. */
export async function criarAnimal(db: Firestore, pid: string, uid: string, dados: DadosAnimal, parto?: PartoDoBezerro) {
  const brinco = lerBrinco(dados.brinco);
  const animalRef = doc(db, caminhos.animais(pid), crypto.randomUUID());
  const maeId = opcional(dados.maeId);
  if (parto && !maeId) throw new ErroOperacao("REPRODUCAO_INVALIDA", "O bezerro precisa da mãe.");
  return runTransaction(db, async (tx) => {
    const contadorRef = doc(db, caminhos.contadorAnimais(pid));
    const brincoRef = doc(db, caminhos.brinco(pid, brinco));
    const reproducaoRef = parto ? doc(db, caminhos.reproducao(pid, parto.reproducaoId)) : null;
    const loteId = opcional(dados.loteId);
    const [contador, brincoExistente, categoria, lote, mae, reproducao] = await Promise.all([
      tx.get(contadorRef),
      tx.get(brincoRef),
      tx.get(doc(db, caminhos.categorias(pid), dados.categoriaId)),
      loteId ? tx.get(doc(db, caminhos.lotes(pid), loteId)) : Promise.resolve(null),
      maeId ? tx.get(doc(db, caminhos.animal(pid, maeId))) : Promise.resolve(null),
      reproducaoRef ? tx.get(reproducaoRef) : Promise.resolve(null),
    ]);
    if (mae && (!mae.exists() || mae.get("sexo") !== "F")) {
      throw new ErroOperacao("REPRODUCAO_INVALIDA", "A mãe precisa ser uma fêmea cadastrada.");
    }
    let partoAtualizado: Record<string, unknown> | null = null;
    if (parto && reproducao) {
      if (!reproducao.exists() || reproducao.get("femeaId") !== maeId) {
        throw new ErroOperacao("REPRODUCAO_INVALIDA", "Cobertura não encontrada para esta fêmea.");
      }
      if (reproducao.get("bezerroId")) throw new ErroOperacao("REPRODUCAO_INVALIDA", "Este parto já tem bezerro cadastrado.");
      const atual = reproducao.data() as unknown as RegistroReproducao;
      // Parto já registrado sem bezerro: só liga o bezerro, mantendo a data.
      partoAtualizado = atual.dataParto
        ? { atualizadoPor: uid, atualizadoEm: serverTimestamp() }
        : camposParto(atual, parto.dataParto, parto.hoje, uid);
    }
    if (lote && (!lote.exists() || lote.get("ativo") !== true)) {
      throw new ErroOperacao("LOTE_INVALIDO", "Lote inexistente ou inativo.");
    }
    if (brincoExistente.exists()) {
      throw new ErroOperacao("BRINCO_DUPLICADO", `Já existe um animal com o brinco ${brinco}.`);
    }
    if (!categoria.exists() || categoria.get("ativo") !== true) {
      throw new ErroOperacao("CATEGORIA_INVALIDA", "Categoria inexistente ou inativa.");
    }
    const codigoNumero = ((contador.get("ultimo") as number | undefined) ?? 0) + 1;
    const animal = {
      codigoNumero,
      brinco,
      categoriaId: dados.categoriaId,
      loteId,
      ...(maeId ? { maeId } : {}),
      sexo: dados.sexo,
      nome: opcional(dados.nome),
      dataNascimento: opcional(dados.dataNascimento),
      observacao: opcional(dados.observacao),
      situacao: "ATIVO",
      situacaoDesde: serverTimestamp(),
      versao: 0,
      criadoPor: uid,
      criadoEm: serverTimestamp(),
    };
    tx.set(contadorRef, { ultimo: codigoNumero });
    tx.set(animalRef, animal);
    tx.set(brincoRef, { animalId: animalRef.id });
    if (dados.compra) {
      tx.set(
        doc(db, caminhos.valoresAnimal(pid, animalRef.id)),
        documentoValores({ compraCentavos: dados.compra.centavos, dataCompra: dados.compra.data, vendaCentavos: null, dataVenda: null }, uid),
      );
    }
    if (reproducaoRef && partoAtualizado) tx.update(reproducaoRef, { ...partoAtualizado, bezerroId: animalRef.id });
    auditar(db, tx, pid, uid, {
      entidade: "animal",
      registroId: animalRef.id,
      versao: 0,
      acao: "CRIAR_ANIMAL",
      depois: { codigoNumero, brinco, categoriaId: dados.categoriaId, sexo: dados.sexo, ...(maeId ? { maeId } : {}) },
    });
    return { id: animalRef.id, codigoNumero };
  });
}

const CAMPOS_EDITAVEIS = ["brinco", "categoriaId", "loteId", "sexo", "nome", "dataNascimento", "observacao"] as const;

/** RF-04: edita dados cadastrais; o código interno nunca muda. */
export async function editarAnimal(db: Firestore, pid: string, uid: string, animalId: string, dados: Partial<DadosAnimal>) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, caminhos.animal(pid, animalId));
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ErroOperacao("NAO_ENCONTRADO", "Animal não encontrado.");
    const atual = snap.data();

    const novo: Record<string, unknown> = {};
    if (dados.brinco !== undefined) novo.brinco = lerBrinco(dados.brinco);
    if (dados.categoriaId !== undefined) novo.categoriaId = dados.categoriaId;
    if (dados.loteId !== undefined) novo.loteId = opcional(dados.loteId);
    if (dados.sexo !== undefined) novo.sexo = dados.sexo;
    if (dados.nome !== undefined) novo.nome = opcional(dados.nome);
    if (dados.dataNascimento !== undefined) novo.dataNascimento = opcional(dados.dataNascimento);
    if (dados.observacao !== undefined) novo.observacao = opcional(dados.observacao);
    for (const k of CAMPOS_EDITAVEIS) if (k in novo && novo[k] === (atual[k] ?? null)) delete novo[k];
    if (Object.keys(novo).length === 0) return { alterado: false };

    if (novo.brinco) {
      const novoRef = doc(db, caminhos.brinco(pid, novo.brinco as string));
      if ((await tx.get(novoRef)).exists()) {
        throw new ErroOperacao("BRINCO_DUPLICADO", `Já existe um animal com o brinco ${novo.brinco as string}.`);
      }
    }
    if (novo.categoriaId) {
      const cat = await tx.get(doc(db, caminhos.categorias(pid), novo.categoriaId as string));
      if (!cat.exists() || cat.get("ativo") !== true) {
        throw new ErroOperacao("CATEGORIA_INVALIDA", "Categoria inexistente ou inativa.");
      }
    }

    if (novo.loteId) {
      const lote = await tx.get(doc(db, caminhos.lotes(pid), novo.loteId as string));
      if (!lote.exists() || lote.get("ativo") !== true) {
        throw new ErroOperacao("LOTE_INVALIDO", "Lote inexistente ou inativo.");
      }
    }

    const versao = (atual.versao as number) + 1;
    if (novo.brinco) {
      tx.delete(doc(db, caminhos.brinco(pid, atual.brinco)));
      tx.set(doc(db, caminhos.brinco(pid, novo.brinco as string)), { animalId });
    }
    tx.update(ref, { ...novo, versao, atualizadoPor: uid, atualizadoEm: serverTimestamp() });
    auditar(db, tx, pid, uid, {
      entidade: "animal",
      registroId: animalId,
      versao,
      acao: "EDITAR_ANIMAL",
      antes: Object.fromEntries(Object.keys(novo).map((k) => [k, atual[k] ?? null])),
      depois: novo,
    });
    return { alterado: true };
  });
}

/** RF-05 / RN-03: muda a situação sem apagar histórico; motivo obrigatório. */
export async function alterarSituacaoAnimal(
  db: Firestore,
  pid: string,
  uid: string,
  animalId: string,
  situacao: SituacaoAnimal,
  motivo: string,
  /** Valor de venda, gravado junto quando a situação passa a VENDIDO. */
  venda?: ValorComData | null,
) {
  if (!SITUACOES.includes(situacao)) throw new ErroOperacao("NAO_PERMITIDO", "Situação inválida.");
  const m = exigirMotivo(motivo);
  if (venda) validarValor(venda.centavos, "Valor de venda");
  return runTransaction(db, async (tx) => {
    const ref = doc(db, caminhos.animal(pid, animalId));
    const valoresRef = doc(db, caminhos.valoresAnimal(pid, animalId));
    const [snap, valores] = await Promise.all([
      tx.get(ref),
      venda && situacao === "VENDIDO" ? tx.get(valoresRef) : Promise.resolve(null),
    ]);
    if (!snap.exists()) throw new ErroOperacao("NAO_ENCONTRADO", "Animal não encontrado.");
    const anterior = snap.get("situacao");
    if (anterior === situacao) return { alterado: false };
    const versao = (snap.get("versao") as number) + 1;
    tx.update(ref, { situacao, situacaoDesde: serverTimestamp(), versao, atualizadoPor: uid, atualizadoEm: serverTimestamp() });
    if (venda && valores) {
      const atual = valores.exists() ? (valores.data() as Partial<ValoresAnimalBase>) : {};
      tx.set(
        valoresRef,
        documentoValores(
          {
            compraCentavos: atual.compraCentavos ?? null,
            dataCompra: atual.dataCompra ?? null,
            vendaCentavos: venda.centavos,
            dataVenda: venda.data,
          },
          uid,
        ),
      );
    }
    auditar(db, tx, pid, uid, {
      entidade: "animal",
      registroId: animalId,
      versao,
      acao: "ALTERAR_SITUACAO",
      motivo: m,
      antes: { situacao: anterior },
      depois: { situacao },
    });
    return { alterado: true };
  });
}

export interface PedidoCorrecao {
  pesagemId: string;
  motivo: string;
  pesoG?: number;
  dataHoraPesagem?: Date;
  anular?: boolean;
}

/** RF-09 / RN-11: correção ou anulação por ADMIN, com auditoria antes/depois. */
export async function corrigirPesagem(db: Firestore, pid: string, uid: string, pedido: PedidoCorrecao) {
  const motivo = exigirMotivo(pedido.motivo);
  if (pedido.pesoG !== undefined && !pesoGValido(pedido.pesoG)) {
    throw new ErroOperacao("PESO_INVALIDO", "Peso inválido.");
  }
  if (pedido.dataHoraPesagem && Number.isNaN(pedido.dataHoraPesagem.getTime())) {
    throw new ErroOperacao("DATA_INVALIDA", "Data inválida.");
  }
  return runTransaction(db, async (tx) => {
    const ref = doc(db, caminhos.pesagem(pid, pedido.pesagemId));
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ErroOperacao("NAO_ENCONTRADO", "Pesagem não encontrada.");
    if (snap.get("estado") !== "VALIDA") throw new ErroOperacao("NAO_PERMITIDO", "Esta pesagem já foi anulada.");

    const antes = {
      pesoG: snap.get("pesoG") as number,
      dataHoraPesagem: snap.get("dataHoraPesagem") as Timestamp,
      estado: "VALIDA",
    };
    const depois = {
      pesoG: pedido.anular ? antes.pesoG : (pedido.pesoG ?? antes.pesoG),
      dataHoraPesagem:
        !pedido.anular && pedido.dataHoraPesagem ? Timestamp.fromDate(pedido.dataHoraPesagem) : antes.dataHoraPesagem,
      estado: pedido.anular ? "ANULADA" : "VALIDA",
    };
    const versao = (snap.get("versao") as number) + 1;
    tx.update(ref, { ...depois, motivoCorrecao: motivo, versao, atualizadoPor: uid, atualizadoEm: serverTimestamp() });
    auditar(db, tx, pid, uid, {
      entidade: "pesagem",
      registroId: pedido.pesagemId,
      versao,
      acao: pedido.anular ? "ANULAR_PESAGEM" : "CORRIGIR_PESAGEM",
      motivo,
      antes,
      depois,
    });
    return { estado: depois.estado };
  });
}

export interface NovaPesagem {
  pid: string;
  uid: string;
  animalId: string;
  pesoG: number;
  dataHora: Date;
  fuso: string;
  observacao: string;
  /** IDs das vacinas aplicadas durante a pesagem (pode ser vazio). */
  vacinas?: readonly string[];
}

/** Tira repetidos e confere o limite; as regras aceitam até MAX_VACINAS_PESAGEM. */
export function lerVacinas(ids: readonly string[] | undefined): string[] {
  const lista = [...new Set((ids ?? []).filter((v) => typeof v === "string" && v.length > 0 && v.length <= 60))];
  if (lista.length > MAX_VACINAS_PESAGEM) {
    throw new ErroOperacao("VACINA_INVALIDA", `Marque no máximo ${MAX_VACINAS_PESAGEM} vacinas por pesagem.`);
  }
  return lista;
}

/**
 * RF-07 / RF-14: grava com UUID gerado no aparelho, sem esperar o servidor.
 * Offline, a promessa só resolve na sincronização, mas o registro já está no
 * cache persistente. `aoFalhar` recebe uma recusa do servidor (RF-16).
 */
export function registrarPesagem(db: Firestore, p: NovaPesagem, aoFalhar: (e: unknown) => void): string {
  if (!pesoGValido(p.pesoG)) throw new ErroOperacao("PESO_INVALIDO", "Peso inválido.");
  const vacinas = lerVacinas(p.vacinas);
  const id = crypto.randomUUID();
  setDoc(doc(db, caminhos.pesagem(p.pid, id)), {
    animalId: p.animalId,
    pesoG: p.pesoG,
    dataHoraPesagem: Timestamp.fromDate(p.dataHora),
    fuso: p.fuso,
    observacao: p.observacao.trim() || null,
    ...(vacinas.length > 0 ? { vacinas } : {}),
    estado: "VALIDA",
    versao: 0,
    criadoPor: p.uid,
    criadoEm: serverTimestamp(),
  }).catch(aoFalhar);
  return id;
}

// ------------------------------------------------------------ propriedade e pessoas

export async function renomearPropriedade(db: Firestore, pid: string, nome: string): Promise<void> {
  const n = nome.trim();
  if (!n || n.length > 80) throw new ErroOperacao("NOME_OBRIGATORIO", "Informe um nome com até 80 caracteres.");
  await updateDoc(doc(db, caminhos.propriedade(pid)), { nome: n });
}

export function normalizarEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) ? e : null;
}

/** O ADMIN convida pelo e-mail; a pessoa ganha acesso ao entrar com a conta Google desse e-mail. */
export async function convidarPessoa(
  db: Firestore,
  pid: string,
  uid: string,
  dados: { email: string; nome: string; perfil: Perfil },
): Promise<string> {
  const email = normalizarEmail(dados.email);
  if (!email) throw new ErroOperacao("EMAIL_INVALIDO", "E-mail inválido.");
  const nome = dados.nome.trim();
  if (!nome || nome.length > 80) throw new ErroOperacao("NOME_OBRIGATORIO", "Informe o nome da pessoa.");
  await setDoc(doc(db, caminhos.convite(pid, email)), {
    email,
    nome,
    perfil: dados.perfil,
    convidadoPor: uid,
    convidadoEm: serverTimestamp(),
  });
  return email;
}

export async function cancelarConvite(db: Firestore, pid: string, email: string): Promise<void> {
  await deleteDoc(doc(db, caminhos.convite(pid, email)));
}

/** ADMIN altera o perfil ou ativa/desativa outra pessoa (as regras não deixam mudar a si mesmo). */
export async function alterarMembro(
  db: Firestore,
  pid: string,
  uidMembro: string,
  mudanca: { perfil?: Perfil; ativo?: boolean },
): Promise<void> {
  await updateDoc(doc(db, caminhos.membro(pid, uidMembro)), mudanca);
}

/**
 * Primeiro acesso de quem foi convidado: procura um convite para o próprio e-mail
 * e, se houver, cria o vínculo e apaga o convite na mesma gravação.
 * Devolve o ID da propriedade ou null se não houver convite.
 */
export async function aceitarConvite(
  db: Firestore,
  usuario: { uid: string; email: string | null; emailVerified: boolean },
): Promise<string | null> {
  if (!usuario.email || !usuario.emailVerified) return null;
  const email = usuario.email.toLowerCase();
  const snap = await getDocs(query(collectionGroup(db, "convites"), where("email", "==", email)));
  const convite = snap.docs.find((d) => d.ref.parent.parent?.parent.id === "propriedades");
  if (!convite) return null;
  const pid = convite.ref.parent.parent!.id;
  const lote = writeBatch(db);
  lote.set(doc(db, caminhos.membro(pid, usuario.uid)), {
    uid: usuario.uid,
    nome: convite.get("nome"),
    email,
    perfil: convite.get("perfil"),
    ativo: true,
  });
  lote.delete(convite.ref);
  await lote.commit();
  return pid;
}

// ------------------------------------------------ categorias, lotes e vacinas

export type ColecaoGrupo = "categorias" | "lotes" | "vacinas";

/** ID legível a partir do nome ("Novilha prenha" → "novilha-prenha"), sem repetir um existente. */
export function idParaNome(nome: string, existentes: readonly string[]): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "item";
  let id = base;
  for (let n = 2; existentes.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** Cria (sem id) ou atualiza (com id) uma categoria, um lote ou uma vacina. Nunca apaga: desativa. */
export async function salvarGrupo(
  db: Firestore,
  pid: string,
  colecao: ColecaoGrupo,
  dados: { id?: string; nome: string; ativo: boolean },
  existentes: readonly string[],
): Promise<string> {
  const nome = dados.nome.trim();
  if (!nome || nome.length > 40) throw new ErroOperacao("NOME_OBRIGATORIO", "Informe um nome com até 40 caracteres.");
  const id = dados.id ?? idParaNome(nome, existentes);
  // merge: renomear uma vacina não apaga a carência e o intervalo dela.
  await setDoc(doc(db, caminhos[colecao](pid), id), { nome, ativo: dados.ativo }, { merge: true });
  return id;
}

// ------------------------------------------------------------ agenda sanitária

export interface ProtocoloProduto {
  tipo: TipoProduto | null;
  carenciaDias: number | null;
  intervaloDias: number | null;
}

/** Tipo, carência e intervalo de repetição de uma vacina ou vermífugo (ADMIN). */
export async function salvarProtocolo(db: Firestore, pid: string, vacinaId: string, p: ProtocoloProduto): Promise<void> {
  if (p.carenciaDias !== null && !diasValidos(p.carenciaDias, CARENCIA_MAX_DIAS)) {
    throw new ErroOperacao("DATA_INVALIDA", `Carência: informe de 1 a ${CARENCIA_MAX_DIAS} dias, ou deixe em branco.`);
  }
  if (p.intervaloDias !== null && !diasValidos(p.intervaloDias, INTERVALO_MAX_DIAS)) {
    throw new ErroOperacao("DATA_INVALIDA", `Repetir a cada: informe de 1 a ${INTERVALO_MAX_DIAS} dias, ou deixe em branco.`);
  }
  await updateDoc(doc(db, caminhos.vacinas(pid), vacinaId), { tipo: p.tipo, carenciaDias: p.carenciaDias, intervaloDias: p.intervaloDias });
}

export interface NovaAplicacao {
  pid: string;
  uid: string;
  vacinaId: string;
  data: Date;
  animalIds: readonly string[];
  loteId: string | null;
  observacao?: string;
}

/**
 * Vacina ou vermífugo aplicado em vários animais sem pesagem. Como a pesagem,
 * grava com UUID do aparelho e funciona offline; `aoFalhar` recebe a recusa.
 */
export function registrarAplicacao(db: Firestore, a: NovaAplicacao, aoFalhar: (e: unknown) => void): string {
  const animalIds = [...new Set(a.animalIds)];
  if (animalIds.length === 0) throw new ErroOperacao("NAO_PERMITIDO", "Marque pelo menos um animal.");
  if (animalIds.length > MAX_ANIMAIS_APLICACAO) {
    throw new ErroOperacao("NAO_PERMITIDO", `Registre no máximo ${MAX_ANIMAIS_APLICACAO} animais por vez.`);
  }
  if (!a.vacinaId) throw new ErroOperacao("VACINA_INVALIDA", "Escolha a vacina ou o vermífugo.");
  if (Number.isNaN(a.data.getTime()) || a.data.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) {
    throw new ErroOperacao("DATA_INVALIDA", "A data da aplicação não pode ser no futuro.");
  }
  const observacao = a.observacao?.trim() || null;
  if (observacao && observacao.length > 200) throw new ErroOperacao("NAO_PERMITIDO", "Observação muito longa (até 200 letras).");
  const id = crypto.randomUUID();
  setDoc(doc(db, caminhos.aplicacoes(a.pid), id), {
    vacinaId: a.vacinaId,
    data: Timestamp.fromDate(a.data),
    animalIds,
    loteId: a.loteId,
    observacao,
    criadoPor: a.uid,
    criadoEm: serverTimestamp(),
  }).catch(aoFalhar);
  return id;
}

/** ADMIN anula uma aplicação registrada por engano (ela sai da agenda e da carência). */
export async function anularAplicacao(db: Firestore, pid: string, uid: string, id: string): Promise<void> {
  await updateDoc(doc(db, caminhos.aplicacoes(pid), id), { anulada: true, anuladaPor: uid, anuladaEm: serverTimestamp() });
}

/** Quantos dias sem pesagem até o animal aparecer no alerta do painel. */
export async function salvarDiasAlerta(db: Firestore, pid: string, dias: number): Promise<void> {
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    throw new ErroOperacao("DATA_INVALIDA", "Informe um número de dias entre 1 e 365.");
  }
  await updateDoc(doc(db, caminhos.propriedade(pid)), { "configuracoes.diasAlertaPesagem": dias });
}

export async function salvarPesoAbate(db: Firestore, pid: string, kg: number): Promise<void> {
  if (!Number.isInteger(kg) || kg < PESO_ABATE_MIN_KG || kg > PESO_ABATE_MAX_KG) {
    throw new ErroOperacao("PESO_INVALIDO", `Informe um peso inteiro entre ${PESO_ABATE_MIN_KG} e ${PESO_ABATE_MAX_KG} kg.`);
  }
  await updateDoc(doc(db, caminhos.propriedade(pid)), { "configuracoes.pesoAbateKg": kg });
}

/** Grava compra e venda do animal (ADMIN). */
export async function salvarValoresAnimal(db: Firestore, pid: string, uid: string, animalId: string, valores: ValoresAnimalBase) {
  await setDoc(doc(db, caminhos.valoresAnimal(pid, animalId)), documentoValores(valores, uid));
}

export interface DadosLancamento {
  id?: string;
  categoria: string;
  descricao?: string | null;
  valorCentavos: number;
  data: string;
  /** Lote a que a despesa/receita pertence; null = geral da fazenda. */
  loteId?: string | null;
}

/** Cria ou altera uma despesa/receita (ração, vacinas...). */
export async function salvarLancamento(db: Firestore, pid: string, uid: string, l: DadosLancamento): Promise<string> {
  if (!CATEGORIAS_FINANCEIRAS.some((c) => c.id === l.categoria)) {
    throw new ErroOperacao("NAO_PERMITIDO", "Escolha o tipo do lançamento.");
  }
  const valorCentavos = validarValor(l.valorCentavos, "Valor");
  if (valorCentavos === null) throw new ErroOperacao("VALOR_INVALIDO", "Informe o valor.");
  const data = validarData(l.data, "Data");
  if (!data) throw new ErroOperacao("DATA_INVALIDA", "Informe a data.");
  const descricao = opcional(l.descricao);
  if (descricao && descricao.length > 120) throw new ErroOperacao("NAO_PERMITIDO", "Descrição muito longa (até 120 letras).");
  const campos = { categoria: l.categoria, descricao, valorCentavos, data, loteId: l.loteId || null };
  if (l.id) {
    await updateDoc(doc(db, caminhos.lancamentos(pid), l.id), { ...campos, atualizadoPor: uid, atualizadoEm: serverTimestamp() });
    return l.id;
  }
  const ref = doc(db, caminhos.lancamentos(pid), crypto.randomUUID());
  await setDoc(ref, { ...campos, criadoPor: uid, criadoEm: serverTimestamp() });
  return ref.id;
}

export async function excluirLancamento(db: Firestore, pid: string, id: string) {
  await deleteDoc(doc(db, caminhos.lancamentos(pid), id));
}

// ------------------------------------------------------------------ chuva

/**
 * Anota a chuva do dia (substitui a leitura que já houver na data). Não espera
 * o servidor, para funcionar offline como a pesagem.
 */
export function registrarChuva(
  db: Firestore,
  pid: string,
  uid: string,
  r: { data: string; decimosMm: number },
  aoFalhar: (e: unknown) => void,
): void {
  const data = validarData(r.data, "Data");
  if (!data) throw new ErroOperacao("DATA_INVALIDA", "Informe a data.");
  if (!Number.isInteger(r.decimosMm) || r.decimosMm < 0 || r.decimosMm > CHUVA_MAX_DECIMOS) {
    throw new ErroOperacao("VALOR_INVALIDO", "Informe a chuva em mm, de 0 a 500.");
  }
  setDoc(doc(db, caminhos.chuva(pid, data)), { decimosMm: r.decimosMm, registradoPor: uid, registradoEm: serverTimestamp() }).catch(aoFalhar);
}

export function excluirChuva(db: Firestore, pid: string, data: string, aoFalhar: (e: unknown) => void): void {
  deleteDoc(doc(db, caminhos.chuva(pid, data))).catch(aoFalhar);
}

// ---------------------------------------------------------------- estoque

export interface DadosInsumo {
  nome: string;
  tipo: string;
  unidade: string;
  ativo: boolean;
  minimoMil: number | null;
  /** Vacina que dá baixa automática neste insumo quando marcada na pesagem. */
  vacinaId: string | null;
  doseMil: number | null;
}

function quantidade(q: number | null | undefined, rotulo: string, zeroPode = false): number | null {
  if (q === null || q === undefined) return null;
  if (!Number.isInteger(q) || q < (zeroPode ? 0 : 1) || q > QUANTIDADE_MAXIMA_MIL) {
    throw new ErroOperacao("QUANTIDADE_INVALIDA", `${rotulo} inválida.`);
  }
  return q;
}

/**
 * Cria (sem id) ou altera um insumo. Ao ligar (ou trocar) a vacina, a baixa
 * automática vale só para as pesagens a partir de agora.
 */
export async function salvarInsumo(
  db: Firestore,
  pid: string,
  dados: DadosInsumo,
  anterior: { id: string; vacinaId: string | null; vacinaDesde: Timestamp | null } | null,
  existentes: readonly string[],
): Promise<string> {
  const nome = dados.nome.trim();
  if (!nome || nome.length > 40) throw new ErroOperacao("NOME_OBRIGATORIO", "Informe um nome com até 40 caracteres.");
  if (!TIPOS_INSUMO.some((t) => t.id === dados.tipo)) throw new ErroOperacao("NAO_PERMITIDO", "Escolha o tipo do insumo.");
  if (!(UNIDADES_INSUMO as readonly string[]).includes(dados.unidade)) throw new ErroOperacao("NAO_PERMITIDO", "Escolha a unidade.");
  const minimoMil = quantidade(dados.minimoMil, "Estoque mínimo", true);
  const vacinaId = dados.vacinaId || null;
  const doseMil = vacinaId ? quantidade(dados.doseMil, "Dose por animal") : null;
  if (vacinaId && doseMil === null) throw new ErroOperacao("QUANTIDADE_INVALIDA", "Informe quanto sai do estoque por animal vacinado.");
  const vacinaDesde = !vacinaId
    ? null
    : anterior && anterior.vacinaId === vacinaId && anterior.vacinaDesde
      ? anterior.vacinaDesde
      : Timestamp.now();
  const id = anterior?.id ?? idParaNome(nome, existentes);
  await setDoc(doc(db, caminhos.insumo(pid, id)), {
    nome,
    tipo: dados.tipo,
    unidade: dados.unidade,
    ativo: dados.ativo,
    minimoMil,
    vacinaId,
    doseMil,
    vacinaDesde,
  });
  return id;
}

export interface NovoMovimento {
  pid: string;
  uid: string;
  insumoId: string;
  /** Para a descrição da despesa no financeiro. */
  nomeInsumo: string;
  tipoInsumo: string;
  unidade: string;
  tipo: TipoMovimento;
  quantidadeMil: number;
  /** AAAA-MM-DD */
  data: string;
  observacao: string;
  /** Valor pago na compra (só ADMIN e só na entrada): vira despesa no financeiro. */
  valorCentavos?: number | null;
}

/**
 * Registra uma entrada ou saída. Como a pesagem, funciona sem internet: a
 * gravação fica no aparelho e `aoFalhar` é chamado se o servidor recusar.
 * Uma compra com valor grava junto a despesa no financeiro.
 */
export function registrarMovimento(db: Firestore, m: NovoMovimento, aoFalhar: (e: unknown) => void): string {
  const quantidadeMil = quantidade(m.quantidadeMil, "Quantidade");
  if (quantidadeMil === null) throw new ErroOperacao("QUANTIDADE_INVALIDA", "Informe a quantidade.");
  const data = validarData(m.data, "Data");
  if (!data) throw new ErroOperacao("DATA_INVALIDA", "Informe a data.");
  const observacao = opcional(m.observacao);
  if (observacao && observacao.length > 200) throw new ErroOperacao("NAO_PERMITIDO", "Observação muito longa (até 200 letras).");
  const valorCentavos = m.tipo === "ENTRADA" ? validarValor(m.valorCentavos, "Valor") : null;

  const id = crypto.randomUUID();
  const lote = writeBatch(db);
  let lancamentoId: string | null = null;
  if (valorCentavos !== null) {
    lancamentoId = crypto.randomUUID();
    lote.set(doc(db, caminhos.lancamentos(m.pid), lancamentoId), {
      categoria: categoriaFinanceiraDoInsumo(m.tipoInsumo),
      descricao: `Compra: ${m.nomeInsumo} (${formatarQuantidade(quantidadeMil, m.unidade)})`.slice(0, 120),
      valorCentavos,
      data,
      criadoPor: m.uid,
      criadoEm: serverTimestamp(),
    });
  }
  lote.set(doc(db, caminhos.movimentoEstoque(m.pid, id)), {
    insumoId: m.insumoId,
    tipo: m.tipo,
    quantidadeMil,
    data,
    observacao,
    ...(lancamentoId ? { lancamentoId } : {}),
    criadoPor: m.uid,
    criadoEm: serverTimestamp(),
  });
  lote.commit().catch(aoFalhar);
  return id;
}

/** Exclui um movimento lançado errado (ADMIN), junto com a despesa da compra, se houver. */
export async function excluirMovimento(db: Firestore, pid: string, id: string, lancamentoId: string | null) {
  const lote = writeBatch(db);
  lote.delete(doc(db, caminhos.movimentoEstoque(pid, id)));
  if (lancamentoId) lote.delete(doc(db, caminhos.lancamentos(pid), lancamentoId));
  await lote.commit();
}

// ------------------------------------------------------- pastos e rotação

export interface DadosPasto {
  id?: string;
  nome: string;
  areaM2: number;
  ativo: boolean;
}

/** Cria (sem id) ou atualiza (com id) um pasto ou piquete. Nunca apaga: desativa. */
export async function salvarPasto(db: Firestore, pid: string, dados: DadosPasto, existentes: readonly string[]): Promise<string> {
  const nome = dados.nome.trim();
  if (!nome || nome.length > 40) throw new ErroOperacao("NOME_OBRIGATORIO", "Informe um nome com até 40 caracteres.");
  if (!Number.isInteger(dados.areaM2) || dados.areaM2 <= 0 || dados.areaM2 > AREA_MAXIMA_M2) {
    throw new ErroOperacao("AREA_INVALIDA", "Informe a área em hectares (ex.: 12,5).");
  }
  const id = dados.id ?? idParaNome(nome, existentes);
  await setDoc(doc(db, caminhos.pastos(pid), id), { nome, areaM2: dados.areaM2, ativo: dados.ativo });
  return id;
}

export interface MudancaPasto {
  loteId: string;
  /** Pasto de destino; null tira o lote do pasto atual sem pôr em outro. */
  pastoId: string | null;
  /** Data "AAAA-MM-DD" da mudança: saída do pasto atual e entrada no novo. */
  data: string;
  /** Ocupação em aberto do lote, se ele já está em algum pasto. */
  atual?: { id: string; pastoId: string; entrada: string } | null;
}

/**
 * Muda o lote de pasto numa única gravação: fecha a ocupação atual (saída na
 * data) e abre a nova (entrada na mesma data). Erros de validação são lançados
 * na hora; a gravação funciona sem internet.
 */
export function moverLote(db: Firestore, pid: string, uid: string, m: MudancaPasto): { novaId: string | null; gravado: Promise<void> } {
  const data = validarData(m.data, "Data");
  if (!data) throw new ErroOperacao("DATA_INVALIDA", "Informe a data.");
  if (m.atual && m.pastoId === m.atual.pastoId) throw new ErroOperacao("PASTO_INVALIDO", "O lote já está nesse pasto.");
  if (!m.atual && m.pastoId === null) throw new ErroOperacao("PASTO_INVALIDO", "O lote não está em nenhum pasto.");
  if (m.atual && data < m.atual.entrada) {
    throw new ErroOperacao("DATA_INVALIDA", "A data não pode ser antes da entrada no pasto atual.");
  }
  const lote = writeBatch(db);
  if (m.atual) lote.update(doc(db, caminhos.ocupacoes(pid), m.atual.id), { saida: data });
  let novaId: string | null = null;
  if (m.pastoId) {
    novaId = crypto.randomUUID();
    lote.set(doc(db, caminhos.ocupacoes(pid), novaId), {
      loteId: m.loteId,
      pastoId: m.pastoId,
      entrada: data,
      saida: null,
      criadoPor: uid,
      criadoEm: serverTimestamp(),
    });
  }
  // Sem internet, `gravado` só termina quando sincroniza; o cache local já mostra a mudança.
  return { novaId, gravado: lote.commit() };
}

/** Apaga um registro de rotação lançado por engano (ADMIN). */
export async function excluirOcupacao(db: Firestore, pid: string, id: string) {
  await deleteDoc(doc(db, caminhos.ocupacoes(pid), id));
}

// ---------------------------------------------------------------- reprodução

/** Documento de reproducoes/{id}, como gravado. */
export interface RegistroReproducao {
  femeaId: string;
  tipo: TipoServico;
  dataServico: string;
  reprodutor: string | null;
  observacao: string | null;
  diagnostico: Diagnostico | null;
  dataDiagnostico: string | null;
  dataParto: string | null;
  bezerroId: string | null;
}

const MENSAGENS_REPRODUCAO: Record<ErroReproducao, string> = {
  DATA_INVALIDA: "Data inválida.",
  DATA_FUTURA: "A data não pode estar no futuro.",
  DIAGNOSTICO_ANTES_DO_SERVICO: "O diagnóstico não pode ser antes da cobertura.",
  PARTO_ANTES_DO_SERVICO: "O parto não pode ser antes da cobertura.",
  PARTO_DE_VAZIA: "Fêmea diagnosticada vazia não pode ter parto. Corrija o diagnóstico antes.",
};

function conferirReproducao(r: RegistroReproducao, hoje: string) {
  const erro = validarReproducao(r, hoje);
  if (erro) throw new ErroOperacao("REPRODUCAO_INVALIDA", MENSAGENS_REPRODUCAO[erro]);
  if (r.reprodutor && r.reprodutor.length > 80) throw new ErroOperacao("REPRODUCAO_INVALIDA", "Nome do touro ou sêmen muito longo (até 80 letras).");
  if (r.observacao && r.observacao.length > 500) throw new ErroOperacao("REPRODUCAO_INVALIDA", "Observação muito longa (até 500 letras).");
}

/** Campos gravados ao registrar o parto: o parto confirma a prenhez. */
function camposParto(atual: RegistroReproducao, dataParto: string, hoje: string, uid: string): Record<string, unknown> {
  if (atual.dataParto) throw new ErroOperacao("REPRODUCAO_INVALIDA", "O parto já foi registrado.");
  const diagnostico = atual.diagnostico ?? "PRENHE";
  const dataDiagnostico = atual.dataDiagnostico ?? dataParto;
  conferirReproducao({ ...atual, diagnostico, dataDiagnostico, dataParto }, hoje);
  return { diagnostico, dataDiagnostico, dataParto, atualizadoPor: uid, atualizadoEm: serverTimestamp() };
}

/**
 * Grava sem esperar o servidor (funciona offline, como a pesagem). A promessa
 * só resolve quando o servidor confirma; `aoFalhar` recebe uma recusa.
 */
function semEsperar(p: Promise<void>, aoFalhar: (e: unknown) => void) {
  p.catch(aoFalhar);
}

export interface NovoServico {
  femeaId: string;
  tipo: TipoServico;
  dataServico: string;
  reprodutor?: string | null;
  observacao?: string | null;
}

/** Cobertura ou inseminação (ADMIN ou OPERADOR, também offline). */
export function registrarServico(
  db: Firestore,
  pid: string,
  uid: string,
  s: NovoServico,
  hoje: string,
  aoFalhar: (e: unknown) => void,
): string {
  const registro: RegistroReproducao = {
    femeaId: s.femeaId,
    tipo: s.tipo,
    dataServico: s.dataServico,
    reprodutor: opcional(s.reprodutor),
    observacao: opcional(s.observacao),
    diagnostico: null,
    dataDiagnostico: null,
    dataParto: null,
    bezerroId: null,
  };
  conferirReproducao(registro, hoje);
  const id = crypto.randomUUID();
  semEsperar(setDoc(doc(db, caminhos.reproducao(pid, id)), { ...registro, criadoPor: uid, criadoEm: serverTimestamp() }), aoFalhar);
  return id;
}

/** Diagnóstico de prenhez (toque ou ultrassom). Pode ser refeito para corrigir. */
export function registrarDiagnostico(
  db: Firestore,
  pid: string,
  uid: string,
  atual: RegistroReproducao & { id: string },
  diagnostico: Diagnostico,
  dataDiagnostico: string,
  hoje: string,
  aoFalhar: (e: unknown) => void,
) {
  if (atual.dataParto) throw new ErroOperacao("REPRODUCAO_INVALIDA", "O parto já foi registrado.");
  conferirReproducao({ ...atual, diagnostico, dataDiagnostico }, hoje);
  semEsperar(
    updateDoc(doc(db, caminhos.reproducao(pid, atual.id)), { diagnostico, dataDiagnostico, atualizadoPor: uid, atualizadoEm: serverTimestamp() }),
    aoFalhar,
  );
}

/** Parto sem cadastrar bezerro (natimorto, ou bezerro cadastrado depois). */
export function registrarPartoSemBezerro(
  db: Firestore,
  pid: string,
  uid: string,
  atual: RegistroReproducao & { id: string },
  dataParto: string,
  hoje: string,
  observacao: string | null,
  aoFalhar: (e: unknown) => void,
) {
  const obs = opcional(observacao) ?? atual.observacao;
  if (obs && obs.length > 500) throw new ErroOperacao("REPRODUCAO_INVALIDA", "Observação muito longa (até 500 letras).");
  semEsperar(updateDoc(doc(db, caminhos.reproducao(pid, atual.id)), { ...camposParto(atual, dataParto, hoje, uid), observacao: obs }), aoFalhar);
}

/** Apaga um lançamento errado (ADMIN), desde que não tenha bezerro ligado. */
export async function excluirReproducao(db: Firestore, pid: string, id: string) {
  await deleteDoc(doc(db, caminhos.reproducao(pid, id)));
}
