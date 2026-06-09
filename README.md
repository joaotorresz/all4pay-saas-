# all4pay

ERP + sistema de gestão financeira, construído sobre o **Design System all4pay**.

> 🎨 **Leia o [`CLAUDE.md`](./CLAUDE.md) antes de codar qualquer UI.** O design
> system é a **única fonte de verdade visual** — toda tela e componente DEVE
> usar seus tokens e componentes. Nunca introduza cores, fontes ou estilos fora
> dele.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com) — tokens em `tailwind.config.ts`
- [Supabase](https://supabase.com) — clientes em `src/lib/supabase/`

## Começando

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do seu projeto Supabase
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) — a tela inicial é o
**dashboard de Tesouraria**, uma recriação de alta fidelidade montada inteiramente
a partir dos primitivos do design system.

## Estrutura

```
src/
├── app/                 # App Router (layout, página, globals.css)
├── components/
│   ├── ui/              # ★ primitivos do Design System (a única fonte)
│   └── dashboard/       # composição de referência (Tesouraria)
└── lib/
    ├── supabase/        # clientes browser + server
    └── utils.ts         # helper cn()
```

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`) |
| `npm run lint` | Lint (`next lint`) |

## Design System

Monocromático ao extremo + um único acento lima, com **o valor monetário como
herói**. Fundamentos em [`CLAUDE.md`](./CLAUDE.md). Tokens (cores, tipografia,
espaçamentos, raios, sombras) em `tailwind.config.ts`, espelhados como variáveis
CSS em `src/app/globals.css`.
