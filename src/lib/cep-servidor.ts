import type { TomadorParaEmitir } from "@/core/nfse/focus";

/**
 * O código IBGE da cidade do tomador, pelo CEP (ViaCEP), do lado do servidor.
 *
 * O cadastro de contatos não guarda o IBGE, e o leiaute da reforma exige o
 * endereço do tomador com ele quando há IBS/CBS (recusa de 30/10/2026: "o
 * tomador deve ser identificado e seu endereço nacional informado"). Sem rede
 * ou com CEP desconhecido, devolve o tomador como veio — e o motor recusa
 * ANTES de enviar, nomeando o CEP.
 */
export async function comMunicipioDoCep(t: TomadorParaEmitir): Promise<TomadorParaEmitir> {
  if (t.codigoMunicipio && /^\d{7}$/.test(t.codigoMunicipio)) return t;
  const cep = (t.cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) return t;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!r.ok) return t;
    const d = (await r.json()) as { erro?: unknown; ibge?: string; logradouro?: string; bairro?: string; uf?: string };
    if (d.erro || !/^\d{7}$/.test(d.ibge ?? "")) return t;
    return {
      ...t,
      codigoMunicipio: d.ibge,
      rua: t.rua || d.logradouro || t.rua,
      bairro: t.bairro || d.bairro || t.bairro,
      uf: t.uf || d.uf || t.uf,
    };
  } catch {
    return t;
  }
}
