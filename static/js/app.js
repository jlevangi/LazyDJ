if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/service-worker.js')
        .then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(error => {
            console.log('ServiceWorker registration failed: ', error);
        });
}

let isAdmin = false;

function addTrackToQueue(track_uri) {
    console.log('Adding track to queue. Admin mode:', isAdmin);  // Debug log
    fetch('/queue', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'track_uri': track_uri,
            'is_admin': isAdmin
        })
    })
    .then(response => response.json())
    .then(data => {
        showNotification(data.message, data.status);
        if (data.status === 'success') {
            fetchQueue();
            setTimeout(() => {
                window.location.href = "/search";
            }, 2000);
        }
    })
    .catch(error => {
        console.error('Error adding track to queue:', error);
        showNotification('Error adding track to queue', 'error');
    });
}

function showNotification(message, status) {
    const notification = document.getElementById('notification');
    notification.innerText = message;
    notification.style.backgroundColor = status === 'success' ? '#1DB954' : (status === 'error' ? '#E74C3C' : '#3498DB'); // Adding a default color for 'info' status
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 2000);
}

function fetchQueue() {
    fetch('/current_queue')
    .then(response => response.json())
    .then(data => {
        const queueContainer = document.getElementById('queue');
        queueContainer.innerHTML = '';

        if (data.current_track) {
            const currentTrackElement = document.createElement('div');
            currentTrackElement.className = 'queue-item current-track';
            currentTrackElement.innerText = `${data.current_track.name} by ${data.current_track.artists}`;
            queueContainer.appendChild(currentTrackElement);
        }

        if (data.user_queue.length > 0) {
            const userQueueLabel = document.createElement('h3');
            userQueueLabel.innerText = 'In Queue';
            queueContainer.appendChild(userQueueLabel);

            data.user_queue.forEach(track => {
                const trackElement = document.createElement('div');
                trackElement.className = 'queue-item';
                trackElement.innerText = `${track.name} by ${track.artists}`;
                queueContainer.appendChild(trackElement);
            });
        }

        if (data.radio_queue.length > 0) {
            const separator = document.createElement('hr');
            separator.className = 'separator';
            queueContainer.appendChild(separator);

            const nowPlayingLabel = document.createElement('h3');
            nowPlayingLabel.innerText = 'Up Next';
            queueContainer.appendChild(nowPlayingLabel);

            data.radio_queue.slice(0, 6).forEach(track => {
                const trackElement = document.createElement('div');
                trackElement.className = 'queue-item';
                trackElement.innerText = `${track.name} by ${track.artists}`;
                queueContainer.appendChild(trackElement);
            });

            if (data.radio_queue.length > 6) {
                const moreTracksElement = document.createElement('div');
                moreTracksElement.className = 'queue-item more-tracks';
                moreTracksElement.innerText = `+ ${data.radio_queue.length - 6} more tracks`;
                queueContainer.appendChild(moreTracksElement);
            }
        }
    });
}

function truncateText(text, maxLength) {
    if (text.length > maxLength) {
        return text.substring(0, maxLength - 3) + '...';
    }
    return text;
}

function fetchRecommendations(query) {
    fetch(`/recommendations?query=${query}`)
    .then(response => response.json())
    .then(data => {
        const resultsContainer = document.querySelector('.results');
        resultsContainer.innerHTML = '';
        data.forEach(track => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            if (track.album_art) {
                const img = document.createElement('img');
                img.src = track.album_art;
                img.alt = `${track.name} album art`;
                img.className = 'album-art';
                resultItem.appendChild(img);
            }
            const trackInfo = document.createElement('div');
            trackInfo.className = 'track-info';
            
            const trackName = document.createElement('p');
            trackName.className = 'track-name';
            trackName.innerText = truncateText(track.name, 40);
            trackName.title = track.name;
            
            const trackArtist = document.createElement('p');
            trackArtist.className = 'track-artist';
            trackArtist.innerText = truncateText(track.artists, 40);
            trackArtist.title = track.artists;
            
            trackInfo.appendChild(trackName);
            trackInfo.appendChild(trackArtist);
            resultItem.appendChild(trackInfo);
            
            const button = document.createElement('button');
            button.innerText = 'Add to Queue';
            button.onclick = () => addTrackToQueue(track.uri);
            resultItem.appendChild(button);
            resultsContainer.appendChild(resultItem);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchQueue();
    setInterval(fetchQueue, 5000);

    const searchInput = document.querySelector('input[name="query"]');
    const searchButton = document.querySelector('button[type="submit"]'); // Updated selector to match your form
    const header = document.querySelector('.header-container'); // For changing header color

    // Event listener for typing in the search input
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        if (query.length > 2) {
            fetchRecommendations(query);
        }
    });

    // Event listener for the search button click
    searchButton.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission
        const query = searchInput.value;
        if (query === ADMIN_KEYWORD) {
            isAdmin = true;
            showNotification('Admin mode activated', 'success');
            console.log('Admin mode activated');  // Debug log
            header.classList.add('admin-mode'); // Change header color for admin mode
        } else {
            if (isAdmin) {
                // console.log('Admin mode deactivated');  // Debug log
            }
            isAdmin = false;
            //showNotification('Admin mode deactivated', 'info');
            header.classList.remove('admin-mode'); // Reset header color
        }
        if (query.length > 2) {
            fetchRecommendations(query);
        }
    });

    const modal = document.getElementById('tipModal');
    const btn = document.getElementById('tipButton');
    
    if (btn && qrCodeAvailable) {
        btn.style.display = 'inline-block';
        const span = document.getElementsByClassName('close')[0];

        btn.onclick = function() {
            modal.style.display = 'block';
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
        }

        span.onclick = function() {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }

        window.onclick = function(event) {
            if (event.target == modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 300);
            }
        }
    } else if (btn) {
        btn.style.display = 'none';
    }
});