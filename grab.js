(function() {
    'use strict'; // Enforce strict mode for better error handling
    const parameters = new Set();

    try {
        // ===== 1. EXTRACT FROM FORMS =====
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            const inputs = form.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                const name = input.getAttribute('name');
                if (name) {
                    parameters.add(name);
                }
            });
        });

        // ===== 2. EXTRACT FROM LINKS (QUERY PARAMS IN HREF) =====
        const links = document.querySelectorAll('a[href]');
        links.forEach(link => {
            try {
                const url = new URL(link.href, window.location.origin);
                url.searchParams.forEach((value, key) => {
                    if (key) {
                        parameters.add(key);
                    }
                });
            } catch (e) {
                // Skip invalid URLs
            }
        });

        // ===== 3. EXTRACT FROM SCRIPTS (STATIC ANALYSIS) =====
        const regex = /[?&]([a-zA-Z0-9_.-]+)=/g;
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent || script.innerHTML;
            let match;
            while ((match = regex.exec(content)) !== null) {
                parameters.add(match[1]);
            }
        });

        // Scan page HTML for query params
        const pageContent = document.documentElement.outerHTML;
        let match;
        const pageRegex = new RegExp(regex);
        while ((match = pageRegex.exec(pageContent)) !== null) {
            parameters.add(match[1]);
        }

        // ===== 4. DYNAMIC MONITORING FOR NETWORK REQUESTS =====
        // Monitor XHR
        if (XMLHttpRequest && XMLHttpRequest.prototype && XMLHttpRequest.prototype.open) {
            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                try {
                    const fullUrl = new URL(url, window.location.origin);
                    fullUrl.searchParams.forEach((value, key) => {
                        if (key) {
                            parameters.add(key);
                        }
                    });
                    console.log(`[XHR Param] Found params in ${method} -> ${fullUrl.pathname}`);
                } catch (e) {}
                return originalXHROpen.apply(this, arguments);
            };
        }

        // Monitor Fetch
        if (window.fetch) {
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
                let url = typeof input === 'string' ? input : input.url;
                try {
                    const fullUrl = new URL(url, window.location.origin);
                    fullUrl.searchParams.forEach((value, key) => {
                        if (key) {
                            parameters.add(key);
                        }
                    });
                    console.log(`[Fetch Param] Found params in -> ${fullUrl.pathname}`);
                } catch (e) {}
                return originalFetch.apply(this, arguments);
            };
        }

        // ===== 5. OUTPUT RESULTS =====
        function displayResults() {
            try {
                console.log(`\n=== Discovered Parameters (${parameters.size}) ===`);
                parameters.forEach(param => console.log(param));

                const output = document.createElement('div');
                output.style.cssText = 'position:fixed;top:0;left:0;width:100%;max-height:50%;overflow:auto;background:#111;color:#0f0;padding:10px;z-index:99999;font-size:12px;';
                output.innerHTML = `<strong>Discovered Parameters (${parameters.size}):</strong><br>` + [...parameters].join('<br>');
                document.body.appendChild(output);
            } catch (e) {
                console.error('Error displaying results:', e);
            }
        }

        // Initial display after 5 seconds
        setTimeout(displayResults, 5000);

        // Expose functions to manually display or get results
        window.getParameters = () => [...parameters];
        window.displayParameters = displayResults;

        console.log('Parameter discovery script loaded. Parameters will be monitored dynamically. Call displayParameters() to show results anytime.');
    } catch (e) {
        console.error('Error in parameter discovery script:', e);
    }
})();
