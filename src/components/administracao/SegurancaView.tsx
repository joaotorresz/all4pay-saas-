"use client";

/**
 * SEGURANÇA — o isolamento provado, não prometido.
 *
 * ⚠️ Esta tela existe porque "os dados de cada empresa estão isolados" é uma
 * afirmação que ninguém consegue conferir olhando a interface — e é a única
 * afirmação do produto cujo erro não se conserta depois. Aqui ela vira um
 * BOTÃO: o teste pede, ao próprio banco e com as credenciais de quem está
 * logado, as linhas de outra empresa. A resposta correta é zero, e a tela mostra
 * quantas tabelas foram conferidas para que "zero" não seja confundido com
 * "não perguntei".
 *
 * O teste roda com `SECURITY INVOKER` de propósito: uma função que rodasse com
 * privilégio de dono enxergaria tudo e responderia sempre que está tudo bem —
 * testaria a si mesma.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, Icon, StatusBadge, Badge } from "@/components/ui";
import {
  rodarTesteIsolamento, auditoriaRLS, listarRevisaoAdmin, listarAcessosAdmin,
  revisarAdmin, adminPosso, semServidor, type AcessoAdmin,
} from "@/lib/seguranca";
import {
  resumoIsolamento, achadosDaAuditoria, pendenciasDeAdmin, nomeDoPapel,
  type Achado, type Gravidade,
} from "@/core/seguranca";
import { usePermissoes } from "@/components/app/usePermissoes";

const hojeISO = () => new Date().toISOString().slice(0, 10);

const COR: Record<Gravidade, string> = {
  critico: "var(--color-negative)",
  alto: "var(--color-warning)",
  medio: "var(--color-text-secondary)",
};
const ROTULO: Record<Gravidade, string> = { critico: "Crítico", alto: "Alto", medio: "Médio" };

export function SegurancaView() {
  const { papel, pode } = usePermissoes();
  const [testando, setTestando] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const isolamento = useQuery({ queryKey: ["seguranca", "isolamento"], queryFn: rodarTesteIsolamento });
  const auditoria = useQuery({ queryKey: ["seguranca", "rls"], queryFn: auditoriaRLS });
  const revisao = useQuery({
    queryKey: ["seguranca", "revisao"],
    // ⚠️ A revisão é da PLATAFORMA e o servidor recusa quem não é administrador
    // dela. Pergunta-se antes (e o pedido fica registrado) para a tela mostrar o
    // motivo em vez de uma lista vazia que parece "não há ninguém".
    queryFn: async () => {
      const v = await adminPosso("tela_seguranca");
      return v.permitido ? { lista: await listarRevisaoAdmin(), veredito: v } : { lista: null, veredito: v };
    },
  });
  const acessos = useQuery<AcessoAdmin[] | null>({
    queryKey: ["seguranca", "acessos"],
    queryFn: () => listarAcessosAdmin(30),
    enabled: !!revisao.data?.veredito.permitido,
  });

  const linhas = isolamento.data ?? [];
  const resumo = resumoIsolamento(linhas);
  const achados = achadosDaAuditoria(auditoria.data ?? []);
  const pendencias = revisao.data?.lista ? pendenciasDeAdmin(revisao.data.lista, hojeISO()) : [];

  async function retestar() {
    setTestando(true); setMsg(null);
    try {
      await Promise.all([isolamento.refetch(), auditoria.refetch()]);
      setMsg("Teste executado agora, contra o banco de produção.");
    } finally { setTestando(false); }
  }

  return (
    <div className="flex flex-col gap-5 pb-6 max-w-[980px]">
      {/* ------------------------- teste de isolamento ------------------------ */}
      <Card className="flex flex-col gap-4"
        info={{
          titulo: "Teste de isolamento",
          oQue: "Tenta ler, agora, linhas que pertencem a outra empresa.",
          comoCalcula:
            "Para cada tabela com coluna de empresa, o banco conta quantas linhas visíveis para você NÃO são da empresa aberta. A resposta correta é zero em todas. O teste roda com as suas credenciais e contra as políticas de verdade — não é uma simulação.",
        }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-h3 text-ink">Isolamento entre empresas</span>
          {isolamento.isLoading ? (
            <StatusBadge tone="neutral">Testando…</StatusBadge>
          ) : isolamento.data === null ? (
            <StatusBadge tone="warning">
              {semServidor() ? "Demonstração — sem servidor para testar" : "Não foi possível testar"}
            </StatusBadge>
          ) : (
            <StatusBadge tone={resumo.ok ? "positive" : "warning"}>
              {resumo.ok ? "Nenhum vazamento" : `${resumo.vazamentos} linhas de outra empresa`}
            </StatusBadge>
          )}
        </div>

        {isolamento.data === null ? (
          <p className="m-0 text-caption text-faint max-w-[72ch]">
            {semServidor()
              ? "Em demonstração os dados vivem neste navegador e não há banco para consultar. Um teste que respondesse “tudo certo” aqui produziria a confiança sem o fato — por isso ele não responde."
              : "O servidor não respondeu ao teste. Enquanto isso não for resolvido, o isolamento não está confirmado — e não confirmado é diferente de aprovado."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <Numero rotulo="Tabelas conferidas" valor={resumo.tabelas}
                nota="toda tabela com coluna de empresa" />
              <Numero rotulo="Linhas de outra empresa" valor={resumo.vazamentos}
                nota={resumo.ok ? "como tem de ser" : "cada uma é um incidente"}
                cor={resumo.ok ? "var(--color-positive)" : "var(--color-negative)"} />
              <Numero rotulo="Linhas visíveis" valor={resumo.linhasVisiveis}
                nota="tudo que você enxerga é da sua empresa" />
            </div>
            {!resumo.ok && resumo.tabelasVazando.length > 0 && (
              <div className="flex flex-col gap-1 px-3 py-2 rounded-md" style={{ background: "var(--color-surface-2)" }}>
                <span className="text-label font-medium" style={{ color: "var(--color-negative)" }}>
                  Tabelas com dado de outra empresa visível
                </span>
                <span className="text-caption text-ink break-words">{resumo.tabelasVazando.join(", ")}</span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={retestar} disabled={testando || semServidor()} leftIcon={<Icon name="shield-check" size={15} />}>
            {testando ? "Testando…" : "Testar agora"}
          </Button>
          {msg && <span className="text-caption text-muted">{msg}</span>}
        </div>
      </Card>

      {/* --------------------------- o seu papel ----------------------------- */}
      <Card className="flex flex-col gap-2">
        <span className="text-label font-medium text-muted">O seu papel nesta empresa</span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-h3 text-ink">{papel ? nomeDoPapel(papel) : "—"}</span>
          {(["ler", "exportar", "lancar", "baixar", "aprovar", "fechar", "administrar", "cobranca"] as const).map((a) => (
            <span key={a}
              className="text-[11px] uppercase tracking-[0.08em] px-2 py-[3px] rounded-pill"
              style={{
                background: pode(a) ? "var(--color-lime-tint)" : "var(--color-surface-2)",
                color: pode(a) ? "var(--color-ink)" : "var(--color-placeholder)",
              }}>
              {a}
            </span>
          ))}
        </div>
        <p className="m-0 text-caption text-faint max-w-[72ch]">
          A lista vem do servidor, não desta tela. Esconder um botão evita o clique inútil;
          quem impede a escrita é o banco — as duas coisas precisam concordar, e é por isso
          que a interface pergunta em vez de deduzir.
        </p>
      </Card>

      {/* ---------------------- auditoria da política ------------------------ */}
      <Card className="flex flex-col gap-3"
        info={{
          titulo: "Política de acesso por linha",
          oQue: "O inventário de todas as tabelas do banco e do que protege cada uma.",
          comoCalcula:
            "Lido do catálogo do próprio banco: se a política de linha está ligada, quantas políticas existem, se a tabela tem coluna de empresa, se alguma política a usa, e se a sessão anônima consegue esvaziar a tabela.",
        }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-h3 text-ink">Auditoria da política de acesso</span>
          <StatusBadge tone={achados.length === 0 ? "positive" : "warning"}>
            {auditoria.data === null ? "sem servidor"
              : achados.length === 0 ? `${(auditoria.data ?? []).length} tabelas sem achados`
              : `${achados.length} achados`}
          </StatusBadge>
        </div>
        {achados.length === 0 ? (
          <p className="m-0 text-caption text-faint max-w-[72ch]">
            Toda tabela tem política de linha ligada, nenhuma expõe a sessão anônima e nenhuma
            tabela multiempresa ficou sem política por empresa.
          </p>
        ) : (
          <ListaAchados achados={achados} />
        )}
      </Card>

      {/* --------------------- acesso administrativo ------------------------- */}
      {revisao.data && !revisao.data.veredito.permitido ? (
        <Card className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">Acesso administrativo da plataforma</span>
          <p className="m-0 text-caption text-faint max-w-[72ch]">
            Esta parte é da administração da plataforma. O servidor recusou o acesso
            {revisao.data.veredito.motivo ? ` — ${revisao.data.veredito.motivo}` : ""}, e a
            tentativa ficou registrada.
          </p>
        </Card>
      ) : revisao.data?.lista ? (
        <>
          <Card padded={false}>
            <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="text-label font-medium text-muted">Quem enxerga todas as empresas</span>
                <p className="m-0 mt-1 text-caption text-faint max-w-[72ch]">
                  Acesso administrativo que não vence é acesso que ninguém revisita. Revisar
                  registra a decisão e recoloca uma data.
                </p>
              </div>
              {pendencias.length > 0 && <Badge variant="count">{pendencias.length} pendências</Badge>}
            </div>
            {revisao.data.lista.map((a, i) => (
              <div key={a.userId} className={`flex items-center gap-3 px-5 py-3 flex-wrap ${i ? "border-t border-border-soft" : ""}`}>
                <Icon name={a.pendente ? "triangle-alert" : "shield-check"} size={15}
                  color={a.pendente ? "var(--color-warning)" : "var(--color-positive)"} />
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-[15px] text-ink">{a.email ?? a.userId}</span>
                  <span className="block text-caption text-faint">
                    {a.motivo ?? "sem motivo registrado"} ·{" "}
                    {a.fatoresMfa > 0 ? "com segundo fator" : `sem segundo fator (prazo ${a.mfaPrazo ?? "—"})`} ·{" "}
                    {a.revisadoEm ? `revisado em ${a.revisadoEm.slice(0, 10)}` : "nunca revisado"} ·{" "}
                    {a.acessos30d} acessos em 30 dias
                    {a.negados30d > 0 ? ` (${a.negados30d} negados)` : ""}
                  </span>
                </div>
                {pode("administrar") && (
                  <Button variant="ghost" onClick={async () => {
                    await revisarAdmin(a.userId, 6);
                    await revisao.refetch();
                  }}>
                    Revisar por 6 meses
                  </Button>
                )}
              </div>
            ))}
          </Card>

          {pendencias.length > 0 && (
            <Card className="flex flex-col gap-3">
              <span className="text-label font-medium text-muted">Pendências do acesso administrativo</span>
              <ListaAchados achados={pendencias} />
            </Card>
          )}

          <Card padded={false}>
            <div className="px-5 py-3 border-b border-border-soft">
              <span className="text-label font-medium text-muted">Acessos administrativos (30 dias)</span>
              <p className="m-0 mt-1 text-caption text-faint max-w-[72ch]">
                Cada leitura da área administrativa deixa registro — inclusive a recusada, que é
                a que mais importa. Antes, só a alteração ficava registrada: dava para abrir a
                lista de todos os clientes sem deixar rastro.
              </p>
            </div>
            {(acessos.data ?? []).slice(0, 40).map((a, i) => (
              <div key={`${a.quando}-${i}`} className={`flex items-center gap-3 px-5 py-2 ${i ? "border-t border-border-soft" : ""}`}>
                <Icon name={a.permitido ? "check" : "x"} size={14}
                  color={a.permitido ? "var(--color-positive)" : "var(--color-negative)"} />
                <span className="text-caption text-faint tabular-nums shrink-0 w-[150px]">
                  {a.quando.slice(0, 16).replace("T", " ")}
                </span>
                <span className="flex-1 min-w-0 truncate text-caption text-ink">
                  {a.email ?? "—"} · {a.funcao}{a.alvo ? ` · ${a.alvo}` : ""}
                </span>
                <span className="text-caption text-faint shrink-0">{a.aal ?? "—"}</span>
              </div>
            ))}
            {(acessos.data ?? []).length === 0 && (
              <div className="px-5 py-3 text-caption text-faint">Nenhum acesso nos últimos 30 dias.</div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Numero({ rotulo, valor, nota, cor }: { rotulo: string; valor: number; nota: string; cor?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{rotulo}</span>
      <span className="text-[22px] font-semibold tabular-nums" style={{ color: cor ?? "var(--color-ink)" }}>{valor}</span>
      <span className="text-caption text-faint">{nota}</span>
    </div>
  );
}

function ListaAchados({ achados }: { achados: Achado[] }) {
  return (
    <div className="flex flex-col gap-2">
      {achados.map((a, i) => (
        <div key={`${a.tabela}-${i}`} className="flex items-start gap-3">
          <span className="text-[11px] uppercase tracking-[0.08em] shrink-0 mt-[3px] w-[54px]" style={{ color: COR[a.gravidade] }}>
            {ROTULO[a.gravidade]}
          </span>
          <div className="min-w-0">
            <span className="text-[15px] text-ink">{a.tabela}</span>
            <span className="text-[15px] text-muted"> — {a.problema}</span>
            <p className="m-0 text-caption text-faint max-w-[72ch]">{a.porque}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
