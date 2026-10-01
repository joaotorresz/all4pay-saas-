"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STORE POR ORGANIZAÇÃO — a ponte que tira o dado de negócio do navegador.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ 74 chaves de `localStorage` carregavam ENTIDADES DE NEGÓCIO inteiras:
 * aprovações, orçamento, reembolsos, comprovantes, tarefas de fechamento, taxas
 * de POS, dados da empresa. As consequências não são de conforto:
 *
 *  - trocar de navegador, de máquina ou limpar o cache **perde** tudo;
 *  - dois usuários da mesma empresa **nunca** veem o mesmo estado;
 *  - a trilha de auditoria fica em **zero**, porque nada passa pelo servidor;
 *  - não há backup, restauração nem histórico;
 *  - o teto de ~5 MB já estava perto de 9% com UMA empresa e poucos meses.
 *
 * Este módulo mantém a API SÍNCRONA que as telas já usam (`ler`/`gravar`), com
 * o localStorage como CACHE, e sincroniza com `org_state` (migration 0024) em
 * segundo plano.
 *
 * **Por que cache síncrono e não `await` em toda leitura:** as quinze telas que
 * consomem estes stores leem durante o render. Trocá-las por leitura assíncrona
 * de uma vez seria reescrever todas ao mesmo tempo — e é a mudança que não se
 * consegue revisar. O cache preserva o comportamento; a sincronização resolve o
 * problema.
 *
 * **O que isto NÃO é:** a modelagem final. Uma aprovação merece a sua tabela,
 * com as suas colunas e os seus índices. `org_state` é a ponte que tira o dado
 * do navegador HOJE, sem inventar quinze schemas antes de saber quais campos
 * sobrevivem à primeira semana de uso real.
 */
import { isDemo } from "@/lib/demo";
import { TETO_LINHAS } from "@/lib/supabase/consulta";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/* ========================================================================== */
/* O REGISTRO — o que é dado de NEGÓCIO e o que é preferência do dispositivo    */
/* ========================================================================== */

/**
 * As chaves que carregam **entidade de negócio** e por isso PRECISAM viver no
 * servidor: perdê-las ao trocar de máquina é perder trabalho, e dois usuários
 * da mesma empresa têm de ver a mesma coisa.
 *
 * ⚠️ Esta lista é o mapa da migração, e ela tem par: `PREFERENCIAS_LOCAIS`
 * (ajustes do dispositivo, que ficam) e `PRECISAM_DE_TABELA_PROPRIA` (o que não
 * cabe num key-value). Toda chave usada no código tem de estar em UMA das três
 * — a guarda da matriz cobra isso com teto ZERO. Uma chave nova sem
 * classificação é uma entidade que voltou a morar só no navegador, que foi
 * exatamente como este defeito nasceu.
 */
export const CHAVES_ORG = {
  orcamentos: "a4p_orcamentos",
  aprovacoes: "a4p_aprovacoes",
  reembolsos: "a4p_reembolsos",
  comprovantes: "a4p_comprovantes",
  closeTasks: "a4p_close_tasks",
  posTaxas: "a4p_pos_taxas",
  centralAlcada: "a4p_central_alcada",
  filaImportacao: "a4p_fila_importacao",
  company: "a4p_company",
  planoContas: "a4p_plano_contas",
  contasBancarias: "a4p_contas_bancarias",
  centrosCusto: "a4p_centros_custo",
  projetos: "a4p_projetos",
  contratos: "a4p_contratos",
  recorrencias: "a4p_recorrencias",
  regrasCategorizacao: "a4p_regras_categorizacao",
  regrasConciliacao: "a4p_regras_conciliacao",
  fechamentos: "a4p_fechamentos",
  dashboardsCustom: "a4p_dashboards_custom",
  movimentoProjeto: "a4p_movimento_projeto",
  colaboradores: "a4p_colaboradores",
  folhaTabelas: "a4p_folha_tabelas",
  // — segunda leva: as demais entidades que a varredura encontrou —
  compras: "a4p_compras",
  transferencias: "a4p_transferencias",
  vendasDocs: "a4p_vendas_docs",
  nfse: "a4p_nfse",
  nfsRecebidas: "a4p_nfs_recebidas",
  boletosRecebidos: "a4p_boletos_recebidos",
  linksPagamento: "a4p_links_pagamento",
  impostosConfig: "a4p_impostos_config",
  revrec: "a4p_revrec",
  cronogramas: "a4p_cronogramas",
  ledger: "a4p_ledger",
  periodosTravados: "a4p_locked_periods",
  planoUsos: "a4p_plano_usos",
  partyExtra: "a4p_party_extra",
  produtoExtra: "a4p_produto_extra",
  tags: "a4p_tags",
  assinatura: "a4p_assinatura",
  integracoes: "a4p_integracoes",
  contadorDestinatarios: "a4p_contador_destinatarios",
  contadorExecucoes: "a4p_contador_execucoes",
  exportacoes: "a4p_exportacoes",
  chamados: "a4p_chamados",
  logsAdmin: "a4p_logs_admin",
  // A régua de cobrança: o que já foi enviado a quem, em que etapa. É dado de
  // NEGÓCIO (prova de que o cliente foi avisado antes de um protesto).
  // ⚠️ CONGELADA desde 30/09/2026: o registro mora em `automacao_envios`
  // (migration 20260930190000, que copiou o que havia aqui). Fica listada para
  // o rastro antigo continuar classificado.
  reguaEnvios: "a4p_regua_envios",
  // As automações de e-mail/WhatsApp e o registro dos envios. Em produção moram
  // nas tabelas `automacoes`/`automacao_envios`; a chave local é a casa da
  // DEMONSTRAÇÃO (congeladas em produção — ver CHAVES_CONGELADAS).
  automacoes: "a4p_automacoes",
  automacaoEnvios: "a4p_automacao_envios",
  regrasUso: "a4p_regras_uso",
  fdipMemory: "a4p_fdip_memory",
  iaMemory: "a4p_ia_memory",
  iaConversas: "a4p_ia_conversas",
  ajudaConversa: "a4p_ajuda_conversa",
  acoesIA: "a4p_ai_actions",
  orcamentoSimulador: "a4p_orcamento",
  // CAMP-B · a caixa de entrada de contas a pagar: os documentos lidos por OCR
  // que a pessoa deixou para decidir depois, e a DECISÃO sobre cada documento
  // (virou conta, ou foi descartado com motivo). É dado de NEGÓCIO: o motivo
  // de um descarte é a resposta para "por que este boleto não foi pago?".
  caixaEntrada: "a4p_caixa_entrada",
} as const;

