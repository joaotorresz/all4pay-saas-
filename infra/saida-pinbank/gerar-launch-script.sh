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
# Compactado fica em ~11 KB, com folga para o que o Lightsail acrescenta.
#
# ⚠️ Por que o SHA-256: colar 11 KB num campo de formulário pode cortar o fim
# sem ninguém perceber. O servidor confere o instalar.sh descompactado contra o
# SHA-256 do arquivo do repositório e PARA, dizendo isso, se não bater — em vez
# de rodar meio script.
set -Eeuo pipefail
servidor="${1:-}"
[[ "$servidor" =~ ^[12]$ ]] || { echo "uso: $0 <1|2>" >&2; exit 1; }
aqui="$(cd "$(dirname "$0")" && pwd)"
instalar="$aqui/instalar.sh"
fim='QUATTRO_FIM_DO_INSTALADOR'
hash="$(sha256sum "$instalar" | cut -d' ' -f1)"
D=/root/quattro-saida

cat <<EOF
#!/bin/sh
# Launch script do Lightsail — SERVIDOR ${servidor} da saída fixa da Quattro para a Pinbank.
# Gerado por infra/saida-pinbank/gerar-launch-script.sh a partir de instalar.sh
# (SHA-256 ${hash}).
# Cole este texto INTEIRO. Nada aqui é segredo: a senha do proxy é gerada dentro do servidor.
set -eu
cortado() {
  echo "quattro-saida: o script chegou CORTADO ou alterado (\$1). Nada foi instalado: recrie a instância colando o texto inteiro."
  exit 1
}
mkdir -p ${D}
chmod 700 ${D}
if ! base64 -d >${D}/instalar.sh.gz 2>/dev/null <<'${fim}'
EOF
# -n: sem nome nem data dentro do gzip — o mesmo instalar.sh gera sempre o mesmo texto.
gzip -9 -n -c "$instalar" | base64 -w 76
cat <<EOF
${fim}
then cortado "base64 inválido"; fi
gunzip -f ${D}/instalar.sh.gz 2>/dev/null || cortado "gzip incompleto"
echo "${hash}  ${D}/instalar.sh" | sha256sum -c - >/dev/null 2>&1 || cortado "SHA-256 não confere"
if SERVIDOR=${servidor} bash ${D}/instalar.sh >${D}/instalacao.log 2>&1; then
  echo "quattro-saida: instalação do servidor ${servidor} CONCLUÍDA"
else
  echo "quattro-saida: instalação do servidor ${servidor} FALHOU — veja ${D}/instalacao.log"
fi
cat ${D}/instalacao.log
EOF
