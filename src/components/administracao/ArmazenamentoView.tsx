"use client";

/**
 * ARMAZENAMENTO — onde os seus dados estão, e o que ainda não saiu do navegador.
 *
 * ⚠️ Esta tela existe para tornar VISÍVEL uma limitação que era invisível. O
 * sistema guardava entidades de negócio inteiras no `localStorage`, e nada na
 * interface dizia isso: quem trocasse de máquina descobria a perda depois de
 * já ter perdido, e quem convidasse um sócio descobria que os dois viam
 * estados diferentes sem entender por quê.
 *
 * Enquanto a migração não termina, o certo é o usuário poder ver o que ainda
 * está só no dispositivo — e não descobrir do jeito difícil.
 */
import * as React from "react";
import { Card, Button, Icon, StatusBadge, InfoHint } from "@/components/ui";
import {
  estadoSincronizacao, hidratar, migrarParaServidor,
  CHAVES_DE_NEGOCIO, PREFERENCIAS_LOCAIS, type EstadoSincronizacao,
} from "@/lib/store-org";
import { isDemo } from "@/lib/demo";

const kb = (b: number) => `${Math.round((b / 1024) * 10) / 10} KB`;

export function ArmazenamentoView() {
  const [est, setEst] = React.useState<EstadoSincronizacao | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  // ⚠️ Gate de montagem: `localStorage` lido durante o render quebra a
  // hidratação (foi o que já mordeu o painel de integrações).
  React.useEffect(() => { setEst(estadoSincronizacao()); }, []);

  const sincronizar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const m = await migrarParaServidor(CHAVES_DE_NEGOCIO);
      const h = await hidratar(CHAVES_DE_NEGOCIO);
      setMsg(`${m.enviadas} enviadas ao servidor · ${h} atualizadas a partir dele.`);
      setEst(estadoSincronizacao());
    } finally {
      setOcupado(false);
    }
  };

  if (!est) return null;

  const alerta = est.pctTeto >= 60;

  return (
    <div className="flex flex-col gap-5 pb-6 max-w-[860px]">
      <Card className="flex flex-col gap-4"
        info={{
          titulo: "Armazenamento",
          oQue: "Onde os dados da sua empresa estão guardados e o que ainda depende deste navegador.",
          comoCalcula:
            "O que está no servidor sobrevive a troca de máquina, aparece para todos os usuários da empresa e entra em backup. O que está só no navegador se perde ao limpar o cache e não é visto por mais ninguém.",
        }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-h3 text-ink">Onde os seus dados estão</span>
          <StatusBadge tone={est.ativo ? "positive" : "neutral"}>
            {est.ativo ? "Sincronizando com o servidor" : isDemo ? "Demonstração — só neste navegador" : "Sem servidor configurado"}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
          <div className="flex flex-col">
            <span className="text-caption text-faint">No servidor</span>
            <span className="text-[22px] font-semibold tabular-nums text-ink">{est.sincronizadas.length}</span>
            <span className="text-caption text-faint">sobrevivem a troca de máquina</span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-faint inline-flex items-center gap-1">
              Só neste navegador
              <InfoHint
                align="left" titulo="Só neste navegador"
                oQue="Entidades de negócio que ainda não subiram. Se você limpar o cache ou trocar de máquina, elas se perdem — e outro usuário da empresa não as enxerga."
              />
            </span>
            <span
              className="text-[22px] font-semibold tabular-nums"
              style={{ color: est.negocioLocal.length > 0 ? "var(--color-warning)" : "var(--color-positive)" }}
            >
              {est.negocioLocal.length}
            </span>
            <span className="text-caption text-faint">{kb(est.negocioLocal.reduce((s, k) => s + k.bytes, 0))}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-faint">Espaço local usado</span>
            <span
              className="text-[22px] font-semibold tabular-nums"
              style={{ color: alerta ? "var(--color-negative)" : "var(--color-ink)" }}
            >
              {est.pctTeto}%
            </span>
            <span className="text-caption text-faint">{kb(est.bytesLocais)} de ~5 MB</span>
          </div>
        </div>

        {alerta && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md" style={{ background: "var(--color-lime-tint)" }}>
            <Icon name="triangle-alert" size={15} color="var(--color-negative)" />
            <span className="text-caption text-ink max-w-[62ch]">
              O armazenamento do navegador está perto do limite. Quando ele enche, gravações
              começam a falhar — e sem sincronização com o servidor isso significa perder o
              que foi digitado depois.
            </span>
          </div>
        )}

        {est.pendentes.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-label font-medium" style={{ color: "var(--color-warning)" }}>
              {est.pendentes.length} alterações não confirmadas pelo servidor
            </span>
            <span className="text-caption text-faint">{est.pendentes.join(", ")}</span>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={sincronizar} disabled={ocupado || !est.ativo} leftIcon={<Icon name="repeat" size={15} />}>
            {ocupado ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
          {msg && <span className="text-caption text-muted">{msg}</span>}
          {!est.ativo && (
            <span className="text-caption text-faint">
              {isDemo ? "Em demonstração não há servidor — nada sai deste navegador, por definição." : "Configure o Supabase para sincronizar."}
            </span>
          )}
        </div>
      </Card>

      {est.negocioLocal.length > 0 && (
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-border-soft">
            <span className="text-label font-medium text-muted">Ainda só neste navegador</span>
            <p className="m-0 mt-1 text-caption text-faint max-w-[70ch]">
              Estes dados são de negócio e ainda não subiram. A migração para o servidor
              acontece por etapas; até lá, evite limpar os dados do navegador nesta máquina.
            </p>
          </div>
          {est.negocioLocal.map((k, i) => (
            <div key={k.chave} className={`flex items-center gap-3 px-5 py-2 ${i ? "border-t border-border-soft" : ""}`}>
              <Icon name="triangle-alert" size={14} color="var(--color-warning)" />
              <span className="flex-1 min-w-0 truncate text-[15px] text-ink">{rotulo(k.chave)}</span>
              <span className="text-caption text-faint tabular-nums shrink-0">{kb(k.bytes)}</span>
            </div>
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Preferências deste dispositivo</span>
        <p className="m-0 text-caption text-faint max-w-[70ch]">
          Tema, largura do menu, widgets da Home e progresso dos tours continuam no
          navegador de propósito: são ajustes de exibição, não dados. Perdê-los ao trocar
          de máquina custa um reajuste de tela, não trabalho.
          <span className="text-placeholder"> ({PREFERENCIAS_LOCAIS.length} chaves)</span>
        </p>
      </Card>

      {est.naoClassificadas.length > 0 && (
        <Card className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">Ainda sem classificação</span>
          <p className="m-0 text-caption text-faint max-w-[70ch]">
            Chaves que não estão nem na lista de dados de negócio nem na de preferências.
            Aparecem aqui para que a decisão seja tomada, e não esquecida.
          </p>
          <span className="text-caption text-placeholder break-words">
            {est.naoClassificadas.map((k) => k.chave).join(", ")}
          </span>
        </Card>
      )}
    </div>
  );
}

const ROTULOS: Record<string, string> = {
  a4p_orcamentos: "Orçamentos",
  a4p_aprovacoes: "Solicitações e aprovações",
  a4p_reembolsos: "Reembolsos",
  a4p_comprovantes: "Comprovantes de pagamento",
  a4p_close_tasks: "Tarefas de fechamento mensal",
  a4p_pos_taxas: "Taxas do POS",
  a4p_company: "Dados da empresa",
  a4p_plano_contas: "Plano de contas",
  a4p_contas_bancarias: "Contas bancárias (campos extras)",
  a4p_centros_custo: "Centros de custo",
  a4p_projetos: "Projetos",
  a4p_contratos: "Contratos",
  a4p_recorrencias: "Recorrências e assinaturas",
  a4p_regras_categorizacao: "Regras de categorização",
  a4p_regras_conciliacao: "Regras de conciliação",
  a4p_fechamentos: "Fechamentos assinados",
  a4p_dashboards_custom: "Dashboards personalizados",
  a4p_movimento_projeto: "Vínculo lançamento → projeto",
  a4p_compras: "Compras e pedidos",
  a4p_transferencias: "Transferências entre contas",
  a4p_vendas_docs: "Vendas",
  a4p_nfse: "Notas fiscais de serviço",
  a4p_nfs_recebidas: "NFs recebidas",
  a4p_boletos_recebidos: "Boletos recebidos (DDA)",
  a4p_links_pagamento: "Links de pagamento",
  a4p_impostos_config: "Configuração de impostos",
  a4p_revrec: "Reconhecimento de receita",
  a4p_cronogramas: "Cronogramas",
  a4p_ledger: "Razão contábil",
  a4p_locked_periods: "Períodos travados",
  a4p_plano_usos: "Usos padrão do plano de contas",
  a4p_party_extra: "Campos extras de contatos",
  a4p_produto_extra: "Campos extras de produtos",
  a4p_tags: "Tags",
  a4p_assinatura: "Assinatura do sistema",
  a4p_integracoes: "Integrações",
  a4p_contador_destinatarios: "Destinatários do contador",
  a4p_contador_execucoes: "Envios ao contador",
  a4p_exportacoes: "Relatórios exportados",
  a4p_chamados: "Chamados de suporte",
  a4p_logs_admin: "Logs administrativos",
  a4p_regras_uso: "Uso das regras de categorização",
  a4p_fdip_memory: "Aprendizado da importação",
  a4p_ia_memory: "Memória do assistente",
  a4p_ia_conversas: "Conversas com a IA",
  a4p_ajuda_conversa: "Conversa da Central de Ajuda",
  a4p_ai_actions: "Ações registradas da IA",
  a4p_orcamento: "Simulador de orçamento",
};
const rotulo = (c: string) => ROTULOS[c] ?? c;
