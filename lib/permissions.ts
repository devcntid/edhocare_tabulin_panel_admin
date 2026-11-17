export type Peran = "super_admin" | "admin_program" | "keuangan";

export type Aksi =
  | "lihat"
  | "verifikasi"      // setujui / tolak / kedaluwarsa, manual registration
  | "keuangan"        // pasang VA, tagihan, setoran, koreksi, selesai
  | "kelola_pengguna"
  | "kelola_paket";

const MATRIX: Record<Aksi, Peran[]> = {
  lihat: ["super_admin", "admin_program", "keuangan"],
  verifikasi: ["super_admin", "admin_program"],
  keuangan: ["super_admin", "keuangan"],
  kelola_pengguna: ["super_admin"],
  kelola_paket: ["super_admin"],
};

export const can = (peran: Peran, aksi: Aksi) => MATRIX[aksi].includes(peran);

export const PERAN_LABEL: Record<Peran, string> = {
  super_admin: "Super Admin",
  admin_program: "Admin Program",
  keuangan: "Keuangan",
};
