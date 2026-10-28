"use client";

/**
 * "Voltar ao cadastro" das páginas públicas (termos e privacidade).
 *
 * ⚠️ A conversa de /criar-conta abre os termos numa ABA NOVA, e a conversa só
 * existe na aba de origem: levar a pessoa para um endereço de cadastro a faria
 * começar outro, do zero (pedido do dono, 27/10/2026 — o link levava ao
 * cadastro antigo de sete passos). Então: aba aberta pelo cadastro → fecha e a
 * pessoa volta à conversa; aba com histórico → volta uma página; nenhum dos
 * dois → /criar-conta.
 */
export function VoltarAoCadastro() {
  const voltar = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === "undefined") return;
    if (window.history.length <= 1) {
      e.preventDefault();
      window.close();
      // se o navegador não deixar fechar, segue o link
      setTimeout(() => { window.location.href = "/criar-conta"; }, 150);
      return;
    }
    e.preventDefault();
    window.history.back();
  };
  return (
    <a href="/criar-conta" onClick={voltar} className="text-label text-muted hover:text-ink underline">
      Voltar ao cadastro
    </a>
  );
}
