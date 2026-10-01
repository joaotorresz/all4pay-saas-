/**
 * ESTRUTURA E CADASTROS — a ordem de dependência dos cadastros e o que falta
 * para começar a lançar.
 *
 * ⚠️ **Os nove cadastros ficam espalhados pelo menu, onde são usados** (contas
 * em Caixa e bancos, clientes em Vender, fornecedores em Comprar, plano de
 * contas em Contabilidade…), e é assim que deve ser. O que faltava era UM lugar
 * que mostrasse a ORDEM: uma conta a pagar exige conta bancária, categoria FOLHA
 * de despesa e fornecedor — e quem começa pelo lançamento descobre isso campo a
 * campo, com o formulário dizendo "selecione" para uma lista vazia.
 *
 * A ordem é a de dependência: cada nível só faz sentido depois do anterior.
 *   0 empresa → 1 contas → 2 plano de contas → 3 centros e projetos →
 *   4 clientes e fornecedores → 5 produtos e serviços → 6 contratos
 *
 * ⚠️ **O checklist separa BLOQUEIA de ATENÇÃO.** Sem conta ativa ou sem
 * categoria folha não há lançamento possível — o formulário não salva. Sem
 * linha do DRE o lançamento salva, mas o DRE classifica por palpite. Misturar
 * os dois numa lista só faria a pessoa tratar o palpite como impedimento, ou o
 * impedimento como detalhe.
 *
 * Puro, tipado, sem I/O: a tela entrega as contagens.
 */
import type { ContaBancaria } from "./index";
import type { CategoriaCadastro, CentroCustoCadastro, ProjetoCadastro } from "./hierarquia";
import { idsComFilhos } from "./hierarquia";

export const ESTRUTURA_VERSION = "estrutura-cadastros/1.0.0";

export interface EntradaEstrutura {
  empresa: { nome: string | null; regimeDeclarado: boolean };
  contas: readonly ContaBancaria[];
  categorias: readonly CategoriaCadastro[];
  centros: readonly CentroCustoCadastro[];
  projetos: readonly ProjetoCadastro[];
  clientes: number;
  fornecedores: number;
  produtos: number;
  servicos: number;
  contratos: number;
}

export interface NivelEstrutura {
  nivel: number;
  id: string;
  titulo: string;
  /** O que este nível responde — por que ele vem nesta posição. */
  porque: string;
  itens: { rotulo: string; quantidade: number | null; resumo: string; href: string }[];
}

export type Gravidade = "bloqueia" | "atencao";

export interface PendenciaEstrutura {
  id: string;
  gravidade: Gravidade;
  texto: string;
  href: string;
  acao: string;
}

const folhas = (cats: readonly CategoriaCadastro[]) => {
  const vivas = cats.filter((c) => c.ativo);
  const grupos = idsComFilhos(vivas);
  return vivas.filter((c) => !grupos.has(c.id));
};

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export function niveisDaEstrutura(e: EntradaEstrutura): NivelEstrutura[] {
  const contasAtivas = e.contas.filter((c) => c.ativo).length;
  const fs = folhas(e.categorias);
  const fReceita = fs.filter((c) => c.natureza === "receita").length;
  const fDespesa = fs.filter((c) => c.natureza === "despesa").length;
  const centrosAtivos = e.centros.filter((c) => c.ativo).length;
  const projetosAtivos = e.projetos.filter((p) => p.status === "ativo").length;
  return [
    {
      nivel: 0, id: "empresa", titulo: "Empresa",
      porque: "O regime tributário decide imposto e encargo de folha.",
      itens: [{
        rotulo: "Dados da empresa", quantidade: null,
        resumo: `${e.empresa.nome || "Sem razão social"} · ${e.empresa.regimeDeclarado ? "regime declarado" : "regime não declarado"}`,
        href: "/dashboard/administration/company-data",
      }],
    },
    {
      nivel: 1, id: "contas", titulo: "Contas bancárias",
      porque: "Todo dinheiro entra ou sai de uma conta.",
      itens: [{
        rotulo: "Contas bancárias", quantidade: e.contas.length,
        resumo: `${plural(contasAtivas, "ativa", "ativas")}${e.contas.length > contasAtivas ? ` · ${e.contas.length - contasAtivas} inativa(s)` : ""}`,
        href: "/dashboard/registrations/bank-accounts",
      }],
    },
    {
      nivel: 2, id: "plano", titulo: "Plano de contas",
      porque: "A categoria decide em que linha do resultado o lançamento cai.",
      itens: [{
        rotulo: "Plano de contas", quantidade: e.categorias.length,
        resumo: `${plural(fReceita, "folha de receita", "folhas de receita")} · ${plural(fDespesa, "folha de despesa", "folhas de despesa")}`,
        href: "/dashboard/registrations/chart-of-accounts",
      }],
    },
    {
      nivel: 3, id: "alocacao", titulo: "Centros de custo e projetos",
      porque: "Os recortes por área e por iniciativa — opcionais, mas só valem se existirem antes do lançamento.",
      itens: [
        { rotulo: "Centros de custo", quantidade: e.centros.length, resumo: plural(centrosAtivos, "ativo", "ativos"), href: "/dashboard/registrations/cost-centers" },
        { rotulo: "Projetos", quantidade: e.projetos.length, resumo: plural(projetosAtivos, "ativo", "ativos"), href: "/dashboard/registrations/projects" },
      ],
    },
    {
      nivel: 4, id: "partes", titulo: "Clientes e fornecedores",
      porque: "A contraparte de cada título — e a categoria padrão que preenche o lançamento.",
      itens: [
        { rotulo: "Clientes", quantidade: e.clientes, resumo: plural(e.clientes, "cadastrado", "cadastrados"), href: "/dashboard/registrations/clients" },
        { rotulo: "Fornecedores", quantidade: e.fornecedores, resumo: plural(e.fornecedores, "cadastrado", "cadastrados"), href: "/dashboard/registrations/suppliers" },
      ],
    },
    {
      nivel: 5, id: "catalogo", titulo: "Produtos e serviços",
      porque: "O que se vende — a venda e a nota fiscal partem daqui.",
      itens: [{
        rotulo: "Produtos e serviços", quantidade: e.produtos + e.servicos,
        resumo: `${plural(e.produtos, "produto", "produtos")} · ${plural(e.servicos, "serviço", "serviços")}`,
        href: "/dashboard/registrations/products",
      }],
    },
    {
      nivel: 6, id: "contratos", titulo: "Contratos",
      porque: "O compromisso que se repete — usa a parte, o produto, a conta e a categoria de cima.",
      itens: [{
        rotulo: "Contratos", quantidade: e.contratos, resumo: plural(e.contratos, "contrato", "contratos"),
        href: "/dashboard/registrations/contracts",
      }],
    },
  ];
}

