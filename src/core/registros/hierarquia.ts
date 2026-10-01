/**
 * CADASTROS NA HIERARQUIA — a tela ⇄ a linha do banco, ida e volta no MESMO
 * arquivo, e as regras que o banco cobra, repetidas aqui para a demonstração e
 * para o botão explicar ANTES do clique.
 *
 * ⚠️ **A morada de cada cadastro é a TABELA** (migration `20260930180000`):
 * contas bancárias em `financial_accounts`, centros em `cost_centers`, projetos
 * em `projects`, plano de contas em `categories`. Antes elas moravam em
 * `org_state`/`localStorage` com id NUMÉRICO próprio, e os lançamentos apontam
 * para UUID — as duas moradas só se encontravam pelo nome, ou não se
 * encontravam. A tela de contas dizia "Nenhuma conta cadastrada" numa empresa
 * com quatro, e um projeto escolhido num lançamento era recusado em produção.
 *
 * ⚠️ **Quem AUTORIZA é o banco.** As funções `problema…` abaixo repetem a MESMA
 * regra dos gatilhos, com a MESMA frase, por dois motivos só: a demonstração
 * não tem banco (e tem de recusar igual), e a tela pode explicar antes do
 * clique o que o banco recusaria depois dele. Elas nunca liberam o que o banco
 * recusaria — se divergirem, o banco vence e a mensagem dele vai para a tela.
 *
 * Versão `cadastros-hierarquia/1.0.0`. Puro, tipado, sem I/O.
 */
import {
  diaValido, linhaDREvalida, normalizar,
  type ContaBancaria, type TipoConta, type CategoriaPlano, type Natureza,
} from "./index";

export const CADASTROS_HIERARQUIA_VERSION = "cadastros-hierarquia/1.0.0";

/* ================================== bancos ================================== */

/**
 * O banco da conta mora em `financial_accounts.bank` como CHAVE (`itau`,
 * `bradesco`…), a mesma que o onboarding grava e que a tesouraria traduz — não
 * como o nome exibido. O cadastro antigo guardava o nome ("Itaú"), e a chave é
 * o que faz a mesma conta ter a mesma cor e o mesmo rótulo em toda tela.
 */
export const BANCOS_CONTA: { id: string; label: string }[] = [
  { id: "itau", label: "Itaú" },
  { id: "bradesco", label: "Bradesco" },
  { id: "bb", label: "Banco do Brasil" },
  { id: "santander", label: "Santander" },
  { id: "caixa", label: "Caixa Econômica" },
  { id: "nubank", label: "Nubank" },
  { id: "inter", label: "Inter" },
  { id: "c6", label: "C6 Bank" },
  { id: "btg", label: "BTG Pactual" },
  { id: "sicoob", label: "Sicoob" },
  { id: "sicredi", label: "Sicredi" },
  { id: "safra", label: "Safra" },
  { id: "banrisul", label: "Banrisul" },
  { id: "pagbank", label: "PagBank" },
  { id: "mercadopago", label: "Mercado Pago" },
  { id: "stone", label: "Stone" },
  { id: "outro", label: "Outro" },
];

/** "Itaú" → `itau`; uma chave que já é chave volta igual. */
export function slugDoBanco(nome: string): string {
  const n = normalizar(nome).trim();
  if (!n) return "";
  const porChave = BANCOS_CONTA.find((b) => b.id === n);
  if (porChave) return porChave.id;
  const porNome = BANCOS_CONTA.find((b) => normalizar(b.label) === n);
  if (porNome) return porNome.id;
  if (n.includes("itau")) return "itau";
  if (n.includes("bradesco")) return "bradesco";
  if (n.includes("santander")) return "santander";
  if (n.includes("nubank")) return "nubank";
  if (n.includes("inter")) return "inter";
  if (n.includes("brasil")) return "bb";
  if (n.includes("caixa")) return "caixa";
  return n.replace(/[^a-z0-9]/g, "").slice(0, 16) || "outro";
}

export const rotuloDoBanco = (chave: string): string =>
  BANCOS_CONTA.find((b) => b.id === chave)?.label
  ?? (chave ? chave.charAt(0).toUpperCase() + chave.slice(1) : "—");

/* ============================ linhas do banco ============================ */

