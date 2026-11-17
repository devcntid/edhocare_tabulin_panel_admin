import { appHandler } from "@/lib/app-api";
import { program } from "@/lib/services/app";

export const GET = appHandler(async () => ({ body: await program() }));
