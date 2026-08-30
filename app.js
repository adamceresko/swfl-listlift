(function () {
  "use strict";

  var STRIPE_LINK = "https://buy.stripe.com/8x2bIVa10aA3aM6dJp0RG00";
  var DATA_URL = "data/listings.json";

  var STYLE_FALLBACK = {
    "warm-modern": { id: "warm-modern", label: "Warm modern", line: "Walnut, linen, low seating." },
    florida: { id: "florida", label: "Cozy Florida traditional", line: "Light oak, rattan, airy." }
  };

  var catalog = { listings: [], styles: [] };
  var ready = false;
  var loadError = false;

  var state = {
    query: "",
    matches: null,
    photoId: null,
    styleId: null,
    step: "gallery",
    homeTab: "empty",
    styleTab: "current"
  };

  var app = document.getElementById("app");

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(n);
  }

  function facts(listing) {
    var parts = [money(listing.price), listing.beds + " bed", listing.baths + " bath"];
    if (listing.sqft) parts.push(Number(listing.sqft).toLocaleString("en-US") + " sqft");
    return parts.join(" · ");
  }

  function cityLine(listing) {
    var line = listing.city + ", " + listing.state;
    if (listing.zip) line += " " + listing.zip;
    return line;
  }

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[#.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function route() {
    var path = (location.pathname || "/").replace(/\/+$/, "") || "/";
    var match = path.match(/^\/l\/([^/]+)$/);
    if (match) return { name: "listing", slug: decodeURIComponent(match[1]) };
    return { name: "home" };
  }

  function photoOf(listing, id) {
    var i;
    if (!listing || !listing.photos) return null;
    for (i = 0; i < listing.photos.length; i += 1) {
      if (listing.photos[i].id === id) return listing.photos[i];
    }
    return listing.photos[0] || null;
  }

  function styleMeta(id) {
    var i;
    if (catalog.styles) {
      for (i = 0; i < catalog.styles.length; i += 1) {
        if (catalog.styles[i].id === id) return catalog.styles[i];
      }
    }
    return STYLE_FALLBACK[id] || { id: id, label: id, line: "" };
  }

  function searchListings(q) {
    var n = normalize(q);
    var out = [];
    var i;
    var listing;
    var hay;
    if (n.length < 3 || !catalog.listings) return out;
    for (i = 0; i < catalog.listings.length; i += 1) {
      listing = catalog.listings[i];
      hay = normalize(
        [
          listing.address,
          listing.city,
          listing.state,
          listing.zip,
          listing.slug,
          listing.address + " " + listing.city
        ].join(" ")
      );
      if (hay.indexOf(n) !== -1 || n.indexOf(normalize(listing.address)) !== -1) {
        out.push(listing);
      }
    }
    return out;
  }

  function stripeHref(listing, styleId) {
    var url = new URL(STRIPE_LINK);
    if (listing && listing.slug) {
      url.searchParams.set(
        "client_reference_id",
        styleId ? listing.slug + ":" + styleId : listing.slug
      );
    }
    return url.toString();
  }

  function photoUrl(photo) {
    return photo && photo.url ? photo.url : "";
  }

  function styleUrl(photo, styleId) {
    if (photo && photo.styles && photo.styles[styleId]) return photo.styles[styleId];
    return photoUrl(photo);
  }

  function imgTag(opts) {
    var cls = opts.className ? " class=\"" + esc(opts.className) + "\"" : "";
    if (!opts.src) {
      return "<div class=\"ph" + (opts.className ? " " + esc(opts.className) : "") + "\" role=\"img\" aria-label=\"" + esc(opts.alt) + "\"><span>DEMO</span></div>";
    }
    var fallback = opts.fallback
      ? " onerror=\"this.onerror=null;this.src='" + esc(opts.fallback) + "'\""
      : "";
    return "<img" + cls + " src=\"" + esc(opts.src) + "\" alt=\"" + esc(opts.alt) + "\" width=\"1200\" height=\"800\"" + fallback + ">";
  }

  function demoImg(kind, alt) {
    return imgTag({
      src: "img/demo-" + kind + ".png",
      fallback: "img/demo-" + kind + ".svg",
      alt: alt
    });
  }

  function listingImg(photo, alt) {
    return imgTag({ src: photoUrl(photo), alt: alt });
  }

  function navHtml(payHref, payLabel, extra) {
    return (
      "<header class=\"nav\"><div class=\"wrap nav-inner\">" +
      "<a class=\"brand\" href=\"/\">SWFL ListLift</a>" +
      "<a class=\"nav-pay\" href=\"" + esc(payHref || "/#pay") + "\"" + (extra || "") + ">" +
      esc(payLabel || "Pay $99") +
      "</a></div></header>"
    );
  }

  function footerHtml() {
    return (
      "<footer class=\"footer\"><div class=\"wrap\">" +
      "SWFL ListLift · Southwest Florida · " +
      "<a href=\"mailto:hello@swfl-listlift.com\">hello@swfl-listlift.com</a>" +
      " · not a real estate brokerage</div></footer>"
    );
  }

  function renderHome() {
    var results = "";
    var tab = state.homeTab;
    var i;
    var listing;

    document.title = "SWFL ListLift — $99 for every empty interior";

    if (loadError) {
      results =
        "<div class=\"notice\" role=\"status\"><p>Could not load listings. Refresh the page.</p></div>";
    } else if (state.matches && state.matches.length === 0) {
      results =
        "<div class=\"notice\" role=\"status\">" +
        "<p>That address is not in this list. We do not invent a house.</p>" +
        "<p>If this is your listing, email <a href=\"mailto:hello@swfl-listlift.com\">hello@swfl-listlift.com</a>.</p>" +
        "</div>";
    } else if (state.matches && state.matches.length > 1) {
      results = "<ul class=\"results\">";
      for (i = 0; i < state.matches.length; i += 1) {
        listing = state.matches[i];
        results +=
          "<li><a href=\"/l/" + esc(listing.slug) + "\">" +
          "<strong>" + esc(listing.address) + "</strong>" +
          "<span>" + esc(cityLine(listing)) + " · " + esc(facts(listing)) + "</span>" +
          "</a></li>";
      }
      results += "</ul>";
    }

    return (
      navHtml("#pay") +
      "<main><section class=\"hero\"><div class=\"wrap\">" +
      "<p class=\"kicker\">One listing · one address · $99</p>" +
      "<h1>Every empty interior. One style. Twenty-four hours.</h1>" +
      "<p class=\"lede\">Enter the listing address. Pick a photo. Pick Warm modern or Cozy Florida traditional. Pay $99 — that is the license. Virtually Staged on every file.</p>" +
      "<form class=\"lookup\" id=\"lookup\" action=\"/\" method=\"get\">" +
      "<label class=\"lookup-label\" for=\"address\">Listing address</label>" +
      "<div class=\"lookup-row\">" +
      "<input id=\"address\" name=\"address\" type=\"text\" autocomplete=\"street-address\" placeholder=\"Enter the listing address.\" value=\"" + esc(state.query) + "\" required minlength=\"3\">" +
      "<button type=\"submit\">Look up</button>" +
      "</div></form>" +
      results +
      "<div class=\"sample\">" +
      "<p class=\"sample-kicker\">Sample</p>" +
      "<div class=\"trio\" data-trio=\"home\">" +
      "<div class=\"trio-tabs\" role=\"tablist\" aria-label=\"Sample styles\">" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "empty") + "\" data-tab=\"empty\">Current</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "warm-modern") + "\" data-tab=\"warm-modern\">Warm modern</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "florida") + "\" data-tab=\"florida\">Florida</button>" +
      "</div>" +
      "<div class=\"trio-frames\">" +
      "<figure class=\"frame" + (tab === "empty" ? " is-on" : "") + "\">" +
      demoImg("empty", "Sample empty interior, labeled DEMO") +
      "<figcaption>Current</figcaption></figure>" +
      "<figure class=\"frame badge" + (tab === "warm-modern" ? " is-on" : "") + "\">" +
      demoImg("warm-modern", "Sample warm modern staging, labeled DEMO") +
      "<figcaption>Warm modern</figcaption></figure>" +
      "<figure class=\"frame badge" + (tab === "florida" ? " is-on" : "") + "\">" +
      demoImg("florida", "Sample cozy Florida traditional staging, labeled DEMO") +
      "<figcaption>Cozy Florida traditional</figcaption></figure>" +
      "</div></div>" +
      "<p class=\"caption\">Sample only. Not a real listing.</p>" +
      "</div></div></section>" +
      "<section class=\"band\"><div class=\"wrap\">" +
      "<h2>How it works</h2>" +
      "<ol class=\"steps\">" +
      "<li><strong>Enter the address</strong><span>We open that listing. A link we send you skips this box.</span></li>" +
      "<li><strong>Pick one photo</strong><span>Every listing photo is there. You choose the room.</span></li>" +
      "<li><strong>Pick a style</strong><span>Warm modern or Cozy Florida traditional. Furniture and decor only. Walls, windows, floors, views, and the camera stay as shot.</span></li>" +
      "<li><strong>Pay $99</strong><span>That licenses that address. Every empty interior. Files in 24 hours. Virtually Staged on every file.</span></li>" +
      "</ol></div></section>" +
      "<section class=\"band\"><div class=\"wrap split\"><div>" +
      "<h2>What you get</h2><ul>" +
      "<li>Furniture and decor on your existing photos</li>" +
      "<li>Every empty interior on that listing</li>" +
      "<li>One style across the unit</li>" +
      "<li>Virtually Staged on every file</li>" +
      "<li>Use on MLS, flyers, and social for that address</li>" +
      "<li>One free scale revision</li>" +
      "</ul></div><div>" +
      "<h2>What you don’t</h2><ul>" +
      "<li>Walls, windows, floors, views, and the camera do not move</li>" +
      "<li>No pools, no added views, no construction that is not there</li>" +
      "<li>Not a license for other addresses</li>" +
      "<li>Not a brokerage. We are not your agent.</li>" +
      "</ul></div></div></section>" +
      "<section class=\"band\"><div class=\"wrap photo-rule\">" +
      "<h2>The photo rule</h2>" +
      "<p>Furniture and decor only. Walls, windows, floors, views, and the camera stay as shot.</p>" +
      "</div></section>" +
      "<section class=\"band\"><div class=\"wrap terms-short\">" +
      "<h2>Terms</h2>" +
      "<p>Pay $99 is your signature. That is an address-only license. Virtually Staged stays on every file. No refund after files are sent. One free revision if scale is wrong. Florida.</p>" +
      "<p><a href=\"terms.html\">Full order terms</a></p>" +
      "</div></section>" +
      "<section class=\"pay\" id=\"pay\"><div class=\"wrap\">" +
      "<h2>Pay $99</h2>" +
      "<p>Start with the address above. Payment is the signature. Files in 24 hours. Read the <a href=\"terms.html\">order terms</a> first.</p>" +
      "</div></section></main>" +
      footerHtml()
    );
  }

  function renderLoading() {
    document.title = "SWFL ListLift";
    return (
      navHtml("/#pay") +
      "<main class=\"listing\"><div class=\"wrap\"><p class=\"lede\">Loading the listing…</p></div></main>" +
      footerHtml()
    );
  }

  function renderMissing() {
    document.title = "Address not in this list — SWFL ListLift";
    return (
      navHtml("/#pay") +
      "<main class=\"listing\"><div class=\"wrap\">" +
      "<a class=\"back\" href=\"/\">Back to address</a>" +
      "<h1>That address is not in this list.</h1>" +
      "<p class=\"lede\">We do not invent a house. If this is your listing, email <a href=\"mailto:hello@swfl-listlift.com\">hello@swfl-listlift.com</a>.</p>" +
      "</div></main>" +
      footerHtml()
    );
  }

  function renderGallery(listing) {
    var html = "";
    var i;
    var photo;
    html += "<p class=\"ask\">Pick one photo.</p><div class=\"thumbs\">";
    for (i = 0; i < listing.photos.length; i += 1) {
      photo = listing.photos[i];
      html +=
        "<button type=\"button\" class=\"thumb\" data-photo=\"" + esc(photo.id) + "\">" +
        listingImg(photo, photo.label + " at " + listing.address) +
        "<span class=\"who\">" + esc(photo.label) + "</span></button>";
    }
    html += "</div>";
    return html;
  }

  function renderStyle(listing, photo) {
    var tab = state.styleTab;
    var warm = styleMeta("warm-modern");
    var florida = styleMeta("florida");
    var currentSrc = photoUrl(photo);
    var warmSrc = styleUrl(photo, "warm-modern");
    var floridaSrc = styleUrl(photo, "florida");

    return (
      "<button type=\"button\" class=\"back\" data-step=\"gallery\">Back to photos</button>" +
      "<p class=\"ask\">Pick a style for this room.</p>" +
      "<div class=\"trio\" data-trio=\"style\">" +
      "<div class=\"trio-tabs\" role=\"tablist\" aria-label=\"Room style\">" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "current") + "\" data-tab=\"current\">Current</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "warm-modern") + "\" data-tab=\"warm-modern\">Warm modern</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "florida") + "\" data-tab=\"florida\">Florida</button>" +
      "</div>" +
      "<div class=\"style-pick\">" +
      "<figure class=\"style-card is-ref frame" + (tab === "current" ? " is-on" : "") + "\">" +
      imgTag({ src: currentSrc, alt: "Current photo, " + photo.label }) +
      "<figcaption class=\"who\">Current</figcaption></figure>" +
      "<button type=\"button\" class=\"style-card frame" + (tab === "warm-modern" ? " is-on" : "") + "\" data-style=\"warm-modern\">" +
      imgTag({ src: warmSrc, alt: "Warm modern look for " + photo.label }) +
      "<span class=\"who\">" + esc(warm.label) + "</span>" +
      "<span class=\"line\">" + esc(warm.line) + "</span></button>" +
      "<button type=\"button\" class=\"style-card frame" + (tab === "florida" ? " is-on" : "") + "\" data-style=\"florida\">" +
      imgTag({ src: floridaSrc, alt: "Florida look for " + photo.label }) +
      "<span class=\"who\">" + esc(florida.label) + "</span>" +
      "<span class=\"line\">" + esc(florida.line) + "</span></button>" +
      "</div></div>" +
      "<p class=\"rule-line\">Same photo. You pick the look. We stage every empty interior after pay.</p>" +
      "<p class=\"rule-line\">Furniture and decor only. Walls, windows, floors, views, and the camera stay as shot.</p>"
    );
  }

  function renderConfirm(listing) {
    var style = styleMeta(state.styleId);
    return (
      "<button type=\"button\" class=\"back\" data-step=\"style\">Back to styles</button>" +
      "<div class=\"confirm-box\">" +
      "<p class=\"tag\">" + esc(style.label) + "</p>" +
      "<p class=\"dollars\">$99</p>" +
      "<p>Every empty interior on this listing. Virtually Staged on every file. 24 hour delivery.</p>" +
      "<ul>" +
      "<li>Furniture and decor on your existing photos</li>" +
      "<li>One style across the unit</li>" +
      "<li>Use on MLS, flyers, and social for this address</li>" +
      "<li>One free scale revision</li>" +
      "</ul>" +
      "<p>Pay $99 is your signature. Address-only license.</p>" +
      "</div>"
    );
  }

  function renderPayBand(listing) {
    var pay = stripeHref(listing, state.styleId);
    return (
      "<section class=\"pay\" id=\"pay\"><div class=\"wrap\">" +
      "<h2>Pay $99</h2>" +
      "<p>Payment licenses " + esc(listing.address) + ". Files in 24 hours. Read the <a href=\"terms.html\">order terms</a> first.</p>" +
      "<a class=\"btn\" href=\"" + esc(pay) + "\" rel=\"noopener noreferrer\">Pay $99</a>" +
      "</div></section>"
    );
  }

  function renderListing(listing) {
    var photo = photoOf(listing, state.photoId);
    var body;
    var payBand = "";
    var confirming = state.step === "confirm" && state.styleId && photo;
    document.title = listing.address + " — SWFL ListLift";

    if (confirming) {
      body = renderConfirm(listing);
      payBand = renderPayBand(listing);
    } else if (state.step === "style" && photo) {
      body = renderStyle(listing, photo);
    } else {
      body = renderGallery(listing);
    }

    return (
      navHtml(confirming ? stripeHref(listing, state.styleId) : "/#pay") +
      "<main>" +
      "<section class=\"listing\"><div class=\"wrap\">" +
      "<a class=\"back\" href=\"/\">Back to address</a>" +
      "<h1>" + esc(listing.address) + "</h1>" +
      "<p class=\"facts\">" + esc(cityLine(listing)) + "</p>" +
      "<p class=\"facts\">" + esc(facts(listing)) + "</p>" +
      (listing.agent_name ? "<p class=\"facts\">Agent: " + esc(listing.agent_name) + "</p>" : "") +
      (listing.listing_url ? "<p class=\"facts\"><a href=\"" + esc(listing.listing_url) + "\" rel=\"noopener noreferrer\">Listing</a></p>" : "") +
      body +
      "</div></section>" +
      payBand +
      "</main>" +
      footerHtml()
    );
  }

  function go(path, resetFlow) {
    if (location.pathname.replace(/\/+$/, "") !== String(path).replace(/\/+$/, "")) {
      history.pushState({}, "", path);
    }
    if (resetFlow !== false) {
      state.photoId = null;
      state.styleId = null;
      state.step = "gallery";
      state.styleTab = "current";
    }
    render();
    window.scrollTo(0, 0);
  }

  function bind() {
    var form = document.getElementById("lookup");
    var address;

    if (form) {
      form.addEventListener("submit", function (event) {
        var matches;
        event.preventDefault();
        address = document.getElementById("address");
        state.query = address ? address.value : "";
        if (!ready) return;
        matches = searchListings(state.query);
        state.matches = matches;
        if (matches.length === 1) {
          go("/l/" + matches[0].slug);
          return;
        }
        render();
        address = document.getElementById("address");
        if (address) address.focus();
      });
    }

    app.querySelectorAll("[data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var trio = btn.closest("[data-trio]");
        if (trio && trio.getAttribute("data-trio") === "home") {
          state.homeTab = btn.getAttribute("data-tab");
        } else {
          state.styleTab = btn.getAttribute("data-tab");
        }
        render();
      });
    });

    app.querySelectorAll("[data-photo]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.photoId = btn.getAttribute("data-photo");
        state.step = "style";
        state.styleTab = "current";
        state.styleId = null;
        render();
        window.scrollTo(0, 0);
      });
    });

    app.querySelectorAll("[data-style]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.styleId = btn.getAttribute("data-style");
        state.step = "confirm";
        render();
        window.scrollTo(0, 0);
      });
    });

    app.querySelectorAll("[data-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.step = btn.getAttribute("data-step");
        if (state.step !== "confirm") state.styleId = null;
        render();
        window.scrollTo(0, 0);
      });
    });

    app.querySelectorAll('a[href="/"], a[href^="/l/"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        var href;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        href = link.getAttribute("href");
        if (href === "/") {
          state.matches = null;
          go("/");
          return;
        }
        go(href);
      });
    });

    if (location.hash === "#pay") {
      var pay = document.getElementById("pay");
      if (pay) pay.scrollIntoView();
    }
  }

  function render() {
    var current = route();
    var listing;
    var i;

    if (!app) return;

    if (current.name === "home") {
      app.innerHTML = renderHome();
      bind();
      return;
    }

    if (!ready) {
      app.innerHTML = renderLoading();
      bind();
      return;
    }

    listing = null;
    for (i = 0; i < catalog.listings.length; i += 1) {
      if (catalog.listings[i].slug === current.slug) {
        listing = catalog.listings[i];
        break;
      }
    }

    if (!listing) {
      app.innerHTML = renderMissing();
      bind();
      return;
    }

    if (state.step !== "gallery" && !photoOf(listing, state.photoId)) {
      state.step = "gallery";
      state.photoId = null;
      state.styleId = null;
    }

    app.innerHTML = renderListing(listing);
    bind();
  }

  function init() {
    render();
    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("listings");
        return res.json();
      })
      .then(function (data) {
        catalog = data && data.listings ? data : { listings: [], styles: [] };
        ready = true;
        render();
      })
      .catch(function () {
        loadError = true;
        ready = true;
        render();
      });

    window.addEventListener("popstate", function () {
      state.photoId = null;
      state.styleId = null;
      state.step = "gallery";
      render();
    });
  }

  init();
})();
