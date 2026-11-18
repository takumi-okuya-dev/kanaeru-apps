// ESLint の設定（決まりは docs/rules/coding.md 6章）。
// typescript-eslint の型を使う推奨・JSDoc・モジュールの境界・守りの規則・見た目の値の規則を、ここ1か所で決める。
// 境界と守りの規則が働くかは tests/lint/ が確かめる。
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";
import tseslint from "typescript-eslint";

/** 領域の名前を道の形から捕まえる要素の決め方（領域を足しても、ここは直さない）。 */
const elements = [
  // API
  { type: "api-kernel", pattern: "apps/api/src/kernel", partialMatch: false },
  {
    type: "api-platform",
    pattern: "apps/api/src/platform/*",
    capture: ["name"],
    partialMatch: false,
  },
  { type: "api-module", pattern: "apps/api/src/modules/*", capture: ["name"], partialMatch: false },
  // 組み立て（app.ts・index.ts・modules.list.ts・client.ts）。上のどれにも入らない src 直下のファイル
  { type: "api-composition", pattern: "apps/api/src", partialMatch: false },
  // 画面
  { type: "web-shell", pattern: "apps/web/src/shell", partialMatch: false },
  {
    type: "web-feature",
    pattern: "apps/web/src/features/*",
    capture: ["name"],
    partialMatch: false,
  },
  { type: "web-lib", pattern: "apps/web/src/lib", partialMatch: false },
  // 組み立て（router.tsx・main.tsx・features.list.ts）
  { type: "web-composition", pattern: "apps/web/src", partialMatch: false },
  // 共通のパッケージ
  {
    type: "contracts",
    pattern: "packages/contracts/src/*",
    capture: ["name"],
    partialMatch: false,
  },
  { type: "ui", pattern: "packages/ui/src", partialMatch: false },
];

/**
 * 相手の入口（index.ts）だけを指す。
 * @param {string} type 要素の種類
 * @returns {object} 依存の先の決め方
 */
const entry = (type) => ({ element: { type, fileInternalPath: ["index.ts", "index.tsx"] } });

/** 依存の向きの決まり。最後に当たった決まりが勝つ（eslint-plugin-boundaries の決まり）。 */
const policies = [
  // 外のパッケージは、原則として読んでよい（下で個別に止める）
  { allow: { to: { module: { origin: ["external", "core"] } } } },

  // API：組み立て → 領域 → 共通 → 土台 の一方向。領域どうし・共通どうしは相手の index.ts だけ
  {
    from: { element: { type: "api-composition" } },
    allow: [
      { to: { element: { type: "api-kernel" } } },
      { to: entry("api-platform") },
      { to: entry("api-module") },
    ],
  },
  {
    from: { element: { type: "api-module" } },
    allow: [
      { to: { element: { type: "api-kernel" } } },
      { to: entry("api-platform") },
      { to: entry("api-module") },
    ],
  },
  {
    from: { element: { type: "api-platform" } },
    allow: [{ to: { element: { type: "api-kernel" } } }, { to: entry("api-platform") }],
  },

  // 画面：組み立て → 領域 → 共通（lib）。外枠は領域の中を読まない。領域どうしは相手の index.ts だけ
  {
    from: { element: { type: "web-composition" } },
    allow: [
      { to: { element: { type: "web-shell" } } },
      { to: entry("web-feature") },
      { to: { element: { type: "web-lib" } } },
    ],
  },
  {
    from: { element: { type: "web-feature" } },
    allow: [{ to: entry("web-feature") }, { to: { element: { type: "web-lib" } } }],
  },
  {
    from: { element: { type: "web-shell" } },
    allow: [{ to: { element: { type: "web-lib" } } }],
  },

  // 画面から API は、apps/api/src/client.ts を import type でだけ読む（API の動くコードを画面に入れない）
  {
    from: { element: { type: ["web-*"] } },
    allow: {
      to: { element: { type: "api-composition", fileInternalPath: "client.ts" } },
      dependency: { kind: "type" },
    },
  },

  // 共通のパッケージ：約束の領域どうしは相手の index.ts だけ。アプリを読まない
  {
    from: { element: { type: "contracts" } },
    allow: [{ to: entry("contracts") }],
  },
];

// 守りの規則。no-restricted-syntax は、同じファイルにかかる後のまとまりで丸ごと上書きになるため、
// 選び方を定数に1度だけ書き、アプリと共通のパッケージ・画面の2つのまとまりで組み合わせる。

