"use client";

/**
 * Administração › Comercial — o CRM da maquininha (etapa 2).
 *
 * Os pedidos que as empresas fazem na página Maquininha Quattro, num funil:
 * Novo · Em contato · Proposta · Aprovado · A caminho · Instalado · Perdido.
 * ⚠️ Cada coluna É uma situação do pedido (`FUNIL_COMERCIAL`): mover o card
 * muda a mesma situação que a empresa acompanha na página dela, pela mesma
 * função da plataforma (auditada). Nenhum número é calculado aqui: o
 * agrupamento e os totais saem de `montarFunil`/`resumoDoFunil`.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, PontoStatus, Select, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { formatBRL, pct } from "@/lib/format";
import { filaDePedidos, mudarSituacaoPedido, type PedidoNaFila } from "@/lib/maquininha-oferta";
import { FUNIL_COMERCIAL, NOME_MOTIVO_PERDA, faturamentoDoPedido, montarFunil, resumoDoFunil, situacaoDoContato, type SituacaoPedido } from "@/core/maquininha/oferta";
import { FichaLead } from "./FichaLead";

const OPCOES = FUNIL_COMERCIAL.map((c) => ({ value: c.situacao, label: c.nome }));
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Hoje no fuso de quem olha (o próximo contato é uma data, não um instante). */
const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function FunilComercial() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const q = useQuery({ queryKey: ["admin-maquininha-pedidos"], queryFn: filaDePedidos });
  const colunas = React.useMemo(() => montarFunil(q.data ?? []), [q.data]);
  const resumo = resumoDoFunil(colunas);
  const [aberto, setAberto] = React.useState<string | null>(null);
  const pedidoAberto = q.data?.find((p) => p.id === aberto) ?? null;
  const hoje = hojeLocal();

  const mover = async (id: string, situacao: SituacaoPedido) => {
    try {
      await mudarSituacaoPedido(id, situacao);
      show(`Movido para ${FUNIL_COMERCIAL.find((c) => c.situacao === situacao)?.nome ?? situacao}.`);
      await qc.invalidateQueries({ queryKey: ["admin-maquininha-pedidos"] });
    } catch (e) { show((e as Error).message); }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Numero rotulo="Em aberto" info="Pedidos fora de Instalado e Perdido.">{resumo.emAberto}</Numero>
        <Numero rotulo="Economia mostrada em aberto" info="Soma, por mês, da economia que a comparação mostrou aos clientes em aberto. Quem hoje paga menos que a Quattro não entra (a economia dele é negativa).">
          <BRL value={resumo.economiaEmAberto} />
        </Numero>
        <Numero rotulo="Faturamento em aberto" info="O faturamento por mês que os clientes em aberto declararam (ou o volume que simularam).">
          <BRL value={resumo.faturamentoEmAberto} />
        </Numero>
        <Numero rotulo="Conversão" info="Instalados ÷ (instalados + perdidos). Sem nenhum pedido fechado ainda, não há conversão a medir.">
          {resumo.conversao == null ? "—" : pct(resumo.conversao)}
        </Numero>
      </div>

      <Card padded={false} info={{ titulo: "Funil comercial", oQue: "Os pedidos de maquininha, da chegada à instalação. Cada coluna é a situação que a empresa vê na página dela.", comoCalcula: "Os 500 pedidos mais recentes. Dentro da coluna, quem viu mais economia vem primeiro. Mover um card muda a situação do pedido e entra na trilha da plataforma." }}>
        <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Funil comercial</div>
        {q.isLoading ? <div className="p-5"><Skeleton className="h-40 w-full" /></div> : q.error ? (
          <div className="p-5 text-caption text-negative">Não foi possível ler: {(q.error as Error).message}</div>
        ) : (
          <div className="p-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Colunas do funil">
            <div className="flex gap-3 min-w-max">
              {colunas.map((c) => (
                <section key={c.situacao} aria-label={c.nome} className="w-[232px] shrink-0 flex flex-col gap-2 rounded-md bg-surface-1 p-3">
                  <header className="flex flex-col gap-0.5 px-1 pb-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-label font-medium text-ink">{c.nome}</span>
                      <span className="text-caption text-muted tabular-nums">{c.pedidos.length}</span>
                    </div>
                    <span className="text-caption text-muted tabular-nums">
                      {c.economiaMes > 0 ? <>Economia de {formatBRL(c.economiaMes)}/mês</> : " "}
                    </span>
                  </header>
                  {c.pedidos.length === 0 ? (
                    <span className="text-caption text-faint px-1 py-2">Nenhum pedido.</span>
                  ) : c.pedidos.map((p) => <CartaoPedido key={p.id} p={p} hoje={hoje} aoMover={mover} aoAbrir={() => setAberto(p.id)} />)}
                </section>
              ))}
            </div>
          </div>
        )}
      </Card>
      {pedidoAberto && <FichaLead pedido={pedidoAberto} aoFechar={() => setAberto(null)} />}
      {node}
    </>
  );
}

