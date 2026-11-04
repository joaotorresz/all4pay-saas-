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
  BRL, Badge, Button, Card, CurrencyInput, Icon, Input, Select, Skeleton, Switch,
} from "@/components/ui";
import {
  NIVEIS, ROTULO_ESTADO, descricaoDe, resumoDoNivel,
  type ConfigAgente, type IdAgente, type NivelAgente, type PropostaAgente,
} from "@/core/agentes";
import { decidirProposta, executarAprovada, listarAgentes, listarPropostas, salvarAgente } from "@/lib/agentes";
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
        <Card padded={false} className="flex flex-col" data-lista="agentes">
          {(configs.data ?? []).map((c, i) => (
            <LinhaAgente key={c.agente} inicial={c} primeira={i === 0} onSalvo={(m) => { setAviso(m); recarregar(); }} />
          ))}
        </Card>
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
      if (aprovar && (p.agente === "cobranca" || p.agente === "conciliacao")) onDecidido(`${p.titulo}. ${await executarAprovada(p.id, p.agente)}`);
      else onDecidido(`${p.titulo}: ${(aprovar ? ROTULO_ESTADO.aprovada : ROTULO_ESTADO.recusada).toLowerCase()}.`);
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

/** O ícone de cada agente (chaves do sistema, `ui/lucide-icons`). */
const ICONE: Record<IdAgente, string> = {
  cobranca: "coins",
  conciliacao: "arrow-left-right",
  contas_pagar: "receipt",
  caixa: "landmark",
  fechamento: "list-checks",
};

/** O que muda na empresa quando o agente liga. */
const AO_LIGAR: Partial<Record<IdAgente, string>> = {
  cobranca: "Com ele ligado, a régua de cobrança não envia sozinha: cada cobrança do dia passa por ele, pela mesma régua e pelo mesmo canal.",
  conciliacao: "Sozinho, ele só concilia o par de confiança alta. O resto sempre espera a sua aprovação, e o par recusado não volta.",
};

/**
 * Uma LINHA por agente, como uma lista de tarefas: ícone, nome, missão e o
 * estado à direita. O clique abre o que ele pode fazer sozinho, na própria
 * linha (sem segunda tela).
 */
function LinhaAgente({ inicial, primeira, onSalvo }: { inicial: ConfigAgente; primeira: boolean; onSalvo: (m: string) => void }) {
  const desc = descricaoDe(inicial.agente);
  const [aberto, setAberto] = React.useState(false);
  const [cfg, setCfg] = React.useState<ConfigAgente>(inicial);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  React.useEffect(() => setCfg(inicial), [inicial]);

  const alterado = JSON.stringify(cfg) !== JSON.stringify(inicial);
  const niveis = NIVEIS.filter((n) => n.nivel <= desc.nivelMaximo);
  const nivelAtual = NIVEIS.find((n) => n.nivel === Math.min(inicial.nivel, desc.nivelMaximo))?.nome ?? "";
  const idPainel = `agente-${desc.id}-painel`;

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
    <div className={primeira ? "" : "border-t border-border-soft"} data-agente={desc.id}>
      <button
        type="button"
        className="w-full flex items-center gap-4 px-6 py-4 text-left bg-transparent border-0 cursor-pointer"
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={() => setAberto((a) => !a)}
      >
        <span className="w-10 h-10 shrink-0 rounded-md bg-surface-2 flex items-center justify-center text-ink">
          <Icon name={ICONE[desc.id]} size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-label text-ink">{desc.nome}</span>
          <span className="block text-caption text-muted sm:truncate">{desc.missao}</span>
          {!desc.pronto && <span className="sm:hidden mt-1 inline-flex"><Badge variant="neutral">Em construção</Badge></span>}
        </span>
        <span className="hidden sm:block text-caption text-faint shrink-0">{inicial.ativo ? nivelAtual : "Desligado"}</span>
        {!desc.pronto && <span className="hidden sm:inline-flex shrink-0"><Badge variant="neutral">Em construção</Badge></span>}
        <Icon name={aberto ? "chevron-up" : "chevron-down"} size={16} className="text-faint shrink-0" />
      </button>

      {aberto && (
        <div id={idPainel} className="flex flex-col gap-4 px-6 pb-5 sm:pl-[80px]">
          <dl className="m-0 grid gap-3 sm:grid-cols-2 text-caption">
            <div><dt className="a4p-label text-faint">Quando trabalha</dt><dd className="m-0 text-ink">{desc.gatilho}</dd></div>
            <div><dt className="a4p-label text-faint">O que prepara</dt><dd className="m-0 text-ink">{desc.prepara}</dd></div>
          </dl>

          <div className="flex items-end gap-4 flex-wrap">
            <Select
              label="O que ele pode fazer sozinho"
              value={String(Math.min(cfg.nivel, desc.nivelMaximo))}
              onChange={(v) => setCfg((c) => ({ ...c, nivel: Number(v) as NivelAgente }))}
              options={niveis.map((n) => ({ value: String(n.nivel), label: n.nome }))}
              containerClassName="flex-1 min-w-[220px]"
            />
            <Switch
              id={`sw-agente-${desc.id}`}
              checked={cfg.ativo}
              disabled={!desc.pronto}
              label={cfg.ativo ? "Ligado" : "Desligado"}
              onChange={(on) => setCfg((c) => ({ ...c, ativo: on }))}
            />
          </div>

          {cfg.nivel === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <CurrencyInput id={`lim-valor-${desc.id}`} label="Limite por ação" value={cfg.limiteValor}
                onValueChange={(v) => setCfg((c) => ({ ...c, limiteValor: Math.max(0, v) }))} />
              <Input id={`lim-dia-${desc.id}`} label="Ações sozinho por dia" type="number" min={0} max={1000}
                value={String(cfg.limiteDia)}
                onChange={(e) => setCfg((c) => ({ ...c, limiteDia: Math.max(0, Math.min(1000, Math.floor(Number(e.target.value) || 0))) }))} />
            </div>
          )}

          {AO_LIGAR[desc.id] && <p className="m-0 text-caption text-muted" data-ao-ligar>{AO_LIGAR[desc.id]}</p>}

          <p className="m-0 text-caption text-muted" data-resumo-nivel>
            {desc.nivelMaximo < 3 ? "Este agente sempre pede a sua aprovação antes de agir. " : ""}
            {resumoDoNivel(cfg, formatBRL)}
          </p>
          {erro && <p className="m-0 text-caption text-ink" role="alert">Não foi possível salvar: {erro}</p>}

          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={!alterado || salvando} onClick={salvar}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
