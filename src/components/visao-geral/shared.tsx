"use client";

import * as React from "react";
import { Icon, InfoHint } from "@/components/ui";
import type { IconName, InfoConteudo } from "@/components/ui";

/**
 * ⚠️ CORES DE MARCA DE TERCEIRO — a única família de hex do produto que NÃO
 * sai da paleta, e não pode sair: o laranja do Itaú e o roxo do Nubank são
 * deles. Repintá-los com o acento faria os cinco bancos virarem o mesmo
 * ponto, e o ponto existe justamente para distinguir a conta de relance.
 * Declaradas como exceção em `scripts/paleta.mts`.
 */
const BANK_COLORS: Record<string, string> = {
  itau: "#EC7000",
  bradesco: "#CC092F",
  nubank: "#820AD1",
  inter: "#FF7A00",
  santander: "#EC0000",
};
export const bankColor = (bank: string) => BANK_COLORS[bank] ?? "var(--color-text-secondary)";

/**
 * Glifo flat num tile discreto — o marcador de identidade dos cabeçalhos de
 * card. DS All4Pay: chip escuro (ink) + glifo LIMA. Nada de volume/gradiente:
 * o sistema é flat ("sem sombras"), e o 3D destoava.
 */
export function IconTile({ name, size = 40 }: { name: IconName | string; size?: number }) {
  return (
    <span
      data-icontile=""
      className="inline-flex items-center justify-center shrink-0 rounded-[12px] bg-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon name={name} size={Math.round(size * 0.5)} color="var(--color-lime)" />
    </span>
  );
}

/** Alias de compat p/ chamadas antigas — hoje é o mesmo tile flat. */
export const Icon3D = IconTile;

/**
 * Section title for a widget, with an optional right-aligned slot.
 * `icon` é aceito por compat mas NÃO é renderizado — os cabeçalhos de card não
 * levam mais chip de ícone (o título carrega sozinho).
 */
export function WidgetHeader({
  title,
  subtitle,
  action,
  info,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  info?: InfoConteudo;
  icon?: IconName | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-baseline gap-[10px] min-w-0">
          <h2 className="text-h3 font-medium text-ink truncate">{title}</h2>
          {info && <span className="self-center"><InfoHint align="left" {...info} /></span>}
          {subtitle && <span className="text-caption text-faint">{subtitle}</span>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Quiet empty state — icon, line, optional hint, optional CTA. Never alarming.
 *  O `action` fecha a correlação: um vazio nunca é um beco — sempre oferece o
 *  botão que o preenche (ex.: "Conectar banco", "Nova venda"). */
export function EmptyState({
  icon = "file-text",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
      <span className="w-9 h-9 rounded-pill bg-surface-2 inline-flex items-center justify-center">
        <Icon name={icon} size={18} color="var(--color-text-tertiary)" />
      </span>
      <p className="m-0 text-label font-medium text-muted">{title}</p>
      {hint && <p className="m-0 text-caption text-faint max-w-[28ch]">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * ERRO DE CONSULTA — o estado que faltava.
 *
 * ⚠️ Um widget cuja consulta falha não pode ficar em esqueleto para sempre nem
 * mostrar um vazio bonito. As duas coisas dizem "não há dados" quando a verdade
 * é "não deu para saber", e a diferença é enorme: a primeira é uma informação,
 * a segunda é a ausência dela. Um zero que na verdade é uma falha de rede leva a
 * pessoa a tomar decisão sobre um número que ninguém apurou.
 *
 * Mostra o que quebrou, oferece tentar de novo e diz de qual widget se trata —
 * porque a Home tem dezenas e "algo deu errado" não localiza nada.
 */
export function ErroWidget({
  titulo = "Não foi possível carregar",
  erro,
  onTentarNovamente,
}: {
  titulo?: string;
  erro?: unknown;
  onTentarNovamente?: () => void;
}) {
  const mensagem =
    erro instanceof Error ? erro.message : typeof erro === "string" ? erro : null;
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2" role="alert">
      <span className="w-9 h-9 rounded-pill bg-surface-2 inline-flex items-center justify-center">
        <Icon name="triangle-alert" size={18} color="var(--color-negative)" />
      </span>
      <p className="m-0 text-label font-medium text-ink">{titulo}</p>
      {/* A mensagem técnica fica visível de propósito: sem ela, quem dá suporte
          recebe "não carregou" e começa do zero. */}
      {mensagem && <p className="m-0 text-caption text-faint max-w-[36ch] break-words">{mensagem}</p>}
      {onTentarNovamente && (
        <button
          onClick={onTentarNovamente}
          className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-ink hover:underline"
        >
          <Icon name="repeat" size={13} color="currentColor" />
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/** sr-only text so screen readers get the meaning of a visual figure. */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
