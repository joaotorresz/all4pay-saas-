"use client";

/**
 * RÉGUA DE COBRANÇA — a fila do dia e a carteira por etapa.
 *
 * A tela não decide nada: o motor (`core/cobranca`) diz em que etapa cada
 * título está e redige a mensagem; a pessoa escolhe enviar, copiar ou marcar
 * como avisado. Enviar pelo WhatsApp usa a MESMA rota de cobrança do resto do
 * produto (a Twilio só entrega; sem configuração, o envio é simulado e a tela
 * diz isso). Todo envio fica registrado por título e etapa, e a mesma etapa não
 * é enviada duas vezes ao mesmo título.
 */
import * as React from "react";
import { Card, BRL, StatusBadge, Skeleton, Button, Icon, InfoHint } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { usePartiesList } from "@/components/lancamentos/hooks";
import { useQuery } from "@tanstack/react-query";
import {
  montarRegua, variaveisDoTemplate, FINALIDADE_DO_TOM, type ItemRegua, type Canal, type EnvioRegistrado,
} from "@/core/cobranca";
import { listarEnvios, marcarEnviado } from "@/lib/regua";
import { credorDe } from "@/lib/automacoes-contexto";
import { fetchCompany, getOrganizationName } from "@/lib/company";
import { useToast } from "@/components/listas/ListChrome";

const CANAL: Record<Canal, string> = { whatsapp: "WhatsApp", email: "E-mail", manual: "Decisão manual" };
const br = (iso: string) => iso.split("-").reverse().join("/");

