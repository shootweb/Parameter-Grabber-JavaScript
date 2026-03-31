(function displayUrlParameters() {

  // ─── NOISE FILTERS ────────────────────────────────────────────────────────
  // Common JS built-ins, framework internals, and generic tokens that are
  // almost never injectable query/body parameters.
  const BLOCKLIST = new Set([
    // JS built-ins
    'eval','length','name','call','apply','bind','prototype','constructor',
    'toString','valueOf','hasOwnProperty','isPrototypeOf','then','catch',
    'finally','return','typeof','instanceof','function','arguments','undefined',
    'null','true','false','NaN','Infinity',
    // DOM / browser globals
    'document','window','console','location','navigator','history','fetch',
    'XMLHttpRequest','setTimeout','setInterval','clearTimeout','clearInterval',
    'addEventListener','removeEventListener','querySelector','querySelectorAll',
    'getElementById','getElementsByClassName','getElementsByTagName',
    'createElement','appendChild','innerHTML','textContent','innerText',
    'style','classList','dataset','getAttribute','setAttribute',
    'parentNode','childNodes','firstChild','lastChild','nextSibling',
    'offsetWidth','offsetHeight','clientWidth','clientHeight',
    'scrollTop','scrollLeft','getBoundingClientRect',
    'dispatchEvent','preventDefault','stopPropagation',
    // jQuery
    'jQuery','ajax','each','extend','fn','ready','on','off','trigger',
    'find','filter','closest','parent','children','siblings','next','prev',
    'show','hide','toggle','addClass','removeClass','toggleClass',
    'attr','prop','val','html','text','append','prepend','remove','empty',
    'animate','css','width','height','offset','position','scrollTop',
    // React / Vue / Angular internals
    'useState','useEffect','useRef','useMemo','useCallback','useContext',
    'useReducer','render','component','props','state','setState','forceUpdate',
    'componentDidMount','componentWillUnmount','shouldComponentUpdate',
    'getDerivedStateFromProps','getSnapshotBeforeUpdate',
    'ref','key','type','defaultProps','displayName','contextType',
    'data','methods','computed','watch','mounted','created','destroyed',
    'ngOnInit','ngOnDestroy','ngOnChanges','ngAfterViewInit',
    // Lodash / Underscore
    'map','reduce','filter','forEach','find','some','every','includes',
    'merge','assign','clone','cloneDeep','get','set','pick','omit',
    'flatten','chunk','zip','unzip','groupBy','sortBy','orderBy',
    'debounce','throttle','once','memoize','curry','partial',
    // Common analytics / tracking (not injectable params)
    'gtag','ga','fbq','_hsq','_paq','dataLayer','pushState','replaceState',
    // Generic noise (pure UI/event internals — NOT injectable param names)
    'init','setup','callback','handler','listener','observer','subscriber','emitter',
    'resolve','reject','complete','done','fail',
    'start','stop','pause','resume','reset','refresh','reload',
    'open','close','enable','disable','validate',
    'load','unload','resize','scroll','click','focus','blur','change',
    'keyup','keydown','keypress','mouseup','mousedown','mousemove',
    'touchstart','touchend','touchmove',
    'class','placeholder','asc','desc',
    'ok','result','response','request','header','headers',
    // NOTE: 'action','method','target','type','value','content','title',
    // 'id','name','url','path','src','href','token','auth','user','pass',
    // 'status','code','message','error','session','cookie','page','sort',
    // 'order','limit','offset','index','count','format','mode','theme',
    // 'color','size','width','height','data','config','options','settings',
    // 'params','args','opts','get','post','put','delete','update','create',
    // 'read','list','new','body','on','off','yes','no','true','false'
    // ^^^ ALL removed from blocklist — these are common injectable param names
  ]);

  // Single-character params are almost always noise
  function isLikelyGarbage(param) {
    if (param.length <= 1) return true;
    if (/^\d+$/.test(param)) return true;          // purely numeric
    if (/^[_$]+$/.test(param)) return true;         // only underscores/dollars
    if (/\[.*\]/.test(param)) return true;           // array notation
    if (BLOCKLIST.has(param)) return true;
    if (BLOCKLIST.has(param.toLowerCase())) return true;
    return false;
  }

  // ─── PARAM STORE ──────────────────────────────────────────────────────────
  // Each entry: { name, sources: Set<string> }
  const paramMap = new Map();

  function addParam(name, source) {
    const decoded = (() => { try { return decodeURIComponent(name); } catch { return name; } })();
    if (isLikelyGarbage(decoded)) return;
    if (!paramMap.has(decoded)) paramMap.set(decoded, new Set());
    paramMap.get(decoded).add(source);
  }

  // ─── COLLECTION SOURCES ───────────────────────────────────────────────────

  // 1. Current URL query string
  const urlParams = new URLSearchParams(window.location.search);
  for (const [key] of urlParams.entries()) addParam(key, 'url-query');

  // 2. URL fragment (hash) if it contains params
  if (window.location.hash.includes('=')) {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
    for (const [key] of hashParams.entries()) addParam(key, 'url-hash');
  }

  // 3. Form elements (visible + hidden)
  document.querySelectorAll('input, textarea, select').forEach(el => {
    const n = el.getAttribute('name');
    if (n) addParam(n, `form[${el.tagName.toLowerCase()}]`);
    // Also grab data-* attributes that look like param names
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && attr.value) {
        const k = attr.name.replace(/^data-/, '');
        addParam(k, 'data-attr');
      }
    }
  });

  // 4. All anchor href query params
  document.querySelectorAll('a[href]').forEach(link => {
    try {
      const parsed = new URL(link.href, location.href);
      new URLSearchParams(parsed.search).forEach((_, key) => addParam(key, 'anchor-href'));
    } catch {}
  });

  // 5. All action attributes on forms
  document.querySelectorAll('form[action]').forEach(form => {
    try {
      const parsed = new URL(form.action, location.href);
      new URLSearchParams(parsed.search).forEach((_, key) => addParam(key, 'form-action'));
    } catch {}
  });

  // 6. Meta tags (name / property / content patterns)
  document.querySelectorAll('meta[name], meta[property]').forEach(meta => {
    const k = meta.getAttribute('name') || meta.getAttribute('property');
    if (k) addParam(k, 'meta-tag');
  });

  // 7. JSON-LD structured data — keys that look like URL params
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const obj = JSON.parse(s.textContent);
      function walkJson(o, depth = 0) {
        if (depth > 4 || !o || typeof o !== 'object') return;
        for (const key of Object.keys(o)) {
          addParam(key, 'json-ld');
          walkJson(o[key], depth + 1);
        }
      }
      walkJson(obj);
    } catch {}
  });

  // 8. localStorage / sessionStorage keys
  try {
    for (let i = 0; i < localStorage.length; i++) addParam(localStorage.key(i), 'localStorage');
  } catch {}
  try {
    for (let i = 0; i < sessionStorage.length; i++) addParam(sessionStorage.key(i), 'sessionStorage');
  } catch {}

  // 9. Regex-based extraction from inline & external scripts
  const URL_PARAM_RE   = /[?&]([a-zA-Z][a-zA-Z0-9_]{1,40})=/g;
  const FETCH_PARAM_RE = /["'`]([a-zA-Z][a-zA-Z0-9_]{1,40})["'`]\s*:/g; // JSON-body keys
  const NAMED_ARG_RE   = /\b([a-zA-Z][a-zA-Z0-9_]{1,40})\s*=/g;          // named args in strings

  function mineJs(content, sourceLabel) {
    let m;
    URL_PARAM_RE.lastIndex = 0;
    while ((m = URL_PARAM_RE.exec(content)) !== null) addParam(m[1], sourceLabel + ':url-pattern');
    FETCH_PARAM_RE.lastIndex = 0;
    while ((m = FETCH_PARAM_RE.exec(content)) !== null) addParam(m[1], sourceLabel + ':json-key');
    NAMED_ARG_RE.lastIndex = 0;
    while ((m = NAMED_ARG_RE.exec(content)) !== null) addParam(m[1], sourceLabel + ':named-arg');
  }

  // Inline scripts
  document.querySelectorAll('script:not([src])').forEach((s, i) => {
    mineJs(s.textContent || '', `inline-script[${i}]`);
  });

  // External scripts (async — list updates when they resolve)
  const externalFetches = [];
  document.querySelectorAll('script[src]').forEach(s => {
    const p = fetch(s.src, { method: 'GET', mode: 'cors' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(content => {
        mineJs(content, `ext-script[${new URL(s.src, location.href).pathname.split('/').pop()}]`);
        renderList();
      })
      .catch(() => {});
    externalFetches.push(p);
  });

  // ─── UI ───────────────────────────────────────────────────────────────────
  const COLORS = {
    bg:       '#0d1117',
    border:   '#30363d',
    header:   '#161b22',
    accent:   '#58a6ff',
    text:     '#c9d1d9',
    muted:    '#8b949e',
    tag:      '#21262d',
    tagText:  '#79c0ff',
    danger:   '#f85149',
    success:  '#3fb950',
    btnBg:    '#21262d',
    btnHover: '#30363d',
  };

  const root = document.createElement('div');
  Object.assign(root.style, {
    position:        'fixed',
    top:             '12px',
    right:           '12px',
    width:           '380px',
    maxHeight:       '580px',
    display:         'flex',
    flexDirection:   'column',
    backgroundColor: COLORS.bg,
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    '8px',
    fontFamily:      '"SF Mono", "Fira Code", monospace',
    fontSize:        '12px',
    zIndex:          '2147483647',
    boxShadow:       '0 8px 24px rgba(0,0,0,0.6)',
    color:           COLORS.text,
    overflow:        'hidden',
  });

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '10px 12px',
    backgroundColor: COLORS.header,
    borderBottom:    `1px solid ${COLORS.border}`,
    flexShrink:      '0',
  });

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.alignItems = 'center';
  titleWrap.style.gap = '8px';

  const dot = document.createElement('span');
  dot.textContent = '◉';
  dot.style.color = COLORS.accent;

  const titleEl = document.createElement('span');
  titleEl.textContent = 'ParamRecon';
  titleEl.style.fontWeight = 'bold';
  titleEl.style.color = COLORS.accent;
  titleEl.style.fontSize = '13px';

  const badge = document.createElement('span');
  Object.assign(badge.style, {
    backgroundColor: COLORS.accent,
    color:           '#0d1117',
    borderRadius:    '10px',
    padding:         '1px 7px',
    fontSize:        '11px',
    fontWeight:      'bold',
  });
  badge.textContent = '0';

  titleWrap.append(dot, titleEl, badge);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background:   'none',
    border:       'none',
    color:        COLORS.muted,
    cursor:       'pointer',
    fontSize:     '14px',
    padding:      '0',
    lineHeight:   '1',
  });
  closeBtn.onclick = () => root.remove();

  header.append(titleWrap, closeBtn);

  // Filter / search bar
  const searchBar = document.createElement('div');
  Object.assign(searchBar.style, {
    padding:      '8px 12px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink:   '0',
  });

  const searchInput = document.createElement('input');
  Object.assign(searchInput, { type: 'text', placeholder: 'Filter params...' });
  Object.assign(searchInput.style, {
    width:           '100%',
    boxSizing:       'border-box',
    backgroundColor: COLORS.tag,
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    '4px',
    color:           COLORS.text,
    padding:         '5px 8px',
    outline:         'none',
    fontFamily:      'inherit',
    fontSize:        '12px',
  });
  searchInput.addEventListener('input', renderList);
  searchBar.appendChild(searchInput);

  // List container
  const listWrap = document.createElement('div');
  Object.assign(listWrap.style, {
    overflowY: 'auto',
    flexGrow:  '1',
    padding:   '8px 12px',
  });

  // Toolbar
  const toolbar = document.createElement('div');
  Object.assign(toolbar.style, {
    display:         'flex',
    gap:             '6px',
    padding:         '8px 12px',
    borderTop:       `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.header,
    flexShrink:      '0',
    flexWrap:        'wrap',
  });

  function mkBtn(label, title, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    Object.assign(b.style, {
      backgroundColor: COLORS.btnBg,
      color:           COLORS.text,
      border:          `1px solid ${COLORS.border}`,
      borderRadius:    '4px',
      padding:         '4px 10px',
      cursor:          'pointer',
      fontFamily:      'inherit',
      fontSize:        '11px',
      flex:            '1',
    });
    b.onmouseover = () => b.style.backgroundColor = COLORS.btnHover;
    b.onmouseout  = () => b.style.backgroundColor = COLORS.btnBg;
    b.onclick = onClick;
    return b;
  }

  function getVisibleParams() {
    const q = searchInput.value.toLowerCase();
    return [...paramMap.entries()]
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }

  // Copy plain list
  toolbar.appendChild(mkBtn('Copy List', 'Copy param names to clipboard', () => {
    const text = getVisibleParams().map(([n]) => n).join('\n');
    navigator.clipboard.writeText(text).then(() => flashMsg('Copied!', COLORS.success));
  }));

  // Copy JSON (name → sources)
  toolbar.appendChild(mkBtn('Copy JSON', 'Copy as JSON {name:[sources]}', () => {
    const obj = {};
    getVisibleParams().forEach(([n, sources]) => { obj[n] = [...sources]; });
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
      .then(() => flashMsg('Copied JSON!', COLORS.success));
  }));

  // Download CSV
  toolbar.appendChild(mkBtn('Download CSV', 'Download as CSV file', () => {
    const rows = [['parameter', 'sources']];
    getVisibleParams().forEach(([n, sources]) => rows.push([n, [...sources].join(' | ')]));
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `params_${new URL(location.href).hostname}_${Date.now()}.csv`;
    a.click();
  }));

  // Download JSON
  toolbar.appendChild(mkBtn('Download JSON', 'Download full report as JSON', () => {
    const obj = { url: location.href, timestamp: new Date().toISOString(), params: {} };
    getVisibleParams().forEach(([n, sources]) => { obj.params[n] = [...sources]; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = `params_${new URL(location.href).hostname}_${Date.now()}.json`;
    a.click();
  }));

  // Flash message (inline feedback)
  const flashEl = document.createElement('div');
  Object.assign(flashEl.style, {
    textAlign:  'center',
    fontSize:   '11px',
    padding:    '2px 12px',
    flexBasis:  '100%',
    display:    'none',
  });
  toolbar.appendChild(flashEl);

  function flashMsg(msg, color) {
    flashEl.textContent = msg;
    flashEl.style.color = color;
    flashEl.style.display = 'block';
    setTimeout(() => { flashEl.style.display = 'none'; }, 1800);
  }

  root.append(header, searchBar, listWrap, toolbar);
  document.body.appendChild(root);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  function renderList() {
    const visible = getVisibleParams();
    badge.textContent = String(paramMap.size);
    listWrap.innerHTML = '';

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = paramMap.size === 0 ? 'Scanning…' : 'No matches.';
      Object.assign(empty.style, { color: COLORS.muted, textAlign: 'center', padding: '20px 0' });
      listWrap.appendChild(empty);
      return;
    }

    visible.forEach(([name, sources]) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display:       'flex',
        flexWrap:      'wrap',
        alignItems:    'baseline',
        gap:           '4px',
        padding:       '5px 0',
        borderBottom:  `1px solid ${COLORS.border}`,
      });

      const nameEl = document.createElement('span');
      nameEl.textContent = name;
      Object.assign(nameEl.style, {
        color:      COLORS.accent,
        fontWeight: 'bold',
        flexShrink: '0',
        cursor:     'pointer',
        userSelect: 'text',
      });
      nameEl.title = 'Click to copy';
      nameEl.onclick = () => navigator.clipboard.writeText(name)
        .then(() => flashMsg(`Copied: ${name}`, COLORS.success));

      row.appendChild(nameEl);

      [...sources].forEach(src => {
        const tag = document.createElement('span');
        tag.textContent = src;
        Object.assign(tag.style, {
          backgroundColor: COLORS.tag,
          color:           COLORS.tagText,
          borderRadius:    '3px',
          padding:         '1px 5px',
          fontSize:        '10px',
        });
        row.appendChild(tag);
      });

      listWrap.appendChild(row);
    });
  }

  // Initial render + re-render after async script fetches
  renderList();

})();
