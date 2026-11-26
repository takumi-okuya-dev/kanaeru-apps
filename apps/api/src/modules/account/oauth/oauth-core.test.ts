// MCP の認可の純粋な部品（core-021・AD-21）：PKCE・戻り先・宛先・CIMD（SSRF の守り・大きさ・形）・札。
import { describe, expect, it } from "vitest";
import { pkceS256Challenge, isAcceptableChallenge, verifyPkceS256 } from "./pkce.ts";
import { isRegistrableRedirectUri, redirectUriAllowed } from "./redirect.ts";
import { canonicalMcpResource, isCanonicalMcpResource } from "./resource.ts";
import { fetchClientMetadata, isPrivateAddress, parseCimdUrl, validateClientMetadata, CimdError } from "./cimd.ts";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens.ts";

const VERIFIER = "a".repeat(43);

describe("PKCE（S256 だけ）", () => {
  it("正しい verifier は通り、違うものと plain は通らない", () => {
    const challenge = pkceS256Challenge(VERIFIER);
    expect(verifyPkceS256(VERIFIER, challenge)).toBe(true);
    expect(verifyPkceS256("b".repeat(43), challenge)).toBe(false);
    expect(verifyPkceS256("短い", "短い")).toBe(false);
  });
  it("method は S256 だけ受ける（plain は断る）", () => {
    const challenge = pkceS256Challenge(VERIFIER);
    expect(isAcceptableChallenge(challenge, "S256")).toBe(true);
    expect(isAcceptableChallenge(challenge, "plain")).toBe(false);
    expect(isAcceptableChallenge("not-43", "S256")).toBe(false);
  });
});

describe("戻り先の照合（FR-033）", () => {
  const registered = ["https://app.example/callback"];
  it("完全一致は通す", () => {
    expect(redirectUriAllowed("https://app.example/callback", registered)).toBe(true);
  });
  it("ループバックはポートだけ任意にする（127.0.0.1 と [::1]）", () => {
    const loop = ["http://127.0.0.1/callback", "http://[::1]/callback"];
    expect(redirectUriAllowed("http://127.0.0.1:1455/callback", loop)).toBe(true);
    expect(redirectUriAllowed("http://[::1]:50123/callback", loop)).toBe(true);
    expect(redirectUriAllowed("http://127.0.0.1:1455/other", loop)).toBe(false);
  });
  it("登録にない別のホスト・http の外の戻り先・利用者の情報は断る（localhost はループバックとして受ける）", () => {
    expect(redirectUriAllowed("https://evil.example/callback", registered)).toBe(false);
    expect(redirectUriAllowed("http://example.com/callback", ["http://example.com/callback"])).toBe(false);
    expect(redirectUriAllowed("http://localhost:3000/callback", ["http://localhost/callback"])).toBe(true);
    expect(redirectUriAllowed("http://localhost:3000/callback", ["http://127.0.0.1/callback"])).toBe(false);
    expect(redirectUriAllowed("http://u:p@127.0.0.1:1/callback", ["http://127.0.0.1/callback"])).toBe(false);
  });
  it("登録の形：https か、ループバックの http だけ", () => {
    expect(isRegistrableRedirectUri("https://app.example/cb")).toBe(true);
    expect(isRegistrableRedirectUri("http://127.0.0.1/cb")).toBe(true);
    expect(isRegistrableRedirectUri("http://app.example/cb")).toBe(false);
    expect(isRegistrableRedirectUri("https://app.example/cb#x")).toBe(false);
  });
});

describe("宛先（RFC 8707）", () => {
  it("正規の宛先は画面の源 + /api/mcp。末尾の / や別の道は受けない", () => {
    const web = "https://kanaeru.example/some/path";
    expect(canonicalMcpResource(web)).toBe("https://kanaeru.example/api/mcp");
    expect(isCanonicalMcpResource("https://kanaeru.example/api/mcp", web)).toBe(true);
    expect(isCanonicalMcpResource("https://kanaeru.example/api/mcp/", web)).toBe(false);
    expect(isCanonicalMcpResource("https://kanaeru.example/api/v1/x", web)).toBe(false);
    expect(isCanonicalMcpResource("", web)).toBe(false);
  });
});

