import { appHandler, bodyJson } from "@/lib/app-api";
import { simulasiApp } from "@/lib/services/app";

export const POST = appHandler(async (req) => ({ body: await simulasiApp(await bodyJson(req)) }));
