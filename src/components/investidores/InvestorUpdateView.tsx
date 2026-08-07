"use client";

/**
 * Investor update (`/investidores`) — o relatório mensal para investidores
 * gerado dos números reais do sistema (motor `core/investor` sobre a camada
 * quantitativa). KPIs do mês + destaques/atenção automáticos + o TEXTO pronto
 * para colar no e-mail, com os campos do fundador (destaques e pedidos)
 * entrando nas seções. Demo-safe (só leitura dos motores).
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, BRL, Button, Icon, Textarea, Input } from "@/components/ui";
import { Skeleton } from "@/components/ui";
import { useInvestorUpdate } from "@/components/visao-geral/hooks";
import { gerarTextoInvestorUpdate } from "@/core/investor";
import { EmptyState } from "@/components/visao-geral/shared";

export function InvestorUpdateView() {
  const { data: u, isLoading, isError } = useInvestorUpdate();
  const [empresa, setEmpresa] = React.useState("");
  const [destaques, setDestaques] = React.useState("");
  const [pedidos, setPedidos] = React.useState("");
  const [idioma, setIdioma] = React.useState<"pt" | "en">("pt");
  const [copiado, setCopiado] = React.useState(false);

  const texto = React.useMemo(
    () => (u ? gerarTextoInvestorUpdate(u, { empresa, destaques, pedidos, idioma }) : ""),
    [u, empresa, destaques, pedidos, idioma],
  );

  const copiar = () => {
    try {
      void navigator.clipboard?.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { /* ignore */ }
  };

  const enviarEmail = () => {
    const assunto = texto.split("\n")[0] ?? "Investor update";
    window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
  };

  return (
    <AppShell title="Investor update">
      <div className="flex flex-col gap-5 pb-8">
        {isLoading && <Skeleton className="h-[120px] w-full" rounded="md" />}
        {isError && (
          <Card><EmptyState title="Não foi possível montar o update" hint="Verifique a conexão de dados e tente novamente." /></Card>
        )}
        {u && (
          <>
            {/* KPIs do mês */}
            <Card info={{
              titulo: "Métricas do update",
              oQue: "Os números que investidor espera num update mensal: caixa, burn, runway, receita, crescimento, MRR, margem e o score de saúde.",
              comoCalcula: "Tudo sai dos motores (quantitativo sobre os seus lançamentos) — nada digitado à mão. MRR = share recorrente × receita mensal.",
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div>
                  <h2 className="m-0 text-h3 font-medium text-ink">Métricas · {u.mesReferencia}</h2>
                  <span className="text-caption text-faint">derivadas dos lançamentos reais · {u.versaoModelo}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {u.kpis.map((k) => (
                  <div key={k.id} className="rounded-md bg-surface-2 px-4 py-3">
                    <div className="text-caption text-muted">{k.label}</div>
                    <div className="text-h3 font-semibold tabular-nums text-ink mt-1">
                      {typeof k.valor === "number" ? <BRL value={k.valor} /> : k.valor}
                    </div>
                    {k.hint && <div className="text-[12px] text-faint mt-[2px]">{k.hint}</div>}
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {/* Campos do fundador */}
              <Card className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="m-0 text-h3 font-medium text-ink">Sua parte</h2>
                    <span className="text-caption text-faint">o que só o fundador sabe — entra nas seções do texto</span>
                  </div>
                </div>
                <Input label="Nome da empresa (opcional)" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="ex.: ACME Tecnologia" />
                <Textarea
                  label="Destaques do mês (produto, time, clientes…)"
                  value={destaques}
                  onChange={(e) => setDestaques(e.target.value)}
                  rows={4}
                  placeholder={"ex.: Lançamos o módulo X; fechamos o cliente Y; contratamos 2 engenheiros."}
                />
                <Textarea
                  label="Como os investidores podem ajudar (asks)"
                  value={pedidos}
                  onChange={(e) => setPedidos(e.target.value)}
                  rows={3}
                  placeholder={"ex.: Intro para heads de finanças de marketplaces; indicação de contador especializado."}
                />
                <div className="flex flex-col gap-2">
                  <span className="text-caption font-medium text-faint">Destaques automáticos (dos motores)</span>
                  {u.destaquesAuto.length === 0 && <span className="text-caption text-faint">— nenhum destaque automático neste mês</span>}
                  {u.destaquesAuto.map((d, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="w-[6px] h-[6px] rounded-pill bg-positive mt-[7px] shrink-0" />
                      <span className="text-caption text-muted">{d}</span>
                    </div>
                  ))}
                  {u.atencaoAuto.map((d, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="w-[6px] h-[6px] rounded-pill bg-warning mt-[7px] shrink-0" />
                      <span className="text-caption text-muted">{d}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Texto pronto */}
              <Card className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <h2 className="m-0 text-h3 font-medium text-ink">Texto pronto para enviar</h2>
                    <span className="text-caption text-faint">atualiza ao vivo com os campos ao lado</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="flex p-1 gap-1 rounded-pill bg-surface-2" role="tablist" aria-label="Idioma do texto">
                      {([["pt", "PT"], ["en", "EN"]] as const).map(([val, label]) => {
                        const on = idioma === val;
                        return (
                          <button key={val} role="tab" aria-selected={on} onClick={() => setIdioma(val)}
                            className={`text-caption font-medium rounded-pill px-3 py-[5px] transition-colors ${on ? "bg-white text-ink" : "text-muted hover:text-ink"}`}>{label}</button>
                        );
                      })}
                    </div>
                    <Button variant="secondary" size="sm" onClick={enviarEmail}>
                      <Icon name="mail" size={14} color="currentColor" />
                      E-mail
                    </Button>
                    <Button variant="secondary" size="sm" onClick={copiar}>
                      <Icon name={copiado ? "check" : "file-text"} size={14} color="currentColor" />
                      {copiado ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </div>
                <pre className="m-0 whitespace-pre-wrap rounded-md bg-surface-2 p-4 text-caption leading-[1.6] text-ink font-sans">
                  {texto}
                </pre>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
