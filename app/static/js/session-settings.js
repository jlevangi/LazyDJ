// session-settings.js

import { showNotification } from './ui.js';

console.log('session-settings.js loaded');

let sessionPlaylistId = null;

export function setupSessionSettingsListeners() {
    console.log('Setting up session settings listeners');
    const sessionSettingsButton = document.getElementById('sessionSettingsButton');
    const sessionSettingsModal = document.getElementById('sessionSettingsModal');
    const closeBtn = document.getElementById('closeSessionSettingsButton');
    const shareSessionButton = document.getElementById('shareSessionButton');
    const createPlaylistButton = document.getElementById('createPlaylistButton');

    console.log('Session Settings Button:', sessionSettingsButton);
    console.log('Session Settings Modal:', sessionSettingsModal);

    // Only add listeners if elements exist
    if (sessionSettingsButton) {
        sessionSettingsButton.addEventListener('click', openSessionSettingsModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSessionSettingsModal);
    }
    if (shareSessionButton) {
        shareSessionButton.addEventListener('click', handleShareSession);
    }
    if (createPlaylistButton) {
        createPlaylistButton.addEventListener('click', handleCreateOrSharePlaylist);
    }

    // Only run these if we're on a page with session settings
    if (sessionSettingsButton && sessionSettingsModal) {
        // Check if a playlist has already been created for this session
        checkExistingPlaylist();
    }

    setupEndSessionButton();

}

function checkExistingPlaylist() {
    // You might want to make an API call here to check if a playlist exists for the current session
    // For now, we'll use localStorage as a simple example
    const playlistId = localStorage.getItem('sessionPlaylistId');
    if (playlistId) {
        sessionPlaylistId = playlistId;
        updateButtonToSharePlaylist();
    }
}

export function openSessionSettingsModal() {
    console.log('Opening session settings modal');
    const modal = document.getElementById('sessionSettingsModal');
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    } else {
        console.error('Modal element not found');
    }
}

function closeSessionSettingsModal() {
    console.log('Closing session settings modal');
    const modal = document.getElementById('sessionSettingsModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

function handleShareSession() {
    const currentUrl = window.location.href;
    generateQRCode('sessionQRCode', currentUrl);
    document.getElementById('sessionLinkContainer').style.display = 'flex';
    document.getElementById('playlistLinkContainer').style.display = 'none';
    document.querySelector('#sessionLinkContainer .qr-code-label').textContent = 'Scan to share session';
}

function handleCreateOrSharePlaylist() {
    if (sessionPlaylistId) {
        handleSharePlaylist();
    } else {
        createPlaylist();
    }
}

function createPlaylist() {
    console.log('Sending create playlist request');
    fetch('/create_session_playlist', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => response.json())
    .then(data => {
        console.log('Create playlist response data:', data);
        if (data.status === 'success') {
            sessionPlaylistId = data.playlist_id;
            // Save the playlist ID (you might want to use a more permanent storage solution)
            localStorage.setItem('sessionPlaylistId', sessionPlaylistId);
            showNotification(`Playlist "${data.playlist_name}" created successfully!`, 'success');
            updateButtonToSharePlaylist();
            handleSharePlaylist();
        } else {
            showNotification(`Failed to create playlist: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error creating playlist:', error);
        showNotification('Error creating playlist: ' + error.message, 'error');
    });
}

function updateButtonToSharePlaylist() {
    const createPlaylistButton = document.getElementById('createPlaylistButton');
    createPlaylistButton.textContent = 'Share Playlist';
}

function handleSharePlaylist() {
    if (!sessionPlaylistId) {
        showNotification('No playlist created yet', 'error');
        return;
    }

    const playlistUrl = `https://open.spotify.com/playlist/${sessionPlaylistId}`;
    generateQRCode('playlistQRCode', playlistUrl);
    document.getElementById('sessionLinkContainer').style.display = 'none';
    document.getElementById('playlistLinkContainer').style.display = 'flex';
    document.querySelector('#playlistLinkContainer .qr-code-label').textContent = 'Scan to share playlist';
}

function generateQRCode(elementId, data) {
    const element = document.getElementById(elementId);
    element.innerHTML = ''; // Clear previous QR code
    new QRCode(element, {
        text: data,
        width: 256,
        height: 256,
    });
}

export function copySessionLink() {
    copyToClipboard(window.location.href);
}

export function copyPlaylistLink() {
    if (sessionPlaylistId) {
        copyToClipboard(`https://open.spotify.com/playlist/${sessionPlaylistId}`);
    } else {
        showNotification('No playlist created yet', 'error');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification("Link copied to clipboard!", 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showNotification("Failed to copy link", "error");
    });
}

function setupEndSessionButton() {
    const endSessionButton = document.getElementById('endSessionButton');
    if (endSessionButton) {
        endSessionButton.addEventListener('click', handleEndSession);
    }
}

function handleEndSession() {
    if (confirm('Are you sure you want to end this session?')) {
        fetch('/end_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                window.location.href = '/search';
            } else {
                showNotification('Failed to end session: ' + data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error ending session:', error);
            showNotification('Error ending session', 'error');
        });
    }
}

document.addEventListener('DOMContentLoaded', setupSessionSettingsListeners);