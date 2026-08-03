/**
 * PLANOS — o que o Simples abre e o que só o Pro abre.
 *
 * ⚠️ **Gating de plano é decisão de SERVIDOR, não de menu.** O Modo Pro era uma
 * cortina: com o modo em simples os grupos Inteligência e Governança sumiam da
 * navegação, mas `/copiloto`, `/investidores`, `/aprovacoes`,
 * `/governanca` e `/automacoes` continuavam respondendo 200 e renderizando
 * conteúdo inteiro para quem digitasse o endereço.
 *
 * Isso é ruim das duas maneiras possíveis, e não há terceira:
 *  - **Se Pro é plano pago**, a receita vaza por digitação de endereço.
 *  - **Se Pro não é plano pago**, o produto está escondendo do usuário
 *    funcionalidade que ele já tem — pior ainda em percepção de valor.
 *
 * Este módulo é a fonte única do mapa rota → plano. Quem aplica é o
 * `middleware.ts` (servidor, antes de qualquer render); o menu apenas reflete.
 *
 * Puro, sem I/O — dá para importar no Edge Runtime. Versão planos/1.0.0.
 */

export const PLANOS_VERSION = "planos/1.0.0";

export type Plano = "simples" | "pro";

export interface EstadoPlano {
  plano: Plano;
  /** Nome comercial do plano, como está na cobrança. */
  nome: string;
  /** `active` | `trial` | `past_due` | `none`. */
  status: string;
  expira?: string | null;
  /**
   * `true` quando o gating está DESLIGADO (demo, ou Supabase não configurado).
   * A tela usa para não oferecer upgrade a quem não tem o que comprar.
   */
  aberto: boolean;
}

export const PLANO_ABERTO: EstadoPlano = {
  plano: "pro", nome: "Demonstração", status: "none", aberto: true,
};
export const PLANO_SIMPLES: EstadoPlano = {
  plano: "simples", nome: "Simples", status: "none", aberto: false,
};

/**
 * As rotas que exigem Pro — **prefixos**, para pegar as sub-rotas junto
 * (`/copiloto?aba=risco`, `/dashboard/administration/...`).
 *
 * ⚠️ Esta lista tem de espelhar EXATAMENTE os grupos `pro: true` de
 * `nav-data.ts`. Uma guarda no `engine-audit` compara as duas e falha se
 * divergirem: menu e servidor discordando é como o gating vira cortina de novo
 * — some do menu, continua abrindo.
 */
export const ROTAS_PRO: string[] = [
  // Grupo "Inteligência".
  // ⚠️ Nem `/inadimplencia` nem a apuração de impostos entram: as duas são
  // OPERAÇÃO e o menu do Simples já as entrega. Trancar o que o próprio menu
  // oferece é o outro lado do defeito — esconder do usuário o que ele já tem.
  "/investidores",
  "/contratacoes",
  // Grupo "Governança"
  "/aprovacoes",
  "/governanca",
  "/automacoes",
  "/consolidado",
  // Rotas legadas que redirecionam para as ABAS Pro do assistente — sem elas,
  // o redirect seria um caminho aberto para a mesma tela.
  "/decisao",
  "/risco",
  "/autonomo",
  "/inteligencia",
];

/**
 * Rotas que NUNCA são bloqueadas, mesmo casando com um prefixo acima.
 * A tela de upgrade e a de assinatura precisam abrir justamente para quem não
 * tem o plano — trancá-las deixaria a pessoa sem caminho para comprar.
 */
const SEMPRE_ABERTAS = [
  "/planos",
  "/dashboard/administration/subscription",
];

/**
 * ABAS Pro dentro de rotas do Simples.
 *
 * ⚠️ Um hub pode ser do Simples e ter UMA aba paga. `/consolidado` estava em
 * `ROTAS_PRO`, mas o alias o mandava para `/contabilidade?aba=consolidado` —
 * e `/contabilidade` é do Simples. O gate barrava o endereço antigo e deixava
 * o novo aberto: o redirecionamento virava a porta lateral que ele deveria
 * fechar. Fechar por prefixo não serve aqui (trancaria o hub inteiro), então a
 * trava é pelo par rota+aba.
 */
const ABAS_PRO: { rota: string; param: string; valores: string[] }[] = [
  { rota: "/contabilidade", param: "aba", valores: ["consolidado"] },
  // ⚠️ A CONVERSA é Simples — é a porta da frente do produto. Os quatro
  // MOTORES (quant, decisão, risco, autônomo) são Pro, e desde a fusão do
  // item 6 eles são abas dela. Trancar `/all4pay-ai` inteiro esconderia o chat
  // de todo mundo; trancar por aba fecha o que é pago e deixa a porta aberta.
  { rota: "/all4pay-ai", param: "aba", valores: ["quant", "decisao", "risco", "autonomo"] },
];

/**
 * A rota exige plano Pro? Compara PREFIXO e, quando há aba paga dentro de um
 * hub do Simples, o par rota+aba.
 */
export function exigePro(pathname: string, busca?: string | URLSearchParams): boolean {
  const [caminho, queryDaRota] = pathname.split("?");
  const p = (caminho || "/").replace(/\/+$/, "") || "/";
  if (SEMPRE_ABERTAS.some((r) => p === r || p.startsWith(`${r}/`))) return false;
  if (ROTAS_PRO.some((r) => p === r || p.startsWith(`${r}/`))) return true;

  const params = new URLSearchParams(
    busca instanceof URLSearchParams ? busca.toString() : (busca ?? queryDaRota ?? ""),
  );
  return ABAS_PRO.some(
    (a) => p === a.rota && a.valores.includes(params.get(a.param) ?? ""),
  );
}

/** A pessoa pode abrir esta rota com este plano? */
export function podeAbrir(pathname: string, estado: EstadoPlano): boolean {
  if (estado.aberto) return true;
  if (!exigePro(pathname)) return true;
  return estado.plano === "pro";
}

/**
 * O que o Pro desbloqueia, para a tela de upgrade dizer sem enrolação.
 * Rótulos, não rotas: quem está decidindo comprar não lê caminho de URL.
 */
export const BENEFICIOS_PRO: { titulo: string; descricao: string }[] = [
  { titulo: "Copiloto e motores de decisão", descricao: "Previsão de caixa por Monte Carlo, matriz de risco, recomendações com impacto medido e plano autônomo." },
  { titulo: "Inteligência de crédito", descricao: "Score de inadimplência por cliente, alerta antecipado e estratégia de cobrança adaptativa." },
  { titulo: "Investor update", descricao: "O relatório mensal para investidores, com os KPIs derivados dos seus próprios lançamentos." },
  { titulo: "Fiscal e contratações", descricao: "Apuração de impostos por venda e simulação do custo real de contratar." },
  { titulo: "Aprovações e governança", descricao: "Alçadas por valor, trilha de auditoria assinada e segregação de funções." },
  { titulo: "Automações", descricao: "Regras SE→ENTÃO sobre os eventos financeiros, com notificação por WhatsApp e e-mail." },
  { titulo: "Consolidado multiempresa", descricao: "A posição somada de todas as organizações em que você é membro." },
];
