import { test } from "node:test";
import assert from "node:assert/strict";
import { CONVERSATION_FILTERS, countConversations, filterConversations, matchesSearch } from "./conversations.js";

const convo = (id, name, sellerId, extra = {}) => ({ id, name, sellerId, unread: 0, waiting: false, messages: [{ subject: "Hello", body: "Plain text" }], ...extra });
const list = [
  convo("a", "Lakeside Provisions", "ES100001", { unread: 2, messages: [{ subject: "Prices", body: "Please update your Unga prices" }] }),
  convo("b", "Fade Kings", "ES100002", { waiting: true }),
  convo("c", "Rafiki Tools", "ES100003", { waiting: true }),
  convo("d", "Mama Mboga", "ES100004"),
];
const resolved = new Set(["c", "d"]);

test("the four filters are All, Unread, Waiting for reply and Resolved, in that order", () => {
  assert.deepEqual(CONVERSATION_FILTERS.map((f) => f.label), ["All", "Unread", "Waiting for reply", "Resolved"]);
});

test("search matches business name, seller ID and message text, ignoring case and spacing", () => {
  assert.equal(matchesSearch(list[0], "  LAKESIDE "), true);
  assert.equal(matchesSearch(list[0], "es100001"), true);
  assert.equal(matchesSearch(list[0], "unga   prices"), true);
  assert.equal(matchesSearch(list[0], "kisumu"), false);
  assert.equal(matchesSearch(list[0], ""), true);
});

test("each filter keeps the right conversations", () => {
  const ids = (filter) => filterConversations(list, { filter, resolved }).map((c) => c.id);
  assert.deepEqual(ids("all"), ["a", "b", "c", "d"]);
  assert.deepEqual(ids("unread"), ["a"]);
  assert.deepEqual(ids("waiting"), ["b"], "a resolved conversation is not waiting");
  assert.deepEqual(ids("resolved"), ["c", "d"]);
});

test("filter and search combine", () => {
  assert.deepEqual(filterConversations(list, { filter: "resolved", search: "rafiki", resolved }).map((c) => c.id), ["c"]);
  assert.deepEqual(filterConversations(list, { filter: "unread", search: "rafiki", resolved }), []);
});

test("counts follow the search and match what each filter shows", () => {
  assert.deepEqual(countConversations(list, resolved), { all: 4, unread: 1, waiting: 1, resolved: 2 });
  assert.deepEqual(countConversations(list, resolved, "rafiki"), { all: 1, unread: 0, waiting: 0, resolved: 1 });
});