/**
 * ⚠️ CHAVES CONGELADAS — a entidade JÁ TEM TABELA, e a chave é só o rastro.
 *
 * Aprovações e reembolsos moravam nos dois lugares ao mesmo tempo: em live o
 * código lia e escrevia `public.approvals` / `public.reembolsos` **e** a chave
 * continuava indo para `org_state` pelo caminho genérico. Dupla morada é o
 * mesmo defeito das telas duplicadas, agora nos dados — e ele termina do mesmo
 * jeito: dois números com o mesmo rótulo, e quem os compara não tem como saber
 * qual é o certo. Uma aprovação divergente não é um relatório feio; é um
 * pagamento que alguém autoriza duas vezes ou não autoriza nenhuma.
 *
 * A decisão de hoje, escrita: **a TABELA é o caminho único de leitura**, a
 * escrita na chave PARA, e o dado antigo fica onde está. A migração do que já
 * subiu para `org_state` está BLOQUEADA até existir restauração de backup
 * testada e datada — mexer no dado que só tem uma cópia, sem ensaio de volta,
 * é a operação que não se desfaz.
 *
 * Só vale em live: em demonstração não há tabela nenhuma, e o navegador é a
 * casa legítima — congelar ali apagaria a demonstração em vez de proteger dado.
 */
export const CHAVES_CONGELADAS: readonly string[] = [
  "a4p_aprovacoes",
  "a4p_reembolsos",
  // A venda mora em `sales_docs` desde 30/09/2026 (lib/vendas).
  "a4p_vendas_docs",
  // ⚠️ 30/09/2026 (CAD parte 2) — entidades cuja morada em produção é uma
  // TABELA, e que só a demonstração grava no navegador. Sem o congelamento,
  // passar a escrita por `store-org` (para tirar o `localStorage.setItem` cru)
  // as mandaria também para `org_state`: duas moradas para o mesmo fato.
  "a4p_recorrencias",   // recurrences
  "a4p_nfse",           // nfse
  "a4p_ledger",         // journal_entries / journal_lines
  "a4p_revrec",         // revenue_contracts / revenue_schedule
  "a4p_cronogramas",    // schedules
  "a4p_tags",           // movement_tags
  // O projeto do lançamento mora em `movements.project_id`; o mapa antigo do
  // navegador só é LIDO como queda em demonstração (lib/projeto-vinculo).
  "a4p_movimento_projeto",
  // As tarefas do fechamento moram em `close_tasks` (CAMP-A, lib/fechamento-tarefas).
  "a4p_close_tasks",
  // As automações e o registro dos envios moram em `automacoes` e
  // `automacao_envios` desde 30/09/2026 (lib/automacoes). A régua gravava em
  // `a4p_regua_envios`; a migration copiou o que havia para a tabela.
  "a4p_regua_envios",
  "a4p_automacoes",
  "a4p_automacao_envios",
];

export const estaCongelada = (chave: string): boolean => CHAVES_CONGELADAS.includes(chave);

/**
 * ⚠️ Entidades que **não cabem** num key-value e precisam de tabela/bucket
 * próprios. Estão listadas aqui, e não em `CHAVES_ORG`, porque enfiá-las numa
 * coluna `jsonb` trocaria um problema por outro:
 *
 *  - **`a4p_imported_dataset`** — o dataset inteiro de lançamentos. Em live ele
 *    já vai para `movements` (é o caminho certo); no navegador ele existe só
 *    para o modo demonstração. Subir megabytes de lançamentos numa linha só
 *    tornaria toda leitura de estado cara e ainda não daria índice nenhum.
 *  - **`a4p_produto_imagens`** — imagens em base64. Binário pertence a um
 *    bucket de Storage, com URL e cache de CDN; em `jsonb` ele infla cada
 *    leitura do estado da organização.
 *
 * Deixá-las fora é uma DECISÃO registrada, não um esquecimento — e é isso que
 * a guarda cobra.
 */
export const PRECISAM_DE_TABELA_PROPRIA: string[] = [
  "a4p_imported_dataset",
  "a4p_produto_imagens",
];

export const CHAVES_DE_NEGOCIO: string[] = Object.values(CHAVES_ORG);

