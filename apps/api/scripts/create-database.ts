// DATABASE_URL の DB がなければ作る（db:migrate の前に流す）。
import { databaseNameOf, ensureDatabase } from "./lib/database.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL を .env に入れてください（見本は .env.example）。");
  process.exit(1);
}

const created = await ensureDatabase(databaseUrl);
const name = databaseNameOf(databaseUrl);
console.log(created ? `DB「${name}」を作りました。` : `DB「${name}」はもうあります。`);
