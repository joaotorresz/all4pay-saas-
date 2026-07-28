/**
 * CNAE → CATEGORIA — pré-categorização por atividade econômica (puro, tipado).
 *
 * O problema: num extrato, "PIX ENVIADO 12.345.678/0001-90" não diz NADA sobre
 * o que foi comprado. Mas o CNPJ diz: toda empresa tem um CNAE (Classificação
 * Nacional de Atividades Econômicas) que declara o que ela faz. Um posto é
 * 47.31-8, uma empresa de software é 62.01-5, uma imobiliária é 68.10-2.
 *
 * Então: extrai o CNPJ do texto → consulta o CNAE (camada `lib/cnpj.ts`) →
 * mapeia a atividade para a categoria do plano de contas. É a diferença entre
 * o operador categorizar 300 linhas na mão e conferir 30.
 *
 * O mapa é hierárquico e vai do mais específico ao mais geral:
 *   subclasse (7 díg.) → grupo (3 díg.) → divisão (2 díg.)
 * Assim 47.31 (combustível) não é confundido com 47 (varejo em geral).
 *
 * Versão cnae/1.0.0.
 */

export const CNAE_VERSION = "cnae/1.0.0";

/** Só dígitos. */
const digits = (s: string) => (s || "").replace(/\D/g, "");

/** Valida CNPJ pelos dois dígitos verificadores (módulo 11). */
export function cnpjValido(input: string): boolean {
  const c = digits(input);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

/**
 * Extrai o primeiro CNPJ VÁLIDO do texto de um lançamento.
 * Aceita mascarado (12.345.678/0001-90) e cru (12345678000190). A validação
 * pelos dígitos evita pegar 14 dígitos que na verdade são outra coisa
 * (nosso número de boleto, id de transação, etc.).
 */
export function extrairCNPJ(texto: string): string | null {
  if (!texto) return null;
  const mascarado = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? [];
  for (const m of mascarado) {
    const c = digits(m);
    if (c.length === 14 && cnpjValido(c)) return c;
  }
  // Sequências longas de dígitos: varre janelas de 14 (o CNPJ pode vir colado).
  for (const bloco of texto.match(/\d{14,}/g) ?? []) {
    for (let i = 0; i + 14 <= bloco.length; i++) {
      const c = bloco.slice(i, i + 14);
      if (cnpjValido(c)) return c;
    }
  }
  return null;
}

/** Extrai CPF válido (o outro lado do Pix: pessoa física). */
export function extrairCPF(texto: string): string | null {
  if (!texto) return null;
  for (const m of texto.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) ?? []) {
    const c = digits(m);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) continue;
    const dv = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    if (dv(9) === Number(c[9]) && dv(10) === Number(c[10])) return c;
  }
  return null;
}

/**
 * Regra de mapeamento. `prefixo` casa contra o CNAE só-dígitos, do início:
 * "4731" pega toda a subclasse de combustível; "62" pega a divisão de TI.
 * Regras mais longas ganham (specificidade).
 */
interface RegraCNAE {
  prefixo: string;
  categoria: string;
  /** Como chamar a atividade quando não vier a descrição da API. */
  atividade: string;
}

/**
 * Mapa CNAE → categoria. Baseado na estrutura da CNAE 2.3 (IBGE):
 * seções/divisões (2 díg.) com exceções nos grupos que importam de verdade
 * para um financeiro (combustível, telecom, aluguel, contabilidade…).
 */