/**
 * Chaves que **podem** continuar no dispositivo: são preferências de exibição,
 * não dados. Perdê-las ao trocar de navegador custa um reajuste de tela, não
 * trabalho. Listadas explicitamente para que a diferença seja uma DECISÃO e não
 * um esquecimento.
 */
export const PREFERENCIAS_LOCAIS: string[] = [
  "a4p_theme", "a4p_theme_draft", "a4p_modo", "a4p_tipo_conta",
  "a4p_sidebar_width", "a4p_home_widgets", "a4p_home_order", "a4p_home_period",
  "a4p_home_auto", "a4p_atalhos_home", "a4p_fluxo_filtros", "a4p_designlab",
  "a4p_visual_edits", "a4p_guide_welcome", "a4p_tours_auto",
  "a4p_tours_disparados", "a4p_tours_progresso", "a4p_seen_routes",
  "a4p_anuncios_lidos", "a4p_sidebar_collapsed",
  // De qual organização é o cache de negócio deste navegador. É do DISPOSITIVO
  // por definição — subir esta marca ao servidor não diria nada.
  "a4p_org_do_cache",
];

/**
 * ⚠️ O TERCEIRO GRUPO — **cache que precisa expirar**.
 *
 * Nem toda chave local é preferência. Estas duas guardam respostas de API
 * PÚBLICA (Receita/BrasilAPI e IBGE) copiadas para não repetir a consulta. Elas
 * podem ficar no dispositivo — perdê-las custa uma requisição, não trabalho —
 * mas se ficarem para sempre viram lixo que ocupa a cota de 5 MB que os dados
 * de verdade precisam.
 *
 * ⚠️ **Elas já tinham validade e mesmo assim cresciam sem parar**: a leitura
 * ignorava a entrada vencida, o que dá a resposta certa, mas ninguém nunca a
 * REMOVIA — o byte continuava lá. Ignorar não é expirar. `expurgarCaches()`
 * apaga de fato, e roda a cada sessão.
 */
export interface CacheLocal {
  chave: string;
  /** Depois de quantos dias uma entrada deixa de valer. */
  ttlDias: number;
  /** O que se perde ao expurgar — sempre reconstituível, por definição. */
  origem: string;
}

export const CACHES_LOCAIS: CacheLocal[] = [
  { chave: "a4p_cnpj_cache", ttlDias: 60, origem: "consulta de CNPJ (BrasilAPI)" },
  { chave: "a4p_municipios", ttlDias: 90, origem: "lista de municípios (IBGE)" },
];

/**
 * O NOME DE CADA CHAVE, em português.
 *
 * ⚠️ Vive aqui, junto do registro, e não na tela de armazenamento onde nasceu:
 * a trilha de auditoria passou a registrar cada gravação de estado, e um evento
 * que diz `a4p_close_tasks` obriga quem audita a decifrar o identificador. Dois
 * mapas em telas diferentes divergiriam na primeira chave nova.
 */
export const ROTULO_DA_CHAVE: Record<string, string> = {
  a4p_colaboradores: "Colaboradores (folha salarial)",
  a4p_folha_tabelas: "Tabelas legais de INSS e IRRF",
  a4p_central_alcada: "Alçada de aprovação por papel",
  a4p_fila_importacao: "Fila de importação (lote em andamento)",
  a4p_orcamentos: "Orçamentos",
  a4p_aprovacoes: "Solicitações e aprovações",
  a4p_reembolsos: "Reembolsos",
  a4p_comprovantes: "Comprovantes de pagamento",
  a4p_close_tasks: "Tarefas de fechamento mensal",
  a4p_pos_taxas: "Taxas do POS",
  a4p_company: "Dados da empresa",
  a4p_plano_contas: "Plano de contas",
  a4p_contas_bancarias: "Contas bancárias (campos extras)",
  a4p_centros_custo: "Centros de custo",
  a4p_projetos: "Projetos",
  a4p_contratos: "Contratos",
  a4p_recorrencias: "Recorrências e assinaturas",
  a4p_regras_categorizacao: "Regras de categorização",
  a4p_regras_conciliacao: "Regras de conciliação",
  a4p_fechamentos: "Fechamentos assinados",
  a4p_dashboards_custom: "Dashboards personalizados",
  a4p_movimento_projeto: "Vínculo lançamento → projeto",
  a4p_compras: "Compras e pedidos",
  a4p_transferencias: "Transferências entre contas",
  a4p_vendas_docs: "Vendas",
  a4p_nfse: "Notas fiscais de serviço",
  a4p_nfs_recebidas: "NFs recebidas",
  a4p_boletos_recebidos: "Boletos recebidos (DDA)",
  a4p_links_pagamento: "Links de pagamento",
  a4p_impostos_config: "Configuração de impostos",
  a4p_revrec: "Reconhecimento de receita",
  a4p_cronogramas: "Cronogramas",
  a4p_ledger: "Razão contábil",
  a4p_locked_periods: "Períodos travados",
  a4p_plano_usos: "Usos padrão do plano de contas",
  a4p_party_extra: "Campos extras de contatos",
  a4p_produto_extra: "Campos extras de produtos",
  a4p_tags: "Tags",
  a4p_assinatura: "Assinatura do sistema",
  a4p_integracoes: "Integrações",
  a4p_contador_destinatarios: "Destinatários do contador",
  a4p_contador_execucoes: "Envios ao contador",
  a4p_exportacoes: "Relatórios exportados",
  a4p_chamados: "Chamados de suporte",
  a4p_logs_admin: "Logs administrativos",
  a4p_regua_envios: "Envios da régua de cobrança (antigo)",
  a4p_automacoes: "Automações de e-mail e WhatsApp",
  a4p_automacao_envios: "Envios das automações",
  a4p_regras_uso: "Uso das regras de categorização",
  a4p_fdip_memory: "Aprendizado da importação",
  a4p_ia_memory: "Memória do assistente",
  a4p_ia_conversas: "Conversas com a IA",
  a4p_ajuda_conversa: "Conversa da Central de Ajuda",
  a4p_ai_actions: "Ações registradas da IA",
  a4p_orcamento: "Simulador de orçamento",
  a4p_caixa_entrada: "Caixa de entrada de contas a pagar",
  a4p_cnpj_cache: "Cache de consulta de CNPJ",
  a4p_municipios: "Cache de municípios (IBGE)",
};

