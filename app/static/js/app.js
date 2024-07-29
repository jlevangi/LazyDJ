// app.js
import * as Queue from './queue.js';
import * as Search from './search.js';
import * as Admin from './admin.js';
import * as UI from './ui.js';
import * as Util from './util.js';
import * as Sessions from './sessions.js';

let currentSessionId = null;
let sessionToken = null;

function initializeApp() {
    console.log('Initializing app...');
    Util.initializeDebugMode().then(() => {
        const urlParams = new URLSearchParams(window.location.search);
        currentSessionId = urlParams.get('session_id');

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

        console.log('App initialization complete');
    });
}

function initializeSession(sessionId) {
    fetchSessionToken(sessionId)
        .then(() => {
            fetchAndUpdateQueue(sessionId);
            setInterval(() => fetchAndUpdateQueue(sessionId), 5000);
            loadInitialSearch(sessionId);
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
        shareModal.style.display = 'block';
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
window.handleShareSession = handleShareSession;
window.copySessionLink = () => {
    const copyText = document.getElementById("sessionLink");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    document.execCommand("copy");
    UI.showNotification("Copied the session link!", "success");
};

console.log('App.js loaded');