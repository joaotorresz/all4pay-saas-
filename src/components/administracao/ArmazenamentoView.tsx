"use client";

/**
 * ARMAZENAMENTO — onde os seus dados estão, e o que ainda não saiu do navegador.
 *
 * ⚠️ Esta tela existe para tornar VISÍVEL uma limitação que era invisível. O
 * sistema guardava entidades de negócio inteiras no `localStorage`, e nada na
 * interface dizia isso: quem trocasse de máquina descobria a perda depois de
 * já ter perdido, e quem convidasse um sócio descobria que os dois viam
 * estados diferentes sem entender por quê.
 *
 * Na ONDA 8 ela ganhou as três coisas que faltavam para a promessa de
 * persistência se sustentar:
 *
 *  1. **A meta** — quantos bytes de NEGÓCIO ainda dependem deste navegador. É o
 *     número que a migração persegue; sem ele "quase pronto" é opinião.
 *  2. **O backup** — baixar e restaurar o estado da organização. Um backup que
 *     nunca foi restaurado não é backup; por isso a restauração informa quanto
 *     tempo levou e o que recusou.
 *  3. **O cache** — o que fica no dispositivo de propósito, mas VENCE. As duas
 *     chaves de cache já tinham validade e mesmo assim cresciam sem parar: a
 *     leitura ignorava a entrada velha em vez de removê-la. Ignorar não é
 *     expirar.
 */
import * as React from "react";
import { Card, Button, Icon, StatusBadge, InfoHint, AcaoDestrutiva } from "@/components/ui";
import {
  estadoSincronizacao, hidratar, migrarParaServidor,
  expurgarCaches, enxugarLocal, exportarEstado, importarEstado, backupValido,
  CHAVES_DE_NEGOCIO, PREFERENCIAS_LOCAIS, CACHES_LOCAIS, META_BYTES_LOCAIS,
  rotuloDaChave, type EstadoSincronizacao, type Backup,
} from "@/lib/store-org";
import { isDemo } from "@/lib/demo";

const kb = (b: number) => `${Math.round((b / 1024) * 10) / 10} KB`;

