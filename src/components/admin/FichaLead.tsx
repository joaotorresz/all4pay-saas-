"use client";

/**
 * Administração › Comercial › ficha do lead (CRM da maquininha, etapa 3).
 *
 * Abre por cima do funil: o pedido como a empresa mandou, a simulação que
 * ela fez e o trabalho comercial em volta dele — responsável, próximo
 * contato, taxas propostas (com a economia refeita pela MESMA conta da
 * página do cliente, `comparacaoDaProposta`), motivo da perda e as
 * anotações. ⚠️ Onde o pedido está continua sendo a situação do funil: a
 * ficha não tem etapa própria. ⚠️ Anotação é histórico: não se edita nem
 * se apaga.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, DateField, Icon, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { formatBRL, pct } from "@/lib/format";
import {
  anotarLead, fichaDoLead, salvarLead, type DadosDoLead, type PedidoNaFila,
} from "@/lib/maquininha-oferta";
import {
  FUNIL_COMERCIAL, NOME_FORMA, NOME_MOTIVO_PERDA, TETO_TAXA_PROPOSTA, comparacaoDaProposta,
  faturamentoDoPedido, type FormaOferta, type MotivoPerda, type TaxasPorForma,
} from "@/core/maquininha/oferta";

const FORMAS: FormaOferta[] = ["pix", "debito", "credito", "parcelado"];
const MOTIVOS = (Object.keys(NOME_MOTIVO_PERDA) as MotivoPerda[]).map((m) => ({ value: m, label: NOME_MOTIVO_PERDA[m] }));
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const quando = (iso: string) => {
  const d = new Date(iso);
  return `${dia(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
/** "1,49" → 0,0149. Vazio → null; texto que não é número → NaN (a tela recusa). */
const lerPercentual = (t: string) => (t.trim() === "" ? null : Number(t.trim().replace(",", ".")) / 100);
const mostrarPercentual = (x: number | null | undefined) => (x == null ? "" : (Math.round(x * 10_000) / 100).toString().replace(".", ","));

