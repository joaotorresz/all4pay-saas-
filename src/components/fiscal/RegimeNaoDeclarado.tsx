"use client";

/**
 * O estado que substitui o imposto quando a empresa não declarou o regime.
 *
 * ⚠️ Ele ocupa o LUGAR do número, não fica ao lado dele (regra da ONDA 4): uma
 * carga de imposto desbotada ao lado de um aviso continua sendo lida como a
 * carga. Sem regime não há imposto a mostrar — só o caminho para declarar.
 * Cor neutra, não `negative`: não declarar é estado que pede decisão, não erro.
 */
import Link from "next/link";
import { Card, Icon } from "@/components/ui";
import { AVISO_REGIME_NAO_DECLARADO } from "@/core/tax/regime";

export function RegimeNaoDeclarado({ contexto, compacto = false }: {
  /** O que deixa de ser calculado, em uma frase — ex.: "A projeção da carga não é calculada". */
  contexto?: string;
  /** Sem cartão, para caber dentro de um resumo que já é um cartão. */
  compacto?: boolean;
}) {
  const corpo = (
    <div className="flex items-start gap-2" role="status">
      <Icon name="info" size={15} color="var(--color-text-tertiary)" className="mt-[2px] shrink-0" />
      <span className="text-caption text-muted max-w-[70ch]">
        <b className="text-ink font-medium">{AVISO_REGIME_NAO_DECLARADO}</b>
        {contexto ? <> {contexto} até o regime ser declarado.</> : null}{" "}
        <Link href="/configuracoes" className="text-ink underline underline-offset-2">Abrir Configurações</Link>
      </span>
    </div>
  );
  return compacto ? corpo : <Card>{corpo}</Card>;
}
