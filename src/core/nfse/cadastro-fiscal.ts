/**
 * O CADASTRO FISCAL DO EMITENTE, pela tela (03/11/2026).
 *
 * Até aqui a configuração de cada empresa que emite NFS-e pela Focus
 * (`nfse_emitentes.config`) só mudava por SQL. Este módulo traduz o
 * formulário da área da plataforma no MESMO objeto que o envio lê, e o confere
 * pela MESMA `lerEmitentes`: não existe uma segunda regra de forma.
 *
 * ⚠️ Campo preenchido que `lerEmitentes` descartaria é RECUSA, nunca gravação
 * silenciosa: um código com dígito a menos que a tela aceitasse sumiria do
 * pedido e a nota sairia sem ele, sem ninguém saber por quê.
 *
 * ⚠️ Só a PLATAFORMA grava (ver a rota `/api/admin/nfse-emitentes`): o CNPJ, a
 * inscrição e o município são do vínculo, e a nota sai com a credencial da
 * Quattro. Puro, sem rede.
 */
import { lerEmitentes, type EmitenteFocus } from "@/core/nfse/focus";

export type TipoCampoFiscal = "digitos" | "texto" | "percentual" | "sim-nao" | "opcoes";

export interface CampoFiscal {
  chave: keyof EmitenteFocus & string;
  rotulo: string;
  ajuda: string;
  tipo: TipoCampoFiscal;
  obrigatorio?: boolean;
  opcoes?: { value: string; label: string }[];
  grupo: "Empresa" | "Serviço" | "Reforma tributária" | "Avançado";
}

export const CAMPOS_FISCAIS: readonly CampoFiscal[] = [
  { chave: "cnpj", rotulo: "CNPJ", ajuda: "Do prestador, 14 dígitos.", tipo: "digitos", obrigatorio: true, grupo: "Empresa" },
  { chave: "inscricaoMunicipal", rotulo: "Inscrição municipal", ajuda: "O CCM em São Paulo.", tipo: "digitos", obrigatorio: true, grupo: "Empresa" },
  { chave: "codigoMunicipio", rotulo: "Código IBGE da cidade", ajuda: "7 dígitos. São Paulo é 3550308.", tipo: "digitos", obrigatorio: true, grupo: "Empresa" },
  { chave: "optanteSimples", rotulo: "Optante do Simples Nacional", ajuda: "Sim para ME/EPP do Simples.", tipo: "sim-nao", grupo: "Empresa" },
  { chave: "padrao", rotulo: "Padrão da nota", ajuda: "Nacional: o emissor nacional, obrigatório para o Simples desde 01/11/2026.", tipo: "opcoes",
    opcoes: [{ value: "", label: "Da prefeitura" }, { value: "nacional", label: "Nacional" }], grupo: "Empresa" },
  { chave: "regimeEspecial", rotulo: "Regime especial", ajuda: "De 1 a 6, só quando há regime especial.", tipo: "digitos", grupo: "Empresa" },
  { chave: "itemListaServico", rotulo: "Código do serviço", ajuda: "O que a prefeitura pede. Em SP, no leiaute de 2026, 6 dígitos (item, subitem e desdobro).", tipo: "digitos", grupo: "Serviço" },
  { chave: "codigoTributacaoMunicipalIss", rotulo: "Código municipal do serviço", ajuda: "O código de tributação da prefeitura, quando ela pede.", tipo: "digitos", grupo: "Serviço" },
  { chave: "codigoTributacaoNacional", rotulo: "Código de tributação nacional", ajuda: "6 dígitos. Obrigatório no padrão nacional.", tipo: "digitos", grupo: "Serviço" },
  { chave: "aliquota", rotulo: "Alíquota do ISS (%)", ajuda: "De 0 a 5. Ex.: 2 para 2%.", tipo: "percentual", grupo: "Serviço" },
  { chave: "codigoCnae", rotulo: "CNAE", ajuda: "Só se a prefeitura pedir.", tipo: "digitos", grupo: "Serviço" },
  { chave: "grupoIbsCbs", rotulo: "Enviar o grupo do IBS/CBS", ajuda: "Em 2026 é opcional em SP. Não: a nota sai só com o ISS.", tipo: "sim-nao", grupo: "Reforma tributária" },
  { chave: "codigoNbs", rotulo: "NBS", ajuda: "9 dígitos.", tipo: "digitos", grupo: "Reforma tributária" },
  { chave: "codigoIndicadorOperacao", rotulo: "Indicador de operação", ajuda: "6 dígitos.", tipo: "digitos", grupo: "Reforma tributária" },
  { chave: "classificacaoTributariaIbsCbs", rotulo: "Classificação tributária do IBS/CBS", ajuda: "6 dígitos.", tipo: "digitos", grupo: "Reforma tributária" },
  { chave: "situacaoTributariaIbsCbs", rotulo: "CST do IBS/CBS", ajuda: "3 dígitos. Vazio: sai da classificação.", tipo: "digitos", grupo: "Reforma tributária" },
  { chave: "codigoTributarioMunicipio", rotulo: "Código tributário do município", ajuda: "3 dígitos no leiaute novo.", tipo: "texto", grupo: "Avançado" },
  { chave: "serieDps", rotulo: "Série da DPS", ajuda: "De 1 a 49999. Vazio: 1.", tipo: "digitos", grupo: "Avançado" },
  { chave: "percentualTributosSimples", rotulo: "Tributos do Simples (%)", ajuda: "A alíquota efetiva do DAS, do contador.", tipo: "percentual", grupo: "Avançado" },
];