/** DB の命令を文字のつなぎで作る書き方（SQL の差しこみ）。Drizzle の sql`… ${値}`（タグつき）は止めない。 */
const INJECTION_SYNTAX = [
  {
    selector:
      "CallExpression[callee.property.name=/^(query|execute)$/] > TemplateLiteral:first-child[expressions.length>0]",
    message:
      "DB の命令を文字のつなぎで作らないでください。Drizzle の組み立てか、値を別に渡す形にしてください。",
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(query|execute)$/] > BinaryExpression:first-child[operator='+']",
    message:
      "DB の命令を文字のつなぎで作らないでください。Drizzle の組み立てか、値を別に渡す形にしてください。",
  },
];

/** HTML をそのまま差しこむ書き方（XSS）。 */
const XSS_SYNTAX = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message:
      "HTML をそのまま差しこまないでください。文字は {値} で出せば、React が HTML として読まない形にします。",
  },
  {
    selector:
      "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
    message: "innerHTML・outerHTML に入れないでください。textContent を使ってください。",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "HTML の文字を差しこむ呼び出しは使えません。",
  },
  {
    selector:
      "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: "HTML の文字を差しこむ呼び出しは使えません。",
  },
];

/** 画面のコードで環境の値を読む書き方（組み立ての種類を表す値だけは許す）。秘密の値を画面に埋めないため。 */
const BROWSER_ENV_MESSAGE =
  "画面のコードで環境の値を読めません。画面に要る値は、組み立てのときに埋める形（__APP_NAME__ のように）で、秘密でない値だけを渡してください。";
/** 大域の物の名前（process をここから取り出す書き方も止める）。 */
const GLOBAL_OBJECTS = "/^(globalThis|window|self|global)$/";
const BROWSER_ENV_SYNTAX = [
  // process.env・process["env"]・const { env } = process など、process をそのまま使う所すべて
  {
    selector:
      "Identifier[name='process']:not(MemberExpression[computed=false] > Identifier.property):not(Property[computed=false] > Identifier.key)",
    message: BROWSER_ENV_MESSAGE,
  },
  {
    selector: `MemberExpression[object.name=${GLOBAL_OBJECTS}][property.name='process'][computed=false]`,
    message: BROWSER_ENV_MESSAGE,
  },
  {
    selector: `MemberExpression[object.name=${GLOBAL_OBJECTS}][property.value='process']`,
    message: BROWSER_ENV_MESSAGE,
  },
  {
    selector: `VariableDeclarator[init.name=${GLOBAL_OBJECTS}] > ObjectPattern > Property[key.name='process']`,
    message: BROWSER_ENV_MESSAGE,
  },
  // import.meta.env.VITE_X（DEV・PROD・MODE・BASE_URL・SSR のほか）・import.meta.env["X"]
  {
    selector:
      "MemberExpression[object.object.type='MetaProperty'][object.property.name='env'][computed=false][property.name!=/^(DEV|PROD|MODE|BASE_URL|SSR)$/]",
    message: BROWSER_ENV_MESSAGE,
  },
  {
    selector:
      "MemberExpression[object.object.type='MetaProperty'][object.property.name='env'][computed=true]",
    message: BROWSER_ENV_MESSAGE,
  },
  {
    selector:
      ":not(MemberExpression) > MemberExpression[object.type='MetaProperty'][property.name='env']",
    message: BROWSER_ENV_MESSAGE,
  },
];

/** アプリのコードから読めない道具（OS のコマンド・文字をコードとして動かす仕組み）。 */
const BLOCKED_IMPORTS = {
  paths: ["child_process", "node:child_process", "vm", "node:vm"].map((name) => ({
    name,
    message: "アプリのコードから OS のコマンドや、文字をコードとして動かす仕組みを使えません。",
  })),
};

/** 守りの規則をかけないファイル（テスト。手順の apps/api/scripts は src の外なので、もともとかからない）。 */
const SECURITY_IGNORES = [
  "**/test/**",
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/testing.tsx",
];

/** クラスの名前を書く所（JSX の className と、クラスをまとめる関数の引数）。 */
const CLASS_FUNCTIONS = new Set(["cn", "cva", "clsx", "twMerge"]);

/**
 * Tailwind のクラスから、変わり目（hover: など）を除いた本体を取り出す（[…]・(…) の中の : は区切りとみなさない）。
 * @param {string} token クラス
 * @returns {string} 本体
 */
function utilityOf(token) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;
    else if (char === ":" && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!/, "");
}

/**
 * 見た目の値を直接書いたクラス（Tailwind の任意の値。bg-[#…]・p-[13px]・[color:red]）を止める規則（DESIGN.md Do's and Don'ts）。
 * 値は tokens.css の名前だけを使う。data-[…]: や [&_svg]: のような変わり目の […] は止めない。
 */
