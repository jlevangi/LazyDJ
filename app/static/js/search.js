//  search.js
import { showNotification } from './ui.js';
import { truncateText, debugLog } from './util.js';
import { addTrackToQueue, playTrackNow, fetchQueue } from './queue.js';
import { isInAdminMode } from './admin.js';

export function fetchRecommendations(query, sessionId = null, sessionToken = null) {
    console.log('Fetching recommendations for query:', query);
    const resultsContainer = document.querySelector('.results');

    if (!query || query.trim().length < 3) {
        resultsContainer.innerHTML = '';
        return Promise.resolve();
    }
    
    const headers = {
        'X-Requested-With': 'XMLHttpRequest'
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const url = sessionId 
        ? `/session/${sessionId}/recommendations?query=${encodeURIComponent(query.trim())}`
        : `/recommendations?query=${encodeURIComponent(query.trim())}`;

    return fetch(url, { headers })
    .then(response => {
        console.log('Recommendations response:', response);
        return response.json();
    })
    .then(data => {
        console.log('Recommendations data:', data);
        if (data.error) {
            resultsContainer.innerHTML = `<p>Error: ${data.error}</p>`;
            return;
        }
        if (data.length > 0) {
            resultsContainer.innerHTML = data.map(track => `
                <div class="result-item">
                    ${track.album_art ? `<img src="${track.album_art}" alt="${track.name} album art" class="album-art">` : ''}
                    <div class="track-info">
                        <p class="track-name" title="${track.name}">${truncateText(track.name, 40)}</p>
                        <p class="track-artist" title="${track.artists}">${truncateText(track.artists, 40)}</p>
                    </div>
                    <div class="button-container">
                        <button onclick="addTrackToQueue('${track.uri}', '${track.name}', '${track.artists}', '${sessionId || ''}')">Add to Queue</button>
                        ${isInAdminMode() ?
                            `<button onclick="playTrackNow('${track.uri}')" class="play-now-button">Play Now</button>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            resultsContainer.innerHTML = '<p>No results found</p>';
        }
    })
    .catch(error => {
        console.error('Error fetching recommendations:', error);
        showNotification('Error fetching recommendations', 'error');
    });
}

export function performSearch(query, sessionId = null) {
    console.log('Performing search. Query:', query);
    
    if (query.length < 3) {
        document.querySelector('.results').innerHTML = '';
        return Promise.resolve();
    }

    const searchUrl = sessionId ? `/session/${sessionId}/search` : '/search';

    return fetch(`${searchUrl}?query=${encodeURIComponent(query)}`, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        console.log('Search response:', response);
        return response.json();
    })
    .then(data => {
        console.log('Search results:', data);
        handleSearchResults(data, sessionId);
    })
    .catch(error => {
        console.error('Error performing search:', error);
        showNotification('Error performing search', 'error');
    });
}

function handleSearchResults(data, sessionId) {
    const resultsContainer = document.querySelector('.results');
    if (!resultsContainer) {
        console.error('Results container not found');
        return;
    }

    if (data.error) {
        resultsContainer.innerHTML = `<p>Error: ${data.error}</p>`;
        return;
    }

    // Handle both direct array and {tracks: [...]} structure
    const tracks = data.tracks || data;
    
    if (!Array.isArray(tracks) || tracks.length === 0) {
        resultsContainer.innerHTML = '<p>No results found</p>';
        return;
    }

    const resultHtml = tracks.map(track => `
        <div class="result-item">
            ${track.album_art ? `<img src="${track.album_art}" alt="${track.name} album art" class="album-art">` : ''}
            <div class="track-info">
                <p class="track-name" title="${track.name}">${truncateText(track.name, 40)}</p>
                <p class="track-artist" title="${track.artists}">${truncateText(track.artists, 40)}</p>
            </div>
            <div class="button-container">
                <button onclick="addTrackToQueue('${track.uri}', '${track.name}', '${track.artists}', '${sessionId || ''}')">Add to Queue</button>
                ${isInAdminMode() ?
                    `<button onclick="playTrackNow('${track.uri}')" class="play-now-button">Play Now</button>` : ''}
            </div>
        </div>
    `).join('');

    resultsContainer.innerHTML = resultHtml;
}