const REGRAS: RegraCNAE[] = [
  // --- exceções específicas (grupo/subclasse) vêm primeiro por serem mais longas ---
  { prefixo: "4731", categoria: "Combustível", atividade: "Comércio varejista de combustíveis" },
  { prefixo: "4732", categoria: "Combustível", atividade: "Comércio varejista de lubrificantes" },
  { prefixo: "4681", categoria: "Combustível", atividade: "Comércio atacadista de combustíveis" },
  { prefixo: "4930", categoria: "Frete e logística", atividade: "Transporte rodoviário de carga" },
  { prefixo: "5320", categoria: "Frete e logística", atividade: "Atividades de entrega rápida" },
  { prefixo: "4711", categoria: "Alimentação", atividade: "Supermercado / hipermercado" },
  { prefixo: "4712", categoria: "Alimentação", atividade: "Mercearia / minimercado" },
  { prefixo: "4721", categoria: "Alimentação", atividade: "Comércio varejista de alimentos" },
  { prefixo: "4635", categoria: "Alimentação", atividade: "Comércio atacadista de bebidas" },
  { prefixo: "6911", categoria: "Serviços profissionais", atividade: "Serviços advocatícios" },
  { prefixo: "6920", categoria: "Serviços profissionais", atividade: "Contabilidade e auditoria" },
  { prefixo: "7311", categoria: "Marketing", atividade: "Agência de publicidade" },
  { prefixo: "7312", categoria: "Marketing", atividade: "Agenciamento de espaços para publicidade" },
  { prefixo: "7319", categoria: "Marketing", atividade: "Atividades de publicidade" },
  { prefixo: "7820", categoria: "Folha de pagamento", atividade: "Locação de mão de obra temporária" },
  { prefixo: "7830", categoria: "Folha de pagamento", atividade: "Fornecimento de recursos humanos" },
  { prefixo: "6550", categoria: "Seguros", atividade: "Planos de saúde" },
  { prefixo: "6621", categoria: "Seguros", atividade: "Avaliação de riscos e corretagem de seguros" },
  { prefixo: "4520", categoria: "Manutenção", atividade: "Manutenção e reparação de veículos" },
  { prefixo: "9529", categoria: "Manutenção", atividade: "Reparação de objetos e equipamentos" },
  { prefixo: "3311", categoria: "Manutenção", atividade: "Manutenção de equipamentos" },
  { prefixo: "8211", categoria: "Serviços profissionais", atividade: "Serviços administrativos" },
  { prefixo: "8020", categoria: "Serviços profissionais", atividade: "Serviços de segurança / vigilância" },
  { prefixo: "8121", categoria: "Serviços profissionais", atividade: "Limpeza em prédios" },
  { prefixo: "7911", categoria: "Viagens", atividade: "Agência de viagens" },
  { prefixo: "5111", categoria: "Viagens", atividade: "Transporte aéreo de passageiros" },

  // --- divisões (2 dígitos) ---
  { prefixo: "01", categoria: "Fornecedores / insumos", atividade: "Agricultura e pecuária" },
  { prefixo: "02", categoria: "Fornecedores / insumos", atividade: "Produção florestal" },
  { prefixo: "03", categoria: "Fornecedores / insumos", atividade: "Pesca e aquicultura" },
  { prefixo: "05", categoria: "Fornecedores / insumos", atividade: "Extração de carvão" },
  { prefixo: "06", categoria: "Fornecedores / insumos", atividade: "Extração de petróleo e gás" },
  { prefixo: "07", categoria: "Fornecedores / insumos", atividade: "Extração de minerais metálicos" },
  { prefixo: "08", categoria: "Fornecedores / insumos", atividade: "Extração de minerais não metálicos" },
  { prefixo: "09", categoria: "Fornecedores / insumos", atividade: "Serviços de apoio à extração" },
  { prefixo: "10", categoria: "Fornecedores / insumos", atividade: "Fabricação de produtos alimentícios" },
  { prefixo: "11", categoria: "Fornecedores / insumos", atividade: "Fabricação de bebidas" },
  { prefixo: "13", categoria: "Fornecedores / insumos", atividade: "Fabricação de produtos têxteis" },
  { prefixo: "14", categoria: "Fornecedores / insumos", atividade: "Confecção de vestuário" },
  { prefixo: "15", categoria: "Fornecedores / insumos", atividade: "Couro e calçados" },
  { prefixo: "16", categoria: "Fornecedores / insumos", atividade: "Produtos de madeira" },
  { prefixo: "17", categoria: "Fornecedores / insumos", atividade: "Celulose e papel" },
  { prefixo: "18", categoria: "Fornecedores / insumos", atividade: "Impressão e gráfica" },
  { prefixo: "19", categoria: "Combustível", atividade: "Derivados de petróleo e biocombustíveis" },
  { prefixo: "20", categoria: "Fornecedores / insumos", atividade: "Produtos químicos" },
  { prefixo: "21", categoria: "Fornecedores / insumos", atividade: "Produtos farmoquímicos" },
  { prefixo: "22", categoria: "Fornecedores / insumos", atividade: "Borracha e plástico" },
  { prefixo: "23", categoria: "Fornecedores / insumos", atividade: "Produtos de minerais não metálicos" },
  { prefixo: "24", categoria: "Fornecedores / insumos", atividade: "Metalurgia" },
  { prefixo: "25", categoria: "Fornecedores / insumos", atividade: "Produtos de metal" },
  { prefixo: "26", categoria: "Fornecedores / insumos", atividade: "Equipamentos de informática e eletrônicos" },
  { prefixo: "27", categoria: "Fornecedores / insumos", atividade: "Máquinas e materiais elétricos" },
  { prefixo: "28", categoria: "Fornecedores / insumos", atividade: "Máquinas e equipamentos" },
  { prefixo: "29", categoria: "Fornecedores / insumos", atividade: "Veículos automotores" },
  { prefixo: "30", categoria: "Fornecedores / insumos", atividade: "Outros equipamentos de transporte" },
  { prefixo: "31", categoria: "Fornecedores / insumos", atividade: "Móveis" },
  { prefixo: "32", categoria: "Fornecedores / insumos", atividade: "Produtos diversos" },
  { prefixo: "33", categoria: "Manutenção", atividade: "Manutenção e instalação de equipamentos" },
  { prefixo: "35", categoria: "Utilidades", atividade: "Eletricidade e gás" },
  { prefixo: "36", categoria: "Utilidades", atividade: "Captação e distribuição de água" },
  { prefixo: "37", categoria: "Utilidades", atividade: "Esgoto e atividades relacionadas" },
  { prefixo: "38", categoria: "Utilidades", atividade: "Coleta e tratamento de resíduos" },
  { prefixo: "39", categoria: "Utilidades", atividade: "Descontaminação ambiental" },
  { prefixo: "41", categoria: "Obras e instalações", atividade: "Construção de edifícios" },
  { prefixo: "42", categoria: "Obras e instalações", atividade: "Obras de infraestrutura" },
  { prefixo: "43", categoria: "Obras e instalações", atividade: "Serviços especializados para construção" },
  { prefixo: "45", categoria: "Fornecedores / insumos", atividade: "Comércio e reparação de veículos" },
  { prefixo: "46", categoria: "Fornecedores / insumos", atividade: "Comércio atacadista" },
  { prefixo: "47", categoria: "Fornecedores / insumos", atividade: "Comércio varejista" },
  { prefixo: "49", categoria: "Frete e logística", atividade: "Transporte terrestre" },
  { prefixo: "50", categoria: "Frete e logística", atividade: "Transporte aquaviário" },
  { prefixo: "51", categoria: "Frete e logística", atividade: "Transporte aéreo" },
  { prefixo: "52", categoria: "Frete e logística", atividade: "Armazenamento e apoio ao transporte" },
  { prefixo: "53", categoria: "Frete e logística", atividade: "Correio e entregas" },
  { prefixo: "55", categoria: "Viagens", atividade: "Alojamento / hotelaria" },
  { prefixo: "56", categoria: "Alimentação", atividade: "Alimentação (restaurantes, bares)" },
  { prefixo: "58", categoria: "Assinaturas / software", atividade: "Edição e edição integrada à impressão" },
  { prefixo: "59", categoria: "Marketing", atividade: "Audiovisual (cinema, vídeo, som)" },
  { prefixo: "60", categoria: "Marketing", atividade: "Rádio e televisão" },
  { prefixo: "61", categoria: "Utilidades", atividade: "Telecomunicações" },
  { prefixo: "62", categoria: "Assinaturas / software", atividade: "Serviços de TI e software" },
  { prefixo: "63", categoria: "Assinaturas / software", atividade: "Tratamento de dados e hospedagem" },
  { prefixo: "64", categoria: "Tarifas bancárias", atividade: "Serviços financeiros" },
  { prefixo: "65", categoria: "Seguros", atividade: "Seguros e previdência" },
  { prefixo: "66", categoria: "Tarifas bancárias", atividade: "Atividades auxiliares financeiras" },
  { prefixo: "68", categoria: "Aluguel", atividade: "Atividades imobiliárias" },
  { prefixo: "69", categoria: "Serviços profissionais", atividade: "Atividades jurídicas e contábeis" },
  { prefixo: "70", categoria: "Serviços profissionais", atividade: "Consultoria em gestão" },
  { prefixo: "71", categoria: "Serviços profissionais", atividade: "Arquitetura e engenharia" },
  { prefixo: "72", categoria: "Serviços profissionais", atividade: "Pesquisa e desenvolvimento" },
  { prefixo: "73", categoria: "Marketing", atividade: "Publicidade e pesquisa de mercado" },
  { prefixo: "74", categoria: "Serviços profissionais", atividade: "Atividades profissionais e técnicas" },
  { prefixo: "75", categoria: "Serviços profissionais", atividade: "Atividades veterinárias" },
  { prefixo: "77", categoria: "Aluguel", atividade: "Aluguel de bens e locação" },
  { prefixo: "78", categoria: "Folha de pagamento", atividade: "Seleção e fornecimento de mão de obra" },
  { prefixo: "79", categoria: "Viagens", atividade: "Agências de viagem e turismo" },
  { prefixo: "80", categoria: "Serviços profissionais", atividade: "Vigilância e segurança" },
  { prefixo: "81", categoria: "Serviços profissionais", atividade: "Serviços para edifícios (limpeza)" },
  { prefixo: "82", categoria: "Serviços profissionais", atividade: "Serviços de escritório e apoio" },
  { prefixo: "84", categoria: "Impostos", atividade: "Administração pública" },
  { prefixo: "85", categoria: "Educação", atividade: "Educação" },
  { prefixo: "86", categoria: "Saúde", atividade: "Atenção à saúde humana" },
  { prefixo: "87", categoria: "Saúde", atividade: "Atenção à saúde e assistência social" },
  { prefixo: "88", categoria: "Saúde", atividade: "Serviços de assistência social" },
  { prefixo: "90", categoria: "Lazer", atividade: "Atividades artísticas e culturais" },
  { prefixo: "91", categoria: "Lazer", atividade: "Bibliotecas, museus e patrimônio" },
  { prefixo: "92", categoria: "Lazer", atividade: "Jogos e apostas" },
  { prefixo: "93", categoria: "Lazer", atividade: "Esporte e recreação" },
  { prefixo: "94", categoria: "Serviços profissionais", atividade: "Organizações associativas" },
  { prefixo: "95", categoria: "Manutenção", atividade: "Reparação e manutenção" },
  { prefixo: "96", categoria: "Serviços profissionais", atividade: "Serviços pessoais" },
  { prefixo: "97", categoria: "Folha de pagamento", atividade: "Serviços domésticos" },
];

