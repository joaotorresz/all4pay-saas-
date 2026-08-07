/**
 * Persistência do Editor de design num ARQUIVO JSON (design-edits.json na raiz).
 * O editor visual faz auto-save (POST) a cada alteração e hidrata na carga (GET).
 *
 * Observação de ambiente: grava no filesystem do servidor — funciona em dev/
 * local (FS gravável). Em serverless somente-leitura (ex.: Vercel) a escrita
 * falha graciosamente (ok:false) e o editor mantém tudo no navegador + Exportar.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const FILE = path.join(process.cwd(), "design-edits.json");

export async function GET() {
  try {
    const txt = await fs.readFile(FILE, "utf8");
    return NextResponse.json({ ok: true, data: JSON.parse(txt) });
  } catch {
    return NextResponse.json({ ok: false, data: null });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await fs.writeFile(FILE, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ ok: true, path: "design-edits.json" });
  } catch (e) {
    // FS somente-leitura (serverless) ou outro erro — o cliente cai no localStorage.
    return NextResponse.json({ ok: false, reason: (e as Error).message });
  }
}
