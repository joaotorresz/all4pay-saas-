import Link from "next/link";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { MARCA } from "@/core/marca";

export const metadata = { title: `Privacidade · ${MARCA}` };

/**
 * POLÍTICA DE PRIVACIDADE — minuta factual para o beta.
 *
 * ⚠️ Um sistema que guarda dado financeiro de terceiros e abre cadastro ao
 * público precisa dizer o que coleta e onde guarda ANTES da divulgação ampla
 * (LGPD). Esta página é uma MINUTA: tudo o que ela afirma foi conferido contra
 * o que o sistema de fato faz — nada aqui é promessa genérica de template — mas
 * ela deve passar por revisão jurídica antes do lançamento amplo, e diz isso.
 *
 * O que NÃO se inventou de propósito: encarregado (DPO), CNPJ do operador e
 * endereço — são fatos do dono do produto, não meus. Estão marcados no texto
 * como pendentes, visíveis, para não saírem errados por omissão silenciosa.
 */
export default function Privacidade() {
  return (
    <MolduraPublica>
      <main className="flex flex-col items-center px-4 py-12">
      <article className="w-full max-w-2xl flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <span className="text-caption uppercase tracking-[0.08em] text-faint">{MARCA}</span>
          <h1 className="m-0 text-h2 text-ink">Privacidade e proteção de dados</h1>
          <p className="m-0 text-caption text-faint">
            Versão beta deste documento · atualizada em 05/08/2026 · sujeita a revisão
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-h3 text-ink">O que coletamos</h2>
          <p className="m-0 text-body text-muted">
            Ao usar o {MARCA}, você nos confia três tipos de dado: os <strong className="text-ink">dados da sua
            conta</strong> (e-mail e senha), os <strong className="text-ink">dados da sua empresa</strong> (razão
            social, CNPJ, perfil e estrutura, preenchidos no cadastro) e os{" "}
            <strong className="text-ink">dados financeiros</strong> que você importa ou lança — movimentações,
            contas, clientes e fornecedores, orçamentos e fechamentos.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-h3 text-ink">Onde ficam e quem processa</h2>
          <p className="m-0 text-body text-muted">
            Os dados são armazenados em banco gerenciado pela Supabase, em servidores na
            região de São Paulo (sa-east-1), isolados por empresa: cada organização só
            enxerga os próprios dados, e esse isolamento é verificado por teste executável
            dentro do próprio sistema. A aplicação é servida pela Vercel. Quando os
            recursos de inteligência artificial estão ativos, trechos dos seus números são
            enviados à Anthropic exclusivamente para gerar a resposta solicitada — não são
            usados para treinar modelos.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-h3 text-ink">O que não fazemos</h2>
          <p className="m-0 text-body text-muted">
            Não vendemos os seus dados, não os compartilhamos para publicidade e não os
            usamos para outra finalidade que não a operação do próprio sistema. Toda
            alteração relevante fica registrada em trilha de auditoria com autor e data.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-h3 text-ink">Seus direitos (LGPD)</h2>
          <p className="m-0 text-body text-muted">
            Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados a
            qualquer momento. O sistema já oferece exportação do estado da sua organização
            em Administração → Armazenamento; a exclusão da conta apaga a organização e os
            dados vinculados a ela.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-h3 text-ink">Contato</h2>
          <p className="m-0 text-body text-muted">
            Dúvidas sobre estes termos ou sobre os seus dados: fale com o suporte pelo
            canal indicado na Central de ajuda. <em>(Encarregado de dados e razão social do
            operador serão publicados nesta página antes da saída do beta.)</em>
          </p>
        </section>

        <footer className="pt-2 border-t border-border-soft">
          <Link href="/comecar" className="text-label text-muted hover:text-ink underline">
            Voltar ao cadastro
          </Link>
        </footer>
      </article>
      </main>
    </MolduraPublica>
  );
}