/** O nome legível de uma chave; a própria chave quando não há nome. */
export const rotuloDaChave = (c: string): string => ROTULO_DA_CHAVE[c] ?? c;

/** Chaves já migradas para o servidor nesta sessão. */
const MIGRADAS = new Set<string>();

type Ouvinte = () => void;
const ouvintes = new Map<string, Set<Ouvinte>>();
/** Estado em memória (a fonte síncrona). */
const memoria = new Map<string, unknown>();
/** Versão conhecida de cada chave — detecta escrita concorrente. */
const versoes = new Map<string, number>();
/** Escritas ainda não confirmadas pelo servidor. */
const pendentesDeEnvio = new Map<string, unknown>();

const remoto = () => !isDemo && SUPA_CONFIGURED;

function avisar(chave: string) {
  ouvintes.get(chave)?.forEach((o) => o());
}

function lerLocal<T>(chave: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const s = localStorage.getItem(chave);
    return s ? (JSON.parse(s) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravarLocal(chave: string, valor: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (e) {
    // ⚠️ QuotaExceeded não pode ser engolido. O teto de 5 MB é real e já estava
    // perto; um `catch {}` aqui faz a gravação falhar em silêncio e a pessoa
    // descobrir dias depois que o orçamento do mês não existe.
    console.error(`[store-org] falha ao gravar "${chave}" no cache local`, e);
    throw new Error(
      "O armazenamento local do navegador está cheio. Os dados foram enviados ao servidor, mas o cache não pôde ser atualizado.",
    );
  }
}

/**
 * PREFERÊNCIA de tela — fica no dispositivo, e é o ÚNICO caminho sancionado
 * para gravar no navegador fora daqui.
 *
 * ⚠️ **Recusa chave de negócio** (`CHAVES_ORG`): gravar uma delas com
 * `localStorage.setItem` cru foi como a configuração de impostos, o perfil da
 * empresa e os projetos deixaram de subir ao servidor — e a hidratação os
 * sobrescrevia com a versão velha na sessão seguinte. Preferência que estoura a
 * cota é descartável (custa um reajuste de tela), por isso a falha é engolida
 * aqui e só aqui.
 */
export function lerPreferencia<T>(chave: string, padrao: T): T {
  return lerLocal(chave, padrao);
}
export function gravarPreferencia<T>(chave: string, valor: T): void {
  if (CHAVES_DE_NEGOCIO.includes(chave)) {
    throw new Error(`"${chave}" é dado de negócio da empresa: grave por store-org (gravar), não como preferência local.`);
  }
  if (typeof window === "undefined") return;
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* preferência é descartável */ }
}

/* ========================================================================== */
/* Leitura                                                                     */
/* ========================================================================== */

/**
 * Leitura SÍNCRONA — memória, senão cache local, senão o padrão.
 * O valor do servidor chega por `hidratar()` e dispara os ouvintes.
 */
export function ler<T>(chave: string, padrao: T): T {
  /*
   * ⚠️ Chave congelada em live devolve o PADRÃO, não a cópia velha do
   * navegador. Um `??` que caísse no localStorage quando a tabela vem vazia
   * seria a dupla morada de volta pela porta dos fundos — e pior, ela só
   * apareceria em quem tem o rastro antigo, que é justamente quem não seria
   * consultado ao testar.
   */
  if (remoto() && estaCongelada(chave)) return padrao;
  if (memoria.has(chave)) return memoria.get(chave) as T;
  const v = lerLocal(chave, padrao);
  memoria.set(chave, v);
  return v;
}

/* ========================================================================== */
/* Escrita                                                                     */
/* ========================================================================== */

/**
 * Escrita: memória + cache local na hora, servidor em seguida.
 *
 * O envio é **best-effort e não bloqueia a tela**, mas a falha NÃO é silenciosa:
 * a chave fica em `pendentesDeEnvio` e `estadoSincronizacao()` a reporta, para
 * a interface poder dizer "não salvo no servidor" em vez de fingir que salvou.
 */
export function gravar<T>(chave: string, valor: T): void {
  // ⚠️ Congelada em live: a tabela é a casa. Escrever aqui recriaria a segunda
  // cópia que esta trava existe para parar — inclusive no servidor, via
  // `org_state`, que é onde ela ficaria mais convincente e mais errada.
  if (remoto() && estaCongelada(chave)) return;
  memoria.set(chave, valor);
  avisar(chave);

  // ⚠️ O SERVIDOR VEM PRIMEIRO. O cache local pode estourar a cota (o teto de
  // 5 MB é real e já estava perto), e `gravarLocal` lança nesse caso. Se o
  // envio viesse depois, o dado que não coube no navegador também nunca subiria
  // — perder-se-ia justamente na situação em que o servidor é a única saída.
  if (remoto()) {
    pendentesDeEnvio.set(chave, valor);
    void enviar(chave, valor);
  }
  gravarLocal(chave, valor);
}

async function enviar(chave: string, valor: unknown): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data, error } = await createClient().rpc("org_state_set", {
      p_chave: chave,
      p_valor: valor as never,
    });
    if (error) throw error;
    if (typeof data === "number") versoes.set(chave, data);
    MIGRADAS.add(chave);
    pendentesDeEnvio.delete(chave);
  } catch (e) {
    console.error(`[store-org] "${chave}" não foi sincronizada com o servidor`, e);
    // Fica em `pendentesDeEnvio` de propósito: é o que permite a tela avisar.
  }
}

