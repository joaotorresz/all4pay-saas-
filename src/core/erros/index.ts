/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FALHAS — todo erro tem DONO, e nenhum erro de servidor é silencioso
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ O defeito que esta camada existe para matar tem nome e data: a consulta de
 * movimentações pedindo a dimensão de PROJETO devolvia **400** e o código caía
 * no `catch` sem dizer nada. A tela seguia funcionando com menos dados, ninguém
 * viu, e o erro atravessou meses. O filtro de datas impossível fez o mesmo por
 * outro caminho: devolvia zero, e zero se parece com "não há nada".
 *
 * A varredura encontrou **33 blocos `catch` de chamada a servidor ou rede
 * engolindo o erro** — mais 77 em leitura de cache local, onde engolir é
 * defensável. O problema nunca foi o `catch`: é o `catch` que não CONTA.
 *
 * Três decisões desta camada:
 *
 *  1. **Toda falha tem DONO.** Um alerta sem responsável é um alerta que fica
 *     no painel para sempre — todo mundo vê e ninguém age. O dono aqui é o
 *     mesmo vocabulário do inventário de rotas, porque a pergunta "quem
 *     responde por isto?" tem de ter uma resposta só no sistema inteiro.
 *  2. **Falha degradada continua sendo falha.** Cair para um caminho
 *     alternativo é a decisão certa em runtime e a decisão errada em silêncio:
 *     a tela responde, e por isso mesmo ninguém descobre. `degradado: true`
 *     registra que o usuário não viu problema — e que existe um.
 *  3. **A gravidade sai do que o usuário PERDE**, não do código HTTP. Um 404 de
 *     consulta opcional é rotina; um 400 que derruba uma dimensão inteira do
 *     relatório é alto, ainda que o app não quebre.
 *
 * Puro, tipado, sem I/O. Versão `erros/1.0.0`.
 */

export const ERROS_VERSION = "erros/1.0.0";

/** Quem responde. Mesmo vocabulário do inventário de rotas. */
export type Dono =
  | "financeiro" | "ingestao" | "cadastros" | "relatorios" | "contabilidade"
  | "ia" | "plataforma" | "vendas" | "compras";

export type Categoria = "servidor" | "rede" | "permissao" | "dados" | "integracao";
export type Gravidade = "critico" | "alto" | "medio" | "baixo";

export interface Falha {
  /** Onde falhou, no formato `modulo.operacao` — é a chave do dono. */
  origem: string;
  categoria: Categoria;
  gravidade: Gravidade;
  dono: Dono;
  mensagem: string;
  /** Código do servidor quando houver (`PGRST116`, `400`, …). */
  codigo?: string;
  /**
   * `true` quando o sistema seguiu por um caminho alternativo e o usuário não
   * viu problema nenhum. É a marca do erro que atravessa meses.
   */
  degradado: boolean;
  /** O que o usuário deixa de ter por causa disto, em uma frase. */
  impacto: string;
  quando: string;
}

/**
 * O MAPA DE DONOS, por prefixo de origem.
 *
 * ⚠️ Por prefixo e não por arquivo: o arquivo muda de lugar numa refatoração e
 * o mapa fica apontando para o vazio; o módulo de negócio não muda de dono
 * porque alguém moveu uma pasta.
 */
export const DONO_POR_MODULO: Record<string, Dono> = {
  movimentos: "financeiro",
  saldo: "financeiro",
  contas: "financeiro",
  titulos: "financeiro",
  conciliacao: "financeiro",
  pagamentos: "financeiro",
  recebimentos: "financeiro",
  razao: "contabilidade",
  fechamento: "contabilidade",
  dre: "relatorios",
  relatorio: "relatorios",
  orcamento: "relatorios",
  importacao: "ingestao",
  upload: "ingestao",
  ocr: "ingestao",
  contatos: "cadastros",
  produtos: "cadastros",
  cadastro: "cadastros",
  vendas: "vendas",
  nfse: "vendas",
  compras: "compras",
  ia: "ia",
  assistente: "ia",
  copiloto: "ia",
  plano: "plataforma",
  admin: "plataforma",
  estado: "plataforma",
  organizacao: "plataforma",
  integracao: "plataforma",
};

