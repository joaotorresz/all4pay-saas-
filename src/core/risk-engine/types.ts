/**
 * all4pay — Motor de Risco de Caixa (scoreRiscoCaixa)
 * ----------------------------------------------------
 * Tipos do motor proprietário de risco operacional financeiro.
 * Arquitetura em camadas: Dados → Normalização → Métricas →
 * Probabilística → Cenários → Score → Narrativa → Alertas.
 *
 * Valores em REAIS (number), pt-BR, consistente com o resto do app.
 */

export type Nivel = "baixo" | "medio" | "alto" | "critico";

/** Evento financeiro normalizado consumido pelo motor. */
export interface RiskMovement {
  id: string;
  type: "entrada" | "saida";
  status: "pendente" | "pago" | "cancelado";
  amount: number;
  due_date: string; // ISO
  paid_date?: string | null;
  party_id?: string | null;
  category?: string | null;
  /**
   * ⚠️ **A COMPETÊNCIA — quando o fato aconteceu.**
   *
   * O campo existia no banco e o motor NUNCA o lia: `dataDe(m,"competencia")`
   * devolvia `due_date` e `RiskMovement` sequer o declarava. Não era fallback
   * silencioso — era coluna inerte, e "DRE por competência" era DRE por
   * vencimento por definição escrita.
   *
   * O custo não era o número (medido: 23,2% preenchido, e as duas divergências
   * caem no mesmo mês, então o DRE não muda um centavo). Era o formulário
   * exigir "Data de competência" e dizer, no texto de ajuda, *"quando o fato
   * aconteceu — é o que o DRE lê"*. O sistema afirmava algo falso à pessoa no
   * instante exato em que ela digitava o dado.
   *
   * E a consequência é de produto: se o DRE apura por vencimento, ele não é
   * competência nem caixa — é um terceiro regime sem nome contábil, e os dois
   * relatórios passam a diferir só por pago-versus-não-pago.
   *
   * Ausente, o vencimento continua valendo — mas DECLARADO, nunca calado: a
   * tela diz quantos lançamentos do período estão sem competência.
   */
  competence_date?: string | null;
  /**
   * A descrição do lançamento.
   *
   * ⚠️ Ela entrou porque a ausência dela produzia um defeito: sem descrição e
   * sem contraparte, o painel de recorrentes usava a CATEGORIA como nome da
   * contraparte, e 24 lançamentos de Google e Meta colapsavam numa linha
   * chamada "Marketing". Um campo não ocupa o lugar de outro.
   */
  descricao?: string | null;
  /** Conta financeira de origem (quando houver) — escopa filtros por conta. */
  accountId?: string | null;
  /** Nome do centro de custo (resolvido do cadastro), quando houver. */
  costCenter?: string | null;
  /** Nome do projeto do lançamento (centro de resultado temporal). */
  projeto?: string | null;
  /**
   * Quantas parcelas a COMPRA tem, quando é parcelada (`installment_total`).
   *
   * ⚠️ Existe para separar o que ACABA do que CONTINUA. Uma parcela repete
   * mensalmente igualzinho a um aluguel — pelo padrão dos lançamentos as duas
   * são indistinguíveis — e mesmo assim não são a mesma coisa: a parcela tem
   * fim, e um compromisso com fim não responde "quanto a empresa gasta todo mês
   * para existir". Sem este campo, o custo fixo sai inflado pela compra
   * parcelada de um notebook.
   */
  parcelas?: number | null;
  /** Qual parcela é esta, 1-based (`installment_no`). */
  parcela?: number | null;
  /**
   * O código de referência da origem (`movements.reference_code`).
   *
   * ⚠️ Existe aqui por UMA razão: `rec:<regraId>:<data>` é o que liga um título
   * à REGRA de recorrência que o gerou, com unicidade imposta pelo banco
   * (`movements_rec_ref_uniq`). Sem esse campo chegando à camada de motores, a
   * projeção de recorrentes não tem como saber que o mês já foi materializado —
   * e uma projeção que não enxerga o título existente soma o mesmo compromisso
   * duas vezes no mesmo mês. A chave já existia no banco; o que faltava era o
   * transporte.
   */
  referenceCode?: string | null;
}