/* ========================================================================== */
/* Hidratação                                                                  */
/* ========================================================================== */

/**
 * Traz do servidor as chaves pedidas e atualiza memória + cache.
 *
 * ⚠️ **O servidor vence.** É a decisão que faz o multiusuário funcionar: se o
 * local vencesse, dois usuários da mesma empresa continuariam vendo estados
 * diferentes — cada um com o seu navegador mandando —, que é exatamente o
 * defeito. A exceção é a chave com escrita pendente: essa é trabalho que a
 * pessoa acabou de fazer e ainda não subiu, e sobrescrevê-la seria apagá-lo.
 */
export async function hidratar(chaves: string[]): Promise<number> {
  if (!remoto() || chaves.length === 0) return 0;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data, error } = await createClient()
      .from("org_state")
      .select("chave,valor,versao")
      .in("chave", chaves).limit(TETO_LINHAS);
    if (error) throw error;
    let n = 0;
    for (const linha of (data ?? []) as { chave: string; valor: unknown; versao: number }[]) {
      if (pendentesDeEnvio.has(linha.chave)) continue;
      memoria.set(linha.chave, linha.valor);
      versoes.set(linha.chave, linha.versao);
      MIGRADAS.add(linha.chave);
      try { gravarLocal(linha.chave, linha.valor); } catch { /* cache cheio não impede o uso */ }
      avisar(linha.chave);
      n++;
    }
    return n;
  } catch (e) {
    console.error("[store-org] falha ao hidratar do servidor", e);
    return 0;
  }
}

/**
 * MIGRAÇÃO — sobe para o servidor o que já está no navegador.
 *
 * Roda uma vez por dispositivo, na primeira sessão depois da atualização. Só
 * envia a chave que **existe localmente e ainda não existe no servidor**:
 * sobrescrever o servidor com o local de um segundo dispositivo desfaria o
 * trabalho de quem entrou primeiro.
 */
export async function migrarParaServidor(
  chaves: string[],
  orgConfirmada: string,
): Promise<{ enviadas: number; jaExistiam: number; recusada?: string }> {
  // ⚠️ O destino do envio é `auth_org_id()` — a organização ABERTA —, não a
  // dona do cache. Sem esta conferência, trocar da empresa A para a B subia
  // para a B tudo o que a A tinha no navegador e a B ainda não tinha no
  // servidor (orçamentos, aprovações, o cadastro da empresa…): uma escrita
  // entre empresas feita pelo próprio sistema, sem clique de ninguém.
  if (orgDoCacheLocal() !== orgConfirmada) {
    return { enviadas: 0, jaExistiam: 0, recusada: "o cache deste navegador não é da organização aberta" };
  }
  if (!remoto()) return { enviadas: 0, jaExistiam: 0 };
  const locais = chaves.filter((c) => {
    // A migração é justamente o caminho que subiria o rastro antigo para o
    // servidor. Congelada não sobe: o dado fica parado onde está.
    if (estaCongelada(c)) return false;
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(c) !== null; } catch { return false; }
  });
  if (locais.length === 0) return { enviadas: 0, jaExistiam: 0 };

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("org_state").select("chave").in("chave", locais).limit(TETO_LINHAS);
    const noServidor = new Set(((data ?? []) as { chave: string }[]).map((r) => r.chave));
    let enviadas = 0;
    for (const c of locais) {
      if (noServidor.has(c)) continue;
      const valor = lerLocal<unknown>(c, null);
      if (valor === null) continue;
      await enviar(c, valor);
      enviadas++;
    }
    return { enviadas, jaExistiam: noServidor.size };
  } catch (e) {
    console.error("[store-org] falha na migração inicial", e);
    return { enviadas: 0, jaExistiam: 0 };
  }
}

/* ========================================================================== */
/* DONO DO CACHE — de qual organização é o que está neste navegador            */
/* ========================================================================== */

/**
 * A organização dona do cache de NEGÓCIO deste navegador.
 *
 * ⚠️ **O cache local não sabia de quem era.** As chaves de negócio ficam no
 * `localStorage` com o mesmo nome para toda organização; ao trocar de empresa
 * (seletor, ou outro login na mesma máquina) a página recarregava com o cache
 * da anterior, e a sincronização da sessão fazia DUAS coisas erradas com ele:
 *   1. **subia para a empresa nova** o que ela ainda não tinha no servidor
 *      (`migrarParaServidor` envia para `auth_org_id()`, a organização aberta);
 *   2. as telas que leem síncrono (`ler`, `loadCompany`) mostravam a razão
 *      social, o regime e os orçamentos da empresa anterior dentro da nova.
 * O carimbo do perfil (`StoredCompany.orgId`) protegia UMA leitura; esta marca
 * protege todas as chaves de negócio.
 */
