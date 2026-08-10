/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEGURANÇA — papéis, isolamento e o que a auditoria cobra
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Esta camada NÃO autoriza nada.** Quem autoriza é o banco: as políticas
 * de linha, `tem_permissao()`, os gatilhos de segregação e o portão
 * administrativo. O que mora aqui é o vocabulário (para a tela nomear as
 * coisas), a leitura dos relatórios que o servidor devolve, e a MESMA regra de
 * segregação que o gatilho aplica — para o botão poder explicar antes do clique
 * o que o banco recusaria depois dele.
 *
 * Confiar neste arquivo para liberar tela repetiria o defeito que a ONDA 2
 * corrigiu no gating de plano e que a ONDA 9 corrige nos papéis: apresentação
 * não é autorização.
 *
 * Puro, tipado, demo-safe. Versão `seguranca/1.0.0`.
 */

export const SEGURANCA_VERSION = "seguranca/1.0.0";

/* ========================================================================== */
/* PAPÉIS E AÇÕES                                                             */
/* ========================================================================== */

/**
 * ⚠️ `member` é o papel LEGADO e é lido como `lancador`. Reinterpretá-lo como
 * algo mais poderoso daria, de uma vez, poder de aprovação a todo mundo que já
 * é membro — o oposto do que a segregação existe para fazer.
 */
export type Papel =
  | "owner" | "admin" | "fechador" | "aprovador" | "lancador" | "leitor" | "member";

export type Acao =
  | "ler" | "exportar" | "lancar" | "baixar" | "aprovar" | "fechar"
  | "administrar" | "cobranca";

export const PAPEIS: { id: Papel; nome: string; oQue: string; legado?: boolean }[] = [
  { id: "owner",     nome: "Titular",       oQue: "Responde pela empresa: administra e decide plano e cobrança." },
  { id: "admin",     nome: "Administrador", oQue: "Administra usuários, papéis e integrações; aprova e fecha." },
  { id: "fechador",  nome: "Contador",      oQue: "Lança e FECHA o período — trava o mês e assina o fechamento." },
  { id: "aprovador", nome: "Aprovador",     oQue: "Lança e decide solicitações de alçada — nunca a própria." },
  { id: "lancador",  nome: "Lançador",      oQue: "Registra e dá baixa no dia a dia; não aprova e não fecha." },
  { id: "leitor",    nome: "Leitor",        oQue: "Só consulta. Não escreve e não exporta a base." },
  { id: "member",    nome: "Membro (antigo)", oQue: "Papel anterior à separação; equivale ao Lançador.", legado: true },
];

export const ACOES: { id: Acao; nome: string; oQue: string }[] = [
  { id: "ler",         nome: "Consultar",   oQue: "Abrir telas e relatórios." },
  { id: "exportar",    nome: "Exportar",    oQue: "Levar dados para fora em arquivo." },
  { id: "lancar",      nome: "Lançar",      oQue: "Criar e editar lançamentos, vendas, compras e cadastros." },
  { id: "baixar",      nome: "Dar baixa",   oQue: "Liquidar título — move dinheiro." },
  { id: "aprovar",     nome: "Aprovar",     oQue: "Decidir solicitações de alçada." },
  { id: "fechar",      nome: "Fechar",      oQue: "Travar período e assinar o fechamento." },
  { id: "administrar", nome: "Administrar", oQue: "Usuários, papéis e integrações." },
  { id: "cobranca",    nome: "Plano",       oQue: "Assinatura e cobrança da empresa." },
];

export const nomeDoPapel = (p: string): string =>
  PAPEIS.find((x) => x.id === p)?.nome ?? p;

/**
 * ⚠️ A matriz de referência existe **só para o modo demonstração**, onde não há
 * servidor para perguntar. Em produção a fonte é `minhas_permissoes()`: uma
 * segunda cópia da matriz no cliente divergiria do banco no primeiro ajuste, e
 * a divergência apareceria como um botão que existe e não funciona — ou, pior,
 * como um botão que some para quem tinha direito.
 */
export const MATRIZ_DEMO: Record<Papel, Acao[]> = {
  owner:     ["ler", "exportar", "lancar", "baixar", "aprovar", "fechar", "administrar", "cobranca"],
  admin:     ["ler", "exportar", "lancar", "baixar", "aprovar", "fechar", "administrar"],
  fechador:  ["ler", "exportar", "lancar", "baixar", "fechar"],
  aprovador: ["ler", "exportar", "lancar", "baixar", "aprovar"],
  lancador:  ["ler", "exportar", "lancar", "baixar"],
  member:    ["ler", "exportar", "lancar", "baixar"],
  leitor:    ["ler"],
};

