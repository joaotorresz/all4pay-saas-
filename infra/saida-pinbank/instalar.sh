#!/usr/bin/env bash
# =============================================================================
# instalar.sh — proxy de SAÍDA da Quattro para a Pinbank (Squid, só CONNECT)
#
# Cada servidor (Lightsail, Ubuntu 24.04 LTS, um IP fixo cada) roda este
# script uma vez. Os dois IPs fixos são os que a Pinbank libera; as funções da
# Vercel (que não têm IP fixo) chamam a Pinbank POR DENTRO deste proxy.
# Detalhe e decisões: docs/rodada-10/saida-fixa.md.
#
# Como entra no servidor: `gerar-launch-script.sh <1|2>` embrulha este arquivo
# num "launch script" do Lightsail. À mão (root):
#
#   SERVIDOR=1 bash instalar.sh
#
# Variáveis de entrada:
#   SERVIDOR             1 ou 2 (obrigatória). Decide a hora do reinício e o
#                        nome da variável na Vercel (PINBANK_SAIDA_1 / _2).
#   PROXY_SENHA          opcional. Sem ela, a senha é GERADA aqui, na própria
#                        máquina (openssl rand), e guardada em
#                        /root/quattro-saida/credencial (root, 0600). É o
#                        caminho recomendado: a senha nunca passa por console,
#                        user-data, documento ou chat.
#   PROXY_SENHA_ARQUIVO  alternativa a PROXY_SENHA: arquivo com a senha na 1ª linha.
#   PROXY_USUARIO        opcional. Sem ele, um usuário ALEATÓRIO é gerado. ⚠️
#                        Usuário previsível ("quattro") deixa qualquer um mandar
#                        senha errada nele e enfileirar o bcrypt — medido: o
#                        cliente legítimo passou de ~0 s para 1,2–4,8 s por
#                        túnel. Com usuário desconhecido isso não acontece.
#   REINICIO_HORA        opcional (HH:MM, UTC). Padrão: 07:10 no servidor 1 e
#                        07:40 no 2 (04:10 e 04:40 de Brasília) — HORAS
#                        DIFERENTES, senão os dois reiniciam juntos e não sobra
#                        saída nenhuma durante o reboot.
#
# Depois de anexar o IP fixo no Lightsail, `sudo quattro-saida-url` mostra o
# IP fixo deste servidor e o valor da variável PINBANK_SAIDA_<n> da Vercel.
#
# ⚠️ A senha NUNCA aparece em argumento de processo (ps), em log, nem na saída
# deste script (nada de `set -x`: o launch script vai para o log do cloud-init).
# O marcador TROQUE_ESTA_SENHA é RECUSADO: subir um proxy com senha conhecida é
# pior que não subir.
#
# ⚠️ /etc/squid/squid.conf (o do pacote) NÃO é tocado. Ele é "conffile" do
# Debian; editá-lo faria o unattended-upgrades PULAR as atualizações de
# segurança do Squid sempre que o pacote trouxer um squid.conf novo (ele não
# atualiza pacote que pediria pergunta de conffile). A configuração mora em
# /etc/squid/quattro-saida.conf e o systemd a aponta por um drop-in.
# =============================================================================
set -Eeuo pipefail
umask 027
export DEBIAN_FRONTEND=noninteractive
export LC_ALL=C

readonly MARCADOR='TROQUE_ESTA_SENHA'
readonly PORTA=31280
readonly CONF=/etc/squid/quattro-saida.conf
readonly PASSWD=/etc/squid/quattro-passwd
readonly DROPIN_DIR=/etc/systemd/system/squid.service.d
readonly DROPIN="$DROPIN_DIR/quattro-saida.conf"
readonly HELPER=/usr/lib/squid/basic_ncsa_auth
readonly APT_AUTO=/etc/apt/apt.conf.d/20auto-upgrades
# "zz-": o apt lê apt.conf.d em ordem alfabética e o ÚLTIMO vence. Com "99-",
# um arquivo de imagem como "docker-disable-periodic-update" (Enable "0") vinha
# depois e desligava as atualizações em silêncio — medido no teste.
readonly APT_QUATTRO=/etc/apt/apt.conf.d/zz-quattro-saida
readonly SYSCTL_V6=/etc/sysctl.d/60-quattro-saida-sem-ipv6.conf
readonly DIR_CRED=/root/quattro-saida
readonly ARQ_CRED="$DIR_CRED/credencial"
readonly COMANDO_URL=/usr/local/sbin/quattro-saida-url

