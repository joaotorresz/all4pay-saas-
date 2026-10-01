"use client";

import * as React from "react";
import { DemoBadge } from "./DemoBadge";
import { MesAtual } from "./MesAtual";
import { NovoDeposito } from "./NovoDeposito";
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
      <MesAtual />
      {pessoal && <NovoDeposito />}
    </>
  );
}
