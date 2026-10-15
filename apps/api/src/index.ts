import "dotenv/config";
import { buildApp } from "./app.js";
import { db } from "../../../packages/server/db.js";
import { validateConfig } from "../../../packages/server/config.js";
validateConfig();
const app = buildApp();
await app.listen({
  host: "0.0.0.0",
  port: Number(process.env.API_PORT ?? 4000),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
