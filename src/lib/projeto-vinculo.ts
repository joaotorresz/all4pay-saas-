"use client";
import { lerPreferencia } from "@/lib/store-org";

/**
 * O vínculo ANTIGO lançamento → projeto, que morava no navegador
 * (`a4p_movimento_projeto`). SÓ LEITURA, e só a demonstração o consulta.
 *
 * ⚠️ **A morada do projeto de um lançamento é `movements.project_id`** (desde
 * 30/09/2026 também em demonstração: o dataset guarda `project_id` no próprio
 * movimento — `lib/data.definirProjetoDoMovimento`). Este mapa guardava o id
 * NUMÉRICO do cadastro antigo ("5001"): nenhum relatório de outra máquina o
 * via, e em produção nunca casou com um UUID. Ele fica apenas como QUEDA de
 * leitura para os lançamentos de demonstração vinculados antes da troca.
 *
 * ⚠️ Não há escritor aqui, de propósito — e a guarda `CAD` cobra isso. Um
 * `vincularProjeto` vivo seria a segunda morada do mesmo fato.
 *
 * A leitura é do NAVEGADOR (não do servidor): a chave nunca foi gravada por
 * `store-org`, então não há cópia em `org_state` a consultar, e ler por
 * `store-org` faria a hidratação trazer um mapa que nenhum escritor mantém.
 */
const CHAVE = "a4p_movimento_projeto";

type Mapa = Record<string, string>;

export const vinculosProjeto = (): Mapa => lerPreferencia<Mapa>(CHAVE, {});