const texto = (v: string | null | undefined): string => (v ?? "").trim();
const ouNulo = (v: string | null | undefined): string | null => {
  const t = texto(v);
  return t ? t : null;
};
const TIPOS: TipoConta[] = ["corrente", "poupanca", "investimento", "cartao", "outro"];

/** Uma linha de `financial_accounts` como o PostgREST a devolve. */
export interface LinhaConta {
  id?: string;
  name: string;
  bank: string;
  balance?: number | null;
  tipo?: string | null;
  agencia?: string | null;
  numero?: string | null;
  codigo_contabil?: string | null;
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
  saldo_inicial?: number | null;
  data_saldo_inicial?: string | null;
  saldo_inicial_conferido?: boolean | null;
  ativo?: boolean | null;
}

export function contaDaLinha(l: LinhaConta): ContaBancaria {
  const tipo = (TIPOS as string[]).includes(l.tipo ?? "") ? (l.tipo as TipoConta) : "corrente";
  return {
    id: l.id ?? "",
    nome: l.name ?? "",
    banco: l.bank ?? "",
    tipo,
    agencia: texto(l.agencia),
    numero: texto(l.numero),
    dataSaldoInicial: texto(l.data_saldo_inicial),
    saldoInicial: Number(l.saldo_inicial ?? 0),
    saldoInicialConferido: l.saldo_inicial_conferido === true,
    codigoContabil: texto(l.codigo_contabil),
    diaFechamento: l.dia_fechamento ?? null,
    diaVencimento: l.dia_vencimento ?? null,
    ativo: l.ativo !== false,
    saldoAtual: Number(l.balance ?? 0),
  };
}

/**
 * A conta como vai para o banco. ⚠️ SEM `balance`: o saldo corrente é da
 * conciliação e das baixas, não do cadastro — editar a agência não pode mexer
 * no dinheiro. Só a CRIAÇÃO parte do saldo de abertura (ver `lib`).
 * Os dias da fatura só vão quando o tipo é cartão: guardados numa conta
 * corrente, eles seriam um dado que ninguém vê e que o banco teria de validar.
 */
export function linhaDaConta(c: ContaBancaria): Omit<LinhaConta, "id" | "balance"> {
  const cartao = c.tipo === "cartao";
  return {
    name: c.nome.trim(),
    bank: slugDoBanco(c.banco),
    tipo: c.tipo,
    agencia: ouNulo(c.agencia),
    numero: ouNulo(c.numero),
    codigo_contabil: ouNulo(c.codigoContabil),
    dia_fechamento: cartao ? c.diaFechamento : null,
    dia_vencimento: cartao ? c.diaVencimento : null,
    saldo_inicial: Number.isFinite(c.saldoInicial) ? c.saldoInicial : null,
    data_saldo_inicial: ouNulo(c.dataSaldoInicial),
    saldo_inicial_conferido: !!c.saldoInicialConferido,
    ativo: c.ativo,
  };
}

/* -------------------------------- categorias -------------------------------- */

export interface CategoriaCadastro extends CategoriaPlano {
  ativo: boolean;
}

export interface LinhaCategoria {
  id?: string;
  kind: Natureza;
  name: string;
  parent_id?: string | null;
  code?: string | null;
  dre_linha?: string | null;
  active?: boolean | null;
}

export const categoriaDaLinha = (l: LinhaCategoria): CategoriaCadastro => ({
  id: l.id ?? "",
  nome: l.name ?? "",
  codigo: texto(l.code),
  natureza: l.kind,
  paiId: l.parent_id ?? null,
  dreLinha: texto(l.dre_linha) || undefined,
  ativo: l.active !== false,
});

export const linhaDaCategoria = (c: CategoriaCadastro): Omit<LinhaCategoria, "id"> => ({
  kind: c.natureza,
  name: c.nome.trim(),
  parent_id: c.paiId || null,
  code: ouNulo(c.codigo),
  dre_linha: ouNulo(c.dreLinha),
  active: c.ativo,
});

/* ------------------------------ centros de custo ------------------------------ */

export interface CentroCustoCadastro {
  id: string;
  nome: string;
  codigo: string;
  /** Código no sistema contábil (Domínio) — sai nas colunas CC do TXT. */
  codigoContabil: string;
  descricao: string;
  ativo: boolean;
  /** O centro-grupo (sintético) a que este pertence; null = raiz. */
  paiId: string | null;
}

