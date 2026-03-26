import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublishHashtagText,
  extractHashtags,
} from "../../../src/lib/tasks/presentation";

test("extractHashtags keeps order, uniqueness and caps at eight tags", () => {
  const hashtags = extractHashtags(
    "#one #two #two #three #four #five #six #seven #eight #nine",
  );

  assert.deepEqual(hashtags, [
    "#one",
    "#two",
    "#three",
    "#four",
    "#five",
    "#six",
    "#seven",
    "#eight",
  ]);
});

test("buildPublishHashtagText returns plain hashtags ready for posting", () => {
  const text = buildPublishHashtagText(
    "Great product **#GlowUp** #skincare #beauty, #tiktok #viral",
  );

  assert.equal(text, "#GlowUp #skincare #beauty #tiktok #viral");
});
