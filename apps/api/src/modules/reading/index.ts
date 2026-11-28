// 読書記録の領域の入口（docs/apps/reading.md・docs/rules/coding.md 6-6）。読書記録（key は reading）の1つの領域（AD-32）。
// 土台（app.ts）は routes を読む。この版（reading-001 pr1）は表だけで、窓口は pr2 で足す。
// 退会の前の手順（withdrawal）は出さない（持ち主を指す外部キーの CASCADE で、account と一緒に消える。AD-32・research R11）。
// ほかの領域・ほかのアプリに出す関数はない。
export {};
