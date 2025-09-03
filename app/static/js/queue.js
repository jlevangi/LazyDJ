// queue.js
import { showNotification, updateQueueDisplay } from './ui.js';
import { updateUIForAdminStatus } from './ui.js';
import { debugLog } from './util.js';

let userQueue = [];
let radioQueue = [];
let addToQueueTimeout = null;
let lastRequestTime = 0;
let currentRequest = null;
const DEBOUNCE_DELAY = 300; // 300ms debounce time

export function addTrackToQueue(track_uri, trackName, artistName, sessionId = '', sessionToken = null) {
    console.log(`Attempting to add track to queue: ${trackName} by ${artistName}`);

    const currentTime = Date.now();
    if (currentTime - lastRequestTime < DEBOUNCE_DELAY) {
        console.log('Debounce: Ignoring rapid request');
        return;
    }

    lastRequestTime = currentTime;

    if (addToQueueTimeout) {
        clearTimeout(addToQueueTimeout);
    }

    if (currentRequest) {
        currentRequest.abort();
    }

    addToQueueTimeout = setTimeout(() => {
        const url = sessionId ? `/session/${sessionId}/queue` : '/queue';
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
        }

        currentRequest = new AbortController();
        const signal = currentRequest.signal;

        // Get participant ID if we're in a session
        let participantId = null;
        if (sessionId) {
            participantId = localStorage.getItem(`participant_id_${sessionId}`);
            console.log(`Found participant ID for session ${sessionId}:`, participantId);
        }

        const formData = new URLSearchParams({ 
            'track_uri': track_uri, 
            'track_name': trackName, 
            'artist_name': artistName
        });

        if (participantId) {
            formData.append('participant_id', participantId);
            console.log('Adding participant_id to form data:', participantId);
        } else {
            console.log('No participant ID found - adding track without participant info');
        }

        fetch(url, {
            method: 'POST',
            headers: headers,
            body: formData,
            signal: signal
        })
        .then(response => response.json())
        .then(data => {
            console.log('Server response:', data);
            if (data.status === 'success') {
                let message = data.message;
                if (data.playlist_name) {
                    message += ` "${data.playlist_name}"`;
                }
                showNotification(message, 'success');
                fetchQueue(sessionId, sessionToken);
            } else if (data.status === 'error') {
                showNotification(data.message || 'Failed to add track to queue', 'error');
            }
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                console.log('Request was cancelled');
            } else {
                console.error('Error adding track to queue:', error);
                showNotification('Error adding track to queue', 'error');
            }
        })
        .finally(() => {
            currentRequest = null;
        });
    }, DEBOUNCE_DELAY);
}

export function playTrackNow(track_uri, sessionToken = null) {
    console.log('Attempting to play track now:', track_uri);
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return fetch('/play_now', {
        method: 'POST',
        headers: headers,
        body: new URLSearchParams({ 'track_uri': track_uri })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Server response:', data);
        showNotification(data.message || 'Track started playing', data.status === 'success' ? 'success' : 'error');
        if (data.status === 'success') {
            fetchQueue(null, sessionToken);
        }
    })
    .catch(error => {
        console.error('Error playing track now:', error);
        showNotification('Error playing track now: ' + error.message, 'error');
    });
}

export function fetchQueue(sessionId = null, sessionToken = null) {
    console.log('Fetching current queue');
    const url = sessionId ? `/session/${sessionId}/current_queue` : '/current_queue';
    const headers = {};
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return fetch(url, { headers })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log('Queue fetch response:', response);
        return response.json();
    })
    .then(data => {
        console.log('Queue data:', data);
        if (data && typeof data === 'object') {
            userQueue = data.user_queue || [];
            radioQueue = data.radio_queue || [];
            updateQueueDisplay(data);
        } else {
            console.error('Received invalid data from server:', data);
            throw new Error('Invalid data received from server');
        }
        return data;
    })
    .catch(error => {
        console.error('Error fetching queue:', error);
        showNotification('Error fetching queue: ' + error.message, 'error');
    });
}

export function registerParticipant(sessionId) {
    console.log(`Registering participant for session: ${sessionId}`);
    
    // Check if we already have a participant ID for this session
    const existingParticipantId = localStorage.getItem(`participant_id_${sessionId}`);
    if (existingParticipantId) {
        console.log(`Already registered as participant: ${existingParticipantId}`);
        // Don't show notification for returning participants
        return Promise.resolve({
            participant: { id: existingParticipantId },
            participant_count: null
        });
    }

    console.log('Making request to join session endpoint...');
    return fetch(`/session/${sessionId}/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        console.log('Join session response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Join session response data:', data);
        if (data.participant && data.participant.id) {
            // Store participant ID in localStorage for future requests
            localStorage.setItem(`participant_id_${sessionId}`, data.participant.id);
            console.log(`Registered as participant: ${data.participant.id}`);
            // Only show notification for new participants
            showNotification('Joined as ' + data.participant.name + '!', 'success');
        } else {
            console.error('No participant data in response:', data);
        }
        return data;
    })
    .catch(error => {
        console.error('Error registering participant:', error);
        showNotification('Error joining session: ' + error.message, 'error');
        throw error;
    });
}

export function clearQueue(sessionToken = null) {
    if (!confirm('Are you sure you want to clear the queue?')) return;

    const headers = {
        'Content-Type': 'application/json'
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    fetch('/admin_actions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'clear_queue' })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            showNotification('Queue cleared successfully', 'success');
            fetchQueue(null, sessionToken);
        } else {
            showNotification('Failed to clear queue: ' + (data.message || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error clearing queue:', error);
        showNotification('Error clearing queue: ' + error.message, 'error');
    });
}

export function skipTrack(sessionToken = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    fetch('/admin_actions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'skip_track' })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            showNotification('Track skipped', 'success');
            fetchQueue(null, sessionToken);
        } else {
            showNotification('Failed to skip track: ' + (data.message || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error skipping track:', error);
        showNotification('Error skipping track: ' + error.message, 'error');
    });
}