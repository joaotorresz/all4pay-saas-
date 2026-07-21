"use client";

/**
 * Jornada de Adesão — a camada que resolve "muita função, pouca aderência".
 * `JornadaCard` (compacto, na Home) mostra o progresso e o PRÓXIMO passo;
 * `JornadaView` (página /comece) mostra os 4 estágios inteiros. Ambos leem o
 * motor `montarJornada` sobre o estado real (getRiscoInput) + as rotas já
 * vistas. O usuário caminha do essencial ao 100% sem se perder.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Icon, Button } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { montarJornada, rotasVistas, type Jornada, type EstagioJornada, type PassoJornada } from "@/lib/adoption";

/** Recalcula a jornada do estado real + rotas vistas (localStorage, no mount). */
export function useJornada(): { jornada: Jornada | undefined; isLoading: boolean } {
  const { data: input, isLoading } = useRiscoInput();
  const [vistas, setVistas] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => { setVistas(rotasVistas()); }, []);
  const jornada = React.useMemo(() => montarJornada(input, vistas), [input, vistas]);
  return { jornada, isLoading };
}

function Barra({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <div className={`h-[6px] rounded-pill bg-surface-2 overflow-hidden ${className}`}>
      <div className="h-full rounded-pill bg-lime transition-[width] duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
    </div>
  );
}

