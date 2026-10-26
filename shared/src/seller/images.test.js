import test from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_WIDTHS, MASTER_EDGE, cloudinaryUrl, deliveryTransform, imageSrcSet, imageUrl, isCloudinaryDelivery, isCloudinaryId,
  itemPhotoId, ownsImageId, resizeImageUrl, shopImageId, uploadTransformation,
} from "./images.js";

const BIZ = "10000000-0000-0000-0000-0000000000a1";
const ITEM = "20000000-0000-0000-0000-0000000000c1";
const UUID = "30000000-0000-0000-0000-0000000000d1";

test("a Cloudinary id has no file extension; a legacy Supabase path always does", () => {
  assert.equal(isCloudinaryId(`${BIZ}/${ITEM}/${UUID}`), true);
  assert.equal(isCloudinaryId(`${BIZ}/profile/logo-${UUID}`), true);
  assert.equal(isCloudinaryId(`${BIZ}/${ITEM}/${UUID}.jpg`), false);
  assert.equal(isCloudinaryId(`${BIZ}/${ITEM}/${UUID}.webp`), false);
  assert.equal(isCloudinaryId(`${BIZ}/${ITEM}/${UUID}.mp4`), false);
});

test("urls, blobs, traversal and empty values are never Cloudinary ids", () => {
  for (const v of [null, undefined, "", "blob:abc", "data:image/png;base64,AA", "https://x.test/a", `${BIZ}/../x`, 12, "a".repeat(301)]) {
    assert.equal(isCloudinaryId(v), false, String(v));
  }
});

test("delivery urls carry f_auto, a quality tier and a width from the ladder", () => {
  assert.equal(deliveryTransform(480), "f_auto,q_auto:eco,c_limit,w_480");
  assert.equal(deliveryTransform(800), "f_auto,q_auto:good,c_limit,w_800");
  assert.equal(deliveryTransform(2400), "f_auto,q_auto:best,c_limit,w_2400");
  assert.equal(deliveryTransform(350), "f_auto,q_auto:eco,c_limit,w_480", "rounds up to the next rung");
  assert.equal(deliveryTransform(99999), `f_auto,q_auto:best,c_limit,w_${MASTER_EDGE}`, "never past the master");
  assert.equal(deliveryTransform(undefined), `f_auto,q_auto:best,c_limit,w_${MASTER_EDGE}`);
  assert.equal(IMAGE_WIDTHS.at(-1), MASTER_EDGE);
});

test("cloudinaryUrl builds a url and refuses bad input", () => {
  assert.equal(
    cloudinaryUrl("demo", `${BIZ}/${ITEM}/${UUID}`, 480),
    `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:eco,c_limit,w_480/${BIZ}/${ITEM}/${UUID}`,
  );
  assert.equal(cloudinaryUrl("", `${BIZ}/x/y`), null);
  assert.equal(cloudinaryUrl("bad cloud!", `${BIZ}/x/y`), null);
  assert.equal(cloudinaryUrl("demo", `${BIZ}/x/y.jpg`), null);
});

test("imageUrl picks the store from the shape of the value", () => {
  const cfg = { cloudName: "demo", supabaseUrl: "https://p.supabase.co/", width: 320 };
  assert.match(imageUrl(`${BIZ}/${ITEM}/${UUID}`, cfg), /^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/f_auto,q_auto:eco,c_limit,w_320\//);
  assert.equal(imageUrl(`${BIZ}/${ITEM}/${UUID}.jpg`, cfg), `https://p.supabase.co/storage/v1/object/public/seller-media/${BIZ}/${ITEM}/${UUID}.jpg`);
  assert.equal(imageUrl("blob:abc", cfg), "blob:abc");
  assert.equal(imageUrl(null, cfg), null);
  assert.equal(imageUrl(`${BIZ}/${ITEM}/${UUID}`, { supabaseUrl: "https://p.supabase.co" }), null, "no cloud name, no url");
  assert.equal(imageUrl(`${BIZ}/${ITEM}/${UUID}.jpg`, { cloudName: "demo" }), null, "no supabase url, no legacy url");
});

test("resizeImageUrl swaps the width of our urls and leaves every other url alone", () => {
  const url = cloudinaryUrl("demo", `${BIZ}/${ITEM}/${UUID}`, 800);
  assert.equal(isCloudinaryDelivery(url), true);
  assert.equal(resizeImageUrl(url, 240), `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:eco,c_limit,w_240/${BIZ}/${ITEM}/${UUID}`);
  for (const other of ["blob:abc", "https://cdn.example.com/p.jpg", "https://x.supabase.co/storage/v1/object/public/seller-media/a/b.jpg", null]) {
    assert.equal(resizeImageUrl(other, 240), other);
    assert.equal(imageSrcSet(other), undefined);
  }
  assert.match(imageSrcSet(url), /w_240\/.* 240w, .*w_480\/.* 480w, .*w_800\/.* 800w, .*w_1200\/.* 1200w, .*w_1600\/.* 1600w$/);
});

test("the upload transformation always lands on a 4K long side, with the AI upscaler only when asked for", () => {
  assert.equal(uploadTransformation(), "c_fit,w_3840,h_3840/q_auto:best");
  assert.equal(uploadTransformation({ aiUpscale: false }), "c_fit,w_3840,h_3840/q_auto:best");
  assert.equal(uploadTransformation({ aiUpscale: true }), "if_w_lt_960_and_h_lt_960/e_upscale/if_end/c_fit,w_3840,h_3840/q_auto:best");
});

test("ids are built under the business prefix and ownership is checked by that prefix", () => {
  const photo = itemPhotoId(BIZ, ITEM, UUID);
  const logo = shopImageId(BIZ, "logo", UUID);
  assert.equal(photo, `${BIZ}/${ITEM}/${UUID}`);
  assert.equal(logo, `${BIZ}/profile/logo-${UUID}`);
  assert.equal(ownsImageId(BIZ, photo), true);
  assert.equal(ownsImageId(BIZ, logo), true);
  assert.equal(ownsImageId("10000000-0000-0000-0000-0000000000b1", photo), false);
  assert.equal(ownsImageId(BIZ, `${BIZ}/../other/x`), false);
  assert.equal(ownsImageId(BIZ, `${BIZ}/${ITEM}/${UUID}.jpg`), false);
});
