/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONVERSA DE CADA AGENTE — apresentar-se e ser configurado conversando
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do dono (04/11/2026): cada agente é um chat na tela da Quattro AI.
 * Ao abrir, ele diz quem é, o que faz e até onde vai, e a configuração
 * (o que ele pode fazer sozinho, os limites) acontece CONVERSANDO, com opções
 * para clicar e texto livre, em vez de um formulário.
 *
 * ⚠️ A conversa NÃO guarda estado próprio: ela nasce da configuração salva
 * (`ConfigAgente`) toda vez que abre, e a única coisa que ela produz é a
 * configuração nova para o escritor de sempre (`salvarAgente`). Uma conversa
 * com memória própria seria a segunda fonte do mesmo fato.
 *
 * ⚠️ O nível máximo de cada agente vem do catálogo (espelho da restrição do
 * banco): a conversa nunca oferece um nível que o banco recusaria.
 *
 * Puro: nada de banco, relógio ou navegador.
 */
import {
  NIVEIS, descricaoDe, resumoDoNivel,
  type ConfigAgente, type IdAgente, type NivelAgente,
} from "./index";

/** Quem é o agente na tela: ícone, cor (token do DS) e o que ele diz de si. */
export interface PerfilAgente {
  id: IdAgente;
  /** Chave do sistema de ícones (`ui/lucide-icons`). */
  icone: string;
  /** Token de cor do DS (`--color-agente-*`). */
  cor: string;
  /** O que ele faz, em itens curtos. */
  faz: string[];
  /** Até onde ele vai: o que ele NUNCA faz sem a pessoa. */
  ateOnde: string[];
  /** O que muda na empresa quando ele liga, quando muda algo. */
  aoLigar?: string;
  /** A pergunta grande que abre o chat dele (06/11/2026, no modelo de chat com cartões). */
  chamada: string;
}

export const PERFIS: Record<IdAgente, PerfilAgente> = {
  cobranca: {
    chamada: "Quem a gente cobra hoje?",
    id: "cobranca", icone: "coins", cor: "var(--color-agente-cobranca)",
    faz: [
      "Lê a régua de cobrança da empresa todo dia de manhã.",
      "Prepara a mensagem de cada cliente que vence ou atrasou, com o link de pagamento quando existe.",
      "Envia pelo canal do cliente, e-mail ou WhatsApp, depois da sua aprovação ou dentro do limite.",
    ],
    ateOnde: [
      "Nunca cobra o mesmo cliente duas vezes no mesmo dia.",
      "Não cobra quem já pagou nem quem pediu para não receber.",
      "Não mexe em valor, juros ou vencimento: só cobra o que está lançado.",
    ],
    aoLigar: "Com ele ligado, a régua de cobrança não envia sozinha: cada cobrança do dia passa por mim, pela mesma régua e pelo mesmo canal.",
  },
  conciliacao: {
    chamada: "O que a gente concilia hoje?",
    id: "conciliacao", icone: "arrow-left-right", cor: "var(--color-agente-conciliacao)",
    faz: [
      "Casa cada linha do extrato do banco com o título previsto, pela mesma regra da aba Conciliar.",
      "Diz por que casou: valor, data, contato e a confiança do par.",
      "Concilia o par aprovado, e o título herda a categoria e o contato.",
    ],
    ateOnde: [
      "Sozinho, só concilia o par de confiança alta (85% ou mais).",
      "O par que você recusar não volta a ser proposto.",
      "Não cria lançamento nem apaga nada: só junta o que já existe.",
    ],
    aoLigar: "Sozinho, eu só concilio o par de confiança alta. O resto sempre espera a sua aprovação.",
  },
  contas_pagar: {
    chamada: "Quais contas a gente organiza hoje?",
    id: "contas_pagar", icone: "receipt", cor: "var(--color-agente-contas-pagar)",
    faz: [
      "Lê o boleto e a nota que chegam na caixa de entrada.",
      "Prepara a conta com fornecedor, vencimento e valor.",
      "Avisa quando já existe uma conta com o mesmo valor e vencimento.",
    ],
    ateOnde: [
      "Nunca paga sozinho: toda conta espera a sua aprovação.",
      "Ao aprovar, o cadastro abre preenchido para você conferir e salvar.",
      "Não muda o valor do documento.",
    ],
  },
  caixa: {
    chamada: "Como fica o caixa hoje?",
    id: "caixa", icone: "landmark", cor: "var(--color-agente-caixa)",
    faz: [
      "Olha o caixa da semana todo dia de manhã.",
      "Avisa do furo antes que ele aconteça.",
      "Sugere antecipar um recebimento ou adiar um pagamento.",
    ],
    ateOnde: [
      "Só sugere: nunca move dinheiro nem muda vencimento sozinho.",
      "Ao aprovar, abro a conta sugerida para você negociar ou ajustar.",
    ],
  },
  fechamento: {
    chamada: "O que falta para fechar o mês?",
    id: "fechamento", icone: "list-checks", cor: "var(--color-agente-fechamento)",
    faz: [
      "Nos primeiros dias do mês, olha o checklist do mês que acabou.",
      "Lembra o que falta fazer, o que espera revisão e o que está atrasado.",
      "Avisa quando o mês está pronto para travar e ir ao contador.",
    ],
    ateOnde: [
      "Não fecha o mês sozinho: o fechamento é sempre seu.",
      "Ao aprovar, abro a tarefa para você.",
    ],
  },
};

