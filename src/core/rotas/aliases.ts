/**
 * O REGISTRO DE ALIASES — os endereços antigos que ainda respondem.
 *
 * ⚠️ Havia **34** desvios vivos na raiz do domínio, nenhum documentado, nenhum
 * no menu, nenhum testado, e todos feitos no CLIENTE: a página montava vazia,
 * um `useEffect` disparava e só então o navegador ia para o destino. Isso
 * custa três coisas:
 *
 *  1. **Não é um redirecionamento de verdade.** Sem 308, quem compartilha o
 *     link, o histórico do navegador e qualquer pré-visualização enxergam uma
 *     página em branco, não o destino.
 *  2. **Piscada branca** a cada acesso, porque o React precisa montar antes.
 *  3. **Ninguém sabia que existiam** — e endereço vivo que ninguém conhece é
 *     endereço que quebra sem ninguém perceber.
 *
 * Este arquivo é a fonte única. O `next.config.ts` o transforma em
 * redirecionamentos HTTP de verdade, e a matriz de consistência cobra que todo
 * destino exista, que nenhum alias apareça no menu e que não haja ciclo.
 *
 * ⚠️ Sem imports: o `next.config.ts` precisa carregá-lo em tempo de build, onde
 * o alias `@/` não existe.
 */

export interface Alias {
  /** O endereço antigo (o que ainda chega). */
  de: string;
  /** Para onde ele vai hoje. */
  para: string;
  /** Por que ele existe — quem lê daqui a um ano precisa saber se pode remover. */
  motivo: string;
}

/**
 * ⚠️ Todos **permanentes** (HTTP 308). São links que já foram compartilhados e
 * estão em favoritos: um 302 diria ao navegador "volte a perguntar", e o
 * endereço antigo nunca deixaria de ser tratado como o canônico.
 */
