"use client";

/**
 * CADASTROS NA HIERARQUIA — o ÚNICO leitor e escritor de contas bancárias,
 * centros de custo, projetos, plano de contas e uso padrão.
 *
 * ⚠️ **A morada é a TABELA** (migration `20260930180000`):
 *
 *   | cadastro        | produção                | demonstração                  |
 *   | --------------- | ----------------------- | ----------------------------- |
 *   | contas          | `financial_accounts`    | `accounts` do dataset         |
 *   | plano de contas | `categories`            | `cadastros.categories`        |
 *   | centros         | `cost_centers`          | `cadastros.cost_centers`      |
 *   | projetos        | `projects`              | `cadastros.projects`          |
 *   | uso padrão      | `categoria_uso_padrao`  | `cadastros.usos`              |
 *
 * Antes moravam em `org_state`/`localStorage` com id NUMÉRICO, e os lançamentos
 * apontam para UUID: a tela de contas dizia "Nenhuma conta cadastrada" com
 * quatro contas existindo, e um projeto escolhido num lançamento era recusado
 * em produção sem saída ("abra Cadastros e crie-o de novo" — só que Cadastros
 * gravava no mesmo navegador).
 *
 * ⚠️ **Todo escritor LANÇA o erro do banco**, com a frase dele. Um escritor de
 * cadastro que engole erro faz a tela dizer "salvo" sobre uma linha que não
 * existe — e o lançamento seguinte aponta para o nada.
 *
 * ⚠️ **O cadastro ANTIGO não é migrado sozinho.** `pendenciasAntigas` lista o
 * que existe no navegador e não existe na tabela; a tela oferece "Trazer para o
 * cadastro", e é a pessoa quem decide. As chaves antigas continuam só LIDAS.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { excluirLogico } from "@/lib/exclusao";
import {
  DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_COST_CENTERS, DEMO_MOVEMENTS,
} from "@/lib/demo/seed";
import {
  importedAccounts, importedCadastros, importedMovements,
  gravarCadastrosDemo, gravarContaDemo,
} from "@/lib/imported";
import { listContasBancarias as contasAntigasLocais, listPlanoContas, listUsosPadrao as usosAntigosLocais } from "@/lib/registros";
import { listCentrosCusto as centrosAntigosLocais, listProjetos as projetosAntigosLocais } from "@/lib/iuli-cadastros";
import { validarContaBancaria, normalizar, type ContaBancaria, type CategoriaPlano } from "@/core/registros";
import {
  contaDaLinha, linhaDaConta, categoriaDaLinha, linhaDaCategoria, centroDaLinha,
  linhaDoCentro, projetoDaLinha, linhaDoProjeto, validarCategoria, validarCentro,
  validarProjeto, contaComNomeRepetido, problemaDoGrupo, problemaDaExclusao,
  ordemDeExclusao, contasAntigas, contaCompletada, centrosAntigos, projetosAntigos,
  categoriasAntigas, slugDoBanco, planoDeDeclaracao, type ItemDeclaracao,
  type LinhaConta, type LinhaCategoria, type LinhaCentro, type LinhaProjeto,
  type CategoriaCadastro, type CentroCustoCadastro, type ProjetoCadastro,
  type StatusProjeto, type PendenciaAntiga,
} from "@/core/registros/hierarquia";

export type { CategoriaCadastro, CentroCustoCadastro, ProjetoCadastro, StatusProjeto, PendenciaAntiga };

/* ================================ o erro do banco ================================ */

interface ErroPostgrest { message?: string; code?: string; details?: string | null; hint?: string | null }

/**
 * As restrições da migration, em português. ⚠️ Só a tradução do NOME da
 * restrição: a mensagem do Postgres ("duplicate key value violates unique
 * constraint …") não diz a quem opera o que fazer. Gatilho (`A4P05`) já fala
 * português, e a mensagem + o `hint` dele vão inteiros para a tela.
 */
