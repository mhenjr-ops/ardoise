import { botCheckKey } from "@/lib/bot-check";

/**
 * The bot check for the phone app. Cloudflare Turnstile only runs in a web page, so the app
 * opens this page in a small web view (an iframe in the app's web preview) and receives the
 * token through postMessage. Hosted here so the check never goes through someone else's site.
 *
 * Messages to the app: { source: "ardoise-check", type: "token" | "expired" | "error" | "off" | "size" }.
 * The app asks for a fresh token with window.ardoiseReset() (web view) or a "reset" message (iframe).
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "fr";
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const siteKey = botCheckKey() ?? "";

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="robots" content="noindex">
<title>Ardoise</title>
<style>
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
  #box { display: flex; justify-content: center; min-height: 1px; }
</style>
</head>
<body>
<div id="box"></div>
<script>
(function () {
  var SITE_KEY = ${JSON.stringify(siteKey)};
  var LANG = ${JSON.stringify(lang)};
  var THEME = ${JSON.stringify(theme)};
  var widget = null;

  function send(msg) {
    msg.source = "ardoise-check";
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if (window.parent !== window) window.parent.postMessage(msg, location.origin);
  }
  var lastHeight = -1;
  function size() {
    var h = Math.ceil(document.getElementById("box").getBoundingClientRect().height);
    if (h !== lastHeight) { lastHeight = h; send({ type: "size", height: h }); }
  }
  if (window.ResizeObserver) new ResizeObserver(size).observe(document.getElementById("box"));

  window.ardoiseReset = function () {
    if (window.turnstile && widget !== null) window.turnstile.reset(widget);
  };
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    if (e.data && e.data.source === "ardoise-app" && e.data.type === "reset") window.ardoiseReset();
  });

  if (!SITE_KEY) { send({ type: "off" }); size(); return; }

  window.ardoiseReady = function () {
    widget = window.turnstile.render("#box", {
      sitekey: SITE_KEY,
      language: LANG,
      theme: THEME,
      appearance: "interaction-only",
      callback: function (t) { send({ type: "token", token: t }); },
      "expired-callback": function () { send({ type: "expired" }); },
      "error-callback": function () { send({ type: "error" }); return true; },
      "timeout-callback": function () { send({ type: "expired" }); }
    });
    size();
  };
  var s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ardoiseReady";
  s.async = true;
  s.onerror = function () { send({ type: "error" }); };
  document.head.appendChild(s);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "X-Robots-Tag": "noindex",
    },
  });
}
