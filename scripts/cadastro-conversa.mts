/**
 * GUARDA DO CADASTRO PELA CONVERSA (`core/cadastro/conversa`).
 *
 * Dirige a conversa inteira, pergunta a pergunta, como a tela faz, e exige
 * que no fim o portão (`faltandoParaCriar`) esteja vazio — e que, pulando
 * qualquer pergunta obrigatória, ele NÃO esteja. É a prova de que a conversa
 * pede tudo o que o cadastro de sete passos pedia: a de três perguntas
 * deixava o cliente entrar sem CNPJ, regime, representante, perfil e estrutura.
 */
import {
  CADASTRO_VAZIO, PERGUNTAS, aplicarReceita, cnpjConfere, cpfConfere, faltandoParaCriar, mascararCEP,
  mascararCNPJ, mascararCPF, mascararTelefone, montarCadastro, nomeDaOrganizacao, proximaPergunta,
  type Cadastro, type Pergunta,
} from "../src/core/cadastro/conversa.ts";

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  if (!cond) falhas++;
  console.log(`${cond ? "✓" : "✗"} ${nome}`);
};

const TEXTOS: Record<string, string> = {
  razaoSocial: "Padaria Bom Pão Ltda", fantasia: "Bom Pão", cep: "01310100", cidade: "São Paulo / SP", numero: "100",
  ie: "123456789", im: "", repNome: "Ana Souza", repCargo: "CEO", repTelefone: "11987654321",
  repEmail: "ana@bompao.com.br", descricao: "", nome: "Carlos Lima", rendaMensal: "8.000,00",
  saldoInicial: "1500", orcamento: "5000", descricaoPf: "", emailPf: "carlos@exemplo.com",
};

function resposta(p: Pergunta, c: Cadastro): string {
  if (p.tipo === "escolha") {
    const ops = p.opcoes?.(c) ?? [];
    if (ops.includes("Sim")) return "Sim"; // ICMS = Sim força a pergunta da IE
    return ops.find((o) => !/não aprovo/i.test(o)) ?? ops[0] ?? "";
  }
  if (p.tipo === "multi") return (p.opcoes?.(c) ?? []).slice(0, 2).join("\n");
  return TEXTOS[p.id] ?? "x";
}

/** Dirige a conversa; `pular` simula a pergunta que a tela deixasse de fazer. */
function conversar(inicio: Cadastro, pular?: string): { c: Cadastro; feitas: string[] } {
  let c = inicio;
  const feitas = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const p = proximaPergunta(c, feitas);
    if (!p) break;
    feitas.add(p.id);
    if (p.id === pular) continue;
    const v = resposta(p, c);
    const recusa = p.validar?.(v, c) ?? null;
    if (recusa) throw new Error(`a pergunta ${p.id} recusou a resposta "${v}": ${recusa}`);
    c = p.aplicar(c, v);
    if (p.id === "cep") c = { ...c, estado: c.estado || "SP" }; // o ViaCEP, na tela
  }
  return { c, feitas: [...feitas] };
}

/* máscaras e dígitos verificadores */
ok("CNPJ mascarado enquanto digita", mascararCNPJ("112223") === "11.222.3" && mascararCNPJ("11222333000181") === "11.222.333/0001-81");
ok("CNPJ não passa de 14 números", mascararCNPJ("112223330001819999") === "11.222.333/0001-81");
ok("CPF mascarado", mascararCPF("52998224725") === "529.982.247-25");
ok("telefone mascarado", mascararTelefone("11987654321") === "(11) 98765-4321");
ok("CEP mascarado", mascararCEP("01310100") === "01310-100");
ok("CNPJ válido confere", cnpjConfere("11.222.333/0001-81"));
ok("CNPJ com DV errado é recusado", !cnpjConfere("11.222.333/0001-82"));
ok("CNPJ de dígitos repetidos é recusado", !cnpjConfere("11111111111111"));
ok("CPF válido confere", cpfConfere("529.982.247-25") && !cpfConfere("529.982.247-24"));

