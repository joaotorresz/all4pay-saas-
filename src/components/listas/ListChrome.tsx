"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Card, Button, Skeleton, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ---------- Generic table ---------- */

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: number;
  render: (row: T) => React.ReactNode;
  /**
   * O papel da coluna no CARTÃO do telefone — ver `EntityTable`.
   *
   * `titulo` vai para a primeira linha em destaque, `valor` para a direita dela,
   * e o resto vira par rótulo/valor abaixo. `oculta` some no telefone: numa
   * tabela de quinze colunas, empilhar as quinze produz um cartão de meio metro,
   * que é a rolagem horizontal trocada por rolagem vertical.
   */
  noTelefone?: "titulo" | "valor" | "detalhe" | "oculta";
}

export function EntityTable<T extends { id: string }>({
  columns,
  rows,
  isLoading,
  isError,
  emptyTitle,
  emptyHint,
  emptyAction,
  onRowClick,
}: {
  columns: Column<T>[];
  rows?: T[];
  isLoading: boolean;
  isError: boolean;
  emptyTitle: string;
  emptyHint?: string;
  /** CTA no estado vazio (ex.: o mesmo "Novo X" do header) — fecha a correlação. */
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (isLoading) {
    return (
      <Card padded={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-5 py-3",
              i && "border-t border-border-soft",
            )}
          >
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <Empty title="Não foi possível carregar a lista" />
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card>
        <Empty title={emptyTitle} hint={emptyHint} action={emptyAction} />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      {/* ═══ TELEFONE: cartões ═══
          ⚠️ A auditoria previu que tabelas largas não sobreviveriam a uma tela
          pequena, e a medição confirmou: 15 colunas no DRE, 8 nos títulos, num
          aparelho de 390px. A saída ANTERIOR era rolagem horizontal — e rolagem
          horizontal numa tabela é a pior das duas opções: some com o rótulo da
          coluna assim que a pessoa arrasta, e ninguém decide nada olhando um
          valor sem saber de que coluna ele é.
          O cartão inverte isso: cada linha vira um bloco onde o rótulo viaja
          junto com o valor. */}
      <div className="lg:hidden">
        {rows.map((row, i) => (
          <CartaoDeLinha
            key={row.id} row={row} columns={columns} primeiro={i === 0}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          />
        ))}
      </div>

      {/* ═══ MONITOR: a tabela, como sempre ═══ */}
      <div className="hidden lg:block">
      {/* Cabeçalho Ledger: micro-label caixa-alta com tracking largo */}
      <div className="flex items-center gap-3 px-5 py-[10px] text-[11px] font-medium uppercase tracking-[0.08em] text-faint border-b border-border-soft">
        {columns.map((c) => (
          <span
            key={c.key}
            className={cn(c.align === "right" && "text-right")}
            style={{ width: c.width, flex: c.width ? undefined : 1 }}
          >
            {c.label}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={row.id}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={cn(
            "flex items-center gap-3 px-5 py-3",
            i && "border-t border-border-soft",
            onRowClick && "cursor-pointer hover:bg-surface-2 transition-colors",
          )}
        >
          {columns.map((c) => (
            <span
              key={c.key}
              className={cn(
                "min-w-0",
                c.align === "right" && "flex justify-end text-right",
              )}
              style={{ width: c.width, flex: c.width ? undefined : 1 }}
            >
              {c.render(row)}
            </span>
          ))}
        </div>
      ))}
      </div>
    </Card>
  );
}

/**
 * Uma linha da tabela, como CARTÃO.
 *
 * ⚠️ A ordem não é a da tabela: o cartão começa pelo que identifica a linha
 * (quem/o quê) com o valor ao lado, porque é assim que se procura uma linha numa
 * lista — pelo nome, não pela terceira coluna. Sem `noTelefone` declarado, a
 * primeira coluna vira o título e a última vira o valor, que é o arranjo certo
 * na esmagadora maioria das tabelas do produto.
 */
function CartaoDeLinha<T extends { id: string }>({
  row, columns, primeiro, onClick,
}: { row: T; columns: Column<T>[]; primeiro: boolean; onClick?: () => void }) {
  const titulo = columns.find((c) => c.noTelefone === "titulo") ?? columns[0];
  const valor =
    columns.find((c) => c.noTelefone === "valor")
    ?? [...columns].reverse().find((c) => c.align === "right" && c !== titulo);
  const detalhes = columns.filter(
    (c) => c !== titulo && c !== valor && c.noTelefone !== "oculta",
  );

  const Corpo = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[15px] text-ink truncate">{titulo.render(row)}</span>
        {valor && <span className="shrink-0 text-[15px] text-ink tabular-nums">{valor.render(row)}</span>}
      </div>
      {detalhes.length > 0 && (
        <dl className="m-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {detalhes.map((c) => (
            <div key={c.key} className="min-w-0 flex flex-col">
              {/* O rótulo viaja com o valor — é o que a rolagem horizontal perdia. */}
              <dt className="text-[11px] uppercase tracking-[0.07em] text-faint truncate">{c.label}</dt>
              <dd className="m-0 text-caption text-muted truncate">{c.render(row)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  const classe = cn("block w-full text-left px-4 py-3", !primeiro && "border-t border-border-soft");
  // Linha clicável vira BOTÃO de verdade: uma `div` com `onClick` não recebe
  // foco nem responde a Enter, e no telefone é o único jeito de abrir a ficha.
  return onClick
    ? <button type="button" onClick={onClick} className={cn(classe, "hover:bg-surface-2 transition-colors")}>{Corpo}</button>
    : <div className={classe}>{Corpo}</div>;
}

function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
      <span className="w-9 h-9 rounded-pill bg-surface-2 inline-flex items-center justify-center">
        <Icon name="file-text" size={18} color="var(--color-text-tertiary)" />
      </span>
      <p className="m-0 text-label font-medium text-muted">{title}</p>
      {hint && <p className="m-0 text-caption text-faint max-w-[34ch]">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* ---------- "Novo X" button that opens a form ---------- */

export function NewButton({
  label,
  onToast,
  form,
  variant = "primary",
}: {
  label: string;
  onToast: (m: string) => void;
  form: (props: { onClose: () => void; onToast: (m: string) => void }) => React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant={variant}
        leftIcon={<Icon name="plus" size={15} />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && form({ onClose: () => setOpen(false), onToast })}
    </>
  );
}

/* ---------- Toast ---------- */

export function useToast() {
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  // Portal no <body>: o toast é `fixed`, e qualquer ancestral com `transform`
  // (o Card do DS tem a micro-elevação) vira o bloco de contenção — dentro de
  // um card ele ancorava no rodapé do card, não da tela.
  const node = toast
    ? createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink text-white text-[17px] font-medium px-4 py-[11px] rounded-md shadow-popover z-[70]">
          <Icon name="check" size={15} color="var(--color-lime)" />
          <span>{toast}</span>
        </div>,
        document.body,
      )
    : null;
  return { show: setToast, node };
}
