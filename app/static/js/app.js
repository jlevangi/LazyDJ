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

    fetch('/check_admin_status')
    .then(response => response.json())
    .then(data => {
        debugLog('Admin check response:', data);
        updateUIForAdminStatus(data.is_admin);
        
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

function updateNowPlayingBar(currentTrack) {
    const currentTrackInfo = document.getElementById('current-track-info');
    if (currentTrackInfo) {
        if (currentTrack) {
            currentTrackInfo.innerHTML = `<strong>Now playing:</strong><br>${currentTrack.name} - ${currentTrack.artists}`;
        } else {
            currentTrackInfo.innerHTML = '<strong>Now playing:</strong><br>No track playing';
        }
    }
}

function updateQueueList(container) {
    if (userQueue.length > 0) {
        container.innerHTML += '<h3>In Queue</h3>';
        userQueue.forEach(track => {
            container.innerHTML += `
                <div class="queue-item">
                    ${track.name} by ${track.artists}
                </div>`;
        });
    }

    if (radioQueue.length > 0) {
        container.innerHTML += '<h3>Up Next</h3>';
        radioQueue.slice(0, 5).forEach(track => {
            container.innerHTML += `
                <div class="queue-item">
                    ${track.name} by ${track.artists}
                </div>`;
        });

        if (radioQueue.length > 5) {
            container.innerHTML += `
                <div class="queue-item more-tracks">
                    + ${radioQueue.length - 5} more tracks
                </div>`;
        }
    }

    if (userQueue.length === 0 && radioQueue.length === 0) {
        container.innerHTML += '<p>No tracks in queue</p>';
    }
}

function updateQueueDisplay(currentTrack) {
    debugLog('Updating queue display');
    
    if (isMobile()) {
        updateNowPlayingBar(currentTrack);
        const queueList = document.querySelector('.queue-list');
        if (queueList) {
            queueList.innerHTML = ''; // Clear existing content
            updateQueueList(queueList);
        }
    } else {
        const queueContainer = document.querySelector('.queue-container');
        queueContainer.innerHTML = `<h2>Now Playing</h2>`;
        if (currentTrack) {
            queueContainer.innerHTML += `
                <div class="queue-item current-track">
                    ${currentTrack.name} by ${currentTrack.artists}
                </div>`;
        }
        updateQueueList(queueContainer);
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
        data.slice(0, 8).forEach(track => {
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

// Mobile detection
function isMobile() {
    return window.innerWidth <= 767;
}

// Event Listeners and Initialization
document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOM fully loaded and parsed');
    
    const searchInput = document.querySelector('input[name="query"]');
    const searchButton = document.querySelector('button[type="submit"]');
    const iconContainer = document.querySelector('.icon-container');
    const tipModal = document.getElementById('tipModal');
    const tipButton = document.getElementById('tipButton');
    const queueContainer = document.querySelector('.queue-container');
    const clearButton = document.querySelector('.clear-button');

    initializeDebugMode();
    fetchQueue();
    setInterval(fetchQueue, 5000);
    checkAdminStatus();

    // Function to create and insert Now Playing bar
    function createNowPlayingBar() {
        if (isMobile() && !document.querySelector('.now-playing-bar')) {
            const queueContainer = document.querySelector('.queue-container');
            queueContainer.innerHTML = ''; // Clear existing content
            const nowPlayingBar = document.createElement('div');
            nowPlayingBar.className = 'now-playing-bar';
            nowPlayingBar.innerHTML = `
                <div class="now-playing-info">
                    <span id="current-track-info"><strong>Now playing:</strong><br>No track playing</span>
                </div>
                <div class="expand-button">▲</div>
            `;
            queueContainer.appendChild(nowPlayingBar);

            const queueList = document.createElement('div');
            queueList.className = 'queue-list';
            queueContainer.appendChild(queueList);

            nowPlayingBar.addEventListener('click', () => {
                queueContainer.classList.toggle('expanded');
            });
        }
    }

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        document.querySelector('.results').innerHTML = '';
        debugLog('Search input cleared');
    });

    // Function to remove Now Playing bar
    function removeNowPlayingBar() {
        const nowPlayingBar = document.querySelector('.now-playing-bar');
        const queueList = document.querySelector('.queue-list');
        if (nowPlayingBar) {
            nowPlayingBar.remove();
        }
        if (queueList) {
            queueList.remove();
        }
        queueContainer.classList.remove('expanded');
    }

    // Initial setup
    if (isMobile()) {
        createNowPlayingBar();
    }

    // Handle resize events
    window.addEventListener('resize', () => {
        if (isMobile()) {
            createNowPlayingBar();
        } else {
            removeNowPlayingBar();
        }
    });

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

    function performSearch(query) {
        debugLog('Performing search. Query:', query);
        
        fetch('/check_admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ 'query': query })
        })
        .then(response => response.json())
        .then(data => {
            debugLog('Admin check response:', data);
            updateUIForAdminStatus(data.is_admin);
            
            if (query.length > 2) {
                fetchRecommendations(query);
            }
        })
        .catch(error => {
            console.error('Error checking admin status:', error);
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

// Additional utility functions

function escapeHtml(unsafe) {
return unsafe
     .replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;")
     .replace(/'/g, "&#039;");
}

// Admin-specific functions
function clearQueue() {
if (!confirm('Are you sure you want to clear the queue?')) return;

fetch('/admin_actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear_queue' })
})
.then(response => response.json())
.then(data => {
    if (data.status === 'success') {
        showNotification('Queue cleared successfully', 'success');
        fetchQueue();
    } else {
        showNotification('Failed to clear queue', 'error');
    }
})
.catch(error => {
    console.error('Error clearing queue:', error);
    showNotification('Error clearing queue', 'error');
});
}

function skipTrack() {
fetch('/admin_actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'skip_track' })
})
.then(response => response.json())
.then(data => {
    if (data.status === 'success') {
        showNotification('Track skipped', 'success');
        fetchQueue();
    } else {
        showNotification('Failed to skip track', 'error');
    }
})
.catch(error => {
    console.error('Error skipping track:', error);
    showNotification('Error skipping track', 'error');
});
}

// Function to update admin controls
function updateAdminControls() {
const adminControlsContainer = document.querySelector('.admin-controls');
if (!adminControlsContainer) return;

if (document.querySelector('.header-container').classList.contains('admin-mode')) {
    adminControlsContainer.innerHTML = `
        <button onclick="clearQueue()">Clear Queue</button>
        <button onclick="skipTrack()">Skip Track</button>
    `;
    adminControlsContainer.style.display = 'block';
} else {
    adminControlsContainer.style.display = 'none';
}
}

// Update the updateUIForAdminStatus function
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

updateAdminControls();
}

// Call updateAdminControls when the page loads
document.addEventListener('DOMContentLoaded', () => {
// ... (previous code remains the same)

updateAdminControls();

// ... (rest of the code remains the same)
});