function CartaoPedido({ p, hoje, aoMover, aoAbrir }: {
  p: PedidoNaFila;
  hoje: string;
  aoMover: (id: string, s: SituacaoPedido) => void;
  aoAbrir: () => void;
}) {
  const fat = faturamentoDoPedido(p);
  const contato = situacaoDoContato(p.proximo_contato, hoje);
  return (
    <article className="flex flex-col gap-2 rounded-md bg-white p-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-medium text-ink leading-tight">{p.empresa}</span>
          <span className="text-caption text-muted tabular-nums shrink-0">{dia(p.criado_em)}</span>
        </div>
        <span className="text-caption text-muted">
          {p.tipo === "pedir" ? `${p.quantidade} ${p.quantidade === 1 ? "maquininha" : "maquininhas"}` : `Vínculo do EC ${p.codigo_estabelecimento ?? "—"}`}
          {p.segmento ? ` · ${p.segmento}` : ""}
        </span>
      </div>
      {fat != null && <span className="text-caption text-ink tabular-nums">{formatBRL(fat)}/mês em vendas</span>}
      {p.origem !== "formulario" && (
        <span
          className="self-start text-[12px] font-medium px-[10px] py-[3px] rounded-pill text-ink tabular-nums"
          style={{ background: "var(--color-surface-1)" }}
          title={p.simulacao ? `Hoje ${formatBRL(p.simulacao.custoAtualMes)}/mês · Quattro ${formatBRL(p.simulacao.custoQuattroMes)}/mês` : undefined}
        >
          {p.origem === "economia" ? `Economia de ${p.simulacao ? formatBRL(p.simulacao.economiaMes) : "—"}/mês` : "Quer proposta de taxas"}
        </span>
      )}
      <span className="text-caption text-muted break-words">
        {[p.contato_nome, p.contato_telefone, p.contato_email].filter(Boolean).join(" · ")}
      </span>
      {p.observacao && <span className="text-caption text-muted break-words">&ldquo;{p.observacao}&rdquo;</span>}
      {(p.responsavel_email || contato || p.motivo_perda || (p.notas ?? 0) > 0) && (
        <div className="flex flex-col gap-0.5 border-t border-border-soft pt-2">
          {p.responsavel_email && <span className="text-caption text-muted break-words">Com {p.responsavel_email}</span>}
          {contato && (
            <span className="flex items-center gap-1.5 text-caption text-ink tabular-nums">
              <PontoStatus cor={contato === "atrasado" ? "var(--color-negative)" : contato === "hoje" ? "var(--color-warning)" : null} />
              {contato === "atrasado" ? "Contato atrasado desde" : contato === "hoje" ? "Contato hoje," : "Próximo contato"} {dia(p.proximo_contato!)}
            </span>
          )}
          {p.situacao === "cancelado" && p.motivo_perda && <span className="text-caption text-muted">Motivo: {NOME_MOTIVO_PERDA[p.motivo_perda]}</span>}
          {(p.notas ?? 0) > 0 && <span className="text-caption text-muted tabular-nums">{p.notas} {p.notas === 1 ? "anotação" : "anotações"}</span>}
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={aoAbrir}>Abrir ficha</Button>
      <Select aria-label={`Mover o pedido de ${p.empresa}`} value={p.situacao} onChange={(v) => aoMover(p.id, v as SituacaoPedido)} options={OPCOES} />
    </article>
  );
}

function Numero({ rotulo, info, children }: { rotulo: string; info: string; children: React.ReactNode }) {
  return (
    <Card info={{ titulo: rotulo, oQue: info }}>
      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted">{rotulo}</span>
        <span className="text-h2 text-ink tabular-nums">{children}</span>
      </div>
    </Card>
  );
}
