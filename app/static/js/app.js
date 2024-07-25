// app.js
import * as Queue from './queue.js';
import * as Search from './search.js';
import * as Admin from './admin.js';
import * as UI from './ui.js';
import * as Util from './util.js';

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/service-worker.js')
        .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
        .catch(error => console.error('ServiceWorker registration failed: ', error));
}

function initializeApp() {
    console.log('Initializing app...');
    Util.initializeDebugMode();
    Admin.checkAdminStatus();
    Admin.updateAdminControls();
    console.log('Initializing queue fetch');
    Queue.fetchQueue().then(data => {
        console.log('Queue data received:', data);
        UI.updateQueueDisplay(data);
    }).catch(error => console.error('Error fetching queue:', error));
    setInterval(() => Queue.fetchQueue().then(UI.updateQueueDisplay).catch(error => console.error('Error fetching queue:', error)), 5000);

    if (Util.isMobile()) {
        UI.createNowPlayingBar();
    }

    // Handle the case when the page is loaded with a search query
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('query');
    if (initialQuery) {
        const searchInput = document.querySelector('input[name="query"]');
        if (searchInput) {
            searchInput.value = initialQuery;
            Search.performSearch(initialQuery);
        }
    }

    // Set up event listeners
    setupEventListeners();
    console.log('App initialization complete');
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    const searchInput = document.querySelector('input[name="query"]');
    const searchButton = document.querySelector('button[type="submit"]');
    const iconContainer = document.querySelector('.icon-container');
    const clearButton = document.querySelector('.clear-button');

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                document.querySelector('.results').innerHTML = '';
                console.log('Search input cleared');
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            if (query.length >= 3) {
                console.log('Fetching recommendations for:', query);
                Search.fetchRecommendations(query);
            } else {
                document.querySelector('.results').innerHTML = '';
            }
            // Check for admin keyword on each input
            Admin.checkAdminKeyword(query);
        });
    }

    if (iconContainer) {
        iconContainer.addEventListener('click', () => {
            if (Admin.isInAdminMode()) {
                Admin.deactivateAdminMode();
            }
        });
    }

    if (searchButton) {
        searchButton.addEventListener('click', (e) => {
            e.preventDefault();
            const query = searchInput ? searchInput.value : '';
            console.log('Performing search for:', query);
            Search.performSearch(query);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = searchInput.value;
                console.log('Performing search for:', query);
                Search.performSearch(query);
            }
        });
    }

    // Handle resize events
    window.addEventListener('resize', () => {
        if (Util.isMobile()) {
            UI.createNowPlayingBar();
        } else {
            UI.removeNowPlayingBar();
        }
    });

    // Tip modal functionality
    const tipModal = document.getElementById('tipModal');
    const tipButton = document.getElementById('tipButton');
    if (tipButton && tipModal && typeof qrCodeAvailable !== 'undefined' && qrCodeAvailable) {
        tipButton.style.display = 'inline-block';
        const closeButton = tipModal.querySelector('.close');

        tipButton.onclick = () => {
            tipModal.style.display = 'block';
            setTimeout(() => tipModal.classList.add('show'), 10);
        };

        closeButton.onclick = () => {
            tipModal.classList.remove('show');
            setTimeout(() => tipModal.style.display = 'none', 300);
        };

        window.onclick = (event) => {
            if (event.target == tipModal) {
                tipModal.classList.remove('show');
                setTimeout(() => tipModal.style.display = 'none', 300);
            }
        };
    } else if (tipButton) {
        tipButton.style.display = 'none';
    }
    console.log('Event listeners setup complete');
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Expose necessary functions to the global scope for inline event handlers
window.addTrackToQueue = Queue.addTrackToQueue;
window.playTrackNext = Queue.playTrackNow;
window.clearQueue = Queue.clearQueue;
window.skipTrack = Queue.skipTrack;
window.isInAdminMode = Admin.isInAdminMode;

console.log('App.js loaded');