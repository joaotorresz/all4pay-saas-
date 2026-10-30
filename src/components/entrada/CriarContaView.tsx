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
 *   4. O roteiro da abertura (27/10/2026): nome, WhatsApp, e-mail, termos,
 *      rosto, documento, contrato social ou comprovante (opcional) e a senha
 *      de ACESSO, digitada duas vezes. Depois o resto, uma pergunta por vez,
 *      na ordem de `core/cadastro/conversa`.
 *   5. A conta só nasce com `faltandoParaCriar` vazio — e o pedido da
 *      maquininha sai logo depois dela (o pedido é da empresa).
 *
 * ⚠️ **As regras de antes continuam.** O nome vazio é recusado na tela, a
 * senha usa o mesmo `MIN_SENHA`, o nome viaja no `signUp` por
 * `criarContaEEntrar`, o cadastro guardado no navegador é NOVO (nunca mesclado
 * com o de outra organização) e a ordem de gravação é a do wizard: conta →
 * alçada → perfil → estrutura → pedido da maquininha. As guardas (`cadastro-nome`,
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
import { criarContaEEntrar, emailDaSessao, nomearEmpresaDaConta } from "@/lib/entrada";
import { persistCompany, saveCompany, type StoredCompany } from "@/lib/company";
import { concluirJornada, registrarPasso } from "@/lib/cadastro-jornada";
import { enviarDocumentosDoCadastro, type DocumentoPendente } from "@/lib/cadastro-documentos";
import type { TipoDocumento } from "@/core/cadastro/documentos";
import { aplicarEstrutura } from "@/lib/onboarding";
import { aplicarAlcadaDoOnboarding } from "@/lib/alcada";
import { reportar, motivoDaRecusa } from "@/lib/erros";
import { textoDoDocumento } from "@/lib/ocr-local";
import { consultarCNPJ, type DadosCNPJ } from "@/lib/cnpj";
import { lookupCep } from "@/lib/viacep";
import { enviarPedido } from "@/lib/maquininha-oferta";
import { setTipoConta } from "@/components/app/useTipoConta";
import { alcadaDoOnboarding } from "@/core/seguranca/alcada";
import { MIN_SENHA } from "@/core/recuperacao";
import { BancoLogo } from "@/components/ui/BancoLogo";
import {
  DICAS_DOCUMENTO, DICAS_FACIAL, TIPOS_DOCUMENTO, lerDocumentoIdentidade, pedidoDaMaquininha,
  passosEspeciais, proximoPasso, type PassoEspecial,
  CADASTRO_VAZIO, aplicarReceita, cnpjConfere, cpfConfere, faltandoParaCriar, mascararCEP, mascararCNPJ,
  mascararCPF, mascararTelefone, montarCadastro, nomeDaOrganizacao, perguntasDoCadastro, proximaPergunta,
  type Cadastro, type DadosReceita, type Pergunta,
} from "@/core/cadastro/conversa";
import { DigitandoIA, TextoRevelado, duracaoRevelar } from "@/components/ia/conversa";
import { celularCanonico, celularLegivel, DIGITOS_CODIGO_WHATSAPP } from "@/core/whatsapp/numero";
import { confirmarNumeroAction, pedirCodigoNumeroAction, situacaoNumeroAction } from "@/app/configuracoes/seguranca/acoes";

type Etapa =
  | "tipo" | "documento" | "buscando" | "confirmar" | "pergunta" | "senha"
  | "termos" | "facial" | "docIdentidade" | "docEmpresa"
  | "criando" | "confirme" | "erro" | "pronto"
  /* a oferta da Quattro AI no WhatsApp, depois da conta criada */
  | "whatsapp" | "whatsappCodigo";

type Cartao =
  | { tipo: "conta" }
  | { tipo: "documento"; rotulo: string; documento: string; nome: string; detalhe?: string; linhas?: { rotulo: string; valor: string }[] }
  | { tipo: Exclude<PassoEspecial, "senha"> };

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
  /** O ícone 3D que abre a fala (`public/icones-3d`). */
  icone3d?: Icone3D;
}

/*
 * ⚠️ OS ÍCONES 3D DO ONBOARDING (27/10/2026, escolha do dono): biblioteca
 * 3dicons (CC0), ângulo Dynamic, estilo Color, em `public/icones-3d/`. Só a
 * abertura de conta os usa; o resto do sistema segue no Lucide.
 */
