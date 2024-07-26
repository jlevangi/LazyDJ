// ui.js
import { isMobile, escapeHtml, debugLog } from './util.js';

export function showNotification(message, type) {
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

export function updateUIForAdminStatus(isAdmin) {
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

export function createNowPlayingBar() {
    if (isMobile()) {
        const existingBar = document.querySelector('.now-playing-bar');
        if (existingBar) {
            existingBar.remove();
        }

        const queueContainer = document.querySelector('.queue-container');
        if (!queueContainer) return;

        const nowPlayingBar = document.createElement('div');
        nowPlayingBar.className = 'now-playing-bar';
        nowPlayingBar.innerHTML = `
            <div class="now-playing-info">
                <span id="current-track-info">No track playing</span>
            </div>
            <div class="expand-button">▲</div>
        `;
        queueContainer.prepend(nowPlayingBar);

        nowPlayingBar.addEventListener('click', () => {
            queueContainer.classList.toggle('expanded');
        });
    }
}


export function removeNowPlayingBar() {
    const nowPlayingBar = document.querySelector('.now-playing-bar');
    const queueList = document.querySelector('.queue-list');
    const queueContainer = document.querySelector('.queue-container');
    
    if (nowPlayingBar) {
        nowPlayingBar.remove();
    }
    if (queueList) {
        queueList.remove();
    }
    if (queueContainer) {
        queueContainer.classList.remove('expanded');
    }
}

export function updateQueueDisplay(data) {
    console.log('Updating queue display with data:', data);
    const queueContainer = document.querySelector('.queue-container');
    if (!queueContainer) {
        console.error('Queue container not found');
        return;
    }

    queueContainer.innerHTML = '<h2>Now Playing</h2>';
    
    if (data && data.current_track) {
        queueContainer.innerHTML += `
            <div class="queue-item current-track">
                ${escapeHtml(data.current_track.name)} by ${escapeHtml(data.current_track.artists)}
            </div>`;
    } else {
        queueContainer.innerHTML += '<div class="queue-item">No track currently playing</div>';
    }

    if (data && data.user_queue && data.user_queue.length > 0) {
        queueContainer.innerHTML += '<h3>User Queue</h3>';
        data.user_queue.forEach(track => {
            queueContainer.innerHTML += `
                <div class="queue-item">
                    ${escapeHtml(track.name)} by ${escapeHtml(track.artists)}
                </div>`;
        });
    }

    if (data && data.radio_queue && data.radio_queue.length > 0) {
        queueContainer.innerHTML += '<h3>Radio Queue</h3>';
        data.radio_queue.slice(0, 5).forEach(track => {
            queueContainer.innerHTML += `
                <div class="queue-item">
                    ${escapeHtml(track.name)} by ${escapeHtml(track.artists)}
                </div>`;
        });

        if (data.radio_queue.length > 5) {
            queueContainer.innerHTML += `
                <div class="queue-item more-tracks">
                    + ${data.radio_queue.length - 5} more tracks
                </div>`;
        }
    }

    if ((!data || !data.user_queue || data.user_queue.length === 0) && 
        (!data || !data.radio_queue || data.radio_queue.length === 0)) {
        queueContainer.innerHTML += '<p>No tracks in queue</p>';
    }
}

export function updateNowPlayingBar(currentTrack) {
    const currentTrackInfo = document.getElementById('current-track-info');
    const expandButton = document.querySelector('.expand-button');
    
    if (currentTrackInfo) {
        if (currentTrack && currentTrack.name && currentTrack.artists) {
            currentTrackInfo.textContent = `${currentTrack.name} - ${currentTrack.artists}`;
        } else {
            currentTrackInfo.textContent = 'No track playing';
        }
    }

    if (expandButton) {
        expandButton.style.display = 'block';
    }
}