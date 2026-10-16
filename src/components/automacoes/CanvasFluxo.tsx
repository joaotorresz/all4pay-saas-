"use client";

/**
 * O fluxo desenhado como cards ligados (React Flow): QUANDO → O QUE → PARA QUEM.
 *
 * ⚠️ O desenho é só a LEITURA do fluxo — a ordem das peças é a do modelo
 * (`validarFluxo` cobra gatilho → dados → envio) e não se religa à mão. Ligar
 * fios livremente deixaria montar um fluxo que o motor recusa, e o erro só
 * apareceria no horário marcado. Arrastar muda a posição; clicar escolhe a
 * peça que o painel ao lado edita.
 *
 * Os cards seguem o DS (tokens, Lucide pelo `Icon`); do React Flow vem só o
 * `base.css`, que posiciona e não pinta.
 */
import * as React from "react";
import {
  ReactFlow, Background, Handle, Position, useNodesState,
  type Node, type Edge, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { Icon } from "@/components/ui";
import {
  descreverGatilho, FONTES_FLUXO, NOME_CANAL,
  type Fluxo, type NoFluxo, type ProblemaFluxo,
} from "@/core/automacoes/fluxo";

type DadosCard = {
  no: NoFluxo;
  selecionado: boolean;
  problemas: string[];
};

const PAPEL: Record<NoFluxo["tipo"], { rotulo: string; icone: string }> = {
  gatilho: { rotulo: "Quando", icone: "calendar" },
  dados: { rotulo: "O que", icone: "database" },
  envio: { rotulo: "Para quem", icone: "smartphone" },
};

export function tituloDoNo(no: NoFluxo): string {
  if (no.tipo === "gatilho") return descreverGatilho(no.gatilho);
  if (no.tipo === "dados") return FONTES_FLUXO[no.fonte].nome;
  return `${NOME_CANAL[no.canal]} · ${no.destinos.length} ${no.destinos.length === 1 ? "destinatário" : "destinatários"}`;
}

function resumoDoNo(no: NoFluxo): string {
  if (no.tipo === "gatilho") return "Horário de Brasília";
  if (no.tipo === "dados") return FONTES_FLUXO[no.fonte].resumo;
  const nomes = no.destinos.map((d) => d.nome || d.endereco).filter(Boolean);
  return nomes.length ? nomes.join(", ") : "Ninguém ainda";
}

function CardNo({ data }: NodeProps<Node<DadosCard>>) {
  const { no, selecionado, problemas } = data;
  const papel = PAPEL[no.tipo];
  const comProblema = problemas.length > 0;
  return (
    <div
      className={
        "w-[220px] rounded-card bg-surface-1 p-4 border transition-colors " +
        (comProblema ? "border-negative" : selecionado ? "border-ink" : "border-border")
      }
    >
      {no.tipo !== "gatilho" && <Handle type="target" position={Position.Left} isConnectable={false} />}
      <div className="flex items-center gap-2 mb-2">
        <span className="w-7 h-7 rounded-sm bg-surface-2 inline-flex items-center justify-center text-ink">
          <Icon name={papel.icone} size={15} color="currentColor" />
        </span>
        <span className="a4p-label text-faint">{papel.rotulo}</span>
      </div>
      <p className="text-label font-medium text-ink leading-snug">{tituloDoNo(no)}</p>
      <p className="text-caption text-muted mt-1 line-clamp-2">{resumoDoNo(no)}</p>
      {comProblema && <p className="text-caption text-negative mt-2">{problemas[0]}</p>}
      {no.tipo !== "envio" && <Handle type="source" position={Position.Right} isConnectable={false} />}
    </div>
  );
}

const TIPOS_DE_NO = { card: CardNo };
const ORDEM: NoFluxo["tipo"][] = ["gatilho", "dados", "envio"];

export function CanvasFluxo({
  fluxo, selecionado, problemas, onSelecionar,
}: {
  fluxo: Fluxo;
  selecionado: string | null;
  problemas: ProblemaFluxo[];
  onSelecionar: (id: string) => void;
}) {
  const montar = React.useCallback((): Node<DadosCard>[] => {
    const ordenados = [...fluxo.nos].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));
    let envios = 0;
    return ordenados.map((no, i) => {
      const linhaEnvio = no.tipo === "envio" ? envios++ : 0;
      return {
        id: no.id,
        type: "card",
        position: { x: Math.min(i, 2) * 260, y: linhaEnvio * 170 },
        data: {
          no,
          selecionado: no.id === selecionado,
          problemas: problemas.filter((p) => p.noId === no.id).map((p) => p.motivo),
        },
      };
    });
  }, [fluxo.nos, selecionado, problemas]);

  const [nos, setNos, aoMudarNos] = useNodesState<Node<DadosCard>>(montar());

  // Mantém a posição que a pessoa arrastou; troca só o conteúdo dos cards.
  React.useEffect(() => {
    setNos((atuais) => {
      const novos = montar();
      return novos.map((n) => {
        const antes = atuais.find((a) => a.id === n.id);
        return antes ? { ...n, position: antes.position } : n;
      });
    });
  }, [montar, setNos]);

  const ligacoes: Edge[] = fluxo.ligacoes.map((l) => ({
    id: `${l.de}->${l.para}`,
    source: l.de,
    target: l.para,
    style: { stroke: "var(--color-text-secondary)", strokeWidth: 1.5 },
  }));

  return (
    <div
      className="h-[360px] rounded-card bg-white overflow-hidden"
      role="region"
      aria-label="Desenho do fluxo"
    >
      <ReactFlow
        nodes={nos}
        edges={ligacoes}
        nodeTypes={TIPOS_DE_NO}
        onNodesChange={aoMudarNos}
        onNodeClick={(_, n) => onSelecionar(n.id)}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background color="var(--color-border)" gap={20} />
      </ReactFlow>
    </div>
  );
}
