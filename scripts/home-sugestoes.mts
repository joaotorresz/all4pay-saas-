/**
 * home-sugestoes — a guarda das sugestões da caixa da Quattro AI na Home
 * (`core/home/sugestoes`, etapa 1 da Home adaptativa).
 *
 * Cobra: o catálogo tem 30+ perguntas de empresa sem repetição; nunca passam
 * de seis; no máximo duas por tema; o contexto MUDA a lista (caixa negativo,
 * SaaS, primeiro uso, pessoa física); e sinal ausente não dispara regra.
 *
 * Etapa 2: a ordem da Quattro AI é DADO DE FORA. Id inventado, de outro
 * público, básico, repetido ou desligado por sinal ausente não entra; o teto
 * por tema vale para ela também; e a falha cai na ordem das regras.
 *
 * Etapa 3: a descrição livre do onboarding. Ela muda a lista por palavras
 * ANCORADAS (sem acento, por público), pesa menos que a prioridade marcada e
 * não soma duas vezes com ela; sai para a IA só saneada (segredos cobertos,
 * teto de tamanho, vazio = null) — no cliente E na rota, que a trata como
 * informação, nunca instrução.
 *
 * Etapa 4: prioridades e cliques no SERVIDOR, num mapa usuário → preferências.
 * Gravar uma pessoa não toca nos colegas; dado torto vira ausente (nunca
 * "pulei"); nada sobe antes de o servidor responder nem sem usuário; a cópia
 * do dispositivo mescla pelo MAIOR clique, sem contar duas vezes.
 *
 * Etapa 5: o que a pessoa IGNORA desce. Uma vez por dia conta; três dias são
 * de graça; o desconto tem teto ABAIXO da urgência; o dia de hoje só conta
 * amanhã (a lista não mexe diante de quem olha); duas semanas sem aparecer
 * devolvem a chance; o clique zera; o desconto reordena, nunca ressuscita o
 * que um sinal ausente desligou; e nem a IA traz de volta a pergunta cansada.
 *
 * Ajustar prioridades pela conversa: o pedido digitado vira AÇÕES sobre os
 * itens do catálogo da Home (primeiro, último, mostrar, esconder, restaurar).
 * "Fluxo de caixa" é o relatório, não o caixa; "tira" esconde; id ou tipo
 * inventado pela IA não passa; nenhum item some da ordem; o chat só anuncia
 * o que DE FATO mudou; o arranjo segue a pessoa (servidor vence o
 * dispositivo) e quem arrastou antes não perde a ordem.
 *
 *   npm run home-sugestoes   (também roda dentro de npm test)
 */
import {
  BASICAS, CANDIDATAS_IA, CATALOGO_SUGESTOES, ROTULOS, INTERESSES, LIMITE_SUGESTOES, MAX_POR_TEMA, TETO_DESCRICAO, candidatasParaIA, contextoParaIA,
  DIAS_DE_GRACA, JANELA_IGNORADA, TETO_IGNORADA, cansada, descontoPorIgnorar,
  descricaoParaIA, interessesDaDescricao, recomendarSugestoes, sinaisDaHome,
  type SinaisHome,
} from "@/core/home/sugestoes";
import {
  comPreferencias, mesclarComDispositivo, mesmasPreferencias, normalizarPreferencias, podeEnviarPreferencias,
  preferenciasDoUsuario, registrarClique, registrarExibicao,
} from "@/core/home/preferencias";
import { montarHomeSnapshot } from "@/core/home/snapshot";
import {
  ITENS_HOME, LAYOUT_PADRAO, aplicarAcoes, descreverMudancas, faixasDoPainel, interpretarPedido, itensCitados,
  layoutDasOrdensAntigas, moverItem, normalizarAcoes, normalizarLayout, ordemDasSecoes, itemAproximado, respostaDoAjuste, visiveis,
  CARDS_HOME, TETO_CARDS, cardsNaHome, LARGURAS_HOME, definirLargura, larguraDe, larguraMaisPerto, larguraVizinha, mesmoLayout, cardsRecusados, catalogoPorTema, ehCard, pedeCatalogo, respostaDoCatalogo,
  type AcaoHome, type IdHome, type IdItemHome, type LayoutHome,
} from "@/core/home/itens";
import { CARDS_BIBLIOTECA, EQUIVALENTES_AO_PAINEL, TEMAS_CARD } from "@/core/home/biblioteca";
import { saldoEmContas } from "@/core/home/contas";
import { iconeExiste } from "@/components/ui/lucide-icons";
import { readFileSync } from "node:fs";
import { montarPainelMaquininha, diaEHora } from "@/core/pinbank/recentes";
import * as RM from "@/core/pinbank/relatorio";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

let fails = 0;
const ok = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`✗ FAIL ${n} ${x}`); } };

const BASE: SinaisHome = {
  hoje: "2026-10-14", tipoConta: "empresa", perfil: null, temLancamentos: true,
  caixa: 100_000, caixaVar: 0.01, burnMensal: 20_000, burnVar: 0.02, runwayMeses: 5, runwayMotivo: null,
  arr: null, receber30: 30_000, pagar30: 20_000, receberVencido: 0, qtdReceberVencidos: 0,
  pendencias: { conciliar: 0, notas: 0, compras: 0, aprovacoes: 0, boletos: 0 }, fechamento: null,
};
const com = (p: Partial<SinaisHome>): SinaisHome => ({ ...BASE, ...p });
const ids = (s: SinaisHome) => recomendarSugestoes(s).map((x) => x.id);

// catálogo
const empresa = CATALOGO_SUGESTOES.filter((c) => c.publico === "empresa");
ok("catálogo: 30 ou mais perguntas de empresa", empresa.length >= 30, `(${empresa.length})`);
ok("catálogo: ids únicos", new Set(CATALOGO_SUGESTOES.map((c) => c.id)).size === CATALOGO_SUGESTOES.length);
ok("catálogo: textos únicos", new Set(CATALOGO_SUGESTOES.map((c) => c.texto)).size === CATALOGO_SUGESTOES.length);
ok("catálogo: toda pergunta termina como pergunta ou pedido", CATALOGO_SUGESTOES.every((c) => c.texto.length > 10 && c.texto.length <= 70));

// limites
const varios: SinaisHome[] = [
  BASE,
  com({ caixaVar: -0.3, burnVar: 0.4, runwayMeses: 2, receberVencido: 9000, qtdReceberVencidos: 5, pagar30: 80_000,
        pendencias: { conciliar: 40, notas: 3, compras: 2, aprovacoes: 1, boletos: 4 }, fechamento: 0.3, hoje: "2026-10-28" }),
  com({ perfil: { setor: "Tecnologia", modelo: "SaaS", receitaPrincipal: "Mensalidade", despesas: ["Software", "Folha", "Marketing"], meiosRecebimento: ["Cartão"] }, arr: 500_000 }),
];
for (const s of varios) {
  const r = recomendarSugestoes(s);
  ok("limite: nunca mais de seis", r.length <= LIMITE_SUGESTOES, `(${r.length})`);
  ok("limite: seis quando o catálogo permite", r.length === LIMITE_SUGESTOES, `(${r.length})`);
  const temas = new Map<string, number>();
  r.forEach((x) => temas.set(x.tema, (temas.get(x.tema) ?? 0) + 1));
  ok("tema: no máximo duas por tema", [...temas.values()].every((v) => v <= MAX_POR_TEMA), JSON.stringify([...temas]));
  ok("estável: o mesmo contexto dá a mesma lista", JSON.stringify(ids(s)) === JSON.stringify(ids(s)));
  ok("motivo: toda escolha diz por quê", r.every((x) => x.motivo.length > 0));
}

// o contexto muda a lista
// as duas básicas, sempre primeiro
ok("básicas: as duas primeiras são as fixas da empresa", varios.every((s) => JSON.stringify(ids(s).slice(0, 2)) === JSON.stringify(BASICAS.empresa)));
ok("básicas: as duas primeiras são as fixas da pessoa física", JSON.stringify(ids(com({ tipoConta: "pessoal" })).slice(0, 2)) === JSON.stringify(BASICAS.pessoal));
ok("básicas: existem no catálogo", [...BASICAS.empresa, ...BASICAS.pessoal].every((id) => CATALOGO_SUGESTOES.some((c) => c.id === id)));
ok("contexto: caixa negativo vem logo depois das básicas", ids(com({ caixa: -5000, runwayMeses: null, runwayMotivo: "caixa_negativo" }))[2] === "caixa-negativo");
ok("contexto: primeiro uso traz importar o extrato logo depois das básicas", ids(com({ temLancamentos: false }))[2] === "importar-extrato");

// prioridades e cliques
ok("prioridades: toda sugestão apontada existe no catálogo", INTERESSES.every((i) => i.sugestoes.every((id) => CATALOGO_SUGESTOES.some((c) => c.id === id && c.publico === i.publico))));
const vendas = ids(com({ interesses: ["vendas"] }));
ok("prioridades: marcar gestão de vendas traz pergunta de vendas", vendas.some((id) => ["melhores-clientes", "ticket-medio", "margem-produto", "taxas-cartao"].includes(id)), JSON.stringify(vendas));
ok("prioridades: (defeito plantado) sem marcar vendas, ticket médio não aparece", !ids(BASE).includes("ticket-medio"));
ok("prioridades: marcar calendário de pagamentos traz o que vence", ids(com({ interesses: ["calendario-pagamentos"] })).includes("pagar-semana"));
ok("cliques: a pergunta usada sobe para a lista", ids(com({ cliques: { "churn": 4 }, interesses: ["recorrente"] })).includes("churn"));
const r1 = recomendarSugestoes(com({ cliques: { "sazonalidade": 1 } })).find((x) => x.id === "sazonalidade");
const r4 = recomendarSugestoes(com({ cliques: { "sazonalidade": 40 } }), 50).find((x) => x.id === "sazonalidade");
ok("cliques: o peso tem teto", !!r4 && r4.pontos <= 1.0 + 1e-9, String(r4?.pontos));
void r1;
ok("contexto: SaaS vê a receita recorrente", ids(varios[2]).includes("arr-evolucao"));
ok("contexto: burn mudando sugere explicar o burn", ids(com({ burnVar: 0.25 })).includes("burn-mudou"));
ok("contexto: vencidos sugerem quem deve", ids(com({ receberVencido: 12_000, qtdReceberVencidos: 4 })).includes("quem-deve"));
ok("contexto: fim de mês sugere fechar o mês", ids(com({ hoje: "2026-10-28" })).includes("fechar-mes"));
ok("contexto: duas empresas diferentes veem listas diferentes",
   JSON.stringify(ids(varios[1])) !== JSON.stringify(ids(varios[2])));
