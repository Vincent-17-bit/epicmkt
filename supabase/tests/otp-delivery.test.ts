import nodeAssert from "node:assert/strict";
import { dispatchOtp, maskEmail, otpEmail, otpMessage, parseChannel, type OtpSenders } from "../functions/_shared/otpDelivery.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const rig = (sms: boolean | "throw", email: boolean | "throw") => {
  const calls: string[] = [];
  const senders: OtpSenders = {
    sms: async (to) => { calls.push(`sms:${to}`); if (sms === "throw") throw new Error("down"); return sms; },
    email: async (to) => { calls.push(`email:${to}`); if (email === "throw") throw new Error("down"); return email; },
  };
  return { calls, senders };
};
const target = { phone: "+254712345678", email: "owner@example.com" };

Deno.test("otp delivery: SMS first, nothing else when it works", async () => {
  const r = rig(true, true);
  assertEquals(await dispatchOtp(r.senders, target, "123456"), { channel: "sms", fellBack: false });
  assertEquals(r.calls, ["sms:+254712345678"]);
});

Deno.test("otp delivery: a failed or throwing SMS falls back to email", async () => {
  for (const sms of [false, "throw"] as const) {
    const r = rig(sms, true);
    assertEquals(await dispatchOtp(r.senders, target, "123456"), { channel: "email", fellBack: true });
    assertEquals(r.calls, ["sms:+254712345678", "email:owner@example.com"]);
  }
});

Deno.test("otp delivery: email requested skips SMS and never falls back to it", async () => {
  const ok = rig(true, true);
  assertEquals(await dispatchOtp(ok.senders, target, "123456", "email"), { channel: "email", fellBack: false });
  assertEquals(ok.calls, ["email:owner@example.com"]);
  const down = rig(true, false);
  assertEquals(await dispatchOtp(down.senders, target, "123456", "email"), { channel: null, fellBack: false });
  assertEquals(down.calls, ["email:owner@example.com"]);
});

Deno.test("otp delivery: no usable email means SMS only, and a bad address is ignored", async () => {
  for (const email of [null, undefined, "", "not-an-email", "a b@c.d"]) {
    const r = rig(false, true);
    assertEquals(await dispatchOtp(r.senders, { phone: target.phone, email }, "123456"), { channel: null, fellBack: false });
    assertEquals(r.calls, ["sms:+254712345678"]);
    const asked = rig(true, true);
    assertEquals(await dispatchOtp(asked.senders, { phone: target.phone, email }, "123456", "email"), { channel: null, fellBack: false });
    assertEquals(asked.calls, []);
  }
});

Deno.test("otp delivery: both channels failing reports no channel", async () => {
  const r = rig(false, "throw");
  assertEquals(await dispatchOtp(r.senders, target, "123456"), { channel: null, fellBack: false });
});

Deno.test("otp delivery: channel parsing, masking and message content", () => {
  assertEquals(["email", "sms", "x", undefined, null, 7].map(parseChannel), ["email", "sms", "sms", "sms", "sms", "sms"]);
  assertEquals(maskEmail("owner@example.com"), "o***@example.com");
  assert(otpMessage("123456").includes("123456"));
  const mail = otpEmail("123456");
  assert(mail.html.includes("123456") && mail.html.includes("10 minutes"));
  assert(!mail.subject.includes("123456"));
});
