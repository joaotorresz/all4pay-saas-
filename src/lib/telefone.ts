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
