import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  GOAL_GUIDANCE,
  GOAL_GUIDANCE_BY_ID,
  SUPPLIED_PRODUCT_GUIDANCE,
  validateGoalGuidance,
} from "../src/lib/concierge/research/goal-guidance.mjs";

const engine = readFileSync(new URL("../src/lib/concierge/research/chat-engine.mjs", import.meta.url), "utf8");
const products = readFileSync(new URL("../src/data/products.ts", import.meta.url), "utf8");
const topicIds = [...engine.matchAll(/^    id: "([^"]+)",$/gm)].map((match) => match[1]).slice(0, 40);
const productSlugs = [...products.matchAll(/^    slug: '([^']+)',$/gm)].map((match) => match[1]);

test("covers every existing topic and all 61 supplied products", () => {
  assert.equal(topicIds.length, 40);
  assert.equal(productSlugs.length, 61);
  assert.equal(GOAL_GUIDANCE.length, 40);
  assert.equal(SUPPLIED_PRODUCT_GUIDANCE.length, 61);
  assert.deepEqual(validateGoalGuidance({ topicIds, productSlugs }), []);
});

test("tanning resolves to one clear MT2 source match", () => {
  const tanning = GOAL_GUIDANCE_BY_ID.get("pigmentation");
  assert.equal(tanning.primarySlug, "melanotan-ii");
  assert.equal(tanning.maxVisible, 1);
  assert.deepEqual(tanning.shortlist.map((item) => item.name), ["MT2 (Melanotan II)"]);
  assert.ok(tanning.intentPhrases.includes("get a tan"));
  assert.ok(tanning.intentPhrases.includes("get darker"));
});

test("weight loss has exactly three reviewed choices in a fixed order", () => {
  const weight = GOAL_GUIDANCE_BY_ID.get("weight-loss");
  assert.equal(weight.maxVisible, 3);
  assert.deepEqual(weight.shortlist.map((item) => item.slug), ["retatrutide", "tirzepatide", "semaglutide"]);
  assert.deepEqual(weight.shortlist.map((item) => item.rank), [1, 2, 3]);
  assert.equal(new Set(weight.shortlist.map((item) => item.slug)).size, 3);
});

test("every visible explanation is concise, sourced and non-personal", () => {
  for (const item of GOAL_GUIDANCE.flatMap((entry) => entry.shortlist)) {
    assert.ok(item.oneLine.length <= 140);
    assert.ok(item.sourceBasis.length > 0);
    assert.doesNotMatch(item.oneLine, /\b(you should|best for you|safe for you|take|use)\b/i);
  }
});

test("non-recommendable supplies are explicit", () => {
  const supplies = SUPPLIED_PRODUCT_GUIDANCE.filter((item) => item.supplyOnly);
  assert.deepEqual(supplies.map((item) => item.slug).sort(), ["acetic-acid-06-10ml", "bac-water", "peptide-complex"]);
  assert.ok(supplies.every((item) => item.reason));
});
