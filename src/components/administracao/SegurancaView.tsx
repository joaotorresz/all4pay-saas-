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
import { Card, Button, Icon, StatusBadge, Badge, Textarea } from "@/components/ui";
import {
  rodarIsolamentoCompleto, auditoriaRLS, listarRevisaoAdmin, listarAcessosAdmin,
  revisarAdmin, adminPosso, semServidor, type AcessoAdmin,
} from "@/lib/seguranca";
import {
  resumoPorVerbo, porTabela, nomeDoVerbo, VERBOS,
  achadosDaAuditoria, pendenciasDeAdmin, nomeDoPapel,
  type Achado, type Gravidade, type TentativaIsolamento, type AdminRevisao,
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

  const isolamento = useQuery({
    queryKey: ["seguranca", "isolamento"],
    // Abrir a tela só LÊ; quem grava na trilha é o botão — ver a nota em
    // `rodarTesteIsolamento`.
    queryFn: () => rodarIsolamentoCompleto(false),
  });
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
  const resumo = resumoPorVerbo(linhas);
  const tabelas = porTabela(linhas);
  const achados = achadosDaAuditoria(auditoria.data ?? []);
  const pendencias = revisao.data?.lista ? pendenciasDeAdmin(revisao.data.lista, hojeISO()) : [];

  /**
   * ⚠️ O botão chama a versão que REGISTRA. "Bloqueada e registrada" só se
   * sustenta se houver algo legível depois — e a política de linha, sozinha,
   * não deixa rastro: uma linha filtrada é indistinguível de uma linha que não
   * existe. O que fica na trilha, então, é a verificação: quem conferiu, quando,
   * quantas tabelas e com que resultado.
   */
  async function retestar() {
    setTestando(true); setMsg(null);
    try {
      const [linhasNovas] = await Promise.all([rodarIsolamentoCompleto(true), auditoria.refetch()]);
      await isolamento.refetch();
      const r = resumoPorVerbo(linhasNovas ?? []);
      setMsg(
        linhasNovas === null
          ? "Não foi possível executar o teste."
          : `${r.tentativas} tentativas em ${r.tabelas} tabelas · ${r.vazamentos.length} vazamento(s) · registrado na trilha.`,
      );
    } finally { setTestando(false); }
  }

  return (
    <div className="flex flex-col gap-5 pb-6 max-w-[980px]">
      {/* ------------------------- teste de isolamento ------------------------ */}
      <Card className="flex flex-col gap-4"
        info={{
          titulo: "Teste de isolamento",
          oQue: "Tenta, agora, ler, contar, gravar, alterar e apagar dado de outra empresa.",
          comoCalcula:
            "Para cada tabela com coluna de empresa o banco faz cinco tentativas reais — cada uma numa subtransação que é desfeita, então nada fica gravado. A resposta correta é 'negado' em todas. Roda com as suas credenciais e contra as políticas de verdade: uma função com privilégio de dono enxergaria tudo e responderia sempre que está tudo bem.",
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
              {resumo.ok
                ? `Aprovado — ${resumo.tentativas} tentativas negadas`
                : `${resumo.vazamentos.length} tentativa(s) passaram`}
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
              <Numero rotulo="Tentativas" valor={resumo.tentativas}
                nota="cinco verbos por tabela, todas desfeitas" />
              <Numero rotulo="Passaram" valor={resumo.vazamentos.length}
                nota={resumo.ok ? "como tem de ser" : "cada uma é um incidente"}
                cor={resumo.ok ? "var(--color-positive)" : "var(--color-negative)"} />
              <Numero rotulo="Não tentadas" valor={resumo.naoTentadas}
                nota="sem privilégio ou sem linha de molde" />
            </div>

            {/* ⚠️ O vazamento aparece com TABELA e VERBO. "Vazou" sozinho não
                dá para consertar: ler aberto e escrever fechado são defeitos
                diferentes, em lugares diferentes do arquivo de políticas. */}
            {resumo.vazamentos.length > 0 && (
              <div className="flex flex-col gap-2 px-3 py-3 rounded-md" style={{ background: "var(--color-surface-2)" }}>
                <span className="text-label font-medium" style={{ color: "var(--color-negative)" }}>
                  Tentativas que o banco deixou passar
                </span>
                {resumo.vazamentos.map((v, i) => (
                  <div key={`${v.tabela}-${v.verbo}-${i}`} className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] tabular-nums" style={{ color: "var(--color-negative)" }}>
                      {nomeDoVerbo(v.verbo)}
                    </span>
                    <span className="text-[15px] text-ink">{v.tabela}</span>
                    <span className="text-caption text-faint">— {v.detalhe}</span>
                  </div>
                ))}
              </div>
            )}

            <MatrizIsolamento tabelas={tabelas} />
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
              className="text-[11px] tracking-[0.08em] px-2 py-[3px] rounded-pill"
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
              <LinhaRevisao key={a.userId} a={a} primeira={i === 0}
                podeAdministrar={pode("administrar")}
                aoRevisar={() => revisao.refetch()} />
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

/**
 * Uma linha da revisão de acesso administrativo.
 *
 * ⚠️ O botão de um clique ("Revisar por 6 meses") virou um campo de MOTIVO, e a
 * mudança é o ponto: um clique registrava que alguém tinha clicado, não o que
 * foi decidido. Numa auditoria a pergunta nunca é "foi revisado?", é "com base
 * em quê?" — e `revisado_em` sozinho não responde.
 *
 * ⚠️ O mínimo de 20 caracteres é cobrado pelo BANCO. Aqui ele só desabilita o
 * botão e explica antes do clique; validar apenas no cliente seria a mesma
 * decoração de antes, porque a RPC pode ser chamada direto.
 */
function LinhaRevisao({
  a, primeira, podeAdministrar, aoRevisar,
}: {
  a: AdminRevisao;
  primeira: boolean;
  podeAdministrar: boolean;
  aoRevisar: () => void | Promise<unknown>;
}) {
  const [motivo, setMotivo] = React.useState("");
  const [abrindo, setAbrindo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const curto = motivo.trim().length < 20;

  async function confirmar() {
    setSalvando(true); setErro(null);
    try {
      await revisarAdmin(a.userId, motivo.trim(), 6);
      setMotivo(""); setAbrindo(false);
      await aoRevisar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a revisão.");
    } finally { setSalvando(false); }
  }

  return (
    <div className={`flex flex-col gap-2 px-5 py-3 ${primeira ? "" : "border-t border-border-soft"}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <Icon name={a.pendente ? "triangle-alert" : "shield-check"} size={15}
          color={a.pendente ? "var(--color-warning)" : "var(--color-positive)"} />
        <div className="flex-1 min-w-0">
          <span className="block truncate text-[15px] text-ink">{a.email ?? a.userId}</span>
          <span className="block text-caption text-faint">
            {a.motivo ?? "sem motivo registrado"} ·{" "}
            {a.fatoresMfa > 0 ? "com segundo fator" : `sem segundo fator (prazo ${a.mfaPrazo ?? "—"})`} ·{" "}
            {a.revisadoEm
              ? `revisado em ${a.revisadoEm.slice(0, 10)}${a.revisadoPorEmail ? ` por ${a.revisadoPorEmail}` : ""}`
              : "nunca revisado"}
            {a.autoRevisao ? " (por si mesmo)" : ""} ·{" "}
            {a.proximaRevisao ? `próxima em ${a.proximaRevisao}` : "sem próxima revisão agendada"} ·{" "}
            {a.acessos30d} acessos em 30 dias
            {a.negados30d > 0 ? ` (${a.negados30d} negados)` : ""}
          </span>
        </div>
        {podeAdministrar && !abrindo && (
          <Button variant="ghost" onClick={() => setAbrindo(true)}>Revisar</Button>
        )}
      </div>

      {abrindo && (
        <div className="flex flex-col gap-2 pl-[26px]">
          <Textarea
            label="Por que este acesso continua?"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Ex.: responde pelo suporte de plataforma e é o contato de incidente; acesso conferido com o titular."
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={confirmar} disabled={curto || salvando}>
              {salvando ? "Registrando…" : "Registrar revisão por 6 meses"}
            </Button>
            <Button variant="ghost" onClick={() => { setAbrindo(false); setErro(null); }}>
              Cancelar
            </Button>
            <span className="text-caption text-faint">
              {curto
                ? `Faltam ${20 - motivo.trim().length} caracteres — o servidor recusa abaixo de 20.`
                : "A decisão fica na trilha, com o seu nome e a data da próxima revisão."}
            </span>
          </div>
          {erro && (
            <span className="text-caption" style={{ color: "var(--color-negative)" }}>{erro}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O resultado POR TABELA E POR VERBO.
 *
 * ⚠️ Ele fica recolhido por padrão e isso é decisão: são ~45 tabelas × 5
 * verbos, e uma parede de 225 linhas verdes esconde a única vermelha. O que
 * decide é o placar acima; esta matriz é para quem precisa CONFERIR, e quem
 * confere está disposto a abrir.
 *
 * ⚠️ "Sem privilégio" e "sem molde" não são falhas e não são pintados como
 * tal: o primeiro é a tabela fechada por CONCESSÃO (mais duro que por
 * política) e o segundo é a sua empresa não ter linha ali para servir de
 * modelo. Pintá-los de vermelho treinaria quem lê a ignorar o vermelho.
 */
function MatrizIsolamento({
  tabelas,
}: {
  tabelas: { tabela: string; tentativas: TentativaIsolamento[]; vazou: boolean }[];
}) {
  const [aberto, setAberto] = React.useState(false);
  if (tabelas.length === 0) return null;

  const cor = (t: TentativaIsolamento) =>
    t.vazou ? "var(--color-negative)"
      : t.resultado === "negado" ? "var(--color-positive)"
      : "var(--color-text-secondary)";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="self-start text-caption text-muted hover:text-ink inline-flex items-center gap-1"
        aria-expanded={aberto}
      >
        <Icon name={aberto ? "chevron-down" : "chevron-right"} size={14} />
        {aberto ? "Ocultar o resultado por tabela" : `Ver o resultado das ${tabelas.length} tabelas, verbo a verbo`}
      </button>

      {aberto && (
        <div
          className="overflow-x-auto rounded-md"
          style={{ background: "var(--color-surface-2)" }}
          tabIndex={0}
          role="region"
          aria-label="Resultado do teste de isolamento por tabela e verbo"
        >
          <table className="w-full text-caption" style={{ borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                  Tabela
                </th>
                {VERBOS.map((v) => (
                  <th key={v.id} title={v.oQue}
                    className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    {v.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabelas.map((t) => (
                <tr key={t.tabela} style={{ borderTop: "1px solid var(--color-border-soft)" }}>
                  <td className="px-3 py-[6px] text-ink whitespace-nowrap">{t.tabela}</td>
                  {VERBOS.map((v) => {
                    const tent = t.tentativas.find((x) => x.verbo === v.id);
                    return (
                      <td key={v.id} className="px-3 py-[6px] whitespace-nowrap"
                        style={{ color: tent ? cor(tent) : "var(--color-text-quaternary)" }}
                        title={tent?.detalhe}>
                        {tent ? tent.resultado : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListaAchados({ achados }: { achados: Achado[] }) {
  return (
    <div className="flex flex-col gap-2">
      {achados.map((a, i) => (
        <div key={`${a.tabela}-${i}`} className="flex items-start gap-3">
          <span className="text-[11px] tracking-[0.08em] shrink-0 mt-[3px] w-[54px]" style={{ color: COR[a.gravidade] }}>
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
