/* Sync Audition Room — renders from tracks.json (real data only, no invented metrics). */
(function () {
  "use strict";

  var EMBED_BASE = "https://open.spotify.com/embed/track/";
  var state = { tracks: [], query: "", tag: "All" };

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // i18n: every literal CWI18n.t call with a quoted key below is extracted by
  // the cwi-i18n retrofit test (tests/check.py); keep each call a quoted literal.
  // The || English fallback keeps the page working when the loader (or a
  // language table) is unavailable. The loader also auto-translates any
  // data-i18n* attributes inside rendered templates.
  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
    });
  }

  // Pure helper: resolve a ?track= param to a track, or null. Testable via findTrackById.
  function findTrackById(tracks, spotifyId) {
    if (!spotifyId || typeof spotifyId !== "string") return null;
    var t = tracks.filter(function (x) { return x.spotify_id === spotifyId; })[0];
    return t || null;
  }

  function explicitBadge(explicit) {
    if (explicit === true) return '<span class="badge explicit">E</span>';
    if (explicit === false) return '<span class="badge clean" data-i18n="card.clean_badge">Clean</span>';
    return ""; // null/unknown: never invent a rating
  }

  // VERIFIED badges link to the cryptographic proof in the CWI Trust Log.
  // Gated on claim_url: a badge with no live proof URL renders unlinked —
  // never ship a dead proof link.
  function placementHtml(p) {
    if (!p || p.status !== "VERIFIED") return "";
    // "VERIFIED" is a CWI protocol tier term: kept in English in every language.
    var badge = p.claim_url
      ? '<a class="verified verified-proof" href="' + esc(p.claim_url) + '" target="_blank" rel="noopener" data-i18n-title="card.proof_title" title="View cryptographic proof in the CWI Trust Log" data-i18n="card.placement_badge">VERIFIED placement</a>'
      : '<span class="verified" data-i18n="card.placement_badge">VERIFIED placement</span>';
    return (
      '<div class="placement">' + badge + " — " +
      esc(p.playlist) + ' <a href="' + esc(p.playlist_url) + '" target="_blank" rel="noopener" data-i18n="card.playlist_word">playlist</a>' +
      ', <span data-i18n="card.position_word">position</span> ' + esc(p.position) +
      ', <span data-i18n="card.scan_word">scan</span> ' + esc(p.scan_date) + "</div>"
    );
  }

  function cardHtml(t, clearanceContact) {
    var tags = (t.mood_tags || []).map(function (m) {
      return '<span class="mood-tag">' + esc(m) + "</span>";
    }).join("");
    // Data truth (tracks.json clearance_policy): NOT pre-cleared — no pre-signed paperwork
    // on file, machine tier UNVERIFIED. Human presentation is the neutral
    // "clearance on request" chip below; the .unverified red tier in styles.css is
    // untouched for genuinely unproven claims elsewhere.
    return (
      '<article class="card" data-spotify-id="' + esc(t.spotify_id) + '">' +
      '<div class="card-top"><h3 class="card-title">' + esc(t.title) + "</h3>" + explicitBadge(t.explicit) + "</div>" +
      '<div class="tag-row"><span class="tag-label" data-i18n="card.tags_label">editorial tags</span>' + tags + "</div>" +
      '<iframe class="spotify-embed" loading="lazy" title="Spotify player: ' + esc(t.title) + '"' +
      ' src="' + EMBED_BASE + esc(t.spotify_id) + '" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>' +
      placementHtml(t.placement) +
      '<div class="clearance">' +
      fill(((typeof CWI18n !== "undefined") && CWI18n.t("card.clearance_line")) || "Sync licensing: one-stop via {email} · terms confirmed on request",
        { email: '<a href="mailto:' + esc(clearanceContact) + '">' + esc(clearanceContact) + "</a>" }) +
      ' <span class="tier-neutral" data-i18n="card.clearance_chip">clearance on request</span></div>' +
      '<div class="card-actions"><button class="share-btn" type="button" data-share="' + esc(t.spotify_id) + '" data-i18n="card.share">Share deep link</button></div>' +
      "</article>"
    );
  }

  function allTags(tracks) {
    var seen = {}, out = [];
    tracks.forEach(function (t) {
      (t.mood_tags || []).forEach(function (m) {
        if (!seen[m]) { seen[m] = true; out.push(m); }
      });
    });
    return out.sort();
  }

  function renderChips() {
    var tags = ["All"].concat(allTags(state.tracks));
    var box = document.getElementById("moodChips");
    var allLabel = ((typeof CWI18n !== "undefined") && CWI18n.t("chips.all")) || "All";
    box.innerHTML = tags.map(function (tag) {
      return '<button class="chip" type="button" data-tag="' + esc(tag) + '" aria-pressed="' +
        (state.tag === tag ? "true" : "false") + '">' + (tag === "All" ? esc(allLabel) : esc(tag)) + "</button>";
    }).join("");
  }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    return state.tracks.filter(function (t) {
      var okTag = state.tag === "All" || (t.mood_tags || []).indexOf(state.tag) !== -1;
      var okQ = !q || t.title.toLowerCase().indexOf(q) !== -1;
      return okTag && okQ;
    });
  }

  function renderGrid(data) {
    var list = filtered();
    var grid = document.getElementById("trackGrid");
    grid.innerHTML = list.map(function (t) { return cardHtml(t, data.clearance_policy.sync_contact); }).join("");
    document.getElementById("resultsCount").textContent =
      fill(((typeof CWI18n !== "undefined") && CWI18n.t("results.count")) || "{shown} of {total} tracks",
        { shown: list.length, total: state.tracks.length });
  }

  function renderStats(data) {
    var verified = state.tracks.filter(function (t) { return t.placement && t.placement.status === "VERIFIED"; });
    var scanDate = verified.length ? verified[0].placement.scan_date : null;
    var zooted = (data.metrics.track_metrics && data.metrics.track_metrics["Zooted Zone"]) || null;
    var pills = [
      fill(((typeof CWI18n !== "undefined") && CWI18n.t("stats.tracks")) || "{n} tracks",
        { n: "<strong>" + state.tracks.length + "</strong>" }),
      fill(((typeof CWI18n !== "undefined") && CWI18n.t("stats.placements")) || "{n} verified placements",
        { n: "<strong>" + verified.length + "</strong>" }) +
        (scanDate ? " " + fill(((typeof CWI18n !== "undefined") && CWI18n.t("stats.scan")) || "(scan {date})",
          { date: esc(scanDate) }) : ""),
      fill(((typeof CWI18n !== "undefined") && CWI18n.t("stats.listeners")) || "{n} monthly listeners (observed {date})",
        { n: "<strong>" + esc(data.metrics.monthly_listeners) + "</strong>", date: esc(data.metrics.observed) })
    ];
    if (zooted) {
      pills.push(fill(((typeof CWI18n !== "undefined") && CWI18n.t("stats.lifetime")) || "{n} lifetime plays — Zooted Zone (catalog-reported)",
        { n: "<strong>" + esc(zooted.lifetime_spotify_plays.toLocaleString("en-US")) + "</strong>" }));
    }
    document.getElementById("statsStrip").innerHTML =
      pills.map(function (p) { return '<span class="stat-pill">' + p + "</span>"; }).join("");
  }

  function deepLink(spotifyId) {
    return window.location.origin + window.location.pathname + "?track=" + encodeURIComponent(spotifyId);
  }

  function handleDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var track = findTrackById(state.tracks, params.get("track"));
    if (!track) return;
    // Clear filters so the target is visible, then highlight + scroll.
    state.query = "";
    state.tag = "All";
    document.getElementById("searchBox").value = "";
    renderChips();
    renderGrid(window.__data);
    var el = document.querySelector('[data-spotify-id="' + track.spotify_id + '"]');
    if (el) {
      el.classList.add("highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function bindEvents(data) {
    document.getElementById("searchBox").addEventListener("input", function (e) {
      state.query = e.target.value;
      renderGrid(data);
    });
    document.getElementById("moodChips").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tag]");
      if (!btn) return;
      state.tag = btn.getAttribute("data-tag");
      renderChips();
      renderGrid(data);
    });
    document.getElementById("trackGrid").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-share]");
      if (!btn) return;
      var link = deepLink(btn.getAttribute("data-share"));
      function done() {
        btn.classList.add("copied");
        btn.textContent = ((typeof CWI18n !== "undefined") && CWI18n.t("card.share_copied")) || "Link copied";
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.textContent = ((typeof CWI18n !== "undefined") && CWI18n.t("card.share")) || "Share deep link";
        }, 2000);
      }
      var promptTitle = ((typeof CWI18n !== "undefined") && CWI18n.t("card.share_prompt")) || "Copy deep link:";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { window.prompt(promptTitle, link); });
      } else {
        window.prompt(promptTitle, link);
      }
    });
  }

  // Browser-only bootstrap: guarded so the pure helpers stay require()-able in node tests.
  if (typeof document !== "undefined") {
    fetch("tracks.json")
      .then(function (r) { if (!r.ok) throw new Error("tracks.json load failed: " + r.status); return r.json(); })
      .then(function (data) {
        window.__data = data;
        state.tracks = data.tracks;
        renderStats(data);
        renderChips();
        renderGrid(data);
        bindEvents(data);
        handleDeepLink();
      })
      .catch(function (err) {
        document.getElementById("trackGrid").innerHTML =
          "<p>" + esc(((typeof CWI18n !== "undefined") && CWI18n.t("app.load_error")) || "Could not load the catalog data. Please reload.") + "</p>";
        console.error(err);
      });
  }

  // Expose pure helpers for tests (harmless in browser).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { findTrackById: findTrackById, esc: esc, placementHtml: placementHtml };
  }
})();
