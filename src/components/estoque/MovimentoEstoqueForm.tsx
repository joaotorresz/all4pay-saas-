"use client";

/**
 * NOVO MOVIMENTO DE ESTOQUE — entrada ou saída manual, sempre com motivo.
 *
 * Aberto só pela porta única (`abrirCriacao("movimento-estoque")`). A venda
 * NÃO passa por aqui: ela tira do estoque sozinha, pelo banco.
 */
import * as React from "react";
import { Input, Select, CurrencyInput, DateField } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { cadastroDe } from "@/components/app/criacao";
import { hojeLocal } from "@/lib/aggregations";
import { useSaldosEstoque, useRegistrarMovimento } from "@/lib/estoque";
import {
  MOTIVOS_ENTRADA, MOTIVOS_SAIDA, errosDoMovimento, formatarQuantidade, lerQuantidade,
  type ErroMovimento, type TipoMovimento,
} from "@/core/estoque";

const OUTRO = "Outro";

export function MovimentoEstoqueForm({
  produtoInicial, onClose, onToast, onCriado,
}: {
  produtoInicial?: string;
  onClose: () => void;
  onToast: (msg: string) => void;
  onCriado?: (id: string | null) => void;
}) {
  const saldos = useSaldosEstoque();
  const registrar = useRegistrarMovimento();
  const [tentou, setTentou] = React.useState(false);
  const [f, setF] = React.useState({
    produtoId: produtoInicial ?? "",
    tipo: "entrada" as TipoMovimento,
    quantidade: "",
    custo: 0,
    data: hojeLocal(),
    motivo: "Compra",
    outro: "",
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const motivos = f.tipo === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA;
  const atual = (saldos.data ?? []).find((s) => s.produtoId === f.produtoId);
  const opcoesProduto = (saldos.data ?? []).map((s) => ({ value: s.produtoId, label: s.sku ? `${s.nome} · ${s.sku}` : s.nome }));

  const movimento = {
    produtoId: f.produtoId,
    tipo: f.tipo,
    quantidade: lerQuantidade(f.quantidade),
    custoUnitario: f.tipo === "entrada" && f.custo > 0 ? f.custo : null,
    data: f.data,
    motivo: f.motivo === OUTRO ? f.outro : f.motivo,
  };
  const erros = new Set<ErroMovimento>(errosDoMovimento(movimento));
  const ruim = (e: ErroMovimento) => tentou && erros.has(e);

  const salvar = async (deNovo: boolean) => {
    setTentou(true);
    if (erros.size) { onToast("Revise os campos do movimento"); return; }
    try {
      await registrar.mutateAsync(movimento);
      onCriado?.(null);
      onToast(f.tipo === "entrada" ? "Entrada lançada" : "Saída lançada");
      if (deNovo) { set({ quantidade: "", custo: 0, outro: "" }); setTentou(false); } else onClose();
    } catch (e) {
      // A recusa do banco vem com o motivo real (produto que não controla
      // estoque, papel que não lança): é ele que a pessoa precisa ler.
      onToast(e instanceof Error ? e.message : "Não foi possível lançar o movimento.");
    }
  };

  return (
    <FormModal title="Novo movimento de estoque" size="medium" onClose={onClose} onSave={() => salvar(false)} onSaveAgain={() => salvar(true)} saving={registrar.isPending}>
      <Select
        label="Produto *"
        placeholder={saldos.isLoading ? "Carregando produtos…" : "Selecione"}
        options={opcoesProduto}
        value={f.produtoId}
        onChange={(v) => set({ produtoId: v })}
        invalid={ruim("produto")}
        cadastrar={cadastroDe("produto")}
      />
      {atual && (
        <p className="m-0 -mt-2 text-caption text-muted">
          Saldo atual: {formatarQuantidade(atual.saldo)}{atual.unidade ? ` ${atual.unidade}` : ""}
        </p>
      )}
      {!saldos.isLoading && opcoesProduto.length === 0 && (
        <p className="m-0 -mt-2 text-caption text-muted">
          Nenhum produto controla estoque ainda. Ligue &ldquo;Controla estoque?&rdquo; no cadastro do produto.
        </p>
      )}
      <div className="flex items-center gap-1 p-1 rounded-pill bg-surface-2 self-start" role="tablist" aria-label="Tipo de movimento">
        {([["entrada", "Entrada"], ["saida", "Saída"]] as [TipoMovimento, string][]).map(([id, rotulo]) => {
          const on = f.tipo === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => set({ tipo: id, motivo: id === "entrada" ? MOTIVOS_ENTRADA[0] : MOTIVOS_SAIDA[0], custo: 0 })}
              className={`px-4 h-8 rounded-pill text-caption transition-colors ${on ? "bg-white text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={`Quantidade *${atual?.unidade ? ` (${atual.unidade})` : ""}`}
          inputMode="decimal"
          value={f.quantidade}
          onChange={(e) => set({ quantidade: e.target.value })}
          invalid={ruim("quantidade")}
        />
        <DateField label="Data *" value={f.data} onChange={(v) => set({ data: v })} invalid={ruim("data")} />
      </div>
      {f.tipo === "entrada" && (
        <CurrencyInput label="Custo unitário" value={f.custo} onValueChange={(v) => set({ custo: v })} invalid={ruim("custo")} />
      )}
      <Select
        label="Motivo *"
        options={motivos.map((m) => ({ value: m, label: m }))}
        value={f.motivo}
        onChange={(v) => set({ motivo: v })}
        invalid={ruim("motivo") && f.motivo !== OUTRO}
      />
      {f.motivo === OUTRO && (
        <Input label="Qual motivo? *" value={f.outro} onChange={(e) => set({ outro: e.target.value })} invalid={ruim("motivo")} />
      )}
    </FormModal>
  );
}
