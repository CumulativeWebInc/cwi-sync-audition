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

  // Pure helper: resolve a ?track= param to a track, or null. Testable via findTrackById.
  function findTrackById(tracks, spotifyId) {
    if (!spotifyId || typeof spotifyId !== "string") return null;
    var t = tracks.filter(function (x) { return x.spotify_id === spotifyId; })[0];
    return t || null;
  }

  function explicitBadge(explicit) {
    if (explicit === true) return '<span class="badge explicit">E</span>';
    if (explicit === false) return '<span class="badge clean">Clean</span>';
    return ""; // null/unknown: never invent a rating
  }

  function placementHtml(p) {
    if (!p || p.status !== "VERIFIED") return "";
    return (
      '<div class="placement"><span class="verified">VERIFIED placement</span> — ' +
      esc(p.playlist) + ' <a href="' + esc(p.playlist_url) + '" target="_blank" rel="noopener">playlist</a>' +
      ", position " + esc(p.position) + ", scan " + esc(p.scan_date) + "</div>"
    );
  }

  function cardHtml(t, clearanceContact) {
    var tags = (t.mood_tags || []).map(function (m) {
      return '<span class="mood-tag">' + esc(m) + "</span>";
    }).join("");
    return (
      '<article class="card" data-spotify-id="' + esc(t.spotify_id) + '">' +
      '<div class="card-top"><h3 class="card-title">' + esc(t.title) + "</h3>" + explicitBadge(t.explicit) + "</div>" +
      '<div class="tag-row"><span class="tag-label">editorial tags</span>' + tags + "</div>" +
      '<iframe class="spotify-embed" loading="lazy" title="Spotify player: ' + esc(t.title) + '"' +
      ' src="' + EMBED_BASE + esc(t.spotify_id) + '" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>' +
      placementHtml(t.placement) +
      '<div class="clearance">Clearance: NOT pre-cleared — contact ' +
      '<a href="mailto:' + esc(clearanceContact) + '">' + esc(clearanceContact) + "</a>" +
      '<span class="unverified">UNVERIFIED</span></div>' +
      '<div class="card-actions"><button class="share-btn" type="button" data-share="' + esc(t.spotify_id) + '">Share deep link</button></div>' +
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
    box.innerHTML = tags.map(function (tag) {
      return '<button class="chip" type="button" data-tag="' + esc(tag) + '" aria-pressed="' +
        (state.tag === tag ? "true" : "false") + '">' + esc(tag) + "</button>";
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
      list.length + " of " + state.tracks.length + " tracks";
  }

  function renderStats(data) {
    var verified = state.tracks.filter(function (t) { return t.placement && t.placement.status === "VERIFIED"; });
    var scanDate = verified.length ? verified[0].placement.scan_date : null;
    var zooted = (data.metrics.track_metrics && data.metrics.track_metrics["Zooted Zone"]) || null;
    var pills = [
      "<strong>" + state.tracks.length + "</strong> tracks",
      "<strong>" + verified.length + "</strong> verified placements" + (scanDate ? " (scan " + esc(scanDate) + ")" : ""),
      "<strong>" + esc(data.metrics.monthly_listeners) + "</strong> monthly listeners (observed " + esc(data.metrics.observed) + ")"
    ];
    if (zooted) {
      pills.push('<strong>' + esc(zooted.lifetime_spotify_plays.toLocaleString("en-US")) +
        "</strong> lifetime plays — Zooted Zone (catalog-reported)");
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
        btn.textContent = "Link copied";
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.textContent = "Share deep link";
        }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { window.prompt("Copy deep link:", link); });
      } else {
        window.prompt("Copy deep link:", link);
      }
    });
  }

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
        "<p>Could not load the catalog data. Please reload.</p>";
      console.error(err);
    });

  // Expose pure helpers for tests (harmless in browser).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { findTrackById: findTrackById, esc: esc };
  }
})();
