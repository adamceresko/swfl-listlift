(function () {
  "use strict";

  var STRIPE_LINK = "https://buy.stripe.com/8x2bIVa10aA3aM6dJp0RG00";
  var LANDOVER_STRIPE = "https://buy.stripe.com/eVqaER7SS7nR6vQ9t90RG01";
  var DATA_URL = "data/listings.json";
  var MIXPANEL_TOKEN = "c3094cb7b0fee96f8f26ee8942b3a720";

  var STYLE_NAMES = {
    current: "current",
    "warm-modern": "warm_modern",
    florida: "florida_cozy",
    "florida-cozy": "florida_cozy"
  };

  var STYLE_FALLBACK = {
    "warm-modern": { id: "warm-modern", label: "Warm modern", line: "Walnut, linen, low seating." },
    florida: { id: "florida", label: "Florida cozy", line: "Light oak, rattan, airy." }
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
  var lastPageKey = null;

  function initAnalytics() {
    if (window.llMixpanelReady) return;
    if (!window.mixpanel || !window.mixpanel.init) return;
    window.llMixpanelReady = true;
    mixpanel.init(MIXPANEL_TOKEN, { autocapture: false, track_pageview: false });
  }

  function track(name, props) {
    initAnalytics();
    try {
      if (window.mixpanel && typeof window.mixpanel.track === "function") {
        mixpanel.track(name, props || {});
      }
    } catch (err) {}
  }

  function styleName(value) {
    return STYLE_NAMES[value] || "";
  }

  function pageViewed(key, props) {
    if (lastPageKey === key) return;
    lastPageKey = key;
    if (props) track("Page Viewed", props);
  }

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
    var base = listing && listing.slug === "landover-203" ? LANDOVER_STRIPE : STRIPE_LINK;
    var url = new URL(base);
    var ref = listing && listing.slug ? listing.slug : "";
    var sid = styleId === "florida" ? "florida-cozy" : styleId;
    if (sid) ref += ":" + sid;
    if (ref) url.searchParams.set("client_reference_id", ref);
    return url.toString();
  }

  function livingPhoto(listing) {
    return photoOf(listing, "living") || (listing && listing.photos && listing.photos[0]) || null;
  }

  function styleKey(styleId) {
    if (styleId === "florida-cozy" || styleId === "florida") return "florida";
    return styleId;
  }

  function styleSrc(photo, styleId) {
    return styleUrl(photo, styleKey(styleId));
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
    var wait = !payHref;
    var hrefAttr = payHref ? " href=\"" + esc(payHref) + "\"" : "";
    return (
      "<header class=\"nav\"><div class=\"wrap nav-inner\">" +
      "<a class=\"brand\" href=\"/\">SWFL ListLift</a>" +
      "<a class=\"nav-pay" + (wait ? " is-wait" : "") + "\"" + hrefAttr + (extra || "") + ">" +
      esc(payLabel || "Pay $99") +
      "</a></div></header>"
    );
  }

  function footerHtml(forListing) {
    if (forListing) {
      return (
        "<footer class=\"footer\"><div class=\"wrap\">" +
        "SWFL ListLift · not a brokerage · Virtually Staged · " +
        "<a href=\"terms.html\">Order terms</a> · " +
        "<a href=\"mailto:adam@swfl-listlift.com\">adam@swfl-listlift.com</a>" +
        "</div></footer>"
      );
    }
    return (
      "<footer class=\"footer\"><div class=\"wrap\">" +
      "SWFL ListLift · Southwest Florida · " +
      "<a href=\"mailto:adam@swfl-listlift.com\">adam@swfl-listlift.com</a>" +
      " · not a real estate brokerage</div></footer>"
    );
  }

  function renderHome() {
    var results = "";
    var tab = state.homeTab;
    var i;
    var listing;

    document.title = "SWFL ListLift — we add furniture to empty listing photos";

    if (loadError) {
      results =
        "<div class=\"notice\" role=\"status\"><p>Could not load listings. Refresh the page.</p></div>";
    } else if (state.matches && state.matches.length === 0) {
      results =
        "<div class=\"notice\" role=\"status\">" +
        "<p>That address is not in our list. We only work with real listings.</p>" +
        "<p>If this is your listing, email <a href=\"mailto:adam@swfl-listlift.com\">adam@swfl-listlift.com</a>.</p>" +
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
      "<p class=\"kicker\">One listing. $99.</p>" +
      "<h1>We add furniture to empty listing photos.</h1>" +
      "<p class=\"lede\">Type the address. Click the styles. Pay $99. Files in one to two hours. Every file says Virtually Staged.</p>" +
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
      "<p class=\"trio-hint\">Click Current, Warm modern, or Florida cozy to see the same photo.</p>" +
      "<div class=\"trio-tabs\" role=\"tablist\" aria-label=\"Sample styles\">" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "empty") + "\" data-tab=\"empty\">Current</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "warm-modern") + "\" data-tab=\"warm-modern\">Warm modern</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "florida") + "\" data-tab=\"florida\">Florida cozy</button>" +
      "</div>" +
      "<div class=\"trio-frames\">" +
      "<figure class=\"frame" + (tab === "empty" ? " is-on" : "") + "\">" +
      demoImg("empty", "Sample empty interior, labeled DEMO") +
      "<figcaption>Current</figcaption></figure>" +
      "<figure class=\"frame badge" + (tab === "warm-modern" ? " is-on" : "") + "\">" +
      demoImg("warm-modern", "Sample warm modern staging, labeled DEMO") +
      "<figcaption>Warm modern</figcaption></figure>" +
      "<figure class=\"frame badge" + (tab === "florida" ? " is-on" : "") + "\">" +
      demoImg("florida", "Sample Florida cozy staging, labeled DEMO") +
      "<figcaption>Florida cozy</figcaption></figure>" +
      "</div></div>" +
      "<p class=\"caption\">Example room — not a live listing</p>" +
      "</div></div></section>" +
      "<section class=\"band\"><div class=\"wrap\">" +
      "<h2>How it works</h2>" +
      "<ol class=\"steps\">" +
      "<li><strong>Type the address</strong><span>We open that listing. A link we send you skips this box.</span></li>" +
      "<li><strong>Click the styles on the photo</strong><span>Current, Warm modern, and Florida cozy show you the same photo three ways.</span></li>" +
      "<li><strong>Choose a style and pay $99</strong><span>Furniture and decor only. Walls, windows, floors, views, and the camera stay as shot.</span></li>" +
      "<li><strong>Get your files in 1–2 hours</strong><span>We add furniture to every empty room in that listing. Every file says Virtually Staged.</span></li>" +
      "</ol></div></section>" +
      "<section class=\"band\"><div class=\"wrap split\"><div>" +
      "<h2>What you get</h2><ul>" +
      "<li>Furniture and decor on your own photos</li>" +
      "<li>Every empty room in that listing</li>" +
      "<li>One style for the whole house</li>" +
      "<li>Virtually Staged on every file</li>" +
      "<li>Use it for that address on MLS, flyers, and social</li>" +
      "<li>One free fix if the furniture is the wrong size</li>" +
      "</ul></div><div>" +
      "<h2>What you don’t</h2><ul>" +
      "<li>Walls, windows, floors, views, and the camera do not move</li>" +
      "<li>No pools, no new views, no construction that is not there</li>" +
      "<li>Not for other addresses</li>" +
      "<li>Not a brokerage. We are not your agent.</li>" +
      "</ul></div></div></section>" +
      "<section class=\"band\"><div class=\"wrap photo-rule\">" +
      "<h2>The photo rule</h2>" +
      "<p>Furniture and decor only. Walls, windows, floors, views, and the camera stay as shot.</p>" +
      "</div></section>" +
      "<section class=\"band\"><div class=\"wrap terms-short\">" +
      "<h2>Terms</h2>" +
      "<p>You pay $99. That is how you agree. The files are for that one address. Every file says Virtually Staged. No refund after we send the files. One free fix if the furniture is the wrong size. Florida.</p>" +
      "<p><a href=\"terms.html\">Full order terms</a></p>" +
      "</div></section>" +
      "<section class=\"pay\" id=\"pay\"><div class=\"wrap\">" +
      "<h2>Pay $99</h2>" +
      "<p>Start with the address above. Pay $99. Files in 1–2 hours. Read the <a href=\"terms.html\">order terms</a> first.</p>" +
      "<a class=\"btn\" href=\"" + esc(STRIPE_LINK) + "\" rel=\"noopener noreferrer\">Pay $99</a>" +
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
      "<h1>That address is not in our list.</h1>" +
      "<p class=\"lede\">We only work with real listings. If this is your listing, email <a href=\"mailto:adam@swfl-listlift.com\">adam@swfl-listlift.com</a>.</p>" +
      "</div></main>" +
      footerHtml()
    );
  }

  function renderListingGallery(listing) {
    var html;
    var i;
    var item;
    var stage;
    if (!listing.gallery || !listing.gallery.length) return "";
    html =
      "<p class=\"ask\">All listing photos</p>" +
      "<p class=\"caption gallery-key\">Green means we'll add furniture.</p>" +
      "<div class=\"listing-gallery\" aria-label=\"Listing photos\">";
    for (i = 0; i < listing.gallery.length; i += 1) {
      item = listing.gallery[i];
      stage = item.stage === true;
      html +=
        "<figure class=\"" + (stage ? "is-stage" : "is-skip") + "\">" +
        imgTag({
          src: item.url,
          alt: (item.label || "Listing photo") + " at " + listing.address
        }) +
        "<figcaption><span class=\"who\">" + esc(item.label || "Photo") + "</span>" +
        "<span class=\"mark\">" + (stage ? "We'll stage" : "As-is") + "</span></figcaption>" +
        "</figure>";
    }
    html += "</div>";
    return html;
  }

  function renderListing(listing) {
    var photo = livingPhoto(listing);
    var current = photoUrl(photo);
    var room = (photo && photo.label) || "Living";
    var styleId = state.styleId;
    var readyPay = styleId === "warm-modern" || styleId === "florida-cozy";
    var payHref = readyPay ? stripeHref(listing, styleId) : "";
    var payLabel = readyPay
      ? "Pay $99 for this house"
      : "Choose a style, then pay $99";
    var navExtra = " id=\"nav-pay\"" + (readyPay ? "" : " aria-disabled=\"true\"");
    document.title = listing.address + " — SWFL ListLift";

    var tab = state.styleTab || "current";

    return (
      navHtml(payHref, "Pay $99", navExtra) +
      "<main>" +
      "<section class=\"listing\"><div class=\"wrap\">" +
      "<p class=\"kicker\">This listing. $99.</p>" +
      "<h1>" + esc(listing.address) + "</h1>" +
      "<p class=\"facts\">" + esc(facts(listing)) + " · " + esc(listing.city) + "</p>" +
      (listing.agent_name ? "<p class=\"facts\">Agent: " + esc(listing.agent_name) + "</p>" : "") +
      (listing.listing_url
        ? "<p class=\"facts\"><a href=\"" + esc(listing.listing_url) + "\" rel=\"noopener noreferrer\">Listing on Redfin</a></p>"
        : "") +
      "<div class=\"trio listing-hero\" data-trio=\"listing\">" +
      "<p class=\"trio-hint\">Click Current, Warm modern, or Florida cozy to see the same photo.</p>" +
      "<div class=\"trio-tabs\" role=\"tablist\" aria-label=\"Listing photo styles\">" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "current") + "\" data-tab=\"current\">Current</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "warm-modern") + "\" data-tab=\"warm-modern\">Warm modern</button>" +
      "<button type=\"button\" role=\"tab\" aria-selected=\"" + (tab === "florida") + "\" data-tab=\"florida\">Florida cozy</button>" +
      "</div>" +
      "<div class=\"trio-frames\">" +
      "<figure class=\"frame" + (tab === "current" ? " is-on" : "") + "\" data-frame=\"current\">" +
      imgTag({ src: current, alt: "Current " + room + " photo at " + listing.address }) +
      "<figcaption>Current</figcaption></figure>" +
      "<figure class=\"frame" + (tab === "warm-modern" ? " is-on" : "") + "\" data-frame=\"warm-modern\">" +
      "<div class=\"preview-shot\">" +
      imgTag({
        src: styleSrc(photo, "warm-modern"),
        fallback: current,
        alt: "Warm modern preview of the same " + room.toLowerCase() + " photo"
      }) +
      "</div>" +
      "<figcaption>Warm modern</figcaption></figure>" +
      "<figure class=\"frame" + (tab === "florida" ? " is-on" : "") + "\" data-frame=\"florida\">" +
      "<div class=\"preview-shot\">" +
      imgTag({
        src: styleSrc(photo, "florida-cozy"),
        fallback: current,
        alt: "Florida cozy preview of the same " + room.toLowerCase() + " photo"
      }) +
      "</div>" +
      "<figcaption>Florida cozy</figcaption></figure>" +
      "</div></div>" +
      "<p class=\"caption\">This is one photo. After you pay, we stage the rest of the empty rooms in the style you pick.</p>" +
      "<div class=\"buy-block\">" +
      "<p class=\"ask\" id=\"style-label\">Choose a style</p>" +
      "<div class=\"style-toggle\" role=\"radiogroup\" aria-labelledby=\"style-label\">" +
      "<label class=\"style-toggle-btn\">" +
      "<input type=\"radio\" name=\"style\" value=\"warm-modern\"" +
      (styleId === "warm-modern" ? " checked" : "") + ">" +
      "<span>Warm modern</span></label>" +
      "<label class=\"style-toggle-btn\">" +
      "<input type=\"radio\" name=\"style\" value=\"florida-cozy\"" +
      (styleId === "florida-cozy" ? " checked" : "") + ">" +
      "<span>Florida cozy</span></label>" +
      "</div>" +
      "<p class=\"rule-line\">We'll stage the empty rooms. $99 for this house.</p>" +
      "<a class=\"buy-btn" + (readyPay ? "" : " is-wait") + "\" id=\"listing-pay\"" +
      (readyPay ? " href=\"" + esc(payHref) + "\" rel=\"noopener noreferrer\"" : " aria-disabled=\"true\"") +
      ">" + esc(payLabel) + "</a>" +
      "</div>" +
      renderListingGallery(listing) +
      "</div></section></main>" +
      footerHtml(true)
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

  function setPayLink(el, enabled, href, label) {
    if (!el) return;
    if (enabled && href) {
      el.classList.remove("is-wait");
      el.removeAttribute("aria-disabled");
      el.setAttribute("href", href);
      el.setAttribute("rel", "noopener noreferrer");
    } else {
      el.classList.add("is-wait");
      el.setAttribute("aria-disabled", "true");
      el.removeAttribute("href");
    }
    if (label) el.textContent = label;
  }

  function bindListingPay() {
    var pay = document.getElementById("listing-pay");
    var nav = document.getElementById("nav-pay");
    var radios = app.querySelectorAll('input[name="style"]');
    var slug;
    var address;
    var listing;
    var i;

    if (!pay && !radios.length) return;

    slug = route().slug;
    listing = null;
    for (i = 0; i < catalog.listings.length; i += 1) {
      if (catalog.listings[i].slug === slug) {
        listing = catalog.listings[i];
        break;
      }
    }
    if (!listing) return;
    address = listing.address;

    function chosenStyle() {
      var el = app.querySelector('input[name="style"]:checked');
      return el ? el.value : "";
    }

    function syncPay() {
      var style = chosenStyle();
      var ready = style === "warm-modern" || style === "florida-cozy";
      var href = ready ? stripeHref(listing, style) : "";
      state.styleId = ready ? style : null;
      setPayLink(pay, ready, href, ready ? "Pay $99 for this house" : "Choose a style, then pay $99");
      setPayLink(nav, ready, href, "Pay $99");
    }

    function onPayClick(event) {
      if (this.getAttribute("aria-disabled") === "true" || this.classList.contains("is-wait")) {
        event.preventDefault();
        return;
      }
      track("Pay Clicked", { style: styleName(chosenStyle()), slug: slug, price: 99 });
    }

    if (pay) pay.addEventListener("click", onPayClick);
    if (nav) nav.addEventListener("click", onPayClick);
    for (i = 0; i < radios.length; i += 1) {
      radios[i].addEventListener("change", function () {
        var style = chosenStyle();
        state.styleId = style === "warm-modern" || style === "florida-cozy" ? style : null;
        if (style === "warm-modern") state.styleTab = "warm-modern";
        if (style === "florida-cozy") state.styleTab = "florida";
        if (styleName(style)) {
          track("Pay Style Selected", { style: styleName(style), slug: slug });
        }
        render();
      });
    }
    syncPay();
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
          if (matches[0].slug === "landover-203") {
            window.location.href = "/l/landover-203";
            return;
          }
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
        var tab = btn.getAttribute("data-tab");
        var here;
        if (trio && trio.getAttribute("data-trio") === "home") {
          state.homeTab = tab;
        } else if (trio && trio.getAttribute("data-trio") === "listing") {
          state.styleTab = tab;
          here = route();
          if (here.name === "listing" && styleName(tab)) {
            track("Photo Style Clicked", { style: styleName(tab), slug: here.slug });
          }
        } else {
          state.styleTab = tab;
        }
        render();
      });
    });

    bindListingPay();

    app.querySelectorAll('a[href="/"], a[href^="/l/"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        var href;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        href = link.getAttribute("href");
        if (href === "/l/landover-203" || href.indexOf("/l/landover-203") === 0) {
          return;
        }
        event.preventDefault();
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
      pageViewed("home", { page: "home", path: location.pathname });
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
      pageViewed("missing:" + current.slug, null);
      return;
    }

    app.innerHTML = renderListing(listing);
    bind();
    pageViewed("listing:" + listing.slug, {
      page: "listing",
      path: location.pathname,
      slug: listing.slug,
      address: listing.address
    });
  }

  function init() {
    initAnalytics();
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