export const ALIASES: Alias[] = [
  // — telas que viraram a MESMA tela —
  { de: "/visao-geral", para: "/", motivo: "a visão geral virou a Home" },
  { de: "/criar", para: "/", motivo: "criar virou painel, não rota" },
  { de: "/recebiveis", para: "/recebimentos", motivo: "unificado no extrato de recebimentos" },
  { de: "/pagaveis", para: "/pagamentos", motivo: "unificado no extrato de pagamentos" },
  { de: "/import", para: "/upload", motivo: "importação virou aba da entrada de dados" },
  { de: "/inbox", para: "/upload", motivo: "caixa de entrada virou a esteira de ingestão" },
  { de: "/assistente", para: "/copiloto", motivo: "assistente virou o copiloto" },

  // — hub CADASTROS —
  { de: "/produtos", para: "/cadastros?aba=produtos", motivo: "consolidado no hub de cadastros" },
  { de: "/servicos", para: "/cadastros?aba=servicos", motivo: "consolidado no hub de cadastros" },
  { de: "/contatos", para: "/cadastros?aba=clientes", motivo: "consolidado no hub de cadastros" },
  { de: "/projetos", para: "/cadastros?aba=projetos", motivo: "consolidado no hub de cadastros" },
  { de: "/centros-custo", para: "/cadastros?aba=centros-custo", motivo: "consolidado no hub de cadastros" },

  // — hub CONTABILIDADE —
  { de: "/plano-de-contas", para: "/contabilidade?aba=plano-de-contas", motivo: "consolidado no hub de contabilidade" },
  { de: "/razao", para: "/contabilidade?aba=razao", motivo: "consolidado no hub de contabilidade" },
  { de: "/fechamento", para: "/contabilidade?aba=fechamento", motivo: "consolidado no hub de contabilidade" },
  { de: "/receita", para: "/contabilidade?aba=receita", motivo: "consolidado no hub de contabilidade" },
  { de: "/relatorios", para: "/contabilidade?aba=relatorios", motivo: "consolidado no hub de contabilidade" },
  { de: "/dimensoes", para: "/contabilidade?aba=dimensoes", motivo: "consolidado no hub de contabilidade" },
  { de: "/cronogramas", para: "/contabilidade?aba=cronogramas", motivo: "consolidado no hub de contabilidade" },

  // — hub VENDAS —
  { de: "/painel-vendas", para: "/vendas?aba=painel", motivo: "consolidado no hub de vendas" },
  { de: "/nova-venda", para: "/vendas?aba=nova", motivo: "consolidado no hub de vendas" },
  { de: "/notas-fiscais", para: "/vendas?aba=notas", motivo: "consolidado no hub de vendas" },

  // — hub RECEBER / PAGAR —
  { de: "/recorrencias", para: "/recebimentos?aba=recorrencias", motivo: "consolidado no hub de receber" },
  { de: "/inadimplencia", para: "/recebimentos?aba=inadimplencia", motivo: "consolidado no hub de receber" },
  { de: "/boletos", para: "/recebimentos?aba=boletos", motivo: "consolidado no hub de receber" },
  { de: "/reembolsos", para: "/pagamentos?aba=reembolsos", motivo: "consolidado no hub de pagar" },

  // — hub ENTRADA DE DADOS —
  { de: "/conciliacao", para: "/upload?aba=conciliar", motivo: "conciliação única na esteira de ingestão" },
  { de: "/conciliacao-bancaria", para: "/upload?aba=conciliar", motivo: "conciliação única na esteira de ingestão" },
  { de: "/contas", para: "/upload?aba=conectar", motivo: "contas viraram a aba de conectar bancos" },

  // — hub COPILOTO (todos exigem plano Pro; ver `core/planos`) —
  { de: "/risco", para: "/copiloto?aba=risco", motivo: "motor de risco virou aba do copiloto" },
  { de: "/decisao", para: "/copiloto?aba=decisao", motivo: "motor de decisão virou aba do copiloto" },
  { de: "/autonomo", para: "/copiloto?aba=autonomo", motivo: "operação autônoma virou aba do copiloto" },
  { de: "/inteligencia", para: "/copiloto?aba=quant", motivo: "camada quantitativa virou aba do copiloto" },
  { de: "/consolidado", para: "/contabilidade?aba=consolidado", motivo: "consolidado virou aba de contabilidade" },
];

/**
 * ROTAS REMOVIDAS que ainda aparecem em rastro antigo (marcadores de tour
 * concluído no navegador, favoritos, links em e-mails já enviados).
 *
 * ⚠️ Eram vitrine técnica sem uso operacional e foram removidas — mas ninguém
 * limpou as referências, e o mecanismo de onboarding continuava carregando o
 * rastro delas. Um endereço que responde 404 num sistema que a pessoa acabou
 * de comprar lê-se como produto quebrado, não como página aposentada.
 *
 * Vão para a Home com um destino honesto em vez de 404.
 */
export const ROTAS_REMOVIDAS: Alias[] = [
  { de: "/arquitetura", para: "/", motivo: "removida — vitrine técnica sem uso operacional" },
  { de: "/infraestrutura", para: "/", motivo: "removida — vitrine técnica sem uso operacional" },
  { de: "/orquestracao", para: "/", motivo: "removida — vitrine técnica sem uso operacional" },
  { de: "/dados", para: "/upload", motivo: "removida — a entrada de dados assumiu o papel" },
  { de: "/plataforma", para: "/governanca", motivo: "removida — hub esvaziado; governança assumiu" },
];

/** Tudo que o `next.config` transforma em 308. */
export const TODOS_OS_DESVIOS: Alias[] = [...ALIASES, ...ROTAS_REMOVIDAS];

/** O destino de um endereço antigo, ou `null` se ele não é um desvio. */
export function destinoDe(rota: string): string | null {
  const p = (rota.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return TODOS_OS_DESVIOS.find((a) => a.de === p)?.para ?? null;
}