/**
 * ⚠️ Origem sem dono cai em `plataforma`, e isso NÃO é o mesmo que ter dono:
 * é o dono de última instância, exatamente para o alerta não ficar órfão
 * enquanto ninguém decide. A guarda cobra que os módulos conhecidos estejam no
 * mapa; o resto pousa aqui e aparece com esse rótulo, que é o convite a
 * classificar.
 */
export function donoDe(origem: string): Dono {
  const modulo = origem.split(".")[0];
  return DONO_POR_MODULO[modulo] ?? "plataforma";
}

/**
 * A gravidade pelo que se PERDE.
 *
 * `degradado` **agrava**: o erro que o usuário não vê é o que ninguém reporta,
 * e por isso precisa gritar mais alto no painel de quem mantém, não menos.
 */
export function gravidadeDe(cat: Categoria, degradado: boolean): Gravidade {
  if (cat === "permissao") return "alto";
  if (cat === "servidor") return degradado ? "alto" : "critico";
  if (cat === "dados") return "alto";
  if (cat === "rede") return degradado ? "medio" : "alto";
  return "medio";
}

/** Classifica pelo que o cliente do Supabase / o `fetch` devolvem. */
export function classificar(e: unknown): { categoria: Categoria; codigo?: string; mensagem: string } {
  const err = e as { code?: string; status?: number; message?: string; name?: string } | null;
  const msg = err?.message ?? String(e ?? "erro sem mensagem");
  const codigo = err?.code ?? (err?.status != null ? String(err.status) : undefined);

  // ⚠️ Falha de rede não tem código: `TypeError: Failed to fetch` é o que o
  // navegador devolve quando o servidor sequer respondeu. Tratá-la como erro de
  // servidor mandaria o time olhar o log errado.
  if (err?.name === "TypeError" && /fetch|network|load failed/i.test(msg)) {
    return { categoria: "rede", mensagem: msg };
  }
  if (codigo === "401" || codigo === "403" || /permission|denied|rls|forbidden/i.test(msg)) {
    return { categoria: "permissao", codigo, mensagem: msg };
  }
  // PGRST2xx = requisição malformada para o PostgREST: coluna/relacionamento
  // que não existe. Foi exatamente este o 400 da dimensão de projeto.
  if (codigo?.startsWith("PGRST") || codigo === "400" || codigo === "404" || codigo === "422") {
    return { categoria: "dados", codigo, mensagem: msg };
  }
  if (codigo && /^5\d\d$/.test(codigo)) return { categoria: "servidor", codigo, mensagem: msg };
  return { categoria: "servidor", codigo, mensagem: msg };
}

export interface EntradaDeFalha {
  origem: string;
  erro: unknown;
  /** O que o usuário deixa de ter. Obrigatório: sem isso o alerta não decide nada. */
  impacto: string;
  degradado?: boolean;
  quando: string;
}

export function montarFalha(e: EntradaDeFalha): Falha {
  const { categoria, codigo, mensagem } = classificar(e.erro);
  const degradado = e.degradado ?? false;
  return {
    origem: e.origem,
    categoria,
    codigo,
    mensagem,
    degradado,
    impacto: e.impacto,
    dono: donoDe(e.origem),
    gravidade: gravidadeDe(categoria, degradado),
    quando: e.quando,
  };
}

/** Agrupa por dono — a leitura de quem vai agir. */
export function porDono(falhas: readonly Falha[]): { dono: Dono; falhas: Falha[] }[] {
  const mapa = new Map<Dono, Falha[]>();
  for (const f of falhas) mapa.set(f.dono, [...(mapa.get(f.dono) ?? []), f]);
  return Array.from(mapa.entries())
    .map(([dono, fs]) => ({ dono, falhas: fs }))
    .sort((a, b) => b.falhas.length - a.falhas.length);
}

const PESO: Record<Gravidade, number> = { critico: 0, alto: 1, medio: 2, baixo: 3 };

/**
 * O que precisa de alerta AGORA.
 *
 * ⚠️ Deduplicado por origem: vinte falhas da mesma consulta são um problema,
 * não vinte. Um painel que lista as vinte esconde os outros três problemas que
 * estão embaixo delas.
 */
export function paraAlertar(falhas: readonly Falha[]): Falha[] {
  const vistas = new Set<string>();
  return [...falhas]
    .sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade])
    .filter((f) => {
      if (f.gravidade === "baixo" || vistas.has(f.origem)) return false;
      vistas.add(f.origem);
      return true;
    });
}
