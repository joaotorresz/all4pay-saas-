"use client";

/**
 * Produtos › ESTOQUE — o saldo de cada produto que controla estoque.
 *
 * ⚠️ O saldo vem pronto do banco (`estoque_saldos`): esta tela não soma
 * movimento nem venda. Ela só lê, mostra a situação e abre o pop-up de
 * movimento pela porta única.
 */
import * as React from "react";
import { abrirCriacao } from "@/components/app/criacao";
import { BRL, Button, Input, PontoStatus } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { useSaldosEstoque, useDefinirMinimo } from "@/lib/estoque";
import {
  ROTULO_SITUACAO, formatarQuantidade, lerQuantidade, pedeReposicao, situacaoEstoque, valorEmEstoque,
  type SaldoProduto, type SituacaoEstoque,
} from "@/core/estoque";
import { CabecalhoRegistro, TabelaRegistro, VazioRegistro, AcaoLinha } from "@/components/registros/kit";

const COR_SITUACAO: Record<SituacaoEstoque, string | null> = {
  negativo: "var(--color-negative)",
  sem_estoque: "var(--color-negative)",
  abaixo_minimo: "var(--color-warning)",
  ok: "var(--color-positive)",
};

type Filtro = "todos" | "repor";

const qtd = (q: number, unidade: string | null) => `${formatarQuantidade(q)}${unidade ? ` ${unidade}` : ""}`;

