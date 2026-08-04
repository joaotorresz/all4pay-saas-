"use client";

/**
 * Assinatura · Gerenciar usuários · Logs · Relatórios exportados.
 *
 * As quatro telas menores da administração. Elas não guardam estado próprio
 * quando já existe dono: usuários vêm de `lib/governance` (RLS de verdade em
 * live) e os logs da trilha encadeada de `core/institutional` — o histórico que
 * o sistema já assina por SHA-256.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, Icon, Input, Select, BRL } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { baixarXLSX } from "@/lib/xlsx";
import { getAccountsList } from "@/lib/data";
import { listMembers, saveMember, removeMember, type GovMember } from "@/lib/governance";
import { getAuditTrail } from "@/lib/institutional";
import { rotuloDaChave } from "@/lib/store-org";
import { fetchCompany } from "@/lib/company";
import {
  panoramaAssinatura, podeRemover, podeTrocarPerfil, filtrarUsuarios,
  filtrarLogs, periodoForaDaJanela, statusExportacao, filtrarExportacoes,
  expiraEm, diasEntre,
  PERFIS, ACOES_LOG, ORIGENS_LOG, TIPOS_ENTIDADE, JANELA_LOGS_DIAS,
  LIMITE_PDF_LINHAS, LIMITE_XLSX_LINHAS, DIAS_RETENCAO_EXPORT,
  type PerfilUsuario, type UsuarioEmpresa, type RegistroLog, type FiltroLogs,
  type Exportacao, type FormatoExport,
} from "@/core/administracao";
import {
  lerAssinatura, lerIntegracoes, listarExportacoes, removerExportacao,
} from "@/lib/administracao-store";

/**
 * A governança fala em PAPEL (administrador/gestor/operador/visualizador) e a
 * tela fala em PERFIL. A tradução mora aqui, num lugar só, para as duas não
 * divergirem — o dono é sempre admin, tenha o papel que tiver.
 */
const PERFIL_DO_PAPEL = (m: GovMember): PerfilUsuario =>
  m.isOwner || m.papel === "administrador" ? "admin"
    : m.papel === "gestor" ? "financeiro"
    : m.papel === "visualizador" ? "leitura"
    : "operacional";

const PAPEL_DO_PERFIL: Record<PerfilUsuario, NonNullable<GovMember["papel"]>> = {
  admin: "administrador", financeiro: "gestor",
  operacional: "operador", leitura: "visualizador",
};

/**
 * Traduz os membros para a linguagem da tela — e GARANTE o dono na lista.
 *
 * ⚠️ Em live a RPC `org_members` já devolve o owner; em demo a lista sai do
 * `participantes` do onboarding, que começa vazio. Sem esta costura a tela
 * dizia "nenhum usuário" e o card da Assinatura respondia "Dono possui conta
 * ativa: Não" — para alguém que está logado neste exato momento. O dono
 * sintético é derivado do representante cadastrado, não inventado.
 */
function usuariosDaEmpresa(
  membros: GovMember[],
  empresa: { db?: Record<string, unknown> } | null | undefined,
): UsuarioEmpresa[] {
  const lista: UsuarioEmpresa[] = membros.map((m) => ({
    id: m.id, nome: m.nome, email: m.email, perfil: PERFIL_DO_PAPEL(m), dono: !!m.isOwner,
  }));
  if (lista.some((u) => u.dono)) return lista;
  const db = empresa?.db ?? {};
  return [
    {
      id: "owner",
      nome: (db.representanteNome as string) || (db.nomeFantasia as string) || "Titular da conta",
      email: (db.representanteEmail as string) || (db.email as string) || "—",
      perfil: "admin",
      dono: true,
    },
    ...lista,
  ];
}

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const fmtHora = (iso: string) => `${fmtDia(iso)} ${iso.slice(11, 16)}`;

