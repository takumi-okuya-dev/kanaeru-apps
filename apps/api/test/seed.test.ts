// 見本のデータの手順：何度流しても増えない。
import { describe, expect, it } from "vitest";
import { seedSampleData } from "../scripts/lib/seed.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";

const database = useTestDatabase();

describe("見本のデータ", () => {
  it("2回目は何も足さない", async () => {
    await truncateAllTables(database);
    expect(await seedSampleData(database.db)).toBeGreaterThanOrEqual(0);
    expect(await seedSampleData(database.db)).toBe(0);
  });
});
