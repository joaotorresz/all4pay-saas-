"use client";

/**
 * COBRANÇA AUTOMÁTICA — a régua que avisa os CLIENTES da empresa por e-mail
 * (27/10/2026, pedido do dono: "cobrar cinco dias antes, três dias antes, no
 * dia, vencida", num lugar fácil de achar).
 *
 * ⚠️ Esta tela não tem motor próprio. A régua é a MESMA automação
 * `regua_cobranca` que o runner diário dispara (`core/automacoes`), e a
 * configuração mora no MESMO registro (`automacoes.parametros.etapas`). Antes
 * ela era um cartão entre os "Alertas do sistema", onde ninguém a achava; a
 * página só a trouxe para perto das contas a receber e deixou os dias
 * editáveis. Uma segunda régua divergiria da primeira no primeiro ajuste, e o
 * cliente seria cobrado pelas duas.
 *
 * ⚠️ Ligar continua pedindo confirmação: a régua fala com o CLIENTE em nome da
 * empresa. E o canal manual (protesto, negativação) nunca sai sozinho.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Switch, Select, Input, Skeleton, InfoHint, Icon, BRL } from "@/components/ui";
import {
  reguaDaEmpresa, agendaDaRegua, ETAPAS_PADRAO, DIA_MIN_REGUA, DIA_MAX_REGUA, TETO_ETAPAS,
  type EtapaConfigurada, type Canal,
} from "@/core/cobranca";
import { previaDaEtapa, type ConfigAutomacao } from "@/core/automacoes";
import { listarAutomacoes, salvarAutomacao, contextoDaEmpresa } from "@/lib/automacoes";
import { Parametros } from "@/components/configuracoes/AutomacoesView";
import { isDemo } from "@/lib/demo";

const CANAIS: { value: Canal; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Só me avisar" },
];

/** O modelo sugerido só por e-mail: 5 e 3 dias antes, no dia, 3, 10 e 30 depois, e o aviso manual de 60. */
const SUGERIDA_EMAIL: EtapaConfigurada[] = [
  ...[-5, -3, 0, 3, 10, 30].map((dia) => ({ dia, canal: "email" as Canal, ativo: true })),
  { dia: 60, canal: "manual", ativo: true },
];
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const hojeLocal = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** "5 dias antes", "No dia do vencimento", "3 dias depois". */
export function quandoDaEtapa(dia: number): string {
  if (dia === 0) return "No dia do vencimento";
  const n = Math.abs(dia);
  return `${n} ${n === 1 ? "dia" : "dias"} ${dia < 0 ? "antes" : "depois"}`;
}

interface Provedores { whatsapp: boolean; email: boolean }

export function CobrancaAutomaticaView() {
  const qc = useQueryClient();
  const configs = useQuery({ queryKey: ["automacoes"], queryFn: listarAutomacoes });
  const ctx = useQuery({ queryKey: ["automacao-contexto"], queryFn: contextoDaEmpresa, staleTime: 60_000 });
  const provedores = useQuery({
    queryKey: ["notificacoes-status"],
    queryFn: async (): Promise<Provedores> => {
      const r = await fetch("/api/notificacoes/status");
      if (!r.ok) throw new Error(`status ${r.status}`);
      return r.json();
    },
  });
  const inicial = configs.data?.find((c) => c.tipo === "regua_cobranca");

  if (configs.error) return <Card className="text-caption text-ink">Não foi possível ler a cobrança automática: {(configs.error as Error).message}</Card>;
  if (!inicial) return <Card><Skeleton className="h-48 w-full" /></Card>;
  return (
    <Editor
      inicial={inicial}
      ctx={ctx.data}
      ctxErro={ctx.error as Error | null}
      emailAtivo={!isDemo && !!provedores.data?.email}
      provedorCarregando={provedores.isLoading}
      onSalvo={() => {
        qc.invalidateQueries({ queryKey: ["automacoes"] });
        qc.invalidateQueries({ queryKey: ["automacao-contexto"] });
      }}
    />
  );
}