/* ────────────────────────── a conversa ────────────────────────── */

export interface OpcaoConversa {
  /** O que a escolha significa (`nivel:2`, `valor:500`, `desligar`…). */
  id: string;
  rotulo: string;
  detalhe?: string;
}

export interface FalaAgente {
  de: "agente" | "pessoa";
  texto: string;
  /** Itens com marcador, depois do texto. */
  itens?: string[];
  /** A pergunta com opções (o cartão A, B, C). */
  pergunta?: { titulo: string; opcoes: OpcaoConversa[]; livre?: string };
}

export type EtapaConversa = "nivel" | "limite_valor" | "limite_dia" | "pronto" | "em_construcao";

export interface EstadoConversa {
  etapa: EtapaConversa;
  /** A configuração em montagem (nasce da salva). */
  rascunho: ConfigAgente;
}

export interface PassoConversa {
  falas: FalaAgente[];
  estado: EstadoConversa;
  /** Presente = a pessoa decidiu: o escritor de sempre grava isto. */
  salvar?: ConfigAgente;
}

const nivelEfetivo = (c: ConfigAgente) => Math.min(c.nivel, descricaoDe(c.agente).nivelMaximo) as NivelAgente;
const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const LIMITES_VALOR = [500, 2000, 10000] as const;
export const LIMITES_DIA = [5, 20, 50] as const;

function perguntaDoNivel(c: ConfigAgente): FalaAgente {
  const d = descricaoDe(c.agente);
  const opcoes: OpcaoConversa[] = NIVEIS.filter((n) => n.nivel <= d.nivelMaximo)
    .map((n) => ({ id: `nivel:${n.nivel}`, rotulo: n.nome, detalhe: n.explica }));
  if (c.ativo) opcoes.push({ id: "manter", rotulo: "Deixar como está" }, { id: "desligar", rotulo: "Desligar" });
  else opcoes.push({ id: "desligar", rotulo: "Deixar desligado por enquanto" });
  return {
    de: "agente",
    texto: d.nivelMaximo < 3 ? "Eu sempre peço a sua aprovação antes de agir." : "",
    pergunta: { titulo: c.ativo ? "Quer mudar o que eu posso fazer sozinho?" : "Para começar: o que eu posso fazer sozinho?", opcoes },
  };
}

const perguntaDoValor = (): FalaAgente => ({
  de: "agente", texto: "Combinado: faço sozinho até um limite.",
  pergunta: {
    titulo: "Até quanto eu posso fazer sozinho, por ação?",
    opcoes: LIMITES_VALOR.map((v) => ({ id: `valor:${v}`, rotulo: `Até ${reais(v)}` })),
    livre: "Ou escreva outro valor, como 1.500",
  },
});

const perguntaDoDia = (): FalaAgente => ({
  de: "agente", texto: "",
  pergunta: {
    titulo: "E quantas ações sozinho por dia, no máximo?",
    opcoes: LIMITES_DIA.map((n) => ({ id: `dia:${n}`, rotulo: `${n} por dia` })),
    livre: "Ou escreva outro número",
  },
});

const opcoesDepois = (): FalaAgente["pergunta"] => ({
  titulo: "Precisa de mais alguma coisa?",
  opcoes: [{ id: "mudar", rotulo: "Mudar o que eu posso fazer sozinho" }],
});

function fechar(rascunho: ConfigAgente, salvo: ConfigAgente): PassoConversa {
  const p = PERFIS[rascunho.agente];
  const falas: FalaAgente[] = [];
  if (!rascunho.ativo) {
    falas.push({ de: "agente", texto: "Pronto, fico desligado. Nada é feito nem proposto até você me ligar de novo.", pergunta: opcoesDepois() });
  } else {
    falas.push({
      de: "agente",
      texto: `Pronto, estou ligado. ${resumoDoNivel(rascunho, reais)}${p.aoLigar && !salvo.ativo ? ` ${p.aoLigar}` : ""}`,
      pergunta: opcoesDepois(),
    });
  }
  return { falas, estado: { etapa: "pronto", rascunho }, salvar: rascunho };
}

/** O que o agente diz quando a conversa abre. `nome` é o primeiro nome de quem abriu. */
export function abrirConversaAgente(salvo: ConfigAgente, nome?: string | null): PassoConversa {
  const d = descricaoDe(salvo.agente);
  const p = PERFIS[salvo.agente];
  const falas: FalaAgente[] = [
    { de: "agente", texto: `Oi${nome ? `, ${nome}` : ""}! Sou o ${d.nome.toLowerCase()}. ${d.missao}` },
    { de: "agente", texto: "O que eu faço:", itens: p.faz },
    { de: "agente", texto: "Até onde eu vou:", itens: p.ateOnde },
  ];
  if (!d.pronto) {
    falas.push({ de: "agente", texto: "Ainda estou em construção: chego em breve, e aí a gente me configura por aqui." });
    return { falas, estado: { etapa: "em_construcao", rascunho: salvo } };
  }
  if (salvo.ativo) falas.push({ de: "agente", texto: `Hoje estou ligado. ${resumoDoNivel({ ...salvo, nivel: nivelEfetivo(salvo) }, reais)}` });
  falas.push(perguntaDoNivel(salvo));
  return { falas, estado: { etapa: "nivel", rascunho: { ...salvo } } };
}

