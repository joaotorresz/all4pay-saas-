"use client";

/**
 * Acessores da camada de segurança — tudo que o SERVIDOR responde sobre
 * isolamento, papéis e acesso administrativo.
 *
 * ⚠️ Em demonstração não há servidor, e por isso não há o que provar: as
 * funções devolvem um retrato coerente e **dizem que é demonstração**. Um teste
 * de isolamento que responde "tudo certo" sem ter consultado banco nenhum é
 * pior que não ter teste — ele produz a confiança sem o fato.
 */
import { isDemo } from "@/lib/demo";
import type {
  LinhaIsolamento, LinhaAuditoriaRLS, AdminRevisao, Papel, TentativaIsolamento,
} from "@/core/seguranca";
import { MATRIZ_DEMO, COMANDOS, type Comando } from "@/core/seguranca";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
export const semServidor = () => isDemo || !SUPA_CONFIGURED;

async function cliente() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

/* ========================================================================== */
/* ORGANIZAÇÃO ATIVA                                                          */
/* ========================================================================== */

export interface OrganizacaoDoUsuario {
  orgId: string;
  nome: string;
  papel: Papel;
  ativa: boolean;
  desde: string;
}

export async function listarMinhasOrganizacoes(): Promise<OrganizacaoDoUsuario[]> {
  if (semServidor()) {
    return [{ orgId: "demo", nome: "Empresa de demonstração", papel: "owner", ativa: true, desde: "2026-01-01" }];
  }
  const { data, error } = await (await cliente()).rpc("minhas_organizacoes");
  if (error || !data) return [];
  return (data as { org_id: string; nome: string; papel: string; ativa: boolean; desde: string }[])
    .map((o) => ({ orgId: o.org_id, nome: o.nome, papel: o.papel as Papel, ativa: o.ativa, desde: o.desde }));
}

/**
 * Troca a organização ativa.
 *
 * ⚠️ Quem valida o vínculo é a função no banco; aqui só sobrou recarregar a
 * página. E recarregar é DELIBERADO: metade da tela está em cache do React
 * Query com dados da empresa anterior, e uma troca parcial mostraria o saldo de
 * uma empresa ao lado dos clientes de outra — que é a aparência exata de um
 * vazamento, mesmo sem haver um.
 */
export async function trocarOrganizacao(orgId: string): Promise<void> {
  if (semServidor()) return;
  const { error } = await (await cliente()).rpc("trocar_organizacao", { p_org: orgId });
  if (error) throw new Error(error.message);
  if (typeof window !== "undefined") window.location.reload();
}

/* ========================================================================== */
/* PERMISSÕES                                                                  */
/* ========================================================================== */

export interface MinhasPermissoes {
  papel: Papel | null;
  acoes: string[];
  /** `true` quando a lista veio de um palpite local (demonstração). */
  presumido: boolean;
}

export async function carregarPermissoes(): Promise<MinhasPermissoes> {
  if (semServidor()) {
    return { papel: "owner", acoes: [...MATRIZ_DEMO.owner], presumido: true };
  }
  const { data, error } = await (await cliente()).rpc("minhas_permissoes");
  if (error || !data) {
    // ⚠️ Falha de rede vira NENHUMA permissão, nunca todas. Presumir acesso num
    // erro é liberar o produto inteiro em toda instabilidade — a mesma decisão
    // que o gating de plano já tomou no middleware.
    return { papel: null, acoes: [], presumido: false };
  }
  const linhas = data as { acao: string; papel: string }[];
  return {
    papel: (linhas[0]?.papel as Papel) ?? null,
    acoes: linhas.map((l) => l.acao),
    presumido: false,
  };
}

/* ========================================================================== */
/* ISOLAMENTO E AUDITORIA                                                      */
/* ========================================================================== */

/**
 * Roda o teste de leitura cruzada.
 *
 * ⚠️ `registrar` decide QUAL das duas funções do banco é chamada, e a diferença
 * é deliberada: a abertura da tela usa a versão que só lê, e o clique em
 * "Testar agora" usa a que grava o resultado na trilha. Registrar a cada
 * montagem encheria a trilha de eventos que ninguém pediu, e uma trilha cheia
 * de ruído é uma trilha que não se lê — mas a verificação que alguém pediu
 * precisa ficar registrada, senão "foi conferido" é memória de quem conferiu.
 */
export async function rodarTesteIsolamento(registrar = false): Promise<LinhaIsolamento[] | null> {
  // `null` = não foi possível TESTAR. A tela precisa dizer isso, e não "passou".
  if (semServidor()) return null;
  const { data, error } = await (await cliente())
    .rpc(registrar ? "verificar_isolamento" : "teste_isolamento");
  if (error || !data) return null;
  return (data as { tabela: string; linhas_de_outra_org: number; visiveis: number }[])
    .map((l) => ({
      tabela: l.tabela,
      linhasDeOutraOrg: Number(l.linhas_de_outra_org),
      visiveis: Number(l.visiveis),
    }));
}

/**
 * O teste POR VERBO — o que a tela usa a partir da ONDA 2.
 *
 * ⚠️ Ele não substitui `rodarTesteIsolamento` por gosto: o antigo respondia
 * "quantas linhas de outra empresa eu enxergo", que é UM verbo. Este tenta
 * ler, agregar, inserir, atualizar e apagar contra a empresa alheia, cada
 * tentativa numa subtransação que é desfeita — e devolve o resultado por
 * TABELA e por VERBO, porque "vazou" sem dizer onde e como não dá para
 * consertar.
 *
 * ⚠️ Devolver `null` continua significando **não foi possível testar**, nunca
 * "passou". Foi a única coisa que o desenho anterior acertou, e é ela que
 * impede um erro de rede de virar selo de aprovação.
 */
