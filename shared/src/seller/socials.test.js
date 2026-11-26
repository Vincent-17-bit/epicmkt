import { test } from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_KEYS, normalizeSocials, parseSocial, safeSocialUrl, socialInputOf, socialsList } from "./socials.js";

const url = (key, input) => {
  const r = parseSocial(key, input);
  assert.equal(r.ok, true, `${key} ${input}: ${r.error}`);
  return r.url;
};
const refuses = (key, input) => assert.equal(parseSocial(key, input).ok, false, `${key} should refuse ${JSON.stringify(input)}`);

test("the five networks, in a fixed order", () => {
  assert.deepEqual(SOCIAL_KEYS, ["x", "instagram", "linkedin", "reddit", "facebook"]);
});

test("nothing typed means not set", () => {
  for (const key of SOCIAL_KEYS) {
    assert.deepEqual(parseSocial(key, ""), { ok: true, empty: true });
    assert.deepEqual(parseSocial(key, "   "), { ok: true, empty: true });
    assert.deepEqual(parseSocial(key, undefined), { ok: true, empty: true });
  }
});

test("X: handle, link, old twitter link", () => {
  assert.equal(url("x", "@jane_doe"), "https://x.com/jane_doe");
  assert.equal(url("x", "jane_doe"), "https://x.com/jane_doe");
  assert.equal(url("x", "x.com/jane_doe"), "https://x.com/jane_doe");
  assert.equal(url("x", "https://twitter.com/jane_doe?s=20&t=abc"), "https://x.com/jane_doe");
  assert.equal(url("x", "https://mobile.twitter.com/jane_doe/"), "https://x.com/jane_doe");
  assert.equal(url("x", "https://www.x.com/jane_doe/status/123"), "https://x.com/jane_doe");
  assert.equal(parseSocial("x", "@jane_doe").handle, "@jane_doe");
  for (const bad of ["a".repeat(16), "jane doe", "x.com/home", "x.com/", "https://x.com", "@", "jane-doe"]) refuses("x", bad);
});

test("Instagram: handle, link with tracking tail", () => {
  assert.equal(url("instagram", "@jane.doe_1"), "https://www.instagram.com/jane.doe_1/");
  assert.equal(url("instagram", "instagram.com/jane.doe_1"), "https://www.instagram.com/jane.doe_1/");
  assert.equal(url("instagram", "https://www.instagram.com/jane.doe_1/?igsh=MXx&utm_source=qr"), "https://www.instagram.com/jane.doe_1/");
  for (const bad of ["https://instagram.com/p/Cabc123/", "instagram.com/reel/xyz", "..jane", "jane..doe", "a".repeat(31), "jane!"]) refuses("instagram", bad);
});