# Destinos permitidos — o ÚNICO lugar onde a lista mora.
#   .pinbank.com.br        a API e a chave do webhook (o ponto inicial cobre o
#                          domínio e todo subdomínio)
#   checkip.amazonaws.com  o teste de saúde: devolve o IP de saída do servidor
readonly DESTINOS='.pinbank.com.br checkip.amazonaws.com'

falha() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
info()  { printf '==> %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Conferir TUDO antes de tocar em qualquer coisa
# ---------------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || falha "rode como root (sudo)."

SERVIDOR="${SERVIDOR:-}"
[[ "$SERVIDOR" =~ ^[12]$ ]] || falha "SERVIDOR precisa ser 1 ou 2 (recebido: '${SERVIDOR}'). NADA foi instalado."
if [ "$SERVIDOR" = 1 ]; then REINICIO_PADRAO=07:10; else REINICIO_PADRAO=07:40; fi
REINICIO_HORA="${REINICIO_HORA:-$REINICIO_PADRAO}"
[[ "$REINICIO_HORA" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] \
  || falha "REINICIO_HORA inválida (formato HH:MM, 24h)."

# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] \
  || falha "este script foi testado em Ubuntu 24.04 LTS; encontrado ${PRETTY_NAME:-desconhecido}."

# --- credencial: informada, guardada de uma execução anterior, ou GERADA aqui -
CRED_USUARIO=""; CRED_SENHA=""
if [ -f "$ARQ_CRED" ]; then
  while IFS='=' read -r chave valor; do
    case "$chave" in
      PROXY_USUARIO) CRED_USUARIO="$valor" ;;
      PROXY_SENHA)   CRED_SENHA="$valor" ;;
    esac
  done <"$ARQ_CRED"
fi
if [ -n "${PROXY_SENHA_ARQUIVO:-}" ]; then
  [ -r "$PROXY_SENHA_ARQUIVO" ] || falha "PROXY_SENHA_ARQUIVO não pode ser lido."
  IFS= read -r PROXY_SENHA <"$PROXY_SENHA_ARQUIVO" || true
fi
if [ -n "${PROXY_SENHA+x}" ]; then
  # Informada: o marcador e a senha fraca são recusados ANTES de qualquer efeito.
  case "${PROXY_SENHA^^}" in
    *TROQUE*) falha "a senha ainda é o marcador ($MARCADOR). Tire PROXY_SENHA para gerar uma aleatória. NADA foi instalado." ;;
  esac
  SENHA_ORIGEM=informada
elif [ -n "$CRED_SENHA" ]; then
  PROXY_SENHA="$CRED_SENHA"; SENHA_ORIGEM=guardada
else
  command -v openssl >/dev/null 2>&1 || falha "openssl ausente: não há como gerar a senha. NADA foi instalado."
  # 20 bytes = 40 caracteres hexadecimais. Sem pipe: com pipefail, um
  # `tr | head` mata o `tr` com SIGPIPE e o script morre ao acaso.
  PROXY_SENHA="$(openssl rand -hex 20)"; SENHA_ORIGEM=gerada
fi
if [ -z "${PROXY_USUARIO:-}" ]; then
  if [ -n "$CRED_USUARIO" ]; then PROXY_USUARIO="$CRED_USUARIO"
  else
    command -v openssl >/dev/null 2>&1 || falha "openssl ausente: não há como gerar o usuário. NADA foi instalado."
    PROXY_USUARIO="q$(openssl rand -hex 7)"
  fi
fi
# Só [A-Za-z0-9_-]: a senha vai dentro de uma URL (PINBANK_SAIDA_<n>) e de um
# arquivo de configuração do curl; sem caractere especial, não há escape a errar.
# 72 é o teto do bcrypt (o basic_ncsa_auth trunca acima disso).
[[ "$PROXY_SENHA" =~ ^[A-Za-z0-9_-]{32,72}$ ]] \
  || falha "a senha precisa ter de 32 a 72 caracteres, só A-Z a-z 0-9 _ - (recebida com ${#PROXY_SENHA}). NADA foi instalado."
[[ "$PROXY_USUARIO" =~ ^[a-z][a-z0-9_]{2,31}$ ]] \
  || falha "PROXY_USUARIO inválido (minúsculas, dígitos e _; 3 a 32 caracteres)."

tem_systemd() { [ -d /run/systemd/system ]; }