export const CHAVE_ORG_DO_CACHE = "a4p_org_do_cache";

export function orgDoCacheLocal(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(CHAVE_ORG_DO_CACHE); } catch { return null; }
}

function marcarDonoDoCache(orgId: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CHAVE_ORG_DO_CACHE, orgId); } catch { /* sem a marca, a próxima sessão descarta de novo — seguro */ }
}

/**
 * Tira do navegador (e da memória) o cache de negócio que não é da organização
 * aberta. As chaves CONGELADAS ficam: elas não sobem sozinhas nem são lidas por
 * `ler` em produção — o resgate delas é um clique de gente, na tela que as
 * mostra.
 */
export function descartarCacheDeNegocio(chaves: string[] = CHAVES_DE_NEGOCIO): number {
  let n = 0;
  for (const c of chaves) {
    if (estaCongelada(c)) continue;
    let tinha = memoria.has(c);
    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem(c) !== null) tinha = true;
        localStorage.removeItem(c);
      } catch { /* sem acesso ao disco: a memória ainda é limpa */ }
    }
    memoria.delete(c); versoes.delete(c); MIGRADAS.delete(c); pendentesDeEnvio.delete(c);
    if (tinha) { n++; avisar(c); }
  }
  return n;
}

export type DonoDoCache = "mesma" | "trocou" | "sem-dono" | "desconhecida";

/**
 * Confere o cache contra a organização aberta ANTES de qualquer envio.
 *
 *  · `desconhecida` — não se sabe qual empresa está aberta: nada é enviado e
 *    nada é apagado (a hidratação, que só traz do servidor, segue).
 *  · `mesma` — o cache é desta empresa: envio e hidratação como sempre.
 *  · `trocou` — o cache é de OUTRA empresa: é descartado (o que ela já tinha
 *    confirmado continua no servidor dela) e nada sobe.
 *  · `sem-dono` — cache anterior a esta marca: não dá para provar de quem é, e
 *    é tratado como o de outra empresa (a mesma decisão do perfil: cache sem
 *    carimbo é ausente). O que esta empresa tem no servidor volta na hidratação.
 */
export function reconciliarDonoDoCache(orgAtiva: string | null): { dono: DonoDoCache; descartadas: number } {
  if (!orgAtiva) return { dono: "desconhecida", descartadas: 0 };
  const marca = orgDoCacheLocal();
  if (marca === orgAtiva) return { dono: "mesma", descartadas: 0 };
  const descartadas = descartarCacheDeNegocio();
  marcarDonoDoCache(orgAtiva);
  return { dono: marca ? "trocou" : "sem-dono", descartadas };
}

/** A organização aberta agora (a mesma de `auth_org_id()`), lida do servidor. */
export async function organizacaoAtivaDoServidor(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/client");
  const { data, error } = await createClient().rpc("minhas_organizacoes");
  if (error) throw error;
  const ativa = ((data ?? []) as { org_id: string; ativa: boolean }[]).find((o) => o.ativa);
  return ativa?.org_id ?? null;
}

/**
 * A sincronização inteira da sessão, na ordem que a torna segura:
 * descobrir a empresa aberta → conferir o dono do cache → enviar (só se o
 * cache é dela) → hidratar.
 */
export async function sincronizarComServidor(chaves: string[] = CHAVES_DE_NEGOCIO): Promise<{
  dono: DonoDoCache; descartadas: number; enviadas: number; hidratadas: number;
}> {
  if (!remoto()) return { dono: "desconhecida", descartadas: 0, enviadas: 0, hidratadas: 0 };
  let orgAtiva: string | null = null;
  try { orgAtiva = await organizacaoAtivaDoServidor(); }
  catch (e) { console.error("[store-org] não foi possível saber a organização aberta; nada do navegador sobe", e); }
  const { dono, descartadas } = reconciliarDonoDoCache(orgAtiva);
  const enviadas = dono === "mesma" && orgAtiva ? (await migrarParaServidor(chaves, orgAtiva)).enviadas : 0;
  const hidratadas = await hidratar(chaves);
  return { dono, descartadas, enviadas, hidratadas };
}

/* ========================================================================== */
/* CACHE — o que fica, mas vence                                               */
/* ========================================================================== */

/**
 * Apaga as entradas VENCIDAS dos caches locais e devolve quantos bytes voltaram.
 *
 * ⚠️ Os dois caches guardam `{ [id]: { t: <ms>, … } }` — um carimbo por entrada.
 * A leitura já respeitava a validade (entrada velha era ignorada e reconsultada),
 * mas nada removia o registro: um extrato com 300 fornecedores deixava 300
 * entradas para sempre. Expurgar por ENTRADA, e não a chave inteira, preserva o
 * que ainda vale — jogar tudo fora faria a próxima importação reconsultar
 * centenas de CNPJs que continuavam bons.
 */
