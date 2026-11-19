// 画面の入口。LINE（LIFF）を始めてから、TanStack Query と道（router.tsx）をつなぐ。
// LIFF の init の前に URL を変えると LIFF が壊れるので、ルーターは initLiff() が終わってから作る（構成の決めごと AD-4）。
// zod の設定は、ほかのどの import よりも先に読む（lib/zod-config.ts）
import "./lib/zod-config.ts";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { UiProvider } from "@workspace/ui/components/ui-provider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initLiff } from "./lib/liff.ts";
import { createQueryClient } from "./lib/query.ts";
import { createAppRouter } from "./router.tsx";
import { StartupErrorPage } from "./shell/StartupErrorPage.tsx";
import "./styles.css";

const element = document.getElementById("root");
if (!element) throw new Error("#root が見つかりません。");
const root = createRoot(element);

/** LINE を始めてから、画面を描く。始められなければ「読みこめない」を出す（ルーターは作らない）。 */
async function start(): Promise<void> {
  try {
    await initLiff();
  } catch {
    root.render(
      <StrictMode>
        <UiProvider>
          <StartupErrorPage />
        </UiProvider>
      </StrictMode>,
    );
    return;
  }
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient);
  root.render(
    <StrictMode>
      <UiProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </UiProvider>
    </StrictMode>,
  );
}

void start();
