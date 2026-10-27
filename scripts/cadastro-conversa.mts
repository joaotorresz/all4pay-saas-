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
  mascararCNPJ, mascararCPF, mascararTelefone, montarCadastro, nomeDaOrganizacao, proximoPasso,
  lerDocumentoIdentidade, problemaDaSenha, passosEspeciais, lerSobreAEmpresa, pedidoDaMaquininha,
  OPCOES_MAQUININHA, ENTREGA_OUTRO, PARA_COMPLETAR_DEPOIS,
  type Cadastro, type Pergunta,
} from "../src/core/cadastro/conversa.ts";
import { validarPedido } from "../src/core/maquininha/oferta.ts";

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  if (!cond) falhas++;
  console.log(`${cond ? "✓" : "✗"} ${nome}`);
};

const TEXTOS: Record<string, string> = {
  razaoSocial: "Padaria Bom Pão Ltda", fantasia: "Bom Pão", cep: "01310100", cidade: "São Paulo / SP", numero: "100",
  repNome: "Ana Souza", repTelefone: "11987654321", repEmail: "ana@bompao.com.br",
  sobre: "Vendemos pães e doces para consumidores do bairro.", nome: "Carlos Lima", rendaMensal: "8.000,00",
  sobrePf: "Quero controlar os gastos do mês", emailPf: "carlos@exemplo.com",
  maquininhaEC: "123456", maquininhaEndereco: "Rua das Flores, 10, Centro, São Paulo / SP",
};

/** `escolhas`: a resposta de uma pergunta de escolha (senão, a primeira opção). */
function resposta(p: Pergunta, c: Cadastro, escolhas: Record<string, string>, textos: Record<string, string>): string {
  if (escolhas[p.id]) return escolhas[p.id];
  if (p.tipo === "escolha") return (p.opcoes?.(c) ?? [])[0] ?? "";
  if (p.tipo === "multi") return (p.opcoes?.(c) ?? []).slice(0, 2).join("\n");
  return textos[p.id] ?? TEXTOS[p.id] ?? "x";
}