# ---------------------------------------------------------------------------
# 2. Só IPv4 na saída
# ---------------------------------------------------------------------------
# ⚠️ A Pinbank libera o IPv4 FIXO. O domínio dela tem AAAA (Cloudflare): com
# IPv6 na máquina, o Squid poderia sair por IPv6 e a Pinbank veria outro
# endereço — "funciona às vezes", que é o pior defeito de achar. O Lightsail
# nasce com IPv6 ligado, então o script o DESLIGA no sistema (e o passo a passo
# o desliga também no console, o que fecha o firewall IPv6). Se mesmo assim
# sobrar endereço IPv6 global, o script PARA.
if [ -d /proc/sys/net/ipv6 ]; then
  cat >"$SYSCTL_V6.novo" <<'EOF'
# Gerado por instalar.sh (saída fixa da Quattro): só IPv4, porque a Pinbank
# libera o IPv4 fixo deste servidor.
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
EOF
  chmod 0644 "$SYSCTL_V6.novo"; mv -f "$SYSCTL_V6.novo" "$SYSCTL_V6"
  sysctl -q -p "$SYSCTL_V6" >/dev/null 2>&1 || true
fi
if command -v ip >/dev/null 2>&1 && [ -n "$(ip -6 addr show scope global 2>/dev/null)" ]; then
  falha "esta máquina continua com IPv6 global depois de desligá-lo; a saída poderia não usar o IP fixo."
fi

# Hora do reinício em UTC de propósito: a imagem do Ubuntu já nasce em UTC, e
# fixar aqui torna a conta (07:10 UTC = 04:10 de Brasília) independente dela.
if tem_systemd && [ "$(timedatectl show -p Timezone --value 2>/dev/null)" != "Etc/UTC" ]; then
  timedatectl set-timezone Etc/UTC
fi

# ---------------------------------------------------------------------------
# 3. Pacotes (sem deixar o Squid subir com a configuração padrão do pacote)
# ---------------------------------------------------------------------------
POLICY_CRIADO=0
limpar() {
  if [ "$POLICY_CRIADO" = 1 ]; then rm -f /usr/sbin/policy-rc.d; fi
  rm -f "${TMPS[@]:-}" 2>/dev/null || true
}
TMPS=()
trap limpar EXIT
novo_tmp() { local t; t="$(mktemp)"; TMPS+=("$t"); printf '%s' "$t"; }