/** Lê um valor em reais escrito pela pessoa ("1.500", "R$ 2.000,50", "2 mil"). */
export function lerValor(t: string): number | null {
  const s = t.toLowerCase().replace(/r\$\s*/g, "").trim();
  const mil = /^(\d+(?:[.,]\d+)?)\s*mil$/.exec(s);
  if (mil) return Math.round(Number(mil[1].replace(",", ".")) * 1000 * 100) / 100;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const v = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** A letra da opção (A, B, C…) ou o texto livre vira uma opção da pergunta da vez. */
function opcaoDoTexto(texto: string, opcoes: OpcaoConversa[]): OpcaoConversa | null {
  const t = texto.trim().toLowerCase();
  if (/^[a-z]$/.test(t)) return opcoes[t.charCodeAt(0) - 97] ?? null;
  return opcoes.find((o) => o.rotulo.toLowerCase() === t)
    ?? (/deslig/.test(t) ? opcoes.find((o) => o.id === "desligar") ?? null : null)
    ?? (/^(n[ií]vel\s*)?([0-3])$/.exec(t) ? opcoes.find((o) => o.id === `nivel:${/([0-3])$/.exec(t)![1]}`) ?? null : null);
}

/**
 * A resposta da pessoa: a opção clicada (`opcao`) ou o que ela escreveu
 * (`texto`). Devolve o que o agente diz e, quando ela decidiu, o que gravar.
 */
export function responderConversaAgente(
  estado: EstadoConversa, salvo: ConfigAgente, entrada: { opcao?: string; texto?: string },
): PassoConversa {
  const fala = (texto: string): FalaAgente => ({ de: "agente", texto });
  const r = estado.rascunho;
  const d = descricaoDe(r.agente);

  if (estado.etapa === "em_construcao") {
    return { falas: [fala("Ainda estou em construção. Enquanto isso, a Quattro AI responde sobre os seus números.")], estado };
  }

  if (estado.etapa === "pronto") {
    const t = (entrada.texto ?? "").toLowerCase();
    if (entrada.opcao === "mudar" || /mud|configur|n[ií]vel|limite|deslig|liga/.test(t)) {
      return { falas: [perguntaDoNivel(salvo)], estado: { etapa: "nivel", rascunho: { ...salvo } } };
    }
    return {
      falas: [{ de: "agente", texto: "Eu cuido só desta tarefa. Para perguntas sobre os seus números, fale com a Quattro AI, no alto da lista.", pergunta: opcoesDepois() }],
      estado,
    };
  }

  if (estado.etapa === "nivel") {
    const op = entrada.opcao ?? opcaoDoTexto(entrada.texto ?? "", perguntaDoNivel(r).pergunta!.opcoes)?.id;
    if (!op) return { falas: [fala("Não entendi. Escolha uma das opções, ou escreva a letra dela."), perguntaDoNivel(r)], estado };
    if (op === "manter") return { falas: [{ de: "agente", texto: "Combinado, nada mudou.", pergunta: opcoesDepois() }], estado: { etapa: "pronto", rascunho: { ...salvo } } };
    if (op === "desligar") return fechar({ ...r, ativo: false }, salvo);
    const nivel = Number(op.split(":")[1]) as NivelAgente;
    if (!(nivel >= 0 && nivel <= d.nivelMaximo)) {
      return { falas: [fala(`Eu não passo do nível "${NIVEIS[d.nivelMaximo].nome}".`), perguntaDoNivel(r)], estado };
    }
    const novo: ConfigAgente = { ...r, ativo: true, nivel };
    if (nivel === 2) return { falas: [perguntaDoValor()], estado: { etapa: "limite_valor", rascunho: novo } };
    return fechar(novo, salvo);
  }

  if (estado.etapa === "limite_valor") {
    const v = entrada.opcao?.startsWith("valor:") ? Number(entrada.opcao.slice(6)) : lerValor(entrada.texto ?? "");
    if (v == null || !(v > 0)) return { falas: [fala("Não entendi o valor. Escreva só o número, como 1.500."), perguntaDoValor()], estado };
    return { falas: [perguntaDoDia()], estado: { etapa: "limite_dia", rascunho: { ...r, limiteValor: Math.round(v * 100) / 100 } } };
  }

  // limite_dia
  const n = entrada.opcao?.startsWith("dia:") ? Number(entrada.opcao.slice(4)) : Number((entrada.texto ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 1000) return { falas: [fala("Escreva um número de 1 a 1000."), perguntaDoDia()], estado };
  return fechar({ ...r, limiteDia: n }, salvo);
}
