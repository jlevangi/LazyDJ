// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/service-worker.js')
        .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
        .catch(error => console.error('ServiceWorker registration failed: ', error));
}

function showNotification(message, type) {
    console.log('showNotification called with message:', message, 'and type:', type);
    const notification = document.getElementById('notification');
    if (!notification) {
        console.error('Notification element not found in the DOM');
        return;
    }
    notification.textContent = message;
    notification.className = type === 'error' ? 'error' : '';
    notification.style.display = 'block';
    
    // Force a reflow before adding the 'show' class
    notification.offsetHeight;
    
    notification.classList.add('show');
    console.log('Notification displayed:', message);
    
    setTimeout(() => {
        notification.classList.remove('show');
        console.log('Notification hidden after timeout');
        
        // Hide the notification after the fade-out transition
        setTimeout(() => {
            notification.style.display = 'none';
        }, 500); // Match this to your CSS transition time
    }, 3000);
}

function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

// UI Update Functions
function updateUIForAdminStatus(isAdmin) {
    const header = document.querySelector('.header-container');
    if (isAdmin) {
        header.classList.add('admin-mode');
        console.log('Admin mode UI activated');
        showNotification('Admin mode activated', 'success');
    } else {
        header.classList.remove('admin-mode');
        console.log('Admin mode UI deactivated');
        // Removed notification for admin mode deactivation
    }
}

// API Interaction Functions
function addTrackToQueue(track_uri) {
    console.log('Attempting to add track to queue:', track_uri);
    fetch('/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'track_uri': track_uri })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Server response:', data);
        if (data.status === 'success') {
            showNotification(data.message || 'Track added to queue', 'success');
            fetchQueue();
            if (data.admin_deactivated) {
                updateUIForAdminStatus(false);
            }
        } else {
            showNotification(data.message || 'Failed to add track to queue', 'error');
        }
    })
    .catch(error => {
        console.error('Error adding track to queue:', error);
        showNotification('Error adding track to queue', 'error');
    });
}

function fetchQueue() {
    console.log('Fetching current queue');
    fetch('/current_queue')
    .then(response => response.json())
    .then(data => {
        console.log('Current queue data:', data);
        const queueContainer = document.getElementById('queue');
        queueContainer.innerHTML = '';

        if (data.current_track) {
            queueContainer.innerHTML += `
                <div class="queue-item current-track">
                    ${data.current_track.name} by ${data.current_track.artists}
                </div>`;
        }

        if (data.user_queue.length > 0) {
            queueContainer.innerHTML += '<h3>In Queue</h3>';
            data.user_queue.forEach(track => {
                queueContainer.innerHTML += `
                    <div class="queue-item">
                        ${track.name} by ${track.artists}
                    </div>`;
            });
        }

        if (data.radio_queue.length > 0) {
            queueContainer.innerHTML += '<hr class="separator"><h3>Up Next</h3>';
            data.radio_queue.slice(0, 6).forEach(track => {
                queueContainer.innerHTML += `
                    <div class="queue-item">
                        ${track.name} by ${track.artists}
                    </div>`;
            });

            if (data.radio_queue.length > 6) {
                queueContainer.innerHTML += `
                    <div class="queue-item more-tracks">
                        + ${data.radio_queue.length - 6} more tracks
                    </div>`;
            }
        }
    })
    .catch(error => console.error('Error fetching queue:', error));
}

function fetchRecommendations(query) {
    console.log('Fetching recommendations for query:', query);
    fetch(`/recommendations?query=${encodeURIComponent(query)}`)
    .then(response => response.json())
    .then(data => {
        console.log('Recommendations data:', data);
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
                    <button onclick="addTrackToQueue('${track.uri}')">Add to Queue</button>
                </div>`;
        });
    })
    .catch(error => console.error('Error fetching recommendations:', error));
}

function checkAdminStatus() {
    console.log('Checking admin status');
    fetch('/check_admin_status')
    .then(response => response.json())
    .then(data => {
        console.log('Admin status:', data);
        updateUIForAdminStatus(data.is_admin);
    })
    .catch(error => console.error('Error checking admin status:', error));
}

function deactivateAdminMode() {
    console.log('Attempting to deactivate admin mode');
    fetch('/deactivate_admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log('Admin deactivation response:', data);
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
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    
    const searchInput = document.querySelector('input[name="query"]');
    const searchButton = document.querySelector('button[type="submit"]');
    const iconContainer = document.querySelector('.icon-container');
    const tipModal = document.getElementById('tipModal');
    const tipButton = document.getElementById('tipButton');

    fetchQueue();
    setInterval(fetchQueue, 5000);
    checkAdminStatus();

    // Search input handler
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        if (query.length > 2) {
            fetchRecommendations(query);
        } else {
            document.querySelector('.results').innerHTML = '';
        }
    });

    // Icon click handler for admin mode deactivation
    iconContainer.addEventListener('click', () => {
        if (document.querySelector('.header-container').classList.contains('admin-mode')) {
            deactivateAdminMode();
        }
    });

    // Search button click handler
    searchButton.addEventListener('click', (e) => {
        e.preventDefault();
        const query = searchInput.value;
        console.log('Search button clicked. Query:', query);
        fetch('/check_admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ 'query': query })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Admin check response:', data);
            updateUIForAdminStatus(data.is_admin);
            if (query.length > 2) {
                fetchRecommendations(query);
            }
        })
        .catch(error => console.error('Error checking admin status:', error));
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