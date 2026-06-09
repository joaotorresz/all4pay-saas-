/**
 * Brazilian document validation + masking (CPF / CNPJ).
 * Pure functions — no deps. Used by the cadastro forms.
 */

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function validateCPF(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function validateCNPJ(input: string): boolean {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function validateDoc(type: "pf" | "pj", value: string): boolean {
  return type === "pf" ? validateCPF(value) : validateCNPJ(value);
}

/** Mask as the user types: 000.000.000-00 (CPF) or 00.000.000/0000-00 (CNPJ). */
export function maskDoc(type: "pf" | "pj", value: string): string {
  const d = onlyDigits(value);
  if (type === "pf") {
    return d
      .slice(0, 11)
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return d
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Mask a CEP: 00000-000. */
export function maskCep(value: string): string {
  return onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}
