// pnpm install のとき（prepare）に、コミットの前の確かめ（.githooks/pre-commit）を git に設定する。
// git の作業場所（worktree）はリポジトリの設定を共有し、相対の道は各作業場所の根から読まれるので、どの作業場所でも効く。
// CI と、git のない所では何もしない。いつも 0 で終わる。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!process.env.CI && existsSync(".git")) {
  const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  if (result.status !== 0) {
    console.warn(
      "コミットの前の確かめを設定できませんでした（git config core.hooksPath .githooks を手で流してください）。",
    );
  }
}
