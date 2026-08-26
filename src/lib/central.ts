/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CENTRAL, LIGADA AO BANCO — a máquina de estados alcançada pela interface
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O que faltava.** A máquina de estados existe no banco desde a migration
 * `central_maquina_de_estados` — transição válida, segregação de funções e
 * alçada, tudo em gatilho. E **ninguém a alcançava pela interface**: a tela
 * derivava a fila do `RiskInput` e confirmava em estado local, otimista. Uma
 * regra que só o banco conhece e nenhuma tela exercita é uma regra que ninguém
 * usa — e a primeira vez que alguém a encontra é quando ela recusa.
 *
 * ⚠️ **E as recusas são QUATRO, não uma.** O gatilho distingue:
 *   `A4P-CENTRAL`            — a transição não existe na máquina
 *   `A4P-CENTRAL-SEGREGACAO` — quem lançou não confirma o próprio (R1)
 *   `A4P-CENTRAL-PERMISSAO`  — o PAPEL não confirma títulos
 *   `A4P-CENTRAL-ALCADA`     — o valor passa do TETO daquele papel
 *
 * Permissão e alçada são problemas DIFERENTES e a saída de cada um é diferente:
 * a primeira se resolve mudando o papel da pessoa, a segunda mudando o teto (ou
 * pedindo a outro). Colapsar as duas em "não autorizado" manda quem opera
 * procurar no lugar errado — por isso cada código vira uma frase própria, com o
 * que fazer.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { ordenarFila, diasParado, type Situacao } from "@/core/central";
import { formatBRL } from "@/lib/format";

export interface TituloDaFila {
  id: string;
  descricao: string;
  contraparte: string | null;
  valor: number;
  direcao: "entrada" | "saida";
  vencimento: string;
  situacao: Situacao;
  /** De onde o título veio — a coluna real, não um palpite pela direção. */
  origem: string | null;
  lancadoPor: string | null;
  /**
   * Há quantos dias este título está parado — `0` quando não está.
   * ⚠️ Ele desce para o fim da fila, mas NÃO some: a tela diz o número, e some
   * seria trocar um defeito de ordem por um de omissão.
   */
  diasParado: number;
}

export interface Transicao {
  id: string;
  de: string;
  para: string;
  por: string | null;
  motivo: string | null;
  quando: string;
  /**
   * ⚠️ O CARIMBO DA AUTOAPROVAÇÃO — a linha que o auditor lê.
   * Confirmação feita por quem lançou, permitida porque a organização não tem
   * outro membro habilitado a aprovar. Não é metadado escondido: aparece na
   * tela do movimento e em toda exportação. Autoaprovação silenciosa seria pior
   * que a recusa — o registro existiria e ninguém saberia procurá-lo.
   */
  autoaprovacao: boolean;
}

/** O que ESTE usuário pode fazer aqui — vindo do servidor, nunca presumido. */
export interface ContextoCentral {
  usuarioId: string | null;
  papel: string | null;
  /** `null` = sem teto. `0` = não aprova. */
  teto: number | null;
  podeAprovar: boolean;
  podeBaixar: boolean;
  /** Existe OUTRO membro habilitado a aprovar? Decide a autoaprovação. */
  temOutroAprovador: boolean;
}

/** O que a recusa do banco quer dizer para quem opera. */
export interface RecusaCentral {
  codigo: "transicao" | "segregacao" | "permissao" | "alcada" | "desconhecida";
  motivo: string;
  comoResolver: string;
}

/**
 * ⚠️ A tradução é por CÓDIGO, nunca por substring da frase em português.
 * Casar texto de mensagem já custou caro neste repositório três vezes (o
 * auditor de RLS, o classificador `maq_*`, o extrator do `ia-eval`): a frase
 * muda, o código não.
 */
export function traduzirRecusa(bruto: string): RecusaCentral {
  if (bruto.includes("A4P-CENTRAL-SEGREGACAO")) {
    return {
      codigo: "segregacao",
      motivo: "Você lançou este título — quem lança não confirma o próprio lançamento.",
      comoResolver: "Peça a confirmação a outra pessoa da equipe. É a regra que separa quem registra de quem autoriza.",
    };
  }
  if (bruto.includes("A4P-CENTRAL-PERMISSAO")) {
    return {
      codigo: "permissao",
      motivo: "O seu papel não confirma títulos.",
      comoResolver: "Isto se resolve mudando o PAPEL em Configurações → Usuários, não o valor da alçada.",
    };
  }
  if (bruto.includes("A4P-CENTRAL-ALCADA")) {
    return {
      codigo: "alcada",
      motivo: "O valor deste título passa do teto do seu papel.",
      comoResolver: "Peça a quem tem alçada maior, ou ajuste o teto do papel em Configurações. O papel está certo; o limite é que não alcança.",
    };
  }
  if (bruto.includes("A4P-CENTRAL")) {
    return {
      codigo: "transicao",
      motivo: "Este título não pode ir direto para essa situação.",
      comoResolver: "Um título previsto precisa ser CONFIRMADO antes de ser baixado.",
    };
  }
  return {
    codigo: "desconhecida",
    motivo: "Não foi possível concluir agora.",
    comoResolver: "Tente de novo; se repetir, informe o suporte.",
  };
}

