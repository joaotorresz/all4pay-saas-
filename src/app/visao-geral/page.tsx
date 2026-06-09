import { redirect } from "next/navigation";

/** The overview now lives on "Início" (/). Keep old links working. */
export default function VisaoGeralPage() {
  redirect("/");
}