export async function rodarIsolamentoCompleto(
  registrar = false,
): Promise<TentativaIsolamento[] | null> {
  if (semServidor()) return null;
  const { data, error } = await (await cliente())
    .rpc(registrar ? "verificar_isolamento_completo" : "teste_isolamento_completo");
  if (error || !data) return null;
  return (data as Record<string, unknown>[]).map((l) => ({
    tabela: String(l.tabela),
    verbo: String(l.verbo),
    resultado: String(l.resultado),
    vazou: !!l.vazou,
    detalhe: String(l.detalhe ?? ""),
  }));
}

export async function auditoriaRLS(): Promise<LinhaAuditoriaRLS[] | null> {
  if (semServidor()) return null;
  const { data, error } = await (await cliente()).rpc("rls_auditoria");
  if (error || !data) return null;
  return (data as Record<string, unknown>[]).map((l) => {
    // ⚠️ `comandos` e `privilegios` chegam como jsonb e podem faltar enquanto o
    // banco novo não estiver aplicado. O padrão então é o que NÃO acusa nada —
    // um erro de leitura não pode nascer como achado Alto.
    const cmds = (l.comandos ?? {}) as Record<string, string>;
    const privs = (l.privilegios ?? {}) as Record<string, boolean>;
    const porComando = Object.fromEntries(
      COMANDOS.map((c) => [c, cmds[c] ?? "nenhuma"]),
    ) as Record<Comando, string>;
    const porPrivilegio = Object.fromEntries(
      COMANDOS.map((c) => [c, privs[c] ?? false]),
    ) as Record<Comando, boolean>;
    return {
      tabela: String(l.tabela),
      rlsLigada: !!l.rls_ligada,
      politicas: Number(l.politicas ?? 0),
      temOrgId: !!l.tem_org_id,
      politicaPorOrg: !!l.politica_por_org,
      recorte: String(l.recorte ?? "—"),
      comandos: porComando,
      privilegios: porPrivilegio,
      alcancaAnonimo: !!l.alcanca_anonimo,
      anonPodeTruncar: !!l.anon_pode_truncar,
    };
  });
}

/* ========================================================================== */
/* ACESSO ADMINISTRATIVO                                                       */
/* ========================================================================== */

export interface VeredictoAdmin {
  permitido: boolean;
  motivo: string | null;
  exigeMfa: boolean;
  fatores: number;
  mfaPrazo: string | null;
  expiraEm: string | null;
}

/**
 * Pergunta ao servidor se este acesso administrativo é permitido — e **deixa o
 * registro**, mesmo quando a resposta é não.
 *
 * ⚠️ É por isto que ela existe separada do portão: o portão levanta exceção, e
 * uma exceção desfaz a transação inteira, inclusive o registro da negativa.
 * Esta função nunca levanta, então o registro dela sempre é gravado.
 */
export async function adminPosso(funcao: string, alvo?: string): Promise<VeredictoAdmin> {
  if (semServidor()) {
    return { permitido: true, motivo: null, exigeMfa: false, fatores: 0, mfaPrazo: null, expiraEm: null };
  }
  const { data, error } = await (await cliente()).rpc("admin_posso", { p_funcao: funcao, p_alvo: alvo ?? null });
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (error || !l) {
    return { permitido: false, motivo: error?.message ?? "sem resposta do servidor", exigeMfa: false, fatores: 0, mfaPrazo: null, expiraEm: null };
  }
  return {
    permitido: !!l.permitido,
    motivo: (l.motivo as string) ?? null,
    exigeMfa: !!l.exige_mfa,
    fatores: Number(l.fatores ?? 0),
    mfaPrazo: (l.mfa_prazo as string) ?? null,
    expiraEm: (l.expira_em as string) ?? null,
  };
}

export async function listarRevisaoAdmin(): Promise<AdminRevisao[] | null> {
  if (semServidor()) return null;
  const { data, error } = await (await cliente()).rpc("admin_revisao");
  if (error || !data) return null;
  return (data as Record<string, unknown>[]).map((l) => ({
    userId: String(l.user_id),
    email: (l.email as string) ?? null,
    motivo: (l.motivo as string) ?? null,
    expiraEm: (l.expira_em as string) ?? null,
    revisadoEm: (l.revisado_em as string) ?? null,
    exigeMfa: !!l.exige_mfa,
    fatoresMfa: Number(l.fatores_mfa ?? 0),
    mfaPrazo: (l.mfa_prazo as string) ?? null,
    acessos30d: Number(l.acessos_30d ?? 0),
    negados30d: Number(l.negados_30d ?? 0),
    ultimoAcesso: (l.ultimo_acesso as string) ?? null,
    pendente: !!l.pendente,
  }));
}

export interface AcessoAdmin {
  quando: string; email: string | null; funcao: string; alvo: string | null;
  aal: string | null; permitido: boolean; motivo: string | null;
}

export async function listarAcessosAdmin(dias = 30): Promise<AcessoAdmin[] | null> {
  if (semServidor()) return null;
  const { data, error } = await (await cliente()).rpc("admin_acessos_recentes", { p_dias: dias });
  if (error || !data) return null;
  return (data as Record<string, unknown>[]).map((l) => ({
    quando: String(l.quando),
    email: (l.email as string) ?? null,
    funcao: String(l.funcao),
    alvo: (l.alvo as string) ?? null,
    aal: (l.aal as string) ?? null,
    permitido: !!l.permitido,
    motivo: (l.motivo as string) ?? null,
  }));
}

export async function revisarAdmin(userId: string, meses = 6): Promise<void> {
  if (semServidor()) return;
  const { error } = await (await cliente()).rpc("admin_revisar", { p_user: userId, p_meses: meses });
  if (error) throw new Error(error.message);
}