/** Card compacto da Home: progresso + próximo passo. Some ao chegar em 100%. */
export function JornadaCard() {
  const { jornada } = useJornada();
  const router = useRouter();
  if (!jornada || jornada.pct >= 100 || !jornada.proximo) return null;
  // Handoff com o FirstRunCard: enquanto nem o primeiro dado entrou, o convite
  // de primeiro acesso (upload) manda; a jornada assume quando há dados.
  if (!jornada.estagios[0]?.passos[0]?.feito) return null;
  const { pct, proximo, feitos, total } = jornada;

  return (
    <Card className="flex flex-col gap-4" info={{
      titulo: "Comece por aqui",
      oQue: "Sua jornada no all4pay em 4 estágios (conectar, organizar, analisar, operar). Cada passo é marcado sozinho quando você o cumpre.",
      comoCalcula: "O progresso é derivado do seu estado real: dados importados, contatos, categorias, e as telas que você já conheceu.",
    }}>
      <div className="flex items-center gap-3">
        <span className="w-[34px] h-[34px] rounded-md bg-lime inline-flex items-center justify-center shrink-0">
          <Icon name="target" size={18} color="var(--color-on-lime)" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-h3 font-medium text-ink">Comece por aqui</h2>
          <span className="text-caption text-faint">{feitos} de {total} passos · seu app fica mais completo a cada um</span>
        </div>
        <span className="text-value-lg font-semibold tabular-nums text-ink leading-none">{pct}%</span>
      </div>
      <Barra pct={pct} />

      {/* Próximo passo — o "faça isto agora" */}
      <div className="rounded-md bg-surface-2 p-4 flex items-start gap-3">
        <span className="w-6 h-6 rounded-pill border-2 border-lime inline-flex items-center justify-center shrink-0 mt-[1px]" />
        <div className="min-w-0 flex-1">
          <div className="text-caption font-medium text-faint tracking-wide">PRÓXIMO PASSO</div>
          <div className="text-[16px] font-medium text-ink mt-[1px]">{proximo.titulo}</div>
          <p className="m-0 text-caption text-muted leading-[1.45] mt-1">{proximo.desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={() => router.push(proximo.href)}>{proximo.cta}</Button>
        <Link href="/comece" className="text-caption text-muted hover:text-ink px-3 py-2 rounded-md hover:bg-surface-2 inline-flex items-center gap-1">
          Ver a jornada completa <Icon name="arrow-up-right" size={14} color="currentColor" />
        </Link>
      </div>
    </Card>
  );
}

/** Página /comece — os 4 estágios inteiros, com o próximo passo em destaque. */
export function JornadaView() {
  const { jornada, isLoading } = useJornada();
  const router = useRouter();

  return (
    <AppShell title="Comece por aqui">
      <div className="flex flex-col gap-5 pb-8 max-w-[900px]">
        {/* Cabeçalho de progresso */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-[38px] h-[38px] rounded-md bg-lime inline-flex items-center justify-center shrink-0">
              <Icon name="target" size={20} color="var(--color-on-lime)" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-h3 font-medium text-ink">
                {jornada && jornada.pct >= 100 ? "Você domina o all4pay 🎉" : "Sua jornada no all4pay"}
              </h2>
              <span className="text-caption text-faint">
                {isLoading ? "carregando…" : jornada && jornada.pct >= 100
                  ? "Todos os estágios concluídos — você está usando o sistema por inteiro."
                  : `${jornada?.feitos ?? 0} de ${jornada?.total ?? 0} passos · do essencial ao domínio, no seu ritmo`}
              </span>
            </div>
            <span className="text-display font-semibold tabular-nums text-ink leading-none">{jornada?.pct ?? 0}%</span>
          </div>
          <Barra pct={jornada?.pct ?? 0} />
          {jornada?.proximo && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-caption text-muted">Próximo:</span>
              <span className="text-caption font-medium text-ink">{jornada.proximo.titulo}</span>
              <Button size="sm" variant="primary" className="ml-auto" onClick={() => router.push(jornada.proximo!.href)}>
                {jornada.proximo.cta}
              </Button>
            </div>
          )}
        </Card>

        {/* Estágios */}
        {jornada?.estagios.map((e, i) => <EstagioBloco key={e.id} estagio={e} indice={i + 1} onGo={(h) => router.push(h)} />)}
      </div>
    </AppShell>
  );
}

function EstagioBloco({ estagio, indice, onGo }: { estagio: EstagioJornada; indice: number; onGo: (href: string) => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={`w-8 h-8 rounded-pill inline-flex items-center justify-center shrink-0 text-caption font-semibold tabular-nums ${estagio.concluido ? "bg-lime text-on-lime" : "bg-surface-2 text-muted"}`}>
          {estagio.concluido ? <Icon name="check" size={16} color="var(--color-on-lime)" /> : indice}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[17px] font-semibold text-ink">{estagio.titulo}</h3>
          <span className="text-caption text-faint">{estagio.subtitulo}</span>
        </div>
        <span className="text-caption text-muted tabular-nums shrink-0">{estagio.feitos}/{estagio.total}</span>
      </div>
      <div className="flex flex-col">
        {estagio.passos.map((p) => <PassoLinha key={p.id} passo={p} onGo={onGo} />)}
      </div>
    </Card>
  );
}

function PassoLinha({ passo, onGo }: { passo: PassoJornada; onGo: (href: string) => void }) {
  return (
    <div className="flex items-start gap-3 py-3 border-t border-border-soft first:border-t-0">
      <span className={`w-[22px] h-[22px] rounded-pill inline-flex items-center justify-center shrink-0 mt-[1px] ${passo.feito ? "bg-lime" : "border-2 border-border"}`}>
        {passo.feito && <Icon name="check" size={13} color="var(--color-on-lime)" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] font-medium ${passo.feito ? "text-muted line-through decoration-1" : "text-ink"}`}>{passo.titulo}</div>
        <p className="m-0 text-caption text-muted leading-[1.45] mt-[1px]">{passo.desc}</p>
      </div>
      <button
        onClick={() => onGo(passo.href)}
        className="text-caption font-medium text-muted hover:text-ink px-3 py-[6px] rounded-md hover:bg-surface-2 inline-flex items-center gap-1 shrink-0"
      >
        {passo.feito ? "Abrir" : passo.cta} <Icon name="arrow-up-right" size={13} color="currentColor" />
      </button>
    </div>
  );
}