export function FichaLead({ pedido, aoFechar }: { pedido: PedidoNaFila; aoFechar: () => void }) {
  const qc = useQueryClient();
  const chave = ["admin-maquininha-lead", pedido.id];
  const q = useQuery({ queryKey: chave, queryFn: () => fichaDoLead(pedido.id) });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aoFechar]);

  if (typeof document === "undefined") return null;
  const situacao = FUNIL_COMERCIAL.find((c) => c.situacao === pedido.situacao)?.nome ?? pedido.situacao;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={aoFechar}>
      <div className="w-[880px] max-w-full my-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Ficha de ${pedido.empresa}`}>
        <Card padded={false} className="flex flex-col max-h-[92vh]">
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border-soft">
            <div className="flex flex-col gap-0.5">
              <span className="text-h3 font-medium text-ink">{pedido.empresa}</span>
              <span className="text-caption text-muted">{situacao} · pedido de {dia(pedido.criado_em)}</span>
            </div>
            <button className="inline-flex bg-transparent cursor-pointer p-[2px]" onClick={aoFechar} aria-label="Fechar">
              <Icon name="x" size={18} color="var(--color-text-secondary)" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5 grid md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-5">
              <DadosDoPedido p={pedido} />
              {pedido.simulacao && <Simulacao p={pedido} taxas={q.data?.taxas_propostas ?? null} />}
            </div>
            <div className="flex flex-col gap-5">
              {q.isLoading ? <Skeleton className="h-64 w-full" /> : q.error ? (
                <span className="text-caption text-negative">Não foi possível abrir a ficha: {(q.error as Error).message}</span>
              ) : q.data && (
                <>
                  <Acompanhamento
                    key={q.data.atualizado_em ?? "nova"}
                    pedido={pedido}
                    inicial={q.data}
                    responsaveis={q.data.responsaveis}
                    aoSalvar={async () => {
                      await qc.invalidateQueries({ queryKey: chave });
                      await qc.invalidateQueries({ queryKey: ["admin-maquininha-pedidos"] });
                    }}
                  />
                  <Anotacoes
                    pedido={pedido.id}
                    notas={q.data.notas}
                    aoAnotar={async () => {
                      await qc.invalidateQueries({ queryKey: chave });
                      await qc.invalidateQueries({ queryKey: ["admin-maquininha-pedidos"] });
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>,
    document.body,
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="text-label font-medium text-ink">{titulo}</span>
      {children}
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-caption">
      <span className="text-muted">{rotulo}</span>
      <span className="text-ink text-right break-words min-w-0">{children}</span>
    </div>
  );
}

function DadosDoPedido({ p }: { p: PedidoNaFila }) {
  const fat = faturamentoDoPedido(p);
  return (
    <Bloco titulo="Pedido">
      <Linha rotulo="O que pediu">
        {p.tipo === "pedir" ? `${p.quantidade} ${p.quantidade === 1 ? "maquininha" : "maquininhas"}` : `Vínculo do EC ${p.codigo_estabelecimento ?? "—"}`}
      </Linha>
      {p.segmento && <Linha rotulo="Segmento">{p.segmento}</Linha>}
      {fat != null && <Linha rotulo="Vendas por mês"><span className="tabular-nums">{formatBRL(fat)}</span></Linha>}
      <Linha rotulo="Contato">{p.contato_nome}</Linha>
      {p.contato_telefone && <Linha rotulo="Telefone"><span className="tabular-nums">{p.contato_telefone}</span></Linha>}
      {p.contato_email && <Linha rotulo="E-mail">{p.contato_email}</Linha>}
      {p.endereco && <Linha rotulo="Endereço">{p.endereco}</Linha>}
      {p.observacao && <Linha rotulo="Observação">&ldquo;{p.observacao}&rdquo;</Linha>}
    </Bloco>
  );
}

function Simulacao({ p, taxas }: { p: PedidoNaFila; taxas: TaxasPorForma | null }) {
  const s = p.simulacao!;
  const proposta = comparacaoDaProposta(s, taxas);
  return (
    <Bloco titulo="Simulação do cliente">
      <span className="text-caption text-muted">
        {formatBRL(s.volumeMensal)} por mês{s.antecipado ? ", recebendo antecipado" : ""}.
      </span>
      <table className="w-full text-caption">
        <thead>
          <tr className="text-muted">
            <th className="text-left font-medium py-1">Forma</th>
            <th className="text-right font-medium py-1">Mix</th>
            <th className="text-right font-medium py-1">Hoje</th>
            <th className="text-right font-medium py-1">Quattro</th>
            {proposta && <th className="text-right font-medium py-1">Proposta</th>}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {FORMAS.map((f) => (
            <tr key={f} className="border-t border-border-soft">
              <td className="py-1 text-ink">{NOME_FORMA[f]}</td>
              <td className="py-1 text-right text-ink">{pct(s.mix[f])}</td>
              <td className="py-1 text-right text-ink" title={s.taxasAtuais[f].origem === "estimada" ? "Estimada pelo mercado" : "Informada pelo cliente"}>
                {pct(s.taxasAtuais[f].taxa, 2)}{s.taxasAtuais[f].origem === "estimada" ? "*" : ""}
              </td>
              <td className="py-1 text-right text-ink">{s.taxasQuattro[f] == null ? "—" : pct(s.taxasQuattro[f]!, 2)}</td>
              {proposta && <td className="py-1 text-right text-ink">{taxas?.[f] == null ? "—" : pct(taxas[f]!, 2)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="text-caption text-muted">* estimada pelo mercado; o cliente não informou.</span>
      <Linha rotulo="Custo hoje"><span className="tabular-nums">{formatBRL(s.custoAtualMes)}/mês</span></Linha>
      <Linha rotulo="Com a Quattro (tabela)"><span className="tabular-nums">{formatBRL(s.custoQuattroMes)}/mês</span></Linha>
      <Linha rotulo="Economia mostrada"><span className="tabular-nums">{formatBRL(s.economiaMes)}/mês</span></Linha>
      {proposta && (
        <>
          <Linha rotulo="Com a proposta"><span className="tabular-nums">{formatBRL(proposta.custoQuattro)}/mês</span></Linha>
          <Linha rotulo="Economia com a proposta"><span className="tabular-nums font-medium">{formatBRL(proposta.diferencaMensal)}/mês</span></Linha>
        </>
      )}
    </Bloco>
  );
}

function Acompanhamento({ pedido, inicial, responsaveis, aoSalvar }: {
  pedido: PedidoNaFila;
  inicial: DadosDoLead;
  responsaveis: { id: string; email: string }[];
  aoSalvar: () => Promise<void>;
}) {
  const [resp, setResp] = React.useState(inicial.responsavel ?? "");
  const [proximo, setProximo] = React.useState(inicial.proximo_contato ?? "");
  const [motivo, setMotivo] = React.useState<string>(inicial.motivo_perda ?? "");
  const [detalhe, setDetalhe] = React.useState(inicial.motivo_detalhe ?? "");
  const [taxas, setTaxas] = React.useState<Record<FormaOferta, string>>(() => ({
    pix: mostrarPercentual(inicial.taxas_propostas?.pix), debito: mostrarPercentual(inicial.taxas_propostas?.debito),
    credito: mostrarPercentual(inicial.taxas_propostas?.credito), parcelado: mostrarPercentual(inicial.taxas_propostas?.parcelado),
  }));
  const [salvando, setSalvando] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const perdido = pedido.situacao === "cancelado";

  const lidas = FORMAS.map((f) => [f, lerPercentual(taxas[f])] as const);
  const invalida = lidas.find(([, v]) => v != null && (!Number.isFinite(v) || v < 0 || v > TETO_TAXA_PROPOSTA));

  const salvar = async () => {
    if (invalida) return;
    setSalvando(true); setMsg(null);
    try {
      const propostas: TaxasPorForma = {};
      for (const [f, v] of lidas) if (v != null) propostas[f] = v;
      await salvarLead(pedido.id, {
        responsavel: resp || null,
        proximo_contato: proximo || null,
        motivo_perda: (motivo || null) as MotivoPerda | null,
        motivo_detalhe: detalhe.trim() || null,
        taxas_propostas: Object.keys(propostas).length ? propostas : null,
      });
      await aoSalvar();
      setMsg("Ficha salva.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Bloco titulo="Acompanhamento">
      <Select
        label="Responsável"
        value={resp}
        onChange={setResp}
        options={[{ value: "", label: "Sem responsável" }, ...responsaveis.map((r) => ({ value: r.id, label: r.email }))]}
      />
      <DateField label="Próximo contato" value={proximo} onChange={setProximo} />
      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted">Taxas propostas (%) — a forma em branco segue a tabela</span>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS.map((f) => (
            <Input
              key={f}
              label={NOME_FORMA[f]}
              inputMode="decimal"
              placeholder={pedido.simulacao?.taxasQuattro[f] == null ? "—" : mostrarPercentual(pedido.simulacao.taxasQuattro[f])}
              value={taxas[f]}
              invalid={invalida?.[0] === f}
              onChange={(e) => setTaxas({ ...taxas, [f]: e.target.value })}
            />
          ))}
        </div>
        {invalida && <span className="text-caption text-negative">A taxa de {NOME_FORMA[invalida[0]].toLowerCase()} tem de ficar entre 0% e {pct(TETO_TAXA_PROPOSTA, 0)}.</span>}
      </div>
      {(perdido || motivo) && (
        <>
          <Select label="Motivo da perda" value={motivo} onChange={setMotivo} placeholder="Escolha o motivo" options={[{ value: "", label: "Sem motivo" }, ...MOTIVOS]} invalid={perdido && !motivo} />
          <Input label="Detalhe" value={detalhe} maxLength={300} onChange={(e) => setDetalhe(e.target.value)} placeholder="Ex.: fechou com a Stone a 1,2% no débito" />
        </>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={salvar} disabled={salvando || !!invalida}>{salvando ? "Salvando…" : "Salvar ficha"}</Button>
        {msg && <span className="text-caption text-muted" role="status">{msg}</span>}
      </div>
    </Bloco>
  );
}

function Anotacoes({ pedido, notas, aoAnotar }: {
  pedido: string;
  notas: { id: string; autor_email: string | null; texto: string; criado_em: string }[];
  aoAnotar: () => Promise<void>;
}) {
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const anotar = async () => {
    setEnviando(true); setErro(null);
    try {
      await anotarLead(pedido, texto);
      setTexto("");
      await aoAnotar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Bloco titulo="Anotações">
      <Textarea aria-label="Nova anotação" rows={3} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que foi conversado, o que ficou combinado" />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={anotar} disabled={enviando || !texto.trim()}>{enviando ? "Anotando…" : "Anotar"}</Button>
        {erro && <span className="text-caption text-negative">{erro}</span>}
      </div>
      {notas.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma anotação ainda.</span>
      ) : (
        <ol className="flex flex-col gap-2">
          {notas.map((n) => (
            <li key={n.id} className="rounded-md bg-surface-1 p-3 flex flex-col gap-1">
              <span className="text-caption text-muted tabular-nums">{quando(n.criado_em)} · {n.autor_email ?? "—"}</span>
              <span className="text-caption text-ink whitespace-pre-wrap break-words">{n.texto}</span>
            </li>
          ))}
        </ol>
      )}
    </Bloco>
  );
}
