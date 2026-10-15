import nodeAssert from "node:assert/strict";
import { sellerProofUploadUrl, cleanName } from "../functions/seller-proof-upload-url/handler.ts";
import { sellerProofFinalize } from "../functions/seller-proof-finalize/handler.ts";
import { adminProofUrl } from "../functions/admin-proof-url/handler.ts";
import { proofsPurge } from "../functions/proofs-purge/handler.ts";
import type { Deps } from "../functions/_shared/seller.ts";

const assertEquals = (a: unknown, b: unknown, m?: string) => nodeAssert.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const U = "u1";
const ADMIN = "admin1";
const BIZ = "10000000-0000-0000-0000-0000000000a1";
const OTHER_BIZ = "10000000-0000-0000-0000-0000000000b1";
const FLAG = "20000000-0000-0000-0000-0000000000f1";
const FLAG_OTHER = "20000000-0000-0000-0000-0000000000f2";
const FLAG_CLOSED = "20000000-0000-0000-0000-0000000000f3";
const FLAG_PLAIN = "20000000-0000-0000-0000-0000000000f4";
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (sub: string) => `${b64({ alg: "HS256" })}.${b64({ sub })}.sig`;
const TOKEN = jwt(U);
const ADMIN_TOKEN = jwt(ADMIN);

type World = ReturnType<typeof world>;
function world() {
  return {
    tables: {
      businesses: [{ id: BIZ, seller_id: "ES100001", phone: "+254712345678", name: "Shop A", status: "live", user_id: U }],
      admins: [{ user_id: ADMIN }],
      flags: [
        { id: FLAG, business_id: BIZ, status: "open", seller_message: "Send proof" },
        { id: FLAG_OTHER, business_id: OTHER_BIZ, status: "open", seller_message: "Not yours" },
        { id: FLAG_CLOSED, business_id: BIZ, status: "resolved", seller_message: "Old" },
        { id: FLAG_PLAIN, business_id: BIZ, status: "open", seller_message: null },
      ],
      flag_attachments: [] as any[],
      audit_log: [] as any[],
    } as Record<string, any[]>,
    files: new Map<string, Uint8Array>(),
    removed: [] as string[],
    signedUploads: [] as string[],
    signedReads: [] as { path: string; seconds: number }[],
    counters: new Map<string, number>(),
    users: new Map<string, { id: string }>([[TOKEN, { id: U }], [ADMIN_TOKEN, { id: ADMIN }]]),
    failAudit: false,
    due: [] as { id: string; path: string }[],
  };
}