/** Índice por especificidade: prefixos mais longos primeiro. */
const REGRAS_ORD = [...REGRAS].sort((a, b) => b.prefixo.length - a.prefixo.length);

export interface ResultadoCNAE {
  cnae: string;
  categoria: string;
  atividade: string;
  /** 0..1 — quão específica foi a regra que casou. */
  confianca: number;
}

/**
 * Mapeia um CNAE (qualquer formato: "4731-8/00", "4731800", "47.31-8") para a
 * categoria do plano de contas. Regra mais específica ganha; a confiança sobe
 * com a especificidade (subclasse > grupo > divisão).
 */
export function categoriaPorCNAE(cnae: string): ResultadoCNAE | null {
  const c = digits(cnae);
  if (c.length < 2) return null;
  for (const r of REGRAS_ORD) {
    if (c.startsWith(r.prefixo)) {
      // 4 díg. (grupo/subclasse) → 0.95 · 2 díg. (divisão) → 0.85
      const confianca = r.prefixo.length >= 4 ? 0.95 : 0.85;
      return { cnae: c, categoria: r.categoria, atividade: r.atividade, confianca };
    }
  }
  return null;
}

/** As categorias que este motor pode produzir (para o vocabulário do sistema). */
export const CATEGORIAS_CNAE = Array.from(new Set(REGRAS.map((r) => r.categoria))).sort();
