"use client";

import * as React from "react";
import { DemoBadge } from "./DemoBadge";
import { MesAtual } from "./MesAtual";
import { NovoDeposito } from "./NovoDeposito";
import Link from "next/link";
import { Button } from "@/components/ui";
import { useTipoConta } from "@/components/app/useTipoConta";

/**
 * Header actions for Início.
 * Filtro de período (Essa semana · o mês selecionado). Badge em demo.
 * "Personalizar Home" vive na command palette (⌘K → "Personalizar Home") e o
 * "Novo lançamento" saiu do header da EMPRESA — lá os lançamentos seguem pela
 * ação de cada grupo do menu ("Nova venda", "Nova conta a pagar").
 *
 * ⚠️ **NO MODO PESSOAL O "ADICIONAR" MORA AQUI.** Os grupos do menu pessoal
 * não têm ação, o painel de Vendas não existe para a pessoa física, e os
 * atalhos Alt+letra vivem no `NovoDeposito` — que só era montado no painel de
 * Vendas. Resultado medido: no modo pessoal NÃO havia botão nenhum para lançar
 * uma despesa; a única porta era ⌘K → "Criar novo registro", que ninguém acha.
 * O controle de gastos sem um "Adicionar gasto" visível não é controle.
 */
export function InicioActions({ demo }: { demo: boolean }) {
  const { pessoal } = useTipoConta();
  return (
    <>
      {demo && <DemoBadge />}
      <span className="inline-flex items-center rounded-pill bg-white border border-border px-4 h-11">
        <MesAtual />
      </span>
      {pessoal && <NovoDeposito />}
      {!pessoal && (
        <>
          {/* A HOME DA PROPOSTA (out/2026) devolve as duas portas de entrada de
              dado ao cabeçalho da empresa: importar é a casa da entrada em lote
              (`/upload`), e "Novo lançamento" abre o MESMO modal dos lançamentos
              — nenhum formulário novo. */}
          <Link href="/upload" className="inline-flex items-center rounded-pill border border-[color:var(--a4p-borda-controle)] px-6 h-11 text-[14px] font-medium text-ink no-underline">
            Importar extrato
          </Link>
          <Button pill onClick={() => window.dispatchEvent(new Event("a4p:open-nova-transacao"))}>
            Novo lançamento
          </Button>
        </>
      )}
    </>
  );
}
