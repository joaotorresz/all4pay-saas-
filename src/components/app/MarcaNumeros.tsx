"use client";

import { useEffect } from "react";
import { ehNumero } from "@/core/tipografia/numero";

/**
 * Marca com `data-num` todo elemento cujo texto é SÓ um número (regra em
 * `core/tipografia/numero`), e o `globals.css` o pinta em Agrandir. Existe
 * porque o número sem classe (o `<span>` de uma contagem, o eixo de um
 * gráfico, a data de uma lista) não tem como ser alcançado por regra de papel.
 *
 * ⚠️ Atributo, não classe: o React reescreve `className` a cada renderização e
 * apagaria a marca; um atributo que ele não conhece fica onde está. Quando o
 * texto deixa de ser número a marca sai — o observador revê o elemento a cada
 * mudança de texto.
 */
function rever(el: Element) {
  if (el.closest("input, textarea, [contenteditable='true'], script, style")) return;
  // ⚠️ Um bloco que mistura número e texto no MESMO papel (o cartão da Receita:
  // razão social, CNPJ, data, ramo) pede UMA fonte; marcar só o que é número
  // deixava cada linha num padrão (pedido do dono, 27/10/2026).
  if (el.closest("[data-sem-num]")) {
    if (el.hasAttribute("data-num")) el.removeAttribute("data-num");
    return;
  }
  const soTexto = el.childElementCount === 0;
  const numero = soTexto && ehNumero(el.textContent ?? "");
  if (numero) {
    if (!el.hasAttribute("data-num")) el.setAttribute("data-num", "");
  } else if (el.hasAttribute("data-num")) {
    el.removeAttribute("data-num");
  }
}

function varrer(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) {
    if (raiz.parentElement) rever(raiz.parentElement);
    return;
  }
  if (!(raiz instanceof Element)) return;
  rever(raiz);
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT);
  let n: Node | null;
  while ((n = w.nextNode())) rever(n as Element);
}

export function MarcaNumeros() {
  useEffect(() => {
    const pendentes = new Set<Node>();
    let quadro = 0;
    const processar = () => {
      quadro = 0;
      pendentes.forEach((n) => { if (n.isConnected) varrer(n); });
      pendentes.clear();
    };
    const obs = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === "characterData") pendentes.add(m.target);
        else {
          if (m.target.nodeType === Node.ELEMENT_NODE) pendentes.add(m.target);
          m.addedNodes.forEach((n) => pendentes.add(n));
        }
      }
      if (!quadro) quadro = requestAnimationFrame(processar);
    });
    varrer(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);
  return null;
}
