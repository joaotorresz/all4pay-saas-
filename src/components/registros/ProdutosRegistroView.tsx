"use client";

/**
 * Cadastros › Produtos **e serviços**.
 *
 * O catálogo em forma de LISTA filtrável. O que esta tela acrescenta é o TIPO
 * fiscal (não vou emitir NFs · produto · serviço · split), que decide o que sai
 * na nota, e o status, que tira do catálogo sem apagar o histórico.
 *
 * ⚠️ **O filtro Produtos / Serviços é a porta dos SERVIÇOS.** `registrations`
 * tinha `products` e não tinha `services`: aposentar `/cadastros` sem isto
 * apagaria o cadastro de serviço inteiro, e quem vende serviço abriria a tela
 * achando que nunca cadastrou nada. É a perda funcional silenciosa que o mapa
 * de consolidação existe para impedir.
 *
 * O filtro é um SEGMENTADO VISÍVEL, não uma opção escondida num select: uma aba
 * que vira item de lista de filtro só muda o lugar onde a perda acontece.
 */
import * as React from "react";
import { Button, Input, Textarea, Select, BRL } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { useProductsList, useServicesList } from "@/components/lancamentos/hooks";
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

/** Produto e serviço são o MESMO cadastro para quem opera — muda o que sai na nota. */
type Catalogo = "produtos" | "servicos";

export function ProdutosRegistroView() {
  const [catalogo, setCatalogo] = React.useState<Catalogo>("produtos");
  const produtos = useProductsList();
  const servicos = useServicesList();
  const ehServico = catalogo === "servicos";
  const { data, isLoading } = ehServico ? servicos : produtos;
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
    () => (data ?? []).map((p) => {
      // O serviço tem menos campos que o produto (não tem SKU nem preço de
      // venda separado); normalizar aqui deixa a MESMA tabela servir aos dois
      // em vez de duplicar a tela.
      const linha = p as { id: string; name: string; sku?: string | null; sale_price?: number | null; price?: number };
      return {
        ...linha,
        sku: linha.sku ?? null,
        sale_price: linha.sale_price ?? linha.price ?? 0,
        tipo: (extras[linha.id]?.tipo ?? (ehServico ? "servico" : "produto")) as TipoProduto,
        ativo: extras[linha.id]?.ativo ?? true,
        descricaoExtra: extras[linha.id]?.descricao ?? "",
      };
    }),
    [data, extras, ehServico],
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
        subtitulo={ehServico ? "Gerencie o catálogo de serviços." : "Gerencie seu catálogo de produtos."}
        acaoNova={{ label: ehServico ? "Novo serviço" : "Novo produto", onClick: () => setNovo(true) }}
        exportar={{
          nomeArquivo: ehServico ? "servicos" : "produtos",
          aba: ehServico ? "Serviços" : "Produtos",
          linhas,
        }}
      />

      {/* ⚠️ O segmentado é a porta dos serviços. Escondê-lo num select faria a
          perda apenas mudar de lugar — quem procura "Serviços" no menu não
          adivinha que ele virou uma opção dentro de um filtro. */}
      <div className="flex items-center gap-1 p-1 rounded-pill bg-surface-2 self-start" role="tablist" aria-label="Tipo de item">
        {([["produtos", "Produtos"], ["servicos", "Serviços"]] as [Catalogo, string][]).map(([id, rotulo]) => {
          const on = catalogo === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={on}
              onClick={() => { setCatalogo(id); setBusca(""); setTipo(""); }}
              className={`px-4 h-8 rounded-pill text-caption transition-colors ${on ? "bg-white text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {rotulo}
              <span className="ml-2 tabular-nums text-placeholder">
                {(id === "servicos" ? servicos.data : produtos.data)?.length ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <FiltrosRegistro
        busca={busca} onBusca={setBusca} placeholder="ID, nome, SKU ou descrição…"
        campos={[
          { label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: OPCOES_STATUS },
          { label: "Tipo", value: tipo, onChange: setTipo, options: [{ value: "", label: "Todos os tipos" }, ...TIPOS_PRODUTO.map((t) => ({ value: t.id, label: t.label }))] },
        ]}
      />

      {isLoading ? (
        <div className="text-label text-muted py-8 text-center">Carregando {ehServico ? "serviços" : "produtos"}…</div>
      ) : (
        <TabelaRegistro
          itens={visiveis}
          vazio={
            <VazioRegistro
              texto={(data ?? []).length === 0
                ? ehServico
                  ? "Nenhum serviço cadastrado. Cadastre o primeiro para vender e emitir NFS-e."
                  : "Nenhum produto cadastrado. Cadastre o primeiro para vender e emitir nota."
                : `Nenhum ${ehServico ? "serviço" : "produto"} encontrado com esses filtros.`}
              acao={(data ?? []).length === 0
                ? <Button variant="primary" onClick={() => setNovo(true)}>{ehServico ? "Novo serviço" : "Novo produto"}</Button>
                : undefined}
            />
          }
          colunas={[
            { chave: "nome", label: ehServico ? "Serviço" : "Produto", render: (p) => (
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

      {novo && <ProdutoServicoForm kind={ehServico ? "servico" : "produto"} onClose={() => setNovo(false)} onToast={show} />}

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
