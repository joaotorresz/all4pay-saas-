"use client";

/**
 * O campo livre "conte com suas palavras" (etapa 3 da Home adaptativa). Um só
 * componente para os dois cadastros (empresa e pessoa física) e para a edição
 * em Configurações — três cópias divergiriam no primeiro ajuste de texto.
 *
 * O texto alimenta as sugestões da Quattro AI na Home. Ele sai para a IA só
 * saneado (`descricaoParaIA`): documento, cartão e senha são cobertos antes.
 */
import * as React from "react";
import { Textarea } from "@/components/ui";
import { TETO_DESCRICAO } from "@/core/home/sugestoes";

export function DescricaoLivre({
  value, onChange, publico = "empresa", label,
}: {
  value: string;
  onChange: (v: string) => void;
  publico?: "empresa" | "pessoal";
  label?: string;
}) {
  const empresa = publico === "empresa";
  return (
    <div className="flex flex-col gap-[6px]">
      <Textarea
        id="descricao-livre"
        label={label ?? (empresa ? "Conte com suas palavras sobre a empresa (opcional)" : "O que você quer controlar? (opcional)")}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, TETO_DESCRICAO))}
        maxLength={TETO_DESCRICAO}
        rows={4}
        placeholder={
          empresa
            ? "Ex.: Vendemos assinaturas de software para clínicas. Quero acompanhar o caixa das próximas semanas e cobrar quem atrasa."
            : "Ex.: Quero parar de estourar o cartão e guardar um pouco todo mês."
        }
      />
      <span className="flex justify-between gap-3 text-caption text-muted">
        <span>A Quattro AI usa este texto para sugerir as perguntas da sua tela inicial. Documentos e senhas são removidos antes do envio.</span>
        <span className="tabular-nums flex-none">{value.length}/{TETO_DESCRICAO}</span>
      </span>
    </div>
  );
}
