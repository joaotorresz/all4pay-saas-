"use client";

/**
 * AGENTES — o que cada agente da Quattro AI pode fazer nesta empresa, e a fila
 * "Para você aprovar" (Etapa 1 do plano "AI first", 04/11/2026).
 *
 * ⚠️ A tela só apresenta: o nível máximo, quem decide e a máquina de estados
 * moram no banco (migration 20261104120000). O agente que ainda não foi
 * construído aparece "Em construção" e não liga.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BRL, Badge, Button, Card, CurrencyInput, Input, Select, Skeleton, Switch,
} from "@/components/ui";
import {
  NIVEIS, ROTULO_ESTADO, descricaoDe, resumoDoNivel,
  type ConfigAgente, type NivelAgente, type PropostaAgente,
} from "@/core/agentes";
import { decidirProposta, listarAgentes, listarPropostas, salvarAgente } from "@/lib/agentes";
import { formatBRL } from "@/lib/format";

const CHAVE_AGENTES = ["agentes", "config"] as const;
const CHAVE_PROPOSTAS = ["agentes", "propostas"] as const;

export function AgentesView() {
  const qc = useQueryClient();
  const configs = useQuery({ queryKey: CHAVE_AGENTES, queryFn: listarAgentes });
  const propostas = useQuery({ queryKey: CHAVE_PROPOSTAS, queryFn: listarPropostas });
  const [aviso, setAviso] = React.useState<string | null>(null);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: CHAVE_AGENTES });
    void qc.invalidateQueries({ queryKey: CHAVE_PROPOSTAS });
  };

  return (
    <div className="flex flex-col gap-4" data-tela="agentes">
      <FilaAprovacao propostas={propostas.data} erro={propostas.error as Error | null}
        carregando={propostas.isLoading} onDecidido={(m) => { setAviso(m); recarregar(); }} />

      {aviso && <Card className="text-caption text-ink" role="status">{aviso}</Card>}

      {configs.isLoading ? (
        <Card><Skeleton className="h-40 w-full" /></Card>
      ) : configs.error ? (
        <Card className="text-caption text-ink">Não foi possível ler os agentes: {(configs.error as Error).message}</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(configs.data ?? []).map((c) => (
            <CartaoAgente key={c.agente} inicial={c} onSalvo={(m) => { setAviso(m); recarregar(); }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── a fila ────────────────────────── */

function FilaAprovacao({ propostas, erro, carregando, onDecidido }: {
  propostas?: PropostaAgente[]; erro: Error | null; carregando: boolean; onDecidido: (m: string) => void;
}) {
  const pendentes = (propostas ?? []).filter((p) => p.estado === "pendente");
  return (
    <Card className="flex flex-col gap-3" data-fila="agentes">
      <div className="flex items-center gap-2">
        <div className="text-h3 font-display text-ink">Para você aprovar</div>
        {pendentes.length > 0 && <Badge variant="count">{pendentes.length}</Badge>}
      </div>
      {carregando ? (
        <Skeleton className="h-16 w-full" />
      ) : erro ? (
        <span className="text-caption text-ink">Não foi possível ler a fila: {erro.message}</span>
      ) : pendentes.length === 0 ? (
        <p className="m-0 text-caption text-muted">
          Nada esperando por você. Quando um agente preparar algo, aparece aqui para você aprovar ou recusar.
        </p>
      ) : (
        pendentes.map((p) => <LinhaProposta key={p.id} p={p} onDecidido={onDecidido} />)
      )}
    </Card>
  );
}