export interface LinhaCentro {
  id?: string;
  name: string;
  active?: boolean | null;
  code?: string | null;
  codigo_contabil?: string | null;
  parent_id?: string | null;
  description?: string | null;
}

export const centroDaLinha = (l: LinhaCentro): CentroCustoCadastro => ({
  id: l.id ?? "",
  nome: l.name ?? "",
  codigo: texto(l.code),
  codigoContabil: texto(l.codigo_contabil),
  descricao: texto(l.description),
  ativo: l.active !== false,
  paiId: l.parent_id ?? null,
});

export const linhaDoCentro = (c: CentroCustoCadastro): Omit<LinhaCentro, "id"> => ({
  name: c.nome.trim(),
  active: c.ativo,
  code: ouNulo(c.codigo),
  codigo_contabil: ouNulo(c.codigoContabil),
  parent_id: c.paiId || null,
  description: ouNulo(c.descricao),
});

/* --------------------------------- projetos --------------------------------- */

export type StatusProjeto = "ativo" | "encerrado";

export interface ProjetoCadastro {
  id: string;
  nome: string;
  codigo: string;
  descricao: string;
  dataInicial: string;
  dataFinal: string;
  previsaoReceita: number;
  previsaoDespesa: number;
  /** O cliente do projeto (`parties`). */
  clienteId: string | null;
  /** O centro responsável (`cost_centers`). */
  centroId: string | null;
  /**
   * ⚠️ A situação é DECLARADA, não deduzida da data final. Um projeto cuja data
   * passou pode ainda receber a última nota; um que foi cancelado antes do fim
   * não pode receber mais nada. Encerrado recusa lançamento NOVO no banco.
   */
  status: StatusProjeto;
}

export interface LinhaProjeto {
  id?: string;
  name: string;
  code?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  planned_revenue?: number | null;
  planned_expense?: number | null;
  party_id?: string | null;
  cost_center_id?: string | null;
  status?: string | null;
}

export const projetoDaLinha = (l: LinhaProjeto): ProjetoCadastro => ({
  id: l.id ?? "",
  nome: l.name ?? "",
  codigo: texto(l.code),
  descricao: texto(l.description),
  dataInicial: texto(l.start_date),
  dataFinal: texto(l.end_date),
  previsaoReceita: Number(l.planned_revenue ?? 0),
  previsaoDespesa: Number(l.planned_expense ?? 0),
  clienteId: l.party_id ?? null,
  centroId: l.cost_center_id ?? null,
  status: l.status === "encerrado" ? "encerrado" : "ativo",
});

export const linhaDoProjeto = (p: ProjetoCadastro): Omit<LinhaProjeto, "id"> => ({
  name: p.nome.trim(),
  code: ouNulo(p.codigo),
  description: ouNulo(p.descricao),
  start_date: ouNulo(p.dataInicial),
  end_date: ouNulo(p.dataFinal),
  planned_revenue: Number(p.previsaoReceita) || 0,
  planned_expense: Number(p.previsaoDespesa) || 0,
  party_id: p.clienteId || null,
  cost_center_id: p.centroId || null,
  status: p.status,
});

/* ================================== árvore ================================== */

interface NoArvore { id: string; paiId: string | null }

/** Os ids que têm ao menos um filho — os GRUPOS. */
export function idsComFilhos(itens: readonly NoArvore[]): Set<string> {
  const s = new Set<string>();
  for (const i of itens) if (i.paiId) s.add(i.paiId);
  return s;
}

/**
 * As categorias que um lançamento pode receber: ATIVAS e FOLHAS (sem filho
 * vivo), da natureza pedida. É o mesmo critério do gatilho
 * `lancamento_em_categoria_folha` — um formulário que oferecesse um grupo
 * ofereceria uma escolha que o banco recusa.
 */
export function categoriasSelecionaveis<T extends CategoriaCadastro>(
  cats: readonly T[], natureza?: Natureza,
): T[] {
  const grupos = idsComFilhos(cats);
  return cats.filter((c) => c.ativo && !grupos.has(c.id) && (!natureza || c.natureza === natureza));
}

/** "Marketing › Google Ads" — o nome que diz de que grupo a folha veio. */
export function caminhoDe(itens: readonly (NoArvore & { nome: string })[], id: string): string {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const partes: string[] = [];
  let atual = porId.get(id);
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    partes.unshift(atual.nome);
    atual = atual.paiId ? porId.get(atual.paiId) : undefined;
  }
  return partes.join(" › ");
}

