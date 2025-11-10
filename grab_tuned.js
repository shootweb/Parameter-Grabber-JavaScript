/**
 * grabParams()
 * Collects likely user-controllable parameter names for XSS testing.
 *
 * Usage:
 *   - paste into browser console and call:
 *       grabParams();              // prints results
 *       grabParams({copy:true});   // copies results to clipboard
 *
 * Behavior:
 *   - finds form inputs, hidden fields, anchors with query strings, inline JS patterns,
 *     event-handler attributes (onclick etc.), data-* attributes, and URL fragments
 *   - scores and deduplicates candidates and filters out common tracking params (utm_*, gclid, fbclid, _ga)
 *   - returns prioritized list of param objects: {name, exampleUrl, score, reasons}
 */
(function globalGrabParams() {
  function defaultOptions() {
    return {
      blacklistPatterns: [
        /^utm_/i,
        /^fbclid$/i,
        /^gclid$/i,
        /^_ga/i,
        /^_gid/i,
        /^yclid$/i,
        /^mc_cid$/i,
        /^mc_eid$/i,
        /^ref$/i, // sometimes noisy; adjust if you want "ref"
      ],
      minScore: 1,   // only include params with score >= this
      copyToClipboard: false,
      maxResults: 200
    };
  }

  function isBlacklisted(name, patterns) {
    return patterns.some(p => p.test(name));
  }

  function addCandidate(map, name, exampleUrl, reason, deltaScore = 1) {
    if (!name) return;
    name = name.trim();
    if (!name) return;
    const key = name;
    if (!map[key]) {
      map[key] = { name, exampleUrl, score: 0, reasons: new Set() };
    }
    map[key].score += deltaScore;
    map[key].reasons.add(reason);
    // update exampleUrl if this reason provides a stronger example
    if (exampleUrl && (!map[key].exampleUrl || exampleUrl.length < map[key].exampleUrl.length)) {
      map[key].exampleUrl = exampleUrl;
    }
  }

  function extractQueryParamsFromUrl(url) {
    try {
      const u = new URL(url, document.baseURI);
      const params = [];
      for (const [k] of u.searchParams) params.push(k);
      return params;
    } catch (e) {
      // fallback regex capture
      const m = url.match(/[?&]([^=#]+)=/g);
      return m ? Array.from(new Set(m.map(x => x.replace(/^[?&]|=$/g, "")))) : [];
    }
  }

  function parseInlineJSForNames(scriptText) {
    // heuristics: look for location.search, location.hash, new URLSearchParams(...).get('name'), regex for '?name=' or '["name"]'
    const names = new Set();

    // common patterns: urlSearchParams.get('param')
    const reGet = /(?:get|has)\s*\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;
    let m;
    while ((m = reGet.exec(scriptText))) names.add(m[1]);

    // look for ['param'] or ["param"] after location or window or url
    const reBracket = /(?:location|window|\burl\b)[^"'`\]]*[\[\(]\s*['"]([a-zA-Z0-9_\-]+)['"]\s*[\]\)]/g;
    while ((m = reBracket.exec(scriptText))) names.add(m[1]);

    // direct regex like /[?&]param=/ or "?param=" occurrences in strings
    const reQS = /[?&]([a-zA-Z0-9_\-]+)=/g;
    while ((m = reQS.exec(scriptText))) names.add(m[1]);

    // assignments from split on '=' e.g. var p = qs['param']
    const reVar = /(?:var|let|const)?\s*[a-zA-Z0-9_\-]+\s*=\s*.*(?:qs|params|searchParams|query).*['"]([a-zA-Z0-9_\-]+)['"]/g;
    while ((m = reVar.exec(scriptText))) names.add(m[1]);

    return Array.from(names);
  }

  function inspectDOM() {
    const candidates = {};
    // 1) form elements and inputs
    document.querySelectorAll("form").forEach(form => {
      const action = form.getAttribute("action") || document.location.href;
      const actionBase = (action || document.location.href).split("#")[0];
      Array.from(form.elements || []).forEach(el => {
        const name = el.name || el.id || (el.getAttribute && el.getAttribute("data-name"));
        if (!name) return;
        // Heuristic: input type
        const type = (el.type || "").toLowerCase();
        let score = 3;
        if (type === "hidden") score = 4;
        if (type === "text" || type === "search" || type === "email" || type === "tel" || type === "password") score = 5;
        if (el.matches && el.matches("select,textarea")) score = 4;
        addCandidate(candidates, name, `${actionBase}?${name}=`, `form:${form.name||form.id||'form'}`, score);
      });
    });

    // 2) inputs outside forms (standalone)
    document.querySelectorAll("input,textarea,select").forEach(el => {
      const name = el.name || el.id || (el.getAttribute && el.getAttribute("data-name"));
      if (!name) return;
      if (candidates[name]) return; // likely already added from form
      let score = 3;
      const type = (el.type || "").toLowerCase();
      if (type === "hidden") score = 3;
      if (type === "text" || type === "search" || type === "email" || type === "password") score = 4;
      addCandidate(candidates, name, `${location.origin}${location.pathname}?${name}=`, `input:${type}`, score);
    });

    // 3) anchors with query strings
    document.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      if (!href) return;
      const params = extractQueryParamsFromUrl(href);
      params.forEach(p => addCandidate(candidates, p, href, `link:${a.textContent.trim().slice(0,20)}`, 2));
    });

    // 4) elements with event handlers (onclick, onsubmit, onmouseover, etc.)
    const evAttrs = ["onclick","onchange","onsubmit","oninput","onfocus","onblur","onkeydown","onkeyup"];
    evAttrs.forEach(attr => {
      document.querySelectorAll("[" + attr + "]").forEach(el => {
        const text = (el.getAttribute(attr) || "");
        // find query-like patterns in handler
        const found = parseInlineJSForNames(text);
        found.forEach(n => addCandidate(candidates, n, `${location.href.split('#')[0]}?${n}=`, `handler:${attr}`, 2));
      });
    });

    // 5) data-* attributes (user-controllable in many cases)
    document.querySelectorAll("[data-*]").forEach(() => {}); // no-op to satisfy older browsers
    Array.from(document.querySelectorAll("*")).forEach(el => {
      for (const attr of el.attributes) {
        if (attr && attr.name && attr.name.startsWith("data-")) {
          // data-foo -> candidate 'foo'
          const pname = attr.name.slice(5);
          if (pname) addCandidate(candidates, pname, `${location.href.split('#')[0]}?${pname}=`, `data-attribute:${attr.name}`, 1);
        }
      }
    });

    // 6) inline scripts
    document.querySelectorAll("script:not([src])").forEach(s => {
      const text = s.textContent || "";
      const names = parseInlineJSForNames(text);
      names.forEach(n => addCandidate(candidates, n, `${location.href.split('#')[0]}?${n}=`, "inline-js", 2));
    });

    // 7) external script URLs (try to parse param names in src)
    document.querySelectorAll("script[src]").forEach(s => {
      try {
        const src = s.getAttribute("src");
        const params = extractQueryParamsFromUrl(src);
        params.forEach(p => addCandidate(candidates, p, src, "external-js-src", 1));
      } catch (e) {}
    });

    // 8) meta tags (og: or meta[name=], sometimes contain redirect params)
    document.querySelectorAll("meta[name]").forEach(m => {
      const name = m.getAttribute("name");
      if (name) addCandidate(candidates, name, location.href, "meta", 0.5);
    });

    // 9) fragment/hash parsing (#... param-like)
    if (location.hash && location.hash.includes("=")) {
      const parts = location.hash.replace(/^#/, "").split(/[&;]/);
      parts.forEach(part => {
        const kv = part.split("=");
        if (kv[0]) addCandidate(candidates, kv[0], `${location.href.split('#')[0]}#${kv[0]}=`, "hash", 1.5);
      });
    }

    return candidates;
  }

  function finalizeCandidates(map, options) {
    const out = Object.values(map)
      .map(x => ({
        name: x.name,
        exampleUrl: x.exampleUrl || `${location.href.split("#")[0]}?${x.name}=`,
        score: Math.round(x.score*10)/10,
        reasons: Array.from(x.reasons)
      }))
      .filter(x => x.score >= options.minScore)
      .filter(x => !isBlacklisted(x.name, options.blacklistPatterns))
      .sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));

    // dedupe by name (already keyed) and limit results
    return out.slice(0, options.maxResults);
  }

  // primary entry point
  window.grabParams = function grabParams(userOptions = {}) {
    const options = Object.assign(defaultOptions(), userOptions);
    const map = inspectDOM();
    const results = finalizeCandidates(map, options);

    // Pretty print
    if (!results.length) {
      console.info("grabParams: no candidate params found with current heuristics");
      return results;
    }

    console.groupCollapsed(`grabParams: ${results.length} candidates (top 25 shown)`);
    results.slice(0,25).forEach(r => {
      console.log(`%c${r.name}`, "font-weight:bold;color:#0b66c3", ` score:${r.score} reasons:${r.reasons.join(", ")}`);
      console.log("  example:", r.exampleUrl);
    });
    console.groupEnd();

    // copy to clipboard optionally
    if (options.copy || options.copyToClipboard) {
      try {
        const lines = results.map(r => `${r.name} -> ${r.exampleUrl}`);
        navigator.clipboard.writeText(lines.join("\n")).then(() => {
          console.info("grabParams: copied results to clipboard");
        }, () => {
          console.warn("grabParams: clipboard write failed (maybe insecure context). Results returned in value.");
        });
      } catch (e) {
        console.warn("grabParams: unable to copy to clipboard:", e);
      }
    }

    return results;
  };
})();
