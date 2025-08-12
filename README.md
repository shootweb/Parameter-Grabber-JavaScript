# Endpoint Discovery Helper

A lightweight browser script that discovers front-end referenced endpoints from any page you visit. It watches dynamic requests in real time and performs static scanning of the current HTML and all loaded scripts, then shows a compact overlay with every unique endpoint it found.
<br>
Just copy-paste it into your browser's console.


## Features

* Dynamic monitoring of `XMLHttpRequest` and `fetch`
* Static scanning of page HTML and loaded JS files for path-like strings
* Normalization to de-duplicate by stripping query strings
* Zero dependencies and runs entirely in the page context
* Results printed to the console and to an on-page overlay

## How it works

1. Hooks `XMLHttpRequest.open` and `window.fetch` to log requested URLs as you navigate and use the app.  
2. Fetches each loaded `<script src="...">` and scans its content with a path regex.  
3. Scans the current page HTML with the same regex.  
4. Normalizes each match by removing the query string, then stores it in a `Set`.  
5. After a short delay, prints a summary and renders a fixed overlay with all discovered endpoints.

## Quick start

You have two easy options.

### Option A. Run from DevTools

1. Open the target site in your browser.  
2. Open DevTools and go to Console.  
3. Paste the contents of `script.js` and press Enter.  
4. Interact with the app for a few seconds.  
5. Watch the console and the green overlay for discovered endpoints.

### Option B. Save as a bookmarklet

1. Minify `script.js` into a single line, then wrap it like this:
```
javascript:(function(){ /* paste the minified one-liner of script.js here */ })();
```


2. Create a new bookmark whose URL is that entire line.  
3. Visit any site and click the bookmark to run the collector.

If you want, I can produce a ready one-liner for you.

## Output

* Console shows lines such as  
  `[XHR] GET -> /api/users`  
  `[Fetch] -> /v1/search`  
  `[Static JS] -> /assets/config.json`  
  `[Static HTML] -> /help/faq`

* Overlay appears at the top of the page listing all unique endpoints and a total count.

## Configuration

* Normalization: by default query strings are removed. Edit the `normalizeUrl` function if you prefer full URLs.  
* Delay: the overlay appears after 5 seconds. Adjust the `setTimeout` at the bottom to suit your flow.  
* Regex: the path matcher is set to catch common URL paths within quotes. You can tune it for your app patterns.

## Caveats and notes

* External scripts may be blocked by CORS when fetched for static analysis. Those failures are logged and the script continues.  
* Only paths that appear in the DOM or scripts or are requested via XHR or fetch are discovered. Hidden server routes will not show up.  
* Query parameters are intentionally removed to improve de-duplication. Change the normalizer if parameters carry meaning you want to keep.  
* The overlay is added to the DOM. If the page has strict CSP that blocks inline styles or script execution from console, you may need to loosen CSP in a local test environment.

## Tested environment

* Modern Chromium based browsers  
* Firefox recent versions

## File list: script.js T(he endpoint discovery script)



## License

Choose a license that fits your project. If you do not have a preference, MIT is a safe default.

---

### Appendix. What the script looks like

Your `script.js` wraps everything in an IIFE, hooks XHR and fetch, scans scripts and HTML with a regex, normalizes with `normalizeUrl`, then prints results and renders a fixed overlay. If you want me to change the overlay style, add a copy to clipboard button, or export to a file, I can update the code.


