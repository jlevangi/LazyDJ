// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/service-worker.js')
        .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
        .catch(error => console.error('ServiceWorker registration failed: ', error));
}

// Debug mode handling
let debugMode = false;

function setDebugMode(isDebug) {
    debugMode = isDebug;
    if (debugMode) {
        console.log('Debug mode is enabled');
    }
}

function debugLog(...args) {
    if (debugMode) {
        console.log(...args);
    }
}

function initializeDebugMode() {
    fetch('/debug_status')
    .then(response => response.json())
    .then(data => {
        setDebugMode(data.debug_mode);
    })
    .catch(error => console.error('Error fetching debug status:', error));
}

// Notification handling
function showNotification(message, type) {
    debugLog('showNotification called with message:', message, 'and type:', type);
    const notification = document.getElementById('notification');
    if (!notification) {
        console.error('Notification element not found in the DOM');
        return;
    }
    notification.textContent = message;
    notification.className = type === 'error' ? 'error' : '';
    notification.style.display = 'block';
    
    notification.offsetHeight; // Force a reflow
    
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.style.display = 'none';
        }, 500);
    }, 3000);
}

// UI helpers
function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

function updateUIForAdminStatus(isAdmin) {
    debugLog('Updating UI for admin status:', isAdmin);
    const header = document.querySelector('.header-container');
    const playNextButtons = document.querySelectorAll('.play-next-button');
    
    if (isAdmin) {
        header.classList.add('admin-mode');
        playNextButtons.forEach(button => button.style.display = 'inline-block');
    } else {
        header.classList.remove('admin-mode');
        playNextButtons.forEach(button => button.style.display = 'none');
    }
}

// Queue management
let userQueue = [];
let radioQueue = [];

function addTrackToQueue(track_uri, trackName, artistName) {
    debugLog(`Attempting to add track to queue: ${trackName} by ${artistName}`);

    // First, check admin status
    fetch('/check_admin_status')
    .then(response => response.json())
    .then(data => {
        debugLog('Admin check response:', data);
        updateUIForAdminStatus(data.is_admin);
        
        // Now proceed with adding the track to the queue
        return fetch('/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ 
                'track_uri': track_uri, 
                'track_name': trackName, 
                'artist_name': artistName,
                'is_admin': data.is_admin
            })
        });
    })
    .then(response => response.json())
    .then(data => {
        debugLog('Server response:', data.status);
        if (data.status === 'success') {
            showNotification(data.message, 'success');
            fetchQueue();
        } else if (data.status === 'cooldown') {
            showNotification(data.message, 'info');
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error adding track to queue:', error);
        showNotification('Error adding track to queue', 'error');
    });
}

function playTrackNext(track_uri) {
    debugLog('Attempting to play track next:', track_uri);
    fetch('/play_next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'track_uri': track_uri })
    })
    .then(response => response.json())
    .then(data => {
        debugLog('Server response:', data);
        showNotification(data.message, data.type || 'success');
        if (data.status === 'success') {
            fetchQueue();
        }
    })
    .catch(error => {
        console.error('Error playing track next:', error);
        showNotification('Error playing track next', 'error');
    });
}

function fetchQueue() {
    debugLog('Fetching current queue');
    fetch('/current_queue')
    .then(response => response.json())
    .then(data => {
        debugLog('Current track:', data.current_track ? `${data.current_track.name} by ${data.current_track.artists}` : 'None');
        debugLog('User queue:', data.user_queue.map(t => `${t.name} by ${t.artists}`).join(', '));
        debugLog('Radio queue (first 5):', data.radio_queue.slice(0, 5).map(t => `${t.name} by ${t.artists}`).join(', '));
        
        userQueue = data.user_queue;
        radioQueue = data.radio_queue;
        updateQueueDisplay(data.current_track);
    })
    .catch(error => console.error('Error fetching queue:', error));
}

function updateQueueDisplay(currentTrack) {
    debugLog('Updating queue display');
    const queueContainer = document.getElementById('queue');
    queueContainer.innerHTML = '';

    if (currentTrack) {
        queueContainer.innerHTML += `
            <div class="queue-item current-track">
                ${currentTrack.name} by ${currentTrack.artists}
            </div>`;
    }

    if (userQueue.length > 0) {
        queueContainer.innerHTML += '<h3>In Queue</h3>';
        userQueue.forEach(track => {
            queueContainer.innerHTML += `
                <div class="queue-item">
                    ${track.name} by ${track.artists}
                </div>`;
        });
    }

    if (radioQueue.length > 0) {
        queueContainer.innerHTML += '<h3>Up Next</h3>';
        radioQueue.slice(0, 5).forEach(track => {
            queueContainer.innerHTML += `
                <div class="queue-item">
                    ${track.name} by ${track.artists}
                </div>`;
        });

        if (radioQueue.length > 5) {
            queueContainer.innerHTML += `
                <div class="queue-item more-tracks">
                    + ${radioQueue.length - 5} more tracks
                </div>`;
        }
    }

    if (userQueue.length === 0 && radioQueue.length === 0) {
        queueContainer.innerHTML += '<p>No tracks in queue</p>';
    }
}

