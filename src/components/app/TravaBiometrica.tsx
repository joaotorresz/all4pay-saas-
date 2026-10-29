"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { sairDaConta } from "@/lib/entrada";
import { aoMudarDePlano, biometriaLigada, pedirBiometria, useAppNativo } from "@/lib/app-nativo";

/** Quanto tempo em segundo plano antes de pedir a biometria de novo. */
const SEGUNDO_PLANO_MS = 60_000;
const MOTIVO = "Confirme que é você para ver os números da empresa.";

/**
 * TRAVA DO APP — só no app das lojas, só com "Destravar com biometria" ligado
 * em Segurança da conta. Cobre a tela ao abrir e ao voltar depois de um
 * minuto fora.
 *
 * ⚠️ É uma trava do APARELHO, não da conta: a sessão continua a mesma, e quem
 * não consegue destravar tem "Sair da conta", que leva ao login com senha.
 */
export function TravaBiometrica() {
  const { nativo } = useAppNativo();
  const [travado, setTravado] = React.useState(false);
  const [pedindo, setPedindo] = React.useState(false);
  const saiuEm = React.useRef<number | null>(null);

  const destravar = React.useCallback(async () => {
    setPedindo(true);
    const ok = await pedirBiometria(MOTIVO);
    setPedindo(false);
    if (ok) setTravado(false);
  }, []);

  React.useEffect(() => {
    if (!nativo || !biometriaLigada()) return;
    setTravado(true);
    void destravar();
    return aoMudarDePlano((ativo) => {
      if (!ativo) { saiuEm.current = Date.now(); return; }
      const fora = saiuEm.current == null ? 0 : Date.now() - saiuEm.current;
      saiuEm.current = null;
      if (biometriaLigada() && fora >= SEGUNDO_PLANO_MS) {
        setTravado(true);
        void destravar();
      }
    });
  }, [nativo, destravar]);

  if (!travado) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App travado"
      className="fixed inset-0 z-[300] bg-surface-1 flex flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <span className="text-h2 font-display text-ink">Quattro travado</span>
      <p className="m-0 text-label text-muted max-w-[32ch]">{MOTIVO}</p>
      <Button disabled={pedindo} aria-busy={pedindo} onClick={() => void destravar()}>
        {pedindo ? "Aguardando…" : "Destravar"}
      </Button>
      <button
        className="text-label text-muted hover:text-ink"
        onClick={async () => { await sairDaConta(); window.location.assign("/login"); }}
      >
        Sair da conta
      </button>
    </div>,
    document.body,
  );
}
