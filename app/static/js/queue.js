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
        // Show existing participant info
        const existingParticipantInfo = localStorage.getItem(`participant_info_${sessionId}`);
        if (existingParticipantInfo) {
            try {
                const participantData = JSON.parse(existingParticipantInfo);
                displayUserParticipantInfo(participantData);
            } catch (e) {
                console.error('Error parsing participant info:', e);
            }
        }
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
            // Store participant info for displaying their icon
            localStorage.setItem(`participant_info_${sessionId}`, JSON.stringify(data.participant));
            console.log(`Registered as participant: ${data.participant.id}`);
            // Only show notification for new participants
            showNotification('Joined as ' + data.participant.name + '!', 'success');
            // Show user their participant icon in the UI
            displayUserParticipantInfo(data.participant);
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

function displayUserParticipantInfo(participant) {
    console.log('Displaying participant info:', participant);
    
    // Find or create the participant info container
    let participantContainer = document.getElementById('user-participant-info');
    if (!participantContainer) {
        participantContainer = document.createElement('div');
        participantContainer.id = 'user-participant-info';
        participantContainer.className = 'user-participant-info';
        
        // Insert after the header
        const header = document.querySelector('.header-container');
        if (header) {
            header.parentNode.insertBefore(participantContainer, header.nextSibling);
        }
    }
    
    // Display the participant info
    participantContainer.innerHTML = `
        <div class="participant-badge clickable" onclick="editParticipantName()">
            <span class="participant-icon" style="background-color: ${participant.color}">${participant.icon}</span>
            <span class="participant-text">You are <strong>${participant.name}</strong></span>
            <span class="edit-hint">Click to edit</span>
        </div>
    `;
    
    // Store current participant data for editing
    window.currentParticipantData = participant;
}

// Global function for editing participant name
window.editParticipantName = function() {
    const currentData = window.currentParticipantData;
    if (!currentData) return;
    
    // Simple prompt for now (we can make this fancier later)
    const newName = prompt('Enter your name:', currentData.name.replace('Guest ', ''));
    
    if (newName && newName.trim() !== '' && newName.trim() !== currentData.name) {
        updateParticipantName(newName.trim());
    }
};

function updateParticipantName(newName) {
    const currentData = window.currentParticipantData;
    if (!currentData) return;
    
    console.log('Updating participant name to:', newName);
    
    // Extract session ID from URL
    const pathParts = window.location.pathname.split('/');
    const sessionId = pathParts[1];
    
    // Update participant name on backend
    fetch(`/session/${sessionId}/update_participant`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            participant_id: currentData.id,
            name: newName
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Name update response:', data);
        if (data.participant) {
            // Update localStorage with new participant data
            localStorage.setItem(`participant_info_${sessionId}`, JSON.stringify(data.participant));
            
            // Update the displayed participant info
            displayUserParticipantInfo(data.participant);
            
            // Update global reference
            window.currentParticipantData = data.participant;
            
            showNotification(`Name updated to ${newName}!`, 'success');
        }
    })
    .catch(error => {
        console.error('Error updating participant name:', error);
        showNotification('Error updating name', 'error');
    });
}