export function expurgarCaches(agora = Date.now()): { removidas: number; bytesLiberados: number } {
  if (typeof window === "undefined") return { removidas: 0, bytesLiberados: 0 };
  let removidas = 0, bytesLiberados = 0;
  for (const { chave, ttlDias } of CACHES_LOCAIS) {
    let bruto: string | null = null;
    try { bruto = localStorage.getItem(chave); } catch { continue; }
    if (!bruto) continue;
    let mapa: Record<string, { t?: number }>;
    try { mapa = JSON.parse(bruto) as Record<string, { t?: number }>; } catch { continue; }
    if (!mapa || typeof mapa !== "object") continue;

    const limite = agora - ttlDias * 24 * 3600 * 1000;
    const vivo: Record<string, unknown> = {};
    let caiu = 0;
    for (const [id, entrada] of Object.entries(mapa)) {
      // Entrada sem carimbo não tem como ser datada: some, porque mantê-la
      // eternamente é o mesmo defeito com outra roupa.
      if (typeof entrada?.t === "number" && entrada.t >= limite) vivo[id] = entrada;
      else caiu++;
    }
    if (caiu === 0) continue;
    const novo = JSON.stringify(vivo);
    try {
      if (Object.keys(vivo).length === 0) localStorage.removeItem(chave);
      else localStorage.setItem(chave, novo);
      removidas += caiu;
      bytesLiberados += bruto.length - (Object.keys(vivo).length ? novo.length : 0);
    } catch { /* cota/erro: o cache velho é o menor dos problemas */ }
  }
  return { removidas, bytesLiberados };
}

/* ========================================================================== */
/* BACKUP E RESTAURAÇÃO                                                        */
/* ========================================================================== */

/**
 * O identificador do arquivo de backup. Mudou com a marca (Quattro); o antigo
 * continua ACEITO na restauração — um backup baixado antes da troca de nome é
 * trabalho do cliente, e recusá-lo por causa do rótulo seria perda de dado.
 */
export const FORMATO_BACKUP = "quattro/estado-da-organizacao" as const;
const FORMATOS_ACEITOS: readonly string[] = [FORMATO_BACKUP, "all4pay/estado-da-organizacao"];

export interface Backup {
  formato: typeof FORMATO_BACKUP | "all4pay/estado-da-organizacao";
  versao: 1;
  geradoEm: string;
  /** Só dado de NEGÓCIO — preferência e cache não entram em backup. */
  chaves: Record<string, unknown>;
}

/**
 * Exporta o estado de negócio como um objeto restaurável.
 *
 * ⚠️ Preferência e cache ficam **de fora de propósito**. Um backup existe para
 * devolver o TRABALHO; restaurar tema e largura de menu junto sobrescreveria os
 * ajustes da máquina onde a restauração acontece, e restaurar cache reintroduz
 * dados vencidos que a rede reconstitui de graça.
 */
export function exportarEstado(): Backup {
  const chaves: Record<string, unknown> = {};
  for (const c of CHAVES_DE_NEGOCIO) {
    const v = memoria.has(c) ? memoria.get(c) : lerLocal<unknown>(c, null);
    if (v !== null && v !== undefined) chaves[c] = v;
  }
  return {
    formato: FORMATO_BACKUP,
    versao: 1,
    geradoEm: new Date().toISOString(),
    chaves,
  };
}

export function backupValido(b: unknown): b is Backup {
  const x = b as Partial<Backup> | null;
  return !!x && FORMATOS_ACEITOS.includes(String(x.formato)) && x.versao === 1
    && !!x.chaves && typeof x.chaves === "object";
}

/**
 * Restaura um backup. Devolve o que entrou e **quanto tempo levou** — é o
 * "tempo de recuperação medido" que a política de backup exige; sem medir, a
 * promessa de restauração é palavra.
 *
 * ⚠️ Restaurar SOBRESCREVE, e por isso é a tela que confirma, não esta função.
 * Chave que não é dado de negócio é RECUSADA mesmo que venha no arquivo: um
 * backup adulterado não pode virar caminho para escrever qualquer coisa no
 * estado da organização.
 */
export async function importarEstado(b: Backup): Promise<{ restauradas: number; recusadas: string[]; ms: number }> {
  const t0 = Date.now();
  const permitidas = new Set(CHAVES_DE_NEGOCIO);
  const recusadas: string[] = [];
  let restauradas = 0;
  for (const [chave, valor] of Object.entries(b.chaves)) {
    if (!permitidas.has(chave)) { recusadas.push(chave); continue; }
    /*
     * ⚠️ Congelada também é RECUSADA na restauração — e este é o caso menos
     * óbvio dos dois. Um backup antigo carrega a chave, e restaurá-lo
     * recriaria a segunda morada exatamente no momento em que ninguém está
     * olhando para ela: quem restaura está resolvendo outro problema. A
     * aprovação e o reembolso voltam pela tabela, que é onde eles moram.
     */
    if (remoto() && estaCongelada(chave)) { recusadas.push(chave); continue; }
    memoria.set(chave, valor);
    avisar(chave);
    if (remoto()) { pendentesDeEnvio.set(chave, valor); await enviar(chave, valor); }
    try { gravarLocal(chave, valor); } catch { /* servidor já recebeu */ }
    restauradas++;
  }
  return { restauradas, recusadas, ms: Date.now() - t0 };
}

/* ========================================================================== */
/* ENXUGAR — o alvo de menos de 50 KB locais                                   */
/* ========================================================================== */

