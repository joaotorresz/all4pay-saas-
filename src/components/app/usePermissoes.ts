"use client";

/**
 * O que EU posso fazer nesta empresa — perguntado ao SERVIDOR.
 *
 * ⚠️ O hook não calcula permissão nenhuma: ele repete o que
 * `minhas_permissoes()` respondeu. É a diferença entre papel aplicado e papel
 * desenhado — se a tela guardasse a própria cópia da matriz, ela divergiria do
 * banco no primeiro ajuste, e a divergência apareceria como um botão que existe
 * e não funciona, ou como um botão que some para quem tinha direito.
 *
 * E ele NÃO é a autorização: a autorização são as políticas de linha e os
 * gatilhos. Esconder um botão evita o clique inútil; quem impede a escrita é o
 * banco.
 */
import * as React from "react";
import { carregarPermissoes, type MinhasPermissoes } from "@/lib/seguranca";
import type { Acao, Papel } from "@/core/seguranca";

/** Cache de sessão: o papel não muda entre duas navegações. */
let cache: MinhasPermissoes | null = null;
let emVoo: Promise<MinhasPermissoes> | null = null;

function carregar(): Promise<MinhasPermissoes> {
  if (cache) return Promise.resolve(cache);
  // Dedup: quinze componentes montando ao mesmo tempo fariam quinze consultas
  // idênticas na primeira pintura.
  emVoo ??= carregarPermissoes().then((p) => { cache = p; emVoo = null; return p; });
  return emVoo;
}

export interface EstadoPermissoes {
  papel: Papel | null;
  acoes: string[];
  carregando: boolean;
  /** `true` enquanto o servidor não respondeu, ou quando ele não existe. */
  presumido: boolean;
  pode: (a: Acao) => boolean;
}

export function usePermissoes(): EstadoPermissoes {
  const [estado, setEstado] = React.useState<MinhasPermissoes | null>(cache);
  React.useEffect(() => {
    let vivo = true;
    carregar().then((p) => { if (vivo) setEstado(p); });
    return () => { vivo = false; };
  }, []);

  return React.useMemo(() => {
    const acoes = estado?.acoes ?? [];
    return {
      papel: estado?.papel ?? null,
      acoes,
      carregando: estado === null,
      presumido: estado?.presumido ?? true,
      // ⚠️ Enquanto carrega, a resposta é NÃO. Um botão que aparece e some ao
      // chegar a resposta é pior que um botão que aparece um instante depois:
      // o primeiro pode ser clicado no meio do caminho.
      pode: (a: Acao) => acoes.includes(a),
    };
  }, [estado]);
}
