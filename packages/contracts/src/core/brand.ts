// 画面と知らせの固定の文言に出す、利用者に見えるアプリの名前（PaletKit）。
// 環境ごとに変わる画面の名前（設定の APP_NAME。ステージングは「PaletKit（ステージング）」）とは別に持つ。
// 内部の名前（kanaeru。Cookie・保存のキー・Terraform や Cloud Run の名前）は、これでは変えない。
/** 利用者に見えるアプリの名前（固定の文言用）。 */
export const PRODUCT_NAME = "PaletKit";
