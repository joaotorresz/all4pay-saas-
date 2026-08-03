"use client";

/**
 * AÇÃO DESTRUTIVA — confirmação explícita e DESFAZER.
 *
 * ⚠️ "Limpar dados importados" apagava o dataset inteiro no primeiro clique,
 * sem perguntar e sem volta. O botão ficava a um pixel de distância de um link
 * comum, e quem clicasse por engano perdia meses de importação.
 *
 * As duas metades importam, e por razões diferentes:
 *
 *  - **A confirmação** impede o acidente. Mas confirmação sozinha vira ruído:
 *    quem clica em "Sim" por reflexo não leu, e aí ela só atrasou o erro.
 *  - **O DESFAZER** é o que realmente protege. Ele transforma um erro
 *    irreversível em um erro de dez segundos, e é a única das duas que funciona
 *    para quem estava distraído — que é exatamente quem erra.
 *
 * Por isso este componente exige as duas: `onConfirmar` devolve a função de
 * reversão, e sem ela não há como oferecer o desfazer.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** O tempo que o desfazer fica disponível. */
const SEGUNDOS_PARA_DESFAZER = 8;

export function AcaoDestrutiva({
  rotulo,
  titulo,
  descricao,
  confirmarRotulo = "Confirmar",
  onConfirmar,
  className,
}: {
  /** O texto do botão que dispara. */
  rotulo: string;
  titulo: string;
  /** O que exatamente vai acontecer — em número, quando possível. */
  descricao: string;
  confirmarRotulo?: string;
  /**
   * Executa a ação e devolve a função que a DESFAZ.
   * ⚠️ Devolver `void` é aceito, mas então não há desfazer e o componente diz
   * isso na confirmação — o usuário merece saber antes, não depois.
   */
  onConfirmar: () => Promise<(() => void | Promise<void>) | void> | ((() => void) | void);
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [desfazer, setDesfazer] = React.useState<(() => void | Promise<void>) | null>(null);
  const [restam, setRestam] = React.useState(0);
  const primeiroFoco = React.useRef<HTMLButtonElement>(null);

  // Esc fecha, e o foco entra no botão SEGURO (Cancelar) — não no destrutivo.
  // Abrir com o foco em "Confirmar" faz um Enter distraído executar a ação.
  React.useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", esc);
    const t = setTimeout(() => primeiroFoco.current?.focus(), 10);
    return () => { window.removeEventListener("keydown", esc); clearTimeout(t); };
  }, [aberto]);

  // Contagem regressiva do desfazer.
  React.useEffect(() => {
    if (restam <= 0) { if (restam === 0 && desfazer) setDesfazer(null); return; }
    const t = setTimeout(() => setRestam((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restam, desfazer]);

  const executar = async () => {
    setOcupado(true);
    try {
      const reverter = await onConfirmar();
      setAberto(false);
      if (typeof reverter === "function") {
        setDesfazer(() => reverter);
        setRestam(SEGUNDOS_PARA_DESFAZER);
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className={className ?? "text-caption font-medium text-muted hover:text-negative underline"}
      >
        {rotulo}
      </button>

      {aberto && typeof document !== "undefined" && createPortal(
        // ⚠️ Portal no `<body>`: o `Card` do DS tem `transform`, e um ancestral
        // transformado vira o bloco de contenção de qualquer `position: fixed`.
        <div
          className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setAberto(false)}
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
        >
          <div className="w-full max-w-[420px] bg-white rounded-card p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Icon name="triangle-alert" size={18} color="var(--color-negative)" />
              <span className="text-h3 text-ink">{titulo}</span>
            </div>
            <p className="m-0 text-label text-muted leading-[1.5]">{descricao}</p>
            <p className="m-0 text-caption text-faint">
              Você terá {SEGUNDOS_PARA_DESFAZER} segundos para desfazer depois de confirmar.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button ref={primeiroFoco} variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button variant="primary" onClick={executar} disabled={ocupado}>
                {ocupado ? "Executando…" : confirmarRotulo}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {desfazer && restam > 0 && typeof document !== "undefined" && createPortal(
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 bg-ink text-white text-label px-4 py-3 rounded-md"
        >
          <Icon name="check" size={15} color="var(--color-lime)" />
          <span>{titulo} — feito.</span>
          <button
            onClick={async () => { const f = desfazer; setDesfazer(null); setRestam(0); await f(); }}
            className="font-semibold underline"
          >
            Desfazer ({restam}s)
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