/**
 * A árvore na ordem de exibição (pai, depois os filhos), com o nível de
 * indentação. Um item cujo pai não está na lista sobe para a raiz — um grupo
 * inativo filtrado não pode esconder as filhas dele.
 */
export function achatarArvore<T extends NoArvore>(itens: readonly T[]): { item: T; nivel: number }[] {
  const ids = new Set(itens.map((i) => i.id));
  const porPai = new Map<string | null, T[]>();
  for (const i of itens) {
    const k = i.paiId && ids.has(i.paiId) ? i.paiId : null;
    porPai.set(k, [...(porPai.get(k) ?? []), i]);
  }
  const out: { item: T; nivel: number }[] = [];
  const vistos = new Set<string>();
  const desce = (pai: string | null, nivel: number) => {
    for (const i of porPai.get(pai) ?? []) {
      if (vistos.has(i.id)) continue;
      vistos.add(i.id);
      out.push({ item: i, nivel });
      desce(i.id, nivel + 1);
    }
  };
  desce(null, 0);
  // Ciclo (dado antigo corrompido): o que sobrou entra no fim, na raiz.
  for (const i of itens) if (!vistos.has(i.id)) out.push({ item: i, nivel: 0 });
  return out;
}

/** Pendurar `id` em `novoPai` fecharia um ciclo? (o pai é ele ou um descendente dele) */
export function fechaCiclo(itens: readonly NoArvore[], id: string, novoPai: string | null): boolean {
  if (!novoPai || !id) return false;
  const porId = new Map(itens.map((i) => [i.id, i]));
  let atual: string | null = novoPai;
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual)) {
    if (atual === id) return true;
    vistos.add(atual);
    atual = porId.get(atual)?.paiId ?? null;
  }
  return false;
}

const mesmoNome = (a: string, b: string) => normalizar(a).trim() === normalizar(b).trim();

/* =============================== validações =============================== */

/**
 * Erros por campo da CATEGORIA (vazio = válido). Repete o que o banco cobra —
 * nome único no mesmo grupo, código único na empresa, natureza do grupo, ciclo
 * — e acrescenta o que só a tela sabe: a linha do DRE tem de existir para a
 * natureza (uma linha de total contaria o valor duas vezes).
 */
export function validarCategoria(c: CategoriaCadastro, todas: readonly CategoriaCadastro[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.nome.trim()) e.nome = "Informe o nome da categoria.";
  const pai = c.paiId ? todas.find((x) => x.id === c.paiId) : undefined;
  if (c.paiId && !pai) e.paiId = "O grupo escolhido não existe no plano de contas desta empresa.";
  if (pai && pai.natureza !== c.natureza) {
    e.natureza = `A categoria é de ${c.natureza} e o grupo "${pai.nome}" é de ${pai.natureza}.`;
  }
  if (c.id && fechaCiclo(todas, c.id, c.paiId)) e.paiId = "Pôr a categoria neste grupo fecharia um ciclo no plano de contas.";
  if (c.nome.trim() && todas.some((x) => x.id !== c.id && (x.paiId ?? null) === (c.paiId ?? null) && mesmoNome(x.nome, c.nome))) {
    e.nome = `Já existe "${c.nome.trim()}" ${c.paiId ? "neste grupo" : "na raiz do plano"}.`;
  }
  if (c.codigo.trim() && todas.some((x) => x.id !== c.id && x.codigo.trim() && mesmoNome(x.codigo, c.codigo))) {
    e.codigo = `O código ${c.codigo.trim()} já é de outra categoria.`;
  }
  if (c.dreLinha && !linhaDREvalida(c.dreLinha, c.natureza)) {
    e.dreLinha = `A linha escolhida não existe no DRE para uma categoria de ${c.natureza}.`;
  }
  return e;
}

export function validarCentro(c: CentroCustoCadastro, todos: readonly CentroCustoCadastro[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.nome.trim()) e.nome = "Informe o nome.";
  if (c.paiId && !todos.some((x) => x.id === c.paiId)) e.paiId = "O centro escolhido como grupo não existe nesta empresa.";
  if (c.id && c.paiId === c.id) e.paiId = "Um centro não pode ser o grupo de si mesmo.";
  else if (c.id && fechaCiclo(todos, c.id, c.paiId)) e.paiId = "Pôr o centro neste grupo fecharia um ciclo na árvore de centros.";
  if (c.codigo.trim() && todos.some((x) => x.id !== c.id && x.codigo.trim() && mesmoNome(x.codigo, c.codigo))) {
    e.codigo = `O código ${c.codigo.trim()} já é de outro centro.`;
  }
  return e;
}

