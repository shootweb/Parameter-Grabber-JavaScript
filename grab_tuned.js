/**
 * grabParamsUI(options)
 * Paste into the browser console and call:
 *   grabParamsUI();               // show floating panel with results
 *   grabParamsUI({copy:true});    // show panel and copy results to clipboard
 *
 * Fixes the invalid selector error and displays results on-screen.
 */
(function grabParamsUIwrap() {
  function defaultOptions() {
    return {
      blacklistPatterns: [
        /^utm_/i, /^fbclid$/i, /^gclid$/i, /^_ga/i, /^_gid/i, /^yclid$/i, /^mc_cid$/i, /^mc_eid$/i
      ],
      minScore: 1,
      maxResults: 200,
      copy: false
    };
  }

  function isBlacklisted(name, patterns) {
    return patterns.some(p => p.test(name));
  }

  function addCandidate(map, name, exampleUrl, reason, deltaScore = 1) {
    if (!name) return;
    name = String(name).trim();
    if (!name) return;
    const key = name;
    if (!map[key]) {
      map[key] = { name, exampleUrl, score: 0, reasons: new Set() };
    }
    map[key].score += deltaScore;
    map[key].reasons.add(reason);
    if (exampleUrl && (!map[key].exampleUrl || exampleUrl.length < map[key].exampleUrl.length)) {
      map[key].exampleUrl = exampleUrl;
    }
  }

  function extractQueryParamsFromUrl(url) {
    try {
      const u = new URL(url, document.baseURI);
      return Array.from(u.searchParams.keys());
    } catch (e) {
      const m = String(url).match(/[?&]([^=#]+)=/g);
      return m ? Array.from(new Set(m.map(x => x.replace(/^[?&]|=$/g, "")))) : [];
    }
  }

  function parseInlineJSForNames(scriptText) {
    const names = new Set();
    const reGet = /(?:get|has)\s*\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;
    let m;
    while ((m = reGet.exec(scriptText))) names.add(m[1]);
    const reBracket = /(?:location|window|\burl\b)[^"'`\]]*[\[\(]\s*['"]([a-zA-Z0-9_\-]+)['"]\s*[\]\)]/g;
    while ((m = reBracket.exec(scriptText))) names.add(m[1]);
    const reQS = /[?&]([a-zA-Z0-9_\-]+)=/g;
    while ((m = reQS.exec(scriptText))) names.add(m[1]);
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
        const type = (el.type || "").toLowerCase();
        let score = 3;
        if (type === "hidden") score = 4;
        if (["text","search","email","tel","password"].includes(type)) score = 5;
        if (el.matches && el.matches("select,textarea")) score = 4;
        addCandidate(candidates, name, `${actionBase}?${name}=`, `form:${form.name||form.id||'form'}`, score);
      });
    });

    // 2) inputs outside forms (standalone)
    document.querySelectorAll("input,textarea,select").forEach(el => {
      const name = el.name || el.id || (el.getAttribute && el.getAttribute("data-name"));
      if (!name) return;
      if (candidates[name]) return;
      const type = (el.type || "").toLowerCase();
      let score = ["text","search","email","password"].includes(type) ? 4 : 3;
      addCandidate(candidates, name, `${location.origin}${location.pathname}?${name}=`, `input:${type||'notype'}`, score);
    });

    // 3) anchors with query strings
    document.querySelectorAll("a[href]").forEach(a => {
      try {
        const href = a.getAttribute("href");
        if (!href) return;
        const params = extractQueryParamsFromUrl(href);
        params.forEach(p => addCandidate(candidates, p, href, `link:${(a.textContent||'').trim().slice(0,20)}`, 2));
      } catch (e) {}
    });

    // 4) elements with event handlers
    const evAttrs = ["onclick","onchange","onsubmit","oninput","onfocus","onblur","onkeydown","onkeyup"];
    evAttrs.forEach(attr => {
      document.querySelectorAll("[" + attr + "]").forEach(el => {
        const text = (el.getAttribute(attr) || "");
        const found = parseInlineJSForNames(text);
        found.forEach(n => addCandidate(candidates, n, `${location.href.split('#')[0]}?${n}=`, `handler:${attr}`, 2));
      });
    });

    // 5) data-* attributes by iterating attributes (no invalid selector)
    Array.from(document.querySelectorAll("*")).forEach(el => {
      for (const attr of el.attributes) {
        if (attr && attr.name && attr.name.startsWith("data-")) {
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

    // 7) external script src param parsing
    document.querySelectorAll("script[src]").forEach(s => {
      try {
        const src = s.getAttribute("src");
        const params = extractQueryParamsFromUrl(src);
        params.forEach(p => addCandidate(candidates, p, src, "external-js-src", 1));
      } catch (e) {}
    });

    // 8) meta[name] tags
    document.querySelectorAll("meta[name]").forEach(m => {
      const name = m.getAttribute("name");
      if (name) addCandidate(candidates, name, location.href, "meta", 0.5);
    });

    // 9) hash fragment
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
    return out.slice(0, options.maxResults);
  }

  // UI helpers
  function createPanel() {
    // remove existing
    const existing = document.getElementById("grabParamsPanel");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "grabParamsPanel";
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.top = "12px";
    panel.style.width = "520px";
    panel.style.maxHeight = "70vh";
    panel.style.overflow = "auto";
    panel.style.zIndex = 2147483647;
    panel.style.background = "rgba(255,255,255,0.97)";
    panel.style.border = "1px solid rgba(0,0,0,0.15)";
    panel.style.boxShadow = "0 6px 18px rgba(0,0,0,0.2)";
    panel.style.fontFamily = "Arial, sans-serif";
    panel.style.fontSize = "13px";
    panel.style.color = "#111";
    panel.style.padding = "8px";
    panel.style.borderRadius = "6px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "8px";

    const title = document.createElement("div");
    title.textContent = "grabParams results";
    title.style.fontWeight = "600";
    header.appendChild(title);

    const btns = document.createElement("div");

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.style.marginRight = "6px";
    copyBtn.onclick = () => {
      copyResultsToClipboard(panel);
    };
    btns.appendChild(copyBtn);

    const csvBtn = document.createElement("button");
    csvBtn.textContent = "Export CSV";
    csvBtn.style.marginRight = "6px";
    csvBtn.onclick = () => {
      exportCSV(panel);
    };
    btns.appendChild(csvBtn);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.onclick = () => panel.remove();
    btns.appendChild(closeBtn);

    header.appendChild(btns);
    panel.appendChild(header);

    const tableWrap = document.createElement("div");
    tableWrap.id = "grabParamsTableWrap";
    panel.appendChild(tableWrap);

    document.body.appendChild(panel);
    return panel;
  }

  function buildTable(panel, results) {
    const wrap = panel.querySelector("#grabParamsTableWrap");
    wrap.innerHTML = "";

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    const thead = document.createElement("thead");
    const hrow = document.createElement("tr");
    ["Param","Score","Example","Reasons"].forEach((h, idx) => {
      const th = document.createElement("th");
      th.textContent = h;
      th.style.textAlign = idx===2 ? "left" : "center";
      th.style.padding = "6px 8px";
      th.style.borderBottom = "1px solid rgba(0,0,0,0.08)";
      th.style.cursor = "pointer";
      // sort by column
      th.onclick = () => {
        let sorted;
        if (h === "Score") sorted = results.sort((a,b) => b.score - a.score);
        else if (h === "Param") sorted = results.sort((a,b) => a.name.localeCompare(b.name));
        else sorted = results;
        buildTable(panel, sorted);
      };
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    results.forEach(r => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid rgba(0,0,0,0.04)";

      const tdName = document.createElement("td");
      tdName.style.padding = "6px 8px";
      tdName.style.fontWeight = "600";
      tdName.style.width = "28%";
      tdName.textContent = r.name;
      tr.appendChild(tdName);

      const tdScore = document.createElement("td");
      tdScore.style.textAlign = "center";
      tdScore.style.padding = "6px 8px";
      tdScore.style.width = "10%";
      tdScore.textContent = r.score;
      tr.appendChild(tdScore);

      const tdExample = document.createElement("td");
      tdExample.style.padding = "6px 8px";
      tdExample.style.width = "40%";
      const a = document.createElement("a");
      a.href = r.exampleUrl;
      a.textContent = r.exampleUrl;
      a.target = "_blank";
      a.style.color = "#0b66c3";
      tdExample.appendChild(a);
      tr.appendChild(tdExample);

      const tdReasons = document.createElement("td");
      tdReasons.style.padding = "6px 8px";
      tdReasons.style.width = "22%";
      tdReasons.textContent = r.reasons.join(", ");
      tr.appendChild(tdReasons);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function copyResultsToClipboard(panel) {
    try {
      const rows = Array.from(panel.querySelectorAll("tbody tr")).map(tr => {
        const cols = tr.querySelector
