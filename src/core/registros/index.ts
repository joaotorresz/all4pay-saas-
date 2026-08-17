/**
 * CADASTROS — as regras que as telas de registro compartilham (puro, tipado).
 *
 * As telas de cadastro parecem "só formulário", mas carregam três decisões que
 * não podem morar num componente: o que torna um registro VÁLIDO (o cartão de
 * crédito exige dias de fatura, o rateio tem de fechar 100%), como a BUSCA
 * combina com os filtros, e como um contrato de cliente vira a agenda de vendas
 * mês a mês. Tudo isso é testável aqui e reaproveitado por todas as telas.
 *
 * Versão registros/1.0.0.
 */
import { ESTRUTURA_DRE } from "@/core/relatorios";

export const REGISTROS_VERSION = "registros/1.0.0";

/* ============================== conta bancária ============================== */

export type TipoConta = "corrente" | "poupanca" | "investimento" | "cartao" | "outro";

export const TIPOS_CONTA: { id: TipoConta; label: string }[] = [
  { id: "corrente", label: "Conta corrente" },
  { id: "poupanca", label: "Poupança" },
  { id: "investimento", label: "Investimento" },
  { id: "cartao", label: "Cartão de crédito" },
  { id: "outro", label: "Outro" },
];

export interface ContaBancaria {
  id: string;
  nome: string;
  banco: string;
  tipo: TipoConta;
  agencia: string;
  numero: string;
  dataSaldoInicial: string;
  saldoInicial: number;
  /**
   * ⚠️ **A CONFIRMAÇÃO EXPLÍCITA de que `saldoInicial`/`dataSaldoInicial` são um
   * saldo de abertura REAL** — não o preenchimento padrão do formulário (que
   * nasce `0` na data de hoje). Só quando `true` a conta vira a fonte
   * "informada" da abertura conferida (ver `core/indicadores/abertura`). Sem
   * isso, um `0` de fábrica fingiria uma abertura que ninguém declarou, e o
   * Razão diria "conferido" sobre uma conta que ninguém fechou.
   */
  saldoInicialConferido?: boolean;
  /** Código da conta no Domínio — sai no TXT contábil. */
  codigoContabil: string;
  /** Só para cartão de crédito (1–31). */
  diaFechamento: number | null;
  diaVencimento: number | null;
  ativo: boolean;
}

/** Dia de fatura só existe entre 1 e 31 — 0 ou 32 não é "quase certo", é erro. */
export const diaValido = (d: unknown): boolean =>
  typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 31;

/**
 * Devolve os erros por campo (vazio = válido). Erro por CAMPO, não uma
 * mensagem só: o formulário precisa marcar onde está o problema.
 */
export function validarContaBancaria(c: Partial<ContaBancaria>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.nome?.trim()) e.nome = "Informe o nome da conta.";
  if (!c.banco?.trim()) e.banco = "Selecione o banco.";
  if (!c.tipo) e.tipo = "Selecione o tipo de conta.";
  // A regra condicional do cartão: sem os dois dias, a fatura não fecha nem vence.
  if (c.tipo === "cartao") {
    if (!diaValido(c.diaFechamento)) e.diaFechamento = "Informe um dia entre 1 e 31.";
    if (!diaValido(c.diaVencimento)) e.diaVencimento = "Informe um dia entre 1 e 31.";
  }
  return e;
}

/* ================================= rateio ================================= */

export interface LinhaRateio { id: string; percentual: number }

/**
 * O rateio precisa fechar 100%. A tolerância de 0,01 existe porque three-way
 * (33,33 + 33,33 + 33,34) é a divisão legítima mais comum e seria absurdo
 * rejeitá-la; qualquer coisa além disso é o usuário errando a conta.
 *
 * Um rateio VAZIO é válido: significa "não ratear", não "ratear zero".
 */
export function rateioValido(linhas: LinhaRateio[]): boolean {
  const preenchidas = linhas.filter((l) => l.id);
  if (preenchidas.length === 0) return true;
  const soma = preenchidas.reduce((s, l) => s + (Number(l.percentual) || 0), 0);
  // Comparação em CENTÉSIMOS inteiros, não em ponto flutuante: 33,33 × 3 soma
  // 99.99000000000001 e `Math.abs(soma - 100) <= 0.01` dá 0.010000000000005 —
  // rejeitaria o rateio em três partes, que é a divisão mais comum que existe.
  return Math.abs(Math.round(soma * 100) - 10_000) <= 1;
}

