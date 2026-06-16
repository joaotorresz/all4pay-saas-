"use client";

import * as React from "react";
import { useCentroInteligencia, useQuantitativo, useRiscoInput } from "./hooks";
import { loadCompany } from "@/lib/company";
import { BLOCK_ORDER } from "./HomeCustomizeDrawer";

/**
 * Home contextual + reordenação por IA.
 *  • Ordem-base dos blocos por SETOR (a4p_company.perfil.setor) — financeira
 *    prioriza Saúde; indústria prioriza Despesas; etc.
 *  • Quando `auto` está ligado, reordena os blocos por URGÊNCIA calculada dos
 *    motores (caixa em risco, pendências, anomalias, alertas críticos) — o bloco
 *    mais crítico sobe ao topo. Empate desfeito pela ordem-base do setor.
 */
type Bloco = (typeof BLOCK_ORDER)[number];

export interface HomeContext {
  ordemBlocos: string[];
  urgencia: Record<string, number>;
  motivos: Record<string, string>;
  topBloco: string | null;
  setor: string | null;
}

/** Ordem-base dos blocos por setor (cai no padrão se o setor não mapear). */
const SETOR_BASE: Record<string, Bloco[]> = {
  Financeiro: ["Saúde financeira", "Operação", "Inteligência", "Receita", "Despesas"],
  Indústria: ["Despesas", "Operação", "Saúde financeira", "Receita", "Inteligência"],
  Construção: ["Despesas", "Operação", "Saúde financeira", "Receita", "Inteligência"],
  Logística: ["Despesas", "Operação", "Saúde financeira", "Receita", "Inteligência"],
  Agronegócio: ["Despesas", "Saúde financeira", "Operação", "Receita", "Inteligência"],
  Serviços: ["Receita", "Saúde financeira", "Operação", "Despesas", "Inteligência"],
  Tecnologia: ["Saúde financeira", "Receita", "Inteligência", "Operação", "Despesas"],
  "E-commerce": ["Receita", "Operação", "Despesas", "Saúde financeira", "Inteligência"],
  Saúde: ["Operação", "Saúde financeira", "Receita", "Despesas", "Inteligência"],
  Educação: ["Receita", "Saúde financeira", "Operação", "Despesas", "Inteligência"],
};

export function useHomeContext(auto: boolean): HomeContext {
  const ci = useCentroInteligencia();
  const q = useQuantitativo();
  const ri = useRiscoInput();
  const [setor, setSetor] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSetor(loadCompany()?.perfil?.setor || null);
  }, []);

  return React.useMemo<HomeContext>(() => {
    // Operação lidera a Home por padrão; o resto segue a ordem-base do setor.
    const setorBase = (setor && SETOR_BASE[setor]) || [...BLOCK_ORDER];
    const base = ["Operação", ...setorBase.filter((b) => b !== "Operação")] as Bloco[];
    const urgencia: Record<string, number> = { "Saúde financeira": 0, Operação: 0, Receita: 0, Despesas: 0, Inteligência: 0 };
    const motivos: Record<string, string> = {};

    // Saúde financeira — caixa/score/runway/probabilidade de ruptura.
    const qi = q.data;
    if (qi) {
      if (qi.score.score < 50) { urgencia["Saúde financeira"] += 3; motivos["Saúde financeira"] = "score crítico"; }
      else if (qi.score.score < 70) { urgencia["Saúde financeira"] += 1.5; motivos["Saúde financeira"] = "score em atenção"; }
      if (qi.indicadores.runwayMeses < 3) { urgencia["Saúde financeira"] += 3; motivos["Saúde financeira"] = "runway curto"; }
      else if (qi.indicadores.runwayMeses < 6) { urgencia["Saúde financeira"] += 1.5; }
      if (qi.score.probabilidadeRuptura > 0.4) { urgencia["Saúde financeira"] += 2; motivos["Saúde financeira"] = "risco de ruptura de caixa"; }
    }

    // Operação — pendências vencidas / a vencer.
    const input = ri.data;
    if (input) {
      const hoje = input.hoje;
      let vencidos = 0, vencendo = 0;
      const em3 = addDias(hoje, 3);
      for (const m of input.movements) {
        if (m.status !== "pendente") continue;
        if (m.due_date < hoje) vencidos++;
        else if (m.due_date <= em3) vencendo++;
      }
      if (vencidos >= 1) { urgencia["Operação"] += Math.min(4, vencidos * 0.8); motivos["Operação"] = `${vencidos} vencido(s)`; }
      if (vencendo >= 1) { urgencia["Operação"] += Math.min(2, vencendo * 0.5); if (!motivos["Operação"]) motivos["Operação"] = `${vencendo} a vencer`; }
    }

    // Inteligência / Despesas — insights críticos e anomalias.
    const cd = ci.data;
    if (cd) {
      const crit = cd.insights.filter((i) => /crit|alta/i.test(i.severidade)).length;
      if (crit) { urgencia["Inteligência"] += crit * 1.5; motivos["Inteligência"] = `${crit} alerta(s) crítico(s)`; }
      const anomDesp = cd.anomalias.filter((a) => a.classe === "despesa").length;
      const anomTot = cd.anomalias.length;
      if (anomDesp) { urgencia["Despesas"] += anomDesp * 1.2; motivos["Despesas"] = `${anomDesp} anomalia(s) de despesa`; }
      else if (anomTot) urgencia["Inteligência"] += anomTot;
      // Insight de queda de receita → Receita.
      if (cd.insights.some((i) => /receita|venda|faturamento/i.test(i.titulo) && /crit|alta|med/i.test(i.severidade))) {
        urgencia["Receita"] += 1.5; motivos["Receita"] = "sinal na receita";
      }
    }

    // Caixa lidera a Home (fixo, pedido do usuário); Operação vem logo após;
    // o restante segue urgência (auto) ou a ordem-base do setor.
    const FIXOS: Bloco[] = ["Caixa", "Operação"];
    const resto: Bloco[] = base.filter((b) => !FIXOS.includes(b));
    const restoOrdenado: Bloco[] = auto
      ? [...resto].sort((a, b) => {
          const d = (urgencia[b] ?? 0) - (urgencia[a] ?? 0);
          return d !== 0 ? d : resto.indexOf(a) - resto.indexOf(b);
        })
      : resto;
    const ordemBlocos = ["Caixa", "Operação", ...restoOrdenado];

    // Selo de "Prioridade" vai no bloco de MAIOR urgência (onde quer que esteja).
    let top: string | null = null;
    if (auto) {
      let max = 0;
      for (const b of ordemBlocos) {
        if ((urgencia[b] ?? 0) > max) { max = urgencia[b]; top = b; }
      }
    }

    return { ordemBlocos, urgencia, motivos, topBloco: top, setor };
  }, [auto, setor, q.data, ri.data, ci.data]);
}

function addDias(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