export function ReguaCobrancaView() {
  const { data: input, isLoading } = useRiscoInput();
  const { data: partes } = usePartiesList();
  const { show, node } = useToast();
  const [versao, setVersao] = React.useState(0);
  const [envios, setEnvios] = React.useState<EnvioRegistrado[]>([]);
  const [erroEnvios, setErroEnvios] = React.useState<string | null>(null);
  React.useEffect(() => {
    let vivo = true;
    // ⚠️ Falha ao ler o registro não pode virar "ninguém foi avisado": a tela
    // mostraria botão de enviar para quem já recebeu a cobrança.
    listarEnvios().then((e) => { if (vivo) { setEnvios(e); setErroEnvios(null); } })
      .catch((e) => { if (vivo) setErroEnvios((e as Error).message || "Não foi possível ler o registro de envios."); });
    return () => { vivo = false; };
  }, [versao]);
  const [enviando, setEnviando] = React.useState<string | null>(null);
  const [verTodos, setVerTodos] = React.useState(false);
  // ⚠️ O CREDOR vai em toda mensagem: razão social e CNPJ de quem cobra.
  const { data: credor } = useQuery({
    queryKey: ["credor-da-regua"],
    queryFn: async () => credorDe(await getOrganizationName(), ((await fetchCompany())?.db ?? null) as Record<string, unknown> | null),
  });

  const painel = React.useMemo(() => (input ? montarRegua(input, envios, undefined, { credor }) : null), [input, envios, credor]);
  const telefone = React.useCallback((partyId: string | null) =>
    (partyId && partes?.find((p) => p.id === partyId)?.phone) || null, [partes]);

  const registrar = async (i: ItemRegua, canal: Canal) => {
    try {
      const ok = await marcarEnviado({ movimentoId: i.movimentoId, etapaId: i.etapa.id, canal });
      setVersao((v) => v + 1);
      return ok;
    } catch (e) {
      show((e as Error).message || "Não foi possível registrar o aviso.");
      return false;
    }
  };

  const enviarWhatsapp = async (i: ItemRegua) => {
    const tel = telefone(i.partyId);
    if (!tel) { show(`${i.cliente} não tem telefone no cadastro. Copie a mensagem ou cadastre o telefone.`); return; }
    setEnviando(i.movimentoId);
    try {
      const r = await fetch("/api/cobranca/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alvos: [{
          cliente: i.cliente, telefone: tel, mensagem: i.mensagem,
          // ⚠️ O template do TOM da etapa, e o valor por `formatBRL` — nunca
          // `String(valor)`, que chegava ao cliente como "1234.5".
          finalidade: FINALIDADE_DO_TOM[i.etapa.tom],
          variaveis: variaveisDoTemplate({ cliente: i.cliente, valor: i.valor, vencimento: i.vencimento, dias: i.dias }, credor),
          registro: { clienteChave: i.partyId ?? undefined, titulos: [{ movimentoId: i.movimentoId, etapaId: i.etapa.id }] },
        }] }),
      });
      const j = await r.json().catch(() => null);
      setVersao((v) => v + 1);
      // ⚠️ O REGISTRO é do servidor (grava antes de enviar). Sem credencial a
      // rota SIMULA — e simulado não conta como avisado: é esse registro que se
      // mostra antes de um protesto.
      if (!r.ok) {
        show(j?.motivo ?? "O envio foi recusado.");
      } else if (j?.provedores?.whatsapp === false) {
        show("O WhatsApp não está configurado neste ambiente: nada foi enviado ao cliente. Copie a mensagem e envie por fora.");
      } else if (j?.jaCobradosHoje) {
        show(`${i.cliente} já recebeu uma cobrança hoje (por esta ou outra porta). Nada foi enviado de novo.`);
      } else if (j?.sucesso) {
        show(`Mensagem enviada para ${i.cliente}.`);
      } else {
        show(`O envio não foi aceito pelo provedor: ${j?.enviados?.[0]?.resultado?.detalhe ?? "sem detalhe"}.`);
      }
    } catch {
      show("Falha de rede ao enviar. Nada foi registrado.");
    } finally {
      setEnviando(null);
    }
  };

  const copiar = async (i: ItemRegua) => {
    try { await navigator.clipboard.writeText(i.mensagem); show("Mensagem copiada."); } catch { show("Não foi possível copiar."); }
  };

  if (isLoading || !painel) return <Card><Skeleton className="h-40 w-full" /></Card>;

  const lista = verTodos ? painel.itens : painel.filaDeHoje;

  return (
    <div className="flex flex-col gap-5 pb-4">
      {erroEnvios && (
        <Card className="text-caption text-ink">
          O registro de envios não carregou ({erroEnvios}). Até ele voltar, confira no histórico antes de reenviar: a tela não tem como saber quem já foi avisado.
        </Card>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {painel.porEtapa.map(({ etapa, quantidade, valor }) => (
          <Card key={etapa.id} className="flex flex-col gap-1">
            <span className="a4p-label text-faint">{etapa.dia === 0 ? "No dia" : etapa.dia < 0 ? `${-etapa.dia} dias antes` : `${etapa.dia} dias depois`}</span>
            <span className="text-caption text-muted truncate" title={etapa.nome}>{etapa.nome}</span>
            <span className="text-[18px] font-medium text-ink tabular-nums"><BRL value={valor} /></span>
            <span className="text-caption text-faint">{quantidade} {quantidade === 1 ? "título" : "títulos"} · {CANAL[etapa.canal]}</span>
          </Card>
        ))}
      </div>

      <Card padded={false}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-soft flex-wrap">
          <span className="flex-1 text-label font-medium text-ink inline-flex items-center gap-1">
            {verTodos ? "Toda a carteira na régua" : `Para avisar hoje · ${painel.filaDeHoje.length}`}
            <InfoHint align="left" titulo="Régua de cobrança" oQue="A sequência de contatos com o cliente, do lembrete antes do vencimento ao aviso formal." comoCalcula="Cada título a receber em aberto está na última etapa cujo dia já chegou, contado do vencimento. A fila de hoje traz os que chegam à etapa hoje e ainda não foram avisados, mais os que pedem decisão manual. Transferências entre contas próprias ficam de fora." />
          </span>
          <Button size="sm" variant="ghost" onClick={() => setVerTodos((v) => !v)}>{verTodos ? "Ver só a fila de hoje" : "Ver toda a carteira"}</Button>
        </div>
        {lista.length === 0 ? (
          <div className="px-5 py-6 text-caption text-muted">
            {verTodos ? "Nenhum título a receber em aberto está na régua." : "Ninguém para avisar hoje. Os próximos contatos aparecem aqui no dia em que chegarem à etapa."}
          </div>
        ) : lista.map((i, k) => (
          <div key={`${i.movimentoId}-${i.etapa.id}`} className={`flex flex-col gap-2 px-5 py-3 ${k ? "border-t border-border-soft" : ""}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-ink truncate">{i.cliente}</span>
                <span className="block text-caption text-faint">
                  vence {br(i.vencimento)} · {i.dias < 0 ? `em ${-i.dias} dias` : i.dias === 0 ? "hoje" : `${i.dias} dias de atraso`}
                  {i.proxima ? ` · próxima etapa em ${br(i.proxima.em)}` : ""}
                </span>
              </span>
              <span className="tabular-nums text-ink"><BRL value={i.valor} /></span>
              <StatusBadge tone={i.etapa.dia >= 30 ? "warning" : "neutral"}>{i.etapa.nome}</StatusBadge>
              {i.jaEnviado && <StatusBadge tone="positive">Avisado</StatusBadge>}
            </div>
            <p className="m-0 text-caption text-muted max-w-[90ch]">{i.mensagem}</p>
            {!i.jaEnviado && (
              <div className="flex items-center gap-2 flex-wrap">
                {i.etapa.canal === "whatsapp" && (
                  <Button size="sm" variant="secondary" onClick={() => enviarWhatsapp(i)} disabled={enviando === i.movimentoId}
                    leftIcon={<Icon name="smartphone" size={14} color="currentColor" />}>
                    {enviando === i.movimentoId ? "Enviando…" : "Enviar por WhatsApp"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => copiar(i)} leftIcon={<Icon name="file-text" size={14} color="currentColor" />}>Copiar mensagem</Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (await registrar(i, i.etapa.canal)) show(`${i.cliente} marcado como avisado nesta etapa.`); }}
                  leftIcon={<Icon name="check" size={14} color="currentColor" />}>
                  {i.etapa.canal === "manual" ? "Registrar decisão" : "Marcar como avisado"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
      {node}
    </div>
  );
}
