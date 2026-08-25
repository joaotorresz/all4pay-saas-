#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# A PROVA NEGATIVA DA GUARDA DE DDL — no banco EFÊMERO, ponta a ponta
# ═══════════════════════════════════════════════════════════════════════════
#
# ⚠️ Uma guarda só conta como guarda depois de REPROVAR. Plantar a linha na
# lista de objetos prova a lógica de casamento; não prova a CADEIA — que o
# gatilho de evento dispara, que ele escreve em `ddl_log`, e que a guarda lê o
# que ele escreveu. Entre os três há três lugares para o conserto quebrar sem
# ninguém ver.
#
# ⚠️ E a sondagem roda AQUI, no banco que o `supabase start` levanta do zero,
# nunca em produção — é a regra que a própria auditoria de 17–18/08 produziu
# depois de deixar 13 sondagens registradas no `ddl_log` de produção para
# sempre. Aqui o objeto morre com o contêiner.
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL ausente}"

sonda="own_prova_da_guarda_ci"
limpar() { psql "$SUPABASE_DB_URL" -qtAX -c "drop table if exists public.${sonda}" >/dev/null 2>&1 || true; }
trap limpar EXIT

echo "→ 1/2  sem a sonda: a guarda tem de PASSAR"
if ! npm run --silent ddl; then
  echo "✗ a guarda reprovou o banco efêmero LIMPO — todo objeto aqui veio de migration."
  echo "  Isto não é sondagem: é a guarda acusando o próprio repositório."
  exit 1
fi

echo
echo "→ 2/2  com a sonda '${sonda}': a guarda tem de REPROVAR"
psql "$SUPABASE_DB_URL" -qtAX -v ON_ERROR_STOP=1 -c "create table public.${sonda} (id int)" >/dev/null

saida=0
npm run --silent ddl > /tmp/ddl-prova.out 2>&1 || saida=$?
cat /tmp/ddl-prova.out

if [ "$saida" -eq 0 ]; then
  echo
  echo "✗ A GUARDA NÃO REPROVOU um objeto criado à mão em '${sonda}'."
  echo "  Guarda que não reprova o defeito plantado não é guarda: é a aparência de uma."
  exit 1
fi
if ! grep -q "$sonda" /tmp/ddl-prova.out; then
  echo
  echo "✗ A guarda reprovou, mas NÃO NOMEOU '${sonda}' — reprovou por outra coisa."
  exit 1
fi

echo
echo "✓ PROVA FECHADA — banco limpo passa; objeto criado à mão reprova e é nomeado."