test("LinkedIn: profile, company, bare slug", () => {
  assert.equal(url("linkedin", "https://www.linkedin.com/in/jane-doe-12a34b5c/"), "https://www.linkedin.com/in/jane-doe-12a34b5c");
  assert.equal(url("linkedin", "linkedin.com/in/jane-doe"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(url("linkedin", "https://ke.linkedin.com/in/jane-doe?trk=public"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(url("linkedin", "https://www.linkedin.com/company/epicmkt/"), "https://www.linkedin.com/company/epicmkt");
  assert.equal(url("linkedin", "jane-doe"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(url("linkedin", "company/epicmkt"), "https://www.linkedin.com/company/epicmkt");
  for (const bad of ["https://www.linkedin.com/feed/", "https://www.linkedin.com/in/", "linkedin.com/jobs/view/1", "ab"]) refuses("linkedin", bad);
});

test("Reddit: u/ and user/ and r/", () => {
  assert.equal(url("reddit", "u/jane_doe"), "https://www.reddit.com/user/jane_doe");
  assert.equal(url("reddit", "/u/jane_doe/"), "https://www.reddit.com/user/jane_doe");
  assert.equal(url("reddit", "jane_doe"), "https://www.reddit.com/user/jane_doe");
  assert.equal(url("reddit", "https://old.reddit.com/user/jane_doe/submitted/"), "https://www.reddit.com/user/jane_doe");
  assert.equal(url("reddit", "https://www.reddit.com/r/Kenya/"), "https://www.reddit.com/r/Kenya");
  assert.equal(url("reddit", "r/Kenya"), "https://www.reddit.com/r/Kenya");
  for (const bad of ["https://www.reddit.com/", "reddit.com/popular", "u/ab", "r/a"]) refuses("reddit", bad);
});

test("Facebook: vanity link, profile.php id", () => {
  assert.equal(url("facebook", "facebook.com/epicmkt.ke"), "https://www.facebook.com/epicmkt.ke");
  assert.equal(url("facebook", "https://m.facebook.com/epicmkt.ke/?ref=bookmarks"), "https://www.facebook.com/epicmkt.ke");
  assert.equal(url("facebook", "https://www.facebook.com/profile.php?id=100012345678901&sk=about"), "https://www.facebook.com/profile.php?id=100012345678901");
  assert.equal(url("facebook", "https://fb.com/epicmkt.ke"), "https://www.facebook.com/epicmkt.ke");
  assert.equal(url("facebook", "epicmkt.ke"), "https://www.facebook.com/epicmkt.ke");
  for (const bad of ["facebook.com/sharer/sharer.php?u=x", "facebook.com/groups/123", "https://www.facebook.com/profile.php?id=abc", "facebook.com/ab", "facebook.com/"]) refuses("facebook", bad);
});

test("a link can only lead to the network it is labelled with", () => {
  for (const key of SOCIAL_KEYS) {
    for (const bad of ["https://evil.example/jane", "https://instagram.com.evil.example/jane", "https://evilx.com/jane", "javascript:alert(1)", "data:text/html,hi", "ftp://x.com/jane", "https://user:pw@x.com/jane", "https://x.com:8080/jane", "//evil.example/x", "https://x.com/jane\n", "<script>", "jane\\evil"]) {
      // some of these happen to be valid for one platform (x.com on X); every other platform must refuse them
      const r = parseSocial(key, bad);
      if (r.ok) assert.match(r.url, /^https:\/\/(www\.)?(x|instagram|linkedin|reddit|facebook)\.com\//, `${key} ${bad}`);
    }
  }
  refuses("instagram", "https://x.com/jane");
  refuses("x", "https://instagram.com/jane");
  refuses("x", "https://x.com.evil.example/jane");
  refuses("x", "javascript:alert(1)");
  refuses("linkedin", "https://evil.example/in/jane");
});

test("normalizeSocials keeps only filled networks, as canonical addresses, and reports each bad one", () => {
  const r = normalizeSocials({ x: "@jane", instagram: "", linkedin: "https://www.linkedin.com/in/jane-doe/", reddit: "!!", facebook: undefined, tiktok: "@nope" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.value, { x: "https://x.com/jane", linkedin: "https://www.linkedin.com/in/jane-doe" });
  assert.deepEqual(Object.keys(r.errors), ["reddit"]);
  const clean = normalizeSocials({ x: "@jane" });
  assert.equal(clean.ok, true);
  assert.deepEqual(normalizeSocials(null), { ok: true, value: {}, errors: {} });
});

test("a stored value is only drawn as a link when it is exactly a clean canonical address", () => {
  assert.equal(safeSocialUrl("x", "https://x.com/jane"), "https://x.com/jane");
  assert.equal(safeSocialUrl("x", "https://x.com/jane?utm=1"), null);
  assert.equal(safeSocialUrl("x", "javascript:alert(1)"), null);
  assert.equal(safeSocialUrl("x", "https://evil.example/jane"), null);
  assert.equal(safeSocialUrl("x", null), null);
  assert.equal(safeSocialUrl("x", 5), null);
  assert.deepEqual(socialsList({ facebook: "https://www.facebook.com/epicmkt.ke", x: "https://x.com/jane", reddit: "javascript:alert(1)", tiktok: "https://tiktok.com/@a" }).map((s) => s.key), ["x", "facebook"]);
  assert.deepEqual(socialsList(null), []);
  assert.deepEqual(socialsList({}), []);
});

test("every canonical address survives the round trip", () => {
  for (const [key, input] of [["x", "@jane"], ["instagram", "@jane"], ["linkedin", "company/epicmkt"], ["reddit", "r/Kenya"], ["facebook", "profile.php?id=5"]]) {
    const first = key === "facebook" ? "https://www.facebook.com/profile.php?id=5" : url(key, input);
    assert.equal(safeSocialUrl(key, first), first);
    assert.equal(url(key, socialInputOf(key, first)), first);
  }
});
