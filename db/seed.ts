import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { Client } from "pg";

config({ path: ".env.local" });
config();

// Fictional demo data (personas from the mockup, docs/05 §8). Idempotent: skips if registrations exist.
const DAY = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY + 7 * 3600000).toISOString().slice(0, 10);

type Persona = {
  nama: string; rm: string; hp: string; faskes: string; kelas: string; cara: string;
  hphtAgo: number; cicilan?: number;
  alur: "menunggu" | "ditolak" | "kedaluwarsa" | "va" | "aktif" | "selesai";
  setoran?: number[]; // nominal list; first covers the DP bill
};

const PERSONAS: Persona[] = [
  { nama: "Putri Lestari", rm: "00-99-02", hp: "081200000002", faskes: "BDG", kelas: "Kelas 2", cara: "Caesar Konvensional", hphtAgo: 50, alur: "menunggu" },
  { nama: "Lina Marlina", rm: "00-99-03", hp: "081200000003", faskes: "BDG", kelas: "Kelas 3", cara: "Partus Normal", hphtAgo: 60, alur: "ditolak" },
  { nama: "Maya Anggraini", rm: "00-99-04", hp: "081200000004", faskes: "CJR", kelas: "Kelas 1", cara: "Caesar ERACS", hphtAgo: 55, alur: "kedaluwarsa" },
  { nama: "Rani Wulandari", rm: "00-99-05", hp: "081200000005", faskes: "BDG", kelas: "VIP C", cara: "Partus Normal", hphtAgo: 65, alur: "va" },
  { nama: "Ayu Pratiwi", rm: "00-99-06", hp: "081200000006", faskes: "BDG", kelas: "Kelas 1", cara: "Caesar Konvensional", hphtAgo: 70, alur: "aktif", setoran: [7000000] },
  { nama: "Dewi Kartika", rm: "00-99-07", hp: "081200000007", faskes: "CJR", kelas: "VIP B", cara: "Caesar ERACS", hphtAgo: 75, cicilan: 8, alur: "aktif", setoran: [9400000] },
  { nama: "Nina Safitri", rm: "00-99-08", hp: "081200000008", faskes: "BDG", kelas: "Suite", cara: "Caesar Konvensional", hphtAgo: 90, alur: "aktif", setoran: [10800000, 5000000, 5000000, 5000000] },
  { nama: "Sari Dewanti", rm: "00-99-09", hp: "081200000009", faskes: "BDG", kelas: "Kelas 3", cara: "Partus Normal", hphtAgo: 200, alur: "selesai", setoran: [2300000, 1000000, 1000000, 2000000, 2000000, 1600000, 1600000] },
];

