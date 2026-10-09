"use client";

/**
 * Área da plataforma (dono do SaaS) — cinco seções, uma página cada
 * (`SECOES_ADMIN`): Visão geral · Clientes e planos · Cobrança · Acessos ·
 * Suporte. Moldura própria (`AdminShell`), nunca a do cliente.
 *
 * ⚠️ O painel era UMA página de 682 linhas com tudo empilhado. A separação
 * não reescreveu nenhum cartão nem acrescentou consulta: cada seção monta os
 * MESMOS cartões, e as consultas repetidas entre seções saem do cache do
 * React Query pela mesma chave. Acesso gateado por `isPlatformAdmin` aqui
 * (apresentação) — quem tranca é o middleware, o layout e o banco.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, BRL, Icon, Select, StatusBadge, Skeleton, InfoHint, Input, Button, type InfoConteudo, PontoStatus } from "@/components/ui";
import { AdminShell } from "@/components/admin/AdminShell";
import { formatBRL, formatBRLCompact, pct } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { reconciliarBilling, type AlertaBilling, type TipoAlerta } from "@/core/billing";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { useToast } from "@/components/listas/ListChrome";
import {
  isPlatformAdmin, getAdminOverview, getAdminOrgs, getAdminUsers, getAdminPlans, setSubscription,
  getAdminGrowth, getAdminOrgDetail, getMrrHistory, getAuditLog, impersonar, getAdminUserDetail,
  getPinbankAdmin, vincularPinbank, desvincularPinbank, type PinbankVinculoAdmin, type PinbankQuarentena,
  type SubStatus, type AdminPlan, type UserDetalhe, type AdminOrg,
} from "@/lib/admin";

/*
 * ⚠️ **"Sem assinatura" precisou de linha PRÓPRIA.** A lista não tinha o estado
 * de ausência, e o `statusMeta` caía em `STATUS[1]` — "Trial". Somado ao
 * `coalesce(s.status,'trial')` da RPC, o painel afirmava DUAS vezes que havia
 * um teste em curso em 14 organizações que não tinham relação comercial
 * nenhuma. Ausência tem de aparecer como ausência (ONDA 4).
 */
const STATUS: { value: SubStatus; label: string; tone: "positive" | "warning" | "neutral" }[] = [
  { value: "active", label: "Ativa", tone: "positive" },
  { value: "trial", label: "Trial", tone: "neutral" },
  { value: "past_due", label: "Inadimplente", tone: "warning" },
  { value: "canceled", label: "Cancelada", tone: "neutral" },
  { value: "none", label: "Sem assinatura", tone: "warning" },
];
const statusMeta = (s: SubStatus) => STATUS.find((x) => x.value === s) ?? STATUS[4];
/*
 * ⚠️ **"Sem assinatura" é ESTADO OBSERVADO, não estado ESCOLHÍVEL.** Ele existe
 * para a tela nomear a ausência; oferecê-lo no seletor deixaria o administrador
 * gravar `none`, que o banco recusa (`subscriptions_status_check` só aceita
 * trial/active/past_due/canceled). Um seletor que oferece opção que o banco
 * rejeita é um erro esperando o clique.
 */