export function validarProjeto(p: ProjetoCadastro, todos: readonly ProjetoCadastro[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!p.nome.trim()) e.nome = "Informe o nome do projeto.";
  else if (todos.some((x) => x.id !== p.id && mesmoNome(x.nome, p.nome))) e.nome = `Já existe um projeto "${p.nome.trim()}".`;
  if (p.dataInicial && p.dataFinal && p.dataFinal < p.dataInicial) e.periodo = "A data final é anterior à inicial.";
  return e;
}

/** A regra de nome único da CONTA (o índice `financial_accounts_org_nome_unico`). */
export function contaComNomeRepetido(c: ContaBancaria, todas: readonly ContaBancaria[]): boolean {
  return todas.some((x) => x.id !== c.id && mesmoNome(x.nome, c.nome));
}

/* ====================== as regras do banco, com a frase dele ====================== */

/**
 * `categoria_hierarquia`: uma categoria com lançamento NÃO vira grupo.
 * Mesma frase do gatilho.
 */
export function problemaDoGrupo(pai: CategoriaCadastro, lancamentosDoPai: number): string | null {
  return lancamentosDoPai > 0
    ? `A categoria "${pai.nome}" já tem ${lancamentosDoPai} lançamento(s) e não pode virar grupo.`
    : null;
}

/** `categoria_exclusao`: com lançamento não vai à lixeira; grupo com filha viva também não. */
export function problemaDaExclusao(
  cat: CategoriaCadastro, todas: readonly CategoriaCadastro[], lancamentos: number,
): string | null {
  if (lancamentos > 0) return `A categoria "${cat.nome}" tem ${lancamentos} lançamento(s) e não pode ir para a lixeira.`;
  const filhas = todas.filter((x) => x.paiId === cat.id).length;
  if (filhas > 0) return `O grupo "${cat.nome}" ainda tem ${filhas} subcategoria(s) viva(s).`;
  return null;
}

/**
 * A ordem em que um grupo e as suas subcategorias vão para a lixeira: das
 * folhas para a raiz — o banco recusa o grupo enquanto houver filha viva.
 */
export function ordemDeExclusao(todas: readonly CategoriaCadastro[], id: string): string[] {
  const out: string[] = [];
  const desce = (x: string) => {
    for (const f of todas.filter((c) => c.paiId === x)) desce(f.id);
    out.push(x);
  };
  desce(id);
  return out;
}

/** Validação do cartão, reaproveitada: a tela e a demonstração usam a MESMA. */
export const diasDoCartaoValidos = (c: ContaBancaria): boolean =>
  c.tipo !== "cartao" || (diaValido(c.diaFechamento) && diaValido(c.diaVencimento));

/* ================================ os antigos ================================ */

/**
 * O que existe no cadastro ANTIGO deste navegador (org_state / localStorage) e
 * ainda não está na tabela.
 *
 * ⚠️ **Nada migra em silêncio.** A tela lista estas pendências com o botão
 * "Trazer para o cadastro", e a pessoa decide. Migrar sozinho criaria contas,
 * centros e categorias que ninguém pediu no dia em que duas pessoas abrissem a
 * tela em navegadores diferentes — e uma conta criada por engano recebe
 * lançamento no dia seguinte.
 *
 * `criar` = não há nada com o nome; `completar` = há, mas o antigo guarda um
 * dado que o novo não tem (código contábil, dias da fatura, linha do DRE…) — e
 * perder esse dado ao trocar de morada seria a pior forma de trocar de morada.
 */
export interface PendenciaAntiga {
  chave: string;
  acao: "criar" | "completar";
  nome: string;
  /** O que vai ser trazido, em português. */
  campos: string[];
  /** Na ação `completar`: o id do registro que já existe na tabela. */
  alvoId?: string;
}

const vazio = (s: string | null | undefined) => !texto(s);

