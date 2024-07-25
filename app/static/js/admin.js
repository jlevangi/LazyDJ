// admin.js
import { updateUIForAdminStatus, showNotification } from './ui.js';
import { debugLog } from './util.js';

let isAdminMode = false;

export function checkAdminStatus() {
    debugLog('Checking admin status');
    return fetch('/check_admin_status')
    .then(response => response.json())
    .then(data => {
        debugLog('Admin status:', data);
        isAdminMode = data.is_admin;
        updateUIForAdminStatus(isAdminMode);
        return isAdminMode;
    })
    .catch(error => {
        console.error('Error checking admin status:', error);
    });
}

export function checkAdminKeyword(query) {
    debugLog('Checking admin keyword');
    return fetch('/check_admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'query': query })
    })
    .then(response => response.json())
    .then(data => {
        debugLog('Admin keyword check response:', data);
        if (data.is_admin) {
            isAdminMode = true;
            updateUIForAdminStatus(true);
            showNotification('Admin mode activated', 'success');
        }
        return isAdminMode;
    })
    .catch(error => {
        console.error('Error checking admin keyword:', error);
    });
}

export function deactivateAdminMode() {
    debugLog('Attempting to deactivate admin mode');
    return fetch('/deactivate_admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        debugLog('Admin deactivation response:', data);
        if (data.status === 'success') {
            isAdminMode = false;
            updateUIForAdminStatus(false);
            showNotification('Admin mode deactivated', 'success');
        } else {
            throw new Error(data.message || 'Failed to deactivate admin mode');
        }
    })
    .catch(error => {
        console.error('Error deactivating admin mode:', error);
        showNotification('Error deactivating admin mode: ' + error.message, 'error');
        // Even if the server request fails, we'll deactivate admin mode on the client side
        isAdminMode = false;
        updateUIForAdminStatus(false);
    });
}

export function updateAdminControls() {
    const adminControlsContainer = document.querySelector('.admin-controls');
    if (!adminControlsContainer) return;

    if (isAdminMode) {
        adminControlsContainer.innerHTML = `
            <button onclick="clearQueue()">Clear Queue</button>
            <button onclick="skipTrack()">Skip Track</button>
        `;
        adminControlsContainer.style.display = 'block';
    } else {
        adminControlsContainer.style.display = 'none';
    }
}

export function isInAdminMode() {
    return isAdminMode;
}