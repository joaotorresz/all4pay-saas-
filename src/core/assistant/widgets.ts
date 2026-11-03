/**
 * Os MOTORES como cartões da conversa (Fase 2 do plano, 03/11/2026).
 *
 * Risco de caixa, Decisão, Saúde financeira e Sugestões deixaram de ser linhas
 * do menu: a Quattro AI abre o cartão do motor dentro da resposta quando a
 * pergunta pede. A tela completa de cada um continua no endereço dela (Pro pelo
 * servidor, `ROTAS_PRO`), e o cartão leva até lá em "Ver análise completa".
 *
 * Um catálogo só: o reconhecimento da pergunta, o título do cartão e a rota da
 * análise completa moram aqui. O chat (`useChatIA`) e a página da Quattro AI
 * leem daqui; nenhum dos dois repete a lista.
 */

export type WidgetIA = "risco" | "decisao" | "saude" | "sugestoes";

export interface WidgetDoCatalogo {
  id: WidgetIA;
  titulo: string;
  /** A tela completa do motor (Pro no servidor). */
  rota: string;
  /** A pergunta que o atalho da Quattro AI faz por quem clica. */
  pergunta: string;
  /** O que reconhece a pergunta (texto já sem acento e em minúsculas). */
  termos: RegExp;
}

export const WIDGETS_IA: readonly WidgetDoCatalogo[] = [
  {
    id: "risco",
    titulo: "Risco de caixa",
    rota: "/risco",
    pergunta: "Qual o risco de caixa da empresa?",
    termos: /\brisco de caixa\b|\brunway\b|\bruptura\b|\bstress de caixa\b|\b(vou|vai|posso) ficar sem (dinheiro|caixa)\b|\bquanto tempo o caixa (aguenta|dura)\b|\bfolego\b/,
  },
  {
    id: "decisao",
    titulo: "Decisão",
    rota: "/decisao",
    pergunta: "O que devo decidir agora com o meu caixa?",
    termos: /\bmotor de decisao\b|\bmonte carlo\b|\bo que (eu )?devo (fazer|decidir)\b|\bqual a melhor decisao\b|\bcaixa (vai )?ficar negativo\b|\bmatriz de risco\b/,
  },
  {
    id: "saude",
    titulo: "Saúde financeira",
    rota: "/inteligencia",
    pergunta: "Como está a saúde financeira da empresa?",
    termos: /\bsaude financeira\b|\bscore de saude\b|\bnota da empresa\b|\bcomo (esta|vai) a (saude da )?empresa\b/,
  },
  {
    id: "sugestoes",
    titulo: "Sugestões da IA",
    rota: "/autonomo",
    pergunta: "Quais são as suas sugestões para a empresa agora?",
    termos: /\bsugest(ao|oes) (da ia|do motor|para a empresa)\b|\bsuas sugestoes\b|\bo que (voce|vc) sugere\b|\bproxima melhor acao\b|\bo que (eu )?faco (agora|primeiro)\b/,
  },
];

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O cartão que a pergunta pede, ou `null`. O primeiro do catálogo que casar vence. */
export function widgetDaPergunta(pergunta: string): WidgetIA | null {
  const q = semAcento(pergunta);
  return WIDGETS_IA.find((w) => w.termos.test(q))?.id ?? null;
}

export function widgetDoCatalogo(id: WidgetIA): WidgetDoCatalogo {
  const w = WIDGETS_IA.find((x) => x.id === id);
  if (!w) throw new Error(`widget fora do catálogo: ${id}`);
  return w;
}

/** Aceita só id do catálogo (o que vem do modelo, ou do endereço, é texto livre). */
export function widgetValido(id: unknown): WidgetIA | null {
  return typeof id === "string" && WIDGETS_IA.some((w) => w.id === id) ? (id as WidgetIA) : null;
}