export interface RiskInput {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ⚠️ **O SALDO DE ABERTURA VERIFICADO — fonte INDEPENDENTE, nunca derivada**
   * ═══════════════════════════════════════════════════════════════════════
   *
   * `reconciliarSaldo` calculava a abertura como `extrato − liquidadoTotal` e
   * chamava o resultado de parcela que EXPLICA a diferença. Isso é `x − x`: o
   * resíduo dava zero para QUALQUER saldo — medido com 600, 0, −999.999,
   * 123.456,78 e um bilhão, todos com resíduo 0,00 e `fecha: true`.
   *
   * A guarda de coerência cobrava esse `fecha`, então ela era tautológica:
   * plantar +R$ 12.345,67 no saldo, sem lançamento nenhum correspondente,
   * passava sem uma reprovação.
   *
   * ⚠️ **É a segunda vez que este defeito é "consertado" por renomeação.** A
   * ONDA 4 declarou ter resolvido o resíduo absorvido (os R$ 437.983,17
   * rotulados "conciliado") — e o que fez foi dar NOME às parcelas, deixando a
   * de fechamento calculada por diferença. Nomear não conserta: a parcela
   * continuou existindo para fazer a conta fechar.
   *
   * Agora a abertura entra por aqui, de fora: informada pelo usuário ou
   * importada do extrato, com a data a que se refere. Ausente, o sistema DIZ
   * que não tem como verificar — não finge que fecha.
   */
  aberturaVerificada?: {
    valor: number;
    /** A data a que o saldo se refere (o dia do primeiro lançamento conhecido). */
    data: string;
    fonte: "informada" | "importada";
    /** Quem confirmou (só na fonte "informada"; o banco não tem nome de pessoa). */
    por?: string;
  } | null;
  hoje: string; // ISO
  saldoAtual: number;
  movements: RiskMovement[];
  partyNames?: Record<string, string>;
  horizonDias?: number; // padrão 60
}

/** Recebível com probabilidade (camada probabilística). */
export interface RecebivelProb {
  id: string;
  party_id?: string | null;
  valor: number;
  due_date: string;
  probabilidadeRecebimento: number; // 0..1
  valorEsperado: number;
}

export type PilarId =
  | "liquidez"
  | "previsibilidade"
  | "concentracao"
  | "tendencia"
  | "burn"
  | "inadimplencia"
  | "sazonalidade"
  | "compromissos";

/** Resultado de um pilar — explicável e auditável. */
export interface PilarResult {
  id: PilarId;
  label: string;
  peso: number; // 0..1
  score: number; // 0..100 (saúde; 100 = melhor)
  valor: number; // métrica bruta do pilar
  detalhe: string;
}

export interface RunwayCenarios {
  otimista: number;
  base: number;
  pessimista: number;
}

export interface LiquidezPonto {
  date: string;
  label: string;
  saldo: number;
  ruptura: boolean;
}

export interface StressCenario {
  id: string;
  label: string;
  descricao: string;
  impactoSaldo: number; // R$ no fim do horizonte vs base
  runwayDias: number;
}

export interface ConcentracaoResult {
  topShare: number; // 0..1 (maior cliente)
  hhi: number; // 0..10000 (Herfindahl-Hirschman)
  top: { id: string; name: string; share: number; receita: number }[];
}

export interface BurnResult {
  receitaMensal: number;
  despesaMensal: number;
  liquidoMensal: number; // receita - despesa
  burnMensal: number; // max(0, -liquido)
}

export interface InadimplenciaResult {
  overdueAmount: number;
  overdueRatio: number; // 0..1 do total a receber em aberto
  clientesEmAtraso: number;
}

export interface SazonalidadeResult {
  indiceMesAtual: number; // 1 = média; <1 mês fraco
  mesesBaixos: string[];
  indicePorMes: { label: string; indice: number }[];
}

export interface Alerta {
  nivel: "info" | "atencao" | "critico";
  titulo: string;
  detalhe: string;
}

/** Resultado enxuto pedido na spec. */
export interface ScoreRisco {
  score: number; // 0..100
  nivel: Nivel;
  probabilidadeRuptura: number; // 0..1
  runwayDias: number;
  fatoresCriticos: string[];
}

/** Resultado completo — rastreável, explicável, auditável. */
export interface ScoreDetalhado extends ScoreRisco {
  componentes: PilarResult[];
  runway: RunwayCenarios;
  liquidez: LiquidezPonto[];
  rupturaDia: number | null; // dias até a ruptura no cenário base
  concentracao: ConcentracaoResult;
  burn: BurnResult;
  inadimplencia: InadimplenciaResult;
  sazonalidade: SazonalidadeResult;
  stress: StressCenario[];
  narrativa: string;
  alertas: Alerta[];
  explicacoes: string[];
  versaoModelo: string;
}

/* ---- helpers ---- */
export const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

export const diasEntre = (aISO: string, bISO: string) =>
  Math.round(
    (new Date(bISO).getTime() - new Date(aISO).getTime()) / 86_400_000,
  );

export const VERSAO_MODELO = "risco-caixa/1.0.0";
