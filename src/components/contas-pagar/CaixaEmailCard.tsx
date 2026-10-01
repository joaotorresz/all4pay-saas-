"use client";

/**
 * "Receber contas por e-mail" — o endereço da caixa de entrada.
 *
 * Só aparece para quem ADMINISTRA (é quem pode gerar ou trocar o endereço; a
 * RPC recusa os outros de qualquer jeito — esconder é conveniência, não a
 * autorização). E a tela diz, sem rodeio, o estado da porta:
 *
 *  · demonstração → não há endereço (nada de inventar um);
 *  · sem domínio configurado → a recepção está desligada até a configuração do
 *    provedor, e o domínio NÃO é inventado;
 *  · com domínio → o endereço, para copiar e mandar aos fornecedores.
 *
 * ⚠️ Trocar o endereço mata o antigo — o fornecedor que ainda usa o velho passa
 * a ter o e-mail recusado. Por isso a troca pede confirmação e DIZ isso antes.
 */
import * as React from "react";
import { Card, Button } from "@/components/ui";
import { usePermissoes } from "@/components/app/usePermissoes";
import { isDemo } from "@/lib/demo";
import { lerToken, gerarEndereco, dominioDaCaixa } from "@/lib/caixa-email";
import { enderecoDaCaixa } from "@/core/caixa-entrada/email";

export function CaixaEmailCard() {
  const { pode, carregando } = usePermissoes();
  const admin = pode("administrar");
  const dominio = dominioDaCaixa();
  const [token, setToken] = React.useState<string | null>(null);
  const [lido, setLido] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [confirmarTroca, setConfirmarTroca] = React.useState(false);
  const [gerando, setGerando] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);

  React.useEffect(() => {
    if (!admin || isDemo) return;
    let vivo = true;
    lerToken()
      .then((t) => { if (vivo) { setToken(t); setLido(true); } })
      .catch((e: unknown) => { if (vivo) { setErro(e instanceof Error ? e.message : String(e)); setLido(true); } });
    return () => { vivo = false; };
  }, [admin]);

  if (carregando || !admin) return null;

  const gerar = async () => {
    setGerando(true); setErro("");
    try {
      setToken(await gerarEndereco());
      setConfirmarTroca(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  };

  const endereco = token && dominio ? enderecoDaCaixa(token, dominio) : null;

  return (
    <Card data-caixa-email>
      <div className="flex flex-col gap-3">
        <span className="text-h3 font-medium text-ink">Receber contas por e-mail</span>
        {isDemo ? (
          <p className="m-0 text-caption text-muted max-w-[70ch]">
            Na demonstração não há endereço de e-mail: a caixa recebe e-mail só numa empresa de verdade.
          </p>
        ) : !dominio ? (
          <p className="m-0 text-caption text-muted max-w-[70ch]" data-caixa-email-estado="desligada">
            Desligada até a configuração do provedor de e-mail. O domínio de recebimento ainda não foi definido,
            então não há endereço para mostrar — nenhum endereço é inventado aqui.
          </p>
        ) : (
          <>
            <p className="m-0 text-caption text-muted max-w-[70ch]">
              Peça aos fornecedores que mandem boletos e notas para este endereço. Cada e-mail entra nesta caixa esperando
              decisão — nada vira conta sozinho. A recepção só funciona depois que o provedor de e-mail estiver configurado.
            </p>
            {!lido ? (
              <span className="text-caption text-muted">Carregando…</span>
            ) : endereco ? (
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-label text-ink bg-surface-2 rounded-md px-3 py-2 break-all" data-caixa-email-endereco>{endereco}</code>
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(endereco).then(() => setCopiado(true), () => setCopiado(false));
                  }}
                >
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
                {!confirmarTroca && (
                  <Button variant="ghost" onClick={() => setConfirmarTroca(true)}>Trocar endereço</Button>
                )}
              </div>
            ) : (
              <div>
                <Button variant="primary" onClick={() => { void gerar(); }} disabled={gerando}>
                  {gerando ? "Gerando…" : "Gerar endereço"}
                </Button>
              </div>
            )}
            {confirmarTroca && (
              <div role="alertdialog" aria-label="Trocar endereço" className="flex flex-col gap-2 rounded-md bg-surface-2 p-4">
                <p className="m-0 text-caption text-ink">
                  O endereço atual deixa de receber na hora: e-mail mandado para ele passa a ser recusado. Troque só se o
                  endereço vazou ou recebeu o que não devia.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setConfirmarTroca(false)}>Cancelar</Button>
                  <Button variant="primary" onClick={() => { void gerar(); }} disabled={gerando}>
                    {gerando ? "Trocando…" : "Trocar endereço"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {erro && <p role="alert" className="m-0 text-caption text-negative">{erro}</p>}
      </div>
    </Card>
  );
}
