/**
 * O REGIME TRIBUTÁRIO COMO CONFIGURAÇÃO — não como constante de arquivo.
 *
 * ⚠️ Este é o item 5 do mapa de consolidação, e a razão dele é específica:
 * conviviam **dois módulos de imposto com regimes conflitantes entre si**.
 * `/impostos` cravava as alíquotas do Lucro Presumido serviços num array no
 * topo do componente; `core/tax` calculava Simples Nacional; e a tela de
 * provisionamento por venda tinha as suas próprias alíquotas editáveis.
 *
 * Escolher UM dos módulos sem tornar o regime configurável só trocaria de
 * erro: a empresa do Simples continuaria vendo conta de Lucro Presumido, ou a
 * do Presumido veria DAS. O regime da empresa já existe
 * (`core/administracao.RegimeTributario`, escolhido no cadastro) — o que
 * faltava era o cálculo LER dali.
 *
 * Puro, tipado, sem I/O. Versão tax-regime/1.0.0.
 */
import type { Regime } from "@/core/fiscal/perfil";

export const TAX_REGIME_VERSION = "tax-regime/1.0.0";

export interface AliquotaTributo {
  /** Sigla do tributo, como sai na guia. */
  nome: string;
  /** Alíquota EFETIVA sobre a receita bruta (não a nominal da tabela). */
  aliquota: number;
  /** De onde ela vem — a tela mostra, porque alíquota sem origem não se confere. */
  origem: string;
}

export interface PerfilTributario {
  /** Inclui `nao_declarado`: a ausência é um valor, não um buraco para preencher. */
  regime: Regime;
  rotulo: string;
  /** `null` quando o regime exige apuração por faixa (Simples) e não tabela fixa. */
  tributos: AliquotaTributo[] | null;
  /** Soma das alíquotas efetivas, quando há tabela fixa. */
  cargaTotal: number;
  /** O que a tela precisa dizer sobre este regime. */
  observacao: string;
}

/**
 * ⚠️ **Lucro Presumido — SERVIÇOS**, base presumida de 32%.
 *
 * As efetivas de IRPJ e CSLL saem da nominal × a presunção (15% × 32% = 4,8%;
 * 9% × 32% = 2,88%). Comércio tem presunção de 8% e produz outros números —
 * por isso a atividade importa e a tela deixa editar.
 */
const PRESUMIDO_SERVICOS: AliquotaTributo[] = [
  { nome: "PIS", aliquota: 0.0065, origem: "cumulativo, 0,65% sobre a receita" },
  { nome: "COFINS", aliquota: 0.03, origem: "cumulativo, 3% sobre a receita" },
  { nome: "IRPJ", aliquota: 0.048, origem: "15% sobre a base presumida de 32%" },
  { nome: "CSLL", aliquota: 0.0288, origem: "9% sobre a base presumida de 32%" },
  { nome: "ISS", aliquota: 0.05, origem: "alíquota municipal — varia por cidade, confira a sua" },
];

/** Lucro Real: PIS/COFINS não cumulativos; IRPJ/CSLL sobre o LUCRO, não a receita. */
const REAL: AliquotaTributo[] = [
  { nome: "PIS", aliquota: 0.0165, origem: "não cumulativo, 1,65% (com direito a crédito)" },
  { nome: "COFINS", aliquota: 0.076, origem: "não cumulativo, 7,6% (com direito a crédito)" },
  { nome: "ISS", aliquota: 0.05, origem: "alíquota municipal — varia por cidade" },
];

/** MEI: valor FIXO mensal, não percentual — por isso a tabela é vazia. */
const MEI_DAS_MENSAL = 76.9;

/** O que toda tela mostra no lugar do imposto quando o regime não foi declarado. */
export const AVISO_REGIME_NAO_DECLARADO = "Regime tributário não declarado. Declare em Configurações.";

export function perfilTributario(regime: Regime): PerfilTributario {
  switch (regime) {
    case "simples":
      return {
        regime, rotulo: "Simples Nacional", tributos: null, cargaTotal: 0,
        observacao:
          "No Simples a alíquota é EFETIVA por faixa — depende do faturamento dos últimos 12 meses (RBT12) e do anexo. Não existe percentual fixo: o sistema calcula a alíquota do seu mês a partir do seu faturamento.",
      };
    case "mei":
      return {
        regime, rotulo: "MEI", tributos: null, cargaTotal: 0,
        observacao:
          `No MEI o DAS é um valor FIXO mensal (cerca de R$${MEI_DAS_MENSAL.toFixed(2).replace(".", ",")}), não um percentual sobre a receita. Projetar percentual aqui daria um número que não existe.`,
      };
    case "real":
      return {
        regime, rotulo: "Lucro Real", tributos: REAL,
        cargaTotal: REAL.reduce((s, t) => s + t.aliquota, 0),
        observacao:
          "⚠️ IRPJ e CSLL do Lucro Real incidem sobre o LUCRO, não sobre a receita — não entram nesta projeção, que é percentual sobre faturamento. PIS/COFINS são não cumulativos e admitem crédito, então a carga real costuma ser menor que a projetada.",
      };
    case "presumido":
      return {
        regime, rotulo: "Lucro Presumido", tributos: PRESUMIDO_SERVICOS,
        cargaTotal: PRESUMIDO_SERVICOS.reduce((s, t) => s + t.aliquota, 0),
        observacao:
          "Base presumida de 32% (serviços). Comércio usa 8% e produz IRPJ/CSLL menores — confira a presunção da sua atividade. O ISS varia por município.",
      };
    default:
      // ⚠️ O ramo `default` ERA o Lucro Presumido: qualquer regime que não fosse
      // Simples, MEI ou Real — inclusive "ninguém declarou" — recebia a carga de
      // 16,33%. Agora a ausência é nomeada e não tem tabela: sem regime, não há
      // imposto a projetar, e a tela diz o que fazer.
      return {
        regime: "nao_declarado", rotulo: "Regime não declarado", tributos: null, cargaTotal: 0,
        observacao: AVISO_REGIME_NAO_DECLARADO,
      };
  }
}

/** A carga projetada de um faturamento, no regime da empresa. */
export function cargaProjetada(receita: number, regime: Regime): number {
  const p = perfilTributario(regime);
  if (!p.tributos) return 0;
  return receita * p.cargaTotal;
}

/* ========================================================================== */
/* O REGIME DA EMPRESA — uma função só, e ela mora em `core/fiscal/perfil`      */
/* ========================================================================== */

/*
 * ⚠️ AQUI MORAVA `regimeDaEmpresa(db, padrao = "presumido")`, e ela foi APAGADA.
 *
 * Eram três resolvedores do mesmo cadastro: este (que devolvia Lucro Presumido
 * para o cadastro vazio), `core/fiscal/perfil.regimeDoCadastro` (que devolve
 * `nao_declarado`) e `core/tax/duplicidade.regimeConfigurado` (que devolvia
 * `null`). Três respostas para "qual é o regime desta empresa" — e a que
 * inventava Presumido alimentava a projeção de carga e o provisionamento, que
 * é onde o padrão vira guia de imposto com valor e vencimento.
 *
 * A única agora é `regimeDoCadastro` (`@/core/fiscal/perfil`). O desacordo
 * entre as duas chaves do cadastro é `divergenciaDeRegime`, no mesmo módulo.
 * Não reintroduzir um padrão aqui: quem precisa de um número sem regime
 * declarado precisa, na verdade, de o regime ser declarado.
 */
