(function () {
  "use strict";

  var MIXPANEL_TOKEN = "c3094cb7b0fee96f8f26ee8942b3a720";

  var STYLE_NAMES = {
    current: "current",
    "warm-modern": "warm_modern",
    florida: "florida_cozy",
    "florida-cozy": "florida_cozy"
  };

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

  window.llAnalytics = { init: initAnalytics, track: track, styleName: styleName };

  initAnalytics();
})();
