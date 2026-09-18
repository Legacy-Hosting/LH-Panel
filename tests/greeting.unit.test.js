import assert from "node:assert/strict";
import { test } from "node:test";
import { greetingForHour } from "../src/greeting.js";

test("the local greeting follows morning, afternoon, and evening", () => {
  assert.equal(greetingForHour(0), "Good morning");
  assert.equal(greetingForHour(11), "Good morning");
  assert.equal(greetingForHour(12), "Good afternoon");
  assert.equal(greetingForHour(17), "Good afternoon");
  assert.equal(greetingForHour(18), "Good evening");
  assert.equal(greetingForHour(23), "Good evening");
});