const pf = recomendarSugestoes(com({ tipoConta: "pessoal" }));
ok("contexto: pessoa física só vê perguntas pessoais", pf.length > 0 && pf.every((x) => x.tema === "pessoal"));
ok("contexto: empresa nunca vê pergunta pessoal", varios.every((s) => recomendarSugestoes(s).every((x) => x.tema !== "pessoal")));

// ausência não é sinal
const semDado = com({ pendencias: { conciliar: null, notas: null, compras: null, aprovacoes: null, boletos: null }, receberVencido: null, qtdReceberVencidos: null, burnVar: null, caixaVar: null });
const r0 = recomendarSugestoes(semDado);
ok("ausência: notas não carregadas não sugerem emitir notas", !r0.some((x) => x.id === "notas"));
ok("ausência: vencido desconhecido não sugere cobrar", !r0.some((x) => x.id === "quem-deve" || x.id === "cobrar-primeiro"));
// defeito plantado: tratar null como "há pendência" teria de pôr "notas" na lista
const plantado = recomendarSugestoes({ ...semDado, pendencias: { ...semDado.pendencias, notas: 1 } });
ok("ausência: (defeito plantado) com uma nota de verdade, a sugestão aparece", plantado.some((x) => x.id === "notas"));

// etapa 2 — a ordem da Quattro AI só reordena o que as regras deixaram de pé
const cheio = varios[1];
const regras = ids(cheio);
const cands = candidatasParaIA(cheio);
ok("ia: candidatas não incluem as básicas", cands.every((c) => !BASICAS.empresa.includes(c.id)));
ok("ia: candidatas respeitam o teto", cands.length > 4 && cands.length <= CANDIDATAS_IA, `(${cands.length})`);
const ultima = cands[cands.length - 1].id;
const comIA = recomendarSugestoes(cheio, LIMITE_SUGESTOES, [ultima]).map((x) => x.id);
ok("ia: a escolha da IA sobe para logo depois das básicas", comIA[2] === ultima, JSON.stringify(comIA));
ok("ia: as básicas continuam primeiro", JSON.stringify(comIA.slice(0, 2)) === JSON.stringify(BASICAS.empresa));
ok("ia: o resto é completado pelas regras", comIA.length === LIMITE_SUGESTOES);
const lixo = recomendarSugestoes(cheio, LIMITE_SUGESTOES, ["inventada", 42, null, {}, "saude", "fechar-mes", "pf-gastos-mes"]).map((x) => x.id);
ok("ia: id inventado, de outro público, básico ou que não é texto não entra", JSON.stringify(lixo) === JSON.stringify(regras), JSON.stringify(lixo));
ok("ia: resposta que não é lista cai nas regras",
   [null, undefined, "quem-deve", { ids: ["quem-deve"] }].every((v) => JSON.stringify(recomendarSugestoes(cheio, LIMITE_SUGESTOES, v).map((x) => x.id)) === JSON.stringify(regras)));
// "Desligada" = pontuação zero: nenhuma regra casou e a base é zero (as de base
// positiva continuam candidatas legítimas, e a IA pode subi-las).
const vivas = new Set(recomendarSugestoes(semDado, 100).map((x) => x.id));
const mortas = empresa.map((c) => c.id).filter((id) => !vivas.has(id));
const desligada = recomendarSugestoes(semDado, LIMITE_SUGESTOES, mortas).map((x) => x.id);
ok("ia: há sugestão desligada para o teste valer", mortas.includes("quem-deve") && mortas.length >= 5, JSON.stringify(mortas));
ok("ia: não ressuscita sugestão que sinal ausente desligou", desligada.every((id) => vivas.has(id)), JSON.stringify(desligada));
ok("ia: candidatas são só as vivas", candidatasParaIA(semDado).every((c) => vivas.has(c.id)));
const mesmoTema = cands.filter((c) => c.tema === cands[0].tema).map((c) => c.id);
const porTemaIA = recomendarSugestoes(cheio, LIMITE_SUGESTOES, [...mesmoTema, ...mesmoTema]);
const contaTema = porTemaIA.filter((x) => x.tema === cands[0].tema).length;
ok("ia: o teto por tema vale para a escolha da IA", contaTema <= MAX_POR_TEMA, `(${cands[0].tema}: ${contaTema})`);
ok("ia: id repetido não ocupa duas vagas", new Set(porTemaIA.map((x) => x.id)).size === porTemaIA.length);
const ctx = contextoParaIA(semDado);
ok("ia: ausente vai à IA como null, nunca zero", ctx.receberVencido === null && ctx.pendencias.notas === null && ctx.variacaoBurn30d === null);
ok("ia: o contexto não leva lançamento nem nome", !("movements" in ctx) && !JSON.stringify(ctx).includes("party"));

// O chip do modelo do dono (14/10/2026): rótulo CURTO + ícone. Toda pergunta
// tem os dois, o ícone existe no DS (ícone desconhecido some sem erro, e o
// chip fica só com texto) e o rótulo é de fato curto e distinto.
ok("rótulo: toda pergunta do catálogo tem rótulo curto", CATALOGO_SUGESTOES.every((c) => ROTULOS[c.id]), CATALOGO_SUGESTOES.filter((c) => !ROTULOS[c.id]).map((c) => c.id).join(","));
ok("rótulo: nenhum rótulo sobra sem pergunta", Object.keys(ROTULOS).every((id) => CATALOGO_SUGESTOES.some((c) => c.id === id)));
ok("rótulo: curto de verdade (até 24 letras) e menor que a pergunta", CATALOGO_SUGESTOES.every((c) => ROTULOS[c.id] && ROTULOS[c.id].curto.length <= 24 && ROTULOS[c.id].curto.length < c.texto.length));
ok("rótulo: todo ícone existe no DS", Object.values(ROTULOS).every((r) => iconeExiste(r.icone)), Object.values(ROTULOS).filter((r) => !iconeExiste(r.icone)).map((r) => r.icone).join(","));
ok("rótulo: rótulos distintos dentro de cada público", ["empresa", "pessoal"].every((p) => { const r = CATALOGO_SUGESTOES.filter((c) => c.publico === p).map((c) => ROTULOS[c.id]?.curto); return new Set(r).size === r.length; }));
ok("rótulo: a escolha carrega rótulo e ícone, e o texto continua a pergunta inteira", recomendarSugestoes(BASE).every((e) => e.curto === ROTULOS[e.id].curto && e.icone === ROTULOS[e.id].icone && e.texto !== e.curto));
ok("rótulo: as candidatas da IA também", candidatasParaIA(BASE).every((e) => e.curto === ROTULOS[e.id].curto));

// ponta a ponta: snapshot real → sinais → sugestões
const movs: RiskMovement[] = [
  { id: "e1", type: "entrada", amount: 10_000, due_date: "2026-09-05", paid_date: "2026-09-05", status: "pago", category: "Vendas", party_id: null } as RiskMovement,
  { id: "s1", type: "saida", amount: 4_000, due_date: "2026-09-10", paid_date: "2026-09-10", status: "pago", category: "Aluguel", party_id: null } as RiskMovement,
  { id: "v1", type: "entrada", amount: 3_000, due_date: "2026-10-01", paid_date: null, status: "pendente", category: "Vendas", party_id: null } as RiskMovement,
];
const input = { hoje: "2026-10-14", saldoAtual: 50_000, partyNames: {}, movements: movs } as RiskInput;
const sin = sinaisDaHome({ snap: montarHomeSnapshot(input), input, tipoConta: "empresa", perfil: null });
ok("sinais: o vencido a receber vem da camada canônica", sin.receberVencido === 3000 && sin.qtdReceberVencidos === 1, JSON.stringify([sin.receberVencido, sin.qtdReceberVencidos]));
ok("sinais: pendência não informada é ausente, não zero", sin.pendencias.notas === null);
ok("sinais: ponta a ponta sugere quem deve", recomendarSugestoes(sin).some((x) => x.id === "quem-deve"));