export function EstoqueView({ abas }: { abas?: React.ReactNode }) {
  const { data, isLoading, error } = useSaldosEstoque();
  const [filtro, setFiltro] = React.useState<Filtro>("todos");
  const [editandoMinimo, setEditandoMinimo] = React.useState<SaldoProduto | null>(null);
  const { show, node } = useToast();

  const linhas = React.useMemo(
    () => (data ?? []).map((s) => ({ ...s, id: s.produtoId, situacao: situacaoEstoque(s), valor: valorEmEstoque(s) })),
    [data],
  );
  const repor = linhas.filter((l) => pedeReposicao(l.situacao));
  const visiveis = filtro === "repor" ? repor : linhas;

  const exportar = React.useMemo(() => [
    ["Produto", "Código/SKU", "Saldo", "Unidade", "Mínimo", "Custo médio", "Situação"],
    ...visiveis.map((l) => [l.nome, l.sku ?? "", l.saldo, l.unidade ?? "", l.minimo ?? "", l.custoMedio ?? "", ROTULO_SITUACAO[l.situacao]]),
  ], [visiveis]);

  const novo = (produto?: string) => abrirCriacao("movimento-estoque", produto ? { parametros: { produto } } : {});

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoRegistro
        acaoNova={{ label: "Novo movimento", onClick: () => novo() }}
        exportar={{ nomeArquivo: "estoque", aba: "Estoque", linhas: exportar }}
      />

      {abas}

      <div className="flex items-center gap-1 p-1 rounded-pill bg-surface-2 self-start" role="tablist" aria-label="Filtro do estoque">
        {([["todos", "Todos", linhas.length], ["repor", "Pedem reposição", repor.length]] as [Filtro, string, number][]).map(([id, rotulo, n]) => {
          const on = filtro === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={on}
              onClick={() => setFiltro(id)}
              className={`px-4 h-8 rounded-pill text-caption transition-colors ${on ? "bg-white text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {rotulo}
              <span className="ml-2 tabular-nums text-placeholder">{n}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="text-label text-muted py-8 text-center">Não foi possível ler o estoque: {error instanceof Error ? error.message : String(error)}</div>
      ) : isLoading ? (
        <div className="text-label text-muted py-8 text-center">Carregando estoque…</div>
      ) : (
        <TabelaRegistro
          itens={visiveis}
          vazio={
            <VazioRegistro
              texto={linhas.length === 0
                ? "Nenhum produto controla estoque. Ligue “Controla estoque?” no cadastro do produto e o saldo aparece aqui."
                : "Nenhum produto pede reposição agora."}
              acao={linhas.length === 0
                ? <Button variant="primary" onClick={() => abrirCriacao("produto")}>Novo produto</Button>
                : undefined}
            />
          }
          colunas={[
            { chave: "nome", label: "Produto", render: (l) => (
              <div className="flex flex-col">
                <span className="text-ink">{l.nome}</span>
                {l.sku && <span className="text-caption text-faint">{l.sku}</span>}
              </div>
            ) },
            { chave: "saldo", label: "Saldo", alinhar: "direita", render: (l) => <span className="tabular-nums text-ink">{qtd(l.saldo, l.unidade)}</span> },
            { chave: "minimo", label: "Mínimo", alinhar: "direita", render: (l) => <span className="tabular-nums text-muted">{l.minimo === null ? "—" : qtd(l.minimo, l.unidade)}</span> },
            { chave: "custo", label: "Custo médio", alinhar: "direita", render: (l) => (l.custoMedio === null
              ? <span className="text-caption text-muted" title="Informe o preço de custo no cadastro ou o custo na entrada.">Sem custo</span>
              : <BRL value={l.custoMedio} />) },
            { chave: "valor", label: "Valor em estoque", alinhar: "direita", render: (l) => (l.valor.tipo === "valor"
              ? <BRL value={l.valor.valor} />
              : <span className="text-caption text-muted" title={l.valor.motivo}>{l.valor.codigo === "sem_custo" ? "Sem custo" : "Saldo negativo"}</span>) },
            { chave: "situacao", label: "Situação", render: (l) => (
              <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                <PontoStatus cor={COR_SITUACAO[l.situacao]} />
                {ROTULO_SITUACAO[l.situacao]}
              </span>
            ) },
          ]}
          acoes={(l) => (
            <span className="inline-flex items-center">
              <AcaoLinha label="Lançar entrada ou saída" icone="arrow-left-right" onClick={() => novo(l.produtoId)} />
              <AcaoLinha label="Estoque mínimo" icone="target" onClick={() => setEditandoMinimo(l)} />
            </span>
          )}
        />
      )}

      <p className="m-0 text-caption text-muted">
        A venda tira do estoque sozinha. Editar ou cancelar a venda devolve o que ela tinha tirado.
      </p>

      {editandoMinimo && (
        <FormMinimo
          saldo={editandoMinimo}
          onClose={() => setEditandoMinimo(null)}
          onSalvo={() => { setEditandoMinimo(null); show("Estoque mínimo salvo."); }}
          onErro={show}
        />
      )}
      {node}
    </div>
  );
}

/** Edição do mínimo: um campo do cadastro do produto. Vazio tira o aviso. */
function FormMinimo({
  saldo, onClose, onSalvo, onErro,
}: { saldo: SaldoProduto; onClose: () => void; onSalvo: () => void; onErro: (m: string) => void }) {
  const definir = useDefinirMinimo();
  const [texto, setTexto] = React.useState(saldo.minimo === null ? "" : String(saldo.minimo).replace(".", ","));
  const [tentou, setTentou] = React.useState(false);
  const valor = texto.trim() === "" ? null : lerQuantidade(texto);
  const invalido = valor !== null && !Number.isFinite(valor);

  const salvar = async () => {
    setTentou(true);
    if (invalido) return;
    try {
      await definir.mutateAsync({ produtoId: saldo.produtoId, minimo: valor });
      onSalvo();
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Não foi possível salvar o mínimo.");
    }
  };

  return (
    <FormModal title="Estoque mínimo" size="compact" onClose={onClose} onSave={salvar} saving={definir.isPending}>
      <p className="m-0 text-label text-muted">{saldo.nome}</p>
      <Input
        label={`Mínimo${saldo.unidade ? ` (${saldo.unidade})` : ""}`}
        inputMode="decimal"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        invalid={tentou && invalido}
        placeholder="Vazio = sem aviso"
      />
    </FormModal>
  );
}
