import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDevice } from "./device.js";

test("describeDevice", () => {
  assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0"), "Edge on Windows");
  assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1"), "Safari on iOS");
  assert.equal(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"), "Chrome on Android");
  assert.equal(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"), "Firefox on Linux");
  assert.equal(describeDevice(""), "Unknown device");
  assert.equal(describeDevice(null), "Unknown device");
});
