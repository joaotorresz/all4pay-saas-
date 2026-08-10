"use client";

import * as React from "react";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { MARCA } from "@/core/marca";
import { reportar } from "@/lib/erros";

/**
 * A TELA DE ERRO — em português, com marca, e **com o erro registrado**.
 *
 * ⚠️ A tela padrão do framework diz "Something went wrong!" e oferece um botão
 * "Try again". Fora o idioma, o problema de fundo é que ela não conta a
 * ninguém: o erro que derrubou a página morre no navegador da pessoa. É a mesma
 * família de defeito da ONDA 10 — o erro que ninguém vê é o que atravessa
 * meses — e por isso o `reportar` daqui não é enfeite: é o único lugar onde uma
 * falha de RENDER passa a ter dono.
 *
 * O texto não pede desculpas nem promete: diz o que aconteceu, o que já foi
 * feito (registrado) e o que a pessoa pode fazer agora. `digest` aparece porque
 * é o único identificador que liga o que ela viu ao que o time consegue achar.
 */
export default function Erro({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    reportar("plataforma.render", error, "a tela não pôde ser exibida", false);
  }, [error]);

  return (
    <MolduraPublica>
      <main className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="flex flex-col items-start gap-5 max-w-[520px]">
        <span className="text-caption tracking-[0.08em] text-faint">{MARCA}</span>

        <h1 className="m-0 text-h2 text-ink">Esta tela não abriu</h1>

        <p className="m-0 text-body text-muted">
          Alguma coisa falhou ao montar a página. Os seus dados não foram afetados — o erro
          aconteceu na exibição, depois de tudo já estar salvo.
        </p>

        <p className="m-0 text-caption text-faint">
          A falha foi registrada com o módulo responsável. Se ela se repetir, informe este
          código ao suporte:{" "}
          <span className="tabular-nums text-muted">{error.digest ?? "sem código"}</span>
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center rounded-pill bg-surface-2 px-4 py-2 text-label font-medium text-ink hover:bg-surface-3 transition-colors"
          >
            Tentar de novo
          </button>
          <a href="/" className="text-label text-muted hover:text-ink transition-colors">
            Voltar ao início
          </a>
        </div>
      </div>
      </main>
    </MolduraPublica>
  );
}
