// app.js
import * as Queue from './queue.js';
import * as Search from './search.js';
import * as Admin from './admin.js';
import * as UI from './ui.js';
import * as Util from './util.js';
import * as Sessions from './sessions.js';
import * as SessionSettings from './session-settings.js';

let currentSessionId = null;
let sessionToken = null;

// Settings Modal Functions
window.openSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('show'), 10);
        loadVersionInfo();
    }
};

window.closeSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
};

// Load version and settings information
function loadVersionInfo() {
    fetch('/api/version')
        .then(response => response.json())
        .then(data => {
            // Only update elements if they exist
            const appVersion = document.getElementById('appVersion');
            const appTimestamp = document.getElementById('appTimestamp');
            const weddingModeStatus = document.getElementById('weddingModeStatus');
            
            if (appVersion) appVersion.textContent = data.version || 'unknown';
            if (appTimestamp) appTimestamp.textContent = new Date(data.timestamp * 1000).toLocaleString();
            if (weddingModeStatus) weddingModeStatus.textContent = data.wedding_mode ? 'Enabled' : 'Disabled';
            
            // Update footer version
            const versionInfo = document.getElementById('versionInfo');
            if (versionInfo) {
                versionInfo.textContent = `v${data.version}`;
            }
            
            // Setup wedding mode toggle
            const toggleButton = document.getElementById('toggleWeddingMode');
            if (toggleButton) {
                toggleButton.onclick = () => toggleWeddingMode();
            }
        })
        .catch(error => {
            console.error('Error loading version info:', error);
            // Only update elements if they exist
            const appVersion = document.getElementById('appVersion');
            const appTimestamp = document.getElementById('appTimestamp');
            const weddingModeStatus = document.getElementById('weddingModeStatus');
            
            if (appVersion) appVersion.textContent = 'Error loading';
            if (appTimestamp) appTimestamp.textContent = 'Error loading';
            if (weddingModeStatus) weddingModeStatus.textContent = 'Error loading';
        });
}

