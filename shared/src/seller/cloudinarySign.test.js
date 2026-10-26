import test from "node:test";
import assert from "node:assert/strict";
import { signParams, signingString, verifyResponseSignature } from "./cloudinarySign.js";

// The worked example from Cloudinary's "Generating authentication signatures" page.
const docs = { eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: "1315060510" };

test("matches the signature published in Cloudinary's documentation", async () => {
  assert.equal(signingString(docs), "eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510");
  assert.equal(await signParams(docs, "abcd", "sha1"), "bfd09f95f331f558cbd1320e67aa8d488770583e");
});

test("parameters are sorted, and file / cloud_name / resource_type / api_key / empty values are left out", async () => {
  const noisy = { timestamp: 1, file: "x", api_key: "k", cloud_name: "c", resource_type: "image", folder: "", public_id: "p", tags: undefined };
  assert.equal(signingString(noisy), "public_id=p&timestamp=1");
});

test("SHA-256 is the default and differs from SHA-1", async () => {
  const a = await signParams(docs, "abcd");
  assert.equal(a.length, 64);
  assert.notEqual(a, await signParams(docs, "abcd", "sha1"));
  assert.notEqual(a, await signParams(docs, "other"));
});

test("a response signature is accepted for either algorithm, and refused when anything differs", async () => {
  const sha1 = await signParams({ public_id: "sample", version: "1315060510" }, "abcd", "sha1");
  const sha256 = await signParams({ public_id: "sample", version: "1315060510" }, "abcd", "sha256");
  assert.equal(await verifyResponseSignature({ publicId: "sample", version: 1315060510, signature: sha1 }, "abcd"), true);
  assert.equal(await verifyResponseSignature({ publicId: "sample", version: "1315060510", signature: sha256 }, "abcd"), true);
  assert.equal(await verifyResponseSignature({ publicId: "other", version: "1315060510", signature: sha1 }, "abcd"), false);
  assert.equal(await verifyResponseSignature({ publicId: "sample", version: "1315060511", signature: sha1 }, "abcd"), false);
  assert.equal(await verifyResponseSignature({ publicId: "sample", version: "1315060510", signature: sha1 }, "wrong"), false);
  assert.equal(await verifyResponseSignature({ publicId: "sample", version: "1315060510", signature: "" }, "abcd"), false);
  assert.equal(await verifyResponseSignature({ publicId: "sample", signature: sha1 }, "abcd"), false);
});