/* ========================================================================== */
/* SEGREGAÇÃO DE FUNÇÕES                                                       */
/* ========================================================================== */

export interface PedidoDeAprovacao {
  id: string;
  /** Quem PEDIU. É a única coisa que decide a segregação. */
  solicitanteId: string | null;
  valor: number;
}

export type MotivoRecusa = "sem-papel" | "propria-solicitacao" | null;

/**
 * A MESMA regra que o gatilho `approvals_segregacao` aplica no banco.
 *
 * ⚠️ Ela vive nos dois lugares por razões diferentes, e isso não é duplicação
 * de autoridade: o banco RECUSA (é a garantia), a tela EXPLICA (é a cortesia).
 * Sem a versão da tela, a pessoa clica, espera e recebe um erro de banco no
 * lugar de uma frase — e conclui que o sistema quebrou, não que a regra existe.
 *
 * A ordem dos testes importa: quem não tem o papel não aprova nada, então essa
 * é a primeira pergunta. "É a sua própria solicitação" só faz sentido depois.
 */
export function motivoParaNaoAprovar(
  pedido: PedidoDeAprovacao,
  usuarioId: string | null,
  permissoes: readonly string[],
): MotivoRecusa {
  if (!permissoes.includes("aprovar")) return "sem-papel";
  if (usuarioId && pedido.solicitanteId && pedido.solicitanteId === usuarioId) {
    return "propria-solicitacao";
  }
  return null;
}

export const podeAprovar = (
  pedido: PedidoDeAprovacao, usuarioId: string | null, permissoes: readonly string[],
): boolean => motivoParaNaoAprovar(pedido, usuarioId, permissoes) === null;

export const FRASE_RECUSA: Record<Exclude<MotivoRecusa, null>, string> = {
  "sem-papel": "Seu papel nesta empresa não decide solicitações.",
  "propria-solicitacao": "Segregação de funções: quem solicita não decide a própria solicitação.",
};

/* ========================================================================== */
/* O TESTE DE ISOLAMENTO                                                       */
/* ========================================================================== */

export interface LinhaIsolamento {
  tabela: string;
  linhasDeOutraOrg: number;
  visiveis: number;
}

export interface ResumoIsolamento {
  tabelas: number;
  vazamentos: number;
  tabelasVazando: string[];
  linhasVisiveis: number;
  ok: boolean;
}

/**
 * ⚠️ `ok` exige **zero** — não "pouco". Não existe vazamento aceitável entre
 * empresas num produto financeiro: uma única linha da empresa errada já é o
 * incidente que não se desfaz com pedido de desculpas.
 *
 * E `ok` exige ter TESTADO: nenhuma tabela conferida devolve `ok: false`, senão
 * uma consulta que falhou em silêncio passaria por aprovação.
 */
