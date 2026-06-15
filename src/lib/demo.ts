/**
 * Global demonstration flag.
 *
 * When `isDemo` is true, the data hooks return deterministic seed data
 * (and the UI shows a "Demonstração" badge) instead of querying Supabase.
 *
 * Demo is **opt-in**: it is true ONLY when `NEXT_PUBLIC_ALL4PAY_DEMO` is
 * exactly "true". Any other case — absent, empty, "false", any string —
 * resolves to **live**. The safe state (live, que persiste de verdade) is the
 * default; "fail safe", não "fail demo".
 *
 * Rationale: antes, a AUSÊNCIA da var caía em demo e gravava no localStorage em
 * silêncio — produção rodou em demo por dias sem ninguém perceber. Demo agora
 * exige ser ligada de propósito.
 */
export const isDemo: boolean = process.env.NEXT_PUBLIC_ALL4PAY_DEMO === "true";

// Salvaguarda: se a demo ligar COM o Supabase configurado, faz barulho no boot
// (o oposto do silêncio que causou o incidente) — provável engano de ambiente.
if (isDemo && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("[all4pay] MODO DEMO ativo com Supabase configurado — confirme se isto é intencional.");
}
