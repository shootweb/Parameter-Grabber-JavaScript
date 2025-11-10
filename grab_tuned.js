/* Paste into DevTools Console. It runs immediately and shows results on screen. */
(function () {
  // options
  const blacklist = [
    /^utm_/i, /^fbclid$/i, /^gclid$/i, /^_ga/i, /^_gid/i, /^yclid$/i, /^mc_cid$/i, /^mc_eid$/i
  ];
  const minScore = 1;
  const maxResults = 200;

  // helpers
  const isBlacklisted = (name) => blacklist.some(p => p.test(name));
  const add = (map, name, exampleUrl, reason, delta = 1) => {
    if (!name) return;
    name = String(name).trim();
    if (!name) return;
    if (!map[name]) map[name] = { name, exampleUrl, score: 0, reasons: new Set() };
    const item = map[name];
    item.score += delta;
    item.reasons.add(reason);
    if (exampleUrl && (!item.exampleUrl || exampleUrl.length < item.exampleUrl.length)) {
      item.exampleUrl = exampleUrl;
    }
  };
  const qsFromUrl = (url) => {
    try { return Array.from(new URL(url, document.baseURI).searchParams.keys()); }
    catch {
      const m = String(url).match(/[?&]([^=#]+)=/g);
      return m ? Array.from(new Set(m.map(x => x.replace(/^[?&]|=$/g, "")))) : [];
    }
  };
  const parseInline = (txt) => {
    const out = new Set();
    let m;
    const reGet = /(?:get|has)\s*\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;
    while ((m = reGet.exec(txt))) out.add(m[1]);
    const reBracket = /(?:location|window|\burl\b)[^"'`\]]*[\[\(]\s*['"]([a-zA-Z0-9_\-]+)['"]\s*[\]\)]/g;
    while ((m = reBracket.exec(txt))) out.add(m[1]);
    const reQS = /[?&]([a-zA-Z0-9_\-]+)=/g;
    while ((m = reQS.exec(txt))) out.add(m[1]);
    const reVar = /(?:var|let|const)?\s*[a-zA-Z0-9_\-]+\s*=\s*.*(?:qs|params|searchParams|query).*['"]([a-zA-Z0-9_\-]+)['"]/g;
    while ((m = reVar.exec(txt))) out.add(m[1]);
    return Array.from(out);
  };

  // collect
  const found = {};

  // forms and inputs
  document.querySelectorAll("form").forEach(form => {
    const action = (form.getAttribute("action") || location.href).split("#")[0];
    Array.from(form.elements || []).forEach(el => {
      const name = el.name || el.id || (el.getAttribute && el.getAttribute("data-name"));
      if (!name) return;
      const type = (el.type || "").toLowerCase();
      let score = 3;
      if (type === "hidden") score = 4;
      if (["text","search","email","tel","password"].includes(type)) score = 5;
      if (el.matches && el.matches("select,textarea")) score = 4;
      add(found, name, `${action}?${name}=`, `form:${form.name||form.id||"form"}`, score);
    });
  });

  // standalone inputs
  document.querySelectorAll("input,textarea,select").forEach(el => {
    const name = el.name || el.id || (el.getAttribute && el.getAttribute("data-name"));
    if (!name || found[name]) return;
    const type = (el.type || "").toLowerCase();
    const score = ["text","search","email","password"].includes(type) ? 4 : 3;
    add(found, name, `${location.origin}${location.pathname}?${name}=`, `input:${type||"notype"}`, score);
  });

  // anchor links with query
  document.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href");
    if (!href) return;
    qsFromUrl(href).forEach(p => add(found, p, href, `link:${(a.textContent||"").trim().slice(0,20)}`, 2));
  });

  // elements with event handlers
  ["onclick","onchange","onsubmit","oninput","onfocus","onblur","onkeydown","onkeyup"].forEach(attr => {
    document.querySelectorAll("[" + attr + "]").forEach(el => {
      parseInline(el.getAttribute(attr) || "").forEach(n => {
        add(found, n, `${location.href.split("#")[0]}?${n}=`, `handler:${attr}`, 2);
      });
    });
  });

  // data attributes
  Array.from(document.querySelectorAll("*")).forEach(el => {
    for (const attr of el.attributes) {
      if (attr && attr.name && attr.name.startsWith("data-")) {
        const pname = attr.name.slice(5);
        if (pname) add(found, pname, `${location.href.split("#")[0]}?${pname}=`, `data-attr:${attr.name}`, 1);
      }
    }
  });

  // inline scripts
  document.querySelectorAll("script:not([src])").forEach(s => {
    parseInline(s.textContent || "").forEach(n => {
      add(found, n, `${location.href.split("#")[0]}?${n}=`, "inline-js", 2);
    });
  });

  // external script src params
  document.querySelectorAll("script[src]").forEach(s => {
    const src = s.getAttribute("src");
    if (!src) return;
    qsFromUrl(src).forEach(p => add(found, p, src, "external-js-src", 1));
  });

  // meta name tags
  document.querySelectorAll("meta[name]").forEach(m => {
    const name = m.getAttribute("name");
    if (name) add(found, name, location.href, "meta", 0.5);
  });

  // hash with param like segments
  if (location.hash && location.hash.includes("=")) {
    location.hash.replace(/^#/, "").split(/[&;]/).forEach(part => {
      const [k] = part.split("=");
      if (k) add(found, k, `${location.href.split("#")[0]}#${k}=`, "hash", 1.5);
    });
  }

  // finish and filter
  let results = Object.values(found)
    .map(x => ({
      name: x.name,
      exampleUrl: x.exampleUrl || `${location.href.split("#")[0]}?${x.name}=`,
      score: Math.round(x.score * 10) / 10,
      reasons: Array.from(x.reasons)
    }))
    .filter(x => x.score >= minScore)
    .filter(x => !isBlacklisted(x.name))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, maxResults);

  // UI
  const old = document.getElementById("grabParamsPanel");
  if (old) old.remove();

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

  const btnWrap = document.createElement("div");

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.style.marginRight = "6px";
  copyBtn.onclick = () => {
    try {
      const lines = results.map(r => `${r.name}\t${r.score}\t${r.exampleUrl}\t${r.reasons.join(", ")}`).join("\n");
      navigator.clipboard.writeText(lines).then(() => alert("Copied"));
    } catch (e) { alert("Copy failed " + e); }
  };
  btnWrap.appendChild(copyBtn);

  const csvBtn = document.createElement("button");
  csvBtn.textContent = "Export CSV";
  csvBtn.style.marginRight = "6px";
  csvBtn.onclick = () => {
    try {
      const rows = results.map(r => [
        `"${r.name.replace(/"/g,'""')}"`,
        `"${r.score}"`,
        `"${r.exampleUrl.replace(/"/g,'""')}"`,
        `"${r.reasons.join(" ").replace(/"/g,'""')}"`
      ].join(","));
      const csv = ["Param,Score,Example,Reasons"].concat(rows).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "grabParams.csv";
      document.body.appendChild(a);
