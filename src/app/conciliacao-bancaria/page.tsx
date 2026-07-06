import { redirect } from "next/navigation";

// A conciliação foi unificada na aba "Conciliar" do Upload de dados (Open
// Finance × títulos previstos, com baixa e IA) — a visão IULI×OFX paralela
// duplicava a função e foi aposentada.
export default function ConciliacaoBancariaPage() {
  redirect("/upload?aba=conciliar");
}
