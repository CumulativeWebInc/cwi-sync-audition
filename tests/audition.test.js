/* Sync Audition Room OS-fit tests — data-truth guards. node --test */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "tracks.json"), "utf8"));
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

test("catalog shape: 24 tracks, unique spotify ids", () => {
  assert.equal(data.track_count, 24);
  assert.equal(data.tracks.length, 24);
  const ids = data.tracks.map((t) => t.spotify_id);
  assert.equal(new Set(ids).size, 24, "spotify ids unique");
  for (const t of data.tracks) {
    assert.ok(t.title && t.spotify_id, `track missing title/id`);
    assert.match(t.spotify_id, /^[A-Za-z0-9]{22}$/, `bad spotify id on ${t.title}`);
  }
});

test("VERIFIED placements: exactly 3, all on New Rap Hits, with live proof URLs", () => {
  const v = data.tracks.filter((t) => t.placement && t.placement.status === "VERIFIED");
  assert.equal(v.length, 3);
  for (const t of v) {
    assert.equal(t.placement.playlist, "New Rap Hits");
    assert.ok(t.placement.claim_url && t.placement.claim_url.startsWith("https://cumulativewebinc.github.io/cwi-trust-log/claims/"),
      `proof URL must point at the live trust log: ${t.title}`);
    assert.ok(!t.placement.claim_url.includes("clm_01M2N4M1"), `stale re-keyed claim id on ${t.title}`);
  }
});

test("clearance honesty: NOT pre-cleared, contact present", () => {
  assert.equal(data.clearance_policy.pre_cleared, false);
  assert.match(data.clearance_policy.note, /rights_certainty_claimed=false/);
  assert.equal(data.clearance_policy.sync_contact, "hp@cumulativeweb.com");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /clearance on request/, "neutral clearance chip in app.js");
});

test("mood tags labeled editorial", () => {
  assert.ok(data.mood_tag_note, "mood_tag_note present");
  assert.match(indexHtml, /Editorial tags/, "truth footer keeps editorial label");
});

test("logo is the official CWI logo", () => {
  const official = "d03d884a3e7a6426e5a8022433781448";
  const ours = crypto.createHash("md5").update(fs.readFileSync(path.join(ROOT, "cwi-logo.jpg"))).digest("hex");
  assert.equal(ours, official);
});

test("metadata stack present", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "llms.txt")));
  assert.ok(fs.existsSync(path.join(ROOT, ".well-known", "agent-card.json")));
  assert.ok(fs.existsSync(path.join(ROOT, ".nojekyll")));
  assert.match(indexHtml, /application\/ld\+json/, "JSON-LD present");
  assert.match(indexHtml, /og:title/, "Open Graph tags present");
});

test("above-fold CTA present", () => {
  assert.match(indexHtml, /cta-strip/, "CTA strip in markup");
  assert.match(indexHtml, /mailto:hp@cumulativeweb\.com/, "licensing contact CTA");
});
