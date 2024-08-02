// session-settings.js

console.log('session-settings.js loaded');

let sessionPlaylistId = null;

export function setupSessionSettingsListeners() {
    console.log('Setting up session settings listeners');
    const sessionSettingsButton = document.getElementById('sessionSettingsButton');
    const sessionSettingsModal = document.getElementById('sessionSettingsModal');
    const closeBtn = sessionSettingsModal.querySelector('.close');
    const shareSessionButton = document.getElementById('shareSessionButton');
    const createPlaylistButton = document.getElementById('createPlaylistButton');
    const sharePlaylistButton = document.getElementById('sharePlaylistButton');

    console.log('Session Settings Button:', sessionSettingsButton);
    console.log('Session Settings Modal:', sessionSettingsModal);

    sessionSettingsButton.addEventListener('click', openSessionSettingsModal);
    closeBtn.addEventListener('click', closeSessionSettingsModal);
    shareSessionButton.addEventListener('click', handleShareSession);
    createPlaylistButton.addEventListener('click', handleCreatePlaylist);
    sharePlaylistButton.addEventListener('click', handleSharePlaylist);

    window.addEventListener('click', (event) => {
        if (event.target == sessionSettingsModal) {
            closeSessionSettingsModal();
        }
    });
}

export function openSessionSettingsModal() {
    console.log('Opening session settings modal');
    const modal = document.getElementById('sessionSettingsModal');
    console.log('Session Settings Modal (in open function):', modal);
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        console.log('Modal classes:', modal.className);
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
        }, 300); // Match this to your CSS transition time
    }
}

function handleShareSession() {
    const sessionLinkElement = document.getElementById('sessionLink');
    const currentUrl = window.location.href;
    sessionLinkElement.value = currentUrl;

    generateQRCode('sessionQRCode', currentUrl);

    document.getElementById('sessionLinkContainer').style.display = 'block';
    document.getElementById('playlistLinkContainer').style.display = 'none';
}

function handleCreatePlaylist() {
    console.log('Sending create playlist request');
    fetch('/create_session_playlist', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        console.log('Create playlist response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Create playlist response data:', data);
        if (data.status === 'success') {
            sessionPlaylistId = data.playlist_id;
            showNotification(`Playlist "${data.playlist_name}" created successfully!`, 'success');
            document.getElementById('sharePlaylistButton').disabled = false;
        } else {
            showNotification(`Failed to create playlist: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error creating playlist:', error);
        showNotification('Error creating playlist: ' + error.message, 'error');
    });
}

function handleSharePlaylist() {
    if (!sessionPlaylistId) {
        showNotification('No playlist created yet', 'error');
        return;
    }

    const playlistLinkElement = document.getElementById('playlistLink');
    const playlistUrl = `https://open.spotify.com/playlist/${sessionPlaylistId}`;
    playlistLinkElement.value = playlistUrl;

    generateQRCode('playlistQRCode', playlistUrl);

    document.getElementById('sessionLinkContainer').style.display = 'none';
    document.getElementById('playlistLinkContainer').style.display = 'block';
}

function generateQRCode(elementId, data) {
    const element = document.getElementById(elementId);
    element.innerHTML = ''; // Clear previous QR code
    new QRCode(element, {
        text: data,
        width: 128,
        height: 128,
    });
}

export function copySessionLink() {
    copyToClipboard('sessionLink');
}

export function copyPlaylistLink() {
    copyToClipboard('playlistLink');
}

function copyToClipboard(elementId) {
    const copyText = document.getElementById(elementId);
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    document.execCommand("copy");
    showNotification("Link copied to clipboard!", "success");
}

function showNotification(message, type) {
    // You can implement this function or import it from your UI module
    console.log(`${type}: ${message}`);
}

document.addEventListener('DOMContentLoaded', setupSessionSettingsListeners);