/* PJ sem a Receita: a conversa pede os dados à mão */
const pjInicio: Cadastro = { ...CADASTRO_VAZIO, tipo: "pj", cnpj: "11.222.333/0001-81" };
const pjManual = conversar(pjInicio);
ok("PJ sem Receita: a conversa completa o cadastro", faltandoParaCriar(pjManual.c).length === 0);
ok("PJ sem Receita: pergunta a razão social", pjManual.feitas.includes("razaoSocial"));
ok("PJ: ICMS = Sim pergunta a inscrição estadual", pjManual.feitas.includes("ie"));

/* PJ com a Receita confirmada: não repete o que a Receita deu */
const comReceita = aplicarReceita(pjInicio, {
  razaoSocial: "Padaria Bom Pão Ltda", nomeFantasia: "Bom Pão", cep: "01310100", logradouro: "Av. Paulista",
  numero: "100", bairro: "Bela Vista", municipio: "São Paulo", uf: "SP", simples: true,
});
const pjReceita = conversar(comReceita);
ok("PJ com Receita: completa o cadastro", faltandoParaCriar(pjReceita.c).length === 0);
ok("PJ com Receita: não repete razão social nem CEP", !pjReceita.feitas.includes("razaoSocial") && !pjReceita.feitas.includes("cep"));
ok("PJ: pede regime, representante, perfil e estrutura",
  ["regime", "repNome", "repTelefone", "repEmail", "limite", "setor", "faturamento", "bancos", "contaTipos", "dre", "fluxoCaixa"].every((id) => pjReceita.feitas.includes(id)));

/* ⚠️ O PORTÃO: pular qualquer pergunta obrigatória deixa o portão fechado */
const obrigatoriasPJ = pjManual.feitas.filter((id) => !PERGUNTAS.find((p) => p.id === id)?.opcional);
const furosPJ = obrigatoriasPJ.filter((id) => faltandoParaCriar(conversar(pjInicio, id).c).length === 0);
ok(`PJ: pular qualquer uma das ${obrigatoriasPJ.length} obrigatórias fecha o portão${furosPJ.length ? ` (furos: ${furosPJ.join(", ")})` : ""}`, furosPJ.length === 0);

/* PF */
const pfInicio: Cadastro = { ...CADASTRO_VAZIO, tipo: "pf", cpf: "529.982.247-25" };
const pfFim = conversar(pfInicio);
ok("PF: completa o cadastro", faltandoParaCriar(pfFim.c).length === 0);
ok("PF: não pergunta nada de empresa", !pfFim.feitas.some((id) => ["regime", "repNome", "setor", "razaoSocial"].includes(id)));
const obrigatoriasPF = pfFim.feitas.filter((id) => !PERGUNTAS.find((p) => p.id === id)?.opcional);
const furosPF = obrigatoriasPF.filter((id) => faltandoParaCriar(conversar(pfInicio, id).c).length === 0);
ok(`PF: pular qualquer uma das ${obrigatoriasPF.length} obrigatórias fecha o portão${furosPF.length ? ` (furos: ${furosPF.join(", ")})` : ""}`, furosPF.length === 0);

/* sem tipo, nada nasce */
ok("sem tipo de conta o portão fica fechado", faltandoParaCriar({ ...CADASTRO_VAZIO, email: "a@b.com" }).length > 0);

/* o que vai para o sistema */
const m = montarCadastro(pjReceita.c);
ok("PJ montado: CNPJ, razão social e regime no cadastro", m.db.cnpj === "11.222.333/0001-81" && m.db.razaoSocial === "Padaria Bom Pão Ltda" && !!m.db.regime);
ok("PJ montado: o representante é o primeiro participante", m.participantes[0]?.nome === "Ana Souza" && m.participantes[0]?.email === "ana@bompao.com.br");
ok("PJ montado: a estrutura tem contas, centros e DRE", m.estrutura.contas.length > 0 && m.estrutura.centrosCusto.length > 0 && m.estrutura.dre.length > 0);
ok("o nome da organização é a razão social", nomeDaOrganizacao(pjReceita.c) === "Padaria Bom Pão Ltda");
ok("PF: o e-mail de acesso é o digitado", pfFim.c.email === "carlos@exemplo.com" && montarCadastro(pfFim.c).pessoal?.rendaMensal === 8000);

if (falhas) {
  console.log(`\n✗ ${falhas} falha(s) no cadastro pela conversa`);
  process.exit(1);
}
console.log("\n✓ cadastro pela conversa: a conta só nasce completa");
