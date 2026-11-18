// Testing Library の確かめ（toBeInTheDocument など）を足し、テストごとに画面を片付ける。
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom は scrollTo を持たない（道が変わるときに TanStack Router が呼ぶ）
if (typeof window !== "undefined") window.scrollTo = () => {};

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