/** A fila: tudo que aguarda confirmação, com a procedência REAL. */
export async function getFilaCentral(): Promise<TituloDaFila[]> {
  if (isDemo) return [];
  const s = createClient();
  const { data, error } = await semAmostra(
    s.from("movements").select(
      "id,description,category,amount,type,due_date,situacao,origem,lancado_por,party_id,parties(name)",
    ),
  /*
   * ⚠️ **A fila não é só o `previsto`.** Um título CONFIRMADO ainda espera
   * ação — a baixa —, e deixá-lo fora faria a esteira sumir no meio: a pessoa
   * confirma, o título desaparece da tela, e não há onde dar baixa. A Central
   * mostra os dois estados em que existe algo a fazer.
   */
  /*
   * ⚠️ A ordem FINAL não é esta. O banco devolve por vencimento crescente
   * (barato, com índice), e `ordenarFila` — puro, testável, em `core/central` —
   * empurra para o fim o que está parado há mais de 90 dias. Ordenar no SQL
   * exigiria repetir a regra dos 90 dias numa segunda morada.
   */
  ).in("situacao", ["previsto", "confirmado"])
   .order("due_date", { ascending: true }).limit(TETO_LINHAS);
  if (error) throw error;
  const hoje = new Date().toISOString().slice(0, 10);
  return ordenarFila((data ?? []).map((r) => {
    const m = r as Record<string, unknown>;
    const parte = m.parties as { name?: string } | null;
    return {
      id: String(m.id),
      descricao: String(m.description || m.category || "Lançamento"),
      contraparte: parte?.name ?? null,
      valor: Number(m.amount),
      direcao: m.type === "entrada" ? "entrada" : "saida",
      vencimento: String(m.due_date),
      situacao: (m.situacao as Situacao) ?? "previsto",
      origem: (m.origem as string) ?? null,
      lancadoPor: (m.lancado_por as string) ?? null,
      diasParado: diasParado(String(m.due_date), hoje),
    };
  }), hoje);
}

/**
 * Move o título na máquina. ⚠️ Quem AUTORIZA é o banco — esta função só pede e
 * traduz a recusa. Repetir a regra aqui criaria a segunda morada da alçada, que
 * é o defeito que este repositório passou dois dias matando.
 */
export async function moverTitulo(
  id: string, para: Situacao, motivo?: string,
): Promise<{ ok: true } | { ok: false; recusa: RecusaCentral }> {
  if (isDemo) return { ok: true };
  const s = createClient();
  /**
   * ⚠️ **`motivo` NÃO É GRAVÁVEL HOJE, e o parâmetro fica documentando isso.**
   * A tabela `central_transicoes` tem a coluna `motivo`, e o gatilho
   * `central_maquina` — o ÚNICO escritor da trilha — insere sem ela:
   *
   *     insert into central_transicoes (org_id, movement_id, de, para, por)
   *
   * É o espelho de "instrumentação sem consumidor": aqui há um consumidor (a
   * tela sabe mostrar o motivo) e nenhum PRODUTOR. Escrever na trilha por fora
   * criaria um segundo escritor e a trilha deixaria de ter dono único — o preço
   * é alto demais para um campo. Fica declarado, e a tela mostra o motivo
   * "quando houver", que hoje é nunca.
   */
  void motivo;
  const { error } = await s.from("movements").update({ situacao: para }).eq("id", id);
  if (error) return { ok: false, recusa: traduzirRecusa(`${error.message} ${error.details ?? ""} ${error.hint ?? ""}`) };
  return { ok: true };
}

/** A trilha do próprio título — quem, quando, de onde para onde, e por quê. */
export async function getTransicoes(movementId: string): Promise<Transicao[]> {
  if (isDemo) return [];
  const s = createClient();
  const { data, error } = await s
    .from("central_transicoes")
    .select("id,de,para,por,motivo,quando,autoaprovacao")
    .eq("movement_id", movementId)
    .order("quando", { ascending: true })
    .limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const t = r as Record<string, unknown>;
    return { ...(t as unknown as Transicao), autoaprovacao: t.autoaprovacao === true };
  });
}

