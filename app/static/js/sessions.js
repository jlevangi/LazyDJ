// sessions.js
import { showNotification } from './ui.js';
import { debugLog } from './util.js';

export function createNewSession() {
    debugLog('Creating new session');
    return fetch('/create_session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.session_id && data.redirect_url) {
            showNotification(`New session created! Redirecting...`, 'success');
            window.location.href = data.redirect_url;
        } else {
            throw new Error('Invalid response from server');
        }
    })
    .catch(error => {
        console.error('Error creating new session:', error);
        showNotification('Error creating new session: ' + error.message, 'error');
    });
}

export function joinSession(sessionId) {
    debugLog(`Joining session: ${sessionId}`);
    // Implement the logic to join a session
    // This might involve updating the UI and setting up a WebSocket connection
}

export function addTrackToSession(sessionId, trackUri, trackName, artistName) {
    debugLog(`Adding track to session ${sessionId}: ${trackName} by ${artistName}`);
    return fetch(`/session/${sessionId}/queue`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ track_uri: trackUri, track_name: trackName, artist_name: artistName }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showNotification('Track added to session queue', 'success');
        } else {
            throw new Error(data.message || 'Failed to add track to session');
        }
    })
    .catch(error => {
        console.error('Error adding track to session:', error);
        showNotification('Error adding track to session queue', 'error');
    });
}