export function contasAntigas(antigas: readonly ContaBancaria[], atuais: readonly ContaBancaria[]): PendenciaAntiga[] {
  const out: PendenciaAntiga[] = [];
  for (const a of antigas) {
    if (!texto(a.nome)) continue;
    const atual = atuais.find((x) => mesmoNome(x.nome, a.nome));
    if (!atual) {
      out.push({ chave: `conta:${a.id}`, acao: "criar", nome: a.nome, campos: ["a conta inteira"] });
      continue;
    }
    const campos: string[] = [];
    if (a.tipo !== "corrente" && atual.tipo === "corrente") campos.push("tipo");
    if (!vazio(a.agencia) && vazio(atual.agencia)) campos.push("agência");
    if (!vazio(a.numero) && vazio(atual.numero)) campos.push("número");
    if (!vazio(a.codigoContabil) && vazio(atual.codigoContabil)) campos.push("código contábil");
    if (a.tipo === "cartao" && (atual.diaFechamento == null || atual.diaVencimento == null)) campos.push("dias da fatura");
    if (a.saldoInicialConferido && !atual.saldoInicialConferido) campos.push("saldo de abertura conferido");
    if (campos.length) out.push({ chave: `conta:${a.id}`, acao: "completar", nome: a.nome, campos, alvoId: atual.id });
  }
  return out;
}

/** O antigo completa o atual SEM sobrescrever o que o atual já tem. */
export function contaCompletada(atual: ContaBancaria, antiga: ContaBancaria): ContaBancaria {
  const tipo = atual.tipo === "corrente" && antiga.tipo !== "corrente" ? antiga.tipo : atual.tipo;
  const conferido = atual.saldoInicialConferido || !!antiga.saldoInicialConferido;
  return {
    ...atual,
    tipo,
    agencia: atual.agencia || antiga.agencia,
    numero: atual.numero || antiga.numero,
    codigoContabil: atual.codigoContabil || antiga.codigoContabil,
    diaFechamento: tipo === "cartao" ? (atual.diaFechamento ?? antiga.diaFechamento) : atual.diaFechamento,
    diaVencimento: tipo === "cartao" ? (atual.diaVencimento ?? antiga.diaVencimento) : atual.diaVencimento,
    saldoInicialConferido: conferido,
    saldoInicial: atual.saldoInicialConferido ? atual.saldoInicial : (antiga.saldoInicialConferido ? antiga.saldoInicial : atual.saldoInicial),
    dataSaldoInicial: atual.saldoInicialConferido ? atual.dataSaldoInicial : (antiga.saldoInicialConferido ? antiga.dataSaldoInicial : atual.dataSaldoInicial),
  };
}

export function centrosAntigos(antigos: readonly Omit<CentroCustoCadastro, "paiId">[], atuais: readonly CentroCustoCadastro[]): PendenciaAntiga[] {
  const out: PendenciaAntiga[] = [];
  for (const a of antigos) {
    if (!texto(a.nome)) continue;
    const atual = atuais.find((x) => mesmoNome(x.nome, a.nome));
    if (!atual) { out.push({ chave: `centro:${a.id}`, acao: "criar", nome: a.nome, campos: ["o centro inteiro"] }); continue; }
    const campos: string[] = [];
    if (!vazio(a.codigo) && vazio(atual.codigo)) campos.push("código");
    if (!vazio(a.codigoContabil) && vazio(atual.codigoContabil)) campos.push("código contábil");
    if (!vazio(a.descricao) && vazio(atual.descricao)) campos.push("descrição");
    if (campos.length) out.push({ chave: `centro:${a.id}`, acao: "completar", nome: a.nome, campos, alvoId: atual.id });
  }
  return out;
}

export function projetosAntigos(
  antigos: readonly { id: string; nome: string; codigo: string; descricao: string; dataInicial: string; dataFinal: string; previsaoReceita: number; previsaoDespesa: number }[],
  atuais: readonly ProjetoCadastro[],
): PendenciaAntiga[] {
  const out: PendenciaAntiga[] = [];
  for (const a of antigos) {
    if (!texto(a.nome)) continue;
    const atual = atuais.find((x) => mesmoNome(x.nome, a.nome));
    if (!atual) { out.push({ chave: `projeto:${a.id}`, acao: "criar", nome: a.nome, campos: ["o projeto inteiro"] }); continue; }
    const campos: string[] = [];
    if (!vazio(a.codigo) && vazio(atual.codigo)) campos.push("código");
    if (!vazio(a.dataInicial) && vazio(atual.dataInicial)) campos.push("data inicial");
    if (!vazio(a.dataFinal) && vazio(atual.dataFinal)) campos.push("data final");
    if (a.previsaoReceita && !atual.previsaoReceita) campos.push("receita prevista");
    if (a.previsaoDespesa && !atual.previsaoDespesa) campos.push("despesa prevista");
    if (campos.length) out.push({ chave: `projeto:${a.id}`, acao: "completar", nome: a.nome, campos, alvoId: atual.id });
  }
  return out;
}

