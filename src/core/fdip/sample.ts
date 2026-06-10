/**
 * Amostra de extrato (12 meses) — CSV pt-BR determinístico para demonstrar
 * o onboarding: clientes recorrentes, fornecedores, assinaturas, folha,
 * aluguel, energia, impostos, combustível.
 */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const brl = (v: number) => v.toFixed(2).replace(".", ",");

const CLIENTES = ["NORTHWIND LOGISTICA LTDA", "ATLAS CLOUD LTDA", "MERIDIAN DESIGN ME", "AURORA VAREJO SA", "COSTA & FILHOS"];
const FORN = ["FORNECEDOR TEXTIL SA", "DISTRIBUIDORA SUL LTDA", "POSTO SHELL CENTRO", "PAPELARIA UNIAO"];
const ASSIN = [["AWS AMAZON WEB SERVICES", 1840], ["ADOBE CREATIVE CLOUD", 320], ["OPENAI CHATGPT", 560], ["GOOGLE WORKSPACE", 410], ["MICROSOFT OFFICE365", 290]];

export function amostraExtrato(): string {
  const r = rng(424242);
  const linhas: string[] = ["data;descricao;valor"];
  const hoje = new Date();
  for (let mAtras = 11; mAtras >= 0; mAtras--) {
    const base = new Date(hoje.getFullYear(), hoje.getMonth() - mAtras, 1);
    const ym = (d: number) => `${String(d).padStart(2, "0")}/${String(base.getMonth() + 1).padStart(2, "0")}/${base.getFullYear()}`;

    // Recebimentos de clientes recorrentes
    CLIENTES.forEach((c, i) => {
      const dia = 3 + i * 5;
      const val = 18000 + Math.round(r() * 40000);
      linhas.push(`${ym(dia)};PIX RECEBIDO ${c};${brl(val)}`);
    });
    // Cliente extra eventual
    if (r() > 0.5) linhas.push(`${ym(20)};PIX RECEBIDO CLIENTE EVENTUAL ${Math.round(r() * 90)};${brl(4000 + Math.round(r() * 12000))}`);

    // Fornecedores
    FORN.forEach((f, i) => {
      const val = 3000 + Math.round(r() * 18000);
      linhas.push(`${ym(8 + i * 3)};BOLETO ${f};-${brl(val)}`);
    });
    // Folha
    linhas.push(`${ym(5)};FOLHA DE PAGAMENTO FUNCIONARIOS;-${brl(62000 + Math.round(r() * 8000))}`);
    linhas.push(`${ym(5)};PRO-LABORE SOCIOS;-${brl(18000)}`);
    // Aluguel + energia + internet
    linhas.push(`${ym(10)};ALUGUEL IMOBILIARIA CENTRAL;-${brl(9500)}`);
    linhas.push(`${ym(12)};ENEL ENERGIA;-${brl(1800 + Math.round(r() * 900))}`);
    linhas.push(`${ym(12)};VIVO INTERNET FIBRA;-${brl(420)}`);
    // Assinaturas
    ASSIN.forEach(([nome, val], i) => linhas.push(`${ym(15 + i)};${nome};-${brl(val as number)}`));
    // Impostos
    linhas.push(`${ym(20)};DARF IRPJ;-${brl(7400 + Math.round(r() * 2000))}`);
    linhas.push(`${ym(20)};DAS SIMPLES NACIONAL;-${brl(5200)}`);
    // Tarifa
    linhas.push(`${ym(28)};TARIFA PACOTE DE SERVICOS;-${brl(89.9)}`);
    // Combustível
    linhas.push(`${ym(18)};POSTO SHELL CENTRO ABASTECIMENTO;-${brl(900 + Math.round(r() * 700))}`);
    // Transferência interna
    if (mAtras % 3 === 0) linhas.push(`${ym(25)};TRANSFERENCIA ENTRE CONTAS;-${brl(20000)}`);
  }
  return linhas.join("\n");
}
