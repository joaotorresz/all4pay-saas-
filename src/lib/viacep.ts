/**
 * ViaCEP lookup. Runs in the browser (the user's network), so it works
 * regardless of the server environment. Returns null on miss/error.
 */
export interface CepAddress {
  street: string;
  district: string;
  city: string;
  state: string;
}

export async function lookupCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return {
      street: data.logradouro ?? "",
      district: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    };
  } catch {
    return null;
  }
}
