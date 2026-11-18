// E2E の手伝い：E2E の DB のメモを空にする・入れる（テストの始めに、決まった状態にするため）。
import pg from "pg";
import { E2E_DATABASE_URL } from "../env.ts";

/**
 * E2E の DB に1度つないで、処理を流す。
 * @param run 流す処理
 * @returns 処理の結果
 */
async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * メモをすべて消し、渡したメモを入れる（題は仮のもの）。
 * @param titles 入れるメモの題（なければ空にするだけ）
 */
export async function resetNotes(titles: readonly string[] = []): Promise<void> {
  await withClient(async (client) => {
    await client.query("TRUNCATE note");
    for (const title of titles) {
      await client.query("INSERT INTO note (title, body) VALUES ($1, $2)", [title, "見本の本文"]);
    }
  });
}