/**
 * O contexto de autorização de QUEM ESTÁ OLHANDO — lido do servidor.
 *
 * ⚠️ **Isto NÃO autoriza nada.** Quem autoriza é o gatilho, e ele vai recusar
 * mesmo que a tela mostre o botão. Este contexto existe para a interface poder
 * EXPLICAR antes do clique em vez de deixar a pessoa descobrir pela recusa —
 * "acima do seu teto de R$ X" é uma frase que resolve; um botão que some sem
 * dizer nada é um sistema que parece quebrado.
 *
 * ⚠️ **`temOutroAprovador` sai de `role_permissions`, nunca da alçada** — a
 * mesma fonte que a máquina consulta. A alçada responde QUANTO; perguntar a ela
 * QUEM faria um `fechador` com teto herdado contar como aprovador.
 */
export async function getContextoCentral(): Promise<ContextoCentral> {
  const vazio: ContextoCentral = {
    usuarioId: null, papel: null, teto: 0,
    podeAprovar: false, podeBaixar: false, temOutroAprovador: false,
  };
  if (isDemo) return { ...vazio, papel: "owner", teto: null, podeAprovar: true, podeBaixar: true };
  const s = createClient();
  const { data: sessao } = await s.auth.getUser();
  const uid = sessao.user?.id ?? null;
  if (!uid) return vazio;

  const { data: perms } = await s.rpc("minhas_permissoes");
  const acoes = new Set(
    Array.isArray(perms) ? (perms as unknown[]).map((p) => String((p as { acao?: string })?.acao ?? p)) : [],
  );

  const { data: vinculo } = await s
    .from("organization_members").select("org_id,role").eq("user_id", uid).limit(1).maybeSingle();
  const papel = (vinculo as { role?: string } | null)?.role ?? null;
  const orgId = (vinculo as { org_id?: string } | null)?.org_id ?? null;

  let teto: number | null = 0;
  if (papel) {
    const { data: alc } = await s
      .from("central_alcada").select("teto_valor").eq("papel", papel).limit(1).maybeSingle();
    // ⚠️ `null` em `teto_valor` é SEM TETO, não "zero". São opostos, e confundir
    // os dois faria o titular parecer o papel mais restrito do sistema.
    teto = alc ? ((alc as { teto_valor: number | null }).teto_valor ?? null) : 0;
  }

  let temOutroAprovador = false;
  if (orgId) {
    const { data: outros } = await s
      .from("organization_members").select("user_id,role").eq("org_id", orgId).limit(TETO_LINHAS);
    const APROVAM = new Set(["owner", "admin", "aprovador"]);
    temOutroAprovador = (outros ?? []).some((o) => {
      const m = o as { user_id: string; role: string };
      return m.user_id !== uid && APROVAM.has(m.role);
    });
  }

  return {
    usuarioId: uid, papel, teto,
    podeAprovar: acoes.has("aprovar"),
    podeBaixar: acoes.has("baixar"),
    temOutroAprovador,
  };
}

/**
 * A explicação da ação indisponível — ou `null` quando ela está disponível.
 *
 * ⚠️ **Botão que o usuário não pode usar não fica desabilitado sem dizer por
 * quê.** Um controle cinza é indistinguível de um sistema quebrado; a pessoa
 * tenta, não acontece nada, e conclui que o produto não funciona. Aqui cada
 * impedimento tem uma frase que aponta o que resolve — e as três se resolvem de
 * jeitos DIFERENTES: papel, teto, ou outra pessoa.
 */
export function porQueNaoConfirma(
  t: TituloDaFila, ctx: ContextoCentral,
): string | null {
  if (!ctx.podeAprovar) return `O papel ${ctx.papel ?? "atual"} não confirma títulos — isto se resolve mudando o papel, não a alçada.`;
  if (ctx.teto !== null && Math.abs(t.valor) > ctx.teto) {
    return `Acima do seu teto de ${formatBRL(ctx.teto)} — peça a quem tem alçada maior.`;
  }
  /*
   * ⚠️ R1 depende de `lancado_por`, que é NULL em todo o acervo importado. Onde
   * não há autor, não há autoaprovação a impedir — e a tela diz "origem:
   * importação" em vez de deixar o campo em branco, porque branco lê como
   * defeito e origem declarada é fato.
   */
  if (t.lancadoPor && t.lancadoPor === ctx.usuarioId && ctx.temOutroAprovador) {
    return "Você lançou este título — quem lança não confirma o próprio. Peça a outra pessoa da equipe.";
  }
  return null;
}