const STATUS_ESCOLHIVEIS = STATUS.filter((s) => s.value !== "none");
const fmtDia = (iso: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y.slice(2)}`; };
const ativoUsuario = (iso: string | null) => !!iso && Date.now() - Date.parse(iso) < 30 * 86400000;

/**
 * As ferramentas que respondem pela PLATAFORMA, não pela empresa do cliente.
 *
 * ⚠️ O inventário de rotas saiu do menu de Configurações — ele lista as 73
 * rotas do produto com dono e status, e isso é conteúdo de quem MANTÉM o
 * sistema, não de quem o usa. Mas "sair do menu" não pode virar "sumir": sem
 * uma porta aqui, a tela ficaria acessível só para quem decorou a URL, que é
 * a definição de tela órfã.
 */
/* ═══════════════════════════════════════════════════════════════════════════
 * RECONCILIAÇÃO BILLING × USO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O painel dizia MRR e contava assinaturas; nenhuma tela cruzava cobrança
 * com USO.** Medido em 18/08: 1.402 dos 1.415 lançamentos de produção (99,1%)
 * estavam em organizações que não pagavam nada, e a única que pagava R$990/mês
 * tinha ZERO lançamentos. Os dois fatos estavam nos dados desde sempre, cada um
 * numa coluna diferente da mesma tabela, e ninguém os leu juntos.
 *
 * ⚠️ **Os três alertas ficam SEPARADOS de propósito**, porque mandam fazer
 * coisas opostas: usa-e-não-paga é receita vazando; paga-e-não-usa é cliente
 * prestes a cancelar (ligue ANTES); acima-do-teto é conversa de upgrade, nunca
 * corte. Um contador único "7 alertas" apagaria exatamente o que decide a ação.
 */
const ROTULO_ALERTA: Record<TipoAlerta, string> = {
  usa_sem_plano: "Usa e não paga",
  paga_sem_uso: "Paga e não usa",
  acima_do_limite: "Uso acima do plano",
};
const TOM_ALERTA: Record<TipoAlerta, string> = {
  usa_sem_plano: "var(--color-warning)",
  paga_sem_uso: "var(--color-warning)",
  acima_do_limite: "var(--color-positive)",
};

function ReconciliacaoBilling({ orgs, carregando }: { orgs: AdminOrg[]; carregando: boolean }) {
  const hoje = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const alertas = React.useMemo(
    () => reconciliarBilling(
      orgs.map((o) => ({
        orgId: o.orgId, nome: o.nome, status: o.status, plano: o.plano === "—" ? null : o.plano,
        mrr: o.mrr, fim: o.expira, lancamentos: o.movimentos, ultimoLancamento: o.ultimoMov,
        limiteLancamentos: o.limiteLancamentos,
      })),
      hoje,
    ),
    [orgs, hoje],
  );

  if (carregando) return <Card><Skeleton className="h-24 w-full" /></Card>;

  const porTipo = (t: TipoAlerta) => alertas.filter((a) => a.tipo === t);

  return (
    <Card
      className="flex flex-col gap-4"
      info={{
        titulo: "Cobrança × uso",
        oQue: "Cruza quem paga com quem usa, e acende as três divergências que custam dinheiro.",
        comoCalcula: "Usa e não paga: tem lançamento, não tem assinatura ativa e não está em teste. Paga e não usa: assinatura ativa com mais de 30 dias sem nenhum lançamento. Acima do plano: lançamentos além do teto que o plano declara.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-label font-medium text-muted">Cobrança × uso</span>
        {/* ⚠️ "Nada a reconciliar" é resposta, não tela vazia. */}
        {alertas.length === 0 && (
          <span className="text-caption text-faint">Nada a reconciliar — cobrança e uso batem.</span>
        )}
      </div>

      {(["usa_sem_plano", "paga_sem_uso", "acima_do_limite"] as TipoAlerta[]).map((t) => {
        const linhas = porTipo(t);
        if (linhas.length === 0) return null;
        return (
          <div key={t} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-[6px] h-[6px] rounded-pill" style={{ background: TOM_ALERTA[t] }} aria-hidden />
              <span className="text-[15px] text-ink">{ROTULO_ALERTA[t]}</span>
              <span className="text-caption text-faint tabular-nums">{linhas.length}</span>
            </div>
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {linhas.map((a: AlertaBilling) => (
                <li key={`${a.tipo}-${a.orgId}`} className="flex flex-col sm:flex-row sm:items-baseline gap-x-2 border-b border-border-soft last:border-0 pb-2 last:pb-0">
                  <span className="text-caption text-ink min-w-[180px]">{a.nome}</span>
                  <span className="text-caption text-muted flex-1">{a.detalhe}</span>
                  <span className="text-caption text-faint">{a.acao}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

function FerramentasInternas() {
  return (
    <Card>
      <h2 className="text-h3 m-0">Ferramentas internas</h2>
      <p className="m-0 mt-1 text-caption text-muted">
        Respondem pela plataforma — não aparecem no menu do cliente.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/dashboard/administration/routes"
          className="inline-flex items-center gap-2 rounded-pill bg-surface-2 hover:bg-surface-3 transition-colors px-4 h-9 text-[14px] text-ink"
        >
          <Icon name="network" size={15} color="var(--color-text-secondary)" />
          Inventário de rotas
        </Link>
      </div>
    </Card>
  );
}


export type SecaoPainel = "visao-geral" | "clientes" | "cobranca" | "acessos" | "suporte";

/**
 * A porta do cliente: confirma o papel antes de montar qualquer seção.
 * (Apresentação — o 403 do middleware e o layout no servidor já recusaram
 * quem não é o dono; isto cobre a demonstração e a corrida do primeiro render.)
 */
export function AdminView({ secao = "visao-geral" }: { secao?: SecaoPainel }) {
  const adm = useQuery({ queryKey: ["is-admin"], queryFn: isPlatformAdmin });
  const acoes = isDemo ? <DemoBadge /> : null;

  if (adm.isLoading) return <AdminShell><Skeleton className="h-40 w-full" /></AdminShell>;
  if (!adm.data) {
    return (
      <AdminShell>
        <Card className="flex flex-col items-start gap-2">
          <span className="text-h3 font-medium text-ink">Acesso restrito</span>
          <span className="text-caption text-muted">Esta área é exclusiva de quem administra a plataforma — um papel diferente de administrador da sua empresa. Ser administrador da sua empresa não dá acesso aqui.</span>
        </Card>
      </AdminShell>
    );
  }
  return (
    <AdminShell actions={acoes}>
      <div className="flex flex-col gap-6 pb-4">
        {secao === "visao-geral" && <SecaoVisaoGeral />}
        {secao === "clientes" && <SecaoClientes />}
        {secao === "cobranca" && <SecaoCobranca />}
        {secao === "acessos" && <SecaoAcessos />}
        {secao === "suporte" && <SecaoSuporte />}
        <span className="text-caption text-faint inline-flex items-center gap-2">
          <Icon name="shield-check" size={14} color="var(--color-text-secondary)" />
          Visão entre empresas, exclusiva de quem administra a plataforma: cada consulta passa pela verificação de acesso e fica registrada. {isDemo ? "Dados de demonstração." : ""}
        </span>
      </div>
    </AdminShell>
  );
}

/* ── Visão geral ─────────────────────────────────────────────────────────── */

function SecaoVisaoGeral() {
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: getAdminOverview });
  const o = overview.data;
  return (
    <>
      {/* KPIs — número verde não existe mais (30/09/2026): a contagem de ativos
          fica neutra; o rótulo diz o que ela conta. Só o alerta (inadimplentes)
          segue com cor. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="MRR" v={o?.mrr} money loading={overview.isLoading} destaque info={{ titulo: "MRR", oQue: "Receita recorrente mensal da plataforma.", comoCalcula: "Soma do MRR das assinaturas ativas das empresas clientes." }} />
        <Kpi label="ARR" v={o?.arr} money loading={overview.isLoading} info={{ titulo: "ARR", oQue: "Receita recorrente anual projetada.", comoCalcula: "MRR multiplicado por 12." }} />
        <Kpi label="Empresas" v={o?.orgs} loading={overview.isLoading} info={{ titulo: "Empresas", oQue: "Total de empresas clientes na plataforma.", comoCalcula: "Contagem de todas as empresas cadastradas." }} />
        <Kpi label="Assinaturas ativas" v={o?.orgs_ativas} loading={overview.isLoading} info={{ titulo: "Assinaturas ativas", oQue: "Quantas empresas estão com a cobrança em dia.", comoCalcula: "Empresas cujo status de assinatura é ativo." }} />
        <Kpi label="Usuários" v={o?.usuarios} loading={overview.isLoading} info={{ titulo: "Usuários", oQue: "Total de contas criadas na plataforma.", comoCalcula: "Contagem de todos os usuários do Auth." }} />
        <Kpi label="Ativos (30d)" v={o?.usuarios_ativos} loading={overview.isLoading} info={{ titulo: "Ativos (30d)", oQue: "Usuários que acessaram a plataforma recentemente.", comoCalcula: "Contas com último acesso nos últimos 30 dias." }} />
        <Kpi label="Em trial" v={o?.trials} loading={overview.isLoading} info={{ titulo: "Em trial", oQue: "Empresas em período de avaliação.", comoCalcula: "Empresas cujo status de assinatura é trial." }} />
        <Kpi label="Inadimplentes" v={o?.inadimplentes} loading={overview.isLoading} tone="var(--color-warning)" info={{ titulo: "Inadimplentes", oQue: "Empresas com a mensalidade em atraso.", comoCalcula: "Empresas cujo status de assinatura é inadimplente." }} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GrowthCard />
        <MrrCard />
      </div>
    </>
  );
}

/* ── Clientes e planos ───────────────────────────────────────────────────── */

function SecaoClientes() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const orgs = useQuery({ queryKey: ["admin-orgs"], queryFn: getAdminOrgs });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: getAdminPlans });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [verOrg, setVerOrg] = React.useState<{ id: string; nome: string } | null>(null);

  const planByName = React.useMemo(() => new Map((plans.data ?? []).map((p) => [p.name, p])), [plans.data]);

  const salvar = async (orgId: string, planId: string | null, status: SubStatus) => {
    // ⚠️ A tela NÃO calcula mais o MRR. Ela decide plano e estado; o número
    // sai do gatilho no banco, a partir do preço do plano. Enquanto era a tela
    // que o mandava, o servidor aceitava qualquer valor de quem soubesse
    // chamar a função — e o painel somaria esse valor como se fosse receita.
    setBusy(orgId);
    try { await setSubscription(orgId, planId, status); await qc.invalidateQueries({ queryKey: ["admin-orgs"] }); await qc.invalidateQueries({ queryKey: ["admin-overview"] }); show("Assinatura atualizada"); }
    catch (e) { show((e as Error)?.message ?? "Falha ao salvar"); }
    finally { setBusy(null); }
  };

  const planOpts = [{ value: "", label: "—" }, ...(plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${formatBRL(p.priceMonth)}` }))];

  return (
    <>
      <Card padded={false} info={{ titulo: "Empresas · cobrança", oQue: "Lista os clientes da plataforma e deixa ajustar o plano e o status de cobrança de cada um.", comoCalcula: "Vem das empresas com a sua assinatura; o MRR é o preço do plano quando a assinatura está ativa." }}>
        <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Empresas · cobrança de mensalidade</div>
        {orgs.isLoading ? (
          <div className="p-5"><Skeleton className="h-32 w-full" /></div>
        ) : (
          <>
            <div className="hidden lg:grid grid-cols-[1.6fr_0.7fr_1fr_1.1fr_0.8fr_0.9fr] gap-3 px-5 py-2 text-[11px] font-medium tracking-[0.08em] text-faint border-b border-border-soft">
              <span>Empresa</span><span>Membros</span><span>Plano</span><span>Status</span><span className="text-right">MRR</span><span className="text-right">Atividade</span>
            </div>
            {(orgs.data ?? []).map((org, i) => {
              const planId = planByName.get(org.plano)?.id ?? "";
              return (
                <div key={org.orgId} className={`grid grid-cols-1 lg:grid-cols-[1.6fr_0.7fr_1fr_1.1fr_0.8fr_0.9fr] gap-3 lg:items-center px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                  <div className="min-w-0">
                    <button onClick={() => setVerOrg({ id: org.orgId, nome: org.nome })} className="text-[15px] font-medium text-ink truncate hover:underline inline-flex items-center gap-1 max-w-full">
                      <span className="truncate">{org.nome}</span><Icon name="chevron-right" size={13} color="var(--color-text-tertiary)" />
                    </button>
                    <div className="text-caption text-faint">desde {fmtDia(org.criado)} · {org.movimentos} lançamentos</div>
                  </div>
                  <span className="text-caption text-muted tabular-nums">{org.membros}</span>
                  <Select value={planId} onChange={(v) => salvar(org.orgId, v || null, org.status)} options={planOpts} containerClassName="min-w-[140px]" disabled={busy === org.orgId} />
                  <Select value={org.status} onChange={(v) => salvar(org.orgId, planId || null, v as SubStatus)} options={STATUS_ESCOLHIVEIS.map((s) => ({ value: s.value, label: s.label }))} containerClassName="min-w-[150px]" disabled={busy === org.orgId} />
                  <span className="text-caption tabular-nums lg:text-right text-ink"><BRL value={org.mrr} /></span>
                  <span className="text-caption text-faint lg:text-right">{fmtDia(org.ultimoMov)}</span>
                </div>
              );
            })}
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3" info={{ titulo: "Planos", oQue: "Os planos de mensalidade oferecidos e quantos assinantes cada um tem.", comoCalcula: "Cada plano mostra o preço mensal e a contagem de assinaturas ativas vinculadas a ele." }}>
        <span className="text-label font-medium text-muted">Planos</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(plans.data ?? []).map((p: AdminPlan) => (
            <div key={p.id} className="rounded-md border border-border-soft p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between"><span className="text-[16px] font-medium text-ink">{p.name}</span>{!p.active && <StatusBadge tone="neutral">inativo</StatusBadge>}</div>
              <span className="text-[20px] font-semibold tabular-nums text-ink"><BRL value={p.priceMonth} /><span className="text-caption text-faint">/mês</span></span>
              <span className="text-caption text-faint">{p.assinantes} assinante(s) ativo(s)</span>
            </div>
          ))}
        </div>
      </Card>
      {verOrg && <OrgDetailModal orgId={verOrg.id} nome={verOrg.nome} onClose={() => setVerOrg(null)} />}
      {node}
    </>
  );
}

/* ── Cobrança ────────────────────────────────────────────────────────────── */

function SecaoCobranca() {
  const orgs = useQuery({ queryKey: ["admin-orgs"], queryFn: getAdminOrgs });
  return (
    <>
      <ReconciliacaoBilling orgs={orgs.data ?? []} carregando={orgs.isLoading} />
      <MrrCard />
    </>
  );
}

/* ── Acessos ─────────────────────────────────────────────────────────────── */

function SecaoAcessos() {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: getAdminUsers });
  const [verUser, setVerUser] = React.useState<{ id: string; email: string } | null>(null);
  return (
    <>
      <Card padded={false} info={{ titulo: "Usuários com conta", oQue: "Todas as contas criadas na plataforma, com cadastro e último acesso.", comoCalcula: "Vem dos usuários do Auth; o ponto indica acesso nos últimos 30 dias." }}>
        <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Usuários com conta</div>
        {users.isLoading ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_0.7fr] gap-3 px-5 py-2 text-[11px] font-medium tracking-[0.08em] text-faint border-b border-border-soft">
              <span>E-mail</span><span>Cadastro</span><span>Último acesso</span><span className="text-right">Orgs</span>
            </div>
            {(users.data ?? []).map((u, i) => (
              <button key={u.userId} type="button" onClick={() => setVerUser({ id: u.userId, email: u.email })} className={`w-full text-left grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_0.7fr] gap-3 sm:items-center px-5 py-3 hover:bg-surface-2 ${i ? "border-t border-border-soft" : ""}`}>
                <span className="text-[14px] text-ink truncate inline-flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-pill ${ativoUsuario(u.ultimoAcesso) ? "bg-positive" : "bg-border"}`} />
                  <span className="truncate">{u.email}</span>
                  <Icon name="chevron-right" size={13} color="var(--color-text-tertiary)" />
                </span>
                <span className="text-caption text-muted">{fmtDia(u.criado)}</span>
                <span className="text-caption text-faint">{fmtDia(u.ultimoAcesso)}{ativoUsuario(u.ultimoAcesso) ? " · ativo" : ""}</span>
                <span className="text-caption tabular-nums sm:text-right text-muted">{u.orgs}</span>
              </button>
            ))}
          </>
        )}
      </Card>
      <AuditCard />
      {verUser && <UserDetailModal userId={verUser.id} email={verUser.email} onClose={() => setVerUser(null)} />}
    </>
  );
}

