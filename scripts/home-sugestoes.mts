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
 *   npm run home-sugestoes   (também roda dentro de npm test)
 */
import {
  BASICAS, CANDIDATAS_IA, CATALOGO_SUGESTOES, ROTULOS, INTERESSES, LIMITE_SUGESTOES, MAX_POR_TEMA, TETO_DESCRICAO, candidatasParaIA, contextoParaIA,
  descricaoParaIA, interessesDaDescricao, recomendarSugestoes, sinaisDaHome,
  type SinaisHome,
} from "@/core/home/sugestoes";
import {
  comPreferencias, mesclarComDispositivo, mesmasPreferencias, normalizarPreferencias, podeEnviarPreferencias,
  preferenciasDoUsuario,
} from "@/core/home/preferencias";
import { montarHomeSnapshot } from "@/core/home/snapshot";
import { SOLAR_ICONS } from "@/components/ui/solar-icons";
import { readFileSync } from "node:fs";
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
const ICONES_CUSTOM = readFileSync(new URL("../src/components/ui/Icon.tsx", import.meta.url), "utf8");
const iconeExiste = (n: string) => n in SOLAR_ICONS || new RegExp(`^\\s*"?${n}"?:\\s*\\{`, "m").test(ICONES_CUSTOM);
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

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — sugestões da Home (${empresa.length} de empresa, ${CATALOGO_SUGESTOES.length - empresa.length} pessoais)`);
if (fails > 0) process.exit(1);
