import * as React from "react";
import { cn } from "@/lib/utils";
import { glifoDoBanco, iniciaisDoBanco } from "@/core/bancos/logo";
import { BANCO_GLIFOS } from "./bancos-icones";

/**
 * Quattro DS — BancoLogo
 *
 * O logo do banco de uma conta, num tile discreto. Monocromático: o glifo
 * herda `currentColor` (tinta do texto), como todo ícone do sistema — as
 * cores das marcas não entram na paleta.
 *
 * Aceita a CHAVE da conta (`itau`, `bb`) ou o NOME ("Banco do Brasil"). Banco
 * sem logo na biblioteca mostra as iniciais no mesmo tile, nunca o logo de
 * outro banco (ver `core/bancos/logo`).
 *
 * Logos: "Pacote de Ícones de Bancos Brasileiros", de Matheus Cuba —
 * créditos em `docs/creditos/icones-bancos.md`.
 */
export interface BancoLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Chave (`itau`) ou nome ("Itaú Unibanco") do banco. */
  banco: string | null | undefined;
  /** Nome mostrado nas iniciais e no rótulo acessível, quando `banco` é chave. */
  nome?: string;
  size?: number;
  /**
   * Ao lado do nome escrito o logo é decoração (padrão): o leitor de tela já
   * leu o nome. Sozinho, passe `decorativo={false}` para ele ser anunciado.
   */
  decorativo?: boolean;
}

export function BancoLogo({
  banco, nome, size = 28, decorativo = true, className, style, ...rest
}: BancoLogoProps) {
  const glifo = glifoDoBanco(banco) ?? glifoDoBanco(nome);
  const rotulo = nome || banco || "Banco";
  const a11y = decorativo
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": rotulo };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 select-none overflow-hidden",
        "rounded-sm bg-surface-2 text-ink font-medium leading-none",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ...style }}
      {...a11y}
      {...rest}
    >
      {glifo ? (
        <svg viewBox="0 0 1024 1024" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} fill="currentColor" focusable="false">
          <path transform="matrix(1 0 0 -1 0 960)" d={BANCO_GLIFOS[glifo]} />
        </svg>
      ) : (
        iniciaisDoBanco(nome || banco)
      )}
    </span>
  );
}
