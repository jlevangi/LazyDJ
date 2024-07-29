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
            <div class="now-playing-section">
                <h2>Now Playing</h2>
                <div class="current-track-info">No track playing</div>
            </div>
            <div class="expand-button"></div>
        `;
        queueContainer.prepend(nowPlayingBar);

        // Add click event listener to the entire now playing bar
        nowPlayingBar.addEventListener('click', toggleQueueExpand);

        // Set initial arrow direction
        updateExpandButtonArrow(queueContainer);
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

    // Preserve the now playing bar if it exists
    const nowPlayingBar = queueContainer.querySelector('.now-playing-bar');
    
    // Store the expanded state before clearing the container
    const wasExpanded = queueContainer.classList.contains('expanded');
    
    // Clear the queue container, but keep the now playing bar if it exists
    queueContainer.innerHTML = nowPlayingBar ? nowPlayingBar.outerHTML : '';
    
    // Restore the expanded state
    if (wasExpanded) {
        queueContainer.classList.add('expanded');
    }
    
    // Update the current track info
    const currentTrackInfo = queueContainer.querySelector('.current-track-info');
    if (currentTrackInfo) {
        if (data && data.current_track) {
            currentTrackInfo.textContent = `${data.current_track.name} by ${data.current_track.artists}`;
        } else {
            currentTrackInfo.textContent = 'No track playing';
        }
    }
    
    // Add the rest of the queue
    const queueContent = document.createElement('div');
    queueContent.className = 'queue-content';
    
    if (data && data.user_queue && data.user_queue.length > 0) {
        queueContent.innerHTML += '<h3>User Queue</h3>';
        data.user_queue.forEach(track => {
            queueContent.innerHTML += `
                <div class="queue-item">
                    ${escapeHtml(track.name)} by ${escapeHtml(track.artists)}
                </div>`;
        });
    }

    if (data && data.radio_queue && data.radio_queue.length > 0) {
        queueContent.innerHTML += '<h3>Radio Queue</h3>';
        data.radio_queue.slice(0, 5).forEach(track => {
            queueContent.innerHTML += `
                <div class="queue-item">
                    ${escapeHtml(track.name)} by ${escapeHtml(track.artists)}
                </div>`;
        });

        if (data.radio_queue.length > 5) {
            queueContent.innerHTML += `
                <div class="queue-item more-tracks">
                    + ${data.radio_queue.length - 5} more tracks
                </div>`;
        }
    }

    if ((!data || !data.user_queue || data.user_queue.length === 0) && 
        (!data || !data.radio_queue || data.radio_queue.length === 0)) {
        queueContent.innerHTML += '<p>No tracks in queue</p>';
    }

    queueContainer.appendChild(queueContent);

    // Re-attach click event listener to the now playing bar
    const updatedNowPlayingBar = queueContainer.querySelector('.now-playing-bar');
    if (updatedNowPlayingBar) {
        updatedNowPlayingBar.addEventListener('click', toggleQueueExpand);
    }

    // Update the expand button arrow
    updateExpandButtonArrow(queueContainer);
}

export function updateNowPlayingBar(currentTrack) {
    const nowPlayingBar = document.querySelector('.now-playing-bar');
    if (!nowPlayingBar) {
        // If the now playing bar doesn't exist, create it
        createNowPlayingBar();
        return updateNowPlayingBar(currentTrack); // Recursive call to update the newly created bar
    }

    const currentTrackInfo = nowPlayingBar.querySelector('.current-track-info');
    
    if (currentTrackInfo) {
        if (currentTrack && currentTrack.name && currentTrack.artists) {
            currentTrackInfo.textContent = `${currentTrack.name} - ${currentTrack.artists}`;
        } else {
            currentTrackInfo.textContent = 'No track playing';
        }
    }

    // Ensure the now playing bar is visible
    const queueContainer = document.querySelector('.queue-container');
    if (queueContainer) {
        queueContainer.style.display = 'block';
        updateExpandButtonArrow(queueContainer);
    }
}

function toggleQueueExpand() {
    const queueContainer = document.querySelector('.queue-container');
    
    if (queueContainer) {
        queueContainer.classList.toggle('expanded');
        updateExpandButtonArrow(queueContainer);
    }
}

function updateExpandButtonArrow(queueContainer) {
    const expandButton = queueContainer.querySelector('.expand-button');
    if (expandButton) {
        if (queueContainer.classList.contains('expanded')) {
            expandButton.classList.add('expanded');
        } else {
            expandButton.classList.remove('expanded');
        }
    }
}