function deps(w: World): Deps {
  const from = (t: string) => {
    const eqs: [string, unknown][] = [];
    const ins: [string, unknown[]][] = [];
    const nes: [string, unknown][] = [];
    let op: "select" | "update" | "delete" = "select";
    let patch: any = null;
    const match = (r: any) => eqs.every(([c, v]) => r[c] === v) && nes.every(([c, v]) => r[c] !== v) && ins.every(([c, vs]) => vs.includes(r[c]));
    const run = () => {
      const rows = (w.tables[t] ??= []);
      if (op === "delete") { w.tables[t] = rows.filter((r) => !match(r)); return { data: null, error: null }; }
      if (op === "update") { rows.filter(match).forEach((r) => Object.assign(r, patch)); return { data: null, error: null }; }
      return { data: rows.filter(match), error: null };
    };
    const api: any = {
      select: () => api,
      eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
      neq: (c: string, v: unknown) => (nes.push([c, v]), api),
      in: (c: string, vs: unknown[]) => (ins.push([c, vs]), api),
      update: (p: any) => ((op = "update"), (patch = p), api),
      delete: () => ((op = "delete"), api),
      maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
      insert: (row: any) => {
        if (t === "audit_log" && w.failAudit) return Promise.resolve({ error: { message: "audit down" } });
        if (t === "flag_attachments" && (w.tables[t] ?? []).filter((r) => r.flag_id === row.flag_id).length >= 3) return Promise.resolve({ error: { message: "attachments_limit" } });
        (w.tables[t] ??= []).push({ ...row });
        return Promise.resolve({ error: null });
      },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };
  const db = {
    from,
    rpc: (name: string, args: any) => {
      if (name === "hit_rate_limit") {
        const n = (w.counters.get(args.p_key) ?? 0) + 1;
        w.counters.set(args.p_key, n);
        return Promise.resolve({ data: n <= args.p_max, error: null });
      }
      if (name === "proofs_due_for_purge") return Promise.resolve({ data: w.due, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    auth: { getUser: (t: string) => Promise.resolve(w.users.has(t) ? { data: { user: w.users.get(t) }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
    storage: {
      from: (bucket: string) => {
        if (bucket !== "seller-proofs") throw new Error(`unexpected bucket ${bucket}`);
        return {
          createSignedUploadUrl: (p: string) => (w.signedUploads.push(p), Promise.resolve({ data: { signedUrl: `https://s/upload/${p}?token=t`, token: `tok-${w.signedUploads.length}`, path: p }, error: null })),
          createSignedUrl: (p: string, seconds: number) => (w.signedReads.push({ path: p, seconds }), Promise.resolve({ data: { signedUrl: `https://s/read/${p}?exp=${seconds}` }, error: null })),
          download: (p: string) => (w.files.has(p) ? Promise.resolve({ data: new Blob([w.files.get(p)! as BlobPart]), error: null }) : Promise.resolve({ data: null, error: { message: "nf" } })),
          remove: (ps: string[]) => (w.removed.push(...ps), ps.forEach((p) => w.files.delete(p)), Promise.resolve({ error: null })),
        };
      },
    },
  };
  return { db, anon: {}, salt: "s", code: () => "123456", sms: () => Promise.resolve(true), cronSecret: "cron-secret" } as unknown as Deps;
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const authed = (body: unknown, token = TOKEN) => post(body, { authorization: `Bearer ${token}` });
const read = async (r: Response) => ({ status: r.status, body: await r.json() });

const bytes = (...head: number[]) => Uint8Array.from([...head, ...new Array(64).fill(0x20)]);
const text = (s: string) => new TextEncoder().encode(s);
const PDF_OK = text("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF");
const PDF_ENCRYPTED = text("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF");
const PDF_JS = text("%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

async function requestUploads(w: World, files: ReturnType<typeof file>[], flagId = FLAG, token = TOKEN) {
  return read(await sellerProofUploadUrl(deps(w))(authed({ flagId, files }, token)));
}

/** Upload step as the browser would do it: bytes land at the object the one-time URL points to. */
async function uploadAndFinalize(w: World, items: { name: string; type: string; bytes: Uint8Array }[]) {
  const up = await requestUploads(w, items.map((i) => file(i.name, i.type, i.bytes.length || 1000)));
  nodeAssert.equal(up.status, 201, JSON.stringify(up.body));
  up.body.uploads.forEach((u: any, i: number) => w.files.set(u.path, items[i].bytes));
  const fin = await read(await sellerProofFinalize(deps(w))(authed({ flagId: FLAG, attachmentIds: up.body.uploads.map((u: any) => u.attachmentId) })));
  return { up, fin };
}

const everythingGone = (w: World) => {
  assertEquals(w.tables.flag_attachments.length, 0);
  assertEquals(w.files.size, 0);
};

Deno.test("upload-url: one-time signed URLs, random names, cleaned display names", async () => {
  const w = world();
  const r = await requestUploads(w, [file("../../etc/passwd.pdf", "application/pdf"), file("Receipt <1>.JPG", "image/jpeg")]);
  assertEquals(r.status, 201);
  assertEquals(r.body.uploads.length, 2);
  for (const u of r.body.uploads) {
    assert(new RegExp(`^${BIZ}/${FLAG}/[0-9a-f-]{36}\\.(pdf|jpg)$`).test(u.path), u.path);
    assert(u.token && u.signedUrl);
  }
  assert(!r.body.uploads.some((u: any) => /passwd|Receipt/.test(u.path)), "the seller's file name never reaches the object path");
  assertEquals(new Set(r.body.uploads.map((u: any) => u.path)).size, 2);
  assertEquals(w.tables.flag_attachments.map((a) => a.original_name), ["passwd.pdf", "Receipt 1.JPG"]);
  assertEquals(w.tables.flag_attachments.map((a) => a.status), ["pending", "pending"]);
  assertEquals(cleanName("a\u0000b\\c\\d.pdf"), "d.pdf");
  assertEquals(cleanName("///"), "file");
});

Deno.test("upload-url: another seller's flag, a closed flag and a non-question are refused", async () => {
  const w = world();
  const other = await requestUploads(w, [file("a.pdf", "application/pdf")], FLAG_OTHER);
  assertEquals(other.status, 404);
  assertEquals(other.body, { error: "flag_not_found" });
  const missing = await requestUploads(w, [file("a.pdf", "application/pdf")], "20000000-0000-0000-0000-00000000ffff");
  assertEquals(missing, other, "a flag that does not exist looks the same as one that is not yours");
  assertEquals((await requestUploads(w, [file("a.pdf", "application/pdf")], FLAG_PLAIN)).status, 404);
  assertEquals((await requestUploads(w, [file("a.pdf", "application/pdf")], FLAG_CLOSED)).status, 409);
  assertEquals(w.signedUploads.length, 0);
  assertEquals(w.tables.flag_attachments.length, 0);

  // The same refusal when someone else's seller tries mine.
  const w2 = world();
  w2.tables.businesses[0].user_id = "someone-else";
  assertEquals((await requestUploads(w2, [file("a.pdf", "application/pdf")])).status, 403, "a user with no business has no flags at all");
});

Deno.test("upload-url: auth, shape, limits, types and size", async () => {
  const w = world();
  assertEquals((await read(await sellerProofUploadUrl(deps(w))(post({ flagId: FLAG, files: [file("a.pdf", "application/pdf")] })))).status, 401);
  assertEquals((await requestUploads(w, [file("a.pdf", "application/pdf")], FLAG, "bad-token")).status, 401);
  assertEquals((await read(await sellerProofUploadUrl(deps(w))(authed({ flagId: "nope", files: [] })))).status, 400);
  assertEquals((await requestUploads(w, [])).status, 400);
  assertEquals((await requestUploads(w, new Array(4).fill(file("a.pdf", "application/pdf")))).status, 400);

  for (const bad of [file("virus.exe", "application/octet-stream"), file("virus.exe", "application/pdf"), file("doc.pdf", "image/png"), file("noext", "application/pdf"), file("a.gif", "image/gif")]) {
    const r = await requestUploads(w, [bad]);
    assertEquals([r.status, r.body.error], [422, "type_not_allowed"], bad.name);
  }
  const big = await requestUploads(w, [file("big.pdf", "application/pdf", 8 * 1024 * 1024 + 1)]);
  assertEquals([big.status, big.body.error], [422, "file_too_large"]);
  assertEquals((await requestUploads(w, [file("edge.pdf", "application/pdf", 8 * 1024 * 1024)])).status, 201);
  assertEquals(w.signedUploads.length, 1, "nothing was signed for refused files");
});

Deno.test("upload-url: at most 3 files per flag, an abandoned attempt is replaced", async () => {
  const w = world();
  assertEquals((await requestUploads(w, [file("1.pdf", "application/pdf"), file("2.pdf", "application/pdf")])).status, 201);
  // The earlier attempt was never finalized, so it is replaced rather than counted.
  assertEquals((await requestUploads(w, [file("3.pdf", "application/pdf"), file("4.pdf", "application/pdf"), file("5.pdf", "application/pdf")])).status, 201);
  assertEquals(w.tables.flag_attachments.length, 3);
  assertEquals(w.removed.length, 2);
  // Three checked files are in; a fourth is refused.
  w.tables.flag_attachments.forEach((a) => (a.status = "ready"));
  const four = await requestUploads(w, [file("6.pdf", "application/pdf")]);
  assertEquals([four.status, four.body.error], [409, "attachments_limit"]);
});

Deno.test("upload-url: rate limited", async () => {
  const w = world();
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await requestUploads(w, [file("a.pdf", "application/pdf")])).status;
  assertEquals(last, 429);
});

Deno.test("finalize: genuine PDF, JPG, PNG and WebP are accepted and become ready", async () => {
  const w = world();
  const { up, fin } = await uploadAndFinalize(w, [
    { name: "a.pdf", type: "application/pdf", bytes: PDF_OK },
    { name: "b.jpg", type: "image/jpeg", bytes: JPG },
    { name: "c.png", type: "image/png", bytes: PNG },
  ]);
  assertEquals(fin.status, 200);
  assertEquals(fin.body.attachments.map((a: any) => [a.name, a.mime]), [["a.pdf", "application/pdf"], ["b.jpg", "image/jpeg"], ["c.png", "image/png"]]);
  assertEquals(w.tables.flag_attachments.map((a) => a.status), ["ready", "ready", "ready"]);
  assertEquals(w.tables.flag_attachments[0].size_bytes, PDF_OK.length, "the real size replaces the declared one");
  assert(!JSON.stringify(fin.body).includes(up.body.uploads[0].path), "the response never exposes storage paths");
  const w2 = world();
  assertEquals((await uploadAndFinalize(w2, [{ name: "w.webp", type: "image/webp", bytes: WEBP }])).fin.status, 200);
});

Deno.test("finalize: a disguised file is rejected and EVERYTHING pending is deleted", async () => {
  const w = world();
  const { fin } = await uploadAndFinalize(w, [
    { name: "good.pdf", type: "application/pdf", bytes: PDF_OK },
    { name: "invoice.pdf", type: "application/pdf", bytes: EXE },
  ]);
  assertEquals([fin.status, fin.body.error, fin.body.file], [422, "type_not_allowed", "invoice.pdf"]);
  everythingGone(w);
  assertEquals(w.removed.length, 2, "the good file is deleted too");
});

Deno.test("finalize: a real image named as a PDF is a mismatch, not a pass", async () => {
  const w = world();
  const { fin } = await uploadAndFinalize(w, [{ name: "scan.pdf", type: "application/pdf", bytes: PNG }]);
  assertEquals([fin.status, fin.body.error], [422, "type_mismatch"]);
  everythingGone(w);
});

Deno.test("finalize: an encrypted PDF is rejected", async () => {
  const w = world();
  const { fin } = await uploadAndFinalize(w, [{ name: "locked.pdf", type: "application/pdf", bytes: PDF_ENCRYPTED }]);
  assertEquals([fin.status, fin.body.error], [422, "pdf_encrypted"]);
  everythingGone(w);
});

Deno.test("finalize: a PDF with JavaScript or launch actions is rejected", async () => {
  for (const [name, body] of [["js.pdf", PDF_JS], ["launch.pdf", text("%PDF-1.4\n<< /Launch << /F (cmd.exe) >> >>")], ["embed.pdf", text("%PDF-1.4\n<< /EmbeddedFile >>")], ["auto.pdf", text("%PDF-1.4\n<< /AA << /O 1 0 R >> >>")]] as const) {
    const w = world();
    const { fin } = await uploadAndFinalize(w, [{ name, type: "application/pdf", bytes: body }]);
    assertEquals([fin.status, fin.body.error], [422, "pdf_active_content"], name);
    everythingGone(w);
  }
});

Deno.test("finalize: an oversized file is rejected even if the declared size was small", async () => {
  const w = world();
  const big = new Uint8Array(8 * 1024 * 1024 + 1);
  big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const up = await requestUploads(w, [file("big.pdf", "application/pdf", 1000)]);
  w.files.set(up.body.uploads[0].path, big);
  const fin = await read(await sellerProofFinalize(deps(w))(authed({ flagId: FLAG, attachmentIds: [up.body.uploads[0].attachmentId] })));
  assertEquals([fin.status, fin.body.error], [422, "file_too_large"]);
  everythingGone(w);
});

Deno.test("finalize: a file that was never uploaded, and an empty file, are rejected and cleaned up", async () => {
  const w = world();
  const up = await requestUploads(w, [file("a.pdf", "application/pdf")]);
  const fin = await read(await sellerProofFinalize(deps(w))(authed({ flagId: FLAG, attachmentIds: [up.body.uploads[0].attachmentId] })));
  assertEquals([fin.status, fin.body.error], [422, "file_not_uploaded"]);
  assertEquals(w.tables.flag_attachments.length, 0);
  const w2 = world();
  const r = await uploadAndFinalize(w2, [{ name: "e.pdf", type: "application/pdf", bytes: new Uint8Array(0) }]);
  assertEquals(r.fin.body.error, "file_too_large");
  everythingGone(w2);
});

Deno.test("finalize: another seller's flag or attachment is refused and nothing of theirs is touched", async () => {
  const w = world();
  w.tables.flag_attachments.push({ id: "30000000-0000-0000-0000-000000000001", flag_id: FLAG_OTHER, business_id: OTHER_BIZ, path: `${OTHER_BIZ}/${FLAG_OTHER}/x.pdf`, original_name: "theirs.pdf", mime: "application/pdf", size_bytes: 10, status: "pending" });
  w.files.set(`${OTHER_BIZ}/${FLAG_OTHER}/x.pdf`, PDF_OK);
  const viaFlag = await read(await sellerProofFinalize(deps(w))(authed({ flagId: FLAG_OTHER, attachmentIds: ["30000000-0000-0000-0000-000000000001"] })));
  assertEquals([viaFlag.status, viaFlag.body.error], [404, "flag_not_found"]);
  const viaId = await read(await sellerProofFinalize(deps(w))(authed({ flagId: FLAG, attachmentIds: ["30000000-0000-0000-0000-000000000001"] })));
  assertEquals([viaId.status, viaId.body.error], [404, "attachment_not_found"]);
  assertEquals(w.tables.flag_attachments.length, 1);
  assert(w.files.has(`${OTHER_BIZ}/${FLAG_OTHER}/x.pdf`));
  assertEquals(w.removed, []);
  assertEquals((await read(await sellerProofFinalize(deps(w))(post({ flagId: FLAG, attachmentIds: ["30000000-0000-0000-0000-000000000001"] })))).status, 401);
});

Deno.test("admin-proof-url: admins only, 60 seconds, audited before the URL is returned", async () => {
  const w = world();
  const { up } = await uploadAndFinalize(w, [{ name: "a.pdf", type: "application/pdf", bytes: PDF_OK }]);
  const id = up.body.uploads[0].attachmentId;
  const h = adminProofUrl(deps(w));
  assertEquals((await read(await h(authed({ attachmentId: id }, TOKEN)))).status, 403, "a seller cannot open proofs");
  assertEquals((await read(await h(post({ attachmentId: id })))).status, 401);
  assertEquals(w.signedReads.length, 0);
  assertEquals(w.tables.audit_log.length, 0);

  const ok = await read(await h(authed({ attachmentId: id }, ADMIN_TOKEN)));
  assertEquals(ok.status, 200);
  assertEquals(ok.body.expiresIn, 60);
  assertEquals(w.signedReads, [{ path: w.tables.flag_attachments[0].path, seconds: 60 }]);
  assertEquals(w.tables.audit_log.length, 1);
  assertEquals([w.tables.audit_log[0].action, w.tables.audit_log[0].actor_id, w.tables.audit_log[0].actor_role, w.tables.audit_log[0].business_id], ["proof_viewed", ADMIN, "admin", BIZ]);

  w.failAudit = true;
  const blocked = await read(await h(authed({ attachmentId: id }, ADMIN_TOKEN)));
  assertEquals(blocked.status, 500);
  assert(!("url" in blocked.body), "no audit row, no URL");
  assertEquals(w.signedReads.length, 1);
  assertEquals((await read(await h(authed({ attachmentId: "30000000-0000-0000-0000-00000000dead" }, ADMIN_TOKEN)))).status, 404);
});

Deno.test("admin-proof-url: an unchecked (pending) upload cannot be opened", async () => {
  const w = world();
  const up = await requestUploads(w, [file("a.pdf", "application/pdf")]);
  const r = await read(await adminProofUrl(deps(w))(authed({ attachmentId: up.body.uploads[0].attachmentId }, ADMIN_TOKEN)));
  assertEquals(r.status, 404);
});

Deno.test("proofs-purge: needs the cron secret, removes objects then rows", async () => {
  const w = world();
  w.tables.flag_attachments.push({ id: "a1", flag_id: FLAG, business_id: BIZ, path: "p/1.pdf" }, { id: "a2", flag_id: FLAG, business_id: BIZ, path: "p/2.pdf" }, { id: "a3", flag_id: FLAG, business_id: BIZ, path: "p/3.pdf" });
  w.due = [{ id: "a1", path: "p/1.pdf" }, { id: "a2", path: "p/2.pdf" }];
  const h = proofsPurge(deps(w));
  assertEquals((await read(await h(post({})))).status, 401);
  assertEquals((await read(await h(post({}, { "x-cron-secret": "wrong" })))).status, 401);
  assertEquals(w.removed, []);
  const ok = await read(await h(post({}, { "x-cron-secret": "cron-secret" })));
  assertEquals(ok.body, { purged: 2 });
  assertEquals(w.removed, ["p/1.pdf", "p/2.pdf"]);
  assertEquals(w.tables.flag_attachments.map((a) => a.id), ["a3"]);
  assertEquals(w.tables.audit_log[0].action, "proofs_purged");
});
