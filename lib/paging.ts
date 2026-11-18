// Pagination constants shared by server and client code (no server-only imports here).
export const PAGE_SIZE = 15;
/** Rows-per-page choices of every paginated list; anything else falls back to PAGE_SIZE. */
export const PER_HALAMAN = [10, 15, 25, 50] as const;
export const perValid = (n?: number): number => ((PER_HALAMAN as readonly number[]).includes(n ?? 0) ? (n as number) : PAGE_SIZE);