describe("CIMD（取りに行く先の守り）", () => {
  it("https の URL だけ。IP の直書き・localhost・利用者の情報・道なし は断る", () => {
    expect(parseCimdUrl("https://app.example/client.json")).not.toBeNull();
    expect(parseCimdUrl("http://app.example/client.json")).toBeNull();
    expect(parseCimdUrl("https://127.0.0.1/client.json")).toBeNull();
    expect(parseCimdUrl("https://localhost/client.json")).toBeNull();
    expect(parseCimdUrl("https://u:p@app.example/client.json")).toBeNull();
    expect(parseCimdUrl("https://app.example/")).toBeNull();
    expect(parseCimdUrl("not a url")).toBeNull();
  });
  it("私的・予約の番地を見分ける", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
  it("文書の検証：client_id が一致し、戻り先が使え、名前は任意", () => {
    const id = "https://app.example/client.json";
    expect(validateClientMetadata({ client_id: id, redirect_uris: ["http://127.0.0.1/cb"], client_name: "Codex" }, id)).toEqual({
      clientId: id,
      clientName: "Codex",
      redirectUris: ["http://127.0.0.1/cb"],
    });
    expect(() => validateClientMetadata({ client_id: "https://other.example/c.json", redirect_uris: ["https://a.example/cb"] }, id)).toThrow(CimdError);
    expect(() => validateClientMetadata({ client_id: id, redirect_uris: [] }, id)).toThrow(CimdError);
    expect(() => validateClientMetadata({ client_id: id, redirect_uris: ["http://a.example/cb"] }, id)).toThrow(CimdError);
    expect(() => validateClientMetadata({ client_id: id, redirect_uris: ["https://a.example/cb"], client_name: 5 }, id)).toThrow(CimdError);
  });
  it("取得：私的な番地に解決されたら取りに行かない", async () => {
    let called = false;
    const fetchFake = (() => {
      called = true;
      return Promise.resolve(new Response("{}"));
    }) as unknown as typeof fetch;
    await expect(
      fetchClientMetadata("https://app.example/client.json", { fetch: fetchFake, resolveHost: () => Promise.resolve(["10.0.0.5"]) }),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
    expect(called).toBe(false);
  });
  it("取得：正しい文書は通り、大きすぎる・失敗・転送は断る", async () => {
    const id = "https://app.example/client.json";
    const resolve = () => Promise.resolve(["93.184.216.34"]);
    const ok = (() =>
      Promise.resolve(new Response(JSON.stringify({ client_id: id, redirect_uris: ["https://app.example/cb"], client_name: "A" }), {
        headers: { "content-type": "application/json" },
      }))) as unknown as typeof fetch;
    await expect(fetchClientMetadata(id, { fetch: ok, resolveHost: resolve })).resolves.toMatchObject({ clientName: "A" });

    const big = (() => Promise.resolve(new Response("x".repeat(9000)))) as unknown as typeof fetch;
    await expect(fetchClientMetadata(id, { fetch: big, resolveHost: resolve })).rejects.toMatchObject({ code: "TOO_LARGE" });

    const fail = (() => Promise.resolve(new Response("no", { status: 500 }))) as unknown as typeof fetch;
    await expect(fetchClientMetadata(id, { fetch: fail, resolveHost: resolve })).rejects.toMatchObject({ code: "FETCH_FAILED" });

    const broken = (() => Promise.reject(new TypeError("network"))) as unknown as typeof fetch;
    await expect(fetchClientMetadata(id, { fetch: broken, resolveHost: resolve })).rejects.toMatchObject({ code: "FETCH_FAILED" });
  });
});

describe("札（コード・トークン）", () => {
  it("札は毎回違い、DB に入るのは SHA-256 だけ", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashOpaqueToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