/* ── Suporte ─────────────────────────────────────────────────────────────── */

function SecaoSuporte() {
  const { show, node } = useToast();
  const orgs = useQuery({ queryKey: ["admin-orgs"], queryFn: getAdminOrgs });
  const [busca, setBusca] = React.useState("");
  const [verOrg, setVerOrg] = React.useState<{ id: string; nome: string } | null>(null);
  const termo = busca.trim().toLowerCase();
  const lista = (orgs.data ?? []).filter((o) => !termo || o.nome.toLowerCase().includes(termo));
  return (
    <>
      <Card padded={false} info={{ titulo: "Atender um cliente", oQue: "Abre a ficha da empresa (somente leitura) e, se preciso, entra no app como o titular dela.", comoCalcula: "Entrar como o cliente abre a sessão dele no app dos clientes; a sua sessão aqui continua aberta. Cada entrada fica registrada na trilha." }}>
        <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between gap-3 flex-wrap">
          <span className="text-label font-medium text-muted">Atender um cliente</span>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa" aria-label="Buscar empresa" containerClassName="w-full sm:w-[260px]" />
        </div>
        {orgs.isLoading ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : lista.length === 0 ? (
          <div className="px-5 py-4 text-caption text-faint">Nenhuma empresa com esse nome.</div>
        ) : (
          lista.map((org, i) => (
            <button key={org.orgId} type="button" onClick={() => setVerOrg({ id: org.orgId, nome: org.nome })} className={`w-full text-left flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2 ${i ? "border-t border-border-soft" : ""}`}>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-ink truncate">{org.nome}</span>
                <span className="block text-caption text-faint">{org.membros} membro(s) · {statusMeta(org.status).label} · último lançamento {fmtDia(org.ultimoMov)}</span>
              </span>
              <Icon name="chevron-right" size={14} color="var(--color-text-tertiary)" />
            </button>
          ))
        )}
      </Card>
      <PinbankAdminCard orgs={orgs.data ?? []} toast={show} />
      <FerramentasInternas />
      {verOrg && <OrgDetailModal orgId={verOrg.id} nome={verOrg.nome} onClose={() => setVerOrg(null)} />}
      {node}
    </>
  );
}