/**
 * Categorias do plano ANTIGO. O casamento é por NOME e NATUREZA em qualquer
 * nível — o id antigo não existe na tabela, e é exatamente por isso que as
 * duas moradas nunca se encontravam.
 */
export function categoriasAntigas(antigas: readonly CategoriaPlano[], atuais: readonly CategoriaCadastro[]): PendenciaAntiga[] {
  const out: PendenciaAntiga[] = [];
  for (const a of antigas) {
    if (!texto(a.nome)) continue;
    const atual = atuais.find((x) => x.natureza === a.natureza && mesmoNome(x.nome, a.nome));
    if (!atual) {
      const pai = a.paiId ? antigas.find((x) => x.id === a.paiId) : undefined;
      out.push({
        chave: `categoria:${a.id}`, acao: "criar", nome: pai ? `${pai.nome} › ${a.nome}` : a.nome,
        campos: [pai ? `a categoria (e o grupo "${pai.nome}", se faltar)` : "a categoria"],
      });
      continue;
    }
    const campos: string[] = [];
    if (!vazio(a.codigo) && vazio(atual.codigo)) campos.push("código");
    if (a.dreLinha && !atual.dreLinha) campos.push("linha do DRE");
    if (campos.length) out.push({ chave: `categoria:${a.id}`, acao: "completar", nome: a.nome, campos, alvoId: atual.id });
  }
  return out;
}

/* ============================ as ESCOLHAS do lançamento ============================ */

/**
 * ⚠️ **O QUE UM FORMULÁRIO DE LANÇAMENTO PODE OFERECER** — um critério só, para
 * todos os formulários (título, receita/despesa, venda, compra, contrato,
 * orçamento, impostos). Cada formulário filtrava do seu jeito: um mostrava só
 * subcategorias, outro só raízes, outro tudo — e nenhum perguntava ao banco.
 *
 * Contas: só as ATIVAS (o banco recusa lançamento novo em conta inativa).
 * Centros: ativos e ANALÍTICOS (sem filho vivo) — o grupo sintético é soma.
 * Projetos: só os de situação "ativo" (encerrado recusa lançamento novo).
 */
export interface OpcaoCadastro { value: string; label: string }

export const contasSelecionaveis = (contas: readonly ContaBancaria[]): OpcaoCadastro[] =>
  contas.filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }));