const RESTRICOES: Record<string, string> = {
  financial_accounts_org_nome_unico: "Já existe uma conta com este nome nesta empresa.",
  financial_accounts_dias_do_cartao: "Cartão de crédito precisa dos dias de fechamento e de vencimento da fatura, entre 1 e 31.",
  financial_accounts_tipo_valido: "Tipo de conta desconhecido.",
  financial_accounts_conferido_tem_saldo: "Para marcar o saldo de abertura como conferido, informe o valor e a data.",
  categories_org_pai_nome_unico: "Já existe uma categoria com este nome neste grupo.",
  categories_org_codigo_unico: "Este código já é de outra categoria.",
  cost_centers_org_codigo_unico: "Este código já é de outro centro de custo.",
  projects_org_name_unique: "Já existe um projeto com este nome.",
  projects_status_valido: "Situação de projeto desconhecida.",
  parties_org_doc_unico: "Já existe um contato com este CPF/CNPJ nesta empresa.",
};

/** O erro do banco como a pessoa precisa lê-lo — sem perder o original. */
export function erroDoBanco(e: ErroPostgrest | null | undefined): Error {
  const msg = e?.message ?? "O banco recusou a gravação.";
  const restricao = Object.keys(RESTRICOES).find((r) => msg.includes(r) || (e?.details ?? "").includes(r));
  const texto = restricao
    ? RESTRICOES[restricao]
    : `${msg}${e?.hint ? ` ${e.hint}` : ""}`;
  const erro = new Error(texto);
  (erro as Error & { codigo?: string; original?: string }).codigo = e?.code;
  (erro as Error & { codigo?: string; original?: string }).original = msg;
  return erro;
}

const primeiroErro = (e: Record<string, string>): Error | null => {
  const k = Object.keys(e);
  return k.length ? new Error(e[k[0]]) : null;
};