APT_OPTS=(-y -q -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
PACOTES=(squid apache2-utils unattended-upgrades curl ca-certificates iproute2 openssl)
faltando=()
for p in "${PACOTES[@]}"; do
  [ "$(dpkg-query -W -f='${Status}' "$p" 2>/dev/null)" = 'install ok installed' ] || faltando+=("$p")
done
if [ "${#faltando[@]}" -gt 0 ]; then
  info "instalando: ${faltando[*]}"
  # policy-rc.d = 101 impede o postinst de subir o Squid com o squid.conf do
  # pacote (porta 3128 aberta para a rede local) antes de a nossa configuração
  # existir. Só removemos o arquivo se fomos nós que o criamos.
  if [ ! -e /usr/sbin/policy-rc.d ]; then
    printf '#!/bin/sh\nexit 101\n' >/usr/sbin/policy-rc.d
    chmod 0755 /usr/sbin/policy-rc.d
    POLICY_CRIADO=1
  fi
  # A trava do dpkg no primeiro boot (o apt-daily do próprio Ubuntu) espera em
  # vez de abortar: DPkg::Lock::Timeout.
  apt-get -q -o DPkg::Lock::Timeout=600 update
  apt-get install "${APT_OPTS[@]}" --no-install-recommends "${faltando[@]}"
  if [ "$POLICY_CRIADO" = 1 ]; then rm -f /usr/sbin/policy-rc.d; POLICY_CRIADO=0; fi
fi
[ -x "$HELPER" ] || falha "não achei $HELPER (o caminho mudou nesta versão do pacote?)."
getent group proxy >/dev/null || falha "o grupo 'proxy' não existe."

# Grava $1 com o conteúdo de stdin, modo $2, dono $3 (usuario:grupo).
# Devolve 0 se MUDOU algo, 1 se já estava igual.
gravar() {
  local destino="$1" modo="$2" dono="$3" t
  t="$(novo_tmp)"; cat >"$t"
  if [ -f "$destino" ] && cmp -s "$t" "$destino" \
     && [ "$(stat -c '%a %U:%G' "$destino")" = "${modo#0} $dono" ]; then
    return 1
  fi
  install -m "$modo" -o "${dono%%:*}" -g "${dono##*:}" "$t" "$destino"
  return 0
}

REINICIAR=0
RECARREGAR_SYSTEMD=0

# ---------------------------------------------------------------------------
# 4. Credencial guardada (só root lê) e usuário do proxy (bcrypt)
# ---------------------------------------------------------------------------
install -d -m 0700 -o root -g root "$DIR_CRED"
if printf 'SERVIDOR=%s\nPROXY_USUARIO=%s\nPROXY_SENHA=%s\nPORTA=%s\n' \
     "$SERVIDOR" "$PROXY_USUARIO" "$PROXY_SENHA" "$PORTA" | gravar "$ARQ_CRED" 0600 root:root; then
  info "credencial do proxy ($SENHA_ORIGEM) guardada em $ARQ_CRED (só root lê)."
fi

senha_confere() {
  [ -f "$PASSWD" ] && [ "$(grep -c '' "$PASSWD")" = 1 ] \
    && grep -q "^${PROXY_USUARIO}:\\\$2y\\\$" "$PASSWD" \
    && printf '%s' "$PROXY_SENHA" | htpasswd -v -i "$PASSWD" "$PROXY_USUARIO" >/dev/null 2>&1
}
if senha_confere; then
  info "o usuário do proxy já tem esta senha."
  chown root:proxy "$PASSWD"; chmod 0640 "$PASSWD"
else
  t="$(novo_tmp)"
  # -i lê a senha da entrada padrão (fora do ps); -B bcrypt; -C 10 = custo.
  printf '%s' "$PROXY_SENHA" | htpasswd -i -B -C 10 -c "$t" "$PROXY_USUARIO" 2>/dev/null
  install -m 0640 -o root -g proxy "$t" "$PASSWD"
  info "senha do usuário do proxy gravada (bcrypt)."
  REINICIAR=1  # reinício limpa o cache de credenciais: a senha velha morre na hora
fi

# ---------------------------------------------------------------------------
# 5. Configuração do Squid (validada ANTES de entrar no lugar)
# ---------------------------------------------------------------------------
gerar_conf() {
  cat <<EOF
# Gerado por instalar.sh — NÃO EDITE À MÃO: o script reescreve este arquivo.
# Proxy de SAÍDA da Quattro: só CONNECT, só porta 443, só os destinos abaixo,
# só com usuário e senha. Todo o resto é negado.

http_port ${PORTA}
icp_port 0
htcp_port 0

# --- autenticação básica (arquivo htpasswd em bcrypt) -----------------------
auth_param basic program ${HELPER} ${PASSWD}
# Sobrecarga do helper (ex.: varredura com senha errada) NEGA a requisição em
# vez de derrubar o Squid (o padrão do Squid é "die").
auth_param basic children 5 startup=1 idle=1 queue-size=64 on-persistent-overload=ERR
auth_param basic realm saida
auth_param basic credentialsttl 1 hour
auth_param basic casesensitive on

# --- listas -------------------------------------------------------------------
acl metodo_connect method CONNECT
acl porta_tls port 443
# -n: nunca faz DNS reverso. CONNECT para um IP literal NÃO casa com a lista.
acl destino_permitido dstdomain -n ${DESTINOS}
# Destino que resolve para rede interna/reservada é recusado mesmo com nome
# permitido (DNS envenenado não vira acesso ao metadado da instância nem à VPC).
acl destino_interno dst 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.168.0.0/16 198.18.0.0/15 224.0.0.0/3 ::/128 ::1 fc00::/7 fe80::/10
acl autenticado proxy_auth REQUIRED

# --- regras: a primeira que casa vence ---------------------------------------
# As recusas baratas vêm ANTES da senha: varredura de proxy aberto (GET, outra
# porta, outro destino) é negada sem acionar o bcrypt nem o DNS.
http_access deny !metodo_connect
http_access deny !porta_tls
http_access deny !destino_permitido
# A senha vem ANTES de "destino_interno": essa lista é por endereço e obriga o
# Squid a RESOLVER o nome; antes da senha, qualquer um na internet faria este
# servidor consultar nomes arbitrários sob pinbank.com.br.
http_access deny !autenticado
http_access deny destino_interno
http_access allow autenticado
http_access deny all

# --- sem cache, sem rastro do cliente ------------------------------------------
cache deny all
cache_mem 0 MB
via off
forwarded_for delete
httpd_suppress_version_string on
visible_hostname saida
pinger_enable off

# --- tempos -------------------------------------------------------------------
connect_timeout 10 seconds
read_timeout 2 minutes
request_timeout 30 seconds
client_lifetime 30 minutes
shutdown_lifetime 3 seconds

# --- registro (o logrotate do pacote gira /var/log/squid/*.log) ---------------
logfile_rotate 0
access_log daemon:/var/log/squid/access.log squid
cache_log /var/log/squid/cache.log
coredump_dir /var/spool/squid
EOF
}

t="$(novo_tmp)"; gerar_conf >"$t"; chmod 0644 "$t"
if ! saida_parse="$(squid -k parse -f "$t" 2>&1)"; then
  printf '%s\n' "$saida_parse" >&2
  falha "a configuração gerada não passou no 'squid -k parse'. Nada foi trocado."
fi
if grep -qiE 'FATAL|ERROR' <<<"$saida_parse"; then
  printf '%s\n' "$saida_parse" >&2
  falha "o 'squid -k parse' reportou erro. Nada foi trocado."
fi
if gerar_conf | gravar "$CONF" 0644 root:root; then
  info "configuração gravada em $CONF."
  REINICIAR=1
fi

# ---------------------------------------------------------------------------
# 6. systemd: aponta o serviço para a NOSSA configuração e reinicia se cair
# ---------------------------------------------------------------------------
install -d -m 0755 "$DROPIN_DIR"
if gravar "$DROPIN" 0644 root:root <<EOF
# Gerado por instalar.sh
[Service]
ExecStartPre=
ExecStartPre=/usr/sbin/squid --foreground -z -f ${CONF}
ExecStart=
ExecStart=/usr/sbin/squid --foreground -sYC -f ${CONF}
Restart=on-failure
RestartSec=2s
EOF
then
  info "drop-in do systemd gravado."
  RECARREGAR_SYSTEMD=1
  REINICIAR=1
fi

squid_no_ar() {
  if tem_systemd; then systemctl is-active --quiet squid
  else squid -k check -f "$CONF" >/dev/null 2>&1
  fi
}

if tem_systemd; then
  [ "$RECARREGAR_SYSTEMD" = 1 ] && systemctl daemon-reload
  systemctl enable squid >/dev/null 2>&1
  if [ "$REINICIAR" = 1 ] || ! squid_no_ar; then
    info "reiniciando o Squid."
    systemctl restart squid
  else
    info "Squid já no ar com esta configuração — nada a reiniciar."
  fi
else
  # Sem systemd (contêiner de teste): o mesmo binário, a mesma configuração.
  install -d -m 0775 -o proxy -g proxy /run/squid
  if [ "$REINICIAR" = 1 ] && squid_no_ar; then
    info "reiniciando o Squid (sem systemd)."
    squid -k shutdown -f "$CONF" >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do squid_no_ar || break; sleep 0.5; done
  fi
  if ! squid_no_ar; then
    squid -f "$CONF"
  else
    info "Squid já no ar com esta configuração — nada a reiniciar."
  fi
fi

porta_aberta() { [ -n "$(ss -Hltn "sport = :${PORTA}")" ]; }
for _ in $(seq 1 40); do porta_aberta && break; sleep 0.5; done
porta_aberta || falha "o Squid não abriu a porta ${PORTA}. Veja /var/log/squid/cache.log."

# ---------------------------------------------------------------------------
# 7. Atualizações automáticas de segurança
# ---------------------------------------------------------------------------
gravar "$APT_AUTO" 0644 root:root <<'EOF' && info "20auto-upgrades gravado." || true
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
gravar "$APT_QUATTRO" 0644 root:root <<EOF && info "política de reboot gravada." || true
// Gerado por instalar.sh
APT::Periodic::Enable "1";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "${REINICIO_HORA}";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
EOF
if tem_systemd; then
  systemctl enable --now unattended-upgrades.service apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true
fi
# Confere o que o apt ENXERGA depois de ler todos os arquivos (não o que foi
# escrito): é a configuração efetiva que decide se a atualização roda.
# (Sem pipe para o grep -q: com pipefail, o SIGPIPE do apt-config reprovava ao acaso.)
apt_efetivo="$(apt-config dump)"
for linha in 'APT::Periodic::Enable "1";' 'APT::Periodic::Update-Package-Lists "1";' \
             'APT::Periodic::Unattended-Upgrade "1";' 'Unattended-Upgrade::Automatic-Reboot "true";' \
             "Unattended-Upgrade::Automatic-Reboot-Time \"${REINICIO_HORA}\";"; do
  grep -qxF "$linha" <<<"$apt_efetivo" || falha "configuração efetiva do apt sem: $linha"
done

# ---------------------------------------------------------------------------
# 8. O comando que mostra o IP fixo e o valor da variável da Vercel
# ---------------------------------------------------------------------------
gravar "$COMANDO_URL" 0750 root:root <<'EOF' && info "comando quattro-saida-url instalado." || true
#!/usr/bin/env bash
# Gerado por instalar.sh. Mostra o IP fixo de SAÍDA deste servidor (medido
# passando pelo próprio proxy) e o valor da variável PINBANK_SAIDA_<n> da
# Vercel. ⚠️ O valor contém a SENHA do proxy: cole direto na Vercel
# (Environment Variables, só Production, marcada como Sensitive), nunca em
# documento, e-mail ou chat.
set -Eeuo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Use: sudo quattro-saida-url" >&2; exit 1; }
SERVIDOR=""; PROXY_USUARIO=""; PROXY_SENHA=""; PORTA=""
while IFS='=' read -r chave valor; do
  case "$chave" in
    SERVIDOR) SERVIDOR="$valor" ;; PROXY_USUARIO) PROXY_USUARIO="$valor" ;;
    PROXY_SENHA) PROXY_SENHA="$valor" ;; PORTA) PORTA="$valor" ;;
  esac
