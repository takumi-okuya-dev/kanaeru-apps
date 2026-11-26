// zod の設定。画面の CSP は eval を許さない。zod は object の形を作るときに eval が使えるかを試す（new Function）ので、
// 試すこと自体をやめさせる（CSP の違反の知らせを出さない）。約束（@workspace/contracts）の形を作るより先に読む。
// index.html で画面の入口（main.tsx）より前の別の入口にする（組み立てが約束を入口より先に動く束に分けても効く）。
// main.tsx の最初でも読む（テストや、入口が1つのときのため。2回読んでも同じ）。
import { config } from "zod";

config({ jitless: true });
