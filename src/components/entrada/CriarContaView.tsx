"use client";

/**
 * CRIAR CONTA CONVERSANDO COM A QUATTRO AI — a porta de entrada do produto.
 *
 * ⚠️ **A conversa pede TUDO o que o cadastro de sete passos pedia** (decisão do
 * dono, 16/10/2026). A versão de três perguntas (nome, e-mail, senha) deixava
 * o cliente entrar sem CNPJ, sem regime, sem representante, sem perfil e sem
 * estrutura — e cada tela depois disso trabalhava com o cadastro pela metade.
 * Agora:
 *
 *   1. "Que tipo de conta você gostaria de abrir?" — Conta PF ou Conta PJ.
 *   2. O CNPJ (ou o CPF), com a máscara aplicada ENQUANTO a pessoa digita.
 *   3. O CNPJ vai à Receita (`consultarCNPJ`), e a pessoa CONFIRMA o cartão
 *      com os dados — nada da Receita é gravado sem esse clique.
 *   4. As outras perguntas, uma por vez, na ordem de `core/cadastro/conversa`
 *      (a mesma lista de opções do cadastro de sete passos).
 *   5. A conta só nasce com `faltandoParaCriar` vazio.
 *
 * ⚠️ **As regras de antes continuam.** O nome vazio é recusado na tela, a
 * senha usa o mesmo `MIN_SENHA`, o nome viaja no `signUp` por
 * `criarContaEEntrar`, o cadastro guardado no navegador é NOVO (nunca mesclado
 * com o de outra organização) e a ordem de gravação é a do wizard: conta →
 * alçada → perfil → estrutura → extrato. As guardas (`cadastro-nome`,
 * `engine-audit`) continuam lendo este arquivo.
 *
 * ⚠️ **Uma pergunta por vez também é a regra do campo**: a barra embaixo é UM
 * campo, que troca de tipo a cada passo. A senha é sempre `type="password"`, e
 * a resposta dela aparece mascarada no balão.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { criarContaEEntrar } from "@/lib/entrada";
import { persistCompany, saveCompany, type StoredCompany } from "@/lib/company";
import { aplicarEstrutura } from "@/lib/onboarding";
import { aplicarOnboarding } from "@/lib/fdip";
import { aplicarAlcadaDoOnboarding } from "@/lib/alcada";
import { reportar } from "@/lib/erros";
import { textoDoDocumento } from "@/lib/ocr-local";
import { consultarCNPJ, type DadosCNPJ } from "@/lib/cnpj";
import { lookupCep } from "@/lib/viacep";
import { setTipoConta } from "@/components/app/useTipoConta";
import { analisarImportacao } from "@/core/fdip";
import type { FDIPReport } from "@/core/fdip/types";
import { alcadaDoOnboarding } from "@/core/seguranca/alcada";
import { calcularMaturidade, type Maturidade } from "@/core/onboarding";
import { MIN_SENHA } from "@/core/recuperacao";
import { BancoLogo } from "@/components/ui/BancoLogo";
import {
  BANCOS_OPEN_FINANCE, DICAS_DOCUMENTO, DICAS_FACIAL, DUVIDAS_OPEN_FINANCE, TIPOS_DOCUMENTO, lerDocumentoIdentidade, problemaDaSenhaTransacional, FAIXAS_FATURAMENTO, FAIXAS_RENDA,
  passosEspeciais, proximoPasso, type PassoEspecial,
  CADASTRO_VAZIO, aplicarReceita, cnpjConfere, cpfConfere, faltandoParaCriar, mascararCEP, mascararCNPJ,
  mascararCPF, mascararTelefone, montarCadastro, nomeDaOrganizacao, perguntasDoCadastro, proximaPergunta,
  type Cadastro, type DadosReceita, type Pergunta,
} from "@/core/cadastro/conversa";
import { DigitandoIA, TextoRevelado, duracaoRevelar } from "@/components/ia/conversa";

type Etapa =
  | "tipo" | "documento" | "buscando" | "confirmar" | "pergunta" | "extrato" | "senha"
  | "openfinance" | "termos" | "infos" | "facial" | "docIdentidade" | "senhaTransacional"
  | "criando" | "confirme" | "erro" | "pronto";

type Cartao =
  | { tipo: "conta" }
  | { tipo: "documento"; rotulo: string; documento: string; nome: string; detalhe?: string; linhas?: { rotulo: string; valor: string }[] }
  | { tipo: PassoEspecial }
  | { tipo: "analise"; maturidade: Maturidade };

interface Acao { rotulo: string; icone?: string; href?: string; fazer?: () => void }
interface Fala {
  id: number;
  de: "ia" | "voce";
  texto: string;
  /** A pergunta da IA que abre um passo (é o ponto de volta do "Alterar"). */
  pergunta?: string;
  /** A resposta ACEITA de um passo — só ela ganha o "Alterar". */
  resposta?: string;
  alerta?: boolean;
  acoes?: Acao[];
  cartao?: Cartao;
}

/** O que existia ANTES de cada resposta — é o que o "Alterar" devolve. */
interface Marco { id: string; antes: Cadastro; report: FDIPReport | null }

type Modo = "text" | "numeric" | "email" | "tel" | "decimal";
interface Campo { rotulo: string; placeholder: string; tipo: string; modo: Modo; auto: string; mascara: ((s: string) => string) | null }

let proximoId = 0;
const novaFala = (f: Omit<Fala, "id">): Fala => ({ ...f, id: ++proximoId });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const configurado = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** O que a barra de baixo é em cada passo. */
function campoDe(etapa: Etapa, c: Cadastro, p: Pergunta | null): Campo | null {
  if (etapa === "documento") {
    return c.tipo === "pj"
      ? { rotulo: "CNPJ", placeholder: "00.000.000/0000-00", tipo: "text", modo: "numeric", auto: "off", mascara: mascararCNPJ }
      : { rotulo: "CPF", placeholder: "000.000.000-00", tipo: "text", modo: "numeric", auto: "off", mascara: mascararCPF };
  }
  if (etapa === "senha") {
    return { rotulo: "Senha", placeholder: `Senha com pelo menos ${MIN_SENHA} caracteres`, tipo: "password", modo: "text", auto: "new-password", mascara: null };
  }
  if (etapa !== "pergunta" || !p || p.tipo === "escolha" || p.tipo === "multi") return null;
  const base: Campo = { rotulo: p.rotulo, placeholder: p.placeholder ?? "", tipo: "text", modo: "text", auto: "off", mascara: null };
  if (p.tipo === "email") return { ...base, tipo: "email", modo: "email", auto: "email" };
  if (p.tipo === "telefone") return { ...base, tipo: "tel", modo: "tel", auto: "tel", mascara: mascararTelefone };
  if (p.tipo === "cep") return { ...base, modo: "numeric", auto: "postal-code", mascara: mascararCEP };
  if (p.tipo === "moeda") return { ...base, modo: "decimal" };
  if (p.id === "repNome" || p.id === "nome") return { ...base, auto: "name" };
  return base;
}