export const somaRateio = (linhas: LinhaRateio[]): number =>
  Math.round(linhas.filter((l) => l.id).reduce((s, l) => s + (Number(l.percentual) || 0), 0) * 100) / 100;

/* ================================= filtros ================================= */

export type FiltroStatus = "todos" | "ativos" | "inativos";

/** Sem acento e em minúsculas — "João" acha "joao" e vice-versa. */
export const normalizar = (s: string): string =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Busca livre + status, o par que toda tela de cadastro repete.
 *
 * A busca casa por SUBSTRING em qualquer um dos campos indicados: o operador
 * digita o pedaço que lembra (um trecho do CNPJ, o meio do nome), não o começo.
 */
export function filtrarRegistros<T extends { ativo?: boolean }>(
  itens: T[],
  busca: string,
  campos: (item: T) => (string | number | null | undefined)[],
  status: FiltroStatus = "todos",
): T[] {
  const q = normalizar(busca).trim();
  return itens.filter((i) => {
    if (status === "ativos" && i.ativo === false) return false;
    if (status === "inativos" && i.ativo !== false) return false;
    if (!q) return true;
    return campos(i).some((c) => c != null && normalizar(String(c)).includes(q));
  });
}

/* ============================== plano de contas ============================== */

export type Natureza = "receita" | "despesa";

/** As 18 funções automáticas do "Uso padrão" — cada uma aceita UMA categoria. */
export interface FuncaoPadrao {
  id: string;
  label: string;
  natureza: Natureza;
  ajuda: string;
}

export const USOS_PADRAO: FuncaoPadrao[] = [
  { id: "receita_padrao", label: "Receita padrão", natureza: "receita", ajuda: "Usada em vendas importadas sem categoria informada." },
  { id: "taxa_plataforma", label: "Taxa de plataforma", natureza: "despesa", ajuda: "Abatida automaticamente nas vendas de plataformas externas." },
  { id: "taxa_antecipacao", label: "Taxa de antecipação", natureza: "despesa", ajuda: "Taxa cobrada quando o recebimento é antecipado pela plataforma." },
  { id: "comissao_coprodutor", label: "Comissão de coprodutor", natureza: "despesa", ajuda: "Repasse para coprodução cadastrada." },
  { id: "comissao_afiliado", label: "Comissão de vendedor/afiliado", natureza: "despesa", ajuda: "Repasse para afiliados ou vendedores próprios." },
  { id: "streaming", label: "Streaming", natureza: "despesa", ajuda: "Repasse de streaming / transmissão." },
  { id: "taxa_bancaria", label: "Taxa bancária", natureza: "despesa", ajuda: "Taxas cobradas em recebimento ou repasse." },
  { id: "estorno_receita", label: "Estorno de receita", natureza: "receita", ajuda: "Classificação de estornos em vendas." },
  { id: "estorno_despesa", label: "Estorno de despesa", natureza: "despesa", ajuda: "Classificação de estornos em pagamentos." },
  { id: "chargeback_recebimento", label: "Chargeback (recebimento)", natureza: "receita", ajuda: "Entrada gerada quando o chargeback é revertido." },
  { id: "chargeback_despesa", label: "Chargeback (despesa)", natureza: "despesa", ajuda: "Saída gerada quando a venda é contestada." },
  { id: "reserva_receber", label: "Reserva a Receber", natureza: "receita", ajuda: "Valor retido pela plataforma que ainda vai entrar." },
  { id: "reserva_pagar", label: "Reserva a Pagar", natureza: "despesa", ajuda: "Valor retido a devolver." },
  { id: "recalculo_comissao_receber", label: "Recálculo de Comissão a Receber", natureza: "receita", ajuda: "Ajuste de comissão a favor da empresa." },
  { id: "recalculo_comissao_pagar", label: "Recálculo de Comissão a Pagar", natureza: "despesa", ajuda: "Ajuste de comissão contra a empresa." },
  { id: "saque_plataforma", label: "Saque da Plataforma", natureza: "receita", ajuda: "Transferência do saldo da plataforma para a conta bancária." },
  { id: "bloqueio_judicial", label: "Bloqueio Judicial", natureza: "despesa", ajuda: "Valor bloqueado por ordem judicial." },
  { id: "juros", label: "Juros", natureza: "despesa", ajuda: "Juros e encargos de atraso." },
];