function Editor({ inicial, ctx, ctxErro, emailAtivo, provedorCarregando, onSalvo }: {
  inicial: ConfigAutomacao;
  ctx?: Awaited<ReturnType<typeof contextoDaEmpresa>>;
  ctxErro: Error | null;
  emailAtivo: boolean;
  provedorCarregando: boolean;
  onSalvo: () => void;
}) {
  const [cfg, setCfg] = React.useState<ConfigAutomacao>(inicial);
  React.useEffect(() => { setCfg(inicial); }, [inicial]);
  const [confirmar, setConfirmar] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const alterado = JSON.stringify(cfg) !== JSON.stringify(inicial);

  const etapas: EtapaConfigurada[] = cfg.parametros.etapas ?? ETAPAS_PADRAO;
  const regua = React.useMemo(() => reguaDaEmpresa(etapas), [etapas]);
  const setEtapas = (novas: EtapaConfigurada[]) => setCfg((c) => ({ ...c, parametros: { ...c.parametros, etapas: novas } }));
  const setP = (patch: Partial<ConfigAutomacao["parametros"]>) => setCfg((c) => ({ ...c, parametros: { ...c.parametros, ...patch } }));

  // O canal da etapa só sai se estiver entre os canais da automação; e-mail é o padrão desta tela.
  const canaisNecessarios = Array.from(new Set(regua.map((e) => e.canal).filter((c): c is "email" | "whatsapp" => c !== "manual")));
  const salvar = async () => {
    setSalvando(true); setMsg(null);
    try {
      const canais = Array.from(new Set([...cfg.canais, ...canaisNecessarios]));
      await salvarAutomacao({ ...cfg, canais });
      setMsg({ tom: "ok", texto: `Cobrança automática ${cfg.ativo ? "ligada" : "desligada"} e salva.` });
      onSalvo();
    } catch (e) {
      setMsg({ tom: "erro", texto: (e as Error).message || "Não foi possível salvar." });
    } finally { setSalvando(false); }
  };

  const dias = new Set(etapas.map((e) => e.dia));
  const repetidos = etapas.filter((e, i) => etapas.findIndex((x) => x.dia === e.dia) !== i).length;
  const adicionar = () => {
    // Sugere o primeiro dia livre na sequência que mais se usa.
    const sugestao = [-5, -3, -1, 0, 1, 3, 5, 7, 10, 15, 30].find((d) => !dias.has(d)) ?? 0;
    setEtapas([...etapas, { dia: sugestao, canal: "email" as Canal, ativo: true }].sort((a, b) => a.dia - b.dia));
  };

  return (
    <div className="flex flex-col gap-5 pb-4 max-w-4xl" data-tela="cobranca-automatica">
      <Card className="flex flex-col gap-4 a4p-entra">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] flex flex-col gap-1">
            <div className="text-h3 font-medium text-ink inline-flex items-center gap-1">
              Cobrar meus clientes sozinho
              <InfoHint align="left" titulo="Cobrança automática"
                oQue="Todo dia de manhã o Quattro olha as suas contas a receber em aberto e manda ao cliente o aviso da etapa em que o título chegou: antes do vencimento, no dia ou depois de vencido."
                comoCalcula="A etapa sai dos dias entre hoje e o vencimento. Cada cliente recebe no máximo uma mensagem por dia, com todos os títulos dele juntos, e a mesma etapa nunca vai duas vezes para o mesmo título. Título pago some da régua no mesmo dia." />
            </div>
            <p className="m-0 text-caption text-muted max-w-[64ch]">
              O e-mail sai em nome da sua empresa, com razão social e CNPJ, e sempre diz &quot;se já pagou, desconsidere&quot;. O cliente precisa ter e-mail no cadastro.
            </p>
          </div>
          <Switch
            id="sw-cobranca-automatica"
            checked={cfg.ativo}
            label={cfg.ativo ? "Ligada" : "Desligada"}
            onChange={(on) => {
              if (on && !inicial.ativo) { setConfirmar(true); return; }
              setCfg((c) => ({ ...c, ativo: on }));
            }}
          />
        </div>
        {confirmar && (
          <div className="flex flex-col gap-2 border border-border rounded-md p-3" role="alertdialog" aria-label="Confirmar a cobrança automática">
            <span className="text-label text-ink">
              A partir de amanhã de manhã, seus clientes com títulos em aberto passam a receber os avisos abaixo em nome da sua empresa. Etapas marcadas como manuais nunca saem sozinhas.
            </span>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="primary" onClick={() => { setCfg((c) => ({ ...c, ativo: true })); setConfirmar(false); }}>Ligar a cobrança automática</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>Cancelar</Button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-caption text-muted">
          <span className="w-[8px] h-[8px] rounded-pill shrink-0" aria-hidden
            style={{ background: emailAtivo ? "var(--color-positive)" : "var(--color-warning)" }} />
          {provedorCarregando ? "Conferindo o envio de e-mail…"
            : emailAtivo ? "Envio de e-mail ativo."
              : isDemo ? "Na demonstração nenhum e-mail sai: os envios ficam registrados como simulados."
                : "O envio de e-mail ainda não está configurado: os avisos ficam registrados como simulados até o administrador da plataforma ligá-lo."}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 a4p-entra" style={{ ["--a4p-atraso" as string]: "60ms" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 basis-full sm:basis-auto text-label font-medium text-ink">Quando cobrar</span>
          <Button size="sm" variant="secondary" onClick={() => setEtapas(SUGERIDA_EMAIL)}>Usar o modelo só por e-mail</Button>
          <Button size="sm" variant="ghost" onClick={() => setEtapas(ETAPAS_PADRAO)}>Voltar ao padrão</Button>
        </div>
        <div className="flex flex-col" role="list" aria-label="Etapas da cobrança">
          {etapas.map((e, i) => {
            const fora = !Number.isInteger(e.dia) || e.dia < DIA_MIN_REGUA || e.dia > DIA_MAX_REGUA;
            const set = (patch: Partial<EtapaConfigurada>) => setEtapas(etapas.map((x, k) => (k === i ? { ...x, ...patch } : x)));
            const quando = e.dia < 0 ? "antes" : e.dia > 0 ? "depois" : "no-dia";
            return (
              <div key={i} role="listitem" data-etapa-dia={e.dia}
                className={`grid grid-cols-[auto_1fr] sm:grid-cols-[132px_88px_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3 border-t border-border-soft py-3 first:border-t-0 ${e.ativo ? "" : "opacity-60"}`}>
                <div className="pb-2"><Switch id={`sw-etapa-${i}`} checked={e.ativo} label={e.ativo ? "Ligada" : "Desligada"}
                  onChange={(on) => set({ ativo: on })} /></div>
                {quando !== "no-dia" ? (
                  <Input type="number" min={1} max={quando === "antes" ? -DIA_MIN_REGUA : DIA_MAX_REGUA} label="Dias"
                    value={String(Math.abs(e.dia))} invalid={fora}
                    onChange={(ev) => { const n = Math.max(1, Math.round(Number(ev.target.value) || 1)); set({ dia: quando === "antes" ? -n : n }); }} />
                ) : <span className="hidden sm:block" aria-hidden />}
                <Select label="Quando" value={quando}
                  options={[{ value: "antes", label: "Antes do vencimento" }, { value: "no-dia", label: "No dia do vencimento" }, { value: "depois", label: "Depois de vencido" }]}
                  onChange={(v) => {
                    const n = Math.abs(e.dia) || 3;
                    set({ dia: v === "no-dia" ? 0 : v === "antes" ? -n : n });
                  }} />
                <Select label="Como" value={e.canal} options={CANAIS}
                  onChange={(v) => set({ canal: v as Canal })} />
                <div className="pb-1">
                  <Button size="sm" variant="ghost" aria-label={`Remover a etapa ${quandoDaEtapa(e.dia)}`} title="Remover etapa"
                    onClick={() => setEtapas(etapas.filter((_, k) => k !== i))}>
                    <Icon name="trash-2" size={16} color="currentColor" />
                  </Button>
                </div>
              </div>
            );
          })}
          {etapas.length === 0 && <span className="text-caption text-muted py-2">Nenhuma etapa: com a cobrança ligada, nada sai.</span>}
        </div>
        {repetidos > 0 && <span className="text-caption text-negative" role="alert">Há duas etapas no mesmo dia: só a primeira vale.</span>}
        <div>
          <Button size="sm" variant="secondary" disabled={etapas.length >= TETO_ETAPAS} onClick={adicionar}
            leftIcon={<Icon name="plus" size={14} color="currentColor" />}>
            {etapas.length >= TETO_ETAPAS ? `Limite de ${TETO_ETAPAS} etapas` : "Adicionar etapa"}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 a4p-entra" style={{ ["--a4p-atraso" as string]: "120ms" }}>
        <span className="text-label font-medium text-ink">Encargos, PIX e pausas</span>
        <Parametros cfg={cfg} setP={setP} ctx={ctx} />
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" disabled={!alterado || salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</Button>
        {msg && <span className={`text-caption ${msg.tom === "erro" ? "text-negative" : "text-ink"}`} role={msg.tom === "erro" ? "alert" : "status"}>{msg.texto}</span>}
        {alterado && !msg && <span className="text-caption text-muted">Alterações ainda não salvas.</span>}
      </div>

      <PreviaDoEmail ctx={ctx} ctxErro={ctxErro} cfg={cfg} regua={regua} />
      <ProximosEnvios ctx={ctx} ctxErro={ctxErro} regua={regua} ativo={cfg.ativo} />
    </div>
  );
}

function PreviaDoEmail({ ctx, ctxErro, cfg, regua }: {
  ctx?: Awaited<ReturnType<typeof contextoDaEmpresa>>; ctxErro: Error | null; cfg: ConfigAutomacao;
  regua: ReturnType<typeof reguaDaEmpresa>;
}) {
  const automaticas = regua.filter((e) => e.canal !== "manual");
  const [sel, setSel] = React.useState<string>("");
  const etapa = automaticas.find((e) => e.id === sel) ?? automaticas[0];
  const conteudo = React.useMemo(() => (ctx && etapa ? previaDaEtapa(ctx, cfg.parametros, etapa) : null), [ctx, etapa, cfg.parametros]);
  return (
    <Card className="flex flex-col gap-3 a4p-entra" style={{ ["--a4p-atraso" as string]: "180ms" }} data-previa="cobranca">
      <div className="flex items-end gap-3 flex-wrap">
        <span className="flex-1 text-label font-medium text-ink inline-flex items-center gap-2">
          <Icon name="mail" size={16} color="currentColor" /> Como o cliente recebe
        </span>
        {automaticas.length > 0 && (
          <Select label="Etapa" value={etapa?.id ?? ""} containerClassName="w-[240px]"
            options={automaticas.map((e) => ({ value: e.id, label: quandoDaEtapa(e.dia) }))} onChange={setSel} />
        )}
      </div>
      {ctxErro ? <span className="text-caption text-ink">Os dados da empresa não carregaram: {ctxErro.message}</span>
        : !ctx ? <Skeleton className="h-64 w-full" />
          : !conteudo ? <span className="text-caption text-muted">Nenhuma etapa automática ligada: não há e-mail para mostrar.</span>
            : (
              <>
                <span className="text-caption text-muted">Assunto: <span className="text-ink">{conteudo.assunto}</span> · cliente e valor de exemplo</span>
                <iframe title="Prévia do e-mail de cobrança" srcDoc={conteudo.html} sandbox=""
                  className="w-full h-[520px] border border-border rounded-md bg-white" />
              </>
            )}
    </Card>
  );
}

function ProximosEnvios({ ctx, ctxErro, regua, ativo }: {
  ctx?: Awaited<ReturnType<typeof contextoDaEmpresa>>; ctxErro: Error | null;
  regua: ReturnType<typeof reguaDaEmpresa>; ativo: boolean;
}) {
  const agenda = React.useMemo(() => (ctx ? agendaDaRegua({ ...ctx.input, hoje: ctx.hoje || hojeLocal() }, regua, 7) : []), [ctx, regua]);
  const semEmail = (partyId: string | null) => !partyId || !String(ctx?.contatos[partyId]?.email ?? "").includes("@");
  const faltam = new Set(agenda.filter((a) => a.etapa.canal === "email" && semEmail(a.partyId)).map((a) => a.cliente));
  const porDia = new Map<string, typeof agenda>();
  for (const a of agenda) porDia.set(a.data, [...(porDia.get(a.data) ?? []), a]);

  return (
    <Card className="flex flex-col gap-3 a4p-entra" style={{ ["--a4p-atraso" as string]: "240ms" }} data-agenda="cobranca">
      <span className="text-label font-medium text-ink inline-flex items-center gap-2">
        <Icon name="calendar" size={16} color="currentColor" /> Próximos 7 dias
      </span>
      {!ativo && <span className="text-caption text-muted">A cobrança está desligada: esta é a agenda de quando você ligar.</span>}
      {faltam.size > 0 && (
        <div className="flex items-start gap-2 text-caption text-ink" role="status">
          <Icon name="triangle-alert" size={14} color="var(--color-warning)" />
          <span>
            {faltam.size === 1 ? "1 cliente não tem" : `${faltam.size} clientes não têm`} e-mail no cadastro e não {faltam.size === 1 ? "vai" : "vão"} receber: {Array.from(faltam).slice(0, 5).join(", ")}{faltam.size > 5 ? "…" : ""}.{" "}
            <Link href="/dashboard/registrations/clients" className="underline">Completar cadastro</Link>
          </span>
        </div>
      )}
      {ctxErro ? <span className="text-caption text-ink">As contas a receber não carregaram: {ctxErro.message}</span>
        : !ctx ? <Skeleton className="h-24 w-full" />
          : agenda.length === 0 ? <span className="text-caption text-muted">Nenhum título em aberto chega a uma etapa nos próximos 7 dias.</span>
            : (
              <div className="flex flex-col gap-3">
                {Array.from(porDia.entries()).map(([data, itens]) => (
                  <DiaDaAgenda key={data} data={data} hoje={ctx.hoje} itens={itens} semEmail={semEmail} />
                ))}
              </div>
            )}
    </Card>
  );
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Hoje", "Amanhã" ou "quinta, 29/10" — o dia da semana sai da string, sem fuso. */
function rotuloDoDia(data: string, hoje: string): string {
  if (data === hoje) return "Hoje";
  if (data === somarDiasIso(hoje, 1)) return "Amanhã";
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${br(data).slice(0, 5)}`;
}

function somarDiasIso(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Antes do vencimento é lembrete; no dia e depois é cobrança — a etapa diz qual. */
function grupoDaEtapa(dia: number): "antes" | "dia" | "depois" {
  return dia < 0 ? "antes" : dia === 0 ? "dia" : "depois";
}

const ROTULO_GRUPO = { antes: "Lembrete", dia: "Vence hoje", depois: "Em atraso" } as const;

function DiaDaAgenda({ data, hoje, itens, semEmail }: {
  data: string; hoje: string;
  itens: ReturnType<typeof agendaDaRegua>;
  semEmail: (partyId: string | null) => boolean;
}) {
  const total = itens.reduce((s, a) => s + a.valor, 0);
  return (
    <section className="rounded-md bg-surface-1 p-3 sm:p-4 flex flex-col gap-2" aria-label={rotuloDoDia(data, hoje)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-label font-medium text-ink first-letter:uppercase">{rotuloDoDia(data, hoje)}</span>
        <span className="text-caption text-muted">
          {itens.length === 1 ? "1 cobrança" : `${itens.length} cobranças`} · <BRL value={total} />
        </span>
      </header>
      <ul className="flex flex-col rounded-md bg-white">
        {itens.map((a) => {
          const grupo = grupoDaEtapa(a.etapa.dia);
          const falta = a.etapa.canal === "email" && semEmail(a.partyId);
          return (
            <li key={`${a.movimentoId}-${a.etapa.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 border-t border-border-soft first:border-t-0">
              <div className="flex flex-col min-w-0">
                <span className="text-body text-ink truncate">{a.cliente}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-1 px-2 py-0.5 text-ink">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-pill"
                      style={{ background: grupo === "depois" ? "var(--color-warning)" : grupo === "dia" ? "var(--color-ink)" : "var(--color-areia)" }} />
                    {ROTULO_GRUPO[grupo]}
                  </span>
                  {grupo !== "dia" && <span>{a.etapa.nome}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Icon name={a.etapa.canal === "whatsapp" ? "smartphone" : a.etapa.canal === "email" ? "mail" : "bell"} size={12} color="currentColor" />
                    {a.etapa.canal === "email" ? "E-mail" : a.etapa.canal === "whatsapp" ? "WhatsApp" : "Só me avisar"}
                  </span>
                  {falta && (
                    <span className="inline-flex items-center gap-1 text-ink">
                      <Icon name="triangle-alert" size={12} color="var(--color-warning)" /> sem e-mail no cadastro
                    </span>
                  )}
                </span>
              </div>
              <span className="tabular-nums text-right text-body text-ink"><BRL value={a.valor} /></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
