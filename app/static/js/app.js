// app.js
import * as Queue from './queue.js';
import * as Search from './search.js';
import * as Admin from './admin.js';
import * as UI from './ui.js';
import * as Util from './util.js';
import * as Sessions from './sessions.js';

let currentSessionId = null;

function initializeApp() {
    console.log('Initializing app...');
    Util.initializeDebugMode();
    Admin.checkAdminStatus().then(updateUIForAdminStatus);
    setupEventListeners();

    const urlParams = new URLSearchParams(window.location.search);
    currentSessionId = urlParams.get('session_id');

    if (currentSessionId) {
        console.log(`Initializing session: ${currentSessionId}`);
        initializeSession(currentSessionId);
    } else {
        console.log('Initializing main view');
        initializeMainView();
    }

    if (Util.isMobile()) {
        UI.createNowPlayingBar();
    }

    console.log('App initialization complete');
}

function initializeSession(sessionId) {
    Sessions.joinSession(sessionId);
    fetchAndUpdateQueue(sessionId);
    setInterval(() => fetchAndUpdateQueue(sessionId), 5000);

    const initialQuery = new URLSearchParams(window.location.search).get('query');
    if (initialQuery) {
        const searchInput = document.querySelector('input[name="query"]');
        if (searchInput) {
            searchInput.value = initialQuery;
            Search.performSearch(initialQuery, sessionId);
        }
    }
}

function initializeMainView() {
    fetchAndUpdateQueue();
    setInterval(fetchAndUpdateQueue, 5000);

    const initialQuery = new URLSearchParams(window.location.search).get('query');
    if (initialQuery) {
        const searchInput = document.querySelector('input[name="query"]');
        if (searchInput) {
            searchInput.value = initialQuery;
            Search.performSearch(initialQuery);
        }
    }
}

function fetchAndUpdateQueue(sessionId = null) {
    Queue.fetchQueue(sessionId)
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
    const iconContainer = document.querySelector('.icon-container');

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

    if (iconContainer) {
        iconContainer.addEventListener('click', handleIconClick);
    }

    window.addEventListener('resize', handleResize);

    setupTipModalListeners();
}

function handleSearchInput(e) {
    const query = e.target.value;
    if (query.length >= 3) {
        console.log('Fetching recommendations for:', query);
        Search.fetchRecommendations(query, currentSessionId);
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

function performSearch() {
    const query = document.querySelector('input[name="query"]').value;
    console.log('Performing search for:', query);
    Search.performSearch(query, currentSessionId);
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
    Sessions.createNewSession()
        .then(data => {
            if (data.status === 'success') {
                window.location.href = data.redirect_url;
            } else {
                UI.showNotification('Failed to create new session', 'error');
            }
        })
        .catch(error => {
            console.error('Error creating new session:', error);
            UI.showNotification('Error creating new session', 'error');
        });
}

function handleIconClick() {
    if (Admin.isInAdminMode()) {
        Admin.deactivateAdminMode();
    }
}

function handleResize() {
    if (Util.isMobile()) {
        UI.createNowPlayingBar();
    } else {
        UI.removeNowPlayingBar();
    }
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

        closeButton.onclick = closeTipModal;

        window.onclick = (event) => {
            if (event.target == tipModal) {
                closeTipModal();
            }
        };
    } else if (tipButton) {
        tipButton.style.display = 'none';
    }
}

function closeTipModal() {
    const tipModal = document.getElementById('tipModal');
    tipModal.classList.remove('show');
    setTimeout(() => tipModal.style.display = 'none', 300);
}

function updateUIForAdminStatus(isAdmin) {
    UI.updateUIForAdminStatus(isAdmin);
    Admin.updateAdminControls();
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Expose necessary functions to the global scope for inline event handlers
window.addTrackToQueue = (track_uri, track_name, artist_name) => {
    Queue.addTrackToQueue(track_uri, track_name, artist_name, currentSessionId);
};
window.playTrackNow = Queue.playTrackNow;
window.clearQueue = Queue.clearQueue;
window.skipTrack = Queue.skipTrack;
window.performSearch = performSearch;

console.log('App.js loaded');