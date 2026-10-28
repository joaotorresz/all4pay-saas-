import { NextResponse } from "next/server";
import { recusaDeCron } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { rodarLembretesReais } from "@/lib/cadastro-lembretes-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Os lembretes de quem parou no cadastro (etapa 5 do plano "documentos e funil
 * do cadastro"). A execução diária vai junto com o runner das automações
 * (`/api/financial-os/run`, a vaga de cron que já existe); esta rota é a porta
 * MANUAL, com a mesma credencial de cron.
 *
 * `?dryRun=1` — a prova de carga: diz quantos sairiam e para quem (mascarado),
 * sem reservar nem enviar. Desligado (`CADASTRO_LEMBRETES` ≠ `ligado`), toda
 * chamada é prova de carga.
 */
export async function GET(req: Request) {
  const recusa = recusaDeCron(req);
  if (recusa) return NextResponse.json({ ok: false, reason: recusa.motivo }, { status: recusa.status });
  const admin = createAdmin();
  if (!admin) return NextResponse.json({ ok: false, motivo: "chave de serviço ausente: sem ela não há como ler as jornadas" }, { status: 503 });
  const url = new URL(req.url);
  const rel = await rodarLembretesReais(admin, url.origin, url.searchParams.get("dryRun") === "1");
  return NextResponse.json({ ok: !rel.erro, ...rel }, { status: rel.erro ? 500 : 200 });
}
