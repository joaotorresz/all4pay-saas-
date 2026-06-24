"use client";

/**
 * Modo Administrador da plataforma (super-admin) — visão do dono do SaaS: KPIs
 * cross-tenant, organizações (clientes) com cobrança de mensalidade editável,
 * usuários com conta/ativos e planos. Acesso gateado por `isPlatformAdmin`.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, BRL, Icon, Select, StatusBadge, Skeleton } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { useToast } from "@/components/listas/ListChrome";
import {
  isPlatformAdmin, getAdminOverview, getAdminOrgs, getAdminUsers, getAdminPlans, setSubscription,
  getAdminGrowth, getAdminOrgDetail, getMrrHistory, getAuditLog, impersonar,
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
  const [verOrg, setVerOrg] = React.useState<{ id: string; nome: string } | null>(null);

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

      {/* Crescimento + MRR mês a mês */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GrowthCard />
        <MrrCard />
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
                    <button onClick={() => setVerOrg({ id: org.orgId, nome: org.nome })} className="text-[15px] font-medium text-ink truncate hover:underline inline-flex items-center gap-1 max-w-full">
                      <span className="truncate">{org.nome}</span><Icon name="chevron-right" size={13} color="var(--color-text-tertiary)" />
                    </button>
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

      {/* Auditoria das ações do admin */}
      <AuditCard />

      <span className="text-caption text-faint inline-flex items-center gap-2">
        <Icon name="shield-check" size={14} color="var(--color-text-secondary)" />
        Visão cross-tenant exclusiva do administrador da plataforma (RPCs SECURITY DEFINER gateadas). {isDemo ? "Dados de demonstração." : ""}
      </span>
      {verOrg && <OrgDetailModal orgId={verOrg.id} nome={verOrg.nome} onClose={() => setVerOrg(null)} />}
      {node}
    </div>
  );
}

/* ---------- Crescimento ---------- */
function GrowthCard() {
  const g = useQuery({ queryKey: ["admin-growth"], queryFn: getAdminGrowth });
  const mesLabel = (m: string) => { const [y, mm] = m.split("-"); return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(mm) - 1]}/${y.slice(2)}`; };
  const data = (g.data ?? []).map((p) => ({ ...p, label: mesLabel(p.mes) }));
  return (
    <Card className="flex flex-col gap-3">
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
      <span className="text-caption text-faint">Barras = novos clientes no mês · linha = base acumulada de organizações.</span>
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
  const delta = ant > 0 ? Math.round(((atual - ant) / ant) * 100) : 0;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label font-medium text-muted">MRR mês a mês</span>
        {data.length > 1 && <span className={`text-caption font-medium tabular-nums ${delta >= 0 ? "text-positive" : "text-negative"}`}>{delta >= 0 ? "+" : ""}{delta}% vs mês anterior</span>}
      </div>
      {h.isLoading ? <Skeleton className="h-[220px] w-full" /> : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -2 }}>
            <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={{ stroke: "var(--color-border-soft)" }} />
            <YAxis tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => "R$ " + (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
            <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={({ active, payload, label }: any) => active && payload?.length ? (
              <div className="bg-white rounded-card border border-border shadow-popover px-3 py-[10px] text-caption">
                <div className="font-medium text-ink mb-1">{label}</div>
                <div className="text-muted tabular-nums">MRR R$ {Number(payload[0].value).toLocaleString("pt-BR")}</div>
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

/* ---------- Auditoria das ações do admin ---------- */
function AuditCard() {
  const a = useQuery({ queryKey: ["admin-audit"], queryFn: getAuditLog });
  const quando = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const ACAO: Record<string, string> = { "subscription.set": "Cobrança alterada", "plan.upsert": "Plano alterado", impersonate: "Logou como cliente" };
  return (
    <Card padded={false}>
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
    if (!window.confirm(`Logar como o owner de "${nome}"? Você assumirá a sessão dele e sairá da sua conta de admin (para voltar, faça logout e entre de novo). A ação é registrada na auditoria.`)) return;
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
              <Mini2 label="Resultado 12m" v={d.receita12m - d.despesa12m} money tone={d.receita12m - d.despesa12m >= 0 ? "var(--color-positive)" : "var(--color-negative)"} />
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
function Mini2({ label, v, money, tone = "var(--color-ink)" }: { label: string; v: number; money?: boolean; tone?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums" style={{ color: tone }}>{money ? <BRL value={v} /> : v.toLocaleString("pt-BR")}</span>
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
