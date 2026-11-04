/**
 * A EMPRESA NA FOCUS — o corpo de `POST /v2/empresas` (03/11/2026).
 *
 * Para o cliente do ERP emitir a própria nota, a empresa dele precisa existir
 * na conta da Quattro na Focus, com o certificado A1. Até aqui isso era feito à
 * mão no painel da Focus; este módulo monta o pedido da API de empresas.
 *
 * ⚠️ `habilita_nfse` (prefeitura) e `habilita_nfsen_producao` (emissor
 * nacional) são EXCLUSIVOS na Focus, e ligar o nacional faz a nota da
 * prefeitura ir para o ambiente nacional — em São Paulo, para o Lucro
 * Presumido, isso é a recusa E0312 em todo código. Os dois saem SEMPRE juntos
 * e opostos, do padrão do emitente, nunca de dois campos soltos.
 *
 * ⚠️ O certificado e a senha só atravessam: vão à Focus e não são gravados
 * nem registrados em log. Puro, sem rede.
 */

export interface DadosEmpresaFocus {
  nome: string;
  nomeFantasia?: string;
  cnpj: string;
  inscricaoMunicipal: string;
  /** 1 Simples Nacional · 2 Simples, excesso de sublimite · 3 Regime Normal · 4 MEI (códigos da Focus). */
  regimeTributario: string;
  email: string;
  telefone?: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  /** "nacional" liga o emissor nacional e DESLIGA o da prefeitura; o resto, o contrário. */
  padrao: "municipal" | "nacional";
  certificadoBase64: string;
  senhaCertificado: string;
}

export const REGIMES_FOCUS: readonly { value: string; label: string }[] = [
  { value: "1", label: "Simples Nacional" },
  { value: "2", label: "Simples Nacional, excesso de sublimite" },
  { value: "3", label: "Regime Normal (Lucro Presumido ou Real)" },
  { value: "4", label: "MEI" },
];

const dig = (s: string | undefined) => (s ?? "").replace(/\D/g, "");
const txt = (s: string | undefined) => (s ?? "").trim();

export function montarEmpresaFocus(d: DadosEmpresaFocus):
  | { ok: true; corpo: Record<string, unknown> }
  | { ok: false; problemas: string[] } {
  const problemas: string[] = [];
  const cnpj = dig(d.cnpj);
  const im = dig(d.inscricaoMunicipal);
  const cep = dig(d.cep);
  const uf = txt(d.uf).toUpperCase();
  if (cnpj.length !== 14) problemas.push("CNPJ: 14 dígitos.");
  if (!txt(d.nome)) problemas.push("Razão social: obrigatória.");
  if (!im) problemas.push("Inscrição municipal: obrigatória.");
  if (!REGIMES_FOCUS.some((r) => r.value === d.regimeTributario)) problemas.push("Regime tributário: escolha um.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(d.email))) problemas.push("E-mail: inválido.");
  for (const [rotulo, v] of [["Logradouro", d.logradouro], ["Número", d.numero], ["Bairro", d.bairro], ["Cidade", d.municipio]] as const) {
    if (!txt(v)) problemas.push(`${rotulo}: obrigatório.`);
  }
  if (txt(d.numero).length > 60) problemas.push("Número: até 60 letras.");
  if (!/^[A-Z]{2}$/.test(uf)) problemas.push("UF: duas letras.");
  if (cep.length !== 8) problemas.push("CEP: 8 dígitos.");
  if (!/^[A-Za-z0-9+/]+=*$/.test(txt(d.certificadoBase64)) || txt(d.certificadoBase64).length < 100) problemas.push("Certificado A1: envie o arquivo .pfx ou .p12.");
  if (!d.senhaCertificado) problemas.push("Senha do certificado: obrigatória.");
  if (problemas.length) return { ok: false, problemas };

  const nacional = d.padrao === "nacional";
  return {
    ok: true,
    corpo: {
      nome: txt(d.nome),
      ...(txt(d.nomeFantasia) ? { nome_fantasia: txt(d.nomeFantasia) } : {}),
      cnpj,
      // A Focus documenta inscrição municipal e CEP como números.
      inscricao_municipal: Number(im),
      regime_tributario: Number(d.regimeTributario),
      email: txt(d.email),
      ...(dig(d.telefone) ? { telefone: dig(d.telefone) } : {}),
      logradouro: txt(d.logradouro),
      numero: txt(d.numero),
      ...(txt(d.complemento) ? { complemento: txt(d.complemento) } : {}),
      bairro: txt(d.bairro),
      municipio: txt(d.municipio),
      uf,
      cep: Number(cep),
      habilita_nfse: !nacional,
      habilita_nfsen_producao: nacional,
      habilita_nfsen_homologacao: nacional,
      arquivo_certificado_base64: txt(d.certificadoBase64),
      senha_certificado: d.senhaCertificado,
    },
  };
}

/** A resposta da Focus para a tela, sem eco do certificado nem da senha. */
export function lerRespostaEmpresa(http: number, corpo: unknown): { ok: boolean; mensagem: string } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const msg = typeof c.mensagem === "string" ? c.mensagem : typeof c.codigo === "string" ? c.codigo : "";
  const erros = Array.isArray(c.erros) ? c.erros.map((e) => (e && typeof e === "object" && typeof (e as Record<string, unknown>).mensagem === "string" ? String((e as Record<string, unknown>).mensagem) : "")).filter(Boolean) : [];
  if (http >= 200 && http < 300) return { ok: true, mensagem: "Empresa cadastrada na Focus." };
  if (http === 0) return { ok: false, mensagem: "A Focus não respondeu. Confira no painel antes de tentar de novo." };
  return { ok: false, mensagem: [msg, ...erros].filter(Boolean).join(" · ") || `A Focus recusou (HTTP ${http}).` };
}