export function centrosSelecionaveis(centros: readonly CentroCustoCadastro[]): OpcaoCadastro[] {
  const vivos = centros.filter((c) => c.ativo);
  const grupos = idsComFilhos(vivos);
  return vivos
    .filter((c) => !grupos.has(c.id))
    .map((c) => ({ value: c.id, label: caminhoDe(centros, c.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export const projetosSelecionaveis = (projetos: readonly ProjetoCadastro[]): OpcaoCadastro[] =>
  projetos.filter((p) => p.status === "ativo").map((p) => ({ value: p.id, label: p.nome }));

/**
 * As categorias de um LADO do lançamento, com o caminho como rótulo.
 * ⚠️ A natureza vem do LADO, não da escolha da pessoa: entrada → receita,
 * saída → despesa. Uma lista misturada é o atalho para lançar a venda numa
 * categoria de despesa.
 */
export function categoriasDoLado(
  cats: readonly CategoriaCadastro[], lado: "entrada" | "saida",
): OpcaoCadastro[] {
  const natureza: Natureza = lado === "entrada" ? "receita" : "despesa";
  return categoriasSelecionaveis(cats, natureza)
    .map((c) => ({ value: c.id, label: caminhoDe(cats, c.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * A categoria padrão do contato só preenche o formulário quando ela continua
 * SELECIONÁVEL para aquele lado: uma categoria que virou grupo, foi desativada
 * ou é da natureza do outro lado seria uma escolha que o banco recusa.
 */
export function categoriaPadraoValida(
  padrao: string | null | undefined, opcoes: readonly OpcaoCadastro[],
): string {
  return padrao && opcoes.some((o) => o.value === padrao) ? padrao : "";
}

/* ==================================== rateio ==================================== */

/** Uma linha do rateio na tela (projeto OU centro) — mesmo formato de `core/registros`. */
export interface LinhaRateioLanc { id: string; percentual: number }

/** Uma linha de `movement_splits`. */
export interface LinhaSplit {
  project_id: string | null;
  cost_center_id: string | null;
  category_id: string | null;
  percent: number;
  amount: number;
}

const preenchidasRateio = (l: readonly LinhaRateioLanc[]) => l.filter((x) => x.id && Number(x.percentual) > 0);

/** O projeto/centro PRINCIPAL — o de maior fatia (o primeiro, no empate). */
export function principalDoRateio(linhas: readonly LinhaRateioLanc[]): string | null {
  const p = preenchidasRateio(linhas);
  if (p.length === 0) return linhas.find((x) => x.id)?.id ?? null;
  return p.reduce((m, x) => (Number(x.percentual) > Number(m.percentual) ? x : m)).id;
}

/**
 * ⚠️ **O RATEIO VIRA LINHA DE `movement_splits`, não promessa de tela.** Antes
 * ele era validado em 100% e DESCARTADO: só o primeiro projeto/centro chegava
 * ao lançamento (`splits: null`), e quem dividiu 60/40 via um relatório 100/0.
 *
 * Projeto e centro são DUAS dimensões independentes, e cada uma fecha 100%.
 * Gravá-las como linhas separadas faria a soma dos percentuais dar 200%; por
 * isso a linha é o CRUZAMENTO (projeto × centro), com percentual = produto das
 * fatias — o total continua 100% e cada dimensão, somada sozinha, devolve a
 * fatia que a pessoa digitou.
 *
 * O VALOR é rateado em CENTAVOS inteiros e o resto vai para a ÚLTIMA linha:
 * 100 ÷ 3 em ponto flutuante perde um centavo, e o rateio nasceria somando
 * menos que o título.
 *
 * Sem rateio de verdade (zero ou uma linha em cada dimensão) não há linha a
 * gravar: o projeto e o centro principais já estão no próprio lançamento.
 */
export function linhasDoRateio(
  projetos: readonly LinhaRateioLanc[], centros: readonly LinhaRateioLanc[],
  valor: number, categoriaId: string | null = null,
): LinhaSplit[] {
  const ps = preenchidasRateio(projetos);
  const cs = preenchidasRateio(centros);
  if (ps.length <= 1 && cs.length <= 1) return [];
  const eixoP = ps.length ? ps : [{ id: "", percentual: 100 }];
  const eixoC = cs.length ? cs : [{ id: "", percentual: 100 }];
  const cruz = eixoP.flatMap((p) => eixoC.map((c) => ({
    project_id: p.id || null,
    cost_center_id: c.id || null,
    fracao: (Number(p.percentual) / 100) * (Number(c.percentual) / 100),
  })));
  const totalCent = Math.round(valor * 100);
  let usado = 0;
  return cruz.map((x, i) => {
    const ultimo = i === cruz.length - 1;
    const cent = ultimo ? totalCent - usado : Math.round(totalCent * x.fracao);
    usado += cent;
    return {
      project_id: x.project_id,
      cost_center_id: x.cost_center_id,
      category_id: categoriaId,
      percent: Math.round(x.fracao * 10000) / 100,
      amount: cent / 100,
    };
  });
}

/** O rateio de volta, POR DIMENSÃO — o que a ficha do lançamento mostra. */
export function fatiasDoRateio(
  splits: readonly { project_id?: string | null; cost_center_id?: string | null; percent?: number | null }[],
  dimensao: "project_id" | "cost_center_id",
): { id: string; percentual: number }[] {
  const m = new Map<string, number>();
  for (const s of splits) {
    const id = s[dimensao];
    if (!id) continue;
    m.set(id, Math.round(((m.get(id) ?? 0) + Number(s.percent ?? 0)) * 100) / 100);
  }
  return Array.from(m, ([id, percentual]) => ({ id, percentual }));
}