const noArbitraryTailwind = {
  meta: {
    type: "problem",
    docs: { description: "Tailwind の任意の値を止める" },
    schema: [],
    messages: {
      arbitrary:
        "見た目の値を直接書けません（{{ token }}）。packages/ui/src/styles/tokens.css の名前（DESIGN.md の値）を使ってください。足りなければ、DESIGN.md と tokens.css に足してください。",
    },
  },
  create(context) {
    /**
     * クラスを書く所の文字か（className か、cn・cva などの引数の中）。
     * @param {import("estree").Node} node 文字の節
     * @returns {boolean} クラスを書く所なら true
     */
    const inClassContext = (node) =>
      context.sourceCode
        .getAncestors(node)
        .some(
          (ancestor) =>
            (ancestor.type === "JSXAttribute" && ancestor.name.name === "className") ||
            (ancestor.type === "CallExpression" &&
              ancestor.callee.type === "Identifier" &&
              CLASS_FUNCTIONS.has(ancestor.callee.name)),
        );
    /**
     * 文字の中のクラスを確かめる。
     * @param {import("estree").Node} node 文字の節
     * @param {string} text 文字
     */
    const check = (node, text) => {
      if (!inClassContext(node)) return;
      for (const token of text.split(/\s+/)) {
        if (token && utilityOf(token).includes("[")) {
          context.report({ node, messageId: "arbitrary", data: { token } });
        }
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/api/drizzle/**",
      "_bmad/**",
      "_bmad-output/**",
      ".claude/**",
      ".agents/**",
      ".specify/**",
      "specs/**",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.js", "scripts/security/*.mjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "separate-type-imports" },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  // モジュールの境界。テスト・手順（scripts）は要素の外なので、かからない
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": elements,
      "boundaries/root-path": import.meta.dirname,
      "import/resolver": { node: { extensions: [".ts", ".tsx", ".js"] } },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkAllOrigins: true,
          message:
            "{{ from.element.type }} から {{ to.element.type }} は読めません。依存の向き（組み立て → 領域 → 共通 → 土台）と、ほかの領域は index.ts からだけ読む決まり、画面から API は client.ts を import type でだけ読む決まりを確かめてください（docs/rules/coding.md 6-2）。",
          policies,
        },
      ],
    },
  },
  // ドキュメントコメント（JSDoc）。外に出す関数・クラス・型・定数に説明を付ける。
  // TypeScript では型はコードに書くので、JSDoc には型（{string} など）を書かない。
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "apps/api/scripts/**/*.ts", "packages/*/src/**/*.{ts,tsx}"],
    plugins: { jsdoc },
    settings: { jsdoc: { mode: "typescript" } },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            MethodDefinition: false,
          },
          contexts: [
            "TSTypeAliasDeclaration",
            "TSInterfaceDeclaration",
            "ExportNamedDeclaration > VariableDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": ["error", { contexts: ["any"] }],
      // React の部品の props は分割代入で受け取るので、まとめて @param props で説明する
      "jsdoc/require-param": ["error", { checkDestructured: false, unnamedRootBase: ["props"] }],
      "jsdoc/require-param-description": "error",
      "jsdoc/check-param-names": ["error", { checkDestructured: false }],
      "jsdoc/require-returns": ["error", { checkGetters: false, forceReturnsWithAsync: false }],
      "jsdoc/require-returns-description": "error",
      "jsdoc/no-types": "error",
      "jsdoc/check-tag-names": "error",
    },
  },
  // 守りの規則：アプリと共通のパッケージ（SQL の差しこみ・OS のコマンド・文字をコードとして動かす）
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    ignores: SECURITY_IGNORES,
    rules: {
      "no-restricted-syntax": ["error", ...INJECTION_SYNTAX],
      "no-restricted-imports": ["error", BLOCKED_IMPORTS],
      "no-restricted-properties": [
        "error",
        {
          object: "sql",
          property: "raw",
          message: "sql.raw は値を命令にそのまま入れます。sql`… ${値}` の形で値を渡してください。",
        },
      ],
      "no-eval": "error",
      "no-new-func": "error",
    },
  },
  // 守りの規則：画面（画面の組み立てに入る packages/ui・packages/contracts を含む）。HTML の差しこみ・環境の値を読む。
  // no-restricted-syntax は上のまとまりを上書きするので、SQL の差しこみの選び方を入れ直す
  {
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}",
      "packages/contracts/src/**/*.{ts,tsx}",
    ],
    ignores: SECURITY_IGNORES,
    rules: {
      "no-restricted-syntax": ["error", ...INJECTION_SYNTAX, ...XSS_SYNTAX, ...BROWSER_ENV_SYNTAX],
    },
  },
  // 見た目の値：画面と部品では、Tailwind の任意の値（bg-[#…]・p-[13px]）を書かない（tokens.css の名前だけ）
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    plugins: { local: { rules: { "no-arbitrary-tailwind": noArbitraryTailwind } } },
    rules: { "local/no-arbitrary-tailwind": "error" },
  },
);
