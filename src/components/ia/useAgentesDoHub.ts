"use client";

/**
 * O que a lista "Quattro AI e agentes" mostra, num lugar só: o menu lateral
 * (seção Conversas) e a tela /quattro-ai no telefone leem daqui, para os dois
 * nunca dizerem coisas diferentes sobre o mesmo agente.
 */
import { useQuery } from "@tanstack/react-query";
import { IDS_AGENTE, NIVEIS, descricaoDe, type IdAgente } from "@/core/agentes";
import { listarAgentes, listarPropostas } from "@/lib/agentes";

export const CHAVE_AGENTES = ["agentes", "config"] as const;
export const CHAVE_PROPOSTAS = ["agentes", "propostas"] as const;

export type SelecaoHub = IdAgente | "quattro-ai";

export function useAgentesDoHub() {
  const configs = useQuery({ queryKey: CHAVE_AGENTES, queryFn: listarAgentes });
  const propostas = useQuery({ queryKey: CHAVE_PROPOSTAS, queryFn: listarPropostas });
  const pendentes = (propostas.data ?? []).filter((p) => p.estado === "pendente");
  const porAgente = (id: IdAgente) => pendentes.filter((p) => p.agente === id).length;
  const configDe = (id: IdAgente) => configs.data?.find((c) => c.agente === id);
  const estadoDe = (id: IdAgente) => {
    const d = descricaoDe(id);
    const c = configDe(id);
    if (!d.pronto) return "Em construção";
    if (!c?.ativo) return "Desligado";
    return NIVEIS[Math.min(c.nivel, d.nivelMaximo)].nome;
  };
  const resumoIA = pendentes.length
    ? `${pendentes.length} ${pendentes.length === 1 ? "coisa espera" : "coisas esperam"} você`
    : "Pergunte sobre os seus números";
  return { configs, propostas, pendentes, porAgente, configDe, estadoDe, resumoIA, ids: IDS_AGENTE };
}

/** O endereço de cada item da lista. */
export const hrefDoHub = (s: SelecaoHub | null) => (s ? `/quattro-ai?agente=${s}` : "/quattro-ai");
