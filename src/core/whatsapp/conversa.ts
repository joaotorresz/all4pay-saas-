/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONVERSA DA QUATTRO AI PELO WHATSAPP (whatsapp-conversa/1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Etapas 2 a 4: o webhook reconhece o número confirmado (etapa 1), escolhe a
 * empresa e responde com o MESMO cérebro do chat do sistema, só lendo.
 *
 * Aqui mora o que é puro: ler o comando de empresa ("empresas", "2"), montar
 * a lista, decidir qual empresa vale, escrever as recusas e passar a resposta
 * do chat para o formato do WhatsApp. ⚠️ Nada aqui autoriza: quem decide de
 * quem é o número, quais empresas ele lê e o teto por hora é o banco
 * (migration 20261031130000), a cada mensagem.
 */
export const VERSAO_CONVERSA_WHATSAPP = "whatsapp-conversa/1.0.0";

/** O teto do banco (`whatsapp_ia_reservar`), repetido só para a frase. */
export const TETO_PERGUNTAS_HORA = 20;

/** O WhatsApp corta em 1.600; a Twilio recusa acima. Folga para o rodapé. */
export const TAMANHO_MAXIMO = 1500;

export interface EmpresaConversa { id: string; nome: string }

/** O que `whatsapp_ia_quem` devolve. */
export interface QuemPergunta {
  orgs: EmpresaConversa[];
  escolhida: string | null;
  saiu: boolean;
}

/** Lê o JSON do banco sem confiar no formato (nulo = número não confirmado). */
export function lerQuem(bruto: unknown): QuemPergunta | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as { orgs?: unknown; escolhida?: unknown; saiu?: unknown };
  const orgs = Array.isArray(b.orgs)
    ? b.orgs.flatMap((o) => {
        const x = o as { id?: unknown; nome?: unknown };
        return typeof x?.id === "string" ? [{ id: x.id, nome: typeof x.nome === "string" && x.nome.trim() ? x.nome.trim() : "Empresa sem nome" }] : [];
      })
    : [];
  return {
    orgs,
    escolhida: typeof b.escolhida === "string" ? b.escolhida : null,
    saiu: b.saiu === true,
  };
}

const limpar = (s: string): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[.!?,;:"'()]+/g, " ").replace(/\s+/g, " ").trim();

export type ComandoEmpresa =
  | { tipo: "listar" }
  | { tipo: "escolher"; indice: number };

/**
 * "empresas", "trocar empresa", "mudar de empresa" → listar; "2" ou
 * "empresa 2" → escolher a 2ª da lista. ⚠️ A MENSAGEM INTEIRA é o comando:
 * "quanto a empresa vendeu?" é pergunta, não troca.
 */
export function lerComandoEmpresa(texto: string): ComandoEmpresa | null {
  const t = limpar(texto);
  if (!t || t.length > 30) return null;
  if (/^(empresas?|minhas empresas|trocar( de)? empresa|mudar( de)? empresa|outra empresa|escolher( a)? empresa)$/.test(t)) {
    return { tipo: "listar" };
  }
  const m = t.match(/^(?:empresa\s*)?(\d{1,2})$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1) return { tipo: "escolher", indice: n - 1 };
  }
  return null;
}

/** A lista numerada, com a atual marcada. */
export function listaDeEmpresas(orgs: EmpresaConversa[], atual: string | null): string {
  const linhas = orgs.map((o, i) => `${i + 1}. ${o.nome}${o.id === atual ? " (atual)" : ""}`);
  return `Você tem acesso a ${orgs.length} empresas. Responda com o número da que eu devo usar:\n${linhas.join("\n")}`;
}

/** A empresa que vale: a escolhida (ainda legível) ou a única. */
export function empresaDaConversa(q: QuemPergunta): EmpresaConversa | null {
  if (q.escolhida) {
    const e = q.orgs.find((o) => o.id === q.escolhida);
    if (e) return e;
  }
  return q.orgs.length === 1 ? q.orgs[0] : null;
}

export const RESPOSTA_SEM_EMPRESA =
  "Seu celular está confirmado, mas a sua conta não tem acesso de leitura a nenhuma empresa agora. Peça ao administrador da empresa para revisar o seu papel.";
export const RESPOSTA_SAIU =
  "Você pediu para não receber mensagens deste número. Para voltar a conversar com a Quattro AI, responda VOLTAR.";
export const RESPOSTA_ESCOLHA_INVALIDA =
  "Não encontrei essa empresa na lista. Mande EMPRESAS para ver as opções.";
export const RESPOSTA_VAZIA =
  "Pode perguntar sobre o caixa da empresa: \"quanto tenho a pagar essa semana?\", \"qual o saldo hoje?\", \"quem está atrasado?\".";
export const RESPOSTA_FALHA =
  "Não consegui ler os números da empresa agora. Tente de novo em alguns minutos.";

export const respostaEscolhida = (nome: string): string =>
  `Pronto. A partir de agora eu respondo sobre ${nome}. Para trocar, mande EMPRESAS.`;

export function respostaRecusa(codigo: string | undefined): string {
  if (codigo === "limite") {
    return `Você chegou ao limite de ${TETO_PERGUNTAS_HORA} perguntas por hora pelo WhatsApp. Tente de novo daqui a pouco, ou abra o sistema para ver tudo na hora.`;
  }
  if (codigo === "saiu") return RESPOSTA_SAIU;
  if (codigo === "sem_acesso") return "A sua conta não tem mais acesso de leitura a essa empresa. Mande EMPRESAS para ver as que você ainda pode consultar.";
  return RESPOSTA_FALHA;
}

/**
 * A resposta do chat no formato do WhatsApp: **negrito** vira *negrito*,
 * link em markdown vira só o texto (o endereço relativo não abre fora do
 * app), e o texto longo é cortado na última quebra de linha que cabe.
 */
export function paraWhatsapp(texto: string, rodape?: string): string {
  let t = (texto ?? "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const extra = rodape ? `\n\n${rodape}` : "";
  const cabe = TAMANHO_MAXIMO - extra.length;
  if (t.length > cabe) {
    const corte = t.lastIndexOf("\n", cabe - 2);
    t = `${t.slice(0, corte > cabe / 2 ? corte : cabe - 2).trimEnd()}\n…`;
  }
  return t + extra;
}
