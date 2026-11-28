// pdf.js（pdfjs-dist 4.10.38）の縮めた束には型のファイルがないので、縮めていない束の型を借りる（research R5・R6）。
declare module "pdfjs-dist/legacy/build/pdf.min.mjs" {
  export * from "pdfjs-dist/legacy/build/pdf.mjs";
}

// worker の束（テストで、Node の pdf.js に同じ流れの中で動く worker として渡す）
declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs" {
  /** worker の受け手（pdf.js が globalThis.pdfjsWorker から読む） */
  export const WorkerMessageHandler: unknown;
}