// Recommendations and search
function fetchRecommendations(query) {
    debugLog('Fetching recommendations for query:', query);
    fetch(`/recommendations?query=${encodeURIComponent(query)}`)
    .then(response => response.json())
    .then(data => {
        debugLog('Recommendations data:', data);
        const resultsContainer = document.querySelector('.results');
        resultsContainer.innerHTML = '';
        data.forEach(track => {
            resultsContainer.innerHTML += `
                <div class="result-item">
                    ${track.album_art ? `<img src="${track.album_art}" alt="${track.name} album art" class="album-art">` : ''}
                    <div class="track-info">
                        <p class="track-name" title="${track.name}">${truncateText(track.name, 40)}</p>
                        <p class="track-artist" title="${track.artists}">${truncateText(track.artists, 40)}</p>
                    </div>
                    <div class="button-container">
                        <button onclick="addTrackToQueue('${track.uri}', '${track.name}', '${track.artists}')">Add to Queue</button>
                        ${document.querySelector('.header-container').classList.contains('admin-mode') ?
                            `<button onclick="playTrackNext('${track.uri}')" class="play-next-button">Play Next</button>` : ''}
                    </div>
                </div>`;
        });
    })
    .catch(error => console.error('Error fetching recommendations:', error));
}

// Admin functions
function checkAdminStatus() {
    debugLog('Checking admin status');
    fetch('/check_admin_status')
    .then(response => response.json())
    .then(data => {
        debugLog('Admin status:', data);
        updateUIForAdminStatus(data.is_admin);
    })
    .catch(error => {
        console.error('Error checking admin status:', error);
    });
}

function deactivateAdminMode() {
    debugLog('Attempting to deactivate admin mode');
    fetch('/deactivate_admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        debugLog('Admin deactivation response:', data);
        if (data.status === 'success') {
            updateUIForAdminStatus(false);
        } else {
            console.error('Deactivation failed:', data.message);
            showNotification('Failed to deactivate admin mode', 'error');
        }
    })
    .catch(error => {
        console.error('Error deactivating admin mode:', error);
        showNotification('Error deactivating admin mode', 'error');
    });
}

// Event Listeners and Initialization
// Event Listeners and Initialization
document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOM fully loaded and parsed');
    
    const searchInput = document.querySelector('input[name="query"]');
    const searchButton = document.querySelector('button[type="submit"]');
    const iconContainer = document.querySelector('.icon-container');
    const tipModal = document.getElementById('tipModal');
    const tipButton = document.getElementById('tipButton');

    initializeDebugMode();
    fetchQueue();
    setInterval(fetchQueue, 5000);
    checkAdminStatus();

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        if (query.length > 2) {
            fetchRecommendations(query);
        } else {
            document.querySelector('.results').innerHTML = '';
        }
    });

    iconContainer.addEventListener('click', () => {
        if (document.querySelector('.header-container').classList.contains('admin-mode')) {
            deactivateAdminMode();
        }
    });

    searchButton.addEventListener('click', (e) => {
        e.preventDefault();
        const query = searchInput.value;
        performSearch(query);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchInput.value;
            performSearch(query);
        }
    });
    // New search functionality
    function performSearch(query) {
        debugLog('Performing search. Query:', query);
        
        // First, check for admin status
        fetch('/check_admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ 'query': query })
        })
        .then(response => response.json())
        .then(data => {
            debugLog('Admin check response:', data);
            updateUIForAdminStatus(data.is_admin);
            
            // Now proceed with the search
            if (query.length > 2) {
                fetchRecommendations(query);
            }
        })
        .catch(error => {
            console.error('Error checking admin status:', error);
            // Proceed with search even if admin check fails
            if (query.length > 2) {
                fetchRecommendations(query);
            }
        });
    }

    searchButton.addEventListener('click', (e) => {
        e.preventDefault();
        const query = searchInput.value;
        performSearch(query);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchInput.value;
            performSearch(query);
        }
    });

    // Tip modal functionality
    if (tipButton && typeof qrCodeAvailable !== 'undefined' && qrCodeAvailable) {
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
});