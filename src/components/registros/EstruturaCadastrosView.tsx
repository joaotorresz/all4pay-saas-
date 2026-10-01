"use client";

/**
 * Estrutura e cadastros — o HUB de `/dashboard/registrations`.
 *
 * Os níveis na ordem de DEPENDÊNCIA (empresa → contas → plano de contas →
 * centros/projetos → clientes/fornecedores → produtos/serviços → contratos),
 * cada um com contagem e link para a tela que o edita, e o checklist "o que
 * falta para lançar". A regra mora em `core/registros/estrutura`; esta tela só
 * junta as contagens e desenha.
 *
 * ⚠️ As contagens saem dos MESMOS leitores das telas de cadastro e dos
 * formulários de lançamento (`components/registros/hooks`, `usePartiesList`…).
 * Uma contagem própria divergiria da tela para onde o link leva — "3 contas"
 * aqui e duas lá.
 */
import * as React from "react";
import Link from "next/link";
import { Card, Icon } from "@/components/ui";
import {
  useContasBancarias, useCategoriasArvore, useCentrosCusto, useProjetos,
} from "./hooks";
import { usePartiesList, useProductsList, useServicesList } from "@/components/lancamentos/hooks";
import { listContratos } from "@/lib/registros";
import { loadCompany } from "@/lib/company";
import { regimeDoCadastro } from "@/core/fiscal/perfil";
import {
  niveisDaEstrutura, pendenciasDaEstrutura, type EntradaEstrutura,
} from "@/core/registros/estrutura";

export function EstruturaCadastrosView() {
  const contas = useContasBancarias();
  const cats = useCategoriasArvore();
  const centros = useCentrosCusto();
  const projetos = useProjetos();
  const partes = usePartiesList();
  const produtos = useProductsList();
  const servicos = useServicesList();

  // Empresa e contratos moram no estado da organização (store-org): lidos só no
  // navegador, depois de montar — no render do servidor quebraria a hidratação.
  const [locais, setLocais] = React.useState<{ nome: string | null; regime: boolean; contratos: number } | null>(null);
  React.useEffect(() => {
    const db = (loadCompany()?.db ?? null) as Record<string, unknown> | null;
    const nome = (db?.razaoSocial as string) || (db?.nomeFantasia as string) || (db?.nome as string) || null;
    setLocais({ nome, regime: regimeDoCadastro(db) !== "nao_declarado", contratos: listContratos().length });
  }, []);

  const carregando = contas.isLoading || cats.isLoading || centros.isLoading || projetos.isLoading
    || partes.isLoading || locais === null;
  const erro = contas.error || cats.error || centros.error || projetos.error || partes.error;

  const entrada: EntradaEstrutura | null = React.useMemo(() => {
    if (carregando || erro) return null;
    const ps = partes.data ?? [];
    return {
      empresa: { nome: locais?.nome ?? null, regimeDeclarado: locais?.regime ?? false },
      contas: contas.data ?? [],
      categorias: cats.data ?? [],
      centros: centros.data ?? [],
      projetos: projetos.data ?? [],
      clientes: ps.filter((p) => p.is_customer).length,
      fornecedores: ps.filter((p) => p.is_supplier).length,
      produtos: (produtos.data ?? []).length,
      servicos: (servicos.data ?? []).length,
      contratos: locais?.contratos ?? 0,
    };
  }, [carregando, erro, partes.data, locais, contas.data, cats.data, centros.data, projetos.data, produtos.data, servicos.data]);

  if (erro) {
    return (
      <Card>
        <p className="m-0 text-label text-negative" role="alert">
          Não foi possível ler os cadastros: {erro instanceof Error ? erro.message : String(erro)}
        </p>
      </Card>
    );
  }
  if (!entrada) {
    return <Card><p className="m-0 text-label text-muted">Lendo os cadastros…</p></Card>;
  }

  const niveis = niveisDaEstrutura(entrada);
  const pendencias = pendenciasDaEstrutura(entrada);
  const bloqueios = pendencias.filter((p) => p.gravidade === "bloqueia").length;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted max-w-[720px]">
        Os cadastros na ordem em que um depende do outro. Cada tela fica no grupo do menu onde é usada;
        aqui está a sequência para começar a lançar e o que ainda falta.
      </p>

      <Card data-checklist="1">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-h3 font-semibold text-ink">O que falta para lançar</span>
            <span className="text-caption text-muted tabular-nums">
              {pendencias.length === 0
                ? "Nada pendente"
                : `${bloqueios} ${bloqueios === 1 ? "impede" : "impedem"} o lançamento · ${pendencias.length - bloqueios} de atenção`}
            </span>
          </div>
          {pendencias.length === 0 ? (
            <p className="m-0 text-label text-ink">A estrutura está pronta: há conta ativa, categorias de receita e de despesa com linha do DRE, e contrapartes cadastradas.</p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col">
              {pendencias.map((p) => (
                <li key={p.id} data-pendencia={p.id} className="flex items-start justify-between gap-3 py-2 border-b border-border-soft last:border-0">
                  <span className="flex items-start gap-2 text-label text-ink">
                    {/* O ponto diz a gravidade; o texto diz o motivo (status nomeado). */}
                    <span
                      aria-hidden
                      className={`mt-[7px] w-[7px] h-[7px] rounded-pill shrink-0 ${p.gravidade === "bloqueia" ? "bg-negative" : "bg-warning"}`}
                    />
                    <span>
                      <span className="text-caption text-muted mr-1">{p.gravidade === "bloqueia" ? "Impede o lançamento ·" : "Atenção ·"}</span>
                      {p.texto}
                    </span>
                  </span>
                  <Link href={p.href} className="text-label text-ink underline underline-offset-2 shrink-0 hover:text-muted">
                    {p.acao}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <ol className="m-0 p-0 list-none flex flex-col gap-3">
        {niveis.map((n) => (
          <li key={n.id} data-nivel={n.id}>
            <Card>
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="a4p-label text-muted tabular-nums">Nível {n.nivel}</span>
                  <span className="text-h3 font-semibold text-ink">{n.titulo}</span>
                </div>
                <p className="m-0 text-caption text-muted">{n.porque}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {n.itens.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      data-item-estrutura={it.rotulo}
                      className="flex items-center justify-between gap-3 rounded-md bg-surface-1 px-4 py-3 hover:bg-surface-2"
                    >
                      <span className="flex flex-col">
                        <span className="text-label text-ink">{it.rotulo}</span>
                        <span className="text-caption text-muted">{it.resumo}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {it.quantidade !== null && (
                          <span className="text-h3 text-ink tabular-nums" data-quantidade={it.quantidade}>{it.quantidade}</span>
                        )}
                        <Icon name="chevron-right" size={16} color="currentColor" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