export function CriarContaView() {
  const router = useRouter();
  const [falas, setFalas] = React.useState<Fala[]>([]);
  const [etapa, setEtapa] = React.useState<Etapa>("tipo");
  const [cad, setCad] = React.useState<Cadastro>(CADASTRO_VAZIO);
  const [marcos, setMarcos] = React.useState<Marco[]>([]);
  const [atual, setAtual] = React.useState<Pergunta | null>(null);
  const [marcadas, setMarcadas] = React.useState<string[]>([]);
  const [receita, setReceita] = React.useState<DadosCNPJ | null>(null);
  const [report, setReport] = React.useState<FDIPReport | null>(null);
  const [digitando, setDigitando] = React.useState(false);
  /**
   * ⚠️ A IA AINDA ESTÁ FALANDO. Entre uma frase e outra o "digitando" some, e
   * sem esta trava o campo abria no meio da fala: a resposta entrava antes da
   * pergunta (medido na primeira print — o CNPJ apareceu acima do "envie o
   * seu CNPJ").
   */
  const [falando, setFalando] = React.useState(0);
  const [texto, setTexto] = React.useState("");
  const [verSenha, setVerSenha] = React.useState(false);
  /*
   * ⚠️ **O NOME VAZIO É RECUSADO NA TELA, não resolvido em silêncio.** O
   * gatilho tem um último recurso ("Minha empresa") para não derrubar o
   * signup; ele NÃO é o caminho de quem está conversando. Aqui quem responde
   * "qual é o nome" é a pessoa — a razão social (da Receita, confirmada, ou
   * digitada) ou o nome de quem abre a conta pessoal.
   */
  const [erroEmpresa, setErroEmpresa] = React.useState<string | null>(null);
  /* os cartões da abertura de conta (os prints de 20/10/2026) */
  const [aceite, setAceite] = React.useState(false);
  const [faixaFat, setFaixaFat] = React.useState("");
  const [faixaRenda, setFaixaRenda] = React.useState("");
  const [folha, setFolha] = React.useState<null | "duvidas" | "bancos" | "faturamento" | "renda" | "senhaTransacional">(null);
  const [facialAberto, setFacialAberto] = React.useState(false);
  /** O documento escolhido no cartão "Validação de documentos" (abre as dicas e a foto). */
  const [docAberto, setDocAberto] = React.useState<null | "rg" | "cnh">(null);
  /** A leitura do documento no navegador (OCR) em andamento. */
  const [lendoDoc, setLendoDoc] = React.useState(false);

  const vivoRef = React.useRef(true);
  const campoRef = React.useRef<HTMLInputElement>(null);
  const arquivoRef = React.useRef<HTMLInputElement>(null);
  const fimRef = React.useRef<HTMLDivElement>(null);
  const semMovimento = React.useRef(false);
  /** A conta já existe (o "Tentar de novo" depois dela só refaz o resto). */
  const contaCriada = React.useRef(false);

  /** A IA fala uma frase de cada vez, com o "digitando" entre elas. */
  const falar = React.useCallback(async (textos: string[], extra?: Partial<Fala>) => {
    setFalando((n) => n + 1);
    try {
    for (let i = 0; i < textos.length; i++) {
      setDigitando(true);
      await esperar(semMovimento.current ? 0 : 450 + Math.min(textos[i].length * 6, 450));
      if (!vivoRef.current) return;
      setDigitando(false);
      const ultima = i === textos.length - 1;
      setFalas((fs) => [...fs, novaFala({ de: "ia", texto: textos[i], ...(ultima ? extra : {}) })]);
      // A frase surge palavra por palavra: a próxima só começa quando ela termina.
      if (!semMovimento.current) await esperar(duracaoRevelar(textos[i]));
      if (!vivoRef.current) return;
    }
    } finally { setFalando((n) => n - 1); }
  }, []);

  React.useEffect(() => {
    vivoRef.current = true;
    semMovimento.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    void falar(["Bora cuidar das suas finanças e vender pelo celular, sem maquininha."], { cartao: { tipo: "conta" } });
    return () => { vivoRef.current = false; };
  }, [falar]);

  const ocupadoFala = digitando || falando > 0 || lendoDoc;
  // O cartão e o rodapé entram DEPOIS da fala: rolar só quando a fala muda
  // deixava o cartão do Open Finance escondido atrás do botão de baixo.
  React.useEffect(() => {
    const id = requestAnimationFrame(() =>
      fimRef.current?.scrollIntoView({ behavior: semMovimento.current ? "auto" : "smooth", block: "end" }));
    return () => cancelAnimationFrame(id);
  }, [falas, digitando, atual, ocupadoFala, etapa]);

  const campo = campoDe(etapa, cad, atual);
  const temCampo = !!campo;
  React.useEffect(() => { if (temCampo && !ocupadoFala) campoRef.current?.focus(); }, [temCampo, ocupadoFala, etapa, atual]);

  const voce = (t: string, resposta?: string) => setFalas((fs) => [...fs, novaFala({ de: "voce", texto: t, resposta })]);
  /** A última fala da pessoa vira a resposta ACEITA de um passo (ganha o "Alterar"). */
  const aceitar = (id: string) => setFalas((fs) => fs.map((f, i) => (i === fs.length - 1 ? { ...f, resposta: id } : f)));
  const feitasDe = (ms: Marco[]) => new Set(ms.map((m) => m.id));

  /* ─── a próxima pergunta ─────────────────────────────────────────────── */
  const perguntar = async (c: Cadastro, ms: Marco[], prefixo: string[] = []) => {
    const feitas = feitasDe(ms);
    const passo = proximoPasso(c, feitas);
    if (passo && "especial" in passo) {
      const id = passo.especial;
      setAtual(null);
      if (id === "termos") setAceite(!!c.aceiteTermos);
      if (id === "infos") {
        setFaixaFat(FAIXAS_FATURAMENTO.some((f) => f.rotulo === c.faturamento) ? c.faturamento : "");
        setFaixaRenda(c.rendaRepresentante);
      }
      setEtapa(id);
      await falar([...prefixo, ...FALAS_DO_PASSO[id]], { pergunta: id, cartao: { tipo: id } });
      // Como no print: a folha da senha sobe sozinha (o cartão fica para reabrir).
      if (id === "senhaTransacional" && vivoRef.current) setFolha("senhaTransacional");
      return;
    }
    const p = passo ? passo.pergunta : null;
    if (p) {
      setAtual(p);
      setMarcadas(p.inicial ? p.inicial(c) : []);
      setEtapa("pergunta");
      await falar([...prefixo, ...p.falas(c)], { pergunta: p.id });
      return;
    }
    setAtual(null);
    if (c.tipo === "pj" && !feitas.has("extrato")) {
      setEtapa("extrato");
      await falar(
        [...prefixo, "Último passo antes do acesso: quer me mandar um extrato do banco agora? Com ele eu já monto as categorias, os clientes e os fornecedores."],
        { pergunta: "extrato" },
      );
      return;
    }
    setEtapa("senha");
    await falar([...prefixo, `Agora crie uma senha com pelo menos ${MIN_SENHA} caracteres para o e-mail ${c.email}.`], { pergunta: "senha" });
  };

  /* ─── 1. o tipo de conta ─────────────────────────────────────────────── */
  const escolherTipo = async (tipo: "pf" | "pj") => {
    if (etapa !== "tipo" || ocupadoFala) return;
    voce(tipo === "pj" ? "Conta PJ" : "Conta PF", "tipo");
    const novo: Cadastro = { ...CADASTRO_VAZIO, tipo };
    setMarcos([{ id: "tipo", antes: CADASTRO_VAZIO, report: null }]);
    setCad(novo);
    setTexto("");
    setEtapa("documento");
    await falar(
      ["Show! Isso vai ser rápido.", tipo === "pj" ? "Pra começar, envie o número do seu **CNPJ**." : "Pra começar, envie o número do seu **CPF**."],
      { pergunta: "documento" },
    );
  };

  /* ─── 2. o documento, e a Receita ────────────────────────────────────── */
  const responderDocumento = async (valor: string) => {
    if (cad.tipo === "pj") {
      voce(mascararCNPJ(valor));
      if (!cnpjConfere(valor)) {
        await falar(["Esse CNPJ não confere: os dois últimos números não batem com os outros. Confere pra mim?"], { alerta: true });
        return;
      }
      setTexto("");
      setEtapa("buscando");
      setDigitando(true);
      const r = await consultarCNPJ(valor).catch(() => null);
      if (!vivoRef.current) return;
      setDigitando(false);
      const base: Cadastro = { ...cad, cnpj: mascararCNPJ(valor) };
      if (!r) {
        // Sem a Receita (rede, limite da API): a conversa pede à mão o que ela daria.
        aceitar("documento");
        const ms = [...marcos, { id: "documento", antes: cad, report }];
        setMarcos(ms);
        setCad(base);
        await perguntar(base, ms);
        return;
      }
      setReceita(r);
      setCad(base);
      setEtapa("confirmar");
      const lugar = [r.municipio, r.uf].filter(Boolean).join(" / ");
      await falar(["Verifique se os dados estão corretos"], {
        cartao: {
          tipo: "documento", rotulo: "CNPJ", documento: mascararCNPJ(valor), nome: r.razaoSocial,
          detalhe: [r.nomeFantasia, lugar].filter(Boolean).join(" · ") || undefined,
          linhas: linhasDaReceita(r, mascararCNPJ(valor)),
        },
      });
      return;
    }
    voce(mascararCPF(valor));
    if (!cpfConfere(valor)) {
      await falar(["Esse CPF não confere: os dois últimos números não batem com os outros. Confere pra mim?"], { alerta: true });
      return;
    }
    aceitar("documento");
    const novo: Cadastro = { ...cad, cpf: mascararCPF(valor) };
    const ms = [...marcos, { id: "documento", antes: cad, report }];
    setMarcos(ms);
    setCad(novo);
    setTexto("");
    await perguntar(novo, ms);
  };

  const confirmarDocumento = async () => {
    if (etapa !== "confirmar" || ocupadoFala) return;
    voce("Confirmar", "documento");
    const novo = receita ? aplicarReceita(cad, receita) : cad;
    const ms = [...marcos, { id: "documento", antes: { ...cad, cnpj: "" }, report }];
    setMarcos(ms);
    setCad(novo);
    await perguntar(novo, ms, ["Perfeito, anotei os dados."]);
  };

  const outroDocumento = async () => {
    if (etapa !== "confirmar" || ocupadoFala) return;
    voce(cad.tipo === "pj" ? "Usar outro CNPJ" : "Usar outro CPF");
    setReceita(null);
    setCad((c) => ({ ...c, cnpj: "", cpf: "" }));
    setTexto("");
    setEtapa("documento");
    await falar([cad.tipo === "pj" ? "Sem problema. Qual é o **CNPJ** certo?" : "Sem problema. Qual é o **CPF** certo?"], { pergunta: "documento" });
  };

  /* ─── os cartões da abertura: Open Finance, termos, informações, rosto ─── */
  const concluirPasso = async (id: PassoEspecial, eco: string, novo: Cadastro, prefixo: string[] = []) => {
    if (etapa !== id || ocupadoFala) return;
    setFolha(null);
    setFacialAberto(false);
    setDocAberto(null);
    voce(eco, id);
    const ms = [...marcos, { id, antes: cad, report }];
    setMarcos(ms);
    setCad(novo);
    await perguntar(novo, ms, prefixo);
  };

  /**
   * ⚠️ O banco é ANOTADO, não conectado: a conexão do Open Finance (Pluggy)
   * pede uma organização com sessão, e a conta ainda não existe. Criada a
   * conta, a pessoa vai direto para "Conectar" e autoriza no app do banco.
   */
  const escolherBanco = (banco: string) =>
    void concluirPasso("openfinance", `Conectar ${banco}`, { ...cad, openFinanceBanco: banco },
      [`Anotei o ${banco}. Assim que a conta estiver criada, eu te levo ao app do banco para autorizar, e o extrato entra sozinho.`]);
  const preencherManual = () =>
    void concluirPasso("openfinance", "Prefiro preencher manualmente", { ...cad, openFinanceBanco: "" }, ["Sem problema, a gente preenche junto."]);
  const aceitarTermos = () =>
    void concluirPasso("termos", "Li e aceito os termos e condições", { ...cad, aceiteTermos: new Date().toISOString() });
  const enviarInfos = () =>
    void concluirPasso("infos", "Continuar", { ...cad, faturamento: faixaFat, rendaRepresentante: faixaRenda });
  const concluirFacial = (status: "capturada" | "pendente") =>
    void concluirPasso("facial", status === "capturada" ? "Foto enviada" : "Validar depois", { ...cad, biometria: status },
      [status === "capturada" ? "Recebi a sua foto. Obrigado!" : "Tudo bem: a validação fica pendente e eu te lembro dela lá dentro."]);

  /**
   * O DOCUMENTO DE IDENTIDADE: foto (câmera traseira) ou arquivo anexado,
   * lido no navegador e conferido contra o CPF e o nome do cadastro.
   * ⚠️ Não é validação documental (não há provedor): o que a leitura não
   * confirma segue como "enviado", para conferência — nunca reprova.
   */
  const enviarDocumento = async (tipo: "rg" | "cnh", arquivo: File, origem: "foto" | "anexo") => {
    if (etapa !== "docIdentidade" || ocupadoFala) return;
    setDocAberto(null);
    const nome = TIPOS_DOCUMENTO[tipo];
    voce(origem === "foto" ? `Foto do ${nome} enviada` : `${nome} anexado`, "docIdentidade");
    setLendoDoc(true);
    let conferido = false;
    try {
      const texto = await Promise.race([
        textoDoDocumento(arquivo),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("leitura demorou")), 60_000)),
      ]);
      conferido = lerDocumentoIdentidade(texto, cad).conferido;
    } catch (e) {
      reportar("criar-conta.documento", e, "o documento de identidade não foi lido no navegador; ele segue como enviado, para conferência", true);
    } finally {
      if (vivoRef.current) setLendoDoc(false);
    }
    if (!vivoRef.current) return;
    const ms = [...marcos, { id: "docIdentidade", antes: cad, report }];
    const novo: Cadastro = { ...cad, docTipo: tipo, documento: conferido ? "conferido" : "enviado" };
    setMarcos(ms);
    setCad(novo);
    await perguntar(novo, ms, [conferido
      ? `Conferi o seu ${nome}: os dados batem com o cadastro.`
      : `Recebi o seu ${nome}. Não consegui ler tudo agora, então ele fica para conferência e você segue normalmente.`]);
  };
  const documentoDepois = (tipo: "rg" | "cnh") =>
    void concluirPasso("docIdentidade", "Validar depois", { ...cad, docTipo: tipo, documento: "pendente" },
      ["Tudo bem: a validação do documento fica pendente e eu te lembro dela lá dentro."]);
  const salvarSenhaTransacional = () =>
    void concluirPasso("senhaTransacional", "Senha transacional criada", { ...cad, senhaTransacional: "definida" });

  /* ─── 3. as perguntas ────────────────────────────────────────────────── */
  const responderPergunta = async (valor: string) => {
    const p = atual;
    if (!p || ocupadoFala) return;
    const pulou = !valor.trim();
    if (pulou && !p.opcional) return;
    const eco = pulou ? "Pular" : p.tipo === "multi" ? valor.split("\n").join(", ") : (p.eco ? p.eco(valor) : valor.trim());
    voce(eco);
    const recusa = !pulou && p.validar ? p.validar(valor, cad) : null;
    if (recusa) {
      if (p.id === "razaoSocial") setErroEmpresa(recusa);
      await falar([recusa], { alerta: true });
      return;
    }
    setErroEmpresa(null);
    aceitar(p.id);
    let novo = pulou ? cad : p.aplicar(cad, valor);
    const ms = [...marcos, { id: p.id, antes: cad, report }];
    // O CEP digitado à mão completa rua, bairro, cidade e UF pelo ViaCEP.
    if (p.id === "cep") {
      const end = await lookupCep(valor).catch(() => null);
      if (end) novo = { ...novo, rua: novo.rua || end.street, bairro: novo.bairro || end.district, cidade: end.city, estado: end.state };
    }
    setMarcos(ms);
    setCad(novo);
    setTexto("");
    await perguntar(novo, ms);
  };

  /** A razão social em branco é recusada na tela, antes de qualquer outra coisa. */
  const enviarTexto = async () => {
    if (atual?.id === "razaoSocial" && !texto.trim()) {
      setErroEmpresa("Informe a razão social da empresa.");
      return;
    }
    await responderPergunta(texto);
  };

  /* ─── 4. o extrato (opcional) ────────────────────────────────────────── */
  /** O cartão da análise: o mesmo `calcularMaturidade` do cadastro de sete passos. */
  const analisar = async (c: Cadastro, r: FDIPReport | null, ms: Marco[]) => {
    const m = montarCadastro(c);
    const maturidade = calcularMaturidade(m.perfil, m.participantes, m.estrutura, r);
    await falar(["Com o que você me contou, montei o retrato financeiro da empresa."], { cartao: { tipo: "analise", maturidade } });
    await perguntar(c, ms);
  };

  const lerExtrato = async (arquivo: File) => {
    voce(arquivo.name, "extrato");
    const conteudo = await arquivo.text().catch(() => "");
    const r = conteudo.trim() ? analisarImportacao(conteudo) : null;
    const lidos = r?.records.length ?? 0;
    const ms = [...marcos, { id: "extrato", antes: cad, report }];
    setMarcos(ms);
    if (!r || !lidos) {
      await falar(["Não consegui ler lançamentos nesse arquivo. Sem problema: você importa depois, em Entrada de dados."]);
      await analisar(cad, null, ms);
      return;
    }
    setReport(r);
    await falar([`Li ${lidos} lançamentos de ${r.periodoMeses} ${r.periodoMeses === 1 ? "mês" : "meses"}. Eles entram junto com a conta.`]);
    await analisar(cad, r, ms);
  };

  const pularExtrato = async () => {
    if (ocupadoFala) return;
    voce("Agora não", "extrato");
    const ms = [...marcos, { id: "extrato", antes: cad, report }];
    setMarcos(ms);
    await analisar(cad, null, ms);
  };

  /* ─── 5. a senha e a criação ─────────────────────────────────────────── */
  const criar = async (c: Cadastro, senha: string) => {
    /*
     * ⚠️ **O PORTÃO.** A conta só nasce com o cadastro completo — era isto que
     * faltava na conversa de três perguntas, e é por isso que o cliente
     * entrava no sistema com itens faltando.
     */
    const falta = faltandoParaCriar(c);
    if (falta.length) {
      setEtapa("erro");
      await falar([`Ainda falta: ${falta.join(", ")}. Use o "Alterar" na resposta para completar.`], { alerta: true });
      return;
    }
    const nomeEmpresa = nomeDaOrganizacao(c);
    const email = c.email.trim();
    const montado = montarCadastro(c);
    const company: StoredCompany = {
      db: montado.db, perfil: montado.perfil, participantes: montado.participantes, estrutura: montado.estrutura,
      ...(montado.pessoal ? { pessoal: montado.pessoal } : {}),
    };
    setEtapa("criando");
    await falar([`Perfeito. Estou criando a conta ${c.tipo === "pf" ? "de" : "da"} ${nomeEmpresa}…`]);
    setTipoConta(c.tipo === "pf" ? "pessoal" : "empresa");
    setDigitando(true);
    try {
      if (!contaCriada.current) {
        // ⚠️ Uma exceção aqui (cliente do Supabase sem configuração, rede caída)
        // não pode deixar a conversa parada em "criando": vira a resposta de erro.
        const r = await criarContaEEntrar(email, senha, nomeEmpresa).catch(() => ({
          ok: false as const, confirmarEmail: false,
          motivo: "Não foi possível concluir agora.", comoResolver: "Tente de novo em alguns segundos.",
        }));
        if (!vivoRef.current) return;
        if (!r.ok && r.confirmarEmail) {
          // ⚠️ O cadastro INTEIRO fica guardado: ao voltar pelo link, ele já está
          // aqui. E é um cadastro NOVO, não uma mescla com a empresa de quem
          // estava logado antes neste navegador.
          try { saveCompany(company); } catch { /* segue */ }
          setDigitando(false);
          setEtapa("confirme");
          await falar(
            [`Conta criada! Mandei um link de confirmação para ${email}.`, "É só abrir o link para entrar. O seu cadastro já ficou guardado."],
            { acoes: [{ rotulo: "Já confirmei, quero entrar", icone: "check", href: "/login" }] },
          );
          return;
        }
        if (!r.ok) {
          setDigitando(false);
          setEtapa("erro");
          await falar([r.motivo, r.comoResolver ?? "Me diz o que você quer fazer:"], {
            alerta: true,
            acoes: [
              { rotulo: "Tentar de novo", icone: "rotate-ccw", fazer: () => void criar(c, senha) },
              { rotulo: "Trocar o e-mail", icone: "mail", fazer: () => alterar(c.tipo === "pf" ? "emailPf" : "repEmail") },
              { rotulo: "Trocar a senha", icone: "edit", fazer: () => alterar("senha") },
            ],
          });
          return;
        }
        contaCriada.current = true;
      }
      // Daqui para baixo existe sessão. A MESMA ordem do cadastro de sete passos.
      let falhaAlcada: string | null = null;
      if (c.tipo === "pj") {
        try { await aplicarAlcadaDoOnboarding(alcadaDoOnboarding(montado.participantes)); }
        catch (e) {
          reportar("organizacao.alcada", e, "os limites de aprovação respondidos no cadastro não foram gravados; vale o teto padrão até alguém ajustar");
          falhaAlcada = e instanceof Error ? e.message : String(e);
        }
      }
      // ⚠️ `limite` sai do perfil: a alçada mora em `central_alcada`, não aqui.
      const semLimite = montado.participantes.map(({ limite: _limite, ...resto }) => resto);
      await persistCompany({ ...company, participantes: semLimite });
      if (configurado) await aplicarEstrutura(montado.estrutura);
      if (report) await aplicarOnboarding(report);
      if (!vivoRef.current) return;
      setDigitando(false);
      setEtapa("pronto");
      await falar([
        ...(falhaAlcada ? [`Os limites de aprovação não foram gravados (${falhaAlcada}); até alguém ajustar em Aprovações, vale o padrão.`] : []),
        c.openFinanceBanco
          ? `Pronto! A sua conta está criada. Agora vou te levar para conectar o ${c.openFinanceBanco}.`
          : "Pronto! A sua conta está criada e completa. Já vou te levar para dentro.",
      ]);
      router.push(c.openFinanceBanco ? "/upload?aba=conectar" : "/");
      router.refresh();
    } catch (e) {
      // ⚠️ SEMPRE uma saída: a conta existe, e "Tentar de novo" refaz só o resto
      // (o perfil é upsert e a estrutura deduplica por nome).
      setDigitando(false);
      setEtapa("erro");
      await falar(
        [`Sua conta foi criada, mas não consegui salvar todo o cadastro: ${e instanceof Error ? e.message : String(e)}.`],
        { alerta: true, acoes: [{ rotulo: "Tentar de novo", icone: "rotate-ccw", fazer: () => void criar(c, senha) }] },
      );
    }
  };

  const responderSenha = async () => {
    const senha = texto;
    if (!senha) return;
    voce("•".repeat(Math.min(senha.length, 12)));
    if (!(senha.length >= MIN_SENHA)) {
      await falar([`Essa ficou curta: a senha precisa de pelo menos ${MIN_SENHA} caracteres. Tenta outra?`], { alerta: true });
      setTexto("");
      return;
    }
    setTexto("");
    setVerSenha(false);
    await criar(cad, senha);
  };

  /* ─── voltar a uma resposta ──────────────────────────────────────────── */
  const cortarEm = (abertura: (f: Fala) => boolean) =>
    setFalas((fs) => {
      let corte = -1;
      fs.forEach((f, i) => { if (abertura(f)) corte = i; });
      return corte >= 0 ? fs.slice(0, corte + 1) : fs;
    });

  function alterar(id: string) {
    setErroEmpresa(null);
    setVerSenha(false);
    if (id === "senha") {
      cortarEm((f) => f.pergunta === "senha");
      setTexto(""); setEtapa("senha");
      return;
    }
    const k = marcos.findIndex((m) => m.id === id);
    if (k < 0) return;
    const marco = marcos[k];
    cortarEm((f) => (id === "tipo" ? f.cartao?.tipo === "conta" : f.pergunta === id));
    setMarcos(marcos.slice(0, k));
    setCad(marco.antes);
    setReport(marco.report);
    if (id === "tipo") { setAtual(null); setEtapa("tipo"); setTexto(""); return; }
    if (id === "documento") {
      setAtual(null); setReceita(null); setEtapa("documento");
      setTexto(cad.tipo === "pj" ? cad.cnpj : cad.cpf);
      return;
    }
    if (id === "extrato") { setAtual(null); setEtapa("extrato"); return; }
    if (id === "openfinance" || id === "termos" || id === "infos" || id === "facial" || id === "docIdentidade" || id === "senhaTransacional") {
      setAtual(null);
      setAceite(!!marco.antes.aceiteTermos);
      setFaixaFat(cad.faturamento);
      setFaixaRenda(cad.rendaRepresentante);
      setEtapa(id);
      return;
    }
    const p = perguntasDoCadastro(marco.antes).find((x) => x.id === id) ?? null;
    setAtual(p);
    setMarcadas(p?.tipo === "multi" ? lerLista(p, cad) : p?.inicial ? p.inicial(marco.antes) : []);
    setTexto(p && p.tipo !== "escolha" && p.tipo !== "multi" ? valorDe(p, cad) : "");
    setEtapa("pergunta");
  }

  const responder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupadoFala) return;
    if (etapa === "documento") {
      const valor = texto.trim();
      if (!valor) return;
      await responderDocumento(valor);
      return;
    }
    if (etapa === "senha") { await responderSenha(); return; }
    if (etapa === "pergunta") await enviarTexto();
  };

  /** O "voltar" do cabeçalho reabre a última resposta (o mesmo "Alterar" do balão). */
  const ultimoMarco = marcos[marcos.length - 1];
  const podeVoltar = !!ultimoMarco && !ocupadoFala && !["criando", "pronto", "confirme", "buscando"].includes(etapa);
  const voltar = () => { if (podeVoltar) alterar(ultimoMarco.id); };

  const ocupado = etapa === "criando" || etapa === "pronto" || etapa === "confirme" || etapa === "buscando";
  const ultimaIA = [...falas].reverse().find((f) => f.de === "ia");
  const opcoes = etapa === "pergunta" && atual && (atual.tipo === "escolha" || atual.tipo === "multi") ? (atual.opcoes?.(cad) ?? []) : [];
  const destaque = atual?.destaque?.(cad) ?? null;
  // tipo + documento + perguntas + (extrato, na PJ) + senha
  const total = cad.tipo ? 2 + passosEspeciais(cad) + perguntasDoCadastro(cad).length + (cad.tipo === "pj" ? 1 : 0) + 1 : 0;
  const passoAtual = Math.min(marcos.length + 1, total);
  const atrasoDe = (t: string) => ({ "--a4p-atraso": `${Math.max(0, duracaoRevelar(t) - 200)}ms` } as React.CSSProperties);

  return (
    <div className="a4p-chat-tela h-[100dvh] flex flex-col" style={{ background: "var(--color-surface-1)" }}>
      {/* O cabeçalho dos prints: voltar · marca · fechar. */}
      <header className="flex-none grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 md:px-10 pt-6 pb-3">
        <div className="flex items-center">
          <button
            type="button"
            onClick={voltar}
            disabled={!podeVoltar}
            aria-label="Voltar à resposta anterior"
            className="w-10 h-10 rounded-pill flex items-center justify-center text-ink disabled:opacity-30"
          >
            <Icon name="chevron-left" size={22} />
          </button>
        </div>
        <Link href="/" aria-label="Início"><span role="img" aria-label="Quattro" className="a4p-logo-mono block w-[125px] h-[24px]" /></Link>
        <div className="flex items-center justify-end gap-3">
          {total > 0 && etapa !== "pronto" && (
            <span className="hidden md:inline text-[13px] text-muted tabular-nums" data-progresso>
              Passo {passoAtual} de {total}
            </span>
          )}
          <Link href="/login" className="hidden sm:inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] a4p-pilula">
            Já tenho conta
          </Link>
          <Link href="/login" aria-label="Sair do cadastro" className="w-10 h-10 rounded-pill flex items-center justify-center text-ink">
            <Icon name="x" size={20} />
          </Link>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-5 pt-10 pb-10 flex flex-col gap-5" aria-live="polite">
          <h1 className="sr-only">Criar conta</h1>
          {falas.map((f) =>
            f.de === "voce" ? (
              <div key={f.id} className="a4p-entra self-end flex items-center gap-2 max-w-[80%]">
                {f.resposta && !ocupado && (
                  <button
                    type="button"
                    onClick={() => alterar(f.resposta!)}
                    aria-label={`Alterar a resposta ${f.texto}`}
                    className="text-[13px] text-muted hover:text-ink underline-offset-2 hover:underline"
                  >
                    Alterar
                  </button>
                )}
                <div data-conversa="voce" className="a4p-bolha-usuario px-5 py-3 rounded-[24px] text-[15px] break-words">
                  {f.texto}
                </div>
              </div>
            ) : (
              <div key={f.id} className="a4p-entra self-start flex flex-col gap-3 w-full max-w-[90%]" data-conversa="ia">
                <p role={f.alerta ? "alert" : undefined} className="m-0 text-[17px] leading-[1.5] text-ink"><TextoRevelado texto={f.texto} /></p>
                {f.cartao && (
                  <div className="a4p-entra" style={atrasoDe(f.texto)}>
                    <CartaoDaConversa
                      cartao={f.cartao}
                      ativo={
                        (f.cartao.tipo === "conta" && etapa === "tipo" && !ocupadoFala) ||
                        (f.cartao.tipo === "documento" && etapa === "confirmar" && f.id === ultimaIA?.id && !ocupadoFala) ||
                        (f.cartao.tipo === etapa && f.id === ultimaIA?.id && !ocupadoFala)
                      }
                      cad={cad}
                      aceite={aceite}
                      faixaFat={faixaFat}
                      faixaRenda={faixaRenda}
                      onTipo={(t) => void escolherTipo(t)}
                      onConectar={() => setFolha("bancos")}
                      onDuvidas={() => setFolha("duvidas")}
                      onAceite={() => setAceite((a) => !a)}
                      onFaixa={(q) => setFolha(q)}
                      onFacial={() => setFacialAberto(true)}
                      onDocumento={(t) => setDocAberto(t)}
                      onSenha={() => setFolha("senhaTransacional")}
                    />
                  </div>
                )}
                {f.acoes && (
                  <div className="a4p-entra flex flex-wrap gap-2" style={atrasoDe(f.texto)}>
                    {f.acoes.map((a) =>
                      a.href ? (
                        <Link key={a.rotulo} href={a.href} className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                          {a.icone && <Icon name={a.icone} size={16} />}
                          {a.rotulo}
                        </Link>
                      ) : (
                        <button key={a.rotulo} type="button" onClick={a.fazer} disabled={etapa !== "erro"}
                          className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50">
                          {a.icone && <Icon name={a.icone} size={16} />}
                          {a.rotulo}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ),
          )}

          {/* As opções da pergunta atual: escolha única ou várias. */}
          {!ocupadoFala && opcoes.length > 0 && atual && (
            <div className="a4p-entra self-start flex flex-col gap-3 max-w-full" data-opcoes={atual.id}>
              <div role="group" aria-label={atual.rotulo} className="flex flex-wrap gap-2">
                {opcoes.map((o) => {
                  const marcada = marcadas.includes(o);
                  return atual.tipo === "multi" ? (
                    <button key={o} type="button" aria-pressed={marcada}
                      onClick={() => setMarcadas((ms) => (ms.includes(o) ? ms.filter((x) => x !== o) : [...ms, o]))}
                      className={`inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] transition-colors ${marcada ? "" : "a4p-pilula"}`}
                      style={marcada ? { background: "var(--erp-num-cor)", color: "var(--color-surface-1)" } : undefined}>
                      {marcada && <Icon name="check" size={16} color="currentColor" />}
                      {o}
                    </button>
                  ) : (
                    <button key={o} type="button" onClick={() => void responderPergunta(o)}
                      className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                      {o === destaque && <span aria-hidden className="w-2 h-2 rounded-pill bg-lime" />}
                      {o}
                      {o === destaque && <span className="sr-only"> (indicado)</span>}
                    </button>
                  );
                })}
              </div>
              {atual.tipo === "multi" && (
                <button type="button" disabled={!marcadas.length} onClick={() => void responderPergunta(marcadas.join("\n"))}
                  className="self-start inline-flex items-center gap-2 h-11 px-6 rounded-pill text-[15px] disabled:opacity-50"
                  style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}>
                  Continuar
                </button>
              )}
            </div>
          )}

          {!ocupadoFala && etapa === "pergunta" && atual?.opcional && (
            <button type="button" onClick={() => void responderPergunta("")} className="a4p-entra self-start text-[14px] text-muted hover:text-ink underline-offset-2 hover:underline">
              Pular esta pergunta
            </button>
          )}

          {!ocupadoFala && etapa === "extrato" && (
            <div className="a4p-entra self-start flex flex-wrap gap-2" data-opcoes="extrato">
              <button type="button" onClick={() => arquivoRef.current?.click()} className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                <Icon name="upload" size={16} />
                Enviar extrato
              </button>
              <button type="button" onClick={() => void pularExtrato()} className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                Agora não
              </button>
              <input ref={arquivoRef} type="file" accept=".csv,.ofx,.txt" hidden aria-label="Arquivo do extrato"
                onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void lerExtrato(a); }} />
            </div>
          )}

          {lendoDoc && (
            <div className="a4p-entra self-start flex flex-col gap-2" data-lendo-documento>
              <p className="m-0 text-[17px] leading-[1.5] text-ink">Estamos validando seu documento...</p>
              <DigitandoIA rotulo="Pensando na melhor resposta" />
            </div>
          )}
          {digitando && (
            <DigitandoIA
              rotulo={etapa === "criando" ? "Criando a sua conta" : etapa === "buscando" ? "Buscando na Receita" : "Digitando"}
              className="self-start"
            />
          )}
          {erroEmpresa && (
            <p id="erro-empresa" role="alert" className="a4p-entra m-0 self-start text-[17px] text-ink">
              {erroEmpresa} É ela que aparece no seu painel e nos relatórios.
            </p>
          )}
          <div ref={fimRef} />
        </div>
      </main>

      {!ocupadoFala && ["confirmar", "openfinance", "termos", "infos"].includes(etapa) && (
        <div className="a4p-entra flex-none mx-auto mb-4 w-[calc(100%-40px)] max-w-[480px] flex flex-col items-stretch gap-2" data-rodape={etapa}>
          {etapa === "confirmar" && (
            <>
              <button type="button" onClick={() => void confirmarDocumento()} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Confirmar</button>
              <button type="button" onClick={() => void outroDocumento()} className="h-12 rounded-pill text-[15px] text-ink">
                Usar outro {cad.tipo === "pj" ? "CNPJ" : "CPF"}
              </button>
            </>
          )}
          {etapa === "openfinance" && (
            <button type="button" onClick={preencherManual} className="h-14 rounded-pill text-[15px] font-medium text-ink a4p-pilula">
              Prefiro preencher manualmente
            </button>
          )}
          {etapa === "termos" && (
            <button type="button" disabled={!aceite} onClick={aceitarTermos} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Continuar</button>
          )}
          {etapa === "infos" && (
            <button type="button" disabled={!faixaFat || !faixaRenda} onClick={enviarInfos} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Continuar</button>
          )}
        </div>
      )}

      {folha === "duvidas" && (
        <Folha titulo="Quero entender mais" onFechar={() => setFolha(null)}>
          <Duvidas />
        </Folha>
      )}
      {folha === "bancos" && (
        <Folha titulo="Escolha seu banco" onFechar={() => setFolha(null)}>
          <ul className="m-0 p-0 list-none flex flex-col" data-folha="bancos">
            {BANCOS_OPEN_FINANCE.map((b) => (
              <li key={b}>
                <button type="button" onClick={() => escolherBanco(b)} className="w-full flex items-center gap-4 py-3 text-left text-[15px] font-medium text-ink">
                  <BancoLogo banco={b} size={36} />
                  {b}
                </button>
              </li>
            ))}
          </ul>
        </Folha>
      )}
      {(folha === "faturamento" || folha === "renda") && (
        <Folha titulo={folha === "faturamento" ? "Faturamento anual" : "Renda do representante"} onFechar={() => setFolha(null)}>
          <ul className="m-0 p-0 list-none flex flex-col" role="listbox" aria-label={folha === "faturamento" ? "Faturamento anual" : "Renda do representante"} data-folha={folha}>
            {(folha === "faturamento" ? FAIXAS_FATURAMENTO : FAIXAS_RENDA.map((r) => ({ rotulo: r, porte: "" }))).map((f) => {
              const marcada = (folha === "faturamento" ? faixaFat : faixaRenda) === f.rotulo;
              return (
                <li key={f.rotulo}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={marcada}
                    onClick={() => { if (folha === "faturamento") setFaixaFat(f.rotulo); else setFaixaRenda(f.rotulo); setFolha(null); }}
                    className="w-full flex items-center justify-between gap-3 py-3 text-left"
                  >
                    <span className="flex flex-col">
                      <span className="text-[15px] font-medium text-ink tabular-nums">{f.rotulo}</span>
                      {f.porte && <span className="text-[13px] text-muted">{f.porte}</span>}
                    </span>
                    {marcada && <Icon name="check" size={18} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Folha>
      )}
      {facialAberto && <ReconhecimentoFacial onFechar={() => setFacialAberto(false)} onConcluir={concluirFacial} />}
      {docAberto && (
        <ValidacaoDocumento
          tipo={docAberto}
          onFechar={() => setDocAberto(null)}
          onArquivo={(a, origem) => void enviarDocumento(docAberto, a, origem)}
          onDepois={() => documentoDepois(docAberto)}
        />
      )}
      {folha === "senhaTransacional" && (
        <Folha titulo="Senha transacional" onFechar={() => setFolha(null)}>
          <SenhaTransacional onSalvar={salvarSenhaTransacional} />
        </Folha>
      )}

      {campo && (
        <form
          onSubmit={responder}
          className="flex-none mx-auto mb-2 w-[calc(100%-40px)] max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
          style={{ background: "var(--a4p-pilula-fundo)" }}
        >
          {/* O gerenciador de senhas guarda a senha junto do e-mail certo. */}
          {etapa === "senha" && <input type="email" name="email" autoComplete="username" value={cad.email} readOnly hidden />}
          {etapa === "pergunta" && atual?.tipo === "telefone" && (
            <span aria-hidden className="pl-3 text-[15px] text-muted tabular-nums">+55</span>
          )}
          <input
            ref={campoRef}
            key={`${etapa}:${atual?.id ?? ""}`}
            name={etapa === "pergunta" ? atual?.id : etapa}
            type={etapa === "senha" && verSenha ? "text" : campo.tipo}
            inputMode={campo.modo}
            autoComplete={campo.auto}
            value={texto}
            onChange={(e) => { setTexto(campo.mascara ? campo.mascara(e.target.value) : e.target.value); if (erroEmpresa) setErroEmpresa(null); }}
            placeholder={campo.placeholder}
            aria-label={campo.rotulo}
            aria-invalid={erroEmpresa ? true : undefined}
            aria-describedby={erroEmpresa ? "erro-empresa" : undefined}
            disabled={ocupadoFala}
            className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted tabular-nums"
          />
          {etapa === "senha" && (
            <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"} aria-pressed={verSenha}
              className="w-9 h-9 flex-none rounded-pill flex items-center justify-center text-muted hover:text-ink">
              <Icon name={verSenha ? "eye-off" : "eye"} size={18} />
            </button>
          )}
          <button
            type="submit"
            aria-label="Enviar resposta"
            disabled={ocupadoFala || (!texto.trim() && atual?.id !== "razaoSocial")}
            className="w-9 h-9 flex-none rounded-pill flex items-center justify-center disabled:opacity-50"
            style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
          >
            <Icon name="arrow-up" size={18} color="currentColor" />
          </button>
        </form>
      )}
    </div>
  );
}

/** O que a pessoa tinha respondido (para o campo voltar preenchido no "Alterar"). */
function valorDe(p: Pergunta, c: Cadastro): string {
  const chave = p.id === "descricaoPf" ? "descricao" : p.id === "emailPf" ? "email" : p.id;
  const v = (c as unknown as Record<string, unknown>)[chave];
  if (typeof v === "number") return String(v).replace(".", ",");
  return typeof v === "string" ? v : "";
}
function lerLista(p: Pergunta, c: Cadastro): string[] {
  const chave = p.id === "meios" ? "meiosRecebimento" : p.id;
  const v = (c as unknown as Record<string, unknown>)[chave];
  return Array.isArray(v) && v.length ? (v as string[]) : (p.inicial ? p.inicial(c) : []);
}

/* ─── as falas, os botões e o cartão da Receita ──────────────────────────── */
const FALAS_DO_PASSO: Record<PassoEspecial, string[]> = {
  openfinance: ["Agora, o jeito mais rápido de seguir."],
  termos: ["Antes de abrir sua conta, confirme que você aceita os **Termos** **de** **Uso**."],
  infos: ["Precisamos de algumas informações suas sobre renda, ocupação e seu patrimônio."],
  facial: ["Para sua segurança, vamos validar sua identidade com **reconhecimento** **facial**."],
  docIdentidade: ["Estamos validando sua identidade...", "Para sua segurança, vamos validar sua **documentação**."],
  senhaTransacional: ["Agora, crie a sua **senha** **transacional**."],
};

const BOTAO_PRIMARIO = "inline-flex items-center justify-center w-full h-14 rounded-pill text-[16px] font-medium disabled:opacity-40";
const ESTILO_PRIMARIO: React.CSSProperties = { background: "var(--erp-num-cor)", color: "var(--color-surface-1)" };

/** As linhas do cartão "Verifique se os dados estão corretos" (o print 0816). */
function linhasDaReceita(r: DadosCNPJ, cnpj: string): { rotulo: string; valor: string }[] {
  const data = r.dataAbertura && /^\d{4}-\d{2}-\d{2}/.test(r.dataAbertura)
    ? `${r.dataAbertura.slice(8, 10)}/${r.dataAbertura.slice(5, 7)}/${r.dataAbertura.slice(0, 4)}` : "";
  const cnae = (r.cnaePrincipal ?? "").replace(/\D/g, "");
  const codigo = cnae.length === 7 ? `${cnae.slice(0, 4)}-${cnae.slice(4, 5)}/${cnae.slice(5)}` : cnae;
  const ramo = [codigo, r.cnaeDescricao].filter(Boolean).join(" - ");
  return [
    { rotulo: "Razão social", valor: r.razaoSocial },
    { rotulo: "CNPJ", valor: cnpj },
    { rotulo: "Data de abertura", valor: data },
    { rotulo: "Tipo de empresa", valor: r.porte ?? "" },
    { rotulo: "Ramo de atividade", valor: ramo },
  ].filter((l) => l.valor);
}

/* ─── os cartões da conversa (card branco, ícone num quadrado lima) ──────── */
const RECOLHIDO: Record<string, (c: Cadastro) => { icone: string; rotulo: string }> = {
  conta: () => ({ icone: "smile", rotulo: "Tipo de conta" }),
  openfinance: (c) => ({ icone: "landmark", rotulo: c.openFinanceBanco ? `Open Finance · ${c.openFinanceBanco}` : "Preenchimento manual" }),
  termos: () => ({ icone: "file-text", rotulo: "Termos de uso aceitos" }),
  infos: () => ({ icone: "building", rotulo: "Informações da empresa enviadas" }),
  facial: (c) => ({ icone: "scan-face", rotulo: c.biometria === "capturada" ? "Autenticado" : "Validação de identidade pendente" }),
  docIdentidade: (c) => ({
    icone: "id-card",
    rotulo: c.documento === "conferido" ? "Documento validado" : c.documento === "enviado" ? "Documento enviado para conferência"
      : c.documento === "pendente" ? "Validação de documento pendente" : "Validando documento",
  }),
  senhaTransacional: () => ({ icone: "key-round", rotulo: "Senha transacional criada" }),
};

function Ladrilho({ icone }: { icone: string }) {
  return (
    <span aria-hidden className="w-11 h-11 flex-none rounded-[12px] flex items-center justify-center bg-lime text-on-lime">
      <Icon name={icone} size={22} color="currentColor" />
    </span>
  );
}

function CartaoDaConversa({
  cartao, ativo, cad, aceite, faixaFat, faixaRenda, onTipo, onConectar, onDuvidas, onAceite, onFaixa, onFacial, onDocumento, onSenha,
}: {
  cartao: Cartao;
  ativo: boolean;
  cad: Cadastro;
  aceite: boolean;
  faixaFat: string;
  faixaRenda: string;
  onTipo: (t: "pf" | "pj") => void;
  onConectar: () => void;
  onDuvidas: () => void;
  onAceite: () => void;
  onFaixa: (q: "faturamento" | "renda") => void;
  onFacial: () => void;
  onDocumento: (t: "rg" | "cnh") => void;
  onSenha: () => void;
}) {
  const caixa = "w-full max-w-[420px] rounded-card p-5 flex flex-col gap-4";
  const fundo = { background: "var(--color-white)" };
  const titulo = "m-0 text-[24px] leading-[1.15] font-medium text-ink";

  // Respondido, o cartão vira uma pílula com o que foi decidido (como nos prints).
  if (!ativo && cartao.tipo in RECOLHIDO && (cartao.tipo !== "conta" || !!cad.tipo)) {
    const r = RECOLHIDO[cartao.tipo](cad);
    return (
      <div data-cartao={cartao.tipo} data-recolhido className="inline-flex items-center gap-3 h-11 pl-2 pr-5 rounded-pill" style={fundo}>
        <span aria-hidden className="w-7 h-7 rounded-[8px] flex items-center justify-center bg-lime text-on-lime">
          <Icon name={r.icone} size={14} color="currentColor" />
        </span>
        <span className="text-[14px] text-muted">{r.rotulo}</span>
      </div>
    );
  }

  if (cartao.tipo === "conta") {
    return (
      <div data-cartao="conta" className={caixa} style={fundo}>
        <Ladrilho icone="smile" />
        <p className={titulo}>Que tipo de conta você gostaria de abrir?</p>
        <div className="flex flex-col gap-2">
          {(["pf", "pj"] as const).map((t) => (
            <button key={t} type="button" disabled={!ativo} onClick={() => onTipo(t)}
              className="inline-flex items-center justify-center h-12 px-6 rounded-pill text-[15px] font-medium text-ink disabled:opacity-60"
              style={{ background: "var(--color-surface-1)" }}>
              {t === "pf" ? "Conta PF" : "Conta PJ"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (cartao.tipo === "documento") {
    return (
      <div data-cartao="documento" className={caixa} style={fundo}>
        <Ladrilho icone={cartao.rotulo === "CNPJ" ? "building" : "user"} />
        {cartao.linhas?.length ? (
          <dl className="m-0 flex flex-col gap-3">
            {cartao.linhas.map((l) => (
              <div key={l.rotulo} className="flex flex-col">
                <dt className="text-[14px] font-medium text-ink">{l.rotulo}</dt>
                <dd className="m-0 text-[15px] text-ink tabular-nums break-words">{l.valor}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="min-w-0 flex flex-col">
            <span className="text-[13px] text-muted tabular-nums">{cartao.rotulo} {cartao.documento}</span>
            <span className="text-[16px] font-medium text-ink break-words">{cartao.nome}</span>
            {cartao.detalhe && <span className="text-[13px] text-muted">{cartao.detalhe}</span>}
          </div>
        )}
      </div>
    );
  }

  if (cartao.tipo === "openfinance") {
    return (
      <div data-cartao="openfinance" className={caixa} style={fundo}>
        <span className="self-start inline-flex items-center gap-1.5 h-7 px-3 rounded-pill text-[12px] text-muted" style={{ background: "var(--color-surface-1)" }}>
          <span aria-hidden className="w-1.5 h-1.5 rounded-pill bg-lime" />
          Recomendado · Leva 1 min
        </span>
        <Ladrilho icone="landmark" />
        <div className="flex flex-col gap-2">
          <p className={titulo}>Sua conta já nasce organizada</p>
          <p className="m-0 text-[14px] leading-[1.45] text-muted">
            Você autoriza no app do seu banco e eu preencho tudo sozinho, via Open Finance regulado pelo Banco Central.
          </p>
        </div>
        <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
          {[
            "Saldo de todas as suas contas em um lugar só",
            "Eu acompanho seus gastos e te aviso quando algo fugir do padrão",
            "Você só confere e confirma, sem preencher nada",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[14px] text-ink">
              <Icon name="check" size={16} className="mt-0.5 flex-none" />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1">
          <button type="button" disabled={!ativo} onClick={onConectar} className="inline-flex items-center justify-center h-12 rounded-pill text-[15px] font-medium disabled:opacity-50" style={ESTILO_PRIMARIO}>
            Conectar meu banco
          </button>
          <button type="button" onClick={onDuvidas} className="h-11 rounded-pill text-[15px] font-medium text-ink">
            Quero entender mais
          </button>
        </div>
      </div>
    );
  }

  if (cartao.tipo === "termos") {
    return (
      <div data-cartao="termos" className={caixa} style={fundo}>
        <Ladrilho icone="file-text" />
        <p className={titulo}>Termos e Condições de Uso</p>
        <label className="flex items-center gap-2.5 text-[14px] text-ink cursor-pointer">
          <input type="checkbox" checked={aceite} onChange={onAceite} disabled={!ativo} className="sr-only peer" />
          <span aria-hidden className="w-5 h-5 flex-none rounded-[6px] flex items-center justify-center border border-border peer-focus-visible:ring-2 peer-focus-visible:ring-ink"
            style={aceite ? { background: "var(--erp-num-cor)", color: "var(--color-surface-1)", borderColor: "transparent" } : undefined}>
            {aceite && <Icon name="check" size={13} color="currentColor" />}
          </span>
          <span>
            Li e aceito os{" "}
            <Link href="/privacidade" target="_blank" className="underline underline-offset-2">termos e condições</Link>
          </span>
        </label>
      </div>
    );
  }

  if (cartao.tipo === "infos") {
    const linha = (q: "faturamento" | "renda", icone: string, rotulo: string, valor: string) => (
      <button type="button" disabled={!ativo} onClick={() => onFaixa(q)} data-faixa={q}
        className="w-full flex items-center gap-3 py-3 text-left disabled:opacity-60">
        <Icon name={icone} size={18} className="flex-none" />
        <span className="min-w-0 flex-1 flex flex-col">
          <span className="text-[14px] font-medium text-ink">{rotulo}</span>
          <span className={`text-[14px] tabular-nums ${valor ? "text-ink" : "text-muted"}`}>{valor || "Clique para preencher"}</span>
        </span>
        <Icon name="chevron-down" size={16} className="flex-none text-muted" />
      </button>
    );
    return (
      <div data-cartao="infos" className="w-full max-w-[420px] flex flex-col gap-3">
        <div className={caixa} style={fundo}>
          <Ladrilho icone="building" />
          <div className="flex flex-col gap-1">
            <p className={titulo}>Informações da empresa</p>
            <p className="m-0 text-[14px] text-muted">Clique no botão ao lado para preencher</p>
          </div>
          <div className="flex flex-col divide-y divide-border-soft">
            {linha("faturamento", "coins", "Faturamento anual", faixaFat)}
            {linha("renda", "trending-up", "Renda do representante", faixaRenda)}
          </div>
        </div>
        <p className="m-0 flex items-start gap-2 px-1 text-[13px] text-muted">
          <Icon name="lock" size={14} className="mt-0.5 flex-none" />
          Seus dados ficam protegidos e são usados apenas para essa finalidade.
        </p>
      </div>
    );
  }

  if (cartao.tipo === "facial") {
    return (
      <div data-cartao="facial" className={caixa} style={fundo}>
        <Ladrilho icone="scan-face" />
        <div className="flex flex-col gap-2">
          <p className={titulo}>Reconhecimento facial</p>
          <p className="m-0 text-[14px] leading-[1.45] text-muted">Para continuar, você precisará liberar o acesso à câmera do celular.</p>
        </div>
        <button type="button" disabled={!ativo} onClick={onFacial} className="inline-flex items-center justify-center h-12 rounded-pill text-[15px] font-medium disabled:opacity-50" style={ESTILO_PRIMARIO}>
          Validar Identidade
        </button>
      </div>
    );
  }

  if (cartao.tipo === "docIdentidade") {
    return (
      <div data-cartao="docIdentidade" className={caixa} style={fundo}>
        <Ladrilho icone="id-card" />
        <div className="flex flex-col gap-2">
          <p className={titulo}>Validação de documentos</p>
          <p className="m-0 text-[14px] leading-[1.45] text-muted">Para continuar, você precisará liberar o acesso à câmera do celular, ou anexar uma foto ou PDF do documento.</p>
          <p className="m-0 text-[14px] leading-[1.45] text-muted">Os documentos podem ser: CNH, RG</p>
        </div>
        <div className="flex flex-col gap-2">
          {(["rg", "cnh"] as const).map((t) => (
            <button key={t} type="button" disabled={!ativo} onClick={() => onDocumento(t)}
              className="inline-flex items-center justify-center h-12 rounded-pill text-[15px] font-medium disabled:opacity-50" style={ESTILO_PRIMARIO}>
              Validar {TIPOS_DOCUMENTO[t]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (cartao.tipo === "senhaTransacional") {
    return (
      <div data-cartao="senhaTransacional" className={caixa} style={fundo}>
        <Ladrilho icone="key-round" />
        <div className="flex flex-col gap-2">
          <p className={titulo}>Senha transacional</p>
          <p className="m-0 text-[14px] leading-[1.45] text-muted">Digite 6 dígitos para autorizar Pix e pagamentos.</p>
        </div>
        <button type="button" disabled={!ativo} onClick={onSenha} className="inline-flex items-center justify-center h-12 rounded-pill text-[15px] font-medium disabled:opacity-50" style={ESTILO_PRIMARIO}>
          Criar senha
        </button>
      </div>
    );
  }

  if (cartao.tipo !== "analise") return null;
  const m = cartao.maturidade;
  return (
    <div data-cartao="analise" className="w-full max-w-[480px] rounded-card p-5 flex flex-col gap-3" style={fundo}>
      <div className="flex items-center gap-4">
        <Ladrilho icone="sparkles" />
        <div className="flex flex-col">
          <span className="text-[13px] text-muted">Maturidade financeira</span>
          <span className="text-[22px] font-medium text-ink tabular-nums">{Math.round(m.score)} de 100</span>
        </div>
      </div>
      {m.fortes.length > 0 && <p className="m-0 text-[14px] text-ink"><span className="text-muted">Pontos fortes: </span>{m.fortes.slice(0, 2).join(" · ")}</p>}
      {m.atencao.length > 0 && <p className="m-0 text-[14px] text-ink"><span className="text-muted">Atenção: </span>{m.atencao.slice(0, 2).join(" · ")}</p>}
      {m.recomendacoes[0] && <p className="m-0 text-[14px] text-muted">{m.recomendacoes[0]}</p>}
    </div>
  );
}

/* ─── a folha que sobe de baixo (sólida, como todo sobreposto do sistema) ── */
function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="a4p-folha w-full max-w-[560px] max-h-[85dvh] overflow-y-auto rounded-t-[24px] sm:rounded-[24px] sm:mb-6 px-6 pt-5 pb-8"
        style={{ background: "var(--color-white)" }}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="m-0 text-[17px] font-medium text-ink">{titulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" autoFocus
            className="w-8 h-8 rounded-pill flex items-center justify-center text-ink" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Duvidas() {
  const [aberta, setAberta] = React.useState(0);
  return (
    <div className="flex flex-col" data-folha="duvidas">
      {DUVIDAS_OPEN_FINANCE.map((d, i) => (
        <div key={d.pergunta} className="py-3">
          <button type="button" aria-expanded={aberta === i} onClick={() => setAberta(aberta === i ? -1 : i)}
            className="w-full flex items-start justify-between gap-3 text-left text-[15px] font-medium text-ink">
            {d.pergunta}
            <Icon name={aberta === i ? "chevron-up" : "chevron-down"} size={16} className="mt-1 flex-none" />
          </button>
          {aberta === i && <p className="m-0 mt-2 text-[14px] leading-[1.5] text-muted">{d.resposta}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * RECONHECIMENTO FACIAL — as dicas em carrossel e a câmera frontal.
 *
 * ⚠️ **A verificação biométrica ainda não existe** (não há provedor
 * contratado). A tela pede a câmera de verdade e tira a foto, mas a foto NÃO
 * sai do aparelho: o cadastro guarda só que ela foi tirada (`capturada`). Sem
 * câmera, a validação fica `pendente` — ninguém é impedido de abrir a conta
 * por estar num computador sem câmera.
 */
function ReconhecimentoFacial({ onFechar, onConcluir }: { onFechar: () => void; onConcluir: (s: "capturada" | "pendente") => void }) {
  const [modo, setModo] = React.useState<"dicas" | "camera" | "erro">("dicas");
  const [dica, setDica] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const fluxoRef = React.useRef<MediaStream | null>(null);

  const parar = React.useCallback(() => { fluxoRef.current?.getTracks().forEach((t) => t.stop()); fluxoRef.current = null; }, []);
  React.useEffect(() => parar, [parar]);
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);
  React.useEffect(() => {
    if (modo !== "dicas") return;
    const t = setInterval(() => setDica((d) => (d + 1) % DICAS_FACIAL.length), 2800);
    return () => clearInterval(t);
  }, [modo]);

  const abrirCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("sem câmera");
      const fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      fluxoRef.current = fluxo;
      setModo("camera");
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = fluxo; void videoRef.current.play().catch(() => {}); } });
    } catch {
      setModo("erro");
    }
  };
  const capturar = () => { parar(); onConcluir("capturada"); };
  const fechar = () => { parar(); onFechar(); };
  const d = DICAS_FACIAL[dica];

  return (
    <div role="dialog" aria-modal="true" aria-label="Reconhecimento facial" className="a4p-chat-tela fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-surface-1)" }} data-facial={modo}>
      <div className="flex-none flex justify-end px-4 pt-6">
        <button type="button" onClick={fechar} aria-label="Fechar" className="w-10 h-10 rounded-pill flex items-center justify-center text-ink">
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-8 px-6 text-center">
        {modo === "dicas" && (
          <>
            <span aria-hidden className="relative w-[200px] h-[200px] rounded-pill flex items-center justify-center text-ink" style={{ background: "var(--color-white)" }}>
              <Icon name={d.icone} size={88} strokeWidth={1.25} />
              <span className="absolute top-3 right-3 w-11 h-11 rounded-pill flex items-center justify-center bg-lime text-on-lime">
                <Icon name={d.icone === "glasses" ? "x" : "check"} size={20} color="currentColor" />
              </span>
            </span>
            <p className="m-0 max-w-[320px] text-[28px] leading-[1.15] font-medium text-ink" aria-live="polite">{d.titulo}</p>
            <div className="flex gap-2" role="tablist" aria-label="Dicas">
              {DICAS_FACIAL.map((x, i) => (
                <button key={x.titulo} type="button" role="tab" aria-selected={i === dica} aria-label={x.titulo} onClick={() => setDica(i)}
                  className="h-1.5 rounded-pill transition-all" style={{ width: i === dica ? 24 : 8, background: i === dica ? "var(--erp-num-cor)" : "var(--color-text-tertiary)" }} />
              ))}
            </div>
          </>
        )}
        {modo === "camera" && (
          <>
            <div className="w-[260px] h-[340px] rounded-[50%] overflow-hidden" style={{ background: "var(--color-white)", outline: "3px solid var(--color-lime)", outlineOffset: 6 }}>
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
            </div>
            <p className="m-0 text-[17px] text-ink">Centralize o rosto no contorno</p>
          </>
        )}
        {modo === "erro" && (
          <>
            <span aria-hidden className="w-[120px] h-[120px] rounded-pill flex items-center justify-center text-ink" style={{ background: "var(--color-white)" }}>
              <Icon name="camera" size={52} strokeWidth={1.25} />
            </span>
            <div className="flex flex-col gap-2 max-w-[340px]">
              <p className="m-0 text-[22px] font-medium text-ink">Não consegui abrir a câmera</p>
              <p className="m-0 text-[15px] text-muted">Libere o acesso à câmera no navegador e tente de novo, ou siga e valide depois, pelo celular.</p>
            </div>
          </>
        )}
      </div>
      <div className="flex-none mx-auto w-[calc(100%-40px)] max-w-[480px] mb-6 flex flex-col gap-2">
        {modo === "dicas" && <button type="button" onClick={() => void abrirCamera()} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Tirar foto</button>}
        {modo === "camera" && <button type="button" onClick={capturar} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Capturar</button>}
        {modo === "erro" && (
          <>
            <button type="button" onClick={() => void abrirCamera()} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Tentar de novo</button>
            <button type="button" onClick={() => { parar(); onConcluir("pendente"); }} className="h-12 rounded-pill text-[15px] text-ink">Validar depois</button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * VALIDAÇÃO DO DOCUMENTO — as dicas em carrossel e as duas portas: "Tirar
 * foto" (câmera traseira no celular, `capture="environment"`) e "Anexar
 * arquivo" (foto ou PDF já guardados). No computador as duas abrem o seletor
 * de arquivos. A imagem não sai do aparelho: quem a lê é o OCR do navegador.
 */
function ValidacaoDocumento({ tipo, onFechar, onArquivo, onDepois }: {
  tipo: "rg" | "cnh";
  onFechar: () => void;
  onArquivo: (a: File, origem: "foto" | "anexo") => void;
  onDepois: () => void;
}) {
  const [dica, setDica] = React.useState(0);
  const [erro, setErro] = React.useState<string | null>(null);
  const fotoRef = React.useRef<HTMLInputElement>(null);
  const anexoRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);
  React.useEffect(() => {
    const t = setInterval(() => setDica((d) => (d + 1) % DICAS_DOCUMENTO.length), 2800);
    return () => clearInterval(t);
  }, []);
  const receber = (e: React.ChangeEvent<HTMLInputElement>, origem: "foto" | "anexo") => {
    const a = e.target.files?.[0];
    e.target.value = "";
    if (!a) return;
    const ok = a.type.startsWith("image/") || a.type === "application/pdf" || /\.(pdf|png|jpe?g|webp|heic)$/i.test(a.name);
    if (!ok) { setErro("Envie uma foto (JPG ou PNG) ou um PDF do documento."); return; }
    if (a.size > 10 * 1024 * 1024) { setErro("O arquivo passa de 10 MB. Tire outra foto ou envie um PDF menor."); return; }
    onArquivo(a, origem);
  };
  const d = DICAS_DOCUMENTO[dica];
  const nome = TIPOS_DOCUMENTO[tipo];

  return (
    <div role="dialog" aria-modal="true" aria-label={`Validar ${nome}`} className="a4p-chat-tela fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-surface-1)" }} data-documento={tipo}>
      <div className="flex-none flex justify-end px-4 pt-6">
        <button type="button" onClick={onFechar} aria-label="Fechar" className="w-10 h-10 rounded-pill flex items-center justify-center text-ink">
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-8 px-6 text-center">
        <span aria-hidden className="relative w-[200px] h-[200px] rounded-pill flex items-center justify-center text-ink" style={{ background: "var(--color-white)" }}>
          <Icon name={d.icone} size={88} strokeWidth={1.25} />
          <span className="absolute top-3 right-3 w-11 h-11 rounded-pill flex items-center justify-center bg-lime text-on-lime">
            <Icon name="check" size={20} color="currentColor" />
          </span>
        </span>
        <p className="m-0 max-w-[320px] text-[28px] leading-[1.15] font-medium text-ink" aria-live="polite">{d.titulo}</p>
        <div className="flex gap-2" role="tablist" aria-label="Dicas">
          {DICAS_DOCUMENTO.map((x, i) => (
            <button key={x.titulo} type="button" role="tab" aria-selected={i === dica} aria-label={x.titulo} onClick={() => setDica(i)}
              className="h-1.5 rounded-pill transition-all" style={{ width: i === dica ? 24 : 8, background: i === dica ? "var(--erp-num-cor)" : "var(--color-text-tertiary)" }} />
          ))}
        </div>
        {erro && <p role="alert" className="m-0 max-w-[340px] text-[15px] text-ink">{erro}</p>}
      </div>
      <div className="flex-none mx-auto w-[calc(100%-40px)] max-w-[480px] mb-6 flex flex-col gap-2">
        <button type="button" onClick={() => fotoRef.current?.click()} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>
          Tirar foto
        </button>
        <button type="button" onClick={() => anexoRef.current?.click()} className="inline-flex items-center justify-center gap-2 h-14 rounded-pill text-[15px] font-medium text-ink a4p-pilula">
          <Icon name="paperclip" size={18} />
          Anexar arquivo
        </button>
        <button type="button" onClick={onDepois} className="h-11 rounded-pill text-[15px] text-muted">Validar depois</button>
        <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden aria-label={`Foto do ${nome}`} onChange={(e) => receber(e, "foto")} />
        <input ref={anexoRef} type="file" accept="image/*,application/pdf" hidden aria-label={`Arquivo do ${nome}`} onChange={(e) => receber(e, "anexo")} />
      </div>
    </div>
  );
}

/** Seis bolinhas sobre um campo numérico de verdade (o teclado e o leitor de tela continuam funcionando). */
function CampoPin({ rotulo, valor, onMudar, autoFocus }: { rotulo: string; valor: string; onMudar: (v: string) => void; autoFocus?: boolean }) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14px] text-muted">{rotulo}</label>
      <div className="relative h-14 rounded-[14px] flex items-center gap-3 px-4" style={{ background: "var(--color-surface-1)" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} aria-hidden className="w-3 h-3 rounded-pill"
            style={{ background: i < valor.length ? "var(--erp-num-cor)" : "var(--color-text-tertiary)", opacity: i < valor.length ? 1 : 0.45 }} />
        ))}
        <input
          id={id}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          autoFocus={autoFocus}
          value={valor}
          onChange={(e) => onMudar(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-text"
          data-pin={rotulo}
        />
      </div>
    </div>
  );
}

/**
 * A senha transacional (o print 0840). ⚠️ O número NÃO é guardado: o cadastro
 * leva só que ela foi definida, e Pix e pagamentos ainda não a pedem — guardar
 * um PIN de 6 dígitos no perfil ou no navegador seria pior que não ter.
 */
function SenhaTransacional({ onSalvar }: { onSalvar: () => void }) {
  const [senha, setSenha] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const [tentou, setTentou] = React.useState(false);
  const problema = problemaDaSenhaTransacional(senha, confirmar);
  const completo = senha.length === 6 && confirmar.length === 6;
  return (
    <form className="flex flex-col gap-4" data-folha="senhaTransacional"
      onSubmit={(e) => { e.preventDefault(); setTentou(true); if (!problema) onSalvar(); }}>
      <p className="m-0 text-[14px] text-muted">Digite 6 dígitos para autorizar Pix e pagamentos</p>
      <CampoPin rotulo="Senha" valor={senha} onMudar={setSenha} autoFocus />
      <CampoPin rotulo="Confirmar senha" valor={confirmar} onMudar={setConfirmar} />
      {(tentou || completo) && problema && <p role="alert" className="m-0 text-[14px] text-ink">{problema}</p>}
      <button type="submit" disabled={!completo} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Salvar</button>
    </form>
  );
}
