function displayUrlParameters() {
    // Create a div for the pop-up window
    const popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.top = '10px';
    popup.style.right = '10px';
    popup.style.width = '300px';
    popup.style.maxHeight = '400px';
    popup.style.overflowY = 'auto';
    popup.style.backgroundColor = '#000000'; // Changed to black
    popup.style.border = '1px solid #333';
    popup.style.borderRadius = '5px';
    popup.style.padding = '10px';
    popup.style.zIndex = '9999';
    popup.style.fontFamily = 'Arial, sans-serif';
    popup.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    
    // Add a close button
    const closeButton = document.createElement('button');
    closeButton.innerText = 'Close';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '5px';
    closeButton.style.right = '5px';
    closeButton.style.backgroundColor = '#ff4444';
    closeButton.style.color = '#fff';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '3px';
    closeButton.style.padding = '5px 10px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = () => popup.remove();
    
    // Create a title
    const title = document.createElement('h3');
    title.innerText = 'Thorough URL Parameters';
    title.style.margin = '0 0 10px 0';
    title.style.fontSize = '16px';
    
    // Create a list for parameters
    const paramList = document.createElement('ul');
    paramList.style.listStyle = 'none';
    paramList.style.padding = '0';
    paramList.style.margin = '0';
    
    // Function to check if parameter is valid (no array-like notation)
    function isValidParameter(paramName) {
        return !/\[.*\]/.test(paramName);
    }
    
    // Function to extract JS parameters using regex
    function extractJsParameters(jsContent) {
        const parameters = new Set();
        const urlPattern = /[?&]([a-zA-Z0-9_]+)=/g;
        const functionCallPattern = /([a-zA-Z0-9_]+)\s*\(/g;
        
        let match;
        while ((match = urlPattern.exec(jsContent)) !== null) {
            parameters.add(match[1]);
        }
        while ((match = functionCallPattern.exec(jsContent)) !== null) {
            parameters.add(match[1]);
        }
        
        return parameters;
    }
    
    // Collect all unique parameters
    const parameters = new Set();
    
    // 1. From current URL query string
    const urlParams = new URLSearchParams(window.location.search);
    for (const [key] of urlParams.entries()) {
        if (isValidParameter(key)) {
            parameters.add(decodeURIComponent(key));
        }
    }
    
    // 2. From form elements: input, textarea, select (including hidden)
    const formElements = document.querySelectorAll('input, textarea, select');
    formElements.forEach(el => {
        const name = el.getAttribute('name');
        if (name && isValidParameter(name)) {
            parameters.add(name);
        }
    });
    
    // 3. From anchor tags' href query parameters
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
        try {
            const href = link.href;
            const parsed = new URL(href);
            const queryParams = new URLSearchParams(parsed.search);
            for (const [key] of queryParams.entries()) {
                if (isValidParameter(key)) {
                    parameters.add(decodeURIComponent(key));
                }
            }
        } catch (e) {
            console.error('Error parsing link:', e);
        }
    });
    
    // 4. From script tags: inline and external
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
        if (script.src) {
            // External script: attempt to fetch
            fetch(script.src, { method: 'GET', mode: 'cors' })
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.text();
                })
                .then(jsContent => {
                    extractJsParameters(jsContent).forEach(param => {
                        if (isValidParameter(param)) {
                            parameters.add(param);
                        }
                    });
                    // Update the list after async fetch
                    updateParamList();
                })
                .catch(error => {
                    console.error(`Error fetching external script ${script.src}:`, error);
                });
        } else {
            // Inline script
            const jsContent = script.textContent || script.innerHTML;
            extractJsParameters(jsContent).forEach(param => {
                if (isValidParameter(param)) {
                    parameters.add(param);
                }
            });
        }
    });
    
    // Function to update the parameter list in the popup
    function updateParamList() {
        paramList.innerHTML = ''; // Clear existing list
        const sortedParams = Array.from(parameters).sort();
        
        if (sortedParams.length === 0) {
            const noParams = document.createElement('li');
            noParams.innerText = 'No parameters found.';
            noParams.style.color = '#888';
            paramList.appendChild(noParams);
        } else {
            sortedParams.forEach(param => {
                const li = document.createElement('li');
                li.style.marginBottom = '5px';
                li.style.fontSize = '14px';
                li.innerHTML = `<strong>${param}</strong>`;
                paramList.appendChild(li);
            });
        }
    }
    
    // Initial update (sync parts)
    updateParamList();
    
    // Append elements to popup
    popup.appendChild(closeButton);
    popup.appendChild(title);
    popup.appendChild(paramList);
    
    // Add popup to the document
    document.body.appendChild(popup);
}

// Execute the function
displayUrlParameters();