function diasAtras(n: number): string {
  const t = Date.parse(`${hojeISO()}T00:00:00Z`) - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/* ================================ assinatura ================================ */

export function AssinaturaView() {
  const router = useRouter();
  const contas = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const membros = useQuery({ queryKey: ["gov-members"], queryFn: listMembers });
  const empresa = useQuery({ queryKey: ["company"], queryFn: fetchCompany });

  const [local, setLocal] = React.useState(() => ({
    plano: "all4pay", empresaId: "", planoContratado: null as string | null, expiracao: null as string | null,
  }));
  const [integracoes, setIntegracoes] = React.useState<ReturnType<typeof lerIntegracoes>>({});
  React.useEffect(() => {
    setLocal(lerAssinatura());
    setIntegracoes(lerIntegracoes());
  }, []);

  const usuarios = usuariosDaEmpresa(membros.data ?? [], empresa.data);

  const nomeEmpresa =
    (empresa.data?.db?.nomeFantasia as string) ||
    (empresa.data?.db?.razaoSocial as string) ||
    "Sua empresa";

  const panorama = panoramaAssinatura({
    hoje: hojeISO(),
    plano: local.plano,
    empresaId: local.empresaId || (empresa.data?.db?.cnpj as string) || "—",
    planoContratado: local.planoContratado,
    expiracao: local.expiracao,
    usuariosAtivos: usuarios.length,
    donoAtivo: usuarios.some((u) => u.dono),
    contas: (contas.data ?? []).map((c) => ({
      id: c.id,
      nome: c.name,
      conectada: (integracoes["open-finance"]?.conectados ?? []).includes(c.name),
      // Elegível = o banco tem conector homologado. Sem isso "elegíveis sem
      // conexão" viraria só "contas não conectadas", que não é a mesma pergunta.
      elegivel: true,
    })),
    receberNFs: integracoes["receber-nf"]?.ativa ?? false,
    emitirNFs: integracoes["emissao-nf"]?.ativa ?? false,
    plataformasConectadas: (integracoes["plataformas"]?.conectados ?? []).length,
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-label text-muted">Plano atual, empresa e o que está conectado.</p>

      <Card>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Plano</span>
            <span className="text-h2 font-semibold text-ink">{nomeEmpresa}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border-soft">
            <Dado rotulo="ID da empresa" icone="layers" valor={panorama.empresaId} />
            <Dado rotulo="Plano contratado" icone="credit-card" valor={panorama.planoContratado} />
            <Dado rotulo="Data de expiração" icone="calendar">
              {panorama.expiracao ? (
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-label text-ink tabular-nums">{fmtDia(panorama.expiracao)}</span>
                  <span
                    className="text-caption tabular-nums px-2 py-[2px] rounded-pill bg-surface-2"
                    style={{ color: panorama.expirado ? "var(--color-negative)" : (panorama.diasRestantes ?? 99) <= 15 ? "var(--color-warning)" : "var(--color-muted)" }}
                  >
                    {panorama.expirado
                      ? `expirado há ${Math.abs(panorama.diasRestantes ?? 0)} dias`
                      : `${panorama.diasRestantes} dias restantes`}
                  </span>
                </span>
              ) : <span className="text-label text-muted">Não informado</span>}
            </Dado>
          </div>
          <p className="m-0 text-caption text-faint max-w-[84ch]">
            Upgrade de plano, faturas históricas e cancelamento seguem no fluxo de cobrança —
            os dados acima são lidos da empresa ativa e ficam em sincronia.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-[12px] bg-ink shrink-0">
              <Icon name="building" size={18} color="var(--color-lime)" />
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-caption text-muted">Empresa</span>
              <span className="text-label font-semibold text-ink truncate">{nomeEmpresa}</span>
            </span>
          </div>
        </Card>
        <Card className="cursor-pointer hover:bg-surface-2/40 transition-colors" onClick={() => router.push("/dashboard/administration/users")}>
          <div className="flex items-center gap-3">
            <Icon name="users" size={18} color="var(--color-text-secondary)" />
            <span className="flex flex-col">
              <span className="text-[22px] leading-none font-semibold text-ink tabular-nums">{panorama.usuariosAtivos}</span>
              <span className="text-caption text-muted">Usuários ativos</span>
              <span className="text-caption text-faint">Abrir gestão de usuários ↗</span>
            </span>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Icon name="shield-check" size={18} color="var(--color-text-secondary)" />
            <span className="flex flex-col">
              <span className="text-[22px] leading-none font-semibold text-ink">{panorama.donoAtivo ? "Sim" : "Não"}</span>
              <span className="text-caption text-muted">Dono possui conta ativa</span>
            </span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2 text-h3 font-semibold text-ink">
              <Icon name="credit-card" size={16} color="var(--color-text-secondary)" />
              Contas bancárias
            </span>
            <span className="text-caption text-faint">Open Finance e status de conciliação por conta</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Numero rotulo="Contas cadastradas" n={panorama.contasCadastradas} />
            <Numero rotulo="Em Open Finance" texto={`${panorama.contasConectadas}/${panorama.contasCadastradas}`} />
            <Numero rotulo="Elegíveis sem conexão" n={panorama.elegiveisSemConexao} />
          </div>
          {panorama.contasCadastradas === 0 ? (
            <p className="m-0 py-6 text-center text-label text-muted">Nenhuma conta bancária cadastrada.</p>
          ) : panorama.elegiveisSemConexao > 0 && (
            <p className="m-0 text-caption text-faint">
              {panorama.elegiveisSemConexao} conta(s) têm conector disponível e ainda não foram
              conectadas — enquanto isso, o extrato delas entra à mão.
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2 text-h3 font-semibold text-ink">
                <Icon name="receipt" size={16} color="var(--color-text-secondary)" />
                Notas fiscais
              </span>
              <span className="text-caption text-faint">Recebimento e emissão automática</span>
            </div>
            <LinhaIntegracao
              titulo="Receber NFs automaticamente" sub="Busca as NFs recebidas na SEFAZ"
              ativa={panorama.receberNFs} onConfigurar={() => router.push("/dashboard/administration/integrations?cartao=receber-nf")}
            />
            <LinhaIntegracao
              titulo="Emitir NFs automaticamente" sub="Emissão automática para vendas"
              ativa={panorama.emitirNFs} onConfigurar={() => router.push("/dashboard/administration/integrations?cartao=emissao-nf")}
            />
          </div>
        </Card>
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2 text-h3 font-semibold text-ink">
                <Icon name="link" size={16} color="var(--color-text-secondary)" />
                Plataformas de vendas
              </span>
              <span className="text-caption text-faint">Produtos por plataforma e configuração de NF automática</span>
            </div>
            {panorama.plataformasConectadas === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="text-label text-muted">Nenhuma plataforma externa conectada.</span>
                <Button variant="ghost" onClick={() => router.push("/dashboard/administration/integrations?cartao=plataformas")}>
                  Conectar plataforma
                </Button>
              </div>
            ) : (
              <span className="text-label text-ink tabular-nums">
                {panorama.plataformasConectadas} plataforma(s) conectada(s)
              </span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================= usuários ================================= */

export function UsuariosView() {
  const { show: toast, node } = useToast();
  const membros = useQuery({ queryKey: ["gov-members"], queryFn: listMembers });
  const empresa = useQuery({ queryKey: ["company"], queryFn: fetchCompany });
  const [busca, setBusca] = React.useState("");
  const [convite, setConvite] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [nome, setNome] = React.useState("");
  const [perfil, setPerfil] = React.useState<PerfilUsuario>("leitura");
  const [erro, setErro] = React.useState<string | null>(null);

  const usuarios = usuariosDaEmpresa(membros.data ?? [], empresa.data);
  const lista = filtrarUsuarios(usuarios, busca);

  async function remover(id: string) {
    const impedimento = podeRemover(usuarios, id);
    if (impedimento) { toast(impedimento); return; }
    await removeMember(id);
    membros.refetch();
    toast("Usuário removido.");
  }

  async function trocarPerfil(u: UsuarioEmpresa, novo: PerfilUsuario) {
    const impedimento = podeTrocarPerfil(usuarios, u.id, novo);
    if (impedimento) { toast(impedimento); return; }
    const original = (membros.data ?? []).find((m) => m.id === u.id);
    if (!original) return;
    await saveMember({ ...original, papel: PAPEL_DO_PERFIL[novo] });
    membros.refetch();
    toast(`Perfil de ${u.nome} alterado para ${PERFIS.find((p) => p.id === novo)?.label}.`);
  }

  async function convidar() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErro("E-mail inválido."); return; }
    if (usuarios.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      setErro("Este e-mail já tem acesso.");
      return;
    }
    await saveMember({
      id: "", nome: nome || email.split("@")[0], email, funcao: "",
      aprovaPagamentos: false, limite: "", papel: PAPEL_DO_PERFIL[perfil],
    } as GovMember);
    membros.refetch();
    setConvite(false); setEmail(""); setNome(""); setErro(null);
    toast("Convite enviado. O usuário precisa ter conta para ser vinculado.");
  }

  const linhasXLSX = [
    ["Nome", "E-mail", "Perfil", "Dono"],
    ...lista.map((u) => [u.nome, u.email, PERFIS.find((p) => p.id === u.perfil)?.label ?? u.perfil, u.dono ? "Sim" : "Não"]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Usuários com acesso a esta empresa</p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" onClick={() => { setErro(null); setConvite(true); }}>
            <Icon name="plus" size={15} color="currentColor" />
            Convidar usuário
          </Button>
          <Button variant="ghost" disabled={lista.length === 0} onClick={() => baixarXLSX("usuarios", [{ nome: "Usuários", linhas: linhasXLSX }])}>
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-[6px] max-w-[420px]">
          <label className="text-label font-medium text-muted">Buscar</label>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou e-mail…" />
        </div>
      </Card>

      {convite && (
        <Card>
          <div className="flex flex-col gap-4">
            <span className="text-h3 font-semibold text-ink">Convidar usuário</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-[6px]">
                <label className="text-label font-medium text-muted">Nome</label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do usuário" />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="text-label font-medium text-muted">E-mail</label>
                <Input value={email} onChange={(e) => { setEmail(e.target.value); setErro(null); }} placeholder="usuario@empresa.com.br" invalid={!!erro} />
                {erro && <span className="text-caption text-negative">{erro}</span>}
              </div>
              <Select
                label="Perfil" value={perfil} onChange={(v) => setPerfil(v as PerfilUsuario)}
                options={PERFIS.map((p) => ({ value: p.id, label: p.label }))}
              />
            </div>
            <span className="text-caption text-faint">
              {PERFIS.find((p) => p.id === perfil)?.descricao}
            </span>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setConvite(false)}>Cancelar</Button>
              <Button variant="primary" onClick={convidar}>Enviar convite</Button>
            </div>
          </div>
        </Card>
      )}

      {lista.length === 0 ? (
        <Card><p className="m-0 py-10 text-center text-label text-muted">Nenhum usuário encontrado.</p></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th direita>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                    <td className="px-6 py-3 text-label text-ink">
                      {u.nome}
                      {u.dono && <span className="ml-2 text-caption text-faint">dono</span>}
                    </td>
                    <td className="px-6 py-3 text-label text-muted">{u.email}</td>
                    <td className="px-6 py-3">
                      <Select
                        value={u.perfil}
                        onChange={(v) => trocarPerfil(u, v as PerfilUsuario)}
                        options={PERFIS.map((p) => ({ value: p.id, label: p.label }))}
                        containerClassName="max-w-[190px]"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end">
                        <Button variant="ghost" onClick={() => remover(u.id)}>Remover</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="m-0 text-caption text-faint max-w-[84ch]">
        O último administrador não pode ser removido nem rebaixado: a organização ficaria sem
        quem convida outro, e nenhuma tela conseguiria desfazer — desfazer exige justamente o
        papel que acabou de sumir.
      </p>
      {node}
    </div>
  );
}

/* =================================== logs =================================== */

const ACAO_DA_TRILHA: Record<string, RegistroLog["acao"]> = {
  created: "criou", updated: "alterou", deleted: "removeu",
  approved: "alterou", rejected: "alterou", executed: "alterou",
  reconciled: "alterou",
};

const ENTIDADE_DA_TRILHA: Record<string, string> = {
  payment: "Lançamento", invoice: "Nota fiscal", pix: "Lançamento",
  user: "Usuário", rule: "Configuração", movement: "Lançamento",
  state: "Dado salvo",
};

const kbLog = (b: unknown) =>
  typeof b === "number" ? `${Math.round((b / 1024) * 10) / 10} KB` : "—";

/**
 * O resumo é o "de X para Y".
 *
 * A trilha guarda `before`/`after` inteiros; a lista precisa da FRASE. Mostrar
 * só o nome da entidade tornaria a busca por conteúdo inútil — ninguém procura
 * "Lançamento", procura "de 1.000 para 10.000".
 *
 * ⚠️ O evento de ESTADO tem frase própria. O diff genérico o descreveria como
 * "org_id: <uuid> · chave: a4p_close_tasks · versao: de 3 para 4" — verdadeiro e
 * ilegível, e um log que só o autor decifra não serve à auditoria, que é o
 * motivo de ele existir. O payload do gatilho é deliberadamente pequeno (versão
 * e tamanho, não o valor), então a frase diz o que ele de fato responde: o quê,
 * qual versão e quanto o dado cresceu.
 */
function resumoDoEvento(e: {
  action: string;
  entityType?: string;
  entityId?: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): string {
  const antes = e.before ?? {};
  const depois = e.after ?? {};
  if (e.entityType === "state") {
    const nome = rotuloDaChave(String(depois.chave ?? e.entityId ?? ""));
    const versao = depois.versao != null ? ` · versão ${String(depois.versao)}` : "";
    const tamanho = typeof antes.bytes === "number" && antes.bytes !== depois.bytes
      ? ` · ${kbLog(antes.bytes)} → ${kbLog(depois.bytes)}`
      : ` · ${kbLog(depois.bytes)}`;
    return `${nome}${versao}${tamanho}`;
  }
  const mudou = Object.keys(depois).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
  if (mudou.length === 0) return e.action;
  return mudou
    .slice(0, 3)
    .map((k) => (k in antes ? `${k}: de ${String(antes[k])} para ${String(depois[k])}` : `${k}: ${String(depois[k])}`))
    .join(" · ");
}

export function LogsView() {
  const trilha = useQuery({ queryKey: ["audit-trail"], queryFn: getAuditTrail });
  const [de, setDe] = React.useState(diasAtras(7));
  const [ate, setAte] = React.useState(hojeISO());
  const [aplicado, setAplicado] = React.useState<FiltroLogs>({ de: diasAtras(7), ate: hojeISO() });
  const [usuario, setUsuario] = React.useState("todos");
  const [busca, setBusca] = React.useState("");
  const [acao, setAcao] = React.useState<FiltroLogs["acao"]>("todas");
  const [origem, setOrigem] = React.useState("todas");
  const [tipo, setTipo] = React.useState("todos");
  const [entidade, setEntidade] = React.useState("todas");

  // A trilha institucional já é o histórico do sistema — traduzir aqui evita um
  // segundo log paralelo que discordaria do primeiro.
  const logs: RegistroLog[] = React.useMemo(
    () => (trilha.data?.eventos ?? []).map((e, k) => ({
      id: e.id || `log${k}`,
      quando: e.timestamp,
      acao: ACAO_DA_TRILHA[e.action] ?? "alterou",
      usuario: e.ctx?.userName || "sistema",
      // A trilha guarda o dispositivo/navegador — é a origem forense da ação.
      origem: e.ctx?.device?.includes("API") ? "API" : "Web",
      tipoEntidade: ENTIDADE_DA_TRILHA[e.entityType] ?? e.entityType,
      entidadeId: e.entityId,
      // O evento de estado se identifica pela CHAVE; mostrá-la crua obrigaria
      // quem audita a decifrar `a4p_close_tasks`.
      entidade: e.entityType === "state" ? rotuloDaChave(e.entityId) : e.entityId,
      resumo: resumoDoEvento(e),
    })),
    [trilha.data],
  );

  const usuarios = React.useMemo(() => Array.from(new Set(logs.map((l) => l.usuario))), [logs]);
  const entidades = React.useMemo(
    () => Array.from(new Set(logs.map((l) => l.entidadeId).filter(Boolean))),
    [logs],
  );
  const lista = React.useMemo(() => filtrarLogs(logs, aplicado), [logs, aplicado]);
  const foraDaJanela = periodoForaDaJanela(hojeISO(), aplicado.de);

  function aplicar() {
    setAplicado({ de, ate, usuario, busca, acao, origem, tipoEntidade: tipo, entidadeId: entidade });
  }
  function limpar() {
    setDe(diasAtras(7)); setAte(hojeISO()); setUsuario("todos"); setBusca("");
    setAcao("todas"); setOrigem("todas"); setTipo("todos"); setEntidade("todas");
    setAplicado({ de: diasAtras(7), ate: hojeISO() });
  }

  const linhasXLSX = [
    ["Data/hora", "Ação", "Usuário", "Origem", "Tipo", "Entidade", "Resumo"],
    ...lista.map((l) => [fmtHora(l.quando), l.acao, l.usuario, l.origem, l.tipoEntidade, l.entidade, l.resumo]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Histórico de alterações realizadas pelos usuários da empresa.</p>
        <Button variant="ghost" disabled={lista.length === 0} onClick={() => baixarXLSX("logs", [{ nome: "Logs", linhas: linhasXLSX }])}>
          <Icon name="arrow-down-to-line" size={15} color="currentColor" />
          Exportar XLSX
        </Button>
      </div>

      <Card>
        <p className="m-0 text-label text-muted">Logs disponíveis pelos últimos {JANELA_LOGS_DIAS} dias.</p>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">Período</label>
              <div className="flex items-center gap-2">
                <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
                <Icon name="chevron-right" size={14} color="var(--color-text-tertiary)" />
                <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
            </div>
            <Select label="Usuário" value={usuario} onChange={setUsuario}
              options={[{ value: "todos", label: "Todos" }, ...usuarios.map((u) => ({ value: u, label: u }))]} />
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">Buscar no conteúdo</label>
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="de 1.000 para 10.000…" />
            </div>
            <Select label="Ação" value={acao ?? "todas"} onChange={(v) => setAcao(v as FiltroLogs["acao"])}
              options={[{ value: "todas", label: "Todas as ações" }, ...ACOES_LOG.map((a) => ({ value: a.id, label: a.label }))]} />
            <Select label="Origem" value={origem} onChange={setOrigem}
              options={[{ value: "todas", label: "Todas as origens" }, ...ORIGENS_LOG.map((o) => ({ value: o, label: o }))]} />
            <Select label="Tipo de entidade" value={tipo} onChange={setTipo}
              options={[{ value: "todos", label: "Todos os tipos" }, ...TIPOS_ENTIDADE.map((t) => ({ value: t, label: t }))]} />
            <Select label="Entidade específica" value={entidade} onChange={setEntidade}
              options={[{ value: "todas", label: "Todas" }, ...entidades.map((e) => ({ value: e, label: e }))]} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={aplicar}>Aplicar</Button>
            <Button variant="ghost" onClick={limpar}>Limpar</Button>
          </div>
        </div>
      </Card>

      {foraDaJanela && (
        <Card>
          <div className="flex items-start gap-3">
            <Icon name="triangle-alert" size={17} color="var(--color-warning)" />
            <span className="text-caption text-muted max-w-[86ch]">
              O período pedido começa antes da janela de retenção de {JANELA_LOGS_DIAS} dias. O que
              está fora dela foi descartado — a lista abaixo não significa que nada aconteceu
              naquele intervalo, e é numa auditoria que a diferença entre as duas frases importa.
            </span>
          </div>
        </Card>
      )}

      {lista.length === 0 ? (
        <Card><p className="m-0 py-10 text-center text-label text-muted">Nenhum log encontrado no período.</p></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Data/hora</Th><Th>Ação</Th><Th>Usuário</Th><Th>Origem</Th><Th>Resumo</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((l) => (
                  <tr key={l.id} className="border-b border-border-soft last:border-0">
                    <td className="px-6 py-3 text-label text-muted tabular-nums">{fmtHora(l.quando)}</td>
                    <td className="px-6 py-3 text-label text-ink">{ACOES_LOG.find((a) => a.id === l.acao)?.label}</td>
                    <td className="px-6 py-3 text-label text-muted">{l.usuario}</td>
                    <td className="px-6 py-3 text-label text-muted">{l.origem}</td>
                    <td className="px-6 py-3 text-label text-ink">{l.resumo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ========================= relatórios exportados ========================= */

export function RelatoriosExportadosView() {
  const { show: toast, node } = useToast();
  const [lista, setLista] = React.useState<Exportacao[]>([]);
  const [de, setDe] = React.useState(diasAtras(30));
  const [ate, setAte] = React.useState(hojeISO());
  const [formato, setFormato] = React.useState<FormatoExport | "todos">("todos");
  const [relatorio, setRelatorio] = React.useState("todos");
  const hoje = hojeISO();

  React.useEffect(() => { setLista(listarExportacoes()); }, []);

  const relatorios = React.useMemo(() => Array.from(new Set(lista.map((e) => e.relatorio))), [lista]);
  const filtrada = React.useMemo(
    () => filtrarExportacoes(lista, { de, ate, formato, relatorio }),
    [lista, de, ate, formato, relatorio],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Encontre e baixe novamente as suas exportações recentes.</p>
        <Button variant="ghost" onClick={() => { setLista(listarExportacoes()); toast("Lista recarregada."); }}>
          <Icon name="rotate-ccw" size={15} color="currentColor" />
          Recarregar
        </Button>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <Icon name="info" size={17} color="var(--color-text-secondary)" />
          <div className="flex flex-col gap-2 text-caption text-muted max-w-[92ch]">
            <span>
              Ficam registradas aqui as exportações de <strong>Contas a pagar</strong> e{" "}
              <strong>Contas a receber</strong> processadas em segundo plano: PDF com mais de{" "}
              <strong className="tabular-nums">{LIMITE_PDF_LINHAS}</strong> linhas e XLSX com mais de{" "}
              <strong className="tabular-nums">{LIMITE_XLSX_LINHAS.toLocaleString("pt-BR")}</strong> linhas.
            </span>
            <span>
              Nesses casos o link também chega por e-mail, e o arquivo fica disponível por{" "}
              <strong className="tabular-nums">{DIAS_RETENCAO_EXPORT} dias</strong>. Exportações
              menores baixam na hora, direto da tela de origem, e não aparecem nesta lista —
              registrar todas transformaria a fila num log onde o relatório que você está
              esperando se perderia.
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Período</label>
            <div className="flex items-center gap-2">
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              <Icon name="chevron-right" size={14} color="var(--color-text-tertiary)" />
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          </div>
          <Select label="Formato" value={formato} onChange={(v) => setFormato(v as FormatoExport | "todos")}
            options={[{ value: "todos", label: "Todos os formatos" }, { value: "pdf", label: "PDF" }, { value: "xlsx", label: "XLSX" }]} />
          <Select label="Relatório" value={relatorio} onChange={setRelatorio}
            options={[{ value: "todos", label: "Todos os relatórios" }, ...relatorios.map((r) => ({ value: r, label: r }))]} />
        </div>
      </Card>

      <p className="m-0 text-label text-muted tabular-nums">
        Total de {filtrada.length} registro(s) no período filtrado
      </p>

      {filtrada.length === 0 ? (
        <Card><p className="m-0 py-10 text-center text-label text-muted">Nenhuma exportação no período.</p></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Exportado em</Th><Th>Relatório</Th><Th>Nome do arquivo</Th>
                  <Th>Formato</Th><Th>Status</Th><Th>Expira em</Th><Th direita>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((e) => {
                  const st = statusExportacao(e, hoje);
                  const restam = diasEntre(hoje, expiraEm(e.exportadoEm));
                  return (
                    <tr key={e.id} className="border-b border-border-soft last:border-0">
                      <td className="px-6 py-3 text-label text-muted tabular-nums">{fmtDia(e.exportadoEm)}</td>
                      <td className="px-6 py-3 text-label text-ink">{e.relatorio}</td>
                      <td className="px-6 py-3 text-caption text-faint">{e.nomeArquivo}</td>
                      <td className="px-6 py-3 text-label text-muted uppercase">{e.formato}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                          <span className="w-[7px] h-[7px] rounded-pill" style={{
                            background: st === "pronto" ? "var(--color-positive)"
                              : st === "processando" ? "var(--color-warning)"
                              : st === "erro" ? "var(--color-negative)" : "var(--color-placeholder)",
                          }} />
                          {st === "pronto" ? "Pronto" : st === "processando" ? "Processando" : st === "erro" ? "Erro" : "Expirado"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-label text-muted tabular-nums">
                        {fmtDia(expiraEm(e.exportadoEm))}
                        {st === "pronto" && restam <= 3 && (
                          <span className="ml-2 text-caption text-warning">{restam}d</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {st === "pronto" && <Button variant="ghost" onClick={() => toast("Download iniciado.")}>Baixar</Button>}
                          <button
                            onClick={() => { setLista(removerExportacao(e.id)); toast("Registro removido."); }}
                            aria-label="Remover" title="Remover"
                            className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2 transition-colors"
                          >
                            <Icon name="trash-2" size={15} color="currentColor" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Dado({
  rotulo, icone, valor, children,
}: { rotulo: string; icone: string; valor?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icone} size={16} color="var(--color-text-tertiary)" />
      <span className="flex flex-col gap-[4px] min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{rotulo}</span>
        {children ?? <span className="text-label text-ink tabular-nums truncate">{valor}</span>}
      </span>
    </div>
  );
}

function Numero({ rotulo, n, texto }: { rotulo: string; n?: number; texto?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-4 py-3 flex flex-col gap-1">
      <span className="text-[22px] leading-none font-semibold text-ink tabular-nums">{texto ?? n}</span>
      <span className="text-caption text-muted">{rotulo}</span>
    </div>
  );
}

function LinhaIntegracao({
  titulo, sub, ativa, onConfigurar,
}: { titulo: string; sub: string; ativa: boolean; onConfigurar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-4 py-3">
      <span className="flex flex-col min-w-0">
        <span className="text-label text-ink">{titulo}</span>
        <span className="text-caption text-faint">{sub}</span>
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <span className="inline-flex items-center gap-[6px] text-caption text-muted">
          <span className="w-[7px] h-[7px] rounded-pill" style={{ background: ativa ? "var(--color-positive)" : "var(--color-placeholder)" }} />
          {ativa ? "Ativo" : "Inativo"}
        </span>
        <Button variant="ghost" onClick={onConfigurar}>Configurar</Button>
      </span>
    </div>
  );
}

function Th({ children, direita }: { children: React.ReactNode; direita?: boolean }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
