"use client";

/**
 * ENTRADA POR NF-e — o XML da nota de compra vira entrada de estoque.
 *
 * Aberto só pela porta única (`abrirCriacao("entrada-nfe")`). Três passos na
 * mesma janela: escolher o XML, conferir item a item (produto e fator de
 * unidade) e confirmar. A leitura e a conta moram em `core/estoque/nfe`; a
 * gravação, em `lib/estoque` (o escritor único dos movimentos).
 */
import * as React from "react";
import { BRL, Button, Icon, Input, Select } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { cadastroDe } from "@/components/app/criacao";
import { formatarChave } from "@/core/compras/nfe";
import { formatarQuantidade, lerQuantidade } from "@/core/estoque";
import {
  lerNFe, sugerirProduto, movimentosDaNota, vinculosDaEntrada, errosDaEntrada,
  type NotaCompra, type EscolhaItem, type ComoAchou,
} from "@/core/estoque/nfe";
import {
  useSaldosEstoque, useVinculosFornecedor, useRegistrarEntradaNota, itensJaImportados,
} from "@/lib/estoque";

const COMO: Record<ComoAchou, string> = {
  vinculo: "Escolhido na última nota deste fornecedor",
  sku: "Código do fornecedor igual ao SKU",
  ean: "Código de barras igual ao SKU",
};

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const doc = (d: string | null) => {
  const n = (d ?? "").replace(/\D/g, "");
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d ?? "";
};

interface Linha extends EscolhaItem {
  fatorTexto: string;
  como: ComoAchou | null;
}

