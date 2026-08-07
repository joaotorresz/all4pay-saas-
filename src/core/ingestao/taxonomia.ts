/**
 * A TAXONOMIA ÚNICA — uma lista de categorias, em português, para TODOS os
 * caminhos de entrada.
 *
 * ⚠️ Havia duas. O extrato em lote (FDIP) classificava em "Marketing",
 * "Assinaturas / software", "Combustível"…; o documento avulso (OCR) usava o
 * `tipo` extraído do papel ("boleto", "nota", "comprovante") como categoria
 * quando o usuário não escolhia uma. O resultado é que o MESMO gasto entrava
 * com nomes diferentes conforme a porta pela qual chegou, e no DRE apareciam
 * duas linhas para uma despesa só.
 *
 * Aqui a lista é uma. Quem classifica é `classificar()`, e ela devolve sempre
 * um id desta lista — nunca um texto livre vindo do documento.
 *
 * Puro, tipado, sem I/O.
 */

export type Natureza = "receita" | "despesa" | "transferencia" | "imposto" | "financeiro";

export interface Categoria {
  /** O nome que aparece na tela e grava no lançamento. Em português. */
  id: string;
  natureza: Natureza;
  /** Padrão de reconhecimento no descritivo já normalizado. */
  re?: RegExp;
  /** Assinatura/recorrência esperada — alimenta a detecção de custo fixo. */
  assinatura?: boolean;
}

/**
 * ⚠️ A ORDEM É A PRIORIDADE: a primeira que casa vence, como num firewall.
 * Transferência vem primeiro porque "transferência para fornecedor X" é
 * transferência, não compra — e classificá-la como despesa infla o resultado
 * com dinheiro que continua sendo da empresa.
 */
export const TAXONOMIA: Categoria[] = [
  { id: "Transferência entre contas", natureza: "transferencia", re: /\b(entre contas|movimentacao interna|p2p interno|resgate|aplicacao)\b/ },
  { id: "Impostos", natureza: "imposto", re: /\b(das|darf|gps|inss|fgts|iss|icms|pis|cofins|irpj|csll|simples nacional|imposto|tributo)\b/ },
  { id: "Tarifas bancárias", natureza: "financeiro", re: /\b(tarifa|iof|cesta de|manutencao de conta|pacote de servico|taxa bancaria)\b/ },
  { id: "Juros e encargos", natureza: "financeiro", re: /\b(juros|mora|multa|encargo|rotativo|cheque especial)\b/ },
  { id: "Empréstimos e financiamentos", natureza: "financeiro", re: /\b(emprestimo|financiamento|capital de giro|antecipacao)\b/ },
  { id: "Folha de pagamento", natureza: "despesa", re: /\b(folha|salario|pro labore|prolabore|rescisao|ferias|decimo terceiro|13 salario|vale transporte|vale refeicao|vale alimentacao|pessoal)\b/ },
  { id: "Marketing", natureza: "despesa", re: /\b(google ads|meta ads|facebook ads|instagram ads|ads|marketing|midia|impulsionamento|trafego|publicidade)\b/ },
  { id: "Assinaturas e software", natureza: "despesa", assinatura: true, re: /\b(netflix|spotify|amazon web|aws|adobe|openai|chatgpt|google cloud|google workspace|gworkspace|microsoft|office 365|github|figma|slack|notion|dropbox|hubspot|salesforce|vercel|cloudflare|canva|zoom)\b/ },
  { id: "Combustível", natureza: "despesa", re: /\b(posto|shell|ipiranga|petrobras|br distribuidora|texaco|ale combustiveis|combustivel)\b/ },
  { id: "Aluguel", natureza: "despesa", assinatura: true, re: /\b(aluguel|locacao|condominio|imobiliaria)\b/ },
  { id: "Utilidades", natureza: "despesa", assinatura: true, re: /\b(energia|enel|cemig|copel|light|cpfl|sabesp|comgas|agua|internet|vivo|claro|tim|telefonia)\b/ },
  { id: "Fornecedores e insumos", natureza: "despesa", re: /\b(fornecedor|atacado|atacadista|distribuidora|insumo|materia prima|comercio|industria)\b/ },
  { id: "Serviços profissionais", natureza: "despesa", re: /\b(contabilidade|contador|advocacia|advogado|consultoria|assessoria|juridico)\b/ },
  { id: "Receita de vendas", natureza: "receita", re: /\b(venda|pedido|fatura|mercado pago|mercadopago|pagseguro|stripe|hotmart|kiwify|eduzz|shopify|nuvemshop)\b/ },
  { id: "Receita de serviços", natureza: "receita", re: /\b(servico|honorario|mensalidade|assinatura recebida|contrato)\b/ },
  { id: "Rendimento de aplicação", natureza: "receita", re: /\b(rendimento|dividendo|cdb|tesouro|poupanca)\b/ },
];