export function ArmazenamentoView() {
  const [est, setEst] = React.useState<EstadoSincronizacao | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [backup, setBackup] = React.useState<{ arquivo: string; dados: Backup } | null>(null);
  const [erroArquivo, setErroArquivo] = React.useState<string | null>(null);
  const inputArquivo = React.useRef<HTMLInputElement>(null);

  // ⚠️ Gate de montagem: `localStorage` lido durante o render quebra a
  // hidratação (foi o que já mordeu o painel de integrações).
  React.useEffect(() => { setEst(estadoSincronizacao()); }, []);

  const atualizar = () => setEst(estadoSincronizacao());

  const sincronizar = async () => {
    setOcupado(true); setMsg(null);
    try {
      const m = await migrarParaServidor(CHAVES_DE_NEGOCIO);
      const h = await hidratar(CHAVES_DE_NEGOCIO);
      setMsg(`${m.enviadas} enviadas ao servidor · ${h} atualizadas a partir dele.`);
      atualizar();
    } finally {
      setOcupado(false);
    }
  };

  function baixarBackup() {
    const dados = exportarEstado();
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all4pay-estado-${dados.geradoEm.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`Backup gerado com ${Object.keys(dados.chaves).length} itens.`);
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o MESMO arquivo depois de um erro
    setBackup(null); setErroArquivo(null); setMsg(null);
    if (!f) return;
    try {
      const lido: unknown = JSON.parse(await f.text());
      if (!backupValido(lido)) {
        // ⚠️ Recusar com o motivo, não com "arquivo inválido": quem restaura um
        // backup está num dia ruim, e "inválido" não diz se o arquivo é de
        // outro sistema, se está truncado ou se é de uma versão futura.
        setErroArquivo("Este arquivo não é um backup do all4pay (formato ou versão não reconhecidos).");
        return;
      }
      setBackup({ arquivo: f.name, dados: lido });
    } catch {
      setErroArquivo("Não foi possível ler o arquivo — ele não é um JSON válido.");
    }
  }

  async function restaurar() {
    if (!backup) return;
    // O estado VIGENTE vira o desfazer. Sem este instantâneo, restaurar o
    // arquivo errado seria irreversível — e é justamente quem já está
    // consertando algo que escolhe o arquivo errado.
    const anterior = exportarEstado();
    const r = await importarEstado(backup.dados);
    atualizar();
    setMsg(
      `${r.restauradas} itens restaurados em ${r.ms} ms`
      + (r.recusadas.length ? ` · ${r.recusadas.length} recusados (fora da lista de dados de negócio)` : ""),
    );
    setBackup(null);
    return async () => {
      await importarEstado(anterior);
      atualizar();
      setMsg("Restauração desfeita — o estado anterior voltou.");
    };
  }

  if (!est) return null;

  const alerta = est.pctTeto >= 60;
  const bytesCache = est.caches.reduce((s, c) => s + c.bytes, 0);

  return (
    <div className="flex flex-col gap-5 pb-6 max-w-[860px]">
      <Card className="flex flex-col gap-4"
        info={{
          titulo: "Armazenamento",
          oQue: "Onde os dados da sua empresa estão guardados e o que ainda depende deste navegador.",
          comoCalcula:
            "O que está no servidor sobrevive a troca de máquina, aparece para todos os usuários da empresa e entra em backup. O que está só no navegador se perde ao limpar o cache e não é visto por mais ninguém.",
        }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-h3 text-ink">Onde os seus dados estão</span>
          <StatusBadge tone={est.ativo ? "positive" : "neutral"}>
            {est.ativo ? "Sincronizando com o servidor" : isDemo ? "Demonstração — só neste navegador" : "Sem servidor configurado"}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
          <div className="flex flex-col">
            <span className="text-caption text-faint">No servidor</span>
            <span className="text-[22px] font-semibold tabular-nums text-ink">{est.sincronizadas.length}</span>
            <span className="text-caption text-faint">sobrevivem a troca de máquina</span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-faint inline-flex items-center gap-1">
              Só neste navegador
              <InfoHint
                align="left" titulo="Só neste navegador"
                oQue="Entidades de negócio que ainda não subiram. Se você limpar o cache ou trocar de máquina, elas se perdem — e outro usuário da empresa não as enxerga."
              />
            </span>
            <span
              className="text-[22px] font-semibold tabular-nums"
              style={{ color: est.negocioLocal.length > 0 ? "var(--color-warning)" : "var(--color-positive)" }}
            >
              {est.negocioLocal.length}
            </span>
            <span className="text-caption text-faint">{kb(est.negocioLocal.reduce((s, k) => s + k.bytes, 0))}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-faint">Espaço local usado</span>
            <span
              className="text-[22px] font-semibold tabular-nums"
              style={{ color: alerta ? "var(--color-negative)" : "var(--color-ink)" }}
            >
              {est.pctTeto}%
            </span>
            <span className="text-caption text-faint">{kb(est.bytesLocais)} de ~5 MB</span>
          </div>
        </div>

        {alerta && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md" style={{ background: "var(--color-lime-tint)" }}>
            <Icon name="triangle-alert" size={15} color="var(--color-negative)" />
            <span className="text-caption text-ink max-w-[62ch]">
              O armazenamento do navegador está perto do limite. Quando ele enche, gravações
              começam a falhar — e sem sincronização com o servidor isso significa perder o
              que foi digitado depois.
            </span>
          </div>
        )}

        {est.pendentes.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-label font-medium" style={{ color: "var(--color-warning)" }}>
              {est.pendentes.length} alterações não confirmadas pelo servidor
            </span>
            <span className="text-caption text-faint">{est.pendentes.map(rotuloDaChave).join(", ")}</span>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={sincronizar} disabled={ocupado || !est.ativo} leftIcon={<Icon name="repeat" size={15} />}>
            {ocupado ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
          {msg && <span className="text-caption text-muted">{msg}</span>}
          {!est.ativo && (
            <span className="text-caption text-faint">
              {isDemo ? "Em demonstração não há servidor — nada sai deste navegador, por definição." : "Configure o Supabase para sincronizar."}
            </span>
          )}
        </div>
      </Card>

      {/* ------------------------------ a meta ------------------------------ */}
      <Card className="flex flex-col gap-3"
        info={{
          titulo: "Dependência do navegador",
          oQue: "Quanto dado de negócio ainda depende deste dispositivo para existir.",
          comoCalcula:
            `Soma dos bytes das chaves de negócio presentes no localStorage. A meta é ZERO byte de negócio — e menos de ${kb(META_BYTES_LOCAIS)} no total, que é o tamanho que sobra quando o disco guarda só preferência de tela e cache descartável.`,
        }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-h3 text-ink">Dependência deste navegador</span>
          <StatusBadge tone={est.dentroDaMeta ? "positive" : "warning"}>
            {est.dentroDaMeta ? "Dentro da meta" : `${kb(est.bytesDeNegocio)} de negócio no disco`}
          </StatusBadge>
        </div>
        <p className="m-0 text-caption text-faint max-w-[70ch]">
          A meta é que o navegador guarde apenas preferência de tela e cache que a rede
          reconstitui. Enquanto houver dado de negócio aqui, limpar o cache desta máquina
          significa perder trabalho — e é por isso que o número precisa ser visível, não
          estimado.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="secondary"
            disabled={!est.ativo || est.bytesDeNegocio === 0}
            onClick={() => {
              const r = enxugarLocal();
              atualizar();
              setMsg(r.removidas === 0
                ? "Nada a liberar: o que está no disco ainda não foi confirmado pelo servidor."
                : `${r.removidas} cópias locais removidas · ${kb(r.bytesLiberados)} liberados.`);
            }}
            leftIcon={<Icon name="trash-2" size={15} />}
          >
            Liberar espaço local
          </Button>
          <span className="text-caption text-faint max-w-[52ch]">
            Remove do disco apenas o que o servidor já confirmou nesta sessão; o valor segue
            em memória. Apagar antes da confirmação trocaria &ldquo;só existe no navegador&rdquo; por
            &ldquo;não existe em lugar nenhum&rdquo;.
          </span>
        </div>
      </Card>

      {/* ------------------------- backup e restauração ---------------------- */}
      <Card className="flex flex-col gap-3"
        info={{
          titulo: "Backup e restauração",
          oQue: "Baixar o estado de negócio da organização num arquivo, e devolvê-lo quando preciso.",
          comoCalcula:
            "O arquivo traz apenas as chaves de dado de negócio. Preferência de tela e cache ficam de fora de propósito: restaurá-los sobrescreveria os ajustes da máquina onde a restauração acontece e reintroduziria dados vencidos.",
        }}>
        <span className="text-h3 text-ink">Backup e restauração</span>
        <p className="m-0 text-caption text-faint max-w-[70ch]">
          Um backup que nunca foi restaurado não é backup — é um arquivo. Por isso a
          restauração informa quantos itens entraram, quanto tempo levou e o que foi
          recusado.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={baixarBackup} leftIcon={<Icon name="arrow-down-to-line" size={15} />}>
            Baixar backup
          </Button>
          <Button variant="secondary" onClick={() => inputArquivo.current?.click()}
            leftIcon={<Icon name="upload" size={15} />}>
            Escolher arquivo…
          </Button>
          <input
            ref={inputArquivo} type="file" accept="application/json,.json"
            className="hidden" onChange={escolherArquivo}
            aria-label="Arquivo de backup para restaurar"
          />
        </div>

        {erroArquivo && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md" style={{ background: "var(--color-surface-2)" }}>
            <Icon name="triangle-alert" size={15} color="var(--color-negative)" />
            <span className="text-caption text-ink max-w-[62ch]">{erroArquivo}</span>
          </div>
        )}

        {backup && (
          <div className="flex flex-col gap-2 px-3 py-3 rounded-md" style={{ background: "var(--color-surface-2)" }}>
            <span className="text-label text-ink">
              {backup.arquivo} · {Object.keys(backup.dados.chaves).length} itens · gerado em{" "}
              {backup.dados.geradoEm.slice(0, 10).split("-").reverse().join("/")}
            </span>
            <span className="text-caption text-faint max-w-[70ch]">
              {Object.keys(backup.dados.chaves).slice(0, 8).map(rotuloDaChave).join(" · ")}
              {Object.keys(backup.dados.chaves).length > 8 ? " …" : ""}
            </span>
            <AcaoDestrutiva
              rotulo="Restaurar backup"
              titulo="Restaurar este backup?"
              descricao={`Os ${Object.keys(backup.dados.chaves).length} itens do arquivo substituem o que está no sistema hoje. O estado atual é guardado antes, e o desfazer o devolve.`}
              confirmarRotulo="Restaurar"
              onConfirmar={restaurar}
            />
          </div>
        )}
      </Card>

      {est.negocioLocal.length > 0 && (
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-border-soft">
            <span className="text-label font-medium text-muted">Ainda só neste navegador</span>
            <p className="m-0 mt-1 text-caption text-faint max-w-[70ch]">
              Estes dados são de negócio e ainda não subiram. A migração para o servidor
              acontece por etapas; até lá, evite limpar os dados do navegador nesta máquina.
            </p>
          </div>
          {est.negocioLocal.map((k, i) => (
            <div key={k.chave} className={`flex items-center gap-3 px-5 py-2 ${i ? "border-t border-border-soft" : ""}`}>
              <Icon name="triangle-alert" size={14} color="var(--color-warning)" />
              <span className="flex-1 min-w-0 truncate text-[15px] text-ink">{rotuloDaChave(k.chave)}</span>
              <span className="text-caption text-faint tabular-nums shrink-0">{kb(k.bytes)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* --------------------------- cache que vence ------------------------- */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-label font-medium text-muted">Cache deste dispositivo</span>
          <span className="text-caption text-faint tabular-nums">{kb(bytesCache)}</span>
        </div>
        <p className="m-0 text-caption text-faint max-w-[70ch]">
          Respostas de consultas públicas copiadas para não repetir a chamada. Perdê-las
          custa uma requisição, não trabalho — mas elas VENCEM, e a entrada vencida que
          ninguém remove ocupa a mesma cota de que os dados de verdade precisam.
        </p>
        <div className="flex flex-col gap-1">
          {CACHES_LOCAIS.map((c) => {
            const presente = est.caches.find((x) => x.chave === c.chave);
            return (
              <div key={c.chave} className="flex items-center gap-3">
                <span className="flex-1 min-w-0 truncate text-caption text-ink">
                  {c.origem} <span className="text-placeholder">· vale {c.ttlDias} dias</span>
                </span>
                <span className="text-caption text-faint tabular-nums shrink-0">
                  {presente ? kb(presente.bytes) : "vazio"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="secondary" disabled={bytesCache === 0}
            onClick={() => {
              const r = expurgarCaches();
              atualizar();
              setMsg(r.removidas === 0
                ? "Nenhuma entrada de cache está vencida."
                : `${r.removidas} entradas vencidas removidas · ${kb(r.bytesLiberados)} liberados.`);
            }}
            leftIcon={<Icon name="trash-2" size={15} />}
          >
            Expurgar cache vencido
          </Button>
          <span className="text-caption text-faint">O expurgo também roda sozinho a cada sessão.</span>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Preferências deste dispositivo</span>
        <p className="m-0 text-caption text-faint max-w-[70ch]">
          Tema, largura do menu, widgets da Home e progresso dos tours continuam no
          navegador de propósito: são ajustes de exibição, não dados. Perdê-los ao trocar
          de máquina custa um reajuste de tela, não trabalho.
          <span className="text-placeholder"> ({PREFERENCIAS_LOCAIS.length} chaves)</span>
        </p>
      </Card>

      {est.naoClassificadas.length > 0 && (
        <Card className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">Ainda sem classificação</span>
          <p className="m-0 text-caption text-faint max-w-[70ch]">
            Chaves que não estão nem na lista de dados de negócio nem na de preferências.
            Aparecem aqui para que a decisão seja tomada, e não esquecida.
          </p>
          <span className="text-caption text-placeholder break-words">
            {est.naoClassificadas.map((k) => k.chave).join(", ")}
          </span>
        </Card>
      )}
    </div>
  );
}