export function resumoIsolamento(linhas: readonly LinhaIsolamento[]): ResumoIsolamento {
  const vazamentos = linhas.reduce((s, l) => s + Math.max(0, l.linhasDeOutraOrg), 0);
  return {
    tabelas: linhas.length,
    vazamentos,
    tabelasVazando: linhas.filter((l) => l.linhasDeOutraOrg > 0).map((l) => l.tabela),
    linhasVisiveis: linhas.reduce((s, l) => s + l.visiveis, 0),
    ok: linhas.length > 0 && vazamentos === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* O TESTE POR VERBO — o que o anterior não perguntava                        */
/* -------------------------------------------------------------------------- */

/**
 * Uma TENTATIVA: uma tabela, um verbo, um veredicto.
 *
 * ⚠️ O teste anterior contava linhas visíveis. Isso é UM verbo, e a pergunta
 * "estamos isolados?" não se responde com ele: ler pode estar fechado e
 * escrever aberto, porque `with check` não cobre exclusão e uma política de
 * `ALL` não protege o mesmo que uma de só-`SELECT`.
 */
export interface TentativaIsolamento {
  tabela: string;
  verbo: string;
  /** `VAZOU` · `negado` · `sem privilégio` · `sem molde` · `sem alvo` · `erro`. */
  resultado: string;
  vazou: boolean;
  detalhe: string;
}

export const VERBOS: { id: string; nome: string; oQue: string }[] = [
  { id: "ler",       nome: "Ler",       oQue: "Enxergo alguma linha que não é minha nem da minha empresa?" },
  { id: "agregar",   nome: "Agregar",   oQue: "Uma contagem devolve o número mesmo com as linhas escondidas?" },
  { id: "inserir",   nome: "Inserir",   oQue: "Consigo gravar uma linha pertencente a outra empresa?" },
  { id: "atualizar", nome: "Atualizar", oQue: "Consigo alterar uma linha de outra empresa?" },
  { id: "apagar",    nome: "Apagar",    oQue: "Consigo apagar uma linha de outra empresa?" },
  { id: "definer",   nome: "Função",    oQue: "As funções que passam por cima da política devolvem dado alheio?" },
];

export const nomeDoVerbo = (v: string): string =>
  VERBOS.find((x) => x.id === v)?.nome ?? v;

export interface ResumoPorVerbo {
  tabelas: number;
  tentativas: number;
  vazamentos: TentativaIsolamento[];
  /** Tentativas que não chegaram a acontecer (sem privilégio, sem molde, erro). */
  naoTentadas: number;
  ok: boolean;
}

/**
 * ⚠️ `ok` exige **zero** vazamentos E ter TENTADO — as duas coisas.
 *
 * "Zero" sem tentativa é o defeito que esta onda encontrou: `teste_isolamento()`
 * abortava na primeira tabela sem privilégio (`subscriptions`, 42501) e a tela
 * ficava com "Não foi possível testar" desde o dia em que foi escrita. Um
 * resumo que somasse zero de uma lista vazia teria dito "aprovado".
 *
 * ⚠️ `naoTentadas` NÃO reprova, e isso é decisão, não descuido: "authenticated
 * não tem SELECT nesta tabela" é uma resposta legítima e forte — a tabela está
 * fechada por CONCESSÃO, que é mais duro que fechada por política. O que ela
 * não pode é sumir do relatório, senão o placar conta como conferido o que não
 * foi.
 */
export function resumoPorVerbo(linhas: readonly TentativaIsolamento[]): ResumoPorVerbo {
  const vazamentos = linhas.filter((l) => l.vazou);
  const naoTentadas = linhas.filter(
    (l) => l.resultado === "sem privilégio" || l.resultado === "sem molde" ||
           l.resultado === "sem alvo" || l.resultado === "erro",
  ).length;
  return {
    tabelas: new Set(linhas.map((l) => l.tabela)).size,
    tentativas: linhas.length,
    vazamentos,
    naoTentadas,
    ok: linhas.length > 0 && vazamentos.length === 0,
  };
}

/** Agrupa por tabela, preservando a ordem dos verbos declarada em `VERBOS`. */
export function porTabela(
  linhas: readonly TentativaIsolamento[],
): { tabela: string; tentativas: TentativaIsolamento[]; vazou: boolean }[] {
  const mapa = new Map<string, TentativaIsolamento[]>();
  for (const l of linhas) {
    const atual = mapa.get(l.tabela);
    if (atual) atual.push(l);
    else mapa.set(l.tabela, [l]);
  }
  const ordem = (v: string) => {
    const i = VERBOS.findIndex((x) => x.id === v);
    return i < 0 ? VERBOS.length : i;
  };
  return Array.from(mapa.entries()).map(([tabela, tentativas]) => ({
    tabela,
    tentativas: [...tentativas].sort((a, b) => ordem(a.verbo) - ordem(b.verbo)),
    vazou: tentativas.some((t) => t.vazou),
  }));
}

/* ========================================================================== */
/* A AUDITORIA DA POLÍTICA DE LINHA                                            */
/* ========================================================================== */

export interface LinhaAuditoriaRLS {
  tabela: string;
  rlsLigada: boolean;
  politicas: number;
  temOrgId: boolean;
  politicaPorOrg: boolean;
  alcancaAnonimo: boolean;
  anonPodeTruncar: boolean;
}

export type Gravidade = "critico" | "alto" | "medio";

export interface Achado {
  tabela: string;
  gravidade: Gravidade;
  problema: string;
  porque: string;
}

/**
 * Traduz o inventário do banco em ACHADOS, com a razão de cada um.
 *
 * ⚠️ A ordem das gravidades não é opinião — é o que cada falha permite:
 *
 *  - **`anonPodeTruncar`** é crítico e vem primeiro porque `TRUNCATE` **não é
 *    filtrado por política de linha**. Isto foi medido: numa tabela com RLS
 *    ligada e política `using (false)`, o `truncate` como `anon` apagou tudo
 *    sem erro. E a chave `anon` viaja no pacote do navegador.
 *  - **RLS desligada** é crítico: com as concessões padrão, a tabela é pública.
 *  - **RLS ligada sem política** NÃO é achado: é negar tudo, e é o desenho
 *    correto das tabelas que só as funções `SECURITY DEFINER` acessam.
 *  - **`org_id` sem política que o use** é alto: a coluna diz que a tabela é
 *    multiempresa e nada garante o recorte.
 */
export function achadosDaAuditoria(linhas: readonly LinhaAuditoriaRLS[]): Achado[] {
  const out: Achado[] = [];
  for (const l of linhas) {
    if (l.anonPodeTruncar) {
      out.push({
        tabela: l.tabela, gravidade: "critico",
        problema: "a sessão anônima pode esvaziar a tabela",
        porque: "TRUNCATE não passa por política de linha: nenhuma política impede, só a retirada do privilégio.",
      });
    }
    if (!l.rlsLigada) {
      out.push({
        tabela: l.tabela, gravidade: "critico",
        problema: "sem política de acesso por linha",
        porque: "Com as concessões padrão do banco, uma tabela sem política responde a qualquer sessão.",
      });
    } else if (l.temOrgId && !l.politicaPorOrg && l.politicas > 0) {
      out.push({
        tabela: l.tabela, gravidade: "alto",
        problema: "tem coluna de empresa, mas nenhuma política a usa",
        porque: "A coluna declara que a tabela é multiempresa; sem política por empresa, o recorte depende de quem consulta.",
      });
    }
    if (l.alcancaAnonimo && l.politicas > 0) {
      out.push({
        tabela: l.tabela, gravidade: "medio",
        problema: "política declarada para a sessão anônima",
        porque: "Hoje ela não entrega nada porque a comparação com nulo é falsa — mas isso é sorte do NULO, não desenho.",
      });
    }
  }
  return out.sort((a, b) => ordem(a.gravidade) - ordem(b.gravidade) || a.tabela.localeCompare(b.tabela));
}

const ordem = (g: Gravidade) => (g === "critico" ? 0 : g === "alto" ? 1 : 2);

/* ========================================================================== */
/* REVISÃO DO ACESSO ADMINISTRATIVO                                            */
/* ========================================================================== */

export interface AdminRevisao {
  userId: string;
  email: string | null;
  motivo: string | null;
  expiraEm: string | null;
  revisadoEm: string | null;
  exigeMfa: boolean;
  fatoresMfa: number;
  mfaPrazo: string | null;
  acessos30d: number;
  negados30d: number;
  ultimoAcesso: string | null;
  pendente: boolean;
}

/**
 * O que precisa de atenção humana na lista de administradores da plataforma.
 *
 * ⚠️ "Sem segundo fator" entra mesmo dentro do prazo, e de propósito: o prazo
 * evita tirar o acesso hoje, não torna a situação aceitável. Um alerta que só
 * aparece no dia do vencimento é um alerta que chega junto com o problema.
 */
export function pendenciasDeAdmin(lista: readonly AdminRevisao[], hojeISO: string): Achado[] {
  const out: Achado[] = [];
  for (const a of lista) {
    const quem = a.email ?? a.userId;
    if (a.expiraEm && a.expiraEm < hojeISO) {
      out.push({ tabela: quem, gravidade: "critico", problema: "acesso vencido e ainda na lista",
        porque: "Acesso vencido que ninguém remove é acesso permanente com aparência de temporário." });
    }
    if (a.exigeMfa && a.fatoresMfa === 0) {
      const venceu = !!a.mfaPrazo && a.mfaPrazo < hojeISO;
      out.push({ tabela: quem, gravidade: venceu ? "critico" : "alto",
        problema: venceu ? "sem segundo fator e com o prazo vencido" : `sem segundo fator (prazo até ${a.mfaPrazo ?? "—"})`,
        porque: "Um administrador enxerga todas as empresas da plataforma; uma senha só é um fator só." });
    }
    if (!a.revisadoEm) {
      out.push({ tabela: quem, gravidade: "medio", problema: "nunca revisado",
        porque: "Sem revisão, a lista de quem vê tudo só cresce — cada nome que fica é um nome que ninguém decidiu manter." });
    }
    if (a.negados30d > 0) {
      out.push({ tabela: quem, gravidade: "alto", problema: `${a.negados30d} tentativas negadas em 30 dias`,
        porque: "Acesso concedido é rotina; sequência de negados é começo de incidente." });
    }
    if (!a.motivo) {
      out.push({ tabela: quem, gravidade: "medio", problema: "sem motivo registrado",
        porque: "Sem o porquê, a revisão vira uma lista de nomes que ninguém sabe avaliar." });
    }
  }
  return out.sort((a, b) => ordem(a.gravidade) - ordem(b.gravidade));
}