done </root/quattro-saida/credencial
ip=""
for tentativa in 1 2 3; do
  ip="$(printf 'proxy-user = "%s:%s"\n' "$PROXY_USUARIO" "$PROXY_SENHA" \
        | curl -K - -sS -m 15 --noproxy '' -x "http://127.0.0.1:${PORTA}" https://checkip.amazonaws.com 2>/dev/null \
        | tr -d '[:space:]' || true)"
  [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && break
  sleep $((tentativa * 2))
done
[[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "ERRO: o proxy não conseguiu sair para medir o IP." >&2; exit 1; }
echo
echo "Servidor ${SERVIDOR} — IP de SAÍDA medido agora: ${ip}"
echo "  (confira que é o mesmo IP fixo do Lightsail: é ESTE que vai para a Pinbank)"
echo
echo "Variável da Vercel: PINBANK_SAIDA_${SERVIDOR}   (SECRETA — só Production, marque Sensitive)"
echo "Valor:"
echo "http://${PROXY_USUARIO}:${PROXY_SENHA}@${ip}:${PORTA}"
echo
EOF

# ---------------------------------------------------------------------------
# 9. Prova: o proxy faz o que promete (e recusa o que deve recusar)
# ---------------------------------------------------------------------------
PROXY_LOCAL="http://127.0.0.1:${PORTA}"
via_proxy() {  # curl pelo proxy local; a senha vai pela entrada padrão (-K -)
  printf 'proxy-user = "%s:%s"\n' "$PROXY_USUARIO" "$PROXY_SENHA" \
    | curl -K - -sS -m 15 --noproxy '' -x "$PROXY_LOCAL" "$@"
}
# %{http_connect} = o código que o PROXY deu ao CONNECT (o %{http_code} seria do destino).
codigo_sem_senha="$(curl -s -o /dev/null -m 10 --noproxy '' -x "$PROXY_LOCAL" -w '%{http_connect}' https://checkip.amazonaws.com || true)"
[ "$codigo_sem_senha" = 407 ] || falha "sem senha o proxy deveria responder 407; respondeu '${codigo_sem_senha}'."
codigo_fora="$(via_proxy -o /dev/null -w '%{http_connect}' https://example.com 2>/dev/null || true)"
[ "$codigo_fora" = 403 ] || falha "destino fora da lista deveria dar 403; deu '${codigo_fora}'."

ip_saida=""
for tentativa in 1 2 3; do
  ip_saida="$(via_proxy https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
  [[ "$ip_saida" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && break
  sleep $((tentativa * 2))
done
[[ "$ip_saida" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] \
  || falha "o proxy subiu mas não conseguiu sair para checkip.amazonaws.com (sem rota de saída?)."

info "OK: servidor ${SERVIDOR}; proxy no ar na porta ${PORTA}; sem senha = 407; fora da lista = 403."
info "IP de saída AGORA: ${ip_saida}. ⚠️ Antes de anexar o IP fixo do Lightsail este é um IP"
info "provisório; depois de anexar, rode 'sudo quattro-saida-url' para ver o IP fixo e a variável."