function GrowthCard() {
  const g = useQuery({ queryKey: ["admin-growth"], queryFn: getAdminGrowth });
  const mesLabel = (m: string) => { const [y, mm] = m.split("-"); return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(mm) - 1]}/${y.slice(2)}`; };
  const data = (g.data ?? []).map((p) => ({ ...p, label: mesLabel(p.mes) }));
  return (
    <Card className="flex flex-col gap-3" info={{ titulo: "Crescimento", oQue: "Mostra o ritmo de aquisição de novos clientes e o tamanho da base ao longo do tempo.", comoCalcula: "As barras contam os clientes que entraram em cada mês; a linha acumula a base total de empresas." }}>
      <span className="text-label font-medium text-muted">Crescimento · novos clientes e base acumulada</span>
      {g.isLoading ? <Skeleton className="h-[220px] w-full" /> : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
            <YAxis tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={({ active, payload, label }: any) => active && payload?.length ? (
              <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
                <div className="font-medium text-ink mb-1">{label}</div>
                <div className="text-muted tabular-nums">novos: {payload.find((x: any) => x.dataKey === "novas")?.value ?? 0}</div>
                <div className="text-muted tabular-nums">base: {payload.find((x: any) => x.dataKey === "acumulado")?.value ?? 0}</div>
              </div>
            ) : null} />
            <Bar dataKey="novas" radius={[3, 3, 0, 0]} fill="var(--color-lime)" />
            <Line dataKey="acumulado" stroke="var(--color-ink)" strokeWidth={1.6} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <span className="text-caption text-faint">Barras = novos clientes no mês · linha = base acumulada de empresas.</span>
    </Card>
  );
}

/* ---------- MRR mês a mês ---------- */
function MrrCard() {
  const h = useQuery({ queryKey: ["admin-mrr"], queryFn: getMrrHistory });
  const mesLabel = (m: string) => { const [y, mm] = m.split("-"); return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(mm) - 1]}/${y.slice(2)}`; };
  const data = (h.data ?? []).map((p) => ({ ...p, label: mesLabel(p.mes) }));
  const atual = data.length ? data[data.length - 1].mrr : 0;
  const ant = data.length > 1 ? data[data.length - 2].mrr : 0;
  const delta = ant > 0 ? (atual - ant) / ant : 0;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1 text-label font-medium text-muted">MRR mês a mês<InfoHint align="left" titulo="MRR mês a mês" oQue="Acompanha a receita recorrente mensal da plataforma e sua variação." comoCalcula="Usa o snapshot real do mês quando existe; senão deriva da soma das assinaturas ativas." /></span>
        {/* Número não tem cor por sinal (decisão de 30/09/2026): o sinal escrito diz a direção. */}
        {data.length > 1 && <span className="text-caption font-medium tabular-nums text-ink">{delta >= 0 ? "+" : "−"}{pct(Math.abs(delta))} × mês anterior</span>}
      </div>
      {h.isLoading ? <Skeleton className="h-[220px] w-full" /> : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -2 }}>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
            <YAxis tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatBRLCompact(Number(v))} />
            <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={({ active, payload, label }: any) => active && payload?.length ? (
              <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
                <div className="font-medium text-ink mb-1">{label}</div>
                <div className="text-muted tabular-nums">MRR {formatBRL(Number(payload[0].value))}</div>
              </div>
            ) : null} />
            <Line dataKey="mrr" stroke="var(--color-lime)" strokeWidth={1.8} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <span className="text-caption text-faint">Receita recorrente mensal. Meses sem snapshot são derivados das assinaturas ativas (o histórico real acumula a cada captura).</span>
    </Card>
  );
}

