import { redirect } from "next/navigation";

/** Instruksi now live inside each payment method; this keeps old links and bookmarks working. */
export default function Page() {
  redirect("/pembayaran");
}
