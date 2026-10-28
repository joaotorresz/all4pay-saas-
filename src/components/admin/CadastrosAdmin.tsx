"use client";

/**
 * Área da plataforma · Cadastros (etapa 3 do plano "documentos e funil do
 * cadastro no admin"). Responde três perguntas do dono: quem terminou a
 * abertura de conta, quem parou e em que passo, e o que cada empresa enviou.
 *
 * ⚠️ A tela não soma nada: o resumo sai de `core/cadastro/funil`. E ela não
 * decide quem vê documento — quem tranca é o banco (`aal2` exigido pela
 * função) e a rota que assina o link; aqui a recusa só é mostrada.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, Icon, Select, Skeleton, StatusBadge } from "@/components/ui";
import { pct } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { estadoDaJornada, type EstadoJornada } from "@/core/cadastro/jornada";
import { FASES_FUNIL, nomeDoPasso, resumirFunil, type JornadaAdmin } from "@/core/cadastro/funil";
import { getDocumentosCadastro, getFunilCadastro, NOME_DOCUMENTO, rotaDoDocumento } from "@/lib/admin-cadastros";

const ESTADOS: Record<EstadoJornada, { rotulo: string; tom: "positive" | "neutral" | "warning" }> = {
  concluida: { rotulo: "Concluiu", tom: "positive" },
  em_andamento: { rotulo: "Em andamento", tom: "neutral" },
  parou: { rotulo: "Parou", tom: "warning" },
};

const quando = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const telefone = (d: string | null) => (d ? d.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : null);
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function CadastrosAdmin() {
  const funil = useQuery({ queryKey: ["admin-cadastro-funil"], queryFn: () => getFunilCadastro(90) });
  const [filtro, setFiltro] = React.useState<"todas" | EstadoJornada>("todas");
  const [docs, setDocs] = React.useState<{ orgId: string; nome: string } | null>(null);
  const agora = React.useMemo(() => new Date(), [funil.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const jornadas = funil.data ?? [];
  const r = React.useMemo(() => resumirFunil(jornadas, agora), [jornadas, agora]);
  const lista = filtro === "todas" ? jornadas : jornadas.filter((j) => estadoDaJornada(j, agora) === filtro);

  if (funil.isError) {
    return (
      <Card className="flex flex-col gap-1">
        <span className="text-h3 font-medium text-ink">Não foi possível ler os cadastros</span>
        <span className="text-caption text-muted">{(funil.error as Error)?.message ?? "Tente de novo em instantes."}</span>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Numero rotulo="Começaram" valor={r.total} carregando={funil.isLoading} />
        <Numero rotulo="Concluíram" valor={r.concluidas} carregando={funil.isLoading} />
        <Numero rotulo="Pararam" valor={r.pararam} carregando={funil.isLoading} detalhe={r.recuperaveis ? `${r.recuperaveis} com contato há mais de 24 h` : undefined} />
        <Numero rotulo="Taxa de conclusão" texto={r.taxaConclusao === null ? "—" : pct(r.taxaConclusao)} carregando={funil.isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card className="flex flex-col gap-4" info={{ titulo: "Funil da abertura de conta", oQue: "Quantas pessoas chegaram a cada fase do cadastro nos últimos 90 dias.", comoCalcula: "Cada jornada conta em todas as fases até a mais adiantada em que deixou um passo registrado; quem concluiu conta em todas." }}>
          <h2 className="text-h3 m-0">Funil da abertura de conta</h2>
          {funil.isLoading ? <Skeleton className="h-40 w-full" /> : FASES_FUNIL.map((f, i) => {
            const fase = r.fases[i];
            return (
              <div key={f.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-caption">
                  <span className="text-muted">{f.rotulo}</span>
                  <span className="text-ink tabular-nums">{fase.alcancaram}{fase.fracao !== null && <span className="text-faint"> · {pct(fase.fracao)}</span>}</span>
                </div>
                <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-pill bg-ink" style={{ width: `${(fase.fracao ?? 0) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </Card>
        <Card className="flex flex-col gap-3" info={{ titulo: "Onde param", oQue: "O último passo de quem parou o cadastro.", comoCalcula: "Jornadas sem passo novo há mais de 30 minutos e sem conclusão, agrupadas pelo último passo registrado." }}>
          <h2 className="text-h3 m-0">Onde param</h2>
          {funil.isLoading ? <Skeleton className="h-32 w-full" /> : r.ondeParam.length === 0 ? (
            <span className="text-caption text-muted">Ninguém parou no meio do cadastro nos últimos 90 dias.</span>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col">
              {r.ondeParam.map((p, i) => (
                <li key={p.rotulo} className={`flex items-center justify-between gap-3 py-2 text-[14px] ${i ? "border-t border-border-soft" : ""}`}>
                  <span className="text-ink">{p.rotulo}</span>
                  <span className="text-muted tabular-nums">{p.quantas}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border-soft">
          <span className="text-label font-medium text-muted">Jornadas · últimos 90 dias</span>
          <Select
            value={filtro}
            onChange={(v) => setFiltro(v as typeof filtro)}
            options={[{ value: "todas", label: "Todas" }, { value: "parou", label: "Pararam" }, { value: "em_andamento", label: "Em andamento" }, { value: "concluida", label: "Concluíram" }]}
            containerClassName="min-w-[160px]"
          />
        </div>
        {funil.isLoading ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : lista.length === 0 ? (
          <div className="px-5 py-6 text-caption text-muted">Nenhuma jornada neste recorte.</div>
        ) : (
          <>
            <div className="hidden lg:grid grid-cols-[1.4fr_1.4fr_1.3fr_0.9fr_0.9fr_0.9fr] gap-3 px-5 py-2 text-[11px] font-medium text-faint border-b border-border-soft">
              <span>Pessoa</span><span>Contato</span><span>Último passo</span><span>Situação</span><span>Atualizada</span><span className="text-right">Documentos</span>
            </div>
            {lista.map((j, i) => <LinhaJornada key={j.id} j={j} agora={agora} primeira={i === 0} onDocs={setDocs} />)}
          </>
        )}
      </Card>
      {docs && <DocumentosModal orgId={docs.orgId} nome={docs.nome} onClose={() => setDocs(null)} />}
    </>
  );
}

function Numero({ rotulo, valor, texto, carregando, detalhe }: { rotulo: string; valor?: number; texto?: string; carregando?: boolean; detalhe?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{rotulo}</span>
      {carregando ? <Skeleton className="h-6 w-16" /> : <span className="text-[20px] font-semibold tabular-nums text-ink">{texto ?? (valor ?? 0).toLocaleString("pt-BR")}</span>}
      {detalhe && !carregando && <span className="text-caption text-muted">{detalhe}</span>}
    </Card>
  );
}

function LinhaJornada({ j, agora, primeira, onDocs }: { j: JornadaAdmin; agora: Date; primeira: boolean; onDocs: (d: { orgId: string; nome: string }) => void }) {
  const e = ESTADOS[estadoDaJornada(j, agora)];
  const contato = [telefone(j.whatsapp), j.email].filter(Boolean).join(" · ");
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-[1.4fr_1.4fr_1.3fr_0.9fr_0.9fr_0.9fr] gap-2 lg:gap-3 lg:items-center px-5 py-3 ${primeira ? "" : "border-t border-border-soft"}`}>
      <div className="min-w-0">
        <div className="text-[15px] font-medium text-ink truncate">{j.nome ?? "Sem nome ainda"}</div>
        <div className="text-caption text-faint truncate">{j.tipo === "pj" ? "Conta PJ" : j.tipo === "pf" ? "Conta PF" : "Tipo não escolhido"}{j.empresa ? ` · ${j.empresa}` : ""}</div>
      </div>
      <span className="text-caption text-muted truncate">{contato || "Não deixou contato"}</span>
      <span className="text-caption text-ink">{nomeDoPasso(j.etapa)}</span>
      <span><StatusBadge tone={e.tom}>{e.rotulo}</StatusBadge></span>
      <span className="text-caption text-faint">{quando(j.atualizadaEm)}</span>
      <span className="lg:text-right">
        {j.orgId ? (
          <button
            onClick={() => onDocs({ orgId: j.orgId!, nome: j.empresa ?? j.nome ?? "Empresa" })}
            className="inline-flex items-center gap-1 text-caption font-medium text-ink hover:underline"
          >
            <Icon name="file-text" size={14} color="var(--color-text-secondary)" />
            {j.documentos === 1 ? "1 documento" : `${j.documentos} documentos`}
          </button>
        ) : <span className="text-caption text-faint">—</span>}
      </span>
    </div>
  );
}

function DocumentosModal({ orgId, nome, onClose }: { orgId: string; nome: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin-cadastro-documentos", orgId], queryFn: () => getDocumentosCadastro(orgId), retry: false });
  React.useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  // ⚠️ Por portal: dentro de um Card (que tem transform) o `fixed` nasceria preso ao card.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Documentos de ${nome}`} className="bg-white w-full sm:max-w-xl sm:rounded-card rounded-t-card max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-caption text-faint">Documentos do cadastro · cada abertura fica registrada</div>
            <h3 className="m-0 text-h3 font-medium text-ink">{nome}</h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="inline-flex p-1 rounded-md hover:bg-surface-2"><Icon name="x" size={18} color="var(--color-text-secondary)" /></button>
        </div>
        {isDemo ? (
          <span className="text-caption text-muted">Na demonstração não há cofre: os documentos só existem nas contas de verdade.</span>
        ) : q.isLoading ? <Skeleton className="h-24 w-full" /> : q.isError ? (
          <span className="text-caption text-warning">{(q.error as Error)?.message ?? "Não foi possível ler os documentos."}</span>
        ) : (q.data ?? []).length === 0 ? (
          <span className="text-caption text-muted">Esta empresa não tem documento no cofre.</span>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col">
            {(q.data ?? []).map((d, i) => (
              <li key={d.id} className={`flex items-center justify-between gap-3 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-ink">{NOME_DOCUMENTO[d.tipo] ?? d.tipo}</div>
                  <div className="text-caption text-faint">Enviado em {quando(d.enviadoEm)} · {kb(d.tamanho)} · guardado até {d.guardarAte.slice(8, 10)}/{d.guardarAte.slice(5, 7)}/{d.guardarAte.slice(0, 4)}</div>
                </div>
                <a
                  href={rotaDoDocumento(d.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-pill bg-surface-2 hover:bg-surface-3 transition-colors px-4 h-9 text-[14px] text-ink shrink-0"
                >
                  <Icon name="eye" size={15} color="var(--color-text-secondary)" />
                  Abrir
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