const PASIEN_TAMBAHAN = [
  ["00-99-10", "Citra Maharani", "081200000010"],
  ["00-99-11", "Fitri Handayani", "081200000011"],
  ["00-99-12", "Rina Susanti", "081200000012"],
  ["00-99-13", "Wulan Purnama", "081200000013"],
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new Client({ connectionString: url, options: "-c timezone=Asia/Jakarta" });
  await db.connect();
  try {
    const pw = process.env.SEED_ADMIN_PASSWORD;
    if (!pw || pw.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be set (min 10 chars)");
    const hash = await bcrypt.hash(pw, 10);
    const email = process.env.SEED_ADMIN_EMAIL ?? "admin@tabulin.local";
    const [local, domain] = email.split("@");
    const admins = [
      [email, process.env.SEED_ADMIN_NAME ?? "Admin Sistem", "super_admin"],
      [`${local}.program@${domain}`, "Admin Program", "admin_program"],
      [`${local}.keuangan@${domain}`, "Staf Keuangan", "keuangan"],
    ];
    for (const [e, n, r] of admins) {
      await db.query(
        `INSERT INTO pengguna_admin (email, nama, peran, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
        [e, n, r, hash],
      );
    }
    const adminId = (await db.query("SELECT id FROM pengguna_admin WHERE email = $1", [email])).rows[0].id as number;

    // Patient master data (the real source will be the hospital API). Extra patients without registrations let the registration form be tried.
    for (const [rm, nama, hp] of [...PERSONAS.map((p) => [p.rm, p.nama, p.hp]), ...PASIEN_TAMBAHAN]) {
      await db.query("INSERT INTO pasien (no_rm, nama, no_hp) VALUES ($1,$2,$3) ON CONFLICT (no_rm) DO NOTHING", [rm, nama, hp]);
    }

    if ((await db.query("SELECT 1 FROM pendaftaran LIMIT 1")).rowCount) {
      console.log("registrations already exist; skipping demo data");
      return;
    }

    for (const p of PERSONAS) {
      const faskesRow = (await db.query("SELECT id FROM faskes WHERE kode = $1", [p.faskes])).rows[0];
      const pk = (await db.query(
        "SELECT id, setoran_min_bulanan, tarif_paket($3, cara_persalinan, kelas_kamar) AS tarif_total FROM paket WHERE kelas_kamar = $1 AND cara_persalinan = $2", [p.kelas, p.cara, faskesRow.id])).rows[0];
      const tarif = Number(pk.tarif_total);
      const dp = Math.round(tarif * 0.2);
      const n = p.cicilan ?? 6;
      const faskesId = (await db.query("SELECT id FROM faskes WHERE kode = $1", [p.faskes])).rows[0].id;
      const hpht = iso(-p.hphtAgo);
      const ins = await db.query(
        `INSERT INTO pendaftaran (nama, no_rm, no_hp, faskes_id, paket_id, jumlah_cicilan, hpht, tanggal_milestone, perkiraan_hpl,
                                  tarif_total, dp, target_50, setoran_min_bulanan, dibuat_pada)
         VALUES ($1,$2,$3,$4,$5,$6,$7::date,$7::date+196,$7::date+280,$8::bigint,$9::bigint,round($8::bigint*0.5),$10::bigint, now() - ($11::int * interval '1 day'))
         RETURNING id`,
        [p.nama, p.rm, p.hp, faskesId, pk.id, n, hpht, tarif, dp, pk.setoran_min_bulanan, p.hphtAgo - 10],
      );
      const id = ins.rows[0].id as number;
      if (p.alur === "menunggu") continue;
      if (p.alur === "ditolak") { await db.query("SELECT tolak_pendaftaran($1,$2,$3)", [id, "No. RM tidak ditemukan. Silakan hubungi PMO.", adminId]); continue; }
      if (p.alur === "kedaluwarsa") { await db.query("SELECT kedaluwarsakan_pendaftaran($1,$2)", [id, adminId]); continue; }
      await db.query("SELECT setujui_pendaftaran($1,$2)", [id, adminId]);
      if (p.alur === "va") continue;
      await db.query("SELECT pasang_va($1,NULL,$2)", [id, adminId]);
      const dpBill = (await db.query("SELECT id, nominal FROM tagihan WHERE pendaftaran_id = $1 AND jenis = 'dp'", [id])).rows[0];
      const list = p.setoran ?? [];
      for (let i = 0; i < list.length; i++) {
        const daysAgo = (list.length - i) * 26 + 1 + (id % 5);
        await db.query("SELECT konfirmasi_setoran($1, $2::date, $3, $4, $5)", [
          id, iso(-daysAgo), list[i], i === 0 && list[i] >= dpBill.nominal ? dpBill.id : null, adminId,
        ]);
      }
      if (p.alur === "aktif") await db.query("SELECT terbitkan_cicilan($1,$2)", [id, adminId]); // first installment, unpaid
      if (p.alur === "selesai") await db.query("SELECT tandai_selesai($1,$2)", [id, adminId]);
    }
    console.log(`seeded ${admins.length} admin users and ${PERSONAS.length} demo registrations`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
