// util.js

export function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

export function isMobile() {
    return window.innerWidth <= 767;
}

export function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

let debugMode = false;

export function setDebugMode(isDebug) {
    debugMode = isDebug;
    if (debugMode) {
        console.log('Debug mode is enabled');
    }
}

export function debugLog(...args) {
    if (debugMode) {
        console.log(...args);
    }
}

export function initializeDebugMode() {
    return fetch('/debug_status')
        .then(response => response.json())
        .then(data => {
            setDebugMode(data.debug_mode);
        })
        .catch(error => console.error('Error fetching debug status:', error));
}