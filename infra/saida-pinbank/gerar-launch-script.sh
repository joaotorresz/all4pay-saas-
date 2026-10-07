#!/usr/bin/env bash
# Gera o "launch script" do Lightsail para o servidor 1 ou 2 da saída fixa:
#
#   bash infra/saida-pinbank/gerar-launch-script.sh 1 > servidor-1.txt
#
# O conteúdo é colado INTEIRO no campo "Launch script" ao criar a instância.
# Nada nele é segredo: a senha do proxy é gerada no próprio servidor.
#
# ⚠️ Por que um embrulho em sh puro: o Lightsail mistura conteúdo próprio no
# user-data e não documenta COMO o junta ao script do usuário. Se o todo rodar
# em /bin/sh (dash), um script bash cai na primeira linha ("set: Illegal option
# -o pipefail" — reproduzido). O embrulho só usa sh POSIX e executa o
# instalar.sh com bash.
#
# ⚠️ Por que COMPACTADO (gzip + base64): o user-data do EC2, que está por baixo
# do Lightsail, tem teto de 16 KB, e o instalar.sh comentado passa de 22 KB.
# Compactado fica em ~13 KB, com folga para o que o Lightsail acrescenta.
#
# ⚠️ Por que a colagem CORTADA sempre diz "CORTADO": colar 13 KB num campo de
# formulário pode perder o fim sem ninguém ver. O embrulho só DEFINE coisas até
# a última linha, que é a única que age; quem decide é o `trap` de saída,
# armado na SEGUNDA linha. Cortado em qualquer ponto — no meio do texto
# compactado, depois dele, ou num caractere trocado (SHA-256) — o servidor diz
# "chegou CORTADO" e nada é instalado, em vez de rodar meio script ou morrer
# num erro de sintaxe que ninguém associa à colagem.
#
# Portável (Linux e macOS): `openssl` no lugar de `base64 -w`/`sha256sum`, que
# são do GNU. E a saída só é escrita no fim — falhar no meio não deixa meio
# arquivo com cara de inteiro.
set -Eeuo pipefail
servidor="${1:-}"
[[ "$servidor" =~ ^[12]$ ]] || { echo "uso: $0 <1|2>" >&2; exit 1; }
aqui="$(cd "$(dirname "$0")" && pwd)"
instalar="$aqui/instalar.sh"
fim='QUATTRO_FIM_DO_INSTALADOR'
hash="$(openssl dgst -sha256 <"$instalar" | sed 's/^.*= *//')"
[[ "$hash" =~ ^[0-9a-f]{64}$ ]] || { echo "não consegui calcular o SHA-256 de $instalar" >&2; exit 1; }
# -n: sem nome nem data dentro do gzip — o mesmo instalar.sh gera sempre o mesmo texto.
carga="$(gzip -9 -n -c "$instalar" | openssl base64)"
[ -n "$carga" ] || { echo "a compactação saiu vazia" >&2; exit 1; }
D=/root/quattro-saida

saida="$(cat <<EOF
#!/bin/sh
trap 'if [ "\${COLAGEM_OK:-0}" != 1 ]; then echo "quattro-saida: o script chegou CORTADO ou alterado\${MOTIVO:+ (\$MOTIVO)}. Nada foi instalado: recrie a instância colando o texto inteiro."; exit 1; fi' EXIT
# Launch script do Lightsail — SERVIDOR ${servidor} da saída fixa da Quattro para a Pinbank.
# Gerado por infra/saida-pinbank/gerar-launch-script.sh a partir de instalar.sh
# (SHA-256 ${hash}).
# Cole este texto INTEIRO. Nada aqui é segredo: a senha do proxy é gerada dentro do servidor.
set -u
COLAGEM_OK=0
MOTIVO=""
cortado() { MOTIVO="\$1"; exit 1; }
instalar_servidor() {
  base64 -d <${D}/instalar.sh.b64 >${D}/instalar.sh.gz 2>/dev/null || cortado "base64 inválido"
  gunzip -f ${D}/instalar.sh.gz 2>/dev/null || cortado "gzip incompleto"
  echo "${hash}  ${D}/instalar.sh" | sha256sum -c - >/dev/null 2>&1 || cortado "SHA-256 não confere"
  rm -f ${D}/instalar.sh.b64
  COLAGEM_OK=1
  if SERVIDOR=${servidor} bash ${D}/instalar.sh >${D}/instalacao.log 2>&1; then
    echo "quattro-saida: instalação do servidor ${servidor} CONCLUÍDA"; status=0
  else
    echo "quattro-saida: instalação do servidor ${servidor} FALHOU — veja ${D}/instalacao.log"; status=1
  fi
  cat ${D}/instalacao.log
  exit "\$status"
}
mkdir -p ${D} && chmod 700 ${D} || exit 1
cat >${D}/instalar.sh.b64 <<'${fim}'
${carga}
${fim}
instalar_servidor
EOF
)"
printf '%s\n' "$saida"
