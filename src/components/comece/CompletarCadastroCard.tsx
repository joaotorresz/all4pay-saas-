"use client";

/**
 * "Complete seu cadastro" — a porta da conversa do cadastro (Fase 4.2).
 *
 * Aparece em Primeiros passos enquanto o roteiro tiver pergunta pendente, e
 * abre o chat no modo que pergunta uma coisa por vez. Some quando não falta
 * nada (ou tudo foi pulado).
 */
import * as React from "react";
import { Card, Button, Icon } from "@/components/ui";
import { abrirChat } from "@/components/ia/ChatGlobal";
import { loadCompany } from "@/lib/company";
import { perguntasPendentes, type PerfilParaCompletar } from "@/core/cadastro/completar";

export function CompletarCadastroCard() {
  const [faltam, setFaltam] = React.useState(0);
  // localStorage só existe depois da montagem; o chat relê o servidor ao abrir.
  React.useEffect(() => {
    const ler = () => setFaltam(perguntasPendentes(loadCompany() as PerfilParaCompletar | null).length);
    ler();
    window.addEventListener("focus", ler);
    return () => window.removeEventListener("focus", ler);
  }, []);
  if (!faltam) return null;
  return (
    <Card className="flex flex-col gap-3" data-completar-cadastro={faltam}>
      <div className="flex items-center gap-2">
        <Icon name="sparkles" size={16} color="var(--color-text-secondary)" />
        <h3 className="m-0 text-h3 text-ink">Complete seu cadastro</h3>
      </div>
      <p className="m-0 text-body text-muted">
        Faltam <b className="text-ink tabular-nums">{faltam}</b> {faltam === 1 ? "resposta" : "respostas"} que a abertura de conta
        deixou para depois. A Quattro AI pergunta uma por vez, e você pode pular qualquer uma.
      </p>
      <Button variant="primary" className="self-start" onClick={() => abrirChat({ completar: true })}>Completar pela conversa</Button>
    </Card>
  );
}
