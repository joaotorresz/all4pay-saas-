"use client";

/**
 * Os hooks dos cadastros na hierarquia — React Query sobre
 * `lib/cadastros-hierarquia`, o único leitor e escritor.
 *
 * ⚠️ Toda gravação INVALIDA também as chaves dos formulários de lançamento
 * (`accounts-list`, `categories`, `cost-centers`) e o hub (`risco-input`): uma
 * conta criada aqui tem de aparecer no próximo "Nova despesa" sem recarregar a
 * página — é esse o caminho que antes não existia.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listarContasBancarias, salvarContaBancaria, definirContaAtiva,
  listarCategorias, salvarCategoria, definirCategoriaAtiva, excluirCategoria,
  listarUsosPadrao, definirUsoPadrao,
  listarCentrosCusto, salvarCentroCusto, definirCentroAtivo,
  listarProjetos, salvarProjeto, definirStatusProjeto,
  trazerAntigo, pendenciasAntigas,
  type CategoriaCadastro, type CentroCustoCadastro, type ProjetoCadastro,
  type StatusProjeto, type PendenciaAntiga,
} from "@/lib/cadastros-hierarquia";
import type { ContaBancaria } from "@/core/registros";

export const CHAVES_CADASTRO = {
  contas: ["contas-bancarias"],
  categorias: ["categorias-arvore"],
  usos: ["usos-padrao"],
  centros: ["centros-custo"],
  projetos: ["projetos-cadastro"],
} as const;

/** O que cada cadastro alimenta fora da própria tela. */
const DEPENDENTES: Record<keyof typeof CHAVES_CADASTRO, string[][]> = {
  contas: [["accounts-list"], ["accounts"], ["risco-input"], ["contas-unificadas"]],
  categorias: [["categories"], ["categories-all"], ["risco-input"]],
  usos: [],
  centros: [["cost-centers"], ["risco-input"]],
  projetos: [["risco-input"]],
};

function useInvalidar(qual: keyof typeof CHAVES_CADASTRO) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...CHAVES_CADASTRO[qual]] });
    for (const k of DEPENDENTES[qual]) qc.invalidateQueries({ queryKey: k });
  };
}

/* --------------------------------- contas --------------------------------- */

export function useContasBancarias() {
  return useQuery({ queryKey: [...CHAVES_CADASTRO.contas], queryFn: listarContasBancarias });
}
export function useSalvarContaBancaria() {
  const inv = useInvalidar("contas");
  return useMutation({ mutationFn: (c: ContaBancaria) => salvarContaBancaria(c), onSuccess: inv });
}
export function useDefinirContaAtiva() {
  const inv = useInvalidar("contas");
  return useMutation({ mutationFn: (v: { id: string; ativo: boolean }) => definirContaAtiva(v.id, v.ativo), onSuccess: inv });
}

/* ------------------------------ plano de contas ------------------------------ */

export function useCategoriasArvore() {
  return useQuery({ queryKey: [...CHAVES_CADASTRO.categorias], queryFn: listarCategorias });
}
export function useSalvarCategoria() {
  const inv = useInvalidar("categorias");
  return useMutation({ mutationFn: (c: CategoriaCadastro) => salvarCategoria(c), onSuccess: inv });
}
export function useDefinirCategoriaAtiva() {
  const inv = useInvalidar("categorias");
  return useMutation({ mutationFn: (v: { id: string; ativo: boolean }) => definirCategoriaAtiva(v.id, v.ativo), onSuccess: inv });
}
export function useExcluirCategoria() {
  const inv = useInvalidar("categorias");
  return useMutation({ mutationFn: (id: string) => excluirCategoria(id), onSuccess: inv });
}
export function useUsosPadrao() {
  return useQuery({ queryKey: [...CHAVES_CADASTRO.usos], queryFn: listarUsosPadrao });
}
export function useDefinirUsoPadrao() {
  const inv = useInvalidar("usos");
  return useMutation({
    mutationFn: (v: { funcao: string; categoriaId: string | null }) => definirUsoPadrao(v.funcao, v.categoriaId),
    onSuccess: inv,
  });
}

/* ------------------------------ centros de custo ------------------------------ */

export function useCentrosCusto() {
  return useQuery({ queryKey: [...CHAVES_CADASTRO.centros], queryFn: listarCentrosCusto });
}
export function useSalvarCentroCusto() {
  const inv = useInvalidar("centros");
  return useMutation({ mutationFn: (c: CentroCustoCadastro) => salvarCentroCusto(c), onSuccess: inv });
}
export function useDefinirCentroAtivo() {
  const inv = useInvalidar("centros");
  return useMutation({ mutationFn: (v: { id: string; ativo: boolean }) => definirCentroAtivo(v.id, v.ativo), onSuccess: inv });
}

/* --------------------------------- projetos --------------------------------- */

export function useProjetos() {
  return useQuery({ queryKey: [...CHAVES_CADASTRO.projetos], queryFn: listarProjetos });
}
export function useSalvarProjeto() {
  const inv = useInvalidar("projetos");
  return useMutation({ mutationFn: (p: ProjetoCadastro) => salvarProjeto(p), onSuccess: inv });
}
export function useDefinirStatusProjeto() {
  const inv = useInvalidar("projetos");
  return useMutation({
    mutationFn: (v: { id: string; status: StatusProjeto }) => definirStatusProjeto(v.id, v.status),
    onSuccess: inv,
  });
}

/* --------------------------------- antigos --------------------------------- */

/**
 * As pendências do cadastro antigo, calculadas SÓ depois de a lista da tabela
 * chegar — antes disso tudo pareceria "não existe no cadastro" — e só no
 * navegador (ler as chaves antigas no render quebraria a hidratação).
 */
export function usePendenciasAntigas(
  tipo: "contas" | "centros" | "projetos" | "categorias",
  atuais: {
    contas?: ContaBancaria[]; centros?: CentroCustoCadastro[];
    projetos?: ProjetoCadastro[]; categorias?: CategoriaCadastro[];
  } | null,
): PendenciaAntiga[] {
  const [p, setP] = React.useState<PendenciaAntiga[]>([]);
  React.useEffect(() => {
    setP(atuais ? pendenciasAntigas(tipo, atuais) : []);
  }, [tipo, atuais]);
  return p;
}

/** Trazer um cadastro antigo — invalida o cadastro de destino. */
export function useTrazerAntigo(qual: keyof typeof CHAVES_CADASTRO) {
  const inv = useInvalidar(qual);
  return useMutation({ mutationFn: (p: PendenciaAntiga) => trazerAntigo(p), onSuccess: inv });
}