function LinhaProposta({ p, onDecidido }: { p: PropostaAgente; onDecidido: (m: string) => void }) {
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const decidir = async (aprovar: boolean) => {
    setOcupado(true); setErro(null);
    try {
      await decidirProposta(p.id, aprovar);
      onDecidido(`${p.titulo}: ${(aprovar ? ROTULO_ESTADO.aprovada : ROTULO_ESTADO.recusada).toLowerCase()}.`);
    } catch (e) {
      setErro((e as Error).message);
    } finally { setOcupado(false); }
  };
  return (
    <div className="flex items-start gap-3 flex-wrap border-t border-border-soft pt-3" data-proposta={p.id}>
      <div className="flex-1 min-w-[220px]">
        <div className="text-label text-ink">{p.titulo}</div>
        <p className="m-0 text-caption text-faint">{descricaoDe(p.agente).nome} · {p.porque}</p>
        {erro && <p className="m-0 text-caption text-ink" role="alert">{erro}</p>}
      </div>
      {p.valor != null && <span className="text-label text-ink"><BRL value={p.valor} /></span>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={ocupado} onClick={() => decidir(true)}>Aprovar</Button>
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => decidir(false)}>Recusar</Button>
      </div>
    </div>
  );
}

/* ────────────────────────── um agente ────────────────────────── */

function CartaoAgente({ inicial, onSalvo }: { inicial: ConfigAgente; onSalvo: (m: string) => void }) {
  const desc = descricaoDe(inicial.agente);
  const [cfg, setCfg] = React.useState<ConfigAgente>(inicial);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  React.useEffect(() => setCfg(inicial), [inicial]);

  const alterado = JSON.stringify(cfg) !== JSON.stringify(inicial);
  const niveis = NIVEIS.filter((n) => n.nivel <= desc.nivelMaximo);

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      await salvarAgente(cfg);
      onSalvo(`${desc.nome}: configuração salva.`);
    } catch (e) {
      setErro((e as Error).message);
    } finally { setSalvando(false); }
  };

  return (
    <Card className="flex flex-col gap-4" data-agente={desc.id}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-h3 font-display text-ink">{desc.nome}</span>
            {!desc.pronto && <Badge variant="neutral">Em construção</Badge>}
          </div>
          <p className="m-0 text-caption text-muted">{desc.missao}</p>
        </div>
        <Switch
          id={`sw-agente-${desc.id}`}
          checked={cfg.ativo}
          disabled={!desc.pronto}
          label={cfg.ativo ? "Ligado" : "Desligado"}
          onChange={(on) => setCfg((c) => ({ ...c, ativo: on }))}
        />
      </div>

      <dl className="m-0 grid gap-2 text-caption">
        <div><dt className="a4p-label text-faint">Quando trabalha</dt><dd className="m-0 text-ink">{desc.gatilho}</dd></div>
        <div><dt className="a4p-label text-faint">O que prepara</dt><dd className="m-0 text-ink">{desc.prepara}</dd></div>
      </dl>

      <Select
        label="O que ele pode fazer sozinho"
        value={String(Math.min(cfg.nivel, desc.nivelMaximo))}
        onChange={(v) => setCfg((c) => ({ ...c, nivel: Number(v) as NivelAgente }))}
        options={niveis.map((n) => ({ value: String(n.nivel), label: n.nome }))}
      />
      {desc.nivelMaximo < 3 && (
        <p className="m-0 text-caption text-faint">Este agente sempre pede a sua aprovação antes de agir.</p>
      )}

      {cfg.nivel === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <CurrencyInput id={`lim-valor-${desc.id}`} label="Limite por ação" value={cfg.limiteValor}
            onValueChange={(v) => setCfg((c) => ({ ...c, limiteValor: Math.max(0, v) }))} />
          <Input id={`lim-dia-${desc.id}`} label="Ações sozinho por dia" type="number" min={0} max={1000}
            value={String(cfg.limiteDia)}
            onChange={(e) => setCfg((c) => ({ ...c, limiteDia: Math.max(0, Math.min(1000, Math.floor(Number(e.target.value) || 0))) }))} />
        </div>
      )}

      <p className="m-0 text-caption text-muted" data-resumo-nivel>{resumoDoNivel(cfg, formatBRL)}</p>
      {erro && <p className="m-0 text-caption text-ink" role="alert">Não foi possível salvar: {erro}</p>}

      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!alterado || salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}

