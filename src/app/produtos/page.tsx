"use client";

import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { NewButton, useToast } from "@/components/listas/ListChrome";
import { useProductsList } from "@/components/lancamentos/hooks";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { EmptyState } from "@/components/visao-geral/shared";
import { Icon, BRL, Skeleton, Card } from "@/components/ui";
import { getProdutoImagem } from "@/lib/produto-imagem";
import { isDemo } from "@/lib/demo";

export default function ProdutosPage() {
  const { data, isLoading, isError } = useProductsList();
  const { show, node } = useToast();
  // imagens vêm do localStorage → só após montar (evita mismatch de hidratação)
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => { setMontado(true); }, []);

  return (
    <AppShell
      title="Produtos"
      crumb="Cadastros · cardápio"
      actions={
        <>
          {isDemo && <DemoBadge />}
          <NewButton label="Novo produto" onToast={show} form={(p) => <ProdutoServicoForm kind="produto" {...p} />} />
        </>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[180px] w-full" rounded="card" />)}
        </div>
      ) : isError ? (
        <Card><EmptyState title="Não foi possível carregar os produtos" /></Card>
      ) : !data || data.length === 0 ? (
        <Card><EmptyState icon="scan-line" title="Nenhum produto cadastrado" hint="Cadastre seu primeiro produto (com imagem) no botão Novo produto — ele aparece aqui como um cardápio." /></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
          {data.map((p) => {
            const img = montado ? getProdutoImagem(p.name) : null;
            return (
              <div key={p.id} className="rounded-card border border-border-soft bg-white overflow-hidden flex flex-col shadow-card">
                <div className="aspect-[4/3] bg-surface-1 flex items-center justify-center overflow-hidden">
                  {img
                    // eslint-disable-next-line @next/next/no-img-element -- dataURL local (cardápio), next/image não cabe
                    ? <img src={img} alt={p.name} className="w-full h-full object-cover" />
                    : <Icon name="scan-line" size={26} color="var(--color-text-tertiary)" />}
                </div>
                <div className="p-3 flex flex-col gap-[2px]">
                  <span className="text-[15px] font-medium text-ink truncate">{p.name}</span>
                  {p.sku && <span className="text-caption text-faint truncate">{p.sku}</span>}
                  <span className="text-ink tabular-nums mt-1"><BRL value={p.sale_price ?? 0} /></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {node}
    </AppShell>
  );
}
