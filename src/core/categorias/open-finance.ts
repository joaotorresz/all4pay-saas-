/**
 * Reexporta a tabela das categorias do Open Finance que as Edge Functions
 * usam ao GRAVAR — o app a usa ao LER (`lib/risco-linhas`). Uma tabela só: a
 * cópia em dois lugares divergiria na primeira categoria nova do Pluggy.
 */
export { CATEGORIAS_OPEN_FINANCE, categoriaDoOpenFinance } from "../../../supabase/functions/_shared/categorias-open-finance";
