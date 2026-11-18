// zod の設定。画面の CSP は eval を許さない。zod は object の形を作るときに eval が使えるかを試す（new Function）ので、
// 試すこと自体をやめさせる（CSP の違反の知らせを出さない）。約束（@workspace/contracts）の形を作るより先に読む（main.tsx の最初）。
import { config } from "zod";

config({ jitless: true });
