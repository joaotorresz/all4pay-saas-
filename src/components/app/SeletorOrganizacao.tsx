"use client";

/**
 * QUAL EMPRESA ESTÁ ABERTA — e como trocar.
 *
 * ⚠️ Antes desta onda a pergunta não tinha resposta na interface porque não
 * tinha resposta no banco: `auth_org_id()` devolvia a organização MAIS ANTIGA
 * do usuário, e era ela que toda política de linha usava. Quem entrasse numa
 * segunda empresa continuava vendo a primeira — sem escolha, sem aviso, e sem
 * jeito de perceber que estava lendo os números da empresa errada.
 *
 * Por isso o seletor não é conveniência: num produto que mostra saldo, o rótulo
 * de QUAL empresa é tão importante quanto o número. Ele aparece mesmo quando há
 * uma empresa só — sumir nesse caso deixaria a tela ambígua justamente para
 * quem acabou de ser adicionado à segunda.
 */
import * as React from "react";
import { Icon } from "@/components/ui";
import { listarMinhasOrganizacoes, trocarOrganizacao, type OrganizacaoDoUsuario } from "@/lib/seguranca";
import { nomeDoPapel } from "@/core/seguranca";
import { cn } from "@/lib/utils";

/**
 * `variante`:
 * - `rodape` — o formato original, no rodapé claro da Sidebar; o painel abre
 *   para CIMA, porque ali não há espaço abaixo.
 * - `chrome` — na barra escura de navegação; o painel abre para BAIXO. Abrir
 *   para cima aqui jogaria a lista para fora da janela.
 */
export function SeletorOrganizacao({
  collapsed = false,
  variante = "rodape",
}: { collapsed?: boolean; variante?: "rodape" | "chrome" }) {
  const noChrome = variante === "chrome";
  const [orgs, setOrgs] = React.useState<OrganizacaoDoUsuario[] | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [trocando, setTrocando] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const caixa = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { void listarMinhasOrganizacoes().then(setOrgs); }, []);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const ativa = orgs?.find((o) => o.ativa) ?? orgs?.[0] ?? null;
  if (!orgs || orgs.length === 0 || !ativa) return null;

  async function trocar(o: OrganizacaoDoUsuario) {
    if (o.ativa) { setAberto(false); return; }
    setTrocando(o.orgId); setErro(null);
    try {
      // A página recarrega no sucesso — ver a nota em `trocarOrganizacao`.
      await trocarOrganizacao(o.orgId);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível trocar de empresa.");
    } finally {
      setTrocando(null);
    }
  }

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`Empresa aberta: ${ativa.nome}. Trocar de empresa.`}
        title={`${ativa.nome} · ${nomeDoPapel(ativa.papel)}`}
        className={cn(
          "flex items-center transition-colors",
          noChrome
            ? "h-8 gap-2 px-3 rounded-pill"
            : "w-full rounded-md py-2 hover:bg-surface-1",
          !noChrome && (collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]"),
        )}
        style={noChrome ? { background: "var(--a4p-chrome-field)", color: "var(--a4p-chrome-ink)" } : undefined}
      >
        <Icon name="building" size={noChrome ? 15 : 18} color={noChrome ? "currentColor" : "var(--color-text-secondary)"} />
        {noChrome ? (
          <>
            <span className="text-[13px] font-medium truncate max-w-[160px]">{ativa.nome}</span>
            <Icon name="chevrons-up-down" size={13} color="var(--a4p-chrome-mut)" className="shrink-0" />
          </>
        ) : (
          !collapsed && (
            <>
              <span className="min-w-0 flex flex-col items-start">
                <span className="text-[15px] font-medium text-ink truncate max-w-[150px]">{ativa.nome}</span>
                <span className="text-[11px] text-faint">{nomeDoPapel(ativa.papel)}</span>
              </span>
              <Icon name="chevrons-up-down" size={14} color="var(--color-text-tertiary)" className="ml-auto shrink-0" />
            </>
          )
        )}
      </button>

      {aberto && (
        <div
          role="listbox"
          className={cn(
            "absolute w-[260px] max-h-[320px] overflow-y-auto rounded-card p-1 z-[60] bg-glass-strong shadow-popover",
            // Na barra escura ele abre para BAIXO e ancora à direita; para cima
            // sairia da janela, e à esquerda passaria por cima das abas.
            noChrome ? "top-full right-0 mt-2" : "bottom-full left-0 mb-2",
          )}
        >
          {orgs.map((o) => (
            <button
              key={o.orgId}
              role="option"
              aria-selected={o.ativa}
              onClick={() => trocar(o)}
              disabled={!!trocando}
              className={cn(
                "flex items-center gap-2 w-full text-left rounded-md px-[10px] py-2 transition-colors hover:bg-surface-1",
                o.ativa && "bg-surface-1",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink truncate">{o.nome}</span>
                <span className="block text-[11px] text-faint">{nomeDoPapel(o.papel)}</span>
              </span>
              {o.ativa && <Icon name="check" size={14} color="var(--color-positive)" />}
              {trocando === o.orgId && <span className="text-[11px] text-faint">trocando…</span>}
            </button>
          ))}
          {erro && <p className="m-0 px-[10px] py-2 text-caption" style={{ color: "var(--color-negative)" }}>{erro}</p>}
          {orgs.length === 1 && (
            <p className="m-0 px-[10px] py-2 text-caption text-faint">
              Você participa de uma empresa. Ao ser adicionado a outra, ela aparece aqui.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