const novoIdDemo = (prefixo: string) =>
  `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ================================ contas bancárias ================================ */

const COLS_CONTA =
  "id,name,bank,balance,tipo,agencia,numero,codigo_contabil,dia_fechamento,dia_vencimento,saldo_inicial,data_saldo_inicial,saldo_inicial_conferido,ativo";

export async function listarContasBancarias(): Promise<ContaBancaria[]> {
  if (isDemo) return (importedAccounts() ?? DEMO_ACCOUNTS).map((a) => contaDaLinha(a as LinhaConta));
  const { data, error } = await createClient()
    .from("financial_accounts").select(COLS_CONTA).order("name").limit(TETO_LINHAS);
  if (error) throw erroDoBanco(error);
  return ((data ?? []) as LinhaConta[]).map(contaDaLinha);
}

/**
 * Cria (sem id) ou edita (com id) uma conta.
 *
 * ⚠️ O saldo CORRENTE (`balance`) só nasce do saldo de abertura na CRIAÇÃO — uma
 * conta nova não tem movimento nenhum, então o que ela tem é o que foi aberto.
 * Na edição ele NÃO é tocado: quem move saldo é a baixa e a conciliação, e
 * corrigir a agência não pode mudar o dinheiro da empresa.
 */
export async function salvarContaBancaria(c: ContaBancaria): Promise<ContaBancaria> {
  const invalida = primeiroErro(validarContaBancaria(c));
  if (invalida) throw invalida;
  const linha = linhaDaConta(c);

  if (isDemo) {
    const todas = await listarContasBancarias();
    if (contaComNomeRepetido(c, todas)) throw new Error("Já existe uma conta com este nome nesta empresa.");
    const atual = c.id ? todas.find((x) => x.id === c.id) : undefined;
    const id = atual?.id ?? novoIdDemo("acc");
    const balance = atual ? (atual.saldoAtual ?? 0) : (linha.saldo_inicial ?? 0);
    gravarContaDemo({ id, balance, ...linha, bank: linha.bank || "outro" });
    return contaDaLinha({ id, balance, ...linha });
  }

  const supabase = createClient();
  const q = c.id
    ? supabase.from("financial_accounts").update(linha).eq("id", c.id)
    : supabase.from("financial_accounts").insert({ ...linha, balance: linha.saldo_inicial ?? 0 });
  const { data, error } = await q.select(COLS_CONTA).single();
  if (error) throw erroDoBanco(error);
  return contaDaLinha(data as LinhaConta);
}

/**
 * ⚠️ DESATIVAR, não excluir. Uma conta com histórico não some: ela sai das
 * escolhas e o banco recusa lançamento NOVO nela (gatilho
 * `lancamento_cadastro_vigente`), enquanto o extrato, o DRE e o razão continuam
 * enxergando tudo o que passou por ela.
 */
export async function definirContaAtiva(id: string, ativo: boolean): Promise<void> {
  if (isDemo) {
    const a = (importedAccounts() ?? DEMO_ACCOUNTS).find((x) => x.id === id);
    if (!a) throw new Error("Conta não encontrada.");
    gravarContaDemo({ ...a, ativo });
    return;
  }
  const { error } = await createClient().from("financial_accounts").update({ ativo }).eq("id", id);
  if (error) throw erroDoBanco(error);
}

/* ================================ plano de contas ================================ */

const COLS_CATEGORIA = "id,kind,name,parent_id,code,dre_linha,active";

const categoriasDoSeed = (): (LinhaCategoria & { id: string })[] =>
  DEMO_CATEGORIES.map((c) => ({ id: c.id, kind: c.kind, name: c.name, parent_id: null, code: null, dre_linha: null, active: true }));

const categoriasDemo = (): (LinhaCategoria & { id: string })[] =>
  importedCadastros()?.categories ?? categoriasDoSeed();

/** A árvore inteira (grupos e folhas, ativas e inativas). */
export async function listarCategorias(): Promise<CategoriaCadastro[]> {
  if (isDemo) return categoriasDemo().map(categoriaDaLinha);
  const { data, error } = await createClient()
    .from("categories").select(COLS_CATEGORIA).order("name").limit(TETO_LINHAS);
  if (error) throw erroDoBanco(error);
  return ((data ?? []) as LinhaCategoria[]).map(categoriaDaLinha);
}

/**
 * Quantos lançamentos (título, rateio, recorrência) apontam para a categoria —
 * a MESMA conta do gatilho `categoria_lancamentos`.
 *
 * ⚠️ Conta a amostra JUNTO (`"incluir-amostra"`), de propósito: o banco recusa
 * a exclusão por qualquer linha viva, inclusive a de demonstração, e contar
 * menos do que o banco conta faria a tela prometer uma exclusão que ele recusa.
 */
export async function contarLancamentosDaCategoria(id: string): Promise<number> {
  if (isDemo) {
    const cat = categoriasDemo().find((c) => c.id === id);
    const nome = normalizar(cat?.name ?? "").trim();
    return (importedMovements() ?? DEMO_MOVEMENTS).filter((m) => {
      const mm = m as { category_id?: string | null; category?: string | null };
      return mm.category_id === id || (!!nome && normalizar(mm.category ?? "").trim() === nome);
    }).length;
  }
  const supabase = createClient();
  const contar = async (tabela: "movements" | "movement_splits" | "recurrences") => {
    const { count, error } = await semAmostra(
      supabase.from(tabela).select("id", { count: "exact", head: true }), "incluir-amostra",
    ).eq("category_id", id).limit(TETO_LINHAS);
    if (error) throw erroDoBanco(error);
    return count ?? 0;
  };
  const [a, b, c] = await Promise.all([contar("movements"), contar("movement_splits"), contar("recurrences")]);
  return a + b + c;
}

/**
 * Cria ou edita uma categoria. ⚠️ A NATUREZA DE QUEM TEM GRUPO É A DO GRUPO —
 * imposta aqui, e cobrada de novo pelo gatilho `categoria_arvore_coerente`:
 * uma despesa dentro de um grupo de receita entraria na linha errada do DRE.
 */
export async function salvarCategoria(entrada: CategoriaCadastro): Promise<CategoriaCadastro> {
  const todas = await listarCategorias();
  const pai = entrada.paiId ? todas.find((x) => x.id === entrada.paiId) : undefined;
  const c: CategoriaCadastro = { ...entrada, natureza: pai?.natureza ?? entrada.natureza };
  const invalida = primeiroErro(validarCategoria(c, todas));
  if (invalida) throw invalida;
  const linha = linhaDaCategoria(c);

  if (isDemo) {
    const anterior = c.id ? todas.find((x) => x.id === c.id) : undefined;
    const paiMudou = !!c.paiId && (!anterior || anterior.paiId !== c.paiId);
    if (pai && paiMudou) {
      const p = problemaDoGrupo(pai, await contarLancamentosDaCategoria(pai.id));
      if (p) throw new Error(p);
    }
    const id = anterior?.id ?? novoIdDemo("cat");
    const lista = categoriasDemo();
    const nova = { id, ...linha };
    gravarCadastrosDemo({
      categories: anterior ? lista.map((x) => (x.id === id ? nova : x)) : [...lista, nova],
    });
    return categoriaDaLinha(nova);
  }

  const supabase = createClient();
  const q = c.id
    ? supabase.from("categories").update(linha).eq("id", c.id)
    : supabase.from("categories").insert(linha);
  const { data, error } = await q.select(COLS_CATEGORIA).single();
  if (error) throw erroDoBanco(error);
  return categoriaDaLinha(data as LinhaCategoria);
}

/**
 * Grava as linhas confirmadas na tela de palpite do DRE — pelo MESMO escritor
 * do Plano de contas (`salvarCategoria`), uma categoria por vez, e devolve
 * quantas foram gravadas e quais o banco recusou (com o motivo).
 */
export async function declararLinhas(itens: readonly ItemDeclaracao[]): Promise<{ gravadas: number; recusadas: { nome: string; motivo: string }[] }> {
  const todas = await listarCategorias();
  const plano = planoDeDeclaracao(itens, todas);
  let gravadas = 0;
  const recusadas: { nome: string; motivo: string }[] = [];
  for (const p of plano) {
    const atual = p.id ? todas.find((c) => c.id === p.id) : undefined;
    try {
      await salvarCategoria(atual
        ? { ...atual, dreLinha: p.linha }
        : { id: "", nome: p.nome, codigo: "", natureza: p.natureza, paiId: null, dreLinha: p.linha, ativo: true });
      gravadas++;
    } catch (e) {
      recusadas.push({ nome: p.nome, motivo: e instanceof Error ? e.message : String(e) });
    }
  }
  return { gravadas, recusadas };
}

export async function definirCategoriaAtiva(id: string, ativo: boolean): Promise<void> {
  if (isDemo) {
    gravarCadastrosDemo({ categories: categoriasDemo().map((x) => (x.id === id ? { ...x, active: ativo } : x)) });
    return;
  }
  const { error } = await createClient().from("categories").update({ active: ativo }).eq("id", id);
  if (error) throw erroDoBanco(error);
}

/**
 * Manda a categoria (e as subcategorias, se for grupo) para a lixeira.
 *
 * ⚠️ CONTA ANTES, e diz quantos. Com lançamento, recusa — antes da rede, com o
 * número — e o banco recusa de novo se alguém pular esta função
 * (`categoria_exclusao`). O caminho para "parar de usar" é DESATIVAR.
 * A ordem é das folhas para o grupo: o banco não deixa o grupo ir antes das
 * filhas.
 */
export async function excluirCategoria(id: string): Promise<number> {
  const todas = await listarCategorias();
  const cat = todas.find((c) => c.id === id);
  if (!cat) throw new Error("Categoria não encontrada.");
  const ordem = ordemDeExclusao(todas, id);
  let lancamentos = 0;
  for (const x of ordem) lancamentos += await contarLancamentosDaCategoria(x);
  if (lancamentos > 0) {
    throw new Error(
      ordem.length > 1
        ? `"${cat.nome}" e as subcategorias têm ${lancamentos} lançamento(s) e não podem ir para a lixeira. Desative para tirá-las das escolhas sem perder o histórico.`
        : `${problemaDaExclusao(cat, [], lancamentos)} Desative a categoria para ela sair das escolhas sem perder o histórico.`,
    );
  }
  if (isDemo) {
    const fora = new Set(ordem);
    gravarCadastrosDemo({ categories: categoriasDemo().filter((x) => !fora.has(x.id)) });
    return ordem.length;
  }
  for (const x of ordem) await excluirLogico("categories", x, "Excluída no plano de contas");
  return ordem.length;
}

/* ---------------------------------- uso padrão ---------------------------------- */

export async function listarUsosPadrao(): Promise<Record<string, string>> {
  if (isDemo) return { ...(importedCadastros()?.usos ?? {}) };
  const { data, error } = await createClient()
    .from("categoria_uso_padrao").select("funcao,category_id").limit(TETO_LINHAS);
  if (error) throw erroDoBanco(error);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { funcao: string; category_id: string | null }[]) {
    if (r.category_id) out[r.funcao] = r.category_id;
  }
  return out;
}

/** `null` desfaz a escolha (a linha fica, com a categoria vazia — sem DELETE). */
export async function definirUsoPadrao(funcao: string, categoriaId: string | null): Promise<void> {
  if (isDemo) {
    const usos = { ...(importedCadastros()?.usos ?? {}) };
    if (categoriaId) usos[funcao] = categoriaId; else delete usos[funcao];
    gravarCadastrosDemo({ usos });
    return;
  }
  const { error } = await createClient()
    .from("categoria_uso_padrao")
    .upsert({ funcao, category_id: categoriaId }, { onConflict: "org_id,funcao" });
  if (error) throw erroDoBanco(error);
}

/* ================================ centros de custo ================================ */

const COLS_CENTRO = "id,name,active,code,codigo_contabil,parent_id,description";

const centrosDemo = (): (LinhaCentro & { id: string })[] =>
  importedCadastros()?.cost_centers
  ?? DEMO_COST_CENTERS.map((c) => ({ id: c.id, name: c.name, active: true, code: null, codigo_contabil: null, parent_id: null, description: null }));

export async function listarCentrosCusto(): Promise<CentroCustoCadastro[]> {
  if (isDemo) return centrosDemo().map(centroDaLinha);
  const { data, error } = await createClient()
    .from("cost_centers").select(COLS_CENTRO).order("name").limit(TETO_LINHAS);
  if (error) throw erroDoBanco(error);
  return ((data ?? []) as LinhaCentro[]).map(centroDaLinha);
}

export async function salvarCentroCusto(c: CentroCustoCadastro): Promise<CentroCustoCadastro> {
  const todos = await listarCentrosCusto();
  const invalido = primeiroErro(validarCentro(c, todos));
  if (invalido) throw invalido;
  const linha = linhaDoCentro(c);
  if (isDemo) {
    const anterior = c.id ? todos.find((x) => x.id === c.id) : undefined;
    const id = anterior?.id ?? novoIdDemo("cc");
    const lista = centrosDemo();
    const novo = { id, ...linha };
    gravarCadastrosDemo({ cost_centers: anterior ? lista.map((x) => (x.id === id ? novo : x)) : [...lista, novo] });
    return centroDaLinha(novo);
  }
  const supabase = createClient();
  const q = c.id
    ? supabase.from("cost_centers").update(linha).eq("id", c.id)
    : supabase.from("cost_centers").insert(linha);
  const { data, error } = await q.select(COLS_CENTRO).single();
  if (error) throw erroDoBanco(error);
  return centroDaLinha(data as LinhaCentro);
}

export async function definirCentroAtivo(id: string, ativo: boolean): Promise<void> {
  if (isDemo) {
    gravarCadastrosDemo({ cost_centers: centrosDemo().map((x) => (x.id === id ? { ...x, active: ativo } : x)) });
    return;
  }
  const { error } = await createClient().from("cost_centers").update({ active: ativo }).eq("id", id);
  if (error) throw erroDoBanco(error);
}

/* ==================================== projetos ==================================== */

const COLS_PROJETO =
  "id,name,code,description,start_date,end_date,planned_revenue,planned_expense,party_id,cost_center_id,status";

const projetosDemo = (): (LinhaProjeto & { id: string })[] => importedCadastros()?.projects ?? [];

export async function listarProjetos(): Promise<ProjetoCadastro[]> {
  if (isDemo) return projetosDemo().map(projetoDaLinha);
  const { data, error } = await createClient()
    .from("projects").select(COLS_PROJETO).order("name").limit(TETO_LINHAS);
  if (error) throw erroDoBanco(error);
  return ((data ?? []) as LinhaProjeto[]).map(projetoDaLinha);
}

export async function salvarProjeto(p: ProjetoCadastro): Promise<ProjetoCadastro> {
  const todos = await listarProjetos();
  const invalido = primeiroErro(validarProjeto(p, todos));
  if (invalido) throw invalido;
  const linha = linhaDoProjeto(p);
  if (isDemo) {
    const anterior = p.id ? todos.find((x) => x.id === p.id) : undefined;
    const id = anterior?.id ?? novoIdDemo("prj");
    const lista = projetosDemo();
    const novo = { id, ...linha };
    gravarCadastrosDemo({ projects: anterior ? lista.map((x) => (x.id === id ? novo : x)) : [...lista, novo] });
    return projetoDaLinha(novo);
  }
  const supabase = createClient();
  const q = p.id
    ? supabase.from("projects").update(linha).eq("id", p.id)
    : supabase.from("projects").insert(linha);
  const { data, error } = await q.select(COLS_PROJETO).single();
  if (error) throw erroDoBanco(error);
  return projetoDaLinha(data as LinhaProjeto);
}

/** Encerrar é DECLARADO: o banco recusa lançamento NOVO em projeto encerrado. */
export async function definirStatusProjeto(id: string, status: StatusProjeto): Promise<void> {
  if (isDemo) {
    gravarCadastrosDemo({ projects: projetosDemo().map((x) => (x.id === id ? { ...x, status } : x)) });
    return;
  }
  const { error } = await createClient().from("projects").update({ status }).eq("id", id);
  if (error) throw erroDoBanco(error);
}

/* ========================= o cadastro ANTIGO deste navegador ========================= */

/**
 * O que o navegador ainda guarda nas moradas antigas e a tabela não tem.
 * ⚠️ Só LÊ as chaves antigas — nenhuma tela escreve mais nelas.
 */
export function pendenciasAntigas(
  tipo: "contas" | "centros" | "projetos" | "categorias",
  atuais: { contas?: ContaBancaria[]; centros?: CentroCustoCadastro[]; projetos?: ProjetoCadastro[]; categorias?: CategoriaCadastro[] },
): PendenciaAntiga[] {
  if (typeof window === "undefined") return [];
  try {
    if (tipo === "contas") return contasAntigas(contasAntigasLocais(), atuais.contas ?? []);
    if (tipo === "centros") return centrosAntigos(centrosAntigosLocais(), atuais.centros ?? []);
    if (tipo === "projetos") return projetosAntigos(projetosAntigosLocais(), atuais.projetos ?? []);
    return categoriasAntigas(listPlanoContas(), atuais.categorias ?? []);
  } catch {
    // Chave antiga corrompida não impede a tela nova de abrir.
    return [];
  }
}

const idDaChave = (chave: string) => chave.slice(chave.indexOf(":") + 1);

/**
 * "Trazer para o cadastro": cria na tabela o que só existia no navegador, ou
 * completa o registro que já existe com o dado que só o antigo tinha. É uma
 * ação da PESSOA, um item por vez — nunca em lote automático.
 */
export async function trazerAntigo(p: PendenciaAntiga): Promise<string> {
  const idAntigo = idDaChave(p.chave);

  if (p.chave.startsWith("conta:")) {
    const antiga = contasAntigasLocais().find((c) => c.id === idAntigo);
    if (!antiga) throw new Error("O cadastro antigo desta conta não está mais neste navegador.");
    const base = { ...antiga, banco: slugDoBanco(antiga.banco) || "outro" };
    if (p.acao === "criar") {
      await salvarContaBancaria({ ...base, id: "" });
      return `Conta "${antiga.nome}" trazida para o cadastro.`;
    }
    const atual = (await listarContasBancarias()).find((c) => c.id === p.alvoId);
    if (!atual) throw new Error("A conta que seria completada não existe mais.");
    await salvarContaBancaria(contaCompletada(atual, base));
    return `Conta "${atual.nome}" completada com ${p.campos.join(", ")}.`;
  }

  if (p.chave.startsWith("centro:")) {
    const antigo = centrosAntigosLocais().find((c) => c.id === idAntigo);
    if (!antigo) throw new Error("O cadastro antigo deste centro não está mais neste navegador.");
    if (p.acao === "criar") {
      await salvarCentroCusto({ ...antigo, id: "", paiId: null });
      return `Centro "${antigo.nome}" trazido para o cadastro.`;
    }
    const atual = (await listarCentrosCusto()).find((c) => c.id === p.alvoId);
    if (!atual) throw new Error("O centro que seria completado não existe mais.");
    await salvarCentroCusto({
      ...atual,
      codigo: atual.codigo || antigo.codigo,
      codigoContabil: atual.codigoContabil || antigo.codigoContabil,
      descricao: atual.descricao || antigo.descricao,
    });
    return `Centro "${atual.nome}" completado com ${p.campos.join(", ")}.`;
  }

  if (p.chave.startsWith("projeto:")) {
    const antigo = projetosAntigosLocais().find((x) => x.id === idAntigo);
    if (!antigo) throw new Error("O cadastro antigo deste projeto não está mais neste navegador.");
    if (p.acao === "criar") {
      await salvarProjeto({ ...antigo, id: "", clienteId: null, centroId: null, status: "ativo" });
      return `Projeto "${antigo.nome}" trazido para o cadastro.`;
    }
    const atual = (await listarProjetos()).find((x) => x.id === p.alvoId);
    if (!atual) throw new Error("O projeto que seria completado não existe mais.");
    await salvarProjeto({
      ...atual,
      codigo: atual.codigo || antigo.codigo,
      dataInicial: atual.dataInicial || antigo.dataInicial,
      dataFinal: atual.dataFinal || antigo.dataFinal,
      previsaoReceita: atual.previsaoReceita || antigo.previsaoReceita,
      previsaoDespesa: atual.previsaoDespesa || antigo.previsaoDespesa,
    });
    return `Projeto "${atual.nome}" completado com ${p.campos.join(", ")}.`;
  }

  // categoria
  const plano = listPlanoContas();
  const antiga = plano.find((c) => c.id === idAntigo);
  if (!antiga) throw new Error("A categoria antiga não está mais neste navegador.");
  if (p.acao === "completar") {
    const atual = (await listarCategorias()).find((c) => c.id === p.alvoId);
    if (!atual) throw new Error("A categoria que seria completada não existe mais.");
    await salvarCategoria({ ...atual, codigo: atual.codigo || antiga.codigo, dreLinha: atual.dreLinha || antiga.dreLinha });
    return `Categoria "${atual.nome}" completada com ${p.campos.join(", ")}.`;
  }
  // criar — com o grupo antes, se o antigo tinha grupo e a tabela não
  let paiId: string | null = null;
  const paiAntigo: CategoriaPlano | undefined = antiga.paiId ? plano.find((c) => c.id === antiga.paiId) : undefined;
  if (paiAntigo) {
    const atuais = await listarCategorias();
    const existente = atuais.find((c) => c.natureza === paiAntigo.natureza && normalizar(c.nome).trim() === normalizar(paiAntigo.nome).trim());
    paiId = existente?.id ?? (await salvarCategoria({
      id: "", nome: paiAntigo.nome, codigo: paiAntigo.codigo, natureza: paiAntigo.natureza,
      paiId: null, dreLinha: paiAntigo.dreLinha, ativo: true,
    })).id;
  }
  await salvarCategoria({
    id: "", nome: antiga.nome, codigo: antiga.codigo, natureza: antiga.natureza,
    paiId, dreLinha: antiga.dreLinha, ativo: true,
  });
  return `Categoria "${antiga.nome}" trazida para o plano de contas.`;
}

/**
 * O uso padrão ANTIGO apontava para o id LOCAL do plano; traduz pelo NOME da
 * categoria. Devolve só o que casa com uma folha do plano novo e ainda não foi
 * escolhido lá.
 */
export function usosAntigos(categorias: readonly CategoriaCadastro[], atuais: Record<string, string>): { funcao: string; categoriaId: string; nome: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const plano = listPlanoContas();
    const out: { funcao: string; categoriaId: string; nome: string }[] = [];
    for (const [funcao, idLocal] of Object.entries(usosAntigosLocais())) {
      if (atuais[funcao]) continue;
      const local = plano.find((c) => c.id === idLocal);
      if (!local) continue;
      const nova = categorias.find((c) => c.natureza === local.natureza && normalizar(c.nome).trim() === normalizar(local.nome).trim());
      if (nova) out.push({ funcao, categoriaId: nova.id, nome: nova.nome });
    }
    return out;
  } catch {
    return [];
  }
}