/**
 * O que falta para LANÇAR — bloqueios primeiro.
 *
 * ⚠️ A ausência de pendência é afirmada, não inferida do silêncio: a lista
 * vazia é a resposta "dá para lançar", e a tela a escreve.
 */
export function pendenciasDaEstrutura(e: EntradaEstrutura): PendenciaEstrutura[] {
  const out: PendenciaEstrutura[] = [];
  const fs = folhas(e.categorias);
  if (!e.contas.some((c) => c.ativo)) {
    out.push({
      id: "sem-conta", gravidade: "bloqueia",
      texto: "Nenhuma conta bancária ativa — nenhum lançamento tem de onde sair ou para onde entrar.",
      href: "/dashboard/registrations/bank-accounts", acao: "Cadastrar conta",
    });
  }
  if (!fs.some((c) => c.natureza === "receita")) {
    out.push({
      id: "sem-receita", gravidade: "bloqueia",
      texto: "Nenhuma categoria de receita que receba lançamento (folha ativa) — conta a receber e venda não salvam.",
      href: "/dashboard/registrations/chart-of-accounts", acao: "Abrir plano de contas",
    });
  }
  if (!fs.some((c) => c.natureza === "despesa")) {
    out.push({
      id: "sem-despesa", gravidade: "bloqueia",
      texto: "Nenhuma categoria de despesa que receba lançamento (folha ativa) — conta a pagar e compra não salvam.",
      href: "/dashboard/registrations/chart-of-accounts", acao: "Abrir plano de contas",
    });
  }
  const semLinha = fs.filter((c) => !c.dreLinha);
  if (semLinha.length > 0) {
    out.push({
      id: "sem-linha-dre", gravidade: "atencao",
      texto: `${plural(semLinha.length, "categoria sem linha do DRE", "categorias sem linha do DRE")} — os lançamentos nelas são classificados por palpite (${semLinha.slice(0, 3).map((c) => c.nome).join(", ")}${semLinha.length > 3 ? "…" : ""}).`,
      href: "/dashboard/registrations/chart-of-accounts", acao: "Declarar a linha",
    });
  }
  if (!e.empresa.regimeDeclarado) {
    out.push({
      id: "sem-regime", gravidade: "atencao",
      texto: "Regime tributário não declarado — impostos e encargos de folha saem do cenário mais caro.",
      href: "/dashboard/administration/company-data", acao: "Declarar regime",
    });
  }
  const semAbertura = e.contas.filter((c) => c.ativo && !c.saldoInicialConferido);
  if (semAbertura.length > 0 && e.contas.some((c) => c.ativo)) {
    out.push({
      id: "sem-abertura", gravidade: "atencao",
      texto: `${plural(semAbertura.length, "conta sem saldo de abertura conferido", "contas sem saldo de abertura conferido")} — o Razão não fecha com o extrato até ele existir.`,
      href: "/dashboard/registrations/bank-accounts", acao: "Informar saldo",
    });
  }
  if (e.clientes === 0) {
    out.push({
      id: "sem-cliente", gravidade: "atencao",
      texto: "Nenhum cliente cadastrado — a conta a receber pede um.",
      href: "/dashboard/registrations/clients", acao: "Cadastrar cliente",
    });
  }
  if (e.fornecedores === 0) {
    out.push({
      id: "sem-fornecedor", gravidade: "atencao",
      texto: "Nenhum fornecedor cadastrado — a conta a pagar pede um.",
      href: "/dashboard/registrations/suppliers", acao: "Cadastrar fornecedor",
    });
  }
  return out.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === "bloqueia" ? -1 : 1));
}