export function EntradaNFeForm({
  onClose, onToast, onCriado,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
  onCriado?: (id: string | null) => void;
}) {
  const saldos = useSaldosEstoque();
  const vinculos = useVinculosFornecedor();
  const registrar = useRegistrarEntradaNota();
  const arquivo = React.useRef<HTMLInputElement>(null);
  const [nota, setNota] = React.useState<NotaCompra | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [jaEntrou, setJaEntrou] = React.useState<Set<number>>(new Set());
  const [linhas, setLinhas] = React.useState<Linha[]>([]);
  const [tentou, setTentou] = React.useState(false);

  const produtos = React.useMemo(() => saldos.data ?? [], [saldos.data]);
  const opcoes = produtos.map((p) => ({ value: p.produtoId, label: p.sku ? `${p.nome} · ${p.sku}` : p.nome }));
  const unidadeDe = (id: string | null) => produtos.find((p) => p.produtoId === id)?.unidade ?? null;

  const abrirXml = async (f?: File) => {
    if (!f) return;
    setErro(null);
    setTentou(false);
    const leitura = lerNFe(await f.text());
    if (!leitura.ok) { setNota(null); setErro(leitura.motivo); return; }
    const n = leitura.nota;
    let ja = new Set<number>();
    try { ja = new Set(await itensJaImportados(n.chave)); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível conferir se a nota já entrou."); return; }
    const prods = produtos.map((p) => ({ produtoId: p.produtoId, sku: p.sku }));
    setLinhas(n.itens.map((it) => {
      const s = ja.has(it.item) ? null : sugerirProduto(it, n.fornecedor.cnpj, vinculos.data ?? [], prods);
      const fator = s?.fator ?? 1;
      return { item: it.item, produtoId: s?.produtoId ?? null, fator, fatorTexto: String(fator).replace(".", ","), como: s?.como ?? null };
    }));
    setJaEntrou(ja);
    setNota(n);
  };

  const mudar = (item: number, p: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.item === item ? { ...l, ...p, como: "produtoId" in p ? null : l.como } : l)));

  const escolhas: EscolhaItem[] = linhas
    .filter((l) => !jaEntrou.has(l.item))
    .map((l) => ({ item: l.item, produtoId: l.produtoId, fator: l.fator }));
  const erros = nota ? errosDaEntrada(nota, escolhas) : [];
  const pendentes = nota ? nota.itens.filter((i) => !jaEntrou.has(i.item)).length : 0;

  const salvar = async () => {
    if (!nota) { arquivo.current?.click(); return; }
    setTentou(true);
    if (erros.includes("nenhum_item")) { onToast("Escolha o produto de ao menos um item."); return; }
    if (erros.length) { onToast("Revise o fator dos itens."); return; }
    try {
      const r = await registrar.mutateAsync({ movimentos: movimentosDaNota(nota, escolhas), vinculos: vinculosDaEntrada(nota, escolhas) });
      const n = escolhas.filter((e) => e.produtoId).length;
      onCriado?.(null);
      onToast(`Entrada da NF-e ${nota.numero} lançada: ${n} ${n === 1 ? "item" : "itens"}.${r.vinculoSalvo ? "" : " A escolha dos produtos não ficou lembrada para a próxima nota."}`);
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Não foi possível lançar a entrada.");
    }
  };

  return (
    <FormModal title="Entrada por NF-e" size="large" onClose={onClose} onSave={salvar} saving={registrar.isPending}>
      <input ref={arquivo} type="file" hidden accept=".xml,text/xml,application/xml" onChange={(e) => { abrirXml(e.target.files?.[0]); e.target.value = ""; }} />

      {!nota && (
        <button
          type="button"
          onClick={() => arquivo.current?.click()}
          className="flex flex-col items-center gap-2 py-8 rounded-md border border-dashed border-border bg-surface-1 hover:border-ink/30 transition-colors"
        >
          <Icon name="file-text" size={22} color="var(--color-text-tertiary)" />
          <span className="text-label text-ink">Escolher o XML da nota</span>
          <span className="text-caption text-muted">O arquivo .xml que o fornecedor mandou junto com o DANFE.</span>
        </button>
      )}
      {erro && <p className="m-0 text-caption text-negative">{erro}</p>}

      {nota && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label text-ink font-medium">{nota.fornecedor.nome || doc(nota.fornecedor.cnpj)}</span>
              <BRL value={nota.valorTotal} />
            </div>
            <span className="text-caption text-muted">
              NF-e {nota.numero} · série {nota.serie} · emitida em {dataBR(nota.emissao)} · {doc(nota.fornecedor.cnpj)}
            </span>
            <span className="text-caption text-muted">
              Para: {nota.destinatario.nome || "—"}{nota.destinatario.documento ? ` · ${doc(nota.destinatario.documento)}` : ""}
            </span>
            <span className="text-caption text-placeholder tabular-nums">{formatarChave(nota.chave)}</span>
          </div>

          {pendentes === 0 ? (
            <p className="m-0 text-label text-muted">Todos os itens desta nota já deram entrada no estoque.</p>
          ) : (
            <p className="m-0 text-caption text-muted">
              Escolha o produto do estoque de cada item. Deixe em branco o que não é estoque (material de uso, frete).
              O custo é o que a nota cobrou: produtos, frete, IPI e ICMS-ST, menos o desconto.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {nota.itens.map((it) => {
              const l = linhas.find((x) => x.item === it.item);
              if (!l) return null;
              const entrou = jaEntrou.has(it.item);
              const un = unidadeDe(l.produtoId);
              const fatorRuim = tentou && !!l.produtoId && !(l.fator > 0);
              return (
                <div key={it.item} className="flex flex-col gap-3 p-4 rounded-md bg-surface-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-label text-ink">{it.descricao}</span>
                      <span className="text-caption text-muted">
                        Item {it.item} · código {it.codigo || "—"}{it.ncm ? ` · NCM ${it.ncm}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-label text-ink tabular-nums">{formatarQuantidade(it.quantidade)} {it.unidade}</span>
                      <span className="text-caption text-muted inline-flex gap-1">custo <BRL value={it.custoUnitario} /> / {it.unidade || "un"}</span>
                    </div>
                  </div>
                  {entrou ? (
                    <span className="text-caption text-muted">Já deu entrada no estoque.</span>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                      <div className="flex flex-col gap-1">
                        <Select
                          label="Produto do estoque"
                          placeholder="Não entra no estoque"
                          options={[{ value: "", label: "Não entra no estoque" }, ...opcoes]}
                          value={l.produtoId ?? ""}
                          onChange={(v) => mudar(it.item, { produtoId: v || null })}
                          cadastrar={cadastroDe("produto")}
                        />
                        {l.como && <span className="text-caption text-muted">{COMO[l.como]}</span>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Input
                          label={`${un ?? "Un."} por ${it.unidade || "un"}`}
                          inputMode="decimal"
                          value={l.fatorTexto}
                          disabled={!l.produtoId}
                          invalid={fatorRuim}
                          onChange={(e) => {
                            const v = lerQuantidade(e.target.value);
                            mudar(it.item, { fatorTexto: e.target.value, fator: Number.isFinite(v) ? v : NaN });
                          }}
                        />
                        {l.produtoId && l.fator > 0 && (
                          <span className="text-caption text-muted tabular-nums">
                            Entram {formatarQuantidade(Math.round(it.quantidade * l.fator * 1000) / 1000)}{un ? ` ${un}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <Button variant="ghost" onClick={() => arquivo.current?.click()}>Escolher outro XML</Button>
          </div>
        </>
      )}
    </FormModal>
  );
}