// Toggle wedding mode
function toggleWeddingMode() {
    const toggleButton = document.getElementById('toggleWeddingMode');
    if (toggleButton) {
        toggleButton.disabled = true;
        toggleButton.textContent = 'Toggling...';
    }
    
    fetch('/api/toggle-wedding-mode', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('weddingModeStatus').textContent = data.wedding_mode ? 'Enabled' : 'Disabled';
            UI.showNotification(data.message, 'success');
            
            // Reload page after a brief delay to reflect changes
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            UI.showNotification(`Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error toggling wedding mode:', error);
        UI.showNotification('Error toggling wedding mode', 'error');
    })
    .finally(() => {
        if (toggleButton) {
            toggleButton.disabled = false;
            toggleButton.textContent = 'Toggle Wedding Mode';
        }
    });
}

function initializeApp() {
    console.log('Initializing app...');
    
    // Load version info on startup
    loadVersionInfo();
    
    Util.initializeDebugMode().then(() => {
        // Extract session ID from URL path (e.g., /6d859ee1 -> 6d859ee1)
        const pathParts = window.location.pathname.split('/');
        console.log('URL pathname:', window.location.pathname);
        console.log('Path parts:', pathParts);
        
        // Check if this is a session page (URL format: /sessionId)
        // Session IDs are 8-character alphanumeric strings
        if (pathParts[1] && pathParts[1] !== '' && pathParts.length === 2) {
            const potentialSessionId = pathParts[1];
            // Only treat as session ID if it's 8 alphanumeric characters
            if (/^[a-z0-9]{8}$/i.test(potentialSessionId)) {
                currentSessionId = potentialSessionId;
                console.log('Detected session ID:', currentSessionId);
            } else {
                console.log('Path is not a session ID:', potentialSessionId);
            }
        }

        if (currentSessionId) {
            console.log(`Initializing session: ${currentSessionId}`);
            initializeSession(currentSessionId);
        } else {
            console.log('Initializing main view');
            Admin.checkAdminStatus().then(updateUIForAdminStatus);
            initializeMainView();
        }

        setupEventListeners();
        updateUIForMobile();
        SessionSettings.setupSessionSettingsListeners();

        console.log('App initialization complete');
    });
}

function initializeSession(sessionId) {
    console.log(`Initializing session: ${sessionId}`);
    fetchSessionToken(sessionId)
        .then(() => {
            console.log('Session token fetched, now registering participant');
            // Register participant when joining session
            return Queue.registerParticipant(sessionId);
        })
        .then((participantData) => {
            console.log('Participant registration result:', participantData);
            fetchAndUpdateQueue(sessionId);
            setInterval(() => fetchAndUpdateQueue(sessionId), 5000);
            loadInitialSearch(sessionId);
            // Don't show generic success notification - participant registration handles its own notifications
        })
        .catch(error => {
            console.error('Error initializing session:', error);
            UI.showNotification('Error initializing session', 'error');
        });
}

function initializeMainView() {
    fetchAndUpdateQueue();
    setInterval(fetchAndUpdateQueue, 5000);
    loadInitialSearch();
}

function fetchSessionToken(sessionId) {
    return fetch(`/session/${sessionId}/token`)
        .then(response => response.json())
        .then(data => {
            if (data.token) {
                sessionToken = data.token;
                console.log('Session token fetched successfully');
            } else {
                throw new Error('Failed to fetch session token');
            }
        });
}

function loadInitialSearch(sessionId = null) {
    const initialQuery = new URLSearchParams(window.location.search).get('query');
    if (initialQuery) {
        const searchInput = document.querySelector('input[name="query"]');
        if (searchInput) {
            searchInput.value = initialQuery;
            performSearch(initialQuery, sessionId);
        }
    }
}

function fetchAndUpdateQueue(sessionId = null) {
    const url = sessionId ? `/session/${sessionId}/current_queue` : '/current_queue';
    const headers = sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {};

    fetch(url, { headers })
        .then(response => response.json())
        .then(data => {
            if (data) {
                UI.updateQueueDisplay(data);
                if (data.current_track) {
                    UI.updateNowPlayingBar(data.current_track);
                }
            } else {
                console.error('Received undefined data from fetchQueue');
            }
        })
        .catch(error => console.error('Error fetching queue:', error));
}

function setupEventListeners() {
    const searchInput = document.querySelector('input[name="query"]');
    const searchButton = document.querySelector('button[type="submit"]');
    const clearButton = document.querySelector('.clear-button');
    const newSessionButton = document.getElementById('newSessionButton');
    const shareSessionButton = document.getElementById('shareSessionButton');
    const iconContainer = document.querySelector('.icon-container');
    const headerLink = document.querySelector('.header-link');


    if (headerLink) {
        headerLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.reload();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
        searchInput.addEventListener('keypress', handleSearchKeyPress);
    }

    if (searchButton) {
        searchButton.addEventListener('click', handleSearchSubmit);
    }

    if (clearButton) {
        clearButton.addEventListener('click', handleClearSearch);
    }

    if (newSessionButton) {
        newSessionButton.addEventListener('click', handleNewSession);
    }

    if (shareSessionButton) {
        shareSessionButton.addEventListener('click', handleShareSession);
    }

    if (iconContainer) {
        iconContainer.addEventListener('click', handleIconClick);
    }

    window.addEventListener('resize', handleResize);

    setupModalListeners();
}

function handleSearchInput(e) {
    const query = e.target.value;
    if (query.length >= 3) {
        console.log('Fetching recommendations for:', query);
        Search.fetchRecommendations(query, currentSessionId, sessionToken);
    } else {
        document.querySelector('.results').innerHTML = '';
    }
    Admin.checkAdminKeyword(query);
}

function handleSearchKeyPress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
    }
}

function handleSearchSubmit(e) {
    e.preventDefault();
    performSearch();
}

function performSearch(query = null, sessionId = null) {
    const searchQuery = query || document.querySelector('input[name="query"]').value;
    console.log('Performing search for:', searchQuery);
    Search.performSearch(searchQuery, sessionId, sessionToken);
}

function handleClearSearch() {
    const searchInput = document.querySelector('input[name="query"]');
    if (searchInput) {
        searchInput.value = '';
        document.querySelector('.results').innerHTML = '';
        console.log('Search input cleared');
    }
}

function handleNewSession() {
    fetch('/create_session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log('Server response:', data);
        if (data.status === 'success' && data.session_id && data.redirect_url) {
            console.log('Received redirect URL:', data.redirect_url);
            let secureRedirectUrl = data.redirect_url.replace(/^http:/, 'https:');
            console.log('Secure redirect URL:', secureRedirectUrl);
            if (secureRedirectUrl.startsWith('https://')) {
                window.location.href = secureRedirectUrl;
            } else {
                throw new Error('Generated URL is not HTTPS');
            }
        } else {
            throw new Error(data.message || 'Failed to create new session');
        }
    })
    .catch(error => {
        console.error('Error creating new session:', error);
        UI.showNotification('Error creating new session: ' + error.message, 'error');
    });
}

function handleShareSession() {
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        const sessionLinkElement = document.getElementById('sessionLink');
        if (sessionLinkElement) {
            let currentUrl = window.location.href;
            let secureUrl = currentUrl.replace(/^http:/, 'https:');
            console.log('Share session URL:', secureUrl);
            sessionLinkElement.value = secureUrl;
        }
        showModal('shareModal');
    }
}

function handleIconClick() {
    if (Admin.isInAdminMode()) {
        Admin.deactivateAdminMode();
    }
}

function handleResize() {
    updateUIForMobile();
}

function updateUIForMobile() {
    if (Util.isMobile()) {
        UI.createNowPlayingBar();
    } else {
        UI.removeNowPlayingBar();
    }
}

function setupModalListeners() {
    setupTipModalListeners();
    setupShareModalListeners();
}

function setupTipModalListeners() {
    const tipModal = document.getElementById('tipModal');
    const tipButton = document.getElementById('tipButton');
    
    if (tipButton && tipModal && typeof qrCodeAvailable !== 'undefined' && qrCodeAvailable) {
        tipButton.style.display = 'inline-block';
        const closeButton = tipModal.querySelector('.close');

        tipButton.onclick = () => {
            tipModal.style.display = 'block';
            setTimeout(() => tipModal.classList.add('show'), 10);
        };

        closeButton.onclick = () => closeTipModal(tipModal);

        window.onclick = (event) => {
            if (event.target == tipModal) {
                closeTipModal(tipModal);
            }
        };
    } else if (tipButton) {
        tipButton.style.display = 'none';
    }
}

function setupShareModalListeners() {
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        const closeButton = shareModal.querySelector('.close');

        closeButton.onclick = () => closeModal(shareModal);

        window.onclick = (event) => {
            if (event.target == shareModal) {
                closeModal(shareModal);
            }
        };
    }
}

function closeTipModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

function closeModal(modal) {
    modal.style.display = 'none';
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

function updateUIForAdminStatus(isAdmin) {
    UI.updateUIForAdminStatus(isAdmin);
    Admin.updateAdminControls();
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Expose necessary functions to the global scope for inline event handlers
window.addTrackToQueue = (track_uri, track_name, artist_name) => {
    Queue.addTrackToQueue(track_uri, track_name, artist_name, currentSessionId, sessionToken);
};
window.playTrackNow = (track_uri) => Queue.playTrackNow(track_uri, sessionToken);
window.clearQueue = () => Queue.clearQueue(sessionToken);
window.skipTrack = () => Queue.skipTrack(sessionToken);
window.performSearch = performSearch;
window.copySessionLink = SessionSettings.copySessionLink;
window.copyPlaylistLink = SessionSettings.copyPlaylistLink;

console.log('App.js loaded');