/**
 * Remove do `localStorage` as cópias de dado de negócio **já confirmadas no
 * servidor**, mantendo o valor em memória para a sessão continuar síncrona.
 *
 * ⚠️ A trava é `MIGRADAS`: só sai do disco o que o servidor confirmou nesta
 * sessão (envio aceito ou hidratação bem-sucedida). Apagar antes disso trocaria
 * o problema "o dado só existe no navegador" por outro pior — "o dado não existe
 * em lugar nenhum".
 *
 * O custo real: recarregar a página offline abre sem esses dados até a
 * hidratação responder. É o preço de tirar o negócio do disco do navegador, e é
 * menor que o de perdê-lo ao limpar o cache.
 */
export function enxugarLocal(): { removidas: number; bytesLiberados: number } {
  if (typeof window === "undefined" || !remoto()) return { removidas: 0, bytesLiberados: 0 };
  let removidas = 0, bytesLiberados = 0;
  for (const c of CHAVES_DE_NEGOCIO) {
    if (!MIGRADAS.has(c) || pendentesDeEnvio.has(c)) continue;
    try {
      const s = localStorage.getItem(c);
      if (s === null) continue;
      if (!memoria.has(c)) memoria.set(c, JSON.parse(s));
      localStorage.removeItem(c);
      removidas++;
      bytesLiberados += c.length + s.length;
    } catch { /* segue: chave ilegível não vale um throw */ }
  }
  return { removidas, bytesLiberados };
}

/* ========================================================================== */
/* Diagnóstico                                                                 */
/* ========================================================================== */

export interface EstadoSincronizacao {
  /** `true` quando há servidor para sincronizar (live). */
  ativo: boolean;
  /** Chaves confirmadas no servidor nesta sessão. */
  sincronizadas: string[];
  /** Chaves gravadas localmente que o servidor ainda não confirmou. */
  pendentes: string[];
  /** Bytes ocupados no localStorage por chaves `a4p_*`. */
  bytesLocais: number;
  /** Fração do teto típico de 5 MB. */
  pctTeto: number;
  /** Chaves de NEGÓCIO ainda só no navegador — o que falta migrar. */
  negocioLocal: { chave: string; bytes: number }[];
  /** Cache local (expira) — bytes que a rede reconstitui de graça. */
  caches: { chave: string; bytes: number }[];
  /** Bytes de negócio ainda no disco — o número que a meta de 50 KB persegue. */
  bytesDeNegocio: number;
  /** `true` quando o disco local já é só preferência + cache (a meta). */
  dentroDaMeta: boolean;
  /** Chaves que não estão em nenhuma das listas — decisão pendente. */
  naoClassificadas: { chave: string; bytes: number }[];
}

const TETO_LOCALSTORAGE = 5 * 1024 * 1024;
/**
 * A meta da ONDA 8: **menos de 50 KB locais**. Não é um número estético — é o
 * tamanho que sobra quando o disco do navegador guarda só preferência de tela e
 * cache descartável, ou seja, quando nenhum dado de negócio depende dele.
 */
export const META_BYTES_LOCAIS = 50 * 1024;

export function estadoSincronizacao(): EstadoSincronizacao {
  let bytes = 0;
  const presentes: { chave: string; bytes: number }[] = [];
  if (typeof window !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("a4p_")) continue;
        const n = k.length + (localStorage.getItem(k)?.length ?? 0);
        bytes += n;
        presentes.push({ chave: k, bytes: n });
      }
    } catch { /* ignore */ }
  }
  const negocio = new Set(CHAVES_DE_NEGOCIO);
  const prefs = new Set(PREFERENCIAS_LOCAIS);
  const caches = new Set(CACHES_LOCAIS.map((c) => c.chave));
  const semTabelaPropria = new Set(PRECISAM_DE_TABELA_PROPRIA);
  const bytesDeNegocio = presentes
    .filter((p) => negocio.has(p.chave))
    .reduce((s, p) => s + p.bytes, 0);
  return {
    ativo: remoto(),
    sincronizadas: Array.from(MIGRADAS).sort(),
    pendentes: Array.from(pendentesDeEnvio.keys()).sort(),
    bytesLocais: bytes,
    pctTeto: Math.round((bytes / TETO_LOCALSTORAGE) * 1000) / 10,
    // ⚠️ O que interessa ao diagnóstico: as chaves de NEGÓCIO que estão no
    // navegador e ainda NÃO subiram. Deixar isso invisível é o que fazia a
    // limitação passar por funcionalidade.
    negocioLocal: presentes
      .filter((p) => negocio.has(p.chave) && !MIGRADAS.has(p.chave))
      .sort((a, b) => b.bytes - a.bytes),
    caches: presentes.filter((p) => caches.has(p.chave)).sort((a, b) => b.bytes - a.bytes),
    bytesDeNegocio,
    dentroDaMeta: bytesDeNegocio === 0 && bytes < META_BYTES_LOCAIS,
    naoClassificadas: presentes
      .filter((p) => !negocio.has(p.chave) && !prefs.has(p.chave)
        && !caches.has(p.chave) && !semTabelaPropria.has(p.chave))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

/* ========================================================================== */
/* Reatividade                                                                 */
/* ========================================================================== */

export function inscrever(chave: string, o: Ouvinte): () => void {
  const set = ouvintes.get(chave) ?? new Set<Ouvinte>();
  set.add(o);
  ouvintes.set(chave, set);
  return () => { set.delete(o); };
}

/** Esquece o cache de memória — usado ao trocar de organização. */
export function limparCache(): void {
  memoria.clear();
  versoes.clear();
  pendentesDeEnvio.clear();
  MIGRADAS.clear();
}
