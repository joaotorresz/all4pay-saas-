"use client";

import * as React from "react";
import { Card, Switch } from "@/components/ui";
import { biometriaDisponivel, biometriaLigada, gravarBiometria, pedirBiometria, useAppNativo } from "@/lib/app-nativo";

/**
 * "Destravar com biometria" — só aparece no app das lojas. Ligar pede a
 * biometria uma vez antes: ligar uma trava que o aparelho não consegue abrir
 * deixaria a pessoa presa na próxima abertura.
 */
export function BiometriaDoApp() {
  const { nativo } = useAppNativo();
  const [disponivel, setDisponivel] = React.useState<boolean | null>(null);
  const [ligada, setLigada] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!nativo) return;
    setLigada(biometriaLigada());
    void biometriaDisponivel().then(setDisponivel);
  }, [nativo]);

  if (!nativo) return null;

  async function alternar(v: boolean) {
    setErro(null);
    if (v) {
      const ok = await pedirBiometria("Confirme para ligar a trava do app.");
      if (!ok) { setErro("A biometria não foi confirmada. A trava continua desligada."); return; }
    }
    gravarBiometria(v);
    setLigada(v);
  }

  return (
    <Card className="flex flex-col gap-3">
      <span className="text-h3 font-medium text-ink">Destravar com biometria</span>
      <p className="m-0 text-label text-muted max-w-[72ch]">
        Neste celular, o app pede a digital, o rosto ou a senha do aparelho ao abrir e ao voltar depois de
        um minuto fora. Vale só para este aparelho.
      </p>
      {disponivel === false ? (
        <p className="m-0 text-caption text-muted">Este aparelho não tem biometria nem senha de bloqueio cadastradas.</p>
      ) : (
        <Switch checked={ligada} onChange={(v) => void alternar(v)} label="Pedir biometria ao abrir o app" disabled={disponivel === null} />
      )}
      {erro && <p role="alert" className="m-0 text-caption text-negative">{erro}</p>}
    </Card>
  );
}