export interface CategoriaPlano {
  id: string;
  nome: string;
  codigo: string;
  natureza: Natureza;
  /** null = raiz (grupo). */
  paiId: string | null;
  /**
   * A LINHA DO DRE em que os lançamentos desta categoria caem.
   *
   * ⚠️ Antes disso, a linha era ADIVINHADA por palavra-chave no nome da
   * categoria (`core/relatorios` e `core/dre/engine`) — "Taxa Plataforma" caía
   * em Despesas Variáveis porque o texto contém "taxa". Funciona enquanto as
   * categorias são as de fábrica e o nome segue o padrão que o regex espera;
   * quebra em silêncio na primeira categoria que a empresa cria com o nome
   * dela ("Ferramentas do time"), que passa a cair na linha genérica sem nada
   * na tela dizendo isso. O resultado fecha — sempre fecha, porque a cascata é
   * aritmética — só que na linha errada, e é a linha que o contador lê.
   *
   * Vazio ⇒ a classificação por palavra-chave continua valendo (é o que
   * mantém funcionando tudo que já existe). Preenchido, ele VENCE: é a resposta
   * de quem cadastrou, e ela ganha de uma heurística sobre o nome.
   */
  dreLinha?: string;
}

/**
 * As linhas do DRE que uma categoria pode escolher — as de SOMA, na natureza
 * dela.
 *
 * ⚠️ **As linhas de TOTAL (`=`) ficam de fora, e isso não é detalhe.**
 *
 * ⚠️ Duas travas independentes as barram (o `tipo === "soma"` e o filtro de
 * sinal), e a guarda só reprova quando as DUAS caem — foi medido plantando cada
 * uma sozinha. Isso está certo assim: a guarda cobra a PROPRIEDADE ("nenhum
 * total escolhível"), não o caminho que a produz, senão ela reprovaria uma
 * simplificação legítima do filtro. Receita
 * Líquida, Lucro Bruto, EBITDA e Resultado Líquido saem de FÓRMULA sobre as
 * outras; apontar uma categoria para uma delas somaria o lançamento na linha e
 * de novo dentro do total que a contém — o mesmo valor contado duas vezes, com
 * a cascata fechando "certo". É por isso que a lista é derivada da estrutura e
 * não digitada: uma linha nova no DRE aparece aqui sozinha, e uma linha de
 * total nunca aparece por engano.
 */
export function linhasDREdaNatureza(natureza: Natureza): { id: string; label: string }[] {
  return ESTRUTURA_DRE
    .filter((l) => l.tipo === "soma")
    .filter((l) => (natureza === "receita" ? l.sinal === "+" || l.sinal === "+/-" : l.sinal === "-" || l.sinal === "+/-"))
    .map((l) => ({ id: l.id, label: l.label }));
}

/** A linha existe e é escolhível para esta natureza. */
export const linhaDREvalida = (id: string, natureza: Natureza): boolean =>
  linhasDREdaNatureza(natureza).some((l) => l.id === id);

/** Achata a árvore na ordem de exibição, carregando o nível de indentação. */
export function achatarPlano(cats: CategoriaPlano[]): { cat: CategoriaPlano; nivel: number }[] {
  const porPai = new Map<string | null, CategoriaPlano[]>();
  for (const c of cats) {
    const k = c.paiId ?? null;
    porPai.set(k, [...(porPai.get(k) ?? []), c]);
  }
  const out: { cat: CategoriaPlano; nivel: number }[] = [];
  // Guarda contra ciclos: um pai que aponta para um descendente travaria a
  // recursão, e o dado vem de edição livre do usuário.
  const vistos = new Set<string>();
  const desce = (pai: string | null, nivel: number) => {
    for (const c of porPai.get(pai) ?? []) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      out.push({ cat: c, nivel });
      desce(c.id, nivel + 1);
    }
  };
  desce(null, 0);
  return out;
}

/** Excluir um grupo leva os filhos junto — devolve todos os ids afetados. */
export function idsComDescendentes(cats: CategoriaPlano[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const c of cats) if (c.paiId === out[i] && !out.includes(c.id)) out.push(c.id);
  }
  return out;
}

/* ================================ contratos ================================ */

export type Vigencia = "todos" | "ativos" | "encerrados";

export interface Contrato {
  id: string;
  lado: "fornecedor" | "cliente";
  parteId: string;
  parteNome: string;
  objeto: string;
  valor: number;
  inicio: string;
  fim: string;
  descricao: string;
  projetos: LinhaRateio[];
  centros: LinhaRateio[];
  anexoNome: string;
  criadoEm: string;
  vendas: ConfigVendas | null;
}