const PADRAO_RECEITA = "Outras receitas";
const PADRAO_DESPESA = "Outras despesas";

/** Todas as categorias exibíveis, incluindo os dois genéricos. */
export const CATEGORIAS_TODAS: Categoria[] = [
  ...TAXONOMIA,
  { id: PADRAO_RECEITA, natureza: "receita" },
  { id: PADRAO_DESPESA, natureza: "despesa" },
];

export interface Classificacao {
  categoria: string;
  natureza: Natureza;
  /** 0..1 — quanto o sistema confia nesta escolha. */
  confianca: number;
  /** Por que caiu aqui. Vai para a tela de revisão. */
  motivo: string;
  assinatura: boolean;
}

/**
 * Classifica um lançamento a partir do descritivo JÁ NORMALIZADO.
 *
 * `aprendido` (contraparte → categoria confirmada antes pelo dono) tem
 * prioridade sobre a palavra-chave: uma confirmação explícita vale mais que uma
 * heurística, e sem isso o sistema "reaprende" errado a cada importação.
 *
 * A confiança é o que decide o que a tela de revisão destaca — abaixo de 0.9 o
 * lançamento entra marcado para conferência.
 */
export function classificar(
  descritivoNormalizado: string,
  tipo: "entrada" | "saida",
  aprendido?: string | null,
): Classificacao {
  const txt = descritivoNormalizado;

  if (aprendido) {
    const cat = CATEGORIAS_TODAS.find((c) => c.id === aprendido);
    return {
      categoria: aprendido,
      natureza: cat?.natureza ?? (tipo === "entrada" ? "receita" : "despesa"),
      confianca: 0.99,
      motivo: "confirmado por você anteriormente",
      assinatura: cat?.assinatura ?? false,
    };
  }

  for (const c of TAXONOMIA) {
    if (!c.re || !c.re.test(txt)) continue;
    // Uma categoria de RECEITA não pode capturar uma saída (e vice-versa):
    // "pagamento ao fornecedor Mercado Pago" é despesa, mesmo casando com o
    // padrão de recebimento da plataforma.
    if (c.natureza === "receita" && tipo === "saida") continue;
    if (c.natureza === "despesa" && tipo === "entrada") continue;
    return { categoria: c.id, natureza: c.natureza, confianca: 0.85, motivo: `padrão "${c.id.toLowerCase()}" no descritivo`, assinatura: !!c.assinatura };
  }

  return {
    categoria: tipo === "entrada" ? PADRAO_RECEITA : PADRAO_DESPESA,
    natureza: tipo === "entrada" ? "receita" : "despesa",
    // Baixa de propósito: o genérico é uma ADMISSÃO de que não se sabe, e a
    // tela de revisão precisa destacá-lo em vez de deixá-lo passar batido.
    confianca: 0.4,
    motivo: "nenhum padrão reconhecido — confira a categoria",
    assinatura: false,
  };
}
