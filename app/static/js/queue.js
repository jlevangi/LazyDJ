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

export function addTrackToQueue(track_uri, trackName, artistName) {
    console.log(`Attempting to add track to queue: ${trackName} by ${artistName}`);

    const currentTime = Date.now();
    if (currentTime - lastRequestTime < DEBOUNCE_DELAY) {
        console.log('Debounce: Ignoring rapid request');
        return;
    }

    lastRequestTime = currentTime;

    // Clear any existing timeout
    if (addToQueueTimeout) {
        clearTimeout(addToQueueTimeout);
    }

    // Cancel any ongoing request
    if (currentRequest) {
        currentRequest.abort();
    }

    // Set a new timeout
    addToQueueTimeout = setTimeout(() => {
        fetch('/check_admin_status')
        .then(response => response.json())
        .then(data => {
            console.log('Admin check response:', data);
            updateUIForAdminStatus(data.is_admin);
            
            currentRequest = new AbortController();
            const signal = currentRequest.signal;

            return fetch('/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ 
                    'track_uri': track_uri, 
                    'track_name': trackName, 
                    'artist_name': artistName,
                    'is_admin': data.is_admin
                }),
                signal: signal
            });
        })
        .then(response => response.json())
        .then(data => {
            console.log('Server response:', data);
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

export function playTrackNow(track_uri) {
    console.log('Attempting to play track now:', track_uri);
    return fetch('/play_now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
        showNotification(data.message, data.type || 'success');
        if (data.status === 'success') {
            fetchQueue();
        }
    })
    .catch(error => {
        console.error('Error playing track now:', error);
        showNotification('Error playing track now: ' + error.message, 'error');
    });
}

export function fetchQueue() {
    console.log('Fetching current queue');
    return fetch('/current_queue')
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

export function clearQueue() {
    if (!confirm('Are you sure you want to clear the queue?')) return;

    fetch('/admin_actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            fetchQueue();
        } else {
            showNotification('Failed to clear queue: ' + (data.message || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error clearing queue:', error);
        showNotification('Error clearing queue: ' + error.message, 'error');
    });
}

export function skipTrack() {
    fetch('/admin_actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            fetchQueue();
        } else {
            showNotification('Failed to skip track: ' + (data.message || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error skipping track:', error);
        showNotification('Error skipping track: ' + error.message, 'error');
    });
}