type Icone3D = "boy" | "folder" | "copy" | "camera" | "locker" | "folder-fav" | "lock" | "wallet" | "credit-card" | "tick" | "sun" | "picture" | "bulb" | "file-new";
/** A pergunta que abre com ícone próprio (as que não têm cartão). */
const ICONE_DA_PERGUNTA: Record<string, Icone3D> = { senha: "lock", bancos: "wallet", maquininha: "credit-card" };
function Icone3d({ nome, tamanho }: { nome: Icone3D; tamanho: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- PNG pequeno e local; o next/image não ganha nada aqui
  return <img src={`/icones-3d/${nome}.png`} alt="" aria-hidden width={tamanho} height={tamanho} className="flex-none select-none" draggable={false} />;
}

/** O que existia ANTES de cada resposta — é o que o "Alterar" devolve. */
interface Marco { id: string; antes: Cadastro }

type Modo = "text" | "numeric" | "email" | "tel" | "decimal";
interface Campo { rotulo: string; placeholder: string; tipo: string; modo: Modo; auto: string; mascara: ((s: string) => string) | null }

let proximoId = 0;
const novaFala = (f: Omit<Fala, "id">): Fala => ({ ...f, id: ++proximoId });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const configurado = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** O que a barra de baixo é em cada passo. */
function campoDe(etapa: Etapa | "senhaConfirmar", c: Cadastro, p: Pergunta | null): Campo | null {
  if (etapa === "documento") {
    return c.tipo === "pj"
      ? { rotulo: "CNPJ", placeholder: "00.000.000/0000-00", tipo: "text", modo: "numeric", auto: "off", mascara: mascararCNPJ }
      : { rotulo: "CPF", placeholder: "000.000.000-00", tipo: "text", modo: "numeric", auto: "off", mascara: mascararCPF };
  }
  if (etapa === "senha") {
    return { rotulo: "Senha", placeholder: `Senha com pelo menos ${MIN_SENHA} caracteres`, tipo: "password", modo: "text", auto: "new-password", mascara: null };
  }
  if (etapa === "whatsappCodigo") {
    return {
      rotulo: "Código do WhatsApp", placeholder: "Código de 6 números", tipo: "text", modo: "numeric", auto: "one-time-code",
      mascara: (s) => s.replace(/\D/g, "").slice(0, DIGITOS_CODIGO_WHATSAPP),
    };
  }
  if (etapa === "senhaConfirmar") {
    return { rotulo: "Confirmar a senha", placeholder: "Digite a senha de novo", tipo: "password", modo: "text", auto: "new-password", mascara: null };
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
  /** A senha de acesso pede duas digitações: a segunda confirma a primeira. */
  const [senhaFase, setSenhaFase] = React.useState<"criar" | "confirmar">("criar");
  /** "Meu banco não está na lista": o campo para digitar o banco que falta. */
  const [outroAberto, setOutroAberto] = React.useState(false);
  const [outroTexto, setOutroTexto] = React.useState("");
  const [facialAberto, setFacialAberto] = React.useState(false);
  /** O documento escolhido no cartão "Validação de documentos" (abre as dicas e a foto). */
  const [docAberto, setDocAberto] = React.useState<null | "rg" | "cnh">(null);
  /** A leitura do documento no navegador (OCR) em andamento. */
  const [lendoDoc, setLendoDoc] = React.useState(false);

  /*
   * ⚠️ **A JORNADA É REGISTRADA A CADA PASSO** (`lib/cadastro-jornada`): é o
   * que deixa o admin ver quem parou e onde. Na pergunta, o passo é o campo
   * perguntado ("repTelefone"), não a palavra "pergunta" — senão o funil teria
   * um degrau só para quinze perguntas. Só o contato sai; documento, CPF e
   * senha nunca.
   */
  const passoDaJornada = etapa === "pergunta" ? atual?.id ?? null : etapa;
  React.useEffect(() => {
    if (!passoDaJornada || passoDaJornada === "pronto") return;
    registrarPasso({
      etapa: passoDaJornada,
      ...(cad.tipo ? { tipo: cad.tipo } : {}),
      nome: (cad.tipo === "pf" ? cad.nome : cad.repNome) || undefined,
      whatsapp: cad.repTelefone || undefined,
      email: (cad.tipo === "pf" ? cad.email : cad.repEmail) || undefined,
    });
    // ⚠️ Só o PASSO dispara: o contato vai junto com o passo seguinte, não a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passoDaJornada]);

  const vivoRef = React.useRef(true);
  const campoRef = React.useRef<HTMLInputElement>(null);
  /**
   * ⚠️ A SENHA DE ACESSO mora só aqui, até o `signUp`: nunca no cadastro, no
   * perfil ou no navegador. O cadastro leva só a marca (`senhaAcesso`).
   */
  const senhaRef = React.useRef<string | null>(null);
  const fimRef = React.useRef<HTMLDivElement>(null);
  const semMovimento = React.useRef(false);
  /** A conta já existe (o "Tentar de novo" depois dela só refaz o resto). */
  const contaCriada = React.useRef(false);
  const documentosRef = React.useRef<DocumentoPendente[]>([]);
  /**
   * ⚠️ **A conta que voltou do Google** (`/criar-conta?google=1`, `core/google`):
   * o e-mail da sessão. Ela já existe no Auth — a conversa não pergunta e-mail
   * nem senha, e no fim NOMEIA a empresa provisória em vez de criar a conta.
   * Sem sessão (o link aberto à toa), a conversa é a de sempre.
   */
  const googleRef = React.useRef<string | null>(null);
  /** Para onde a pessoa vai depois da conta criada (e da oferta do WhatsApp). */
  const destinoRef = React.useRef("/");

  /** A IA fala uma frase de cada vez, com o "digitando" entre elas. */
  const falar = React.useCallback(async (textos: string[], extra?: Partial<Fala>, inicio = 0) => {
    setFalando((n) => n + 1);
    // O ícone 3D abre a PERGUNTA (a fala `inicio`, depois do que responde ao passo
    // anterior), não a última: "Você já tem a maquininha?" vem antes do "Com ela…",
    // e o ícone no meio separava a pergunta do porquê.
    const { icone3d: iconeExtra, ...resto } = extra ?? {};
    const icone = iconeExtra ?? (extra?.pergunta ? ICONE_DA_PERGUNTA[extra.pergunta] : undefined);
    try {
    for (let i = 0; i < textos.length; i++) {
      setDigitando(true);
      await esperar(semMovimento.current ? 0 : 450 + Math.min(textos[i].length * 6, 450));
      if (!vivoRef.current) return;
      setDigitando(false);
      const ultima = i === textos.length - 1;
      setFalas((fs) => [...fs, novaFala({ de: "ia", texto: textos[i], ...(i === inicio && icone ? { icone3d: icone } : {}), ...(ultima ? resto : {}) })]);
      // A frase surge palavra por palavra: a próxima só começa quando ela termina.
      if (!semMovimento.current) await esperar(duracaoRevelar(textos[i]));
      if (!vivoRef.current) return;
    }
    } finally { setFalando((n) => n - 1); }
  }, []);

  React.useEffect(() => {
    vivoRef.current = true;
    semMovimento.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const veioDoGoogle = new URLSearchParams(window.location.search).get("google") === "1";
    void (async () => {
      const email = veioDoGoogle ? await emailDaSessao() : null;
      if (!vivoRef.current) return;
      googleRef.current = email;
      await falar(
        email
          ? [`Você entrou com o Google (${email}).`, "Ainda não há uma empresa cadastrada nessa conta. Vamos fazer o cadastro antes de entrar no sistema."]
          : ["Bora organizar as finanças da sua empresa num lugar só: caixa, contas e relatórios, com a Quattro AI do seu lado."],
        { cartao: { tipo: "conta" } },
      );
    })();
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

  // O teclado do celular encolhe a tela: a última fala volta a ficar à vista.
  const rolarAoFim = React.useCallback(() => {
    setTimeout(() => fimRef.current?.scrollIntoView({ behavior: "auto", block: "end" }), 250);
  }, []);
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    vv.addEventListener("resize", rolarAoFim);
    return () => vv.removeEventListener("resize", rolarAoFim);
  }, [rolarAoFim]);

  const campo = campoDe(etapa === "senha" && senhaFase === "confirmar" ? "senhaConfirmar" : etapa, cad, atual);
  const temCampo = !!campo;
  React.useEffect(() => { if (temCampo && !ocupadoFala) campoRef.current?.focus(); }, [temCampo, ocupadoFala, etapa, atual, senhaFase]);

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
      if (id === "senha") {
        senhaRef.current = null;
        setSenhaFase("criar");
        setTexto("");
        setEtapa("senha");
        await falar([...prefixo, `Agora crie a sua senha de acesso ao sistema, com pelo menos ${MIN_SENHA} caracteres. É com ela e o e-mail ${c.email} que você entra.`], { pergunta: "senha" }, prefixo.length);
        return;
      }
      if (id === "termos") setAceite(!!c.aceiteTermos);
      setEtapa(id);
      await falar([...prefixo, ...FALAS_DO_PASSO[id](c)], { pergunta: id, cartao: { tipo: id } }, prefixo.length);
      return;
    }
    const p = passo ? passo.pergunta : null;
    if (p) {
      setAtual(p);
      setMarcadas(p.inicial ? p.inicial(c) : []);
      setOutroAberto(false); setOutroTexto("");
      setEtapa("pergunta");
      await falar([...prefixo, ...p.falas(c)], { pergunta: p.id }, prefixo.length);
      return;
    }
    setAtual(null);
    // A conta do Google já tem como entrar: não há senha a criar.
    if (googleRef.current) { await criar(c, null); return; }
    if (!senhaRef.current) { await pedirSenhaDeNovo(["Antes de criar a conta, preciso que você digite a senha de acesso de novo."]); return; }
    await criar(c, senhaRef.current);
  };

  /* ─── 1. o tipo de conta ─────────────────────────────────────────────── */
  const escolherTipo = async (tipo: "pf" | "pj") => {
    if (etapa !== "tipo" || ocupadoFala) return;
    voce(tipo === "pj" ? "Conta PJ" : "Conta PF", "tipo");
    const google = googleRef.current;
    // Do Google, o e-mail já vem da conta: a pergunta dele fica respondida
    // (o marco vem ANTES do tipo, para o "voltar" não cair nele).
    const novo: Cadastro = google
      ? { ...CADASTRO_VAZIO, tipo, email: google, senhaAcesso: "google", ...(tipo === "pj" ? { repEmail: google } : {}) }
      : { ...CADASTRO_VAZIO, tipo };
    setMarcos([
      // Do Google também não há senha a criar: o passo da senha fica feito.
      ...(google ? [{ id: tipo === "pj" ? "repEmail" : "emailPf", antes: CADASTRO_VAZIO }, { id: "senha", antes: CADASTRO_VAZIO }] : []),
      { id: "tipo", antes: CADASTRO_VAZIO },
    ]);
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
        const ms = [...marcos, { id: "documento", antes: cad }];
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
    const ms = [...marcos, { id: "documento", antes: cad }];
    setMarcos(ms);
    setCad(novo);
    setTexto("");
    await perguntar(novo, ms);
  };

  const confirmarDocumento = async () => {
    if (etapa !== "confirmar" || ocupadoFala) return;
    voce("Confirmar", "documento");
    const novo = receita ? aplicarReceita(cad, receita) : cad;
    const ms = [...marcos, { id: "documento", antes: { ...cad, cnpj: "" } }];
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

  /* ─── os cartões da abertura: termos, rosto, documentos ───────────────── */
  const concluirPasso = async (id: PassoEspecial, eco: string, novo: Cadastro, prefixo: string[] = []) => {
    if (etapa !== id || ocupadoFala) return;
    setFacialAberto(false);
    setDocAberto(null);
    voce(eco, id);
    const ms = [...marcos, { id, antes: cad }];
    setMarcos(ms);
    setCad(novo);
    await perguntar(novo, ms, prefixo);
  };

  const aceitarTermos = () =>
    void concluirPasso("termos", "Li e aceito os termos e condições", { ...cad, aceiteTermos: new Date().toISOString() });
  /**
   * ⚠️ OS ARQUIVOS ESPERAM NA MEMÓRIA DA ABA até a conta nascer (antes dela não
   * há sessão para subir ao cofre). Refazer um passo TROCA o arquivo do mesmo
   * papel, nunca acumula. Sobem logo depois da conta (`enviarDocumentosDoCadastro`).
   */
  const guardarDocumento = (tipos: TipoDocumento[], novo: DocumentoPendente | null) => {
    documentosRef.current = [...documentosRef.current.filter((d) => !tipos.includes(d.tipo)), ...(novo ? [novo] : [])];
  };
  const concluirFacial = (status: "capturada" | "pendente", foto?: Blob) => {
    guardarDocumento(["selfie"], status === "capturada" && foto ? { tipo: "selfie", arquivo: foto } : null);
    void concluirPasso("facial", status === "capturada" ? "Foto enviada" : "Validar depois", { ...cad, biometria: status },
      [status === "capturada" ? "Recebi a sua foto. Obrigado!" : "Tudo bem: a validação fica pendente e eu te lembro dela lá dentro."]);
  };

  /**
   * O DOCUMENTO DE IDENTIDADE: foto (câmera traseira) ou arquivo anexado,
   * lido no navegador e conferido contra o CPF e o nome do cadastro.
   * ⚠️ Não é validação documental (não há provedor): o que a leitura não
   * confirma segue como "enviado", para conferência — nunca reprova.
   */
  const enviarDocumento = async (tipo: "rg" | "cnh", arquivo: File, origem: "foto" | "anexo") => {
    if (etapa !== "docIdentidade" || ocupadoFala) return;
    setDocAberto(null);
    guardarDocumento(["rg", "cnh"], { tipo, arquivo });
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
    const ms = [...marcos, { id: "docIdentidade", antes: cad }];
    const novo: Cadastro = { ...cad, docTipo: tipo, documento: conferido ? "conferido" : "enviado" };
    setMarcos(ms);
    setCad(novo);
    await perguntar(novo, ms, [conferido
      ? `Conferi o seu ${nome}: os dados batem com o cadastro.`
      : `Recebi o seu ${nome}. Não consegui ler tudo agora, então ele fica para conferência e você segue normalmente.`]);
  };
  const documentoDepois = (tipo: "rg" | "cnh") => {
    guardarDocumento(["rg", "cnh"], null);
    void concluirPasso("docIdentidade", "Validar depois", { ...cad, docTipo: tipo, documento: "pendente" },
      ["Tudo bem: a validação do documento fica pendente e eu te lembro dela lá dentro."]);
  };
  /**
   * O CONTRATO SOCIAL OU O COMPROVANTE DE ENDEREÇO (opcional). O arquivo, como
   * a foto do rosto e a do documento, vai ao cofre depois de a conta nascer.
   */
  const NOME_DOC_EMPRESA = { contrato: "contrato social", comprovante: "comprovante de endereço" } as const;
  const enviarDocEmpresa = (tipo: "contrato" | "comprovante", arquivo: File) => {
    guardarDocumento(["contrato", "comprovante"], { tipo, arquivo });
    void concluirPasso("docEmpresa", `${NOME_DOC_EMPRESA[tipo][0].toUpperCase()}${NOME_DOC_EMPRESA[tipo].slice(1)} anexado`, { ...cad, docEmpresa: tipo },
      [`Recebi o ${NOME_DOC_EMPRESA[tipo]}. Obrigado!`]);
  };
  const docEmpresaDepois = () => {
    guardarDocumento(["contrato", "comprovante"], null);
    void concluirPasso("docEmpresa", "Enviar depois", { ...cad, docEmpresa: "depois" },
      ["Sem problema: você envia depois, em Configurações."]);
  };

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
    const ms = [...marcos, { id: p.id, antes: cad }];
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

  /* ─── 5. a senha e a criação ─────────────────────────────────────────── */
  const criar = async (c: Cadastro, senha: string | null) => {
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
        const r = await (senha === null ? nomearEmpresaDaConta(nomeEmpresa) : criarContaEEntrar(email, senha, nomeEmpresa)).catch(() => ({
          ok: false as const, confirmarEmail: false,
          motivo: "Não foi possível concluir agora.", comoResolver: "Tente de novo em alguns segundos.",
        }));
        if (!vivoRef.current) return;
        if (!r.ok && r.confirmarEmail) {
          // ⚠️ Os DOCUMENTOS não sobem neste caminho: sem sessão não há cofre, e eles
          // ficam para validar lá dentro (a confirmação de e-mail está desligada).
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
              ...(senha === null ? [] : [
                { rotulo: "Trocar o e-mail", icone: "mail", fazer: () => alterar(c.tipo === "pf" ? "emailPf" : "repEmail") },
                { rotulo: "Trocar a senha", icone: "edit", fazer: () => alterar("senha") },
              ]),
            ],
          });
          return;
        }
        contaCriada.current = true;
      }
      // A jornada fica ligada à empresa que acabou de nascer (sem esperar: é telemetria).
      void concluirJornada();
      // Os documentos guardados na aba sobem ao cofre (sem esperar: a falha é
      // reportada e o cliente segue, com o documento "a validar" lá dentro).
      const docs = documentosRef.current;
      documentosRef.current = [];
      if (docs.length) {
        void enviarDocumentosDoCadastro(docs)
          .then((r) => r.falhas.forEach((f) => reportar("criar-conta.cofre", new Error(f.motivo), `o documento "${f.tipo}" do cadastro não chegou ao cofre; ele segue como enviado, para validar lá dentro`, true)))
          .catch((e) => reportar("criar-conta.cofre", e, "os documentos do cadastro não chegaram ao cofre; eles seguem como enviados, para validar lá dentro", true));
      }
      // Daqui para baixo existe sessão. A MESMA ordem do cadastro de sete passos.
      let falhaAlcada: string | null = null;
      if (c.tipo === "pj") {
        try { await aplicarAlcadaDoOnboarding(alcadaDoOnboarding(montado.participantes)); }
        catch (e) {
          reportar("organizacao.alcada", e, "os limites de aprovação respondidos no cadastro não foram gravados; vale o teto padrão até alguém ajustar");
          falhaAlcada = motivoDaRecusa(e);
        }
      }
      // ⚠️ `limite` sai do perfil: a alçada mora em `central_alcada`, não aqui.
      const semLimite = montado.participantes.map(({ limite: _limite, ...resto }) => resto);
      await persistCompany({ ...company, participantes: semLimite });
      if (configurado) await aplicarEstrutura(montado.estrutura);
      /*
       * ⚠️ O PEDIDO DA MAQUININHA só sai agora: ele é da EMPRESA, e a empresa
       * nasceu com a conta. Uma recusa não desfaz a conta — a pessoa refaz o
       * pedido na página Maquininha, que é para onde ela vai.
       */
      const pedido = pedidoDaMaquininha(c);
      let falhaPedido: string | null = null;
      if (pedido) {
        try {
          await enviarPedido(pedido);
        } catch (e) {
          falhaPedido = motivoDaRecusa(e);
          reportar("criar-conta.maquininha", e, "o pedido da maquininha feito na abertura não foi registrado; a pessoa refaz na página Maquininha");
        }
      }
      if (!vivoRef.current) return;
      destinoRef.current = pedido ? "/contas-a-receber/maquininha" : "/";
      /*
       * ⚠️ A OFERTA DO WHATSAPP (30/10/2026, pedido do dono): com a conta de pé
       * existe sessão, e o celular já foi digitado. A confirmação é a MESMA de
       * Segurança da conta: o código vai ao celular — o número digitado aqui
       * não prova que ele é de quem digitou.
       */
      const celularDoCadastro = celularCanonico(c.repTelefone);
      const situacao = celularDoCadastro ? await situacaoNumeroAction().catch(() => null) : null;
      const ofertar = !!situacao && situacao.ligado && situacao.podeCadastrar && !situacao.telefone;
      if (!vivoRef.current) return;
      setDigitando(false);
      setEtapa(ofertar ? "whatsapp" : "pronto");
      if (ofertar && celularDoCadastro) {
        await falar([
          ...(falhaAlcada ? [`Os limites de aprovação não foram gravados (${falhaAlcada}); até alguém ajustar em Aprovações, vale o padrão.`] : []),
          ...(pedido && falhaPedido ? [`Não consegui registrar o pedido da maquininha (${falhaPedido}). Você refaz em um clique na página Maquininha.`] : []),
          pedido && !falhaPedido ? "Pronto! A sua conta está criada e o pedido da maquininha chegou à nossa equipe." : "Pronto! A sua conta está criada.",
          `Antes de entrar: quer continuar falando comigo pelo **WhatsApp**? Você pergunta pelo celular ("quanto tenho a pagar essa semana?") e eu respondo com os números ${c.tipo === "pf" ? "da sua conta" : "da sua empresa"}.`,
          `Eu mando um código para ${celularLegivel(celularDoCadastro)} para confirmar que o número é seu.`,
        ], {
          icone3d: "tick",
          acoes: [
            { rotulo: "Sim, mandar o código", icone: "smartphone", fazer: () => void pedirCodigoWhatsapp(celularDoCadastro) },
            { rotulo: "Agora não", icone: "chevron-right", fazer: () => entrarNoSistema("Agora não") },
          ],
        });
        return;
      }
      await falar([
        ...(falhaAlcada ? [`Os limites de aprovação não foram gravados (${falhaAlcada}); até alguém ajustar em Aprovações, vale o padrão.`] : []),
        ...(pedido && falhaPedido ? [`Não consegui registrar o pedido da maquininha (${falhaPedido}). Você refaz em um clique na página Maquininha.`] : []),
        pedido && !falhaPedido
          ? pedido.tipo === "pedir"
            ? "Pronto! A sua conta está criada e o pedido da maquininha chegou à nossa equipe. Vou te mostrar o acompanhamento."
            : "Pronto! A sua conta está criada e o pedido de vínculo da maquininha chegou à nossa equipe. Vou te mostrar o acompanhamento."
          : "Pronto! A sua conta está criada. Já vou te levar para dentro.",
      ], { icone3d: "tick" });
      router.push(destinoRef.current);
      router.refresh();
    } catch (e) {
      // ⚠️ SEMPRE uma saída: a conta existe, e "Tentar de novo" refaz só o resto
      // (o perfil é upsert e a estrutura deduplica por nome).
      setDigitando(false);
      setEtapa("erro");
      await falar(
        [`Sua conta foi criada, mas não consegui salvar todo o cadastro: ${motivoDaRecusa(e)}.`],
        { alerta: true, acoes: [{ rotulo: "Tentar de novo", icone: "rotate-ccw", fazer: () => void criar(c, senha) }] },
      );
    }
  };

  /* ─── 6. a oferta do WhatsApp (depois da conta criada) ───────────────── */
  const entrarNoSistema = (eco?: string) => {
    if (eco) voce(eco);
    setEtapa("pronto");
    router.push(destinoRef.current);
    router.refresh();
  };

  const pedirCodigoWhatsapp = async (celular: string) => {
    voce("Sim, mandar o código");
    setEtapa("criando");
    setDigitando(true);
    const r = await pedirCodigoNumeroAction(celular).catch(() => ({ ok: false as const, motivo: "Não foi possível enviar agora." }));
    if (!vivoRef.current) return;
    setDigitando(false);
    if (!r.ok) {
      setEtapa("whatsapp");
      await falar([r.motivo, "Você também conecta depois, em Configurações › Segurança da conta."], {
        alerta: true,
        acoes: [
          { rotulo: "Tentar de novo", icone: "rotate-ccw", fazer: () => void pedirCodigoWhatsapp(celular) },
          { rotulo: "Entrar no sistema", icone: "chevron-right", fazer: () => entrarNoSistema("Entrar no sistema") },
        ],
      });
      return;
    }
    setTexto("");
    setEtapa("whatsappCodigo");
    await falar([`${r.mensagem}`, "Digite aqui o código que chegou no WhatsApp."], {
      acoes: [{ rotulo: "Fazer isso depois", icone: "chevron-right", fazer: () => entrarNoSistema("Fazer isso depois") }],
    });
  };

  const responderCodigoWhatsapp = async () => {
    const codigo = texto.replace(/\D/g, "");
    if (!codigo) return;
    voce(codigo);
    setTexto("");
    if (codigo.length !== DIGITOS_CODIGO_WHATSAPP) {
      await falar([`O código tem ${DIGITOS_CODIGO_WHATSAPP} números. Confere pra mim?`], { alerta: true });
      return;
    }
    setDigitando(true);
    const r = await confirmarNumeroAction(codigo).catch(() => ({ ok: false as const, motivo: "Não foi possível conferir agora. Tente de novo." }));
    if (!vivoRef.current) return;
    setDigitando(false);
    if (!r.ok) {
      await falar([r.motivo], {
        alerta: true,
        acoes: [{ rotulo: "Fazer isso depois", icone: "chevron-right", fazer: () => entrarNoSistema("Fazer isso depois") }],
      });
      return;
    }
    setEtapa("pronto");
    await falar(["Celular conectado! Pode me chamar pelo WhatsApp quando quiser. Agora vou te levar para dentro."], { icone3d: "tick" });
    router.push(destinoRef.current);
    router.refresh();
  };

  /**
   * A SENHA DE ACESSO, digitada duas vezes. ⚠️ O mínimo é o `MIN_SENHA` da
   * recuperação de senha (a mesma regra do login), sem número fixo de dígitos.
   */
  const responderSenha = async () => {
    const senha = texto;
    if (!senha) return;
    voce("•".repeat(Math.min(senha.length, 12)));
    setTexto("");
    if (senhaFase === "criar") {
      if (!(senha.length >= MIN_SENHA)) {
        await falar([`Essa ficou curta: a senha precisa de pelo menos ${MIN_SENHA} caracteres. Tenta outra?`], { alerta: true });
        return;
      }
      senhaRef.current = senha;
      setSenhaFase("confirmar");
      await falar(["Agora digite a senha de novo, para confirmar."]);
      return;
    }
    if (senha !== senhaRef.current) {
      senhaRef.current = null;
      setSenhaFase("criar");
      setVerSenha(false);
      await falar(["As duas senhas não são iguais. Vamos de novo: crie a sua senha de acesso."], { alerta: true });
      return;
    }
    setVerSenha(false);
    aceitar("senha");
    const novo: Cadastro = { ...cad, senhaAcesso: "definida" };
    // Trocar a senha depois (o "Alterar" ou o erro do cadastro) não refaz o resto da conversa.
    const ms = marcos.some((m) => m.id === "senha") ? marcos : [...marcos, { id: "senha", antes: cad }];
    setMarcos(ms);
    setCad(novo);
    await perguntar(novo, ms, ["Senha criada."]);
  };

  /** Pede a senha de novo, sem apagar o resto da conversa. */
  async function pedirSenhaDeNovo(prefixo: string[] = []) {
    senhaRef.current = null;
    setSenhaFase("criar");
    setTexto("");
    setAtual(null);
    setEtapa("senha");
    await falar([...prefixo, `Crie a senha de acesso, com pelo menos ${MIN_SENHA} caracteres.`], { pergunta: "senha" }, prefixo.length);
  }

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
    if (id === "senha") { void pedirSenhaDeNovo(["Vamos trocar a senha."]); return; }
    const k = marcos.findIndex((m) => m.id === id);
    if (k < 0) return;
    const marco = marcos[k];
    cortarEm((f) => (id === "tipo" ? f.cartao?.tipo === "conta" : f.pergunta === id));
    setMarcos(marcos.slice(0, k));
    setCad(marco.antes);
    if (id === "tipo") { setAtual(null); setEtapa("tipo"); setTexto(""); return; }
    if (id === "documento") {
      setAtual(null); setReceita(null); setEtapa("documento");
      setTexto(cad.tipo === "pj" ? cad.cnpj : cad.cpf);
      return;
    }
    if (id === "termos" || id === "facial" || id === "docIdentidade" || id === "docEmpresa") {
      setAtual(null);
      setAceite(!!marco.antes.aceiteTermos);
      setEtapa(id);
      return;
    }
    const p = perguntasDoCadastro(marco.antes).find((x) => x.id === id) ?? null;
    setAtual(p);
    setMarcadas(p?.tipo === "multi" ? lerLista(p, cad) : p?.inicial ? p.inicial(marco.antes) : []);
    setOutroAberto(false); setOutroTexto("");
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
    if (etapa === "whatsappCodigo") { await responderCodigoWhatsapp(); return; }
    if (etapa === "pergunta") await enviarTexto();
  };

  /** O "voltar" do cabeçalho reabre a última resposta (o mesmo "Alterar" do balão). */
  const ultimoMarco = marcos[marcos.length - 1];
  const podeVoltar = !!ultimoMarco && !ocupadoFala && !["criando", "pronto", "confirme", "buscando", "whatsapp", "whatsappCodigo"].includes(etapa);
  const voltar = () => { if (podeVoltar) alterar(ultimoMarco.id); };

  const ocupado = etapa === "criando" || etapa === "pronto" || etapa === "confirme" || etapa === "buscando";
  const ultimaIA = [...falas].reverse().find((f) => f.de === "ia");
  const opcoesBase = etapa === "pergunta" && atual && (atual.tipo === "escolha" || atual.tipo === "multi") ? (atual.opcoes?.(cad) ?? []) : [];
  // O banco digitado em "Meu banco não está na lista" entra na lista, já marcado.
  const opcoes = atual?.outro ? [...opcoesBase, ...marcadas.filter((m) => !opcoesBase.includes(m))] : opcoesBase;
  const adicionarOutro = () => {
    const nome = outroTexto.trim().replace(/\s+/g, " ");
    if (nome.length < 2) return;
    const existente = opcoes.find((o) => o.toLowerCase() === nome.toLowerCase());
    const valor = existente ?? nome;
    setMarcadas((ms) => (ms.includes(valor) ? ms : [...ms, valor]));
    setOutroTexto("");
    setOutroAberto(false);
  };
  const destaque = atual?.destaque?.(cad) ?? null;
  // tipo + documento + passos da abertura (com a senha) + perguntas
  const total = cad.tipo ? 2 + passosEspeciais(cad) + perguntasDoCadastro(cad).length : 0;
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
                {f.icone3d && <Icone3d nome={f.icone3d} tamanho={56} />}
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
                      onTipo={(t) => void escolherTipo(t)}
                      onAceite={() => setAceite((a) => !a)}
                      onFacial={() => setFacialAberto(true)}
                      onDocumento={(t) => setDocAberto(t)}
                      onDocEmpresa={enviarDocEmpresa}
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
                        <button key={a.rotulo} type="button" onClick={a.fazer}
                          // A oferta do WhatsApp: só os botões da ÚLTIMA fala valem.
                          disabled={etapa === "erro" ? false : !((etapa === "whatsapp" || etapa === "whatsappCodigo") && f.id === ultimaIA?.id && !ocupadoFala)}
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
                      {atual.logos ? <BancoLogo banco={o} marca size={22} /> : marcada && <Icon name="check" size={16} color="currentColor" />}
                      {o}
                      {atual.logos && marcada && <Icon name="check" size={16} color="currentColor" />}
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
              {atual.outro && (outroAberto ? (
                <div className="flex flex-wrap items-center gap-2" data-outro-banco>
                  <input
                    autoFocus
                    value={outroTexto}
                    onChange={(e) => setOutroTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarOutro(); } }}
                    placeholder="Nome do banco"
                    aria-label="Nome do banco que não está na lista"
                    maxLength={60}
                    className="h-11 px-5 rounded-pill text-[16px] md:text-[15px] text-ink outline-none a4p-pilula min-w-0 w-[220px]"
                  />
                  <button type="button" disabled={outroTexto.trim().length < 2} onClick={adicionarOutro}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50">
                    Adicionar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setOutroAberto(true)}
                  className="self-start inline-flex items-center gap-2 h-11 px-5 rounded-pill text-[15px] a4p-pilula">
                  <Icon name="plus" size={16} />
                  Meu banco não está na lista
                </button>
              ))}
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

      {!ocupadoFala && ["confirmar", "termos", "docEmpresa"].includes(etapa) && (
        <div className="a4p-entra flex-none mx-auto mb-4 w-[calc(100%-40px)] max-w-[480px] flex flex-col items-stretch gap-2" data-rodape={etapa}>
          {etapa === "confirmar" && (
            <>
              <button type="button" onClick={() => void confirmarDocumento()} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Confirmar</button>
              <button type="button" onClick={() => void outroDocumento()} className="h-12 rounded-pill text-[15px] text-ink">
                Usar outro {cad.tipo === "pj" ? "CNPJ" : "CPF"}
              </button>
            </>
          )}
          {etapa === "termos" && (
            <button type="button" disabled={!aceite} onClick={aceitarTermos} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Continuar</button>
          )}
          {etapa === "docEmpresa" && (
            <button type="button" onClick={docEmpresaDepois} className="h-14 rounded-pill text-[15px] font-medium text-ink a4p-pilula">
              Enviar depois
            </button>
          )}
        </div>
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
      {campo && (
        <form
          onSubmit={responder}
          data-ocupado={ocupadoFala ? "" : undefined}
          className="flex-none mx-auto mb-2 w-[calc(100%-40px)] max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
          style={{ background: "var(--a4p-pilula-fundo)" }}
        >
          {/* O gerenciador de senhas guarda a senha junto do e-mail certo. */}
          {etapa === "senha" && <input type="email" name="email" autoComplete="username" value={cad.email} readOnly hidden />}
          {etapa === "pergunta" && atual?.tipo === "telefone" && (
            <span aria-hidden className="pl-3 text-[16px] md:text-[15px] text-muted tabular-nums">+55</span>
          )}
          <input
            ref={campoRef}
            // ⚠️ O campo só renasce quando o TECLADO muda (tipo ou modo): renascer a
            // cada pergunta tirava o foco e, no celular, o teclado fechava depois de
            // cada envio — e o iOS não o reabre por foco programático.
            key={`${campo.tipo}:${campo.modo ?? ""}`}
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
            enterKeyHint="send"
            onFocus={rolarAoFim}
            // Sem `disabled` enquanto a IA fala: desabilitar fecha o teclado do
            // celular. Quem segura o envio é o botão e o `responder`.
            // 16px no celular: abaixo disso o iOS dá zoom sozinho ao focar.
            className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[16px] md:text-[15px] text-ink placeholder:text-muted tabular-nums"
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
  const chave = p.id === "sobre" || p.id === "sobrePf" ? "descricao" : p.id === "emailPf" ? "email" : p.id;
  const v = (c as unknown as Record<string, unknown>)[chave];
  if (typeof v === "number") return String(v).replace(".", ",");
  return typeof v === "string" ? v : "";
}
function lerLista(p: Pergunta, c: Cadastro): string[] {
  const chave = p.id;
  const v = (c as unknown as Record<string, unknown>)[chave];
  return Array.isArray(v) && v.length ? (v as string[]) : (p.inicial ? p.inicial(c) : []);
}

/* ─── as falas, os botões e o cartão da Receita ──────────────────────────── */
const FALAS_DO_PASSO: Record<Exclude<PassoEspecial, "senha">, (c: Cadastro) => string[]> = {
  termos: () => ["Antes de abrir sua conta, confirme que você aceita os **Termos** **de** **Uso**."],
  facial: () => ["Para sua segurança, vamos validar sua identidade com **reconhecimento** **facial**."],
  docIdentidade: () => ["Estamos validando sua identidade...", "Para sua segurança, vamos validar sua **documentação**."],
  docEmpresa: (c) => [c.tipo === "pj"
    ? "Se tiver à mão, envie o **contrato** **social** ou um **comprovante** **de** **endereço** da empresa. É opcional."
    : "Se tiver à mão, envie um **comprovante** **de** **endereço**. É opcional."],
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
const RECOLHIDO: Record<string, (c: Cadastro) => { ilustracao: Icone3D; rotulo: string }> = {
  conta: () => ({ ilustracao: "boy", rotulo: "Tipo de conta" }),
  termos: () => ({ ilustracao: "copy", rotulo: "Termos de uso aceitos" }),
  facial: (c) => ({ ilustracao: "camera", rotulo: c.biometria === "capturada" ? "Autenticado" : "Validação de identidade pendente" }),
  docIdentidade: (c) => ({
    ilustracao: "locker",
    rotulo: c.documento === "conferido" ? "Documento validado" : c.documento === "enviado" ? "Documento enviado para conferência"
      : c.documento === "pendente" ? "Validação de documento pendente" : "Validando documento",
  }),
  docEmpresa: (c) => ({
    ilustracao: "folder-fav",
    rotulo: c.docEmpresa === "contrato" ? "Contrato social enviado" : c.docEmpresa === "comprovante" ? "Comprovante de endereço enviado" : "Documento da empresa: enviar depois",
  }),
};

function Ladrilho({ ilustracao }: { ilustracao: Icone3D }) {
  return <Icone3d nome={ilustracao} tamanho={64} />;
}
function CartaoDaConversa({
  cartao, ativo, cad, aceite, onTipo, onAceite, onFacial, onDocumento, onDocEmpresa,
}: {
  cartao: Cartao;
  ativo: boolean;
  cad: Cadastro;
  aceite: boolean;
  onTipo: (t: "pf" | "pj") => void;
  onAceite: () => void;
  onFacial: () => void;
  onDocumento: (t: "rg" | "cnh") => void;
  onDocEmpresa: (t: "contrato" | "comprovante", arquivo: File) => void;
}) {
  const caixa = "w-full max-w-[420px] rounded-card p-5 flex flex-col gap-4";
  const fundo = { background: "var(--color-white)" };
  const titulo = "m-0 text-[24px] leading-[1.15] font-medium text-ink";

  // Respondido, o cartão vira uma pílula com o que foi decidido (como nos prints).
  if (!ativo && cartao.tipo in RECOLHIDO && (cartao.tipo !== "conta" || !!cad.tipo)) {
    const r = RECOLHIDO[cartao.tipo](cad);
    return (
      <div data-cartao={cartao.tipo} data-recolhido className="inline-flex items-center gap-3 h-11 pl-2 pr-5 rounded-pill" style={fundo}>
        <Icone3d nome={r.ilustracao} tamanho={28} />
        <span className="text-[14px] text-muted">{r.rotulo}</span>
      </div>
    );
  }

  if (cartao.tipo === "conta") {
    return (
      <div data-cartao="conta" className={caixa} style={fundo}>
        <Ladrilho ilustracao="boy" />
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
        <Ladrilho ilustracao={cartao.rotulo === "CNPJ" ? "folder" : "boy"} />
        {cartao.linhas?.length ? (
          <dl data-sem-num className="m-0 flex flex-col gap-3">
            {/* ⚠️ UM padrão só: rótulo em cinza, valor em tinta, os dois em Inter —
                número e texto lado a lado no mesmo papel (data-sem-num). */}
            {cartao.linhas.map((l) => (
              <div key={l.rotulo} className="flex flex-col gap-0.5">
                <dt className="text-[13px] text-muted">{l.rotulo}</dt>
                <dd className="m-0 text-[15px] font-medium text-ink break-words">{l.valor}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div data-sem-num className="min-w-0 flex flex-col gap-0.5">
            <span className="text-[13px] text-muted">{cartao.rotulo} {cartao.documento}</span>
            <span className="text-[16px] font-medium text-ink break-words">{cartao.nome}</span>
            {cartao.detalhe && <span className="text-[13px] text-muted">{cartao.detalhe}</span>}
          </div>
        )}
      </div>
    );
  }

  if (cartao.tipo === "termos") {
    return (
      <div data-cartao="termos" className={caixa} style={fundo}>
        <Ladrilho ilustracao="copy" />
        <p className={titulo}>Termos e Condições de Uso</p>
        <label className="flex items-center gap-2.5 text-[14px] text-ink cursor-pointer">
          <input type="checkbox" checked={aceite} onChange={onAceite} disabled={!ativo} className="sr-only peer" />
          <span aria-hidden className="w-5 h-5 flex-none rounded-[6px] flex items-center justify-center bg-surface-3 peer-focus-visible:ring-2 peer-focus-visible:ring-ink"
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

  if (cartao.tipo === "facial") {
    return (
      <div data-cartao="facial" className={caixa} style={fundo}>
        <Ladrilho ilustracao="camera" />
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
        <Ladrilho ilustracao="locker" />
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

  if (cartao.tipo === "docEmpresa") return <CartaoDocEmpresa ativo={ativo} pj={cad.tipo === "pj"} onEnviar={onDocEmpresa} />;
  return null;
}

/**
 * O CONTRATO SOCIAL OU O COMPROVANTE DE ENDEREÇO: foto ou PDF de até 10 MB,
 * conferidos ANTES de seguir. O arquivo vai ao cofre depois da conta (ver `enviarDocEmpresa`).
 */
const TETO_DOC_EMPRESA = 10 * 1024 * 1024;
function CartaoDocEmpresa({ ativo, pj, onEnviar }: { ativo: boolean; pj: boolean; onEnviar: (t: "contrato" | "comprovante", arquivo: File) => void }) {
  const contratoRef = React.useRef<HTMLInputElement>(null);
  const comprovanteRef = React.useRef<HTMLInputElement>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const escolher = (t: "contrato" | "comprovante") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = e.target.files?.[0];
    e.target.value = "";
    if (!a) return;
    if (a.size > TETO_DOC_EMPRESA) { setErro("Esse arquivo passa de 10 MB. Envie uma foto ou um PDF menor."); return; }
    if (!/^image\//.test(a.type) && a.type !== "application/pdf") { setErro("Envie uma foto ou um PDF."); return; }
    setErro(null);
    onEnviar(t, a);
  };
  const botao = "inline-flex items-center justify-center gap-2 h-12 rounded-pill text-[15px] font-medium disabled:opacity-50";
  return (
    <div data-cartao="docEmpresa" className="w-full max-w-[420px] rounded-card p-5 flex flex-col gap-4" style={{ background: "var(--color-white)" }}>
      <Ladrilho ilustracao="folder-fav" />
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[24px] leading-[1.15] font-medium text-ink">{pj ? "Documento da empresa" : "Comprovante de endereço"}</p>
        <p className="m-0 text-[14px] leading-[1.45] text-muted">Foto ou PDF de até 10 MB. Opcional: dá para enviar depois.</p>
      </div>
      <div className="flex flex-col gap-2">
        {pj && (
          <button type="button" disabled={!ativo} onClick={() => contratoRef.current?.click()} className={botao} style={ESTILO_PRIMARIO}>
            <Icon name="upload" size={16} color="currentColor" />
            Enviar contrato social
          </button>
        )}
        <button type="button" disabled={!ativo} onClick={() => comprovanteRef.current?.click()} className={botao} style={ESTILO_PRIMARIO}>
          <Icon name="upload" size={16} color="currentColor" />
          Enviar comprovante de endereço
        </button>
      </div>
      {erro && <p role="alert" className="m-0 text-[14px] text-ink">{erro}</p>}
      <input ref={contratoRef} type="file" accept="image/*,application/pdf" hidden aria-label="Contrato social" onChange={escolher("contrato")} />
      <input ref={comprovanteRef} type="file" accept="image/*,application/pdf" hidden aria-label="Comprovante de endereço" onChange={escolher("comprovante")} />
    </div>
  );
}

/**
 * RECONHECIMENTO FACIAL — as dicas em carrossel e a câmera frontal.
 *
 * ⚠️ **A verificação biométrica ainda não existe** (não há provedor
 * contratado). A tela pede a câmera de verdade e tira a foto, que vai ao cofre
 * depois de a conta nascer, para conferência pela plataforma. Sem
 * câmera, a validação fica `pendente` — ninguém é impedido de abrir a conta
 * por estar num computador sem câmera.
 */
function ReconhecimentoFacial({ onFechar, onConcluir }: { onFechar: () => void; onConcluir: (s: "capturada" | "pendente", foto?: Blob) => void }) {
  const [modo, setModo] = React.useState<"dicas" | "camera" | "erro">("dicas");
  const [dica, setDica] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const fluxoRef = React.useRef<MediaStream | null>(null);
  // A câmera nativa do celular (input com `capture="user"`): o caminho quando o
  // navegador não entrega a câmera ao vivo — navegador embutido do Instagram e
  // do WhatsApp, permissão negada, aparelho antigo.
  const nativaRef = React.useRef<HTMLInputElement>(null);

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

  // ⚠️ O vídeo só existe DEPOIS de o modo virar "camera". Ligar o fluxo num
  // requestAnimationFrame logo após o setState corria contra a renderização: no
  // celular o quadro chegava antes do <video>, o fluxo não era ligado a nada e a
  // câmera "não abria" (oval vazio, luz da câmera acesa).
  React.useEffect(() => {
    const v = videoRef.current;
    if (modo !== "camera" || !v || !fluxoRef.current) return;
    v.srcObject = fluxoRef.current;
    void v.play().catch(() => {});
  }, [modo]);

  const abrirCamera = async () => {
    // Sem câmera ao vivo no navegador: a câmera nativa, ainda no mesmo toque
    // (abrir o seletor de arquivo exige o gesto da pessoa, antes de qualquer await).
    if (!navigator.mediaDevices?.getUserMedia) { nativaRef.current?.click(); return; }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false });
      fluxoRef.current = fluxo;
      setModo("camera");
    } catch {
      setModo("erro");
    }
  };
  const fotoNativa = (e: React.ChangeEvent<HTMLInputElement>) => {
    const foto = e.target.files?.[0];
    e.target.value = "";
    if (foto) { parar(); onConcluir("capturada", foto); }
  };
  // O quadro do vídeo vira JPEG antes de a câmera desligar.
  const capturar = () => {
    const v = videoRef.current;
    const tela = document.createElement("canvas");
    const fim = (foto?: Blob) => { parar(); onConcluir("capturada", foto ?? undefined); };
    if (!v || !v.videoWidth) { fim(); return; }
    tela.width = v.videoWidth; tela.height = v.videoHeight;
    const ctx = tela.getContext("2d");
    if (!ctx) { fim(); return; }
    ctx.drawImage(v, 0, 0);
    tela.toBlob((b) => fim(b ?? undefined), "image/jpeg", 0.9);
  };
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
              <Icone3d nome={d.ilustracao} tamanho={120} />
              <span className="absolute top-3 right-3 w-11 h-11 rounded-pill flex items-center justify-center bg-lime text-on-lime">
                <Icon name={d.ilustracao === "picture" ? "x" : "check"} size={20} color="currentColor" />
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
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
            </div>
            <p className="m-0 text-[17px] text-ink">Centralize o rosto no contorno</p>
          </>
        )}
        {modo === "erro" && (
          <>
            <span aria-hidden className="w-[120px] h-[120px] rounded-pill flex items-center justify-center text-ink" style={{ background: "var(--color-white)" }}>
              <Icone3d nome="camera" tamanho={72} />
            </span>
            <div className="flex flex-col gap-2 max-w-[340px]">
              <p className="m-0 text-[22px] font-medium text-ink">Não consegui abrir a câmera</p>
              <p className="m-0 text-[15px] text-muted">Tire a foto pela câmera do celular, ou libere o acesso à câmera no navegador e tente de novo.</p>
            </div>
          </>
        )}
      </div>
      <div className="flex-none mx-auto w-[calc(100%-40px)] max-w-[480px] mb-6 flex flex-col gap-2">
        {modo === "dicas" && <button type="button" onClick={() => void abrirCamera()} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Tirar foto</button>}
        {modo === "camera" && <button type="button" onClick={capturar} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Capturar</button>}
        {modo === "erro" && (
          <>
            <button type="button" onClick={() => nativaRef.current?.click()} className={BOTAO_PRIMARIO} style={ESTILO_PRIMARIO}>Abrir a câmera do celular</button>
            <button type="button" onClick={() => void abrirCamera()} className="h-12 rounded-pill text-[15px] font-medium text-ink a4p-pilula">Tentar de novo</button>
            <button type="button" onClick={() => { parar(); onConcluir("pendente"); }} className="h-12 rounded-pill text-[15px] text-ink">Validar depois</button>
          </>
        )}
        <input ref={nativaRef} type="file" accept="image/*" capture="user" hidden aria-label="Foto do rosto" onChange={fotoNativa} />
      </div>
    </div>
  );
}

/**
 * VALIDAÇÃO DO DOCUMENTO — as dicas em carrossel e as duas portas: "Tirar
 * foto" (câmera traseira no celular, `capture="environment"`) e "Anexar
 * arquivo" (foto ou PDF já guardados). No computador as duas abrem o seletor
 * de arquivos. Quem a lê é o OCR do navegador; o arquivo vai ao cofre depois da conta.
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
          <Icone3d nome={d.ilustracao} tamanho={120} />
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
