/**
 * Telefone como o sistema compara: só os dígitos, sem o 55 do país.
 *
 * ⚠️ É por esta função que a rota de cobrança decide se um destino é de um
 * contato da empresa. Comparar o texto cru deixaria "(11) 99999-0000" e
 * "+55 11 999990000" como dois números — e a trava recusaria o cliente certo.
 */
export const soDigitosFone = (t: string): string => {
  const d = t.replace(/\D/g, "");
  return d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
};

/**
 * Telefone como o sistema GRAVA e ENVIA: E.164 (`+5511998388744`).
 *
 * ⚠️ A Twilio recusa (400 "is not a valid phone number") o número sem o país —
 * medido em produção em 28/10/2026 com "11998388744". DDD + número (10 ou 11
 * dígitos, sem "+") ganha o +55; 12–13 dígitos começando por 55 ganham só o
 * "+"; o que já vem com "+" fica com o próprio país. O que não se reconhece
 * volta como veio — reescrever um número estrangeiro sem "+" o estragaria.
 * ⚠️ Espelho de `public.telefone_e164` no banco (migration 20261028180000).
 */
export function telefoneE164(t: string | null | undefined): string | null {
  const bruto = (t ?? "").trim();
  if (!bruto) return null;
  const d = bruto.replace(/\D/g, "");
  if (!d) return bruto;
  if (bruto.startsWith("+")) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
  return bruto;
}
