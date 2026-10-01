"use client";

/**
 * AS ESCOLHAS DE CADASTRO DE TODO FORMULÁRIO DE LANÇAMENTO — um hook só.
 *
 * ⚠️ **Os formulários liam o cadastro ANTIGO do navegador** (`listProjetos`,
 * `listCentrosCusto`, `listPlanoContas`, com id NUMÉRICO): em produção o
 * projeto ou o centro escolhido era recusado pelo banco ("5001" não é UUID), e
 * a categoria de uma venda chegava ao DRE como "217290". Cada formulário
 * filtrava do seu jeito — um mostrava só subcategorias, outro só raízes.
 *
 * Agora todos leem a TABELA pelos hooks de `components/registros/hooks` (o
 * mesmo leitor das telas de cadastro) e filtram pelo MESMO critério
 * (`core/registros/hierarquia`): conta ativa, categoria FOLHA ativa da
 * natureza do lado, centro ativo e analítico, projeto ativo. Uma conta criada
 * na tela de Contas bancárias aparece no próximo "Nova despesa" sem recarregar
 * a página — os hooks de cadastro invalidam estas mesmas chaves.
 */
import * as React from "react";
import { useContasBancarias, useCentrosCusto, useProjetos } from "@/components/registros/hooks";
import { useCategories, useAccountsList, useCostCenters } from "@/components/lancamentos/hooks";
import {
  contasSelecionaveis, centrosSelecionaveis, projetosSelecionaveis,
  type OpcaoCadastro,
} from "@/core/registros/hierarquia";

export interface OpcoesCadastro {
  contas: OpcaoCadastro[];
  categorias: OpcaoCadastro[];
  centros: OpcaoCadastro[];
  projetos: OpcaoCadastro[];
  carregando: boolean;
  /** O nome de uma categoria (pelo id), para o texto `movements.category`. */
  nomeCategoria: (id: string) => string | null;
}

export function useOpcoesCadastro(lado: "entrada" | "saida"): OpcoesCadastro {
  const contas = useContasBancarias();
  // ⚠️ Categoria por `getCategories`: ela já devolve só FOLHAS ativas da
  // natureza, com o caminho ("Grupo › Folha"), e cai na lista plana REPORTANDO
  // quando a coluna nova ainda não existe (janela entre deploy e migration).
  const cats = useCategories(lado === "entrada" ? "receita" : "despesa");
  const centros = useCentrosCusto();
  const projetos = useProjetos();
  // Quedas para a janela antes da migration 20260930180000: as leituras planas
  // de sempre. Sem elas o formulário ficaria SEM conta nenhuma até o job
  // `migrar` rodar — trocar "falta o tipo da conta" por "não dá para lançar".
  const contasPlanas = useAccountsList();
  const centrosPlanos = useCostCenters();
  return React.useMemo(() => {
    const listaCats = cats.data ?? [];
    return {
      contas: contas.error
        ? (contasPlanas.data ?? []).map((c) => ({ value: c.id, label: c.name }))
        : contasSelecionaveis(contas.data ?? []),
      categorias: listaCats
        .map((c) => ({ value: c.id, label: c.caminho || c.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      centros: centros.error
        ? (centrosPlanos.data ?? []).map((c) => ({ value: c.id, label: c.name }))
        : centrosSelecionaveis(centros.data ?? []),
      projetos: projetosSelecionaveis(projetos.data ?? []),
      carregando: contas.isLoading || cats.isLoading || centros.isLoading || projetos.isLoading,
      nomeCategoria: (id: string) => listaCats.find((c) => c.id === id)?.name ?? null,
    };
  }, [contas.data, contas.error, contasPlanas.data, cats.data, centros.data, centros.error,
    centrosPlanos.data, projetos.data,
    contas.isLoading, cats.isLoading, centros.isLoading, projetos.isLoading]);
}