// etapa 3 — a descrição livre do onboarding
const DESC = "Vendemos assinaturas de software (SaaS) para clínicas. Quero cobrar quem atrasa e olhar o caixa.";
const lidos = interessesDaDescricao(DESC, "empresa");
ok("descrição: lê as prioridades do texto", ["recorrente", "cobranca", "fluxo-caixa", "vendas"].every((i) => lidos.includes(i)), JSON.stringify(lidos));
ok("descrição: sem acento casa igual (cobrança = cobranca)", interessesDaDescricao("Foco em cobrança", "empresa").includes("cobranca"));
ok("descrição: palavra ancorada — \"revendas\" não é vendas", !interessesDaDescricao("Trabalhamos com revendas", "empresa").includes("vendas"));
ok("descrição: só prioridades do público certo", interessesDaDescricao("quero guardar dinheiro e controlar gastos", "empresa").every((i) => INTERESSES.find((x) => x.id === i)?.publico === "empresa"));
ok("descrição: na pessoa física, guardar dinheiro vira prioridade", interessesDaDescricao("Quero guardar dinheiro todo mês", "pessoal").includes("pf-guardar"));
ok("descrição: vazio, espaço ou não-texto não lê nada", [undefined, null, "", "   ", 42].every((t) => interessesDaDescricao(t, "empresa").length === 0));
const semDesc = ids(BASE);
const comDesc = recomendarSugestoes(com({ perfil: { descricao: "Assinaturas recorrentes, quero acompanhar o churn" } }));
ok("descrição: o texto MUDA a lista", comDesc.map((x) => x.id).join() !== semDesc.join(), JSON.stringify(comDesc.map((x) => x.id)));
ok("descrição: o motivo diz que veio da descrição", comDesc.some((x) => x.motivo.startsWith("você descreveu a empresa")), JSON.stringify(comDesc.map((x) => x.motivo)));
ok("descrição: as básicas continuam primeiro", comDesc.slice(0, 2).map((x) => x.id).join() === BASICAS.empresa.join());
const pontosDe = (s: SinaisHome, id: string) => recomendarSugestoes(s, 99).find((x) => x.id === id)?.pontos ?? -1;
const soMarcada = pontosDe(com({ interesses: ["recorrente"] }), "churn");
const marcadaEDescrita = pontosDe(com({ interesses: ["recorrente"], perfil: { descricao: "assinaturas e churn" } }), "churn");
const soDescrita = pontosDe(com({ perfil: { descricao: "assinaturas e churn" } }), "churn");
ok("descrição: a mesma vontade dita duas vezes não vale o dobro", soMarcada === marcadaEDescrita, JSON.stringify([soMarcada, marcadaEDescrita]));
ok("descrição: pesa menos que a prioridade marcada", soDescrita > 0 && soDescrita < soMarcada, JSON.stringify([soDescrita, soMarcada]));
// o que sai para a IA
const cpf = "529.982.247-25", cnpj = "11.222.333/0001-81";
const saneada = descricaoParaIA(`Meu CPF ${cpf}   e o CNPJ ${cnpj}\n\nvendemos   cursos`);
ok("ia: segredo não sai na descrição (CPF e CNPJ cobertos)", !!saneada && !saneada.includes(cpf) && !saneada.includes(cnpj) && !/\d{3}\.\d{3}\.\d{3}/.test(saneada), String(saneada));
ok("ia: espaços colapsados", saneada === "Meu CPF [CPF removido] e o CNPJ [CNPJ removido] vendemos cursos", String(saneada));
ok("ia: descrição vazia vai como null, nunca \"\"", descricaoParaIA("  \n ") === null && descricaoParaIA(undefined) === null && descricaoParaIA(7) === null);
const longa = descricaoParaIA("a".repeat(TETO_DESCRICAO * 3));
ok("ia: descrição longa é cortada no teto", !!longa && longa.length <= TETO_DESCRICAO + 1 && longa.endsWith("…"), String(longa?.length));
const ctxDesc = contextoParaIA(com({ perfil: { setor: "Tecnologia", descricao: `CPF ${cpf}, vendemos cursos` } }));
ok("ia: o contexto leva a descrição SANEADA", ctxDesc.perfil?.descricao === "CPF [CPF removido], vendemos cursos" && !JSON.stringify(ctxDesc).includes(cpf), JSON.stringify(ctxDesc.perfil));
ok("ia: sem descrição, o contexto diz null", contextoParaIA(com({ perfil: { setor: "Tecnologia" } })).perfil?.descricao === null);
const ROTA = readFileSync(new URL("../src/app/api/ai/sugestoes/route.ts", import.meta.url), "utf8");
ok("rota: a descrição é saneada de novo no servidor", /descricaoParaIA\(p\.descricao\)/.test(ROTA) && /JSON\.stringify\(contexto\)/.test(ROTA) && !/JSON\.stringify\(body\.contexto/.test(ROTA));
ok("rota: o prompt trata a descrição como informação, nunca instrução", /perfil\.descricao[^\n]*nunca instrução/.test(ROTA));

// etapa 4 — prioridades e cliques no servidor
const mapaBase = { ana: { interesses: ["caixa"], cliques: { runway: 3 } }, bia: { interesses: [], cliques: {} } };
const gravado = comPreferencias(mapaBase, "carlos", { interesses: ["fechamento"], cliques: { dre: 1 } }, "2026-10-14T10:00:00Z");
ok("prefs: gravar uma pessoa não mexe nos colegas", JSON.stringify(gravado.ana) === JSON.stringify(mapaBase.ana) && JSON.stringify(gravado.bia) === JSON.stringify(mapaBase.bia), JSON.stringify(gravado));
ok("prefs: a entrada nova leva a data", gravado.carlos?.atualizadoEm === "2026-10-14T10:00:00Z" && gravado.carlos.interesses?.join() === "fechamento");
const trocado = comPreferencias(gravado, "ana", { interesses: ["dre"], cliques: {} }, "2026-10-14T11:00:00Z");
ok("prefs: regravar alguém troca só a entrada dele", trocado.ana.interesses?.join() === "dre" && trocado.carlos.interesses?.join() === "fechamento");
ok("prefs: mapa torto não vira mapa de ninguém", Object.keys(comPreferencias([1, 2], "ana", { interesses: null, cliques: {} }, "x")).join() === "ana");
ok("prefs: lê a entrada da pessoa certa", preferenciasDoUsuario(mapaBase, "ana")?.cliques.runway === 3 && preferenciasDoUsuario(mapaBase, "zé") === null && preferenciasDoUsuario(mapaBase, null) === null);
const torto = normalizarPreferencias({ interesses: "caixa", cliques: { a: -2, b: 2.7, c: "9", d: Infinity, e: 5000 } });
ok("prefs: interesse torto é AUSENTE, nunca \"pulei\"", torto?.interesses === null, JSON.stringify(torto));
ok("prefs: só contagem válida entra, inteira e com teto", JSON.stringify(torto?.cliques) === JSON.stringify({ b: 2, e: 1000 }), JSON.stringify(torto?.cliques));
ok("prefs: interesse repetido entra uma vez", normalizarPreferencias({ interesses: ["a", "a", 3, "b"] })?.interesses?.join() === "a,b");
ok("prefs: \"pulei\" continua \"pulei\"", JSON.stringify(normalizarPreferencias({ interesses: [] })?.interesses) === "[]");
ok("prefs: nada sobe antes de o servidor responder", !podeEnviarPreferencias(false, "ana"));
ok("prefs: nada sobe sem usuário conhecido", !podeEnviarPreferencias(true, null) && !podeEnviarPreferencias(true, "local") && podeEnviarPreferencias(true, "ana"));
const mesclado = mesclarComDispositivo({ interesses: ["caixa"], cliques: { runway: 3, dre: 1 } }, { interesses: ["dre"], cliques: { runway: 2, churn: 4 } });
ok("prefs: o servidor vence nas prioridades", mesclado?.interesses?.join() === "caixa");
ok("prefs: cliques mesclam pelo MAIOR, sem somar", JSON.stringify(mesclado?.cliques) === JSON.stringify({ runway: 3, dre: 1, churn: 4 }), JSON.stringify(mesclado?.cliques));
ok("prefs: sem resposta no servidor, vale a do dispositivo", mesclarComDispositivo({ interesses: null, cliques: {} }, { interesses: ["dre"], cliques: {} })?.interesses?.join() === "dre");
ok("prefs: sem nada em lado nenhum é null (primeiro acesso)", mesclarComDispositivo(null, null) === null);
ok("prefs: igualdade ignora a ordem e enxerga o clique a mais",
  mesmasPreferencias({ interesses: ["a", "b"], cliques: { x: 1 } }, { interesses: ["b", "a"], cliques: { x: 1 } })
  && !mesmasPreferencias({ interesses: ["a"], cliques: { x: 1 } }, { interesses: ["a"], cliques: { x: 2 } })
  && !mesmasPreferencias({ interesses: null, cliques: {} }, { interesses: [], cliques: {} }));
const LIB = readFileSync(new URL("../src/lib/home-preferencias.ts", import.meta.url), "utf8");
ok("prefs: o envio pergunta podeEnviarPreferencias antes de gravar", /if \(!podeEnviarPreferencias\(conferido, usuario\)\) return;[\s\S]*gravarOrg\(KEY/.test(LIB));
ok("prefs: só conta como conferido o que o servidor respondeu", /conferido = \(await hidratarComStatus\(\[KEY\]\)\)\.ok/.test(LIB));
ok("prefs: o clique sobe adiado (a trilha não ganha um evento por clique)", /adiar: true/.test(readFileSync(new URL("../src/components/visao-geral/HomeSnapshot.tsx", import.meta.url), "utf8")) && /setTimeout\(enviar, ADIAR_MS\)/.test(LIB) && /pagehide/.test(LIB));
ok("prefs: a cópia do dispositivo continua sendo gravada", /gravarPreferencia\(LOCAL_INTERESSES/.test(LIB) && /gravarPreferencia\(LOCAL_CLIQUES/.test(LIB));

// etapa 5 — o que a pessoa ignora desce
{
const HOJE = BASE.hoje;
const ontem = "2026-10-13";
const ign = (dias: number, ultimo = ontem) => ({ dias, ultimo });
const alvo = ids(BASE).find((id) => !BASICAS.empresa.includes(id))!;
ok("ignorar: dentro da graça não custa nada", descontoPorIgnorar(com({ exibidas: { [alvo]: ign(DIAS_DE_GRACA) } }), alvo) === 0);
ok("ignorar: passou da graça, desconta", descontoPorIgnorar(com({ exibidas: { [alvo]: ign(DIAS_DE_GRACA + 1) } }), alvo) > 0);
ok("ignorar: o desconto tem teto", descontoPorIgnorar(com({ exibidas: { [alvo]: ign(300) } }), alvo) === TETO_IGNORADA);
ok("ignorar: o teto desce de verdade, mas não abaixo de zero de quem estava de pé", TETO_IGNORADA >= 1.5);
const cansadaSinais = com({ exibidas: { [alvo]: ign(30) } });
ok("ignorar: a ignorada SAI da frente — a lista muda e ela desce", ids(cansadaSinais).indexOf(alvo) === -1 || ids(cansadaSinais).indexOf(alvo) > ids(BASE).indexOf(alvo), JSON.stringify([ids(BASE), ids(cansadaSinais)]));
ok("ignorar: as básicas nunca perdem", BASICAS.empresa.every((b) => descontoPorIgnorar(com({ exibidas: { [b]: ign(300) } }), b) === 0)
  && ids(com({ exibidas: Object.fromEntries(BASICAS.empresa.map((b) => [b, ign(300)])) })).slice(0, 2).join() === BASICAS.empresa.join());
ok("ignorar: o dia de HOJE só conta amanhã (a lista não mexe com a Home aberta)",
  descontoPorIgnorar(com({ exibidas: { [alvo]: ign(DIAS_DE_GRACA + 2, HOJE) } }), alvo) === descontoPorIgnorar(com({ exibidas: { [alvo]: ign(DIAS_DE_GRACA + 1) } }), alvo));
ok("ignorar: duas semanas sem aparecer devolvem a chance",
  descontoPorIgnorar(com({ exibidas: { [alvo]: ign(30, "2026-09-01") } }), alvo) === 0 && JANELA_IGNORADA >= 7);
ok("ignorar: data torta não desconta", descontoPorIgnorar(com({ exibidas: { [alvo]: { dias: 30, ultimo: "ontem" } } }), alvo) === 0);
// urgência vence
const negativo = com({ caixa: -5000, caixaVar: -0.5, exibidas: { "caixa-negativo": ign(300) } });
ok("ignorar: caixa negativo continua na tela mesmo ignorado", ids(negativo).includes("caixa-negativo"), JSON.stringify(ids(negativo)));
// reordena, nunca ressuscita
// "caixa-negativo" tem base 0 e só liga com o caixa abaixo de zero — na BASE ele está desligado.
ok("ignorar: o teste parte de uma sugestão desligada", !recomendarSugestoes(BASE, 99).some((e) => e.id === "caixa-negativo"));
ok("ignorar: o desconto não ressuscita quem um sinal desligou", !recomendarSugestoes(com({ exibidas: { "caixa-negativo": ign(300) } }), 99).some((e) => e.id === "caixa-negativo"));
ok("ignorar: a descontada continua de pé (só lá atrás)", recomendarSugestoes(cansadaSinais, 99).some((e) => e.id === alvo && e.pontos > 0));
ok("ignorar: ainda seis na tela", recomendarSugestoes(cansadaSinais).length === LIMITE_SUGESTOES);
// a IA não traz de volta a cansada
const comIACansada = recomendarSugestoes(cansadaSinais, LIMITE_SUGESTOES, [alvo]).map((x) => x.id);
ok("ignorar: nem a IA põe a cansada de volta na frente", comIACansada.indexOf(alvo) !== 2, JSON.stringify(comIACansada));
ok("ignorar: cansada é o teto do desconto", cansada(cansadaSinais, alvo) && !cansada(com({ exibidas: { [alvo]: ign(DIAS_DE_GRACA + 1) } }), alvo));
const ctxIgn = contextoParaIA(com({ exibidas: { [alvo]: ign(30), outra: ign(1) } }));
ok("ignorar: a IA recebe só o que já desceu", JSON.stringify(ctxIgn.ignoradas) === JSON.stringify({ [alvo]: 30 }), JSON.stringify(ctxIgn.ignoradas));
ok("rota: o prompt fala das ignoradas", /"ignoradas"/.test(ROTA));
// o registro
const r1 = registrarExibicao({}, ["a", "b"], HOJE);
ok("exibição: um dia por sugestão", r1.a?.dias === 1 && r1.a.ultimo === HOJE && r1.b?.dias === 1);
const r2 = registrarExibicao(r1, ["a", "b"], HOJE);
ok("exibição: abrir a Home de novo no MESMO dia não conta outra vez (e não regrava)", r2 === r1);
ok("exibição: no dia seguinte soma", registrarExibicao(r1, ["a"], "2026-10-15").a?.dias === 2);
ok("exibição: data torta não grava", registrarExibicao({}, ["a"], "hoje") && Object.keys(registrarExibicao({}, ["a"], "hoje")).length === 0);
const zerado = registrarClique({ a: ign(20) }, "a", HOJE);
ok("clique: zera os dias ignorados e hoje não conta", zerado.a?.dias === 0 && registrarExibicao(zerado, ["a"], HOJE).a?.dias === 0);
ok("clique: zerado não desconta", descontoPorIgnorar(com({ exibidas: zerado }), "a") === 0);
const tortaEx = normalizarPreferencias({ interesses: [], cliques: {}, exibidas: { a: { dias: 2.9, ultimo: HOJE }, b: { dias: -1, ultimo: HOJE }, c: { dias: 3, ultimo: "x" }, d: "y", e: { dias: 9999, ultimo: HOJE } } });
ok("prefs: exibição torta fica de fora, inteira e com teto", JSON.stringify(tortaEx?.exibidas) === JSON.stringify({ a: { dias: 2, ultimo: HOJE }, e: { dias: 365, ultimo: HOJE } }), JSON.stringify(tortaEx?.exibidas));
ok("prefs: entrada antiga (sem exibidas) lê como nada ignorado", JSON.stringify(normalizarPreferencias({ interesses: [], cliques: {} })?.exibidas) === "{}");
const mesEx = mesclarComDispositivo(
  { interesses: [], cliques: {}, exibidas: { a: ign(5, "2026-10-10"), b: ign(2, HOJE) } },
  { interesses: [], cliques: {}, exibidas: { a: ign(1, HOJE), b: ign(4, HOJE), c: ign(3) } });
ok("prefs: exibição mescla pela MAIS RECENTE (ela carrega o clique que zerou)", mesEx?.exibidas?.a?.dias === 1 && mesEx?.exibidas?.b?.dias === 4 && mesEx?.exibidas?.c?.dias === 3, JSON.stringify(mesEx?.exibidas));
ok("prefs: a igualdade enxerga um dia a mais de exibição",
  !mesmasPreferencias({ interesses: [], cliques: {}, exibidas: { a: ign(1) } }, { interesses: [], cliques: {}, exibidas: { a: ign(2) } })
  && mesmasPreferencias({ interesses: [], cliques: {} }, { interesses: [], cliques: {}, exibidas: {} }));
const HOME = readFileSync(new URL("../src/components/visao-geral/HomeSnapshot.tsx", import.meta.url), "utf8");
ok("tela: a exibição só conta com a lista PARADA e sem as básicas", /EXIBIDA_APOS_MS/.test(HOME) && /BASICAS\[sinais\.tipoConta\]\.includes/.test(HOME) && /clearTimeout\(t\)/.test(HOME));
ok("tela: a exibição sobe adiada, como o clique", /const exibiu = [\s\S]*?gravarPreferenciasHome\(novo, \{ adiar: true \}\);\s*\};/.test(HOME));
ok("prefs: a cópia do dispositivo também guarda as exibições", /gravarPreferencia\(LOCAL_EXIBIDAS/.test(LIB));
}

/* ---------------- AJUSTAR PRIORIDADES PELA CONVERSA (etapas 2 e 3, 14/10/2026) ---------------- */
{
  const acoes = (t: string) => interpretarPedido(t).map((a) => `${a.tipo}${a.id ? ":" + a.id : ""}`);
  const L = (ordem: IdItemHome[], ocultos: IdItemHome[] = []): LayoutHome => normalizarLayout({ ordem, ocultos })!;

  // catálogo
  ok("itens: onze, ids únicos", ITENS_HOME.length === 11 && new Set(ITENS_HOME.map((i) => i.id)).size === 11);
  ok("itens: o saldo total em contas vem primeiro, sozinho na faixa (pedido do dono, 27/10/2026)", LAYOUT_PADRAO.ordem[0] === "contas" && faixasDoPainel(LAYOUT_PADRAO)[0].ids.join() === "contas" && faixasDoPainel(LAYOUT_PADRAO)[0].tamanho === "destaque");
  ok("itens: a maquininha logo depois, com o caixa e o ARR", faixasDoPainel(LAYOUT_PADRAO)[1].ids.join() === "maquininha,caixa,arr");
  ok("itens: quem já tinha arranjo ganha o saldo em contas no TOPO", normalizarLayout({ ordem: ["pagar", "caixa", "maquininha"], ocultos: [] })!.ordem[0] === "contas");
  ok("itens: sinônimos sem acento e em minúsculas", ITENS_HOME.every((i) => i.sinonimos.every((x) => x === x.toLowerCase() && x === x.normalize("NFD").replace(/[̀-ͯ]/g, ""))));
  ok("itens: todo número do painel tem tamanho", ITENS_HOME.filter((i) => i.grupo === "painel").every((i) => i.tamanho));

  // o texto que a pessoa digita
  ok("pedido: citar sem verbo é ver primeiro", JSON.stringify(acoes("Quero ver primeiro o que tenho a pagar e a receber")) === JSON.stringify(["primeiro:pagar", "primeiro:receber"]), JSON.stringify(acoes("Quero ver primeiro o que tenho a pagar e a receber")));
  ok("pedido: esconder vence o verbo de ver no mesmo pedido", JSON.stringify(acoes("tira o burn e o runway, quero ver o caixa")) === JSON.stringify(["esconder:burn", "esconder:runway", "primeiro:caixa"]), JSON.stringify(acoes("tira o burn e o runway, quero ver o caixa")));
  ok("pedido: \"não preciso\" esconde", JSON.stringify(acoes("não preciso do ARR")) === JSON.stringify(["esconder:arr"]));
  ok("pedido: \"volte\" mostra de novo", JSON.stringify(acoes("quero que o burn volte")) === JSON.stringify(["mostrar:burn"]));
  ok("pedido: \"volta ao padrão\" restaura", JSON.stringify(acoes("volta ao padrão")) === JSON.stringify(["restaurar"]));
  ok("pedido: \"no final\" leva ao fim", acoes("o que precisa de ação primeiro, relatórios no final").join() === "primeiro:acao,ultimo:relatorios");
  const so = interpretarPedido("só quero ver o caixa e o que vou pagar");
  ok("pedido: \"só\" esconde o que não foi citado", so.filter((a) => a.tipo === "esconder").length === 9 && so.some((a) => a.tipo === "primeiro" && a.id === "caixa"), JSON.stringify(so));
  ok("pedido: cumprimento não mexe em nada", interpretarPedido("bom dia").length === 0 && interpretarPedido("").length === 0 && interpretarPedido(42).length === 0);
  // defeito plantado: casar o sinônimo mais CURTO primeiro faria "fluxo de caixa" (o relatório) mexer no caixa
  const ingenuo = (t: string) => ITENS_HOME.filter((i) => i.sinonimos.some((x) => t.toLowerCase().includes(x))).map((i) => i.id);
  ok("pedido: (defeito plantado) a leitura ingênua confunde o relatório com o caixa", ingenuo("quero o fluxo de caixa primeiro").includes("caixa"));
  ok("pedido: \"fluxo de caixa\" é o relatório, não o caixa", JSON.stringify(itensCitados("quero o fluxo de caixa primeiro")) === JSON.stringify(["relatorios"]), JSON.stringify(itensCitados("quero o fluxo de caixa primeiro")));
  ok("pedido: palavra dentro de outra não casa (\"arraste\" não é ARR)", !itensCitados("arraste os cards").includes("arr"));
  // defeito plantado: tratar todo item citado como "ver primeiro" levaria o burn ao topo num pedido para tirá-lo
  const tudoPrimeiro = (t: string): AcaoHome[] => itensCitados(t).map((id) => ({ tipo: "primeiro", id }));
  ok("pedido: (defeito plantado) sem o verbo, \"tira o burn\" subiria o burn", visiveis(aplicarAcoes(LAYOUT_PADRAO, tudoPrimeiro("tira o burn")))[0] === "burn");
  ok("pedido: \"tira o burn\" o esconde", !visiveis(aplicarAcoes(LAYOUT_PADRAO, interpretarPedido("tira o burn"))).includes("burn"));

  // a trava contra a IA e o texto
  const torto = normalizarAcoes([{ tipo: "primeiro", id: "lucro" }, { tipo: "apagar", id: "caixa" }, { tipo: "esconder", id: "burn" }, { tipo: "esconder", id: "burn" }, { tipo: "restaurar", id: "x" }, null, "primeiro"]);
  ok("ações: id inventado, tipo inventado, repetido e lixo saem", JSON.stringify(torto) === JSON.stringify([{ tipo: "esconder", id: "burn" }, { tipo: "restaurar" }]), JSON.stringify(torto));
  ok("ações: teto de vinte", normalizarAcoes(Array.from({ length: 50 }, (_, i) => ({ tipo: i % 2 ? "esconder" : "mostrar", id: ITENS_HOME[i % 10].id }))).length <= 20);
  ok("ações: objeto que não é lista vira nada", normalizarAcoes({ tipo: "restaurar" }).length === 0);

  // aplicar
  const escondido = L(LAYOUT_PADRAO.ordem, ["pagar"]);
  ok("aplicar: \"primeiro\" também mostra o que estava escondido", visiveis(aplicarAcoes(escondido, [{ tipo: "primeiro", id: "pagar" }]))[0] === "pagar");
  ok("aplicar: vários \"primeiro\" na ordem dita", visiveis(aplicarAcoes(LAYOUT_PADRAO, [{ tipo: "primeiro", id: "receber" }, { tipo: "primeiro", id: "pagar" }])).slice(0, 2).join() === "receber,pagar");
  ok("aplicar: esconder não reordena", aplicarAcoes(LAYOUT_PADRAO, [{ tipo: "esconder", id: "arr" }]).ordem.join() === LAYOUT_PADRAO.ordem.join());
  ok("aplicar: restaurar volta ao padrão", JSON.stringify(aplicarAcoes(L(["relatorios", "caixa"], ["burn"]), [{ tipo: "restaurar" }])) === JSON.stringify(LAYOUT_PADRAO));
  ok("aplicar: nenhum item some da ordem", aplicarAcoes(LAYOUT_PADRAO, interpretarPedido("só quero ver o caixa")).ordem.length === 11);

  // o que o chat diz
  const depois = aplicarAcoes(LAYOUT_PADRAO, interpretarPedido("tira o burn, quero ver a pagar"));
  const frases = descreverMudancas(LAYOUT_PADRAO, depois, interpretarPedido("tira o burn, quero ver a pagar"));
  ok("chat: diz o que subiu e o que saiu", frases.some((f) => /Para o topo: Contas a pagar/.test(f)) && frases.some((f) => /Escondidos: Burn mensal/.test(f)), JSON.stringify(frases));
  const ja = interpretarPedido("quero ver o saldo total em contas primeiro");
  ok("chat: pedir o que já está assim não anuncia mudança", descreverMudancas(LAYOUT_PADRAO, aplicarAcoes(LAYOUT_PADRAO, ja), ja).length === 0);
  ok("chat: \"já está desse jeito\" quando nada mudou", respostaDoAjuste(ja, []).mudou === false && /já está/.test(respostaDoAjuste(ja, []).abertura));
  ok("chat: sem item no pedido, diz quais existem", /Caixa consolidado/.test(respostaDoAjuste([], []).fecho) && !respostaDoAjuste([], []).mudou);
  ok("chat: mudou → oferece seguir", respostaDoAjuste(ja, ["x"]).mudou && /mais alguma coisa/.test(respostaDoAjuste(ja, ["x"]).fecho));

  // o arranjo guardado
  ok("arranjo: item que faltava volta no lugar padrão, nunca some", normalizarLayout({ ordem: ["pagar", "caixa"], ocultos: [] })!.ordem.length === 11);
  ok("arranjo: id estranho e repetido saem", JSON.stringify(normalizarLayout({ ordem: ["caixa", "caixa", "lucro"], ocultos: ["x", "burn"] })!.ocultos) === JSON.stringify(["burn"]));
  ok("arranjo: lixo é ausente, não vazio", normalizarLayout("x") === null && normalizarLayout([]) === null && normalizarLayout(null) === null);
  const migrado = layoutDasOrdensAntigas({ grandes: ["arr", "caixa"], pequenos: ["receber", "pagar", "burn", "runway"] });
  ok("arranjo: quem arrastou antes não perde a ordem", migrado?.ordem.slice(2, 8).join() === "arr,caixa,receber,pagar,burn,runway", JSON.stringify(migrado));
  ok("arranjo: o bloco que faltava não parte a ordem dos números", normalizarLayout({ ordem: ["receber", "caixa"], ocultos: [] })!.ordem.slice(-3).join() === "acao,fechamento,relatorios");
  ok("arranjo: sem ordem antiga, nada a migrar", layoutDasOrdensAntigas({}) === null && layoutDasOrdensAntigas(null) === null);
  ok("arranjo: mover troca de lugar", moverItem(LAYOUT_PADRAO, "runway", "caixa").ordem[2] === "runway");

  // a tela
  ok("tela: grandes e pequenos em faixas do MESMO tamanho, na ordem", JSON.stringify(faixasDoPainel(L(["pagar", "caixa", "arr", "burn"])).map((f) => f.ids).slice(2, 5)) === JSON.stringify([["pagar", "receber"], ["caixa", "arr"], ["burn", "runway"]]), JSON.stringify(faixasDoPainel(L(["pagar", "caixa", "arr", "burn"]))));
  ok("tela: o pedido de ver primeiro o que precisa de ação SOBE os blocos", ordemDasSecoes(aplicarAcoes(LAYOUT_PADRAO, interpretarPedido("o que precisa de ação primeiro")))[0] === "bloco");
  ok("tela: arranjo padrão, painel em cima", ordemDasSecoes(LAYOUT_PADRAO)[0] === "painel");
  ok("tela: o escondido sai da faixa", !faixasDoPainel(L(LAYOUT_PADRAO.ordem, ["caixa"])).some((f) => f.ids.includes("caixa")));

  // preferências e servidor
  const comLayout = normalizarPreferencias({ interesses: [], cliques: {}, layout: { ordem: ["pagar", ...LAYOUT_PADRAO.ordem], ocultos: ["burn"] } });
  ok("prefs: o arranjo é guardado normalizado", comLayout?.layout?.ordem[0] === "pagar" && comLayout.layout.ordem.length === 11 && comLayout.layout.ocultos.join() === "burn");
  ok("prefs: entrada antiga (sem arranjo) lê como padrão", normalizarPreferencias({ interesses: [], cliques: {} })?.layout === null);
  ok("prefs: a igualdade enxerga o arranjo", !mesmasPreferencias({ interesses: [], cliques: {}, layout: LAYOUT_PADRAO }, { interesses: [], cliques: {}, layout: L(LAYOUT_PADRAO.ordem, ["burn"]) }));
  ok("prefs: o arranjo do servidor vence o do dispositivo",
    mesclarComDispositivo({ interesses: [], cliques: {}, layout: L(["pagar", ...LAYOUT_PADRAO.ordem]) }, { interesses: [], cliques: {}, layout: L(["burn", ...LAYOUT_PADRAO.ordem]) })?.layout?.ordem[0] === "pagar");
  ok("prefs: só o dispositivo tem arranjo → ele entra",
    mesclarComDispositivo({ interesses: [], cliques: {} }, { interesses: [], cliques: {}, layout: L(["burn", ...LAYOUT_PADRAO.ordem]) })?.layout?.ordem[0] === "burn");
  ok("prefs: gravar o arranjo de uma pessoa não toca nos colegas",
    JSON.stringify(comPreferencias({ outro: { interesses: ["x"], cliques: {} } }, "eu", { interesses: [], cliques: {}, layout: LAYOUT_PADRAO }, "t").outro) === JSON.stringify({ interesses: ["x"], cliques: {} }));
  ok("prefs: a cópia do dispositivo guarda o arranjo", /gravarPreferencia\(LOCAL_LAYOUT/.test(LIB) && /"a4p_home_layout"/.test(readFileSync(new URL("../src/lib/store-org.ts", import.meta.url), "utf8")));

  // a rota e o cliente
  const TELA = readFileSync(new URL("../src/components/visao-geral/HomeSnapshot.tsx", import.meta.url), "utf8");
  const ROTA_LAYOUT = readFileSync(new URL("../src/app/api/ai/home-layout/route.ts", import.meta.url), "utf8");
  ok("rota: o pedido é saneado e tratado como informação", /descricaoParaIA\(body\.pedido\)/.test(ROTA_LAYOUT) && /nunca instrução/.test(ROTA_LAYOUT));
  ok("rota: só devolve ações validadas", /normalizarAcoes\(out\?\.acoes\)/.test(ROTA_LAYOUT));
  ok("rota: exige sessão fora da demonstração", /if \(!isDemo\)[\s\S]*?sem_sessao/.test(ROTA_LAYOUT));
  ok("tela: a resposta da IA é validada de novo e cai nas regras", /normalizarAcoes\(j\.acoes\)/.test(TELA) && /return interpretarPedido\(texto, layout\)/.test(TELA));
  ok("tela: o arraste grava ao SOLTAR, não a cada passo", /const soltar = \(\) => \{\s*if \(rascunho\) salvar\(rascunho\)/.test(TELA) && /onDragEnd: soltar/.test(TELA));
  // a linha "N itens escondidos · Mostrar de novo" SAIU da Home (decisão do dono, 14/10/2026): a volta é pela conversa
  ok("tela: sem a linha de escondidos na Home", !/Mostrar de novo/.test(TELA) && !/data-home="escondidos"/.test(TELA));
  const semBurn = aplicarAcoes(LAYOUT_PADRAO, interpretarPedido("tira o burn"));
  ok("chat: o escondido volta pela conversa", semBurn.ocultos.includes("burn") && aplicarAcoes(semBurn, interpretarPedido("traz o burn de volta", semBurn)).ocultos.length === 0);
  ok("tela: \"Ajustar prioridades\" abre o chat no modo ajuste", /onClick=\{ajustar\}/.test(TELA) && /abrirChat\(\{\s*ajuste:/.test(TELA) && /O que você gostaria de ver primeiro quando abre o Quattro\?/.test(TELA));
  ok("tela: o desfazer volta o arranjo E as prioridades de antes", /desfazer: r\.mudou \? \(\) => prefs\.salvarAjuste\(antes, interessesAntes\)/.test(TELA));
}

// ── BIBLIOTECA DE CARDS (14/10/2026): cards de outras telas entram na Home pela conversa ──
{
  const COCKPIT = readFileSync(new URL("../src/components/visao-geral/cockpit.tsx", import.meta.url), "utf8");
  const doCockpit = [...COCKPIT.matchAll(/^\s+id: "([^"]+)", label:/gm)].map((m) => m[1]);
  const daBiblioteca = CARDS_BIBLIOTECA.map((c) => c.id);
  const equivalentes = Object.keys(EQUIVALENTES_AO_PAINEL);
  ok("biblioteca: a leitura do cockpit achou os cards", doCockpit.length >= 90, String(doCockpit.length));
  const semCasa = doCockpit.filter((id) => !daBiblioteca.includes(id) && !equivalentes.includes(id));
  ok("biblioteca: todo card do cockpit está na biblioteca ou é equivalente ao painel", semCasa.length === 0, semCasa.join(","));
  const orfaos = daBiblioteca.filter((id) => !doCockpit.includes(id));
  ok("biblioteca: nenhum card da biblioteca sem desenho no cockpit", orfaos.length === 0, orfaos.join(","));
  ok("biblioteca: o equivalente ao painel não entra duas vezes", equivalentes.every((id) => !daBiblioteca.includes(id)));
  ok("biblioteca: ids sem repetição", new Set(daBiblioteca).size === daBiblioteca.length);
  ok("biblioteca: todo card tem nome, tema conhecido, descrição e sinônimo",
    CARDS_BIBLIOTECA.every((c) => c.nome && (TEMAS_CARD as readonly string[]).includes(c.tema) && c.descricao && c.sinonimos.length > 0),
    CARDS_BIBLIOTECA.filter((c) => !c.sinonimos.length).map((c) => c.id).join(","));
  // Sinônimo em dois itens: o primeiro vence sempre e o segundo fica inalcançável pela conversa.
  const donos = new Map<string, string[]>();
  for (const i of [...ITENS_HOME, ...CARDS_HOME]) for (const s of i.sinonimos) donos.set(s, [...(donos.get(s) ?? []), i.id]);
  const repetidos = [...donos].filter(([, ids]) => ids.length > 1).map(([s, ids]) => `${s}→${ids.join("+")}`);
  ok("biblioteca: nenhum sinônimo aponta para dois itens", repetidos.length === 0, repetidos.join(" | "));
  // Todo card precisa ser alcançável: citar o primeiro sinônimo dele devolve ele.
  const inalcancaveis = CARDS_HOME.filter((c) => !itensCitados(`coloca ${c.sinonimos[0]}`).includes(c.id)).map((c) => c.id);
  ok("biblioteca: todo card é alcançável pelo próprio sinônimo", inalcancaveis.length === 0, inalcancaveis.join(","));

  // pôr e tirar
  const A = (t: string, l: LayoutHome = LAYOUT_PADRAO) => aplicarAcoes(l, interpretarPedido(t, l));
  const com = A("coloca a inadimplência e o EBITDA");
  ok("pedido: \"coloca\" põe os cards na Home, na ordem pedida", cardsNaHome(com).join() === "card:inadimplencia_pct,card:ebitda-mes", cardsNaHome(com).join());
  ok("pedido: pôr card não esconde nem mexe nos fixos", com.ocultos.length === 0 && com.ordem.filter((x) => !ehCard(x)).join() === LAYOUT_PADRAO.ordem.join());
  ok("pedido: card novo entra no TOPO (primeiro da página, dentro de \"Seu painel\")", com.ordem.slice(0, 2).join() === "card:inadimplencia_pct,card:ebitda-mes" && ordemDasSecoes(com)[0] === "painel", com.ordem.slice(0, 3).join());
  ok("pedido: não existe seção de cards à parte", ordemDasSecoes(com).join() === "painel,bloco");
  ok("pedido: \"por favor\" não vira pedido de pôr", interpretarPedido("por favor").length === 0);
  const topo = A("bota os custos fixos em cima");
  ok("pedido: card pedido \"em cima\" sobe para o topo e a seção dele vem primeiro", topo.ordem[0] === "card:custos-fixos-mensais" && ordemDasSecoes(topo)[0] === "painel", topo.ordem.slice(0, 2).join());
  const sem = A("tira a inadimplência", com);
  ok("pedido: \"tira\" tira o card da Home (sai da ordem, não vai para escondidos)", cardsNaHome(sem).join() === "card:ebitda-mes" && sem.ocultos.length === 0);
  ok("pedido: \"só\" tira os cards não citados", cardsNaHome(A("só quero ver o caixa", com)).length === 0);
  ok("pedido: \"volta ao padrão\" tira todos os cards", cardsNaHome(A("volta ao padrão", com)).length === 0 && A("volta ao padrão", com).ordem.join() === LAYOUT_PADRAO.ordem.join());
  ok("pedido: o fixo vence o card de mesmo assunto (\"tira o burn\" é o do painel)", interpretarPedido("tira o burn").some((a) => a.id === "burn"));
  ok("pedido: \"contas bancárias\" é o card, não o caixa", itensCitados("contas bancárias").join() === "card:contas-bancarias", itensCitados("contas bancárias").join());

  // teto
  const muitos = CARDS_HOME.slice(0, TETO_CARDS + 3).map((c) => ({ tipo: "mostrar" as const, id: c.id }));
  const cheio = aplicarAcoes(LAYOUT_PADRAO, muitos);
  ok("teto: a Home não passa de " + TETO_CARDS + " cards", cardsNaHome(cheio).length === TETO_CARDS, String(cardsNaHome(cheio).length));
  ok("teto: os que não couberam são ditos", cardsRecusados(cheio, muitos).length === 3);
  ok("teto: o arranjo guardado também respeita o teto", cardsNaHome(normalizarLayout({ ordem: [...LAYOUT_PADRAO.ordem, ...CARDS_HOME.map((c) => c.id)], ocultos: [] })!).length === TETO_CARDS);
  ok("teto: a resposta diz o que não coube e por quê", new RegExp(`já tem ${TETO_CARDS} cards`).test(respostaDoAjuste(muitos, descreverMudancas(LAYOUT_PADRAO, cheio, muitos), cardsRecusados(cheio, muitos)).fecho));

  // arranjo guardado
  ok("arranjo: card desconhecido é descartado, o conhecido fica", normalizarLayout({ ordem: ["card:nao-existe", "card:ebitda-mes", ...LAYOUT_PADRAO.ordem], ocultos: [] })!.ordem.join() === ["card:ebitda-mes", ...LAYOUT_PADRAO.ordem].join());
  ok("arranjo: card não vai para escondidos", normalizarLayout({ ordem: LAYOUT_PADRAO.ordem, ocultos: ["card:ebitda-mes"] })!.ocultos.length === 0);
  ok("arranjo: card repetido entra uma vez", cardsNaHome(normalizarLayout({ ordem: [...LAYOUT_PADRAO.ordem, "card:ebitda-mes", "card:ebitda-mes"], ocultos: [] })!).length === 1);
  ok("ações: id de card inventado não passa", normalizarAcoes([{ tipo: "mostrar", id: "card:inventado" }, { tipo: "mostrar", id: "card:ebitda-mes" }]).map((a) => a.id).join() === "card:ebitda-mes");

  // o chat diz o que mudou
  const frasesCom = descreverMudancas(LAYOUT_PADRAO, com, interpretarPedido("coloca a inadimplência e o EBITDA")).join(" ");
  ok("chat: diz os cards que entraram", /Na Home agora, no topo de "Seu painel": Inadimplência/.test(frasesCom), frasesCom);
  ok("chat: diz os cards que saíram", /Fora da Home: Inadimplência/.test(descreverMudancas(com, sem, interpretarPedido("tira a inadimplência", com)).join(" ")));

  // descoberta
  ok("catálogo: \"o que mais dá para colocar?\" é pergunta de catálogo (todos os temas)", pedeCatalogo("o que mais dá para colocar?") === null);
  ok("catálogo: pergunta com tema filtra o tema", pedeCatalogo("que cards de cobrança existem?") === "Cobrança", String(pedeCatalogo("que cards de cobrança existem?")));
  ok("catálogo: pedido de pôr não é pergunta de catálogo", pedeCatalogo("coloca o EBITDA") === undefined && pedeCatalogo("bom dia") === undefined);
  const lista = catalogoPorTema(LAYOUT_PADRAO, null);
  ok("catálogo: lista um tema por linha, todos os temas", lista.length === TEMAS_CARD.length, String(lista.length));
  const nomesDe = (l: string[]) => l.flatMap((x) => x.replace(/^[^:]+: /, "").replace(/\.$/, "").split(", "));
  ok("catálogo: quem já está na Home não é oferecido", !nomesDe(catalogoPorTema(com, "Cobrança")).includes("Inadimplência") && nomesDe(catalogoPorTema(LAYOUT_PADRAO, "Cobrança")).includes("Inadimplência"), catalogoPorTema(com, "Cobrança").join(" | "));
  const rc = respostaDoCatalogo(LAYOUT_PADRAO, null);
  ok("catálogo: a resposta não muda a Home nem oferece desfazer", rc.mudou === false && rc.mudancas.length > 0);

  // a tela e a rota
  const TELA_C = readFileSync(new URL("../src/components/visao-geral/HomeSnapshot.tsx", import.meta.url), "utf8");
  const ROTA_C = readFileSync(new URL("../src/app/api/ai/home-layout/route.ts", import.meta.url), "utf8");
  ok("tela: o card é desenhado pelo MESMO catálogo do cockpit", /CATALOG_BY_ID\.get\(idDoCockpit/.test(TELA_C) && /useCockpitCtx\(\)/.test(TELA_C));
  ok("tela: cada card tem como sair da Home", /Tirar \$\{[^}]+\} da Home/.test(TELA_C));
  ok("tela: o motor pesado só monta com card na Home", /cardsVisiveis\.length > 0 && \(\s*<CardsDaBiblioteca/.test(TELA_C));
  ok("tela: os cards moram dentro de \"Seu painel\", sem seção \"Seus cards\"", !/Seus cards/.test(TELA_C) && /Seu painel<\/h2>[\s\S]{0,700}?\{cardsVisiveis\.length > 0/.test(TELA_C));
  // "Ajustar prioridades" mora ao lado do título "Seu painel" (dono, 16/10/2026), não na caixa da IA.
  ok("tela: \"Ajustar prioridades\" ao lado de \"Seu painel\"",
    /Seu painel<\/h2>[\s\S]{0,400}?Ajustar prioridades/.test(TELA_C) && !/function CaixaIA[\s\S]*?Ajustar prioridades[\s\S]*?function MicIcon/.test(TELA_C));

  // A LARGURA dos cards (dono, 16/10/2026): arrastar a borda; no máximo quatro por linha.
  ok("largura: a menor é um quarto da linha (no máximo 4 por linha)", Math.min(...LARGURAS_HOME) === 3 && larguraMaisPerto(0.01) === 3);
  ok("largura: encaixa na mais perto", larguraMaisPerto(0.5) === 6 && larguraMaisPerto(0.7) === 8 && larguraMaisPerto(1.4) === 12);
  ok("largura: as setas param nas pontas", larguraVizinha(3, -1) === 3 && larguraVizinha(12, 1) === 12 && larguraVizinha(6, 1) === 8);
  const largo = definirLargura(LAYOUT_PADRAO, "caixa", 9);
  ok("largura: gravada no arranjo e conta como mudança", larguraDe(largo, "caixa") === 9 && !mesmoLayout(largo, LAYOUT_PADRAO));
  ok("largura: a padrão não é guardada", definirLargura(largo, "caixa", larguraDe(LAYOUT_PADRAO, "caixa")).larguras === undefined);
  const lido = normalizarLayout({ ...largo, larguras: { caixa: 9, arr: 5, inventado: 6 } });
  ok("largura: o servidor só devolve larguras válidas de itens existentes", JSON.stringify(lido?.larguras) === JSON.stringify({ caixa: 9 }), JSON.stringify(lido?.larguras));
  ok("largura: mover e esconder não perdem a largura; \"volta ao padrão\" desfaz",
    larguraDe(moverItem(largo, "caixa", "arr"), "caixa") === 9
      && larguraDe(aplicarAcoes(largo, [{ tipo: "esconder", id: "burn" }]), "caixa") === 9
      && aplicarAcoes(largo, [{ tipo: "restaurar" }]).larguras === undefined);
  ok("tela: a borda do card é um separador que arrasta e responde às setas",
    /role="separator"/.test(TELA_C) && /larguraMaisPerto\(/.test(TELA_C) && /aoPasso\(-1\)/.test(TELA_C) && /lg:grid-cols-12/.test(TELA_C));

  // pedidos com outras palavras (14/10/2026: "coloque as movimentacoes do meu mes" não era entendido)
  ok("texto livre: \"coloque as movimentações do meu mês\" acha o card", interpretarPedido("coloque as movimentacoes do meu mes").some((a) => a.id === "card:movimentos-mes"), JSON.stringify(interpretarPedido("coloque as movimentacoes do meu mes")));
  ok("texto livre: saudação não vira item", itemAproximado("bom dia") === null && interpretarPedido("bom dia, tudo bem?").length === 0);
  ok("texto livre: palavra que serve a muitos itens não escolhe um ao acaso", itemAproximado("mês") === null && itemAproximado("coloca o do mês") === null);
  ok("texto livre: o nome de um tema lista os cards dele", pedeCatalogo("Resumo executivo:") === "Resumo executivo" && pedeCatalogo("quero ver o resumo executivo") === "Resumo executivo");
  ok("texto livre: tema com item citado é pedido, não catálogo", pedeCatalogo("coloca o EBITDA do resultado do mês") === undefined);
  ok("rota: o prompt explica os cards da biblioteca e o teto", /card:/.test(ROTA_C) && /TETO_CARDS/.test(ROTA_C));
}

// ─── O RODÍZIO DAS PÍLULAS DO CHAT (16/10/2026) ───
{
  const R = await import("../src/core/home/rodizio.ts");
  const { BANCO_EMPRESA, BANCO_PESSOAL } = await import("../src/core/home/banco-sugestoes.ts");
  const HOJE = "2026-10-16";
  const base = { tipoConta: "empresa" as const, hoje: HOJE, rodada: 0 };
  const ids = (e: Parameters<typeof R.girarPilulas>[0]) => R.girarPilulas(e).map((p) => p.id);
  const r0 = ids(base);
  ok("rodízio: 100+ perguntas novas no banco", BANCO_EMPRESA.length + BANCO_PESSOAL.length >= 100, String(BANCO_EMPRESA.length + BANCO_PESSOAL.length));
  ok("rodízio: o banco entra no catálogo com rótulo e ícone", [...BANCO_EMPRESA, ...BANCO_PESSOAL].every(([id]) => CATALOGO_SUGESTOES.some((c) => c.id === id) && !!ROTULOS[id]));
  ok("rodízio: o banco não mexe na Home (sem base nem regra)", CATALOGO_SUGESTOES.filter((c) => BANCO_EMPRESA.some(([id]) => id === c.id)).every((c) => c.base === 0 && c.regras.length === 0));
  ok("rodízio: doze pílulas, sem repetida", r0.length === R.PILULAS_NO_CHAT && new Set(r0).size === r0.length, String(r0.length));
  ok("rodízio: determinístico na mesma rodada", JSON.stringify(r0) === JSON.stringify(ids(base)));
  const temas0 = new Map<string, number>();
  for (const p of R.girarPilulas(base)) temas0.set(p.tema, (temas0.get(p.tema) ?? 0) + 1);
  ok("rodízio: no máximo três por tema", Math.max(...Array.from(temas0.values())) <= R.MAX_POR_TEMA_CHAT);
  ok("rodízio: só o público certo", ids({ ...base, tipoConta: "pessoal" }).every((id) => CATALOGO_SUGESTOES.find((c) => c.id === id)?.publico === "pessoal"));
  const r1 = ids({ ...base, rodada: 1, anteriores: r0 });
  const iguais = r1.filter((id) => r0.includes(id)).length;
  ok("rodízio: a lista MUDA depois de uma resposta", iguais <= 8, `${iguais} de 12 repetidas`);
  const resp = r0[0];
  ok("rodízio: a respondida nesta conversa some", !ids({ ...base, rodada: 1, respondidasAgora: [resp] }).includes(resp) && !ids({ ...base, respondidasAgora: [resp] }).includes(resp));
  ok("rodízio: a respondida há pouco fica fora por alguns dias", !ids({ ...base, respondidas: { [resp]: "2026-10-15" } }).includes(resp));
  const volta = Array.from({ length: 12 }, (_, i) => ids({ ...base, rodada: i, respondidas: { [resp]: "2026-10-01" } })).some((l) => l.includes(resp));
  ok("rodízio: passados os dias, ela volta ao rodízio", volta && R.respondidaRecente("2026-10-15", HOJE) && !R.respondidaRecente("2026-10-13", HOJE) && !R.respondidaRecente("lixo", HOJE));
  const fiscal = ids({ ...base, temas: { impostos: 9 } }).filter((id) => CATALOGO_SUGESTOES.find((c) => c.id === id)?.tema === "impostos").length;
  const fiscal0 = r0.filter((id) => CATALOGO_SUGESTOES.find((c) => c.id === id)?.tema === "impostos").length;
  ok("rodízio: APRENDE — quem pergunta de imposto vê mais imposto (até o teto)", fiscal === R.MAX_POR_TEMA_CHAT && fiscal > fiscal0, `${fiscal0} → ${fiscal}`);
  const folhaCliq = CATALOGO_SUGESTOES.filter((c) => c.tema === "folha" && c.publico === "empresa").slice(0, 2).map((c) => c.id);
  const comCliques = ids({ ...base, cliques: Object.fromEntries(folhaCliq.map((id) => [id, 4])) });
  ok("rodízio: os cliques puxam o tema também", comCliques.filter((id) => CATALOGO_SUGESTOES.find((c) => c.id === id)?.tema === "folha").length === R.MAX_POR_TEMA_CHAT);
  ok("rodízio: o último assunto puxa perguntas do mesmo tema", ids({ ...base, ultimoTema: "risco" }).filter((id) => CATALOGO_SUGESTOES.find((c) => c.id === id)?.tema === "risco").length >= 2);
  const pri = ["quem-deve", "runway"];
  ok("rodízio: a prioridade de hoje (Home) entra", pri.every((id) => ids({ ...base, prioridade: pri }).includes(id)));
  ok("rodízio: o motivo diz por que a pílula apareceu", R.girarPilulas({ ...base, temas: { impostos: 9 } }).some((p) => /imposto/.test(p.motivo)));
  ok("rodízio: a pergunta digitada acha o tema", R.temaDaPergunta("quanto pago de imposto este mês?") === "impostos" && R.temaDaPergunta("quanto custa contratar um CLT?") === "folha" && R.temaDaPergunta("qual meu saldo?") === "caixa" && R.temaDaPergunta("bom dia") === null);
  const amostra = CATALOGO_SUGESTOES.find((c) => c.id === resp)!;
  ok("rodízio: a pergunta igual à de uma pílula conta como ela", R.pilulaDaPergunta(amostra.texto.toUpperCase() + "  ", amostra.publico) === amostra.id && R.pilulaDaPergunta("outra coisa", "empresa") === null);
  // defeito plantado: sem tirar as respondidas, a guarda tem de reprovar
  const plantado = CATALOGO_SUGESTOES.filter((c) => c.publico === "empresa").slice(0, 12).map((c) => c.id);
  ok("rodízio: (defeito plantado) uma lista que não tira a respondida reprova", plantado.includes(plantado[0]) && !ids({ ...base, respondidasAgora: [plantado[0]] }).includes(plantado[0]));
  const CHAT = readFileSync(new URL("../src/components/ia/ChatTelaCheia.tsx", import.meta.url), "utf8");
  ok("chat: as pílulas saem do rodízio, e a respondida some na RESPOSTA (não no clique)",
    /girarPilulas\(/.test(CHAT) && /setRespondidasAgora/.test(CHAT) && /fonte === "carregando"/.test(CHAT) && /respondidas: id \?/.test(CHAT));
  ok("prefs: temas e respondidas seguem a pessoa (servidor + dispositivo)",
    /LOCAL_TEMAS/.test(LIB) && /LOCAL_RESPONDIDAS/.test(LIB) && /"a4p_home_temas"/.test(readFileSync(new URL("../src/lib/store-org.ts", import.meta.url), "utf8")));
}

// ── O card "Transações recentes na maquininha" (16/10/2026) ──
{
  const V = (nsu: number, status: string, valor: number, ocorridoEm: string, extra: Record<string, unknown> = {}) => ({ nsu, status, valor, ocorridoEm, ...extra });
  const p = montarPainelMaquininha([
    V(1, "Aprovada", 100, "2026-10-16T13:00:00Z", { formaPagamento: "DEBITO", bandeira: "VISA" }),
    V(2, "Negada", 50, "2026-10-16T14:00:00Z", { formaPagamento: "AVISTA", bandeira: "MASTERCARD" }),
    V(3, "Aprovada", 200.1, "2026-10-17T01:30:00Z", { formaPagamento: "PARCELADO_LOJA", numeroParcelas: "3", bandeira: "ELO" }),
    V(4, "Aprovada", 30, "2026-10-15T12:00:00Z", { ehPix: true }),
  ], "2026-10-16", 3);
  ok("maquininha: a mais recente primeiro e o limite vale", p.vendas.map((v) => v.nsu).join() === "3,2,1", JSON.stringify(p.vendas.map((v) => v.nsu)));
  // 22h30 em São Paulo do dia 16 é 01h30 UTC do dia 17: conta como HOJE.
  ok("maquininha: o dia é o de São Paulo, não o de UTC", diaEHora("2026-10-17T01:30:00Z").dia === "2026-10-16" && diaEHora("2026-10-17T01:30:00Z").hora === "22:30");
  // Defeito plantado: somar a negada daria 350,10; somar a de ontem, 330,10.
  ok("maquininha: hoje soma só as APROVADAS do dia", p.hoje.total === 300.1 && p.hoje.quantidade === 2, JSON.stringify(p.hoje));
  ok("maquininha: a forma escrita como se lê", p.vendas[0].descricao === "Crédito 3x · Elo" && p.vendas[2].descricao === "Débito · Visa" && montarPainelMaquininha([V(9, "Aprovada", 1, "2026-10-16T12:00:00Z", { ehPix: true, bandeira: "VISA" })], "2026-10-16").vendas[0].descricao === "Pix");
  ok("maquininha: sem venda, lista vazia e zero (não quebra)", montarPainelMaquininha([], "2026-10-16").hoje.total === 0);
  ok("maquininha: valor inválido não entra", montarPainelMaquininha([V(5, "Aprovada", Number.NaN, "2026-10-16T12:00:00Z")], "2026-10-16").vendas.length === 0);
}


// ── A página "Maquininha Quattro" e o filtro do card (19/10/2026) ──
{
  const V = (nsu: number, status: string, valor: number, quando: string, extra: Record<string, unknown> = {}) =>
    ({ nsu, status, valor, ocorridoEm: new Date(`${quando}-03:00`).toISOString(), ...extra });
  const vendas = [
    V(1, "Aprovada", 100, "2026-10-15T10:00:00", { formaPagamento: "DEBITO", bandeira: "VISA", vinculoId: "A" }),
    V(2, "Aprovada", 200, "2026-10-13T15:00:00", { formaPagamento: "AVISTA", bandeira: "MASTERCARD", vinculoId: "B" }),
    V(3, "Negada", 50, "2026-10-14T11:00:00", { formaPagamento: "DEBITO", bandeira: "ELO", vinculoId: "A" }),
    V(4, "Pendente", 70, "2026-10-15T11:00:00", { formaPagamento: "DEBITO", vinculoId: "A" }),
    V(5, "Aprovada", 150, "2026-10-08T09:00:00", { ehPix: true, vinculoId: "A" }),
    V(6, "Aprovada", 999, "2026-10-09T09:00:00", { ehPix: true, vinculoId: "A" }),
    V(7, "Aprovada", 400, "2026-09-20T09:00:00", { formaPagamento: "PARCELADO_LOJA", numeroParcelas: "2", bandeira: "VISA", vinculoId: "A" }),
  ];
  const T = (chave: string, type: "entrada" | "saida", amount: number, due_date: string, situacao = "previsto") => ({ chave, type, amount, due_date, situacao });
  const titulos = [
    T("pinbank:1:1:r", "entrada", 100, "2026-10-16"), T("pinbank:1:1:t", "saida", 1.49, "2026-10-16"), T("pinbank:1:1:f", "saida", 1, "2026-10-16"),
    T("pinbank:2:1:r", "entrada", 200, "2026-11-12"), T("pinbank:2:1:t", "saida", 5.98, "2026-11-12"),
    T("pinbank:2:1:a", "saida", 99, "2026-11-12", "cancelado"),
    T("pinbank:5:1:r", "entrada", 150, "2026-10-10"),
    T("outra:1", "entrada", 5000, "2026-10-20"),
  ];
  const hoje = "2026-10-15"; // quinta-feira
  const sem = RM.montarRelatorioMaquininha(vendas, titulos, hoje, "semana");
  ok("relatório: a semana vai de segunda a domingo", sem.janela.de === "2026-10-12" && sem.janela.fim === "2026-10-18" && RM.janelaMaquininha("semana", "2026-10-18").de === "2026-10-12");
  // Defeito plantado: somar a negada e a pendente daria 420.
  ok("relatório: o vendido soma só as APROVADAS do período", sem.resumo.vendido === 300 && sem.resumo.quantidade === 2 && sem.resumo.ticketMedio === 150, JSON.stringify(sem.resumo));
  // Defeito plantado: comparar com a semana passada INTEIRA daria 1.149 (a sexta entraria).
  ok("relatório: compara com o mesmo trecho da semana passada", sem.resumo.vendidoAnterior === 150 && sem.resumo.variacao === 1, JSON.stringify(sem.janela.anterior));
  ok("relatório: a pendente fica fora da taxa de aprovação", sem.resumo.tentativas === 3 && Math.abs((sem.resumo.aprovacao ?? 0) - 2 / 3) < 1e-9 && sem.resumo.recusadas[0]?.status === "Negada");
  ok("relatório: formas e bandeiras somam o vendido", sem.porForma.map((f) => `${f.chave}:${f.valor}`).join() === "debito:100,credito_vista:200" && sem.porBandeira.reduce((s, f) => s + f.valor, 0) === 300);
  ok("relatório: a evolução traz a semana inteira, com os dias futuros marcados", sem.evolucao.length === 7 && sem.evolucao.filter((p) => p.futuro).length === 3 && sem.evolucao[0].label === "Seg 12");
  // Defeito plantado: somar o título cancelado levaria a antecipação a 99 e o líquido a 192,53.
  ok("relatório: custo e líquido saem dos títulos VIVOS das vendas do período", !!sem.custos && sem.custos.taxa === 7.47 && sem.custos.tarifa === 1 && sem.custos.antecipacao === 0 && sem.custos.liquido === 291.53 && sem.custos.vendasComTitulo === 2, JSON.stringify(sem.custos));
  ok("relatório: a agenda é líquida, por dia, e o vencido não baixado fica à parte", sem.agenda.dias.length === 2 && sem.agenda.dias[0].valor === 97.51 && sem.agenda.dias[0].rotulo === "Amanhã" && sem.agenda.total === 291.53 && sem.agenda.atrasado === 150, JSON.stringify(sem.agenda));
  ok("relatório: sem título, o custo é AUSENTE (nunca zero)", RM.montarRelatorioMaquininha(vendas, [], hoje, "semana").custos === null);
  const dia = RM.montarRelatorioMaquininha(vendas, titulos, hoje, "dia");
  ok("relatório: hoje, sem venda ontem, a variação é ausente", dia.resumo.vendido === 100 && dia.resumo.variacao === null && dia.evolucao.length === 12);
  const mes = RM.montarRelatorioMaquininha(vendas, titulos, hoje, "mes");
  ok("relatório: o mês vai do dia 1 até hoje", mes.resumo.vendido === 1449 && mes.janela.anterior.de === "2026-09-01" && mes.janela.anterior.ate === "2026-09-15" && mes.evolucao.length === 31);
  ok("relatório: dia 31 compara com o último dia do mês curto", RM.janelaMaquininha("mes", "2026-03-31").anterior.ate === "2026-02-28");
  const linhaQui = mes.calor.linhas.indexOf("Qui");
  ok("relatório: o mapa de calor olha 4 semanas, por dia e horário", mes.calor.de === "2026-09-18" && mes.calor.valores[linhaQui][2] === 100 && mes.calor.maximo === 999);
  ok("relatório: vendas por maquininha", sem.porMaquininha.map((m) => `${m.vinculoId}:${m.valor}`).sort().join() === "A:100,B:200");
  ok("relatório: o dia da semana de cada venda", sem.vendas.find((v) => v.nsu === 1)?.semana === "Qui" && RM.diaDaSemana("2026-10-19") === "Seg");
  ok("relatório: a chave do título é lida pelo papel", RM.lerChaveTitulo("pinbank:12:3:a")?.papel === "antecipacao" && RM.lerChaveTitulo("pinbank:12:estorno:1")?.papel === "estorno" && RM.lerChaveTitulo("outra:1") === null);
  const plan = RM.linhasPlanilhaMaquininha(sem, (id) => id ?? "?");
  ok("relatório: a planilha leva todas as vendas do período, da mais antiga à mais nova", plan.length === 1 + sem.vendas.length && plan[1][3] === 2 && plan[0][0] === "Data");
  const demo = RM.planejarTitulosDemo([V(8, "Aprovada", 100, "2026-10-15T10:00:00", { formaPagamento: "PARCELADO_LOJA", numeroParcelas: "3" })], hoje);
  const rec = demo.filter((t) => t.chave?.endsWith(":r"));
  ok("relatório: (demonstração) o parcelado fecha ao centavo", rec.length === 3 && Math.round(rec.reduce((s, t) => s + t.amount * 100, 0)) === 10000);
  ok("relatório: sem venda nenhuma não quebra", RM.montarRelatorioMaquininha([], [], hoje, "mes").resumo.ticketMedio === null);
  const CARD = readFileSync(new URL("../src/components/visao-geral/MaquininhaRecentes.tsx", import.meta.url), "utf8");
  ok("card: o filtro Hoje/Semana/Mês e o total do período", /SeletorPeriodoMaquininha/.test(CARD) && /montarRelatorioMaquininha\(/.test(CARD) && /v\.semana/.test(CARD));
}

// ── SALDO TOTAL EM CONTAS (27/10/2026): o card principal da Home ──
{
    const r = saldoEmContas([
    { id: "a", name: "Itaú · Conta Movimento", bank: "itau", balance: 1000.1 },
    { id: "b", name: "Itaú · Reserva", bank: "itau", balance: 0.2 },
    { id: "c", name: "Inter Empresas", bank: "inter", balance: 3000 },
    { id: "d", name: "Nubank PJ", bank: "nubank", balance: -500 },
  ]);
  ok("contas: o total é a soma de todas, ao centavo", r.total === 3500.3, String(r.total));
  ok("contas: duas contas do mesmo banco viram UMA bolinha", r.bancos.length === 3 && r.bancos.find((b) => b.banco === "itau")?.contas === 2 && r.bancos.find((b) => b.banco === "itau")?.saldo === 1000.3);
  ok("contas: o maior saldo primeiro", r.bancos[0].banco === "inter");
  ok("contas: a parte divide só o positivo e o negativo não ganha parte", r.bancos.find((b) => b.banco === "nubank")?.parte === 0 && Math.abs(r.bancos.reduce((s, b) => s + (b.parte ?? 0), 0) - 1) < 1e-9);
  const vazio = saldoEmContas([]);
  ok("contas: sem conta, zero contas (a tela diz que falta conta, não R$ 0,00)", vazio.contas === 0 && vazio.bancos.length === 0);
  const TELA_CONTAS = readFileSync(new URL("../src/components/visao-geral/SaldoEmContas.tsx", import.meta.url), "utf8");
  ok("contas: o card não soma nada por conta própria", !/\.reduce\(/.test(TELA_CONTAS) && /saldoEmContas\(/.test(TELA_CONTAS));
}


console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — sugestões da Home (${empresa.length} de empresa, ${CATALOGO_SUGESTOES.length - empresa.length} pessoais)`);
if (fails > 0) process.exit(1);
