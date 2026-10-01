"use client";

/**
 * AUTOMAÇÕES — o que o Quattro manda sozinho, para quem e por qual canal.
 *
 * A tela não decide nada: o núcleo (`core/automacoes`) redige a mensagem, e a
 * PRÉVIA mostrada aqui é a mesma função que o runner diário chama — com os
 * números reais desta empresa. O que muda aqui é só a configuração (ligado,
 * canais, destinatários, parâmetros) e o registro dos envios.
 *
 * ⚠️ Tudo nasce DESLIGADO. A régua de cobrança, que fala com os CLIENTES em
 * nome da empresa, exige uma confirmação explícita antes de ligar.
 *
 * ⚠️ A tela diz quais provedores estão ativos e o que falta — sem nomear
 * variável de ambiente (ONDA 14): quem opera o caixa não tem acesso ao
 * servidor, e o nome da chave só serve a quem administra a instalação.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card, Button, Switch, Checkbox, Select, Input, CurrencyInput, DateField, StatusBadge, Skeleton, InfoHint, Icon,
} from "@/components/ui";
import {
  CATALOGO_AUTOMACOES, previa, ehSemEnvio, filaAutomatica, HORIZONTES_ALERTA,
  type ConfigAutomacao, type ContextoAutomacao, type TipoAutomacao, type CanalEnvio, type Destinatario,
  type StatusEnvio, type Pausa,
} from "@/core/automacoes";
import {
  listarAutomacoes, salvarAutomacao, listarEnvios, contextoDaEmpresa, enviarTeste, type EnvioVisivel,
} from "@/lib/automacoes";
import { isDemo } from "@/lib/demo";

const CANAL: Record<CanalEnvio | "manual", string> = { email: "E-mail", whatsapp: "WhatsApp", manual: "Registro manual" };
const STATUS: Record<StatusEnvio, { rotulo: string; tom: "positive" | "neutral" | "warning" | "ink" }> = {
  enviado: { rotulo: "Enviado", tom: "positive" },
  manual: { rotulo: "Avisado à mão", tom: "ink" },
  simulado: { rotulo: "Simulado — nada saiu", tom: "neutral" },
  falhou: { rotulo: "Falhou", tom: "warning" },
  pendente: { rotulo: "Pendente", tom: "neutral" },
};
const nomeDo = (t: TipoAutomacao) => CATALOGO_AUTOMACOES.find((c) => c.tipo === t)?.nome ?? t;
const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

interface Provedores { whatsapp: boolean; email: boolean; templates?: Record<string, boolean> }

export function AutomacoesView() {
  const qc = useQueryClient();
  const configs = useQuery({ queryKey: ["automacoes"], queryFn: listarAutomacoes });
  const envios = useQuery({ queryKey: ["automacao-envios"], queryFn: () => listarEnvios(50) });
  const ctx = useQuery({ queryKey: ["automacao-contexto"], queryFn: contextoDaEmpresa, staleTime: 60_000 });
  const provedores = useQuery({
    queryKey: ["notificacoes-status"],
    queryFn: async (): Promise<Provedores> => {
      const r = await fetch("/api/notificacoes/status");
      if (!r.ok) throw new Error(`status ${r.status}`);
      return r.json();
    },
  });
  const [aviso, setAviso] = React.useState<string | null>(null);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["automacoes"] });
    qc.invalidateQueries({ queryKey: ["automacao-envios"] });
    qc.invalidateQueries({ queryKey: ["automacao-contexto"] });
  };

  const prov = provedores.data;
  // Na demonstração nada sai, mesmo que o servidor tenha chave: é o que a rota faz.
  const emailAtivo = !isDemo && !!prov?.email;
  const whatsAtivo = !isDemo && !!prov?.whatsapp;

  return (
    <div className="flex flex-col gap-5 pb-4 max-w-4xl" data-tela="automacoes">
      <Card className="flex flex-col gap-3">
        <div className="text-label font-medium text-muted inline-flex items-center gap-1">
          Como as mensagens saem
          <InfoHint align="left" titulo="Automações"
            oQue="Mensagens que o Quattro manda sozinho: o resumo do caixa, o lembrete de contas a pagar, o alerta de caixa, o aviso de fechamento e a régua de cobrança."
            comoCalcula="Uma vez por dia, pela manhã, o sistema monta cada mensagem com os mesmos números das telas (saldo, contas a pagar, régua) e registra cada envio antes de chamar o provedor. Reexecutar não manda de novo: o registro recusa a repetição." />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <ProvedorLinha nome="E-mail" ativo={emailAtivo} carregando={provedores.isLoading} />
          <ProvedorLinha nome="WhatsApp" ativo={whatsAtivo} carregando={provedores.isLoading} />
        </div>
        <p className="m-0 text-caption text-muted max-w-[76ch]">
          {isDemo
            ? "Esta é uma demonstração: nada é enviado. Os envios e os testes ficam registrados como simulados."
            : !emailAtivo || !whatsAtivo
              ? "Canal sem provedor configurado continua rodando e registrando — como simulado, e simulado não conta como aviso. Para ligar o envio de verdade, peça a quem administra a instalação para configurar o provedor do canal."
              : "Os dois canais estão ativos. \"Enviado\" quer dizer que o provedor aceitou a mensagem; a entrega em si é confirmada pelo provedor."}
          {" "}A execução é diária, às 9h (horário de Brasília).
        </p>
        {whatsAtivo && prov?.templates && Object.values(prov.templates).every((t) => !t) && (
          <p className="m-0 text-caption text-muted max-w-[76ch]">
            Nenhum modelo de mensagem do WhatsApp foi aprovado ainda: fora da janela de 24 horas da última conversa, o WhatsApp recusa mensagem livre.
          </p>
        )}
      </Card>

      {aviso && <Card className="text-caption text-ink" role="status">{aviso}</Card>}

      {configs.isLoading || !configs.data ? (
        <Card><Skeleton className="h-40 w-full" /></Card>
      ) : configs.error ? (
        <Card className="text-caption text-ink">Não foi possível ler as automações: {(configs.error as Error).message}</Card>
      ) : (
        configs.data.map((cfg) => (
          <CartaoAutomacao key={cfg.tipo} inicial={cfg} ctx={ctx.data} ctxErro={ctx.error as Error | null}
            canaisAtivos={{ email: emailAtivo, whatsapp: whatsAtivo }}
            onSalvo={(m) => { setAviso(m); recarregar(); }} />
        ))
      )}

      <Card padded={false}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border-soft">
          <span className="flex-1 text-label font-medium text-ink">Últimos envios</span>
          <Button size="sm" variant="ghost" onClick={recarregar} leftIcon={<Icon name="rotate-ccw" size={14} color="currentColor" />}>Atualizar</Button>
        </div>
        <ListaEnvios envios={envios.data} carregando={envios.isLoading} erro={envios.error as Error | null} />
      </Card>
    </div>
  );
}

function ProvedorLinha({ nome, ativo, carregando }: { nome: string; ativo: boolean; carregando: boolean }) {
  return (
    <div className="flex items-center gap-2 text-label text-ink">
      <span className="w-[8px] h-[8px] rounded-pill shrink-0" aria-hidden
        style={{ background: ativo ? "var(--color-positive)" : "var(--color-warning)" }} />
      <span className="font-medium">{nome}</span>
      <span className="text-muted">{carregando ? "conferindo…" : ativo ? "ativo" : "não configurado — envios ficam simulados"}</span>
    </div>
  );
}

function ListaEnvios({ envios, carregando, erro }: { envios?: EnvioVisivel[]; carregando: boolean; erro: Error | null }) {
  if (carregando) return <div className="p-5"><Skeleton className="h-20 w-full" /></div>;
  if (erro) return <div className="px-5 py-4 text-caption text-ink">O registro não carregou: {erro.message}</div>;
  if (!envios?.length) return <div className="px-5 py-4 text-caption text-muted">Nenhum envio registrado ainda.</div>;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Últimos envios">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            <th className="px-5 py-2">Quando</th><th className="px-2 py-2">Automação</th><th className="px-2 py-2">Canal</th>
            <th className="px-2 py-2">Para</th><th className="px-5 py-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {envios.map((e, i) => (
            <tr key={`${e.chave}-${e.canal}-${i}`} className="border-t border-border-soft text-caption text-ink" data-envio-status={e.status}>
              <td className="px-5 py-2 tabular-nums whitespace-nowrap">{quando(e.em)}</td>
              <td className="px-2 py-2">{nomeDo(e.tipo)}{e.chave.startsWith("teste:") ? " · teste" : ""}</td>
              <td className="px-2 py-2">{CANAL[e.canal]}</td>
              <td className="px-2 py-2 tabular-nums">{e.destinoMascarado}</td>
              <td className="px-5 py-2" title={e.erro ?? undefined}>
                <StatusBadge tone={STATUS[e.status].tom}>{STATUS[e.status].rotulo}</StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CartaoAutomacao({ inicial, ctx, ctxErro, canaisAtivos, onSalvo }: {
  inicial: ConfigAutomacao; ctx?: ContextoAutomacao; ctxErro: Error | null;
  canaisAtivos: { email: boolean; whatsapp: boolean }; onSalvo: (m: string) => void;
}) {
  const desc = CATALOGO_AUTOMACOES.find((c) => c.tipo === inicial.tipo)!;
  const [cfg, setCfg] = React.useState<ConfigAutomacao>(inicial);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [verPrevia, setVerPrevia] = React.useState(false);
  const [confirmarRegua, setConfirmarRegua] = React.useState(false);
  const [testando, setTestando] = React.useState(false);
  const [resultadoTeste, setResultadoTeste] = React.useState<string | null>(null);
  React.useEffect(() => { setCfg(inicial); }, [inicial]);
  const alterado = JSON.stringify(cfg) !== JSON.stringify(inicial);
  const fala_com_cliente = desc.fala_com === "cliente";

  const p = React.useMemo(() => (ctx ? previa(cfg, ctx) : null), [cfg, ctx]);

  const setP = (patch: Partial<ConfigAutomacao["parametros"]>) => setCfg((c) => ({ ...c, parametros: { ...c.parametros, ...patch } }));
  const alternarCanal = (canal: CanalEnvio, on: boolean) =>
    setCfg((c) => ({ ...c, canais: on ? Array.from(new Set([...c.canais, canal])) : c.canais.filter((x) => x !== canal) }));
  const destinatario = (userId: string) => cfg.destinatarios.find((d) => d.userId === userId);
  const setDest = (userId: string, nome: string | null | undefined, patch: Partial<Destinatario>) =>
    setCfg((c) => {
      const atual = c.destinatarios.find((d) => d.userId === userId) ?? { userId, nome: nome ?? null, email_ativo: false, whatsapp_ativo: false };
      const novo = { ...atual, ...patch };
      const outros = c.destinatarios.filter((d) => d.userId !== userId);
      return { ...c, destinatarios: novo.email_ativo || novo.whatsapp_ativo || novo.telefone ? [...outros, novo] : outros };
    });

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      await salvarAutomacao(cfg);
      onSalvo(`${desc.nome}: ${cfg.ativo ? "ligada" : "desligada"} e salva.`);
    } catch (e) {
      // ⚠️ A mensagem REAL do banco (permissão, validação) — "tente de novo"
      // não resolve uma recusa.
      setErro((e as Error).message || "Não foi possível salvar.");
    } finally { setSalvando(false); }
  };

  const testar = async (canal: CanalEnvio) => {
    if (!p || ehSemEnvio(p)) return;
    setTestando(true); setResultadoTeste(null);
    try {
      const r = await enviarTeste({
        tipo: cfg.tipo, canal, assunto: p.assunto, texto: p.texto, html: p.html,
        finalidade: p.finalidade, variaveis: p.variaveis,
      });
      setResultadoTeste(
        r.situacao === "enviado" ? `Teste enviado para ${r.destino}. O provedor aceitou a mensagem.`
          : r.situacao === "simulado" ? `Teste registrado como simulado (${r.destino}): ${r.motivo ?? "nada foi enviado."}`
            : `O teste não saiu: ${r.motivo ?? "sem detalhe"}.`,
      );
      onSalvo(`${desc.nome}: teste ${r.situacao === "enviado" ? "enviado" : r.situacao === "simulado" ? "registrado como simulado" : "não saiu"}.`);
    } catch (e) {
      setResultadoTeste(`O teste não saiu: ${(e as Error).message}`);
    } finally { setTestando(false); }
  };

  const titulares = ctx?.membros ?? [];
  const fila = ctx && fala_com_cliente ? filaAutomatica(ctx, cfg.parametros) : null;

  return (
    <Card className="flex flex-col gap-4" data-automacao={cfg.tipo}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <div className="text-h3 font-medium text-ink">{desc.nome}</div>
          <p className="m-0 text-caption text-muted max-w-[70ch]">{desc.resumo}</p>
          <p className="m-0 text-caption text-faint">{desc.quando}</p>
        </div>
        <Switch
          id={`sw-automacao-${cfg.tipo}`}
          checked={cfg.ativo}
          label={cfg.ativo ? "Ligada" : "Desligada"}
          onChange={(on) => {
            // ⚠️ A régua fala com o CLIENTE: ligar pede confirmação explícita.
            if (on && fala_com_cliente && !inicial.ativo) { setConfirmarRegua(true); return; }
            setCfg((c) => ({ ...c, ativo: on }));
          }}
        />
      </div>

      {confirmarRegua && (
        <div className="flex flex-col gap-2 border border-border rounded-md p-3" role="alertdialog" aria-label="Confirmar a régua automática">
          <span className="text-label text-ink">
            A régua automática manda mensagens aos SEUS CLIENTES em nome da empresa, identificando a razão social e o CNPJ. Ela só envia no dia em que o título chega à etapa, uma mensagem por cliente por dia, e a etapa de 60 dias (protesto ou negativação) nunca sai sozinha.
          </span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="primary" onClick={() => { setCfg((c) => ({ ...c, ativo: true })); setConfirmarRegua(false); }}>Ligar a régua automática</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmarRegua(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="a4p-label text-faint">Canais</span>
        <div className="flex gap-5 flex-wrap">
          {desc.canaisPossiveis.map((c) => (
            <Checkbox key={c} id={`cb-${cfg.tipo}-${c}`} checked={cfg.canais.includes(c)}
              onChange={(e) => alternarCanal(c, e.target.checked)}
              label={`${CANAL[c]}${canaisAtivos[c] ? "" : " (simulado)"}`} />
          ))}
        </div>
      </div>

      {!fala_com_cliente ? (
        <div className="flex flex-col gap-2">
          <span className="a4p-label text-faint">Quem recebe (titulares e administradores)</span>
          {ctxErro ? (
            <span className="text-caption text-ink">Os membros da empresa não carregaram: {ctxErro.message}</span>
          ) : !ctx ? (
            <Skeleton className="h-10 w-full" />
          ) : titulares.length === 0 ? (
            <span className="text-caption text-muted">
              {isDemo ? "Na demonstração não há membros cadastrados; o teste vai para você e fica registrado como simulado." : "Nenhum titular ou administrador encontrado nesta empresa."}
            </span>
          ) : titulares.map((m) => {
            const d = destinatario(m.userId);
            return (
              <div key={m.userId} className="flex items-center gap-4 flex-wrap border-t border-border-soft pt-2">
                <span className="min-w-[180px] text-label text-ink">{m.nome || m.email || "Membro"}<span className="block text-caption text-faint">{m.email ?? "sem e-mail"}</span></span>
                <Checkbox id={`cb-${cfg.tipo}-${m.userId}-email`} checked={!!d?.email_ativo} disabled={!m.email}
                  onChange={(e) => setDest(m.userId, m.nome, { email_ativo: e.target.checked })} label="E-mail" />
                <Checkbox id={`cb-${cfg.tipo}-${m.userId}-wa`} checked={!!d?.whatsapp_ativo}
                  onChange={(e) => setDest(m.userId, m.nome, { whatsapp_ativo: e.target.checked })} label="WhatsApp" />
                <Input aria-label={`Telefone de WhatsApp de ${m.nome || m.email || "membro"}`} placeholder="(11) 99999-0000"
                  value={d?.telefone ?? ""} onChange={(e) => setDest(m.userId, m.nome, { telefone: e.target.value })}
                  containerClassName="w-[180px]" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="a4p-label text-faint">Quem recebe</span>
          <span className="text-caption text-muted">
            Cada cliente, pelo telefone ou e-mail do cadastro de contatos. Cliente sem contato cadastrado fica de fora (e aparece na prévia).
            {fila ? ` Hoje: ${fila.grupos.length} cliente(s) na fila automática${fila.pausados.length ? `, ${fila.pausados.length} título(s) pausado(s)` : ""}${fila.jaCobrados.length ? `, ${fila.jaCobrados.length} já cobrado(s) hoje` : ""}.` : ""}
          </span>
        </div>
      )}

      <Parametros cfg={cfg} setP={setP} ctx={ctx} />

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="primary" disabled={!alterado || salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setVerPrevia((v) => !v)} aria-expanded={verPrevia}>
          {verPrevia ? "Esconder prévia" : "Ver prévia"}
        </Button>
        {desc.canaisPossiveis.map((c) => (
          <Button key={c} size="sm" variant="ghost" disabled={testando || !p || ehSemEnvio(p)}
            onClick={() => testar(c)}>
            {testando ? "Enviando…" : `Enviar teste para mim (${CANAL[c]})`}
          </Button>
        ))}
      </div>
      {erro && <span className="text-caption text-negative" role="alert">{erro}</span>}
      {resultadoTeste && <span className="text-caption text-ink" role="status">{resultadoTeste}</span>}

      {verPrevia && (
        <div className="flex flex-col gap-2 border-t border-border-soft pt-3" data-previa={cfg.tipo}>
          {!ctx ? (
            ctxErro ? <span className="text-caption text-ink">Os dados da empresa não carregaram: {ctxErro.message}</span> : <Skeleton className="h-24 w-full" />
          ) : !p ? null : ehSemEnvio(p) ? (
            <span className="text-caption text-muted">Hoje não sairia nada: {p.motivo}</span>
          ) : (
            <>
              <span className="a4p-label text-faint">Prévia com os dados desta empresa</span>
              <span className="text-label font-medium text-ink">{p.assunto}</span>
              <pre className="m-0 whitespace-pre-wrap text-caption text-ink font-[inherit] tabular-nums">{p.texto}</pre>
              <iframe title={`Prévia do e-mail: ${desc.nome}`} srcDoc={p.html} sandbox=""
                className="w-full h-[520px] border border-border rounded-md bg-white" />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Parametros({ cfg, setP, ctx }: {
  cfg: ConfigAutomacao; setP: (p: Partial<ConfigAutomacao["parametros"]>) => void; ctx?: ContextoAutomacao;
}) {
  const [novaPausa, setNovaPausa] = React.useState<{ alvo: string; ate: string }>({ alvo: "", ate: "" });
  if (cfg.tipo === "alerta_caixa") {
    return (
      <div className="grid sm:grid-cols-2 gap-3">
        <Select label="Avisar quando ficar negativo em até" value={String(cfg.parametros.horizonteDias ?? 15)}
          onChange={(v) => setP({ horizonteDias: Number(v) })}
          options={HORIZONTES_ALERTA.map((n) => ({ value: String(n), label: `${n} dias` }))} />
        <CurrencyInput label="…ou abaixo do saldo mínimo de" value={Number(cfg.parametros.saldoMinimo ?? 0)}
          onValueChange={(v) => setP({ saldoMinimo: v })} />
      </div>
    );
  }
  if (cfg.tipo === "fechamento_pendente") {
    const dias = cfg.parametros.diasUteis ?? [3, 8];
    return (
      <div className="grid sm:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <Input key={i} type="number" min={1} max={22} label={i === 0 ? "Primeiro aviso (dia útil do mês)" : "Segundo aviso (dia útil do mês)"}
            value={String(dias[i] ?? "")}
            onChange={(e) => { const d = [...dias]; d[i] = Number(e.target.value); setP({ diasUteis: d.filter((x) => x >= 1 && x <= 22) }); }} />
        ))}
      </div>
    );
  }
  if (cfg.tipo === "regua_cobranca") {
    const pausas = cfg.parametros.pausas ?? [];
    const clientes = ctx ? filaAutomatica(ctx, { ...cfg.parametros, pausas: [] }).grupos : [];
    return (
      <div className="flex flex-col gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input type="number" step="0.1" min={0} max={2} label="Multa por atraso (%)" value={String(((cfg.parametros.multaPct ?? 0) * 100).toFixed(1))}
            onChange={(e) => setP({ multaPct: Math.min(0.02, Math.max(0, Number(e.target.value) / 100)) })} />
          <Input type="number" step="0.1" min={0} max={1} label="Juros de mora ao mês (%)" value={String(((cfg.parametros.jurosMesPct ?? 0) * 100).toFixed(1))}
            onChange={(e) => setP({ jurosMesPct: Math.min(0.01, Math.max(0, Number(e.target.value) / 100)) })} />
          <Input label="Chave PIX para o copia e cola (opcional)" value={cfg.parametros.chavePix ?? ""}
            onChange={(e) => setP({ chavePix: e.target.value || null })} />
          <Input label="Cidade do recebedor (PIX)" value={cfg.parametros.cidadePix ?? ""}
            onChange={(e) => setP({ cidadePix: e.target.value || null })} />
        </div>
        <p className="m-0 text-caption text-faint">Multa e juros só entram quando preenchidos (teto de 2% de multa e 1% ao mês de juros, o limite do Código de Defesa do Consumidor).</p>
        <div className="flex flex-col gap-2">
          <span className="a4p-label text-faint">Pausas (acordo, contestação)</span>
          {pausas.length === 0 && <span className="text-caption text-muted">Nenhuma pausa.</span>}
          {pausas.map((x: Pausa, i: number) => (
            <div key={`${x.id}-${i}`} className="flex items-center gap-3 text-caption text-ink">
              <span className="flex-1">{x.alvo === "cliente" ? "Cliente" : "Título"} {ctx?.input.partyNames?.[x.id] ?? x.id} · até {x.ate.split("-").reverse().join("/")}</span>
              <Button size="sm" variant="ghost" onClick={() => setP({ pausas: pausas.filter((_, k) => k !== i) })}>Remover</Button>
            </div>
          ))}
          <div className="flex items-end gap-2 flex-wrap">
            <Select label="Pausar cliente" value={novaPausa.alvo} placeholder={clientes.length ? "Escolha um cliente da fila" : "Nenhum cliente na fila hoje"}
              onChange={(v) => setNovaPausa((n) => ({ ...n, alvo: v }))} disabled={!clientes.length}
              options={clientes.filter((g) => g.partyId).map((g) => ({ value: g.partyId!, label: g.cliente }))} />
            <DateField label="Até" value={novaPausa.ate} onChange={(v) => setNovaPausa((n) => ({ ...n, ate: v }))} />
            <Button size="sm" variant="secondary" disabled={!novaPausa.alvo || !novaPausa.ate}
              onClick={() => { setP({ pausas: [...pausas, { alvo: "cliente", id: novaPausa.alvo, ate: novaPausa.ate }] }); setNovaPausa({ alvo: "", ate: "" }); }}>
              Pausar
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
