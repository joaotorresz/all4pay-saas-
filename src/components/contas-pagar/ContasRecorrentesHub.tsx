"use client";

/**
 * Contas recorrentes + os contratos de FORNECEDOR. O contrato é a regra que
 * a conta recorrente repete; morar ao lado dela evita a terceira porta (era
 * uma rota de Cadastros sem linha no menu). Os de cliente moram em
 * Assinaturas e contratos.
 */
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { ContasRecorrentes } from "./ContasRecorrentes";
import { ContratosView } from "@/components/registros/ContratosView";

const ABAS: AbaHub[] = [
  { id: "recorrentes", label: "Recorrentes", render: () => <ContasRecorrentes /> },
  { id: "contratos-fornecedor", label: "Contratos de fornecedor", render: () => <ContratosView lado="fornecedor" /> },
];

export function ContasRecorrentesHub() {
  return <HubShell abas={ABAS} />;
}
