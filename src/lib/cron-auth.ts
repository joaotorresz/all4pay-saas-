/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CREDENCIAL DE CRON — uma implementação só, e ela FALHA FECHADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A4P-078: a porta que se abre pela ausência.** As quatro rotas de cron
 * traziam, cada uma, a sua cópia de `if (secret) { …exige Bearer… }` — ou seja:
 * **sem a variável, sem exigência.** Uma rota que só pede credencial QUANDO a
 * configuração existe é uma porta que se abre sozinha por esquecimento, e o
 * esquecimento é o estado natural de uma variável que ninguém criou.
 *
 * Medido em 19/08/2026: `CRON_SECRET` **não existia** na Vercel. As quatro
 * rotas estavam respondendo a qualquer chamada — a mais antiga desde 09/06.
 *
 * ⚠️ **Quatro cópias da mesma regra é a razão de o defeito ser quádruplo.**
 * Consertar as quatro à mão deixaria a quinta rota nascer com o padrão errado,
 * porque quem a escreve copia a vizinha. Aqui a regra é UMA, e a varredura de
 * teto ZERO recusa qualquer rota que leia `CRON_SECRET` por conta própria.
 */

export type Recusa = { status: 503 | 401; motivo: string };

/**
 * Devolve `null` quando a chamada está autorizada, ou a recusa a devolver.
 *
 * ⚠️ **Sem `CRON_SECRET` a resposta é 503, não 200.** Falhar fechado transforma
 * o esquecimento num erro que alguém vê, em vez de um sucesso que ninguém vê. E
 * 503 (e não 401) porque o problema é de CONFIGURAÇÃO do servidor, não da
 * credencial de quem chamou — dizer "não autorizado" mandaria o operador
 * procurar o erro no lugar errado.
 */
export function recusaDeCron(req: Request): Recusa | null {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return { status: 503, motivo: "CRON_SECRET nao configurada — a rota recusa por padrao" };
  }
  if (req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return { status: 401, motivo: "nao autorizado" };
  }
  return null;
}