export interface ConfigVendas {
  produtoId: string;
  contaId: string;
  metodo: string;
  categoria: string;
  valorMensal: number;
  /** "dia_fixo" repete o mesmo dia todo mês; "mesma_data" usa a data informada. */
  competencia: "dia_fixo" | "mesma_data";
  dataPrimeira: string;
  vencimento: "mesmo_mes" | "mes_seguinte";
  diaVencimento: number;
  emitirNF: boolean;
}

export interface VendaPrevista {
  competencia: string;
  vencimento: string;
  valor: number;
}

export const contratoAtivo = (c: Contrato, hoje: string): boolean =>
  (!c.inicio || c.inicio <= hoje) && (!c.fim || c.fim >= hoje);

/** Data segura: dia 31 em fevereiro vira o último dia do mês, não 3 de março. */
function dataDoMes(ano: number, mes0: number, dia: number): string {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  const d = Math.min(Math.max(1, dia), ultimo);
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Traduz o contrato de cliente na agenda de vendas mês a mês.
 *
 * Duas escolhas do formulário mandam aqui: a COMPETÊNCIA (repetir o mesmo dia
 * todo mês, ou manter a data do primeiro pagamento) e o VENCIMENTO (cai no mês
 * da competência ou no seguinte). Fora isso, o limite é a vigência: uma venda
 * por mês enquanto o contrato durar, nunca além do fim.
 */
export function vendasDoContrato(c: Contrato, max = 120): VendaPrevista[] {
  const cfg = c.vendas;
  if (!cfg || !cfg.dataPrimeira || !c.fim) return [];

  const [a0, m0, d0] = cfg.dataPrimeira.split("-").map(Number);
  if (!a0 || !m0 || !d0) return [];

  const out: VendaPrevista[] = [];
  // `max` é só uma trava contra laço infinito (10 anos de contrato); quem
  // determina quantas vendas saem é a VIGÊNCIA.
  for (let k = 0; k < max; k++) {
    const base = new Date(a0, m0 - 1 + k, 1);
    const ano = base.getFullYear();
    const mes0 = base.getMonth();
    // O mês é o que anda; para no mês em que a vigência acaba.
    if (dataDoMes(ano, mes0, 1) > c.fim) break;
    const comp = cfg.competencia === "dia_fixo"
      ? dataDoMes(ano, mes0, d0)   // repete o mesmo dia todo mês
      : cfg.dataPrimeira;          // todas as vendas na MESMA data de competência
    const desloc = cfg.vencimento === "mes_seguinte" ? 1 : 0;
    const alvo = new Date(ano, mes0 + desloc, 1);
    out.push({
      competencia: comp,
      vencimento: dataDoMes(alvo.getFullYear(), alvo.getMonth(), cfg.diaVencimento),
      valor: cfg.valorMensal,
    });
  }
  return out;
}

/** Erros por campo do contrato — mesma ideia da conta bancária. */
export function validarContrato(c: Partial<Contrato>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.parteId) e.parteId = c.lado === "cliente" ? "Selecione o cliente." : "Selecione o fornecedor.";
  if (!c.objeto?.trim()) e.objeto = "Descreva o objeto do contrato.";
  if (!c.valor || c.valor <= 0) e.valor = "Informe o valor do contrato.";
  if (!c.inicio || !c.fim) e.periodo = "Informe o período de vigência.";
  else if (c.fim < c.inicio) e.periodo = "O fim da vigência é anterior ao início.";
  if ((c.descricao?.length ?? 0) > 512) e.descricao = "A descrição passa de 512 caracteres.";
  if (c.projetos && !rateioValido(c.projetos)) e.projetos = "O rateio por projeto precisa somar 100%.";
  if (c.centros && !rateioValido(c.centros)) e.centros = "O rateio por centro de custo precisa somar 100%.";
  if (c.vendas) {
    if (!c.vendas.produtoId) e.vendaProduto = "Selecione o produto ou serviço.";
    if (!c.vendas.contaId) e.vendaConta = "Selecione a conta bancária.";
    if (!c.vendas.categoria) e.vendaCategoria = "Selecione a categoria.";
    if (!c.vendas.valorMensal || c.vendas.valorMensal <= 0) e.vendaValor = "Informe o valor mensal.";
    if (!diaValido(c.vendas.diaVencimento)) e.vendaDia = "Informe um dia entre 1 e 31.";
  }
  return e;
}

/** Limite do anexo — 5 MB, o que o print define. */
export const LIMITE_ANEXO = 5 * 1024 * 1024;
export const anexoCabe = (bytes: number): boolean => bytes > 0 && bytes <= LIMITE_ANEXO;
