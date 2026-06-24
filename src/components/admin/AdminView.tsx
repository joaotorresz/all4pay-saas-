"use client";

/**
 * Modo Administrador da plataforma (super-admin) — visão do dono do SaaS: KPIs
 * cross-tenant, organizações (clientes) com cobrança de mensalidade editável,
 * usuários com conta/ativos e planos. Acesso gateado por `isPlatformAdmin`.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Icon, Select, StatusBadge, Skeleton } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { useToast } from "@/components/listas/ListChrome";
import {
  isPlatformAdmin, getAdminOverview, getAdminOrgs, getAdminUsers, getAdminPlans, setSubscription,
  type SubStatus, type AdminPlan,
} from "@/lib/admin";

const STATUS: { value: SubStatus; label: string; tone: "positive" | "warning" | "neutral" }[] = [
  { value: "active", label: "Ativa", tone: "positive" },
  { value: "trial", label: "Trial", tone: "neutral" },
  { value: "past_due", label: "Inadimplente", tone: "warning" },
  { value: "canceled", label: "Cancelada", tone: "neutral" },
];
const statusMeta = (s: SubStatus) => STATUS.find((x) => x.value === s) ?? STATUS[1];
const fmtDia = (iso: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y.slice(2)}`; };
const ativoUsuario = (iso: string | null) => !!iso && Date.now() - Date.parse(iso) < 30 * 86400000;

export function AdminView() {
  const adm = useQuery({ queryKey: ["is-admin"], queryFn: isPlatformAdmin });

  if (adm.isLoading) return <AppShell title="Administração"><Skeleton className="h-40 w-full" /></AppShell>;
  if (!adm.data) {
    return (
      <AppShell title="Administração">
        <Card className="flex flex-col items-start gap-2">
          <span className="text-h3 font-medium text-ink">Acesso restrito</span>
          <span className="text-caption text-muted">Esta área é exclusiva do administrador da plataforma.</span>
        </Card>
      </AppShell>
    );
  }
  return (
    <AppShell title="Administração da plataforma" actions={isDemo ? <DemoBadge /> : null}>
      <AdminBody />
    </AppShell>
  );
}

function AdminBody() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: getAdminOverview });
  const orgs = useQuery({ queryKey: ["admin-orgs"], queryFn: getAdminOrgs });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: getAdminUsers });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: getAdminPlans });
  const [busy, setBusy] = React.useState<string | null>(null);

  const planById = React.useMemo(() => new Map((plans.data ?? []).map((p) => [p.id, p])), [plans.data]);
  const planByName = React.useMemo(() => new Map((plans.data ?? []).map((p) => [p.name, p])), [plans.data]);

  const salvar = async (orgId: string, planId: string | null, status: SubStatus) => {
    const plan = planId ? planById.get(planId) : undefined;
    const mrr = status === "active" && plan ? plan.priceMonth : 0;
    setBusy(orgId);
    try { await setSubscription(orgId, planId, status, mrr); await qc.invalidateQueries({ queryKey: ["admin-orgs"] }); await qc.invalidateQueries({ queryKey: ["admin-overview"] }); show("Assinatura atualizada"); }
    catch (e) { show((e as Error)?.message ?? "Falha ao salvar"); }
    finally { setBusy(null); }
  };

  const o = overview.data;
  const planOpts = [{ value: "", label: "—" }, ...(plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · R$ ${p.priceMonth}` }))];

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="MRR" v={o?.mrr} money loading={overview.isLoading} destaque />
        <Kpi label="ARR" v={o?.arr} money loading={overview.isLoading} />
        <Kpi label="Organizações" v={o?.orgs} loading={overview.isLoading} />
        <Kpi label="Assinaturas ativas" v={o?.orgs_ativas} loading={overview.isLoading} tone="var(--color-positive)" />
        <Kpi label="Usuários" v={o?.usuarios} loading={overview.isLoading} />
        <Kpi label="Ativos (30d)" v={o?.usuarios_ativos} loading={overview.isLoading} tone="var(--color-positive)" />
        <Kpi label="Em trial" v={o?.trials} loading={overview.isLoading} />
        <Kpi label="Inadimplentes" v={o?.inadimplentes} loading={overview.isLoading} tone="var(--color-warning)" />
      </div>

      {/* Organizações (clientes) + cobrança */}
      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Organizações · cobrança de mensalidade</div>
        {orgs.isLoading ? (
          <div className="p-5"><Skeleton className="h-32 w-full" /></div>
        ) : (
          <>
            <div className="hidden lg:grid grid-cols-[1.6fr_0.7fr_1fr_1.1fr_0.8fr_0.9fr] gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
              <span>Empresa</span><span>Membros</span><span>Plano</span><span>Status</span><span className="text-right">MRR</span><span className="text-right">Atividade</span>
            </div>
            {(orgs.data ?? []).map((org, i) => {
              const planId = planByName.get(org.plano)?.id ?? "";
              return (
                <div key={org.orgId} className={`grid grid-cols-1 lg:grid-cols-[1.6fr_0.7fr_1fr_1.1fr_0.8fr_0.9fr] gap-3 lg:items-center px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-ink truncate">{org.nome}</div>
                    <div className="text-caption text-faint">desde {fmtDia(org.criado)} · {org.movimentos} lançamentos</div>
                  </div>
                  <span className="text-caption text-muted tabular-nums">{org.membros}</span>
                  <Select value={planId} onChange={(v) => salvar(org.orgId, v || null, org.status)} options={planOpts} containerClassName="min-w-[140px]" disabled={busy === org.orgId} />
                  <Select value={org.status} onChange={(v) => salvar(org.orgId, planId || null, v as SubStatus)} options={STATUS.map((s) => ({ value: s.value, label: s.label }))} containerClassName="min-w-[150px]" disabled={busy === org.orgId} />
                  <span className="text-caption tabular-nums lg:text-right text-ink"><BRL value={org.mrr} /></span>
                  <span className="text-caption text-faint lg:text-right">{fmtDia(org.ultimoMov)}</span>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {/* Planos */}
      <Card className="flex flex-col gap-3">
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

      {/* Usuários */}
      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Usuários com conta</div>
        {users.isLoading ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_0.7fr] gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
              <span>E-mail</span><span>Cadastro</span><span>Último acesso</span><span className="text-right">Orgs</span>
            </div>
            {(users.data ?? []).map((u, i) => (
              <div key={u.userId} className={`grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_0.7fr] gap-3 sm:items-center px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <span className="text-[14px] text-ink truncate inline-flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-pill ${ativoUsuario(u.ultimoAcesso) ? "bg-positive" : "bg-border"}`} />{u.email}
                </span>
                <span className="text-caption text-muted">{fmtDia(u.criado)}</span>
                <span className="text-caption text-faint">{fmtDia(u.ultimoAcesso)}{ativoUsuario(u.ultimoAcesso) ? " · ativo" : ""}</span>
                <span className="text-caption tabular-nums sm:text-right text-muted">{u.orgs}</span>
              </div>
            ))}
          </>
        )}
      </Card>

      <span className="text-caption text-faint inline-flex items-center gap-2">
        <Icon name="shield-check" size={14} color="var(--color-text-secondary)" />
        Visão cross-tenant exclusiva do administrador da plataforma (RPCs SECURITY DEFINER gateadas). {isDemo ? "Dados de demonstração." : ""}
      </span>
      {node}
    </div>
  );
}

function Kpi({ label, v, money, loading, tone = "var(--color-ink)", destaque }: { label: string; v?: number; money?: boolean; loading?: boolean; tone?: string; destaque?: boolean }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      {loading ? <Skeleton className="h-6 w-16" /> : (
        <span className={`${destaque ? "text-[24px]" : "text-[20px]"} font-semibold tabular-nums`} style={{ color: tone }}>
          {money ? <BRL value={v ?? 0} /> : (v ?? 0).toLocaleString("pt-BR")}
        </span>
      )}
    </Card>
  );
}
