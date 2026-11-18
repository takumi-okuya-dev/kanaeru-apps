// DB の名前の読み方（手順と、テストの DB の作り方が使う）：形の合わない名前・%xx の崩れた接続先は、URIError でなく決まった文で止める。
import { describe, expect, it } from "vitest";
import { databaseNameOf, withDatabaseName } from "../scripts/lib/database.ts";

describe("DB の名前", () => {
  it("接続先から DB の名前を読み、ほかの DB の接続先を作る", () => {
    expect(databaseNameOf("postgres://u:p@localhost:5432/app_notes")).toBe("app_notes");
    expect(withDatabaseName("postgres://u:p@localhost:5432/app", "app_e2e")).toBe(
      "postgres://u:p@localhost:5432/app_e2e",
    );
  });

  it("形の合わない名前・%xx の崩れた名前・URL でないものは、決まった文で止める", () => {
    for (const url of [
      "postgres://u:p@localhost:5432/App-Name",
      "postgres://u:p@localhost:5432/app%zz",
      "postgres://u:p@localhost:5432/",
      "not a url",
    ]) {
      expect(() => databaseNameOf(url), url).toThrow("DATABASE_URL の DB の名前は");
    }
  });
});