/* ---------- Maquininha Pinbank: a primeira chave do vínculo ---------- */
/**
 * ⚠️ Só a plataforma liga um estabelecimento da Pinbank a uma empresa: se a
 * empresa pudesse se vincular sozinha, bastaria digitar o número da loja
 * vizinha para receber as vendas dela. A empresa dá a SEGUNDA chave (conta e
 * taxas) em Integrações. A quarentena mostra o que chegou de loja sem dono —
 * é dali que sai o número a vincular.
 */
function PinbankAdminCard({ orgs, toast }: { orgs: AdminOrg[]; toast: (s: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-pinbank"], queryFn: getPinbankAdmin });
  const [org, setOrg] = React.useState("");
  const [estab, setEstab] = React.useState("");
  const [chave, setChave] = React.useState("");
  const [nome, setNome] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["admin-pinbank"] });
  async function vincular() {
    const id = estab.trim() ? Number(estab.trim()) : null;
    if (!org) { toast("Escolha a empresa."); return; }
    if (id == null && !chave.trim()) { toast("Informe o código do estabelecimento ou a chave do gateway."); return; }
    if (id != null && (!Number.isInteger(id) || id <= 0)) { toast("O código do estabelecimento é um número inteiro."); return; }
    setBusy(true);
    try {
      await vincularPinbank({ orgId: org, estabelecimentoId: id, chaveGateway: chave.trim() || null, nome: nome.trim() || null });
      setEstab(""); setChave(""); setNome("");
      toast("Vinculado. A empresa ativa em Integrações.");
      await recarregar();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  async function desvincular(v: PinbankVinculoAdmin) {
    const motivo = window.prompt(`Desvincular ${v.nome ?? v.estabelecimentoId ?? v.chaveGateway} de ${v.empresa}? Diga o motivo (10+ caracteres).`);
    if (!motivo) return;
    try { await desvincularPinbank(v.id, motivo); toast("Desvinculado."); await recarregar(); }
    catch (e) { toast((e as Error).message); }
  }
  const usarDaQuarentena = (x: PinbankQuarentena) => {
    setEstab(x.estabelecimentoId ? String(x.estabelecimentoId) : ""); setChave(x.chaveGateway ?? ""); setNome(x.nome ?? "");
  };
  const orgOpts = orgs.map((o) => ({ value: o.orgId, label: o.nome }));

  return (
    <Card padded={false} info={{ titulo: "Maquininha Pinbank", oQue: "Liga o estabelecimento da Pinbank à empresa cliente. Sem o vínculo, as vendas da maquininha ficam na quarentena.", comoCalcula: "A quarentena agrupa os eventos recebidos de estabelecimentos sem vínculo. Vincular os entrega à empresa, que ativa em Integrações." }}>
      <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Maquininha Pinbank · vínculos e quarentena</div>
      <div className="p-5 flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Select label="Empresa" value={org} onChange={setOrg} placeholder="Escolha" options={orgOpts} />
          <Input label="Código do estabelecimento" inputMode="numeric" className="tabular-nums" value={estab} onChange={(e) => setEstab(e.target.value)} />
          <Input label="Chave do gateway" value={chave} onChange={(e) => setChave(e.target.value)} />
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button variant="primary" disabled={busy} onClick={vincular}>Vincular</Button>
        </div>

        {q.isLoading ? <Skeleton className="h-16 w-full" /> : q.error ? (
          <span className="text-caption text-negative">Não foi possível ler: {(q.error as Error).message}</span>
        ) : (
          <>
            <div className="flex flex-col">
              <span className="a4p-label text-muted mb-2">Vinculadas</span>
              {(q.data?.vinculos ?? []).length === 0 ? <span className="text-caption text-faint">Nenhuma maquininha vinculada.</span> :
                (q.data?.vinculos ?? []).map((v, i) => (
                  <div key={v.id} className={`flex flex-wrap items-center gap-3 py-2 text-caption ${i ? "border-t border-border-soft" : ""}`}>
                    <span className="text-ink font-medium min-w-[180px]">{v.nome ?? "—"}</span>
                    <span className="text-muted tabular-nums">{v.estabelecimentoId ?? v.chaveGateway}</span>
                    <span className="text-muted flex-1">{v.empresa}</span>
                    <StatusBadge tone={v.ativo ? "positive" : "warning"}>{v.ativo ? "Ativa" : "Aguardando a empresa"}</StatusBadge>
                    <button className="text-muted hover:text-ink underline" onClick={() => desvincular(v)}>Desvincular</button>
                  </div>
                ))}
            </div>
            <div className="flex flex-col">
              <span className="a4p-label text-muted mb-2">Quarentena · eventos sem vínculo</span>
              {(q.data?.quarentena ?? []).length === 0 ? <span className="text-caption text-faint">Nenhum evento de estabelecimento desconhecido.</span> :
                (q.data?.quarentena ?? []).map((x, i) => (
                  <div key={`${x.estabelecimentoId}-${x.chaveGateway}`} className={`flex flex-wrap items-center gap-3 py-2 text-caption ${i ? "border-t border-border-soft" : ""}`}>
                    <span className="text-ink font-medium min-w-[180px]">{x.nome ?? "—"}</span>
                    <span className="text-muted tabular-nums">{x.estabelecimentoId ?? x.chaveGateway}</span>
                    <span className="text-muted flex-1">{x.eventos} evento(s) · último em {x.ultimo.slice(0, 10).split("-").reverse().join("/")}</span>
                    <button className="text-muted hover:text-ink underline" onClick={() => usarDaQuarentena(x)}>Usar no vínculo</button>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ---------- Auditoria das ações do admin ---------- */
function AuditCard() {
  const a = useQuery({ queryKey: ["admin-audit"], queryFn: getAuditLog });
  const quando = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const ACAO: Record<string, string> = { "subscription.set": "Cobrança alterada", "plan.upsert": "Plano alterado", impersonate: "Logou como cliente", "pinbank.vincular": "Maquininha vinculada", "pinbank.desvincular": "Maquininha desvinculada" };
  return (
    <Card padded={false} info={{ titulo: "Auditoria do admin", oQue: "Registra cada ação sensível do administrador da plataforma, para rastreabilidade.", comoCalcula: "Toda alteração de cobrança, de plano ou impersonação grava uma linha com quem fez, o alvo e quando." }}>
      <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Auditoria · ações do administrador</div>
      {a.isLoading ? <div className="p-5"><Skeleton className="h-20 w-full" /></div> : (a.data ?? []).length === 0 ? (
        <div className="px-5 py-4 text-caption text-faint">Nenhuma ação registrada ainda.</div>
      ) : (
        (a.data ?? []).map((e, i) => (
          <div key={e.id} className={`flex items-center gap-3 px-5 py-3 text-caption ${i ? "border-t border-border-soft" : ""}`}>
            <Icon name="shield-check" size={14} color="var(--color-text-secondary)" />
            <span className="text-ink font-medium w-[160px] shrink-0">{ACAO[e.acao] ?? e.acao}</span>
            <span className="text-muted flex-1 truncate">{e.alvo ?? "—"} {e.detalhe && Object.keys(e.detalhe).length > 0 ? `· ${Object.entries(e.detalhe).map(([k, v]) => `${k}: ${v}`).join(" · ")}` : ""}</span>
            <span className="text-faint shrink-0">{e.adminEmail ?? "—"} · {quando(e.quando)}</span>
          </div>
        ))
      )}
    </Card>
  );
}

/* ---------- Impersonação: ver como cliente (read-only) ---------- */
function OrgDetailModal({ orgId, nome, onClose }: { orgId: string; nome: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin-org-detail", orgId], queryFn: () => getAdminOrgDetail(orgId) });
  const d = q.data;
  const [impBusy, setImpBusy] = React.useState(false);
  const [impMsg, setImpMsg] = React.useState<string | null>(null);
  const logarComo = async () => {
    if (!window.confirm(`Entrar como o titular de "${nome}"? A sessão dele abre no app dos clientes, em outra aba ou janela. A sua sessão de administração continua aberta aqui. A ação é registrada na auditoria.`)) return;
    setImpBusy(true); setImpMsg(null);
    const r = await impersonar(orgId);
    if (r.ok && r.link) { window.location.href = r.link; return; }
    setImpMsg(r.reason ?? "Não foi possível impersonar."); setImpBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-6" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-card rounded-t-card max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-caption text-faint">Ver como cliente · read-only</div>
            <h3 className="m-0 text-h3 font-medium text-ink">{nome}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={logarComo} disabled={impBusy} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[6px] disabled:opacity-60">
              {impBusy ? "Abrindo…" : "Logar como"}
            </button>
            <button onClick={onClose} className="inline-flex p-1 rounded-md hover:bg-surface-2"><Icon name="x" size={18} color="var(--color-text-secondary)" /></button>
          </div>
        </div>
        {impMsg && <span className="text-caption text-warning">{impMsg}</span>}
        {q.isLoading || !d ? <Skeleton className="h-40 w-full" /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Mini2 label="Saldo" v={d.saldo} money />
              <Mini2 label="Receita 12m" v={d.receita12m} money />
              <Mini2 label="Despesa 12m" v={d.despesa12m} money />
              <Mini2 label="Resultado 12m" v={d.receita12m - d.despesa12m} money />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-caption text-muted">
              <span>Plano: <b className="text-ink font-medium">{d.plano}</b></span>
              <span>Status: <b className="text-ink font-medium">{statusMeta(d.status).label}</b></span>
              <span>MRR: <b className="text-ink font-medium"><BRL value={d.mrr} /></b></span>
              <span>Contas: <b className="text-ink font-medium">{d.contas}</b></span>
              <span>Lançamentos: <b className="text-ink font-medium">{d.movimentos}</b></span>
              <span>Último: <b className="text-ink font-medium">{fmtDia(d.ultimoMov)}</b></span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label font-medium text-muted">Equipe ({d.membros})</span>
              {d.membrosLista.length === 0 ? <span className="text-caption text-faint">Sem membros listados.</span> :
                d.membrosLista.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1 text-caption border-t border-border-soft first:border-t-0">
                    <span className="text-ink truncate">{m.nome || m.email || "—"}</span>
                    <StatusBadge tone={m.role === "owner" ? "positive" : "neutral"}>{m.role ?? "member"}</StatusBadge>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
/** Sem cor por sinal (30/09/2026): o resultado negativo se lê pelo "−" que o `BRL` escreve. */
function Mini2({ label, v, money }: { label: string; v: number; money?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums text-ink">{money ? <BRL value={v} /> : v.toLocaleString("pt-BR")}</span>
    </div>
  );
}

/* ---------- Detalhe cadastral do usuário (drill-in) ---------- */
const roleLabel: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro" };
function pf(perfil: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!perfil) return null;
  for (const k of keys) { const v = perfil[k]; if (v != null && String(v).trim() !== "") return String(v); }
  return null;
}
function UserDetailModal({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin-user-detail", userId], queryFn: () => getAdminUserDetail(userId) });
  const d: UserDetalhe | undefined = q.data;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-6" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-card rounded-t-card max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-caption text-faint">Usuário · dados cadastrais</div>
            <h3 className="m-0 text-h3 font-medium text-ink truncate">{d?.nomeMeta || email}</h3>
          </div>
          <button onClick={onClose} className="inline-flex p-1 rounded-md hover:bg-surface-2 shrink-0"><Icon name="x" size={18} color="var(--color-text-secondary)" /></button>
        </div>
        {q.isLoading || !d ? <Skeleton className="h-40 w-full" /> : (
          <>
            {/* Contato */}
            <div className="flex flex-col gap-1">
              <span className="text-label font-medium text-muted">Contato</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-1">
                <Campo label="E-mail" v={d.email} />
                <Campo label="Telefone" v={d.telefone || d.telefoneMeta} />
                <Campo label="Nome" v={d.nomeMeta} />
                <Campo label="Provedor de acesso" v={d.provedor} />
              </div>
            </div>
            {/* Conta */}
            <div className="flex flex-col gap-1">
              <span className="text-label font-medium text-muted">Conta</span>
              <div className="flex flex-wrap gap-2 pt-1">
                <StatusBadge tone={d.confirmado ? "positive" : "warning"}>{d.confirmado ? "E-mail confirmado" : "E-mail não confirmado"}</StatusBadge>
                {d.anonimo && <StatusBadge tone="neutral">Convidado (anônimo)</StatusBadge>}
                {ativoUsuario(d.ultimoAcesso) && <StatusBadge tone="positive">Ativo (30d)</StatusBadge>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2">
                <Campo label="Cadastrado em" v={fmtDia(d.criado)} />
                <Campo label="Último acesso" v={fmtDia(d.ultimoAcesso)} />
              </div>
            </div>
            {/* Organizações + perfil da empresa */}
            <div className="flex flex-col gap-2">
              <span className="text-label font-medium text-muted">Empresas ({d.orgs.length})</span>
              {d.orgs.length === 0 ? <span className="text-caption text-faint">Sem vínculo com empresas.</span> :
                d.orgs.map((o) => {
                  const p = o.perfil;
                  return (
                    <div key={o.orgId} className="rounded-md border border-border-soft p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[15px] font-medium text-ink truncate">{o.nome}</span>
                        <StatusBadge tone={o.role === "owner" ? "positive" : "neutral"}>{roleLabel[o.role] ?? o.role}</StatusBadge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        <Campo label="Razão social" v={pf(p, "razaoSocial", "razao_social")} />
                        <Campo label="Nome fantasia" v={pf(p, "fantasia", "nomeFantasia")} />
                        <Campo label="CNPJ" v={pf(p, "cnpj")} />
                        <Campo label="Cidade / UF" v={[pf(p, "cidade"), pf(p, "estado", "uf")].filter(Boolean).join(" / ") || null} />
                        <Campo label="Representante" v={pf(p, "repNome", "representante")} />
                        <Campo label="CPF do representante" v={pf(p, "repCpf", "cpf")} />
                        <Campo label="E-mail do representante" v={pf(p, "repEmail") || o.emailMembro} />
                        <Campo label="Telefone do representante" v={pf(p, "repTelefone")} />
                        {o.aprovaAte != null && <Campo label="Alçada de aprovação" v={formatBRL(o.aprovaAte)} />}
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function Campo({ label, v }: { label: string; v: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-[2px] min-w-0">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[14px] text-ink truncate">{v && String(v).trim() !== "" ? v : "—"}</span>
    </div>
  );
}

function Kpi({ label, v, money, loading, tone = "var(--color-ink)", destaque, info }: { label: string; v?: number; money?: boolean; loading?: boolean; tone?: string; destaque?: boolean; info?: InfoConteudo }) {
  return (
    <Card className="flex flex-col gap-1" info={info}>
      <span className="inline-flex items-center gap-[6px] text-caption text-faint">{label}<PontoStatus cor={tone} /></span>
      {loading ? <Skeleton className="h-6 w-16" /> : (
        <span className={`${destaque ? "text-[24px]" : "text-[20px]"} font-semibold tabular-nums text-ink`}>
          {money ? <BRL value={v ?? 0} /> : (v ?? 0).toLocaleString("pt-BR")}
        </span>
      )}
    </Card>
  );
}
