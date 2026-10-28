/**
 * MCC → CATEGORIA — pré-categorização pelo código do estabelecimento (puro).
 *
 * Toda compra no cartão leva o MCC (Merchant Category Code, ISO 18245): os
 * quatro dígitos que a adquirente atribui ao lojista. "5541" é posto, "5812"
 * é restaurante, "7311" é agência de publicidade. Ele vem no OFX do cartão
 * (`<SIC>`, o campo que os bancos usam para o MCC), em algumas faturas em PDF
 * e em planilhas exportadas com a coluna "MCC".
 *
 * É o CNAE do cartão: o nome da loja na fatura vem truncado e sem sentido
 * ("PAG*JOSEDASILVA", "IFD*BR"), e o código diz o que ela vende.
 *
 * ⚠️ As categorias são o MESMO vocabulário do `core/cnae` — uma loja não pode
 * cair em "Restaurantes" pelo cartão e em "Alimentação" pelo CNPJ.
 *
 * ⚠️ SÓ NA SAÍDA, como o CNAE: o MCC diz o que o LOJISTA vende. Num estorno de
 * compra (entrada na fatura) ele não transforma a devolução em receita de
 * combustível — quem decide é `classificarRecord`, que só o consulta na saída.
 *
 * O mapa vai do código exato à faixa: o exato tem confiança 0,93, a faixa 0,88.
 * Versão mcc/1.0.0.
 */

export const MCC_VERSION = "mcc/1.0.0";

export interface ResultadoMCC {
  mcc: string;
  categoria: string;
  atividade: string;
  confianca: number;
}

interface RegraMCC {
  /** Código exato ("5541") ou faixa inclusiva ([3000, 3299]). */
  codigos: string[] | [number, number];
  categoria: string;
  atividade: string;
}

const REGRAS: RegraMCC[] = [
  { codigos: ["5541", "5542", "5983", "5172"], categoria: "Combustível", atividade: "posto de combustível" },
  { codigos: ["5811", "5812", "5813", "5814"], categoria: "Alimentação", atividade: "restaurante e lanchonete" },
  { codigos: ["5411", "5422", "5441", "5451", "5462", "5499"], categoria: "Alimentação", atividade: "supermercado e alimentos" },
  { codigos: [3000, 3299], categoria: "Viagens", atividade: "companhia aérea" },
  { codigos: [3351, 3441], categoria: "Viagens", atividade: "locadora de veículos" },
  { codigos: [3501, 3999], categoria: "Viagens", atividade: "hotel" },
  { codigos: ["4511", "4582", "4722", "7011", "7512", "4112", "4131"], categoria: "Viagens", atividade: "viagem e hospedagem" },
  { codigos: ["4111", "4121", "4789", "7523"], categoria: "Viagens", atividade: "transporte e estacionamento" },
  { codigos: ["4214", "4215", "4225", "4411"], categoria: "Frete e logística", atividade: "frete e entrega" },
  { codigos: ["4814", "4899", "4900"], categoria: "Utilidades", atividade: "telefonia, TV e serviços públicos" },
  { codigos: ["4816", "5734", "5817", "5818", "7372", "7379"], categoria: "Assinaturas / software", atividade: "software e serviços digitais" },
  { codigos: ["7311", "7333", "7338"], categoria: "Marketing", atividade: "publicidade e gráfica" },
  { codigos: ["8111", "8931", "8999", "7392", "7399", "7361"], categoria: "Serviços profissionais", atividade: "serviços profissionais" },
  { codigos: ["6300", "6381", "6399"], categoria: "Seguros", atividade: "seguradora" },
  { codigos: [8011, 8099], categoria: "Saúde", atividade: "saúde" },
  { codigos: ["5912", "5122", "5975", "5976"], categoria: "Saúde", atividade: "farmácia e artigos de saúde" },
  { codigos: [8211, 8299], categoria: "Educação", atividade: "educação" },
  { codigos: ["7832", "7922", "7929", "7932", "7933", "7941"], categoria: "Lazer", atividade: "entretenimento" },
  { codigos: [7991, 7999], categoria: "Lazer", atividade: "lazer e recreação" },
  { codigos: [1520, 1799], categoria: "Obras e instalações", atividade: "construção e instalação" },
  { codigos: ["5200", "5211", "5231", "5251"], categoria: "Obras e instalações", atividade: "material de construção" },
  { codigos: [7531, 7549], categoria: "Manutenção", atividade: "oficina e manutenção de veículos" },
  { codigos: ["7622", "7623", "7629", "7692", "7699"], categoria: "Manutenção", atividade: "conserto e manutenção" },
  { codigos: ["9311"], categoria: "Impostos", atividade: "pagamento de tributo" },
  { codigos: [5000, 5199], categoria: "Fornecedores / insumos", atividade: "atacado" },
  { codigos: ["5300", "5310", "5311", "5732", "5943", "5044", "5045", "5046"], categoria: "Fornecedores / insumos", atividade: "atacarejo, eletrônicos e escritório" },
];

/** Só os quatro dígitos; "0742" e "742" são o mesmo código. */
export function normalizarMCC(mcc: string | number | null | undefined): string | null {
  const d = String(mcc ?? "").replace(/\D/g, "");
  if (!d || d.length > 4) return null;
  const c = d.padStart(4, "0");
  return c === "0000" ? null : c;
}

/** A categoria do MCC, ou `null` quando o código não está no mapa. */
export function categoriaPorMCC(mcc: string | number | null | undefined): ResultadoMCC | null {
  const c = normalizarMCC(mcc);
  if (!c) return null;
  const n = Number(c);
  // primeiro o código exato (mais específico), depois as faixas
  for (const r of REGRAS) {
    if (typeof r.codigos[0] === "string" && (r.codigos as string[]).includes(c)) {
      return { mcc: c, categoria: r.categoria, atividade: r.atividade, confianca: 0.93 };
    }
  }
  for (const r of REGRAS) {
    if (typeof r.codigos[0] === "number") {
      const [de, ate] = r.codigos as [number, number];
      if (n >= de && n <= ate) return { mcc: c, categoria: r.categoria, atividade: r.atividade, confianca: 0.88 };
    }
  }
  return null;
}

/** As categorias que este motor pode produzir. */
export const CATEGORIAS_MCC = Array.from(new Set(REGRAS.map((r) => r.categoria))).sort();
