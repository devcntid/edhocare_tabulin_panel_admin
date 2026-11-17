import { Halaman404 } from "@/components/halaman-404";

export const metadata = { title: "Halaman tidak ditemukan · Tabulin Admin" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Halaman404 />
    </main>
  );
}
