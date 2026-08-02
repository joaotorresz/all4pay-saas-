"use client";

/**
 * Cadastros › Produtos.
 *
 * O catálogo em forma de LISTA filtrável — a face operacional do mesmo cadastro
 * que `/cadastros?aba=produtos` mostra como cardápio. O que esta tela acrescenta
 * é o TIPO fiscal (não vou emitir NFs · produto · serviço · split), que decide
 * o que sai na nota, e o status, que tira do catálogo sem apagar o histórico.
 */
import * as React from "react";
import { Button, Input, Textarea, Select, BRL } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { useProductsList } from "@/components/lancamentos/hooks";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { filtrarRegistros, type FiltroStatus } from "@/core/registros";
import { TIPOS_PRODUTO, extraProduto, salvarExtraProduto, listExtrasProduto, type TipoProduto } from "@/lib/registros";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha,
  EtiquetaStatus, Campo, OPCOES_STATUS,
} from "./kit";
import type { Product } from "@/lib/types";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const rotuloTipo = (t: TipoProduto) => TIPOS_PRODUTO.find((x) => x.id === t)?.label ?? "—";

export function ProdutosRegistroView() {
  const { data, isLoading } = useProductsList();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [tipo, setTipo] = React.useState("");
  const [editandoFiscal, setEditandoFiscal] = React.useState<Product | null>(null);
  const [novo, setNovo] = React.useState(false);
  // Os extras vivem no localStorage → só depois de montar (evita mismatch).
  const [extras, setExtras] = React.useState<Record<string, ReturnType<typeof extraProduto>>>({});
  const { show, node } = useToast();

  React.useEffect(() => { setExtras(listExtrasProduto()); }, []);

  const comExtras = React.useMemo(
    () => (data ?? []).map((p) => ({
      ...p,
      tipo: (extras[p.id]?.tipo ?? "produto") as TipoProduto,
      ativo: extras[p.id]?.ativo ?? true,
      descricaoExtra: extras[p.id]?.descricao ?? "",
    })),
    [data, extras],
  );

  const visiveis = React.useMemo(() => {
    const base = filtrarRegistros(comExtras, busca, (p) => [p.name, p.sku, p.descricaoExtra, p.id], status);
    return base.filter((p) => !tipo || p.tipo === tipo);
  }, [comExtras, busca, status, tipo]);

  const linhas = React.useMemo(() => [
    ["ID", "Nome", "Código/SKU", "Tipo", "Preço de venda", "Descrição", "Status"],
    ...visiveis.map((p) => [
      p.id, p.name, p.sku ?? "", rotuloTipo(p.tipo), p.sale_price ?? 0, p.descricaoExtra, p.ativo ? "Ativo" : "Inativo",
    ]),
  ], [visiveis]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Gerencie seu catálogo de produtos."
        acaoNova={{ label: "Novo produto", onClick: () => setNovo(true) }}
        exportar={{ nomeArquivo: "produtos", aba: "Produtos", linhas }}
      />

      <FiltrosRegistro
        busca={busca} onBusca={setBusca} placeholder="ID, nome, SKU ou descrição…"
        campos={[
          { label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: OPCOES_STATUS },
          { label: "Tipo", value: tipo, onChange: setTipo, options: [{ value: "", label: "Todos os tipos" }, ...TIPOS_PRODUTO.map((t) => ({ value: t.id, label: t.label }))] },
        ]}
      />

      {isLoading ? (
        <div className="text-label text-muted py-8 text-center">Carregando produtos…</div>
      ) : (
        <TabelaRegistro
          itens={visiveis}
          vazio={
            <VazioRegistro
              texto={(data ?? []).length === 0
                ? "Nenhum produto cadastrado. Cadastre o primeiro para vender e emitir nota."
                : "Nenhum produto encontrado com esses filtros."}
              acao={(data ?? []).length === 0 ? <Button variant="primary" onClick={() => setNovo(true)}>Novo produto</Button> : undefined}
            />
          }
          colunas={[
            { chave: "nome", label: "Produto", render: (p) => (
              <div className="flex flex-col">
                <span className="text-ink">{p.name}</span>
                {p.descricaoExtra && <span className="text-caption text-faint truncate max-w-[42ch]">{p.descricaoExtra}</span>}
              </div>
            ) },
            { chave: "sku", label: "Código", render: (p) => <span className="text-muted">{p.sku || "—"}</span> },
            { chave: "tipo", label: "Tipo", render: (p) => <span className="text-muted">{rotuloTipo(p.tipo)}</span> },
            { chave: "preco", label: "Preço de venda", alinhar: "direita", render: (p) => <BRL value={p.sale_price ?? 0} /> },
            { chave: "status", label: "Status", render: (p) => <EtiquetaStatus ativo={p.ativo} /> },
          ]}
          acoes={(p) => <AcaoLinha label="Editar" icone="edit" onClick={() => setEditandoFiscal(p)} />}
        />
      )}

      {novo && <ProdutoServicoForm kind="produto" onClose={() => setNovo(false)} onToast={show} />}

      {editandoFiscal && (
        <FormFiscal
          produto={editandoFiscal}
          onClose={() => setEditandoFiscal(null)}
          onSalvo={() => { setExtras(listExtrasProduto()); setEditandoFiscal(null); show("Produto salvo."); }}
        />
      )}
      {node}
    </div>
  );
}

/**
 * Edição dos campos DESTA tela (tipo fiscal, descrição, status).
 *
 * Nome e preço continuam no `ProdutoServicoForm`, que é quem escreve no
 * Supabase — dois formulários gravando o mesmo campo divergiriam na primeira vez
 * que um deles mudasse.
 */
function FormFiscal({
  produto, onClose, onSalvo,
}: { produto: Product; onClose: () => void; onSalvo: () => void }) {
  const atual = extraProduto(produto.id);
  const [tipo, setTipo] = React.useState<TipoProduto>(atual.tipo ?? "produto");
  const [descricao, setDescricao] = React.useState(atual.descricao ?? "");
  const [ativo, setAtivo] = React.useState(atual.ativo ?? true);

  return (
    <FormModal
      title="Editar produto"
      size="medium"
      onClose={onClose}
      onSave={() => { salvarExtraProduto(produto.id, { tipo, descricao, ativo }); onSalvo(); }}
    >
      <Campo label="Nome do produto">
        <Input value={produto.name} disabled />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Código do produto">
          <Input value={produto.sku ?? ""} disabled />
        </Campo>
        <Campo label="Preço de venda">
          <Input value={fmtBRL(produto.sale_price ?? 0)} disabled />
        </Campo>
      </div>
      <p className="m-0 text-caption text-faint">
        Nome, código e preço são editados no cadastro do produto — abra por Cadastros › Produtos.
      </p>
      <Campo label="Tipo" ajuda="Decide o que sai na nota fiscal.">
        <Select value={tipo} onChange={(v) => setTipo(v as TipoProduto)} options={TIPOS_PRODUTO.map((t) => ({ value: t.id, label: t.label }))} />
      </Campo>
      <Campo label="Descrição">
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
      </Campo>
      <Campo label="Status">
        <Select
          value={ativo ? "ativo" : "inativo"}
          onChange={(v) => setAtivo(v === "ativo")}
          options={[{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]}
        />
      </Campo>
    </FormModal>
  );
}