/** O valor gravado para o formulário: tudo vira texto, "sim"/"nao" para os booleanos. */
export function formularioDaConfig(config: Record<string, unknown> | null | undefined): Record<string, string> {
  const f: Record<string, string> = {};
  for (const c of CAMPOS_FISCAIS) {
    const v = config?.[c.chave];
    if (c.chave === "grupoIbsCbs") f[c.chave] = v === false ? "nao" : "sim";
    else if (c.tipo === "sim-nao") f[c.chave] = v === true ? "sim" : "nao";
    else f[c.chave] = v === undefined || v === null ? "" : String(v);
  }
  return f;
}

const comparavel = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : String(v));

/**
 * O formulário → o `config` que vai ao banco, conferido por `lerEmitentes`.
 * Recusa quando falta o obrigatório ou quando um campo preenchido seria
 * descartado (fora de forma).
 */
export function configDoFormulario(valores: Record<string, string>):
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; problemas: string[] } {
  const config: Record<string, unknown> = {};
  const problemas: string[] = [];
  for (const c of CAMPOS_FISCAIS) {
    const bruto = (valores[c.chave] ?? "").trim();
    if (c.chave === "grupoIbsCbs") { if (bruto === "nao") config.grupoIbsCbs = false; continue; }
    if (c.tipo === "sim-nao") { config[c.chave] = bruto === "sim"; continue; }
    if (!bruto) { if (c.obrigatorio) problemas.push(`${c.rotulo}: obrigatório.`); continue; }
    if (c.tipo === "percentual") {
      const n = Number(bruto.replace(",", "."));
      if (!Number.isFinite(n)) { problemas.push(`${c.rotulo}: não é um número.`); continue; }
      config[c.chave] = n;
    } else if (c.tipo === "digitos") {
      if (!/^[\d.\-/ ]+$/.test(bruto)) { problemas.push(`${c.rotulo}: só números.`); continue; }
      config[c.chave] = bruto.replace(/\D/g, "");
    } else {
      config[c.chave] = bruto;
    }
  }
  if (problemas.length) return { ok: false, problemas };

  const { emitentes, problemas: daLeitura } = lerEmitentes(JSON.stringify({ x: config }));
  const lido = emitentes.x;
  if (!lido) return { ok: false, problemas: daLeitura.length ? daLeitura.map((p) => p.replace("emitente da organização x: ", "")) : ["Cadastro incompleto."] };
  for (const p of daLeitura) problemas.push(p.replace("emitente da organização x: ", ""));
  // ⚠️ Todo campo preenchido tem de SOBREVIVER à leitura: o que ela descarta não iria à prefeitura.
  for (const c of CAMPOS_FISCAIS) {
    if (!(c.chave in config) || c.tipo === "sim-nao") continue;
    const ficou = (lido as unknown as Record<string, unknown>)[c.chave];
    if (ficou === undefined || comparavel(ficou) !== comparavel(config[c.chave])) problemas.push(`${c.rotulo}: fora do formato (${c.ajuda})`);
  }
  if (problemas.length) return { ok: false, problemas };
  return { ok: true, config };
}
