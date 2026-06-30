"use client";

import * as React from "react";
import { BRL, Card, Skeleton, Icon, Input, Select, Switch, Button, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { useAuditTrail } from "@/components/visao-geral/hooks";
import { TrilhaAuditoria } from "@/core/institutional/audit";
import {
  avaliarPolitica,
  todosOsPapeis,
  permissoesDe,
  REGRAS_PADRAO,
} from "@/core/institutional";
import {
  DEMO_USUARIOS,
  requestsDemo,
  SLA_DEMO,
} from "@/core/institutional/demo";
import { ROLE_LABEL, type Permission, type AuditEvent, type DecisaoPolitica } from "@/core/institutional/types";

const PERMS: Permission[] = [
  "payment.create", "payment.approve", "payment.execute",
  "audit.view", "audit.export", "rules.edit", "report.export",
];
const PERM_LABEL: Record<string, string> = {
  "payment.create": "Criar pagamento",
  "payment.approve": "Aprovar",
  "payment.execute": "Executar",
  "audit.view": "Ver auditoria",
  "audit.export": "Exportar auditoria",
  "rules.edit": "Alterar regras",
  "report.export": "Exportar relatório",
};
const DECISAO: Record<DecisaoPolitica, { label: string; cor: string }> = {
  aprovar: { label: "Aprovar", cor: "var(--color-positive)" },
  exigir_mfa: { label: "Exigir MFA", cor: "var(--color-warning)" },
  escalar: { label: "Escalar", cor: "var(--color-warning)" },
  rejeitar: { label: "Rejeitar", cor: "var(--color-negative)" },
  bloquear: { label: "Bloquear", cor: "var(--color-negative)" },
};
const nivelCor = (n: string) =>
  n === "critico" ? "var(--color-negative)" : n === "atencao" ? "var(--color-warning)" : "var(--color-text-secondary)";

export function InstitutionalView() {
  const { data, isLoading, isError } = useAuditTrail();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Auditoria imutável */}
      <div className="lg:col-span-3">
        {isLoading ? (
          <Skeleton className="h-[280px]" rounded="card" />
        ) : isError || !data ? (
          <Card><p className="text-muted">Não foi possível carregar a trilha de auditoria.</p></Card>
        ) : (
          <AuditCard eventos={data.eventos} intacta={data.integridade.intacta} total={data.integridade.total} />
        )}
      </div>

      {/* Policy engine (interativo) */}
      <PolicyEngineCard />

      {/* RBAC matrix */}
      <Card className="lg:col-span-2 flex flex-col gap-3" info={{ titulo: "Permissões granulares", oQue: "Mostra quem pode fazer o quê: a matriz de papéis contra ações no sistema.", comoCalcula: "Cada papel tem um conjunto fixo de permissões; a tabela marca onde o papel tem a ação liberada." }}>
        <SectionHead icon="users" title="Permissões granulares (RBAC)" sub="papel × ação" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-caption">
            <thead>
              <tr className="text-faint">
                <th className="text-left font-medium py-2 pr-3">Papel</th>
                {PERMS.map((p) => (
                  <th key={p} className="font-medium py-2 px-2 text-center whitespace-nowrap">{PERM_LABEL[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todosOsPapeis().map((role) => {
                const perms = permissoesDe(role);
                return (
                  <tr key={role} className="border-t border-border-soft">
                    <td className="py-2 pr-3 text-ink whitespace-nowrap">{ROLE_LABEL[role]}</td>
                    {PERMS.map((p) => (
                      <td key={p} className="py-2 px-2 text-center">
                        {perms.includes(p) ? (
                          <Icon name="check" size={14} color="var(--color-positive)" />
                        ) : (
                          <span className="text-placeholder">–</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Escada de aprovação */}
      <Card className="lg:col-span-2 flex flex-col gap-3" info={{ titulo: "Fluxo de aprovação", oQue: "Define quem precisa aprovar um pagamento conforme o valor, da liberação automática à dupla alçada.", comoCalcula: "As faixas de valor são configuráveis; cada uma define os passos de aprovação (sequenciais ou paralelos) e se exige biometria." }}>
        <SectionHead icon="list-checks" title="Fluxo de aprovação por faixa" sub="configurável por empresa" />
        <div className="flex flex-col gap-2">
          {REGRAS_PADRAO.map((r, i) => {
            const de = i === 0 ? 0 : REGRAS_PADRAO[i - 1].ateValor;
            const faixa =
              r.ateValor === Infinity ? `acima de ${formatBRL(de)}` : `${formatBRL(de)} – ${formatBRL(r.ateValor)}`;
            return (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border-soft p-3">
                <span className="text-[16px] text-ink tabular-nums w-[190px] shrink-0">{faixa}</span>
                {r.auto ? (
                  <span className="text-caption text-positive">Aprovação automática</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {r.passos.map((p, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <Icon name="arrow-up-right" size={12} color="var(--color-text-tertiary)" />}
                        <span className="inline-flex items-center gap-[6px] text-caption text-muted bg-surface-2 rounded-pill px-2 py-[2px]">
                          {p.rotulo}
                          {p.modo === "paralelo" && <span className="text-faint">(paralelo)</span>}
                        </span>
                      </React.Fragment>
                    ))}
                    {r.exigeBiometria && <span className="text-caption text-warning">+ biometria</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* SLA por etapa */}
      <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "SLA de aprovação", oQue: "Mostra o tempo médio que cada etapa de aprovação costuma levar.", comoCalcula: "Calculado a partir do histórico de aprovações; sem histórico, é ilustrativo." }}>
        <SectionHead icon="gauge" title="SLA de aprovação" sub="tempo médio por etapa" />
        {SLA_DEMO.map((s) => (
          <div key={s.etapa} className="flex items-center justify-between">
            <span className="text-[16px] text-ink">{s.etapa}</span>
            <span className="text-label font-medium tabular-nums text-muted">{tempo(s.tempoMedioMin)}</span>
          </div>
        ))}
        {!isDemo && <span className="text-caption text-faint">Ilustrativo até haver histórico de aprovações.</span>}
      </Card>

      {/* Solicitações em aprovação (demo) */}
      {isDemo && (
        <Card className="lg:col-span-3 flex flex-col gap-3" info={{ titulo: "Solicitações de aprovação", oQue: "Acompanha os pagamentos que aguardam aprovação, com a sugestão da IA e a assinatura de cada passo.", comoCalcula: "Cada solicitação segue a faixa de valor; a IA avalia a consistência com o histórico do favorecido e cada aprovador assina eletronicamente." }}>
          <SectionHead icon="list-checks" title="Solicitações de aprovação" sub="com sugestão de IA e assinatura eletrônica" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {requestsDemo().map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function tempo(min: number) {
  return min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}min`;
}

function SectionHead({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={16} color="var(--color-text-secondary)" />
      <span className="text-label font-medium text-muted">{title}</span>
      {sub && <span className="text-caption text-faint">· {sub}</span>}
    </div>
  );
}

function AuditCard({ eventos, intacta, total }: { eventos: AuditEvent[]; intacta: boolean; total: number }) {
  const [adulterado, setAdulterado] = React.useState(false);

  // Demo de adulteração: recomputa a integridade sobre uma cópia alterada.
  const integridade = React.useMemo(() => {
    if (!adulterado) return { intacta, problema: undefined as undefined | { seq: number; motivo: string } };
    const copia = eventos.map((e, i) =>
      i === 1 ? { ...e, after: { ...(e.after ?? {}), valor: 1 } } : e,
    );
    const r = new TrilhaAuditoria(copia).verificarIntegridade();
    return { intacta: r.intacta, problema: r.problema };
  }, [adulterado, eventos, intacta]);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="inline-flex items-center gap-1">
          <SectionHead icon="file-text" title="Trilha de auditoria imutável" sub={`${total} eventos · cadeia SHA-256`} />
          <InfoHint align="left" oQue="Registra cada ação relevante de forma que não dá para apagar nem alterar o passado sem ser notado." comoCalcula="Os eventos são encadeados por hash SHA-256; recomputar a cadeia detecta qualquer adulteração (teste no botão ao lado)." />
        </span>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-label font-medium"
            style={{
              background: "var(--color-surface-2)",
              color: integridade.intacta ? "var(--color-positive)" : "var(--color-negative)",
            }}
          >
            <span className="w-2 h-2 rounded-pill" style={{ background: integridade.intacta ? "var(--color-positive)" : "var(--color-negative)" }} />
            {integridade.intacta ? "Cadeia íntegra" : "Adulteração detectada"}
          </span>
          {eventos.length > 1 && (
            <Button variant="ghost" onClick={() => setAdulterado((v) => !v)}>
              {adulterado ? "Restaurar" : "Testar adulteração"}
            </Button>
          )}
        </div>
      </div>

      {!integridade.intacta && integridade.problema && (
        <div className="rounded-md p-3 text-caption" style={{ background: "var(--color-surface-2)", color: "var(--color-negative)" }}>
          Evento seq {integridade.problema.seq}: {integridade.problema.motivo}. O hash não confere — a manipulação não passa despercebida.
        </div>
      )}

      <div className="flex flex-col">
        {eventos.map((e) => (
          <div key={e.id} className="flex gap-3 py-[10px] border-t border-border-soft first:border-t-0">
            <span className="text-caption text-faint tabular-nums w-[18px] shrink-0 pt-[2px]">{e.seq}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[17px] text-ink">
                  {ACAO_LABEL[e.action] ?? e.action} · <span className="text-muted">{e.entityType}/{e.entityId}</span>
                </span>
                <span className="text-caption text-faint">{e.ctx.userName} · {e.ctx.ip}</span>
                <span className="text-caption text-faint tabular-nums ml-auto">{new Date(e.timestamp).toLocaleString("pt-BR")}</span>
              </div>
              {e.flags.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  {e.flags.map((f, i) => (
                    <span key={i} className="inline-flex items-start gap-[6px] text-caption" style={{ color: nivelCor(f.nivel) }}>
                      <Icon name="triangle-alert" size={12} color={nivelCor(f.nivel)} />
                      {f.descricao}
                    </span>
                  ))}
                </div>
              )}
              <span className="block text-[13px] text-placeholder tabular-nums mt-1 truncate">hash {e.hash.slice(0, 32)}…</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const ACAO_LABEL: Record<string, string> = {
  created: "Criado",
  updated: "Alterado",
  deleted: "Excluído",
  approved: "Aprovado",
  rejected: "Rejeitado",
  executed: "Executado",
  reconciled: "Conciliado",
};

function PolicyEngineCard() {
  const [userId, setUserId] = React.useState(DEMO_USUARIOS[1].id);
  const [valor, setValor] = React.useState(120000);
  const [metodo, setMetodo] = React.useState<"pix" | "ted">("ted");
  const [pais, setPais] = React.useState("Brasil");
  const [hora, setHora] = React.useState(10);
  const [ipSuspeito, setIpSuspeito] = React.useState(false);

  const usuario = DEMO_USUARIOS.find((u) => u.id === userId)!;
  const resultado = React.useMemo(
    () =>
      avaliarPolitica({
        usuario,
        transacao: { valor, metodo, contraparte: "Fornecedor" },
        ambiente: { pais, horaLocal: hora, ipSuspeito, mfaPresente: false },
      }),
    [usuario, valor, metodo, pais, hora, ipSuspeito],
  );
  const d = DECISAO[resultado.decisao];

  return (
    <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Policy engine", oQue: "Permite testar como a política reage a uma transação: aprovar, exigir MFA, escalar, rejeitar ou bloquear.", comoCalcula: "Avalia usuário, valor, método, limite, país, horário e IP em tempo real e devolve a decisão com os motivos." }}>
      <SectionHead icon="gauge" title="Policy engine" sub="avaliação em tempo real" />
      <Select
        label="Usuário"
        value={userId}
        onChange={setUserId}
        options={DEMO_USUARIOS.map((u) => ({ value: u.id, label: u.nome }))}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Valor (R$)" type="number" value={String(valor)} onChange={(e) => setValor(Number(e.target.value) || 0)} />
        <Select
          label="Método"
          value={metodo}
          onChange={(v) => setMetodo(v as "pix" | "ted")}
          options={[{ value: "pix", label: "PIX" }, { value: "ted", label: "TED" }]}
        />
        <Select
          label="País"
          value={pais}
          onChange={setPais}
          options={[{ value: "Brasil", label: "Brasil" }, { value: "EUA", label: "EUA" }]}
        />
        <Input label="Hora" type="number" value={String(hora)} onChange={(e) => setHora(Number(e.target.value) || 0)} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-label text-muted">IP suspeito</span>
        <Switch checked={ipSuspeito} onChange={setIpSuspeito} />
      </div>

      <div className="rounded-md p-3 flex flex-col gap-2" style={{ background: "var(--color-surface-1)" }}>
        <span className="inline-flex items-center gap-2 text-label font-medium" style={{ color: d.cor }}>
          <span className="w-2 h-2 rounded-pill" style={{ background: d.cor }} />
          {d.label}
        </span>
        {resultado.aprovadoresNecessarios.length > 0 && (
          <span className="text-caption text-muted">
            Aprovadores: {resultado.aprovadoresNecessarios.map((r) => ROLE_LABEL[r]).join(" + ")}
          </span>
        )}
        <ul className="m-0 pl-4 flex flex-col gap-1">
          {resultado.motivos.map((m, i) => (
            <li key={i} className="text-caption text-faint">{m}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

const IA_COR: Record<string, string> = {
  baixo: "var(--color-positive)",
  medio: "var(--color-warning)",
  alto: "var(--color-negative)",
};
const STATUS_LABEL: Record<string, string> = {
  em_aprovacao: "Em aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  auto_aprovado: "Auto-aprovado",
  emergencia: "Emergência",
};

function RequestCard({ r }: { r: ReturnType<typeof requestsDemo>[number] }) {
  return (
    <div className="rounded-md border border-border-soft p-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-medium text-ink tabular-nums"><BRL value={r.transacao.valor} /></span>
        <span className="text-caption text-muted">{STATUS_LABEL[r.status]}</span>
      </div>
      <span className="text-caption text-faint">{r.transacao.contraparte} · {r.transacao.metodo.toUpperCase()}</span>

      {r.passos.length > 0 ? (
        <div className="flex flex-col gap-1">
          {r.passos.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-caption">
              <span className="text-ink">{p.def.rotulo}</span>
              <span style={{ color: p.status === "aprovado" ? "var(--color-positive)" : "var(--color-text-tertiary)" }}>
                {p.status === "aprovado" ? `assinado (${p.assinaturas.length})` : "pendente"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span className="text-caption text-positive">Faixa de aprovação automática</span>
      )}

      <div className="flex items-start gap-[6px] pt-1 border-t border-border-soft">
        <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center shrink-0 mt-[2px]">
          <Icon name="sparkles" size={13} color="var(--color-on-lime)" />
        </span>
        <span className="text-caption" style={{ color: IA_COR[r.sugestaoIA.risco] }}>{r.sugestaoIA.texto}</span>
      </div>
    </div>
  );
}