/** Dirige a conversa; `pular` simula a pergunta (ou o cartão) que a tela deixasse de fazer. */
function conversar(inicio: Cadastro, pular?: string, escolhas: Record<string, string> = {}, textos: Record<string, string> = {}): { c: Cadastro; feitas: string[] } {
  let c = inicio;
  const feitas = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const passo = proximoPasso(c, feitas);
    if (!passo) break;
    if ("especial" in passo) {
      // Os cartões da tela: termos, rosto, documento, documento da empresa e a senha.
      const id = passo.especial;
      feitas.add(id);
      if (id === pular) continue;
      if (id === "termos") c = { ...c, aceiteTermos: "2026-10-20T12:00:00.000Z" };
      if (id === "facial") c = { ...c, biometria: "capturada" };
      if (id === "docIdentidade") c = { ...c, docTipo: "rg", documento: "enviado" };
      if (id === "docEmpresa") c = { ...c, docEmpresa: c.tipo === "pj" ? "contrato" : "comprovante" };
      if (id === "senha") c = { ...c, senhaAcesso: "definida" };
      continue;
    }
    const p = passo.pergunta;
    feitas.add(p.id);
    if (p.id === pular) continue;
    const v = resposta(p, c, escolhas, textos);
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
ok("PJ sem Receita: pergunta a razão social, o CEP e o número", ["razaoSocial", "cep", "numero"].every((id) => pjManual.feitas.includes(id)));

/* PJ com a Receita confirmada: não repete o que a Receita deu */
const comReceita = aplicarReceita(pjInicio, {
  razaoSocial: "Padaria Bom Pão Ltda", nomeFantasia: "Bom Pão", cep: "01310100", logradouro: "Av. Paulista",
  numero: "100", bairro: "Bela Vista", municipio: "São Paulo", uf: "SP", simples: true,
});
const pjReceita = conversar(comReceita);
ok("PJ com Receita: completa o cadastro", faltandoParaCriar(pjReceita.c).length === 0);
ok("PJ com Receita: não repete razão social nem CEP", !pjReceita.feitas.includes("razaoSocial") && !pjReceita.feitas.includes("cep"));

/* ⚠️ A ORDEM DA ABERTURA (27/10/2026) */
ok("PJ: nome, WhatsApp, e-mail, termos, rosto, documento, documento da empresa e senha vêm primeiro",
  pjReceita.feitas.slice(0, 8).join(",") === "repNome,repTelefone,repEmail,termos,facial,docIdentidade,docEmpresa,senha");
ok("PF: a mesma ordem, com o nome e o e-mail da pessoa", pfOrdem().slice(0, 8).join(",") === "nome,repTelefone,emailPf,termos,facial,docIdentidade,docEmpresa,senha");
ok("passos de cartão: 5, e 4 com o Google (sem senha)", passosEspeciais({ ...CADASTRO_VAZIO, tipo: "pj" }) === 5 && passosEspeciais({ ...CADASTRO_VAZIO, tipo: "pf", senhaAcesso: "google" }) === 4);
ok("PJ: depois da abertura vêm regime, setor, a empresa, funcionários, faturamento, bancos e maquininha",
  pjReceita.feitas.slice(8).join(",") === "regime,setor,sobre,funcionarios,faturamento,bancos,maquininha,maquininhaEC");

/* ⚠️ O QUE SAIU DA ABERTURA não é perguntado (mora em PARA_COMPLETAR_DEPOIS) */
const SAIRAM = ["openfinance", "infos", "senhaTransacional", "icms", "ie", "im", "exportadora", "limite", "repCargo", "outrosParticipantes",
  "modelo", "frequencia", "meios", "despesas", "contaTipos", "centros", "unidades", "dre", "fluxoCaixa", "saldoInicial", "orcamento", "categorias"];
ok("nada do que saiu é perguntado, na PJ e na PF", !SAIRAM.some((id) => pjManual.feitas.includes(id) || pfOrdem().includes(id)));
ok("o que saiu está listado para completar depois",
  PARA_COMPLETAR_DEPOIS.pj.some((x) => /ICMS/.test(x)) && PARA_COMPLETAR_DEPOIS.pj.some((x) => /DRE/.test(x))
  && PARA_COMPLETAR_DEPOIS.segundaFase.some((x) => /extrato/i.test(x)));

/* o texto livre "me conte sobre a sua empresa" */
ok("o texto livre infere a receita e o modelo", (() => { const l = lerSobreAEmpresa("Vendemos pães para consumidores"); return l.receitaPrincipal === "Venda de produto" && l.modelo === "B2C"; })());
ok("acento e caixa não atrapalham a leitura", lerSobreAEmpresa("Prestação de SERVIÇOS de manutenção").receitaPrincipal === "Venda de serviço");
ok("texto sem pista não inventa nada", (() => { const l = lerSobreAEmpresa("Somos uma empresa familiar"); return !l.receitaPrincipal && !l.modelo; })());
ok("receita inferida: a receita principal NÃO é perguntada", !pjReceita.feitas.includes("receitaPrincipal") && pjReceita.c.receitaPrincipal === "Venda de produto");
const semPista = conversar(comReceita, undefined, {}, { sobre: "Somos uma empresa familiar de Campinas." });
ok("sem pista no texto, a receita principal é perguntada", semPista.feitas.includes("receitaPrincipal") && faltandoParaCriar(semPista.c).length === 0);

/* a senha de acesso */
ok("senha boa, confirmada, segue", problemaDaSenha("cafe-com-pao", "cafe-com-pao") === null);
ok("senha curta é recusada", problemaDaSenha("abc", "abc") !== null);
ok("confirmação diferente é recusada", problemaDaSenha("cafe-com-pao", "cafe-com-pa0") !== null);
ok("a senha não precisa de 6 dígitos (letras valem)", problemaDaSenha("senhaboa", "senhaboa") === null);
ok("PJ: sem a senha de acesso o portão fica fechado", faltandoParaCriar({ ...pjReceita.c, senhaAcesso: "" }).length > 0);
ok("a conta do Google não cria senha e passa no portão", faltandoParaCriar({ ...pjReceita.c, senhaAcesso: "google" }).length === 0);

/* o documento da empresa é opcional */
ok("PJ: sem contrato social nem comprovante o portão fica aberto", faltandoParaCriar({ ...pjReceita.c, docEmpresa: "" }).length === 0);
ok("PJ montado: diz qual documento da empresa foi enviado", montarCadastro(pjReceita.c).db.documentoEmpresa === "contrato");

/* a maquininha */
ok("PJ: vincular a maquininha pede o número do estabelecimento", pjReceita.feitas.includes("maquininhaEC"));
const vinc = pedidoDaMaquininha(pjReceita.c);
ok("PJ: o pedido de vínculo sai com o EC e passa na validação da página Maquininha", vinc?.tipo === "vincular" && vinc.codigoEstabelecimento === "123456" && Object.keys(validarPedido(vinc)).length === 0);
ok("vincular sem o EC não gera pedido (vincula depois)", pedidoDaMaquininha({ ...pjReceita.c, maquininhaEC: "" }) === null);
const pedirNaEmpresa = conversar(comReceita, undefined, { maquininha: OPCOES_MAQUININHA.pedir, maquininhaQtd: "2" });
const pedido = pedidoDaMaquininha(pedirNaEmpresa.c);
ok("pedir: quantas e onde entregar, com o endereço da empresa", pedirNaEmpresa.feitas.includes("maquininhaQtd") && pedirNaEmpresa.feitas.includes("maquininhaEntrega") && !pedirNaEmpresa.feitas.includes("maquininhaEndereco"));
ok("pedir: o pedido sai com 2 maquininhas, o endereço da empresa e passa na validação", pedido?.tipo === "pedir" && pedido.quantidade === 2 && /Paulista/.test(pedido.endereco) && Object.keys(validarPedido(pedido)).length === 0);
const pedirOutro = conversar(comReceita, undefined, { maquininha: OPCOES_MAQUININHA.pedir, maquininhaEntrega: ENTREGA_OUTRO });
ok("pedir em outro endereço: o endereço é perguntado", pedirOutro.feitas.includes("maquininhaEndereco") && /Flores/.test(pedidoDaMaquininha(pedirOutro.c)?.endereco ?? ""));
ok("pedir sem endereço de entrega fecha o portão", faltandoParaCriar({ ...pedirNaEmpresa.c, maquininhaEndereco: "" }).length > 0);
const agoraNao = conversar(comReceita, undefined, { maquininha: OPCOES_MAQUININHA.nao });
ok("\"agora não\": nenhum pedido e a conta nasce", pedidoDaMaquininha(agoraNao.c) === null && faltandoParaCriar(agoraNao.c).length === 0);
ok("PF não tem maquininha", pedidoDaMaquininha({ ...CADASTRO_VAZIO, tipo: "pf", maquininha: "pedir" }) === null);

/* os bancos: "meu banco não está na lista" */
const banco = PERGUNTAS.find((p) => p.id === "bancos")!;
ok("bancos: com logos e com \"outro banco\"", !!banco.logos && !!banco.outro);
ok("um banco fora da lista é aceito", banco.aplicar(pjReceita.c, "Itaú\nBanco Topázio").bancos.includes("Banco Topázio"));

/* a leitura do documento: confere pelo CPF em qualquer formatação, ou pelo nome num documento reconhecido */
const pfDoc = { tipo: "pf" as const, cpf: "529.982.247-25", nome: "Carlos Lima", repNome: "" };
ok("RG com o CPF pontuado confere", lerDocumentoIdentidade("REPUBLICA FEDERATIVA DO BRASIL CARTEIRA DE IDENTIDADE CPF 529.982.247-25", pfDoc).conferido);
ok("CNH com o CPF sem pontuação confere", lerDocumentoIdentidade("CARTEIRA NACIONAL DE HABILITACAO 52998224725", pfDoc).conferido);
ok("nome sem acento num RG reconhecido confere", lerDocumentoIdentidade("CARTEIRA DE IDENTIDADE NOME CARLOS LIMA", pfDoc).conferido);
ok("nome solto, fora de documento, não confere", !lerDocumentoIdentidade("carlos lima comprou pão", pfDoc).conferido);
ok("CPF de outra pessoa não confere", !lerDocumentoIdentidade("CARTEIRA DE IDENTIDADE CPF 111.444.777-35 NOME JOAO", pfDoc).conferido);
ok("texto vazio não confere (e não quebra)", !lerDocumentoIdentidade("", pfDoc).conferido);
ok("PJ confere pelo nome do representante", lerDocumentoIdentidade("CNH HABILITACAO ANA SOUZA", { tipo: "pj", cpf: "", nome: "", repNome: "Ana Souza" }).conferido);
ok("PJ: sem documento de identidade o portão fica fechado", faltandoParaCriar({ ...pjReceita.c, documento: "" }).length > 0);
ok("documento pendente não impede a conta", faltandoParaCriar({ ...pjReceita.c, documento: "pendente" }).length === 0);
ok("PJ: sem aceite dos termos o portão fica fechado", faltandoParaCriar({ ...pjReceita.c, aceiteTermos: "" }).length > 0);
ok("PJ: sem reconhecimento facial o portão fica fechado", faltandoParaCriar({ ...pjReceita.c, biometria: "" }).length > 0);
ok("validação facial pendente não impede a conta", faltandoParaCriar({ ...pjReceita.c, biometria: "pendente" }).length === 0);

/* ⚠️ O PORTÃO: pular qualquer passo obrigatório deixa o portão fechado */
const opcional = (id: string) => id === "docEmpresa" || !!PERGUNTAS.find((p) => p.id === id)?.opcional;
const obrigatoriasPJ = pjManual.feitas.filter((id) => !opcional(id));
const furosPJ = obrigatoriasPJ.filter((id) => faltandoParaCriar(conversar(pjInicio, id).c).length === 0);
ok(`PJ: pular qualquer um dos ${obrigatoriasPJ.length} passos obrigatórios fecha o portão${furosPJ.length ? ` (furos: ${furosPJ.join(", ")})` : ""}`, furosPJ.length === 0);

/* PF */
function pfOrdem() { return conversar({ ...CADASTRO_VAZIO, tipo: "pf", cpf: "529.982.247-25" }).feitas; }
const pfInicio: Cadastro = { ...CADASTRO_VAZIO, tipo: "pf", cpf: "529.982.247-25" };
const pfFim = conversar(pfInicio);
ok("PF: completa o cadastro", faltandoParaCriar(pfFim.c).length === 0);
ok("PF: não pergunta nada de empresa", !pfFim.feitas.some((id) => ["regime", "repNome", "setor", "razaoSocial", "maquininha"].includes(id)));
ok("PF: pergunta o que quer controlar, a renda e os bancos", ["sobrePf", "rendaMensal", "bancos"].every((id) => pfFim.feitas.includes(id)));
const obrigatoriasPF = pfFim.feitas.filter((id) => !opcional(id));
const furosPF = obrigatoriasPF.filter((id) => faltandoParaCriar(conversar(pfInicio, id).c).length === 0);
ok(`PF: pular qualquer um dos ${obrigatoriasPF.length} passos obrigatórios fecha o portão${furosPF.length ? ` (furos: ${furosPF.join(", ")})` : ""}`, furosPF.length === 0);

/* sem tipo, nada nasce */
ok("sem tipo de conta o portão fica fechado", faltandoParaCriar({ ...CADASTRO_VAZIO, email: "a@b.com" }).length > 0);

/* o que vai para o sistema */
const m = montarCadastro(pjReceita.c);
ok("PJ montado: CNPJ, razão social e regime no cadastro", m.db.cnpj === "11.222.333/0001-81" && m.db.razaoSocial === "Padaria Bom Pão Ltda" && !!m.db.regime);
ok("PJ montado: ICMS e inscrições não respondidos não são afirmados", !("icms" in m.db) && !("ie" in m.db) && !("exportadora" in m.db));
ok("PJ montado: o representante é o primeiro participante", m.participantes[0]?.nome === "Ana Souza" && m.participantes[0]?.email === "ana@bompao.com.br");
ok("PJ montado: as contas saem dos bancos marcados", m.estrutura.contas.length === pjReceita.c.bancos.length && m.estrutura.contas.length > 0);
ok("PJ montado: a descrição do negócio vai para o perfil", m.perfil.descricao === TEXTOS.sobre);
ok("o nome da organização é a razão social", nomeDaOrganizacao(pjReceita.c) === "Padaria Bom Pão Ltda");
ok("PF: o e-mail de acesso é o digitado", pfFim.c.email === "carlos@exemplo.com" && montarCadastro(pfFim.c).pessoal?.rendaMensal === 8000);

if (falhas) {
  console.log(`\n✗ ${falhas} falha(s) no cadastro pela conversa`);
  process.exit(1);
}
console.log("\n✓ cadastro pela conversa: a conta só nasce completa");
