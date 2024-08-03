from spotipy.oauth2 import SpotifyOAuth
from flask import current_app, session
import time
import spotipy
import json
import logging

logger = logging.getLogger(__name__)

def get_spotify_oauth():
    return SpotifyOAuth(
        client_id=current_app.config['SPOTIPY_CLIENT_ID'],
        client_secret=current_app.config['SPOTIPY_CLIENT_SECRET'],
        redirect_uri=current_app.config['SPOTIPY_REDIRECT_URI'],
        scope=current_app.config['SPOTIFY_SCOPE']
    )

def get_token(token_info=None):
    if not token_info:
        token_info = session.get('token_info')
    logger.debug("Token info retrieved from session")

    if not token_info:
        logger.warning("No token_info found")
        return None

    # If token_info is a string, try to parse it as JSON
    if isinstance(token_info, str):
        try:
            token_info = json.loads(token_info)
            logger.debug("Successfully parsed token_info from string to dictionary")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse token_info string as JSON: {e}")
            return None
    elif not isinstance(token_info, dict):
        logger.error(f"Unexpected token_info type: {type(token_info)}")
        return None

    now = int(time.time())
    is_token_expired = token_info.get('expires_at', 0) - now < 60

    if is_token_expired:
        logger.info("Token is expired, refreshing...")
        sp_oauth = get_spotify_oauth()
        try:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            session['token_info'] = json.dumps(token_info)
            logger.info("Token refreshed and stored in session")
        except Exception as e:
            logger.error(f"Error refreshing token: {e}")
            return None

    logger.debug("Token info is valid and up to date")
    return token_info

def get_spotify_client():
    token_info = get_token()
    if not token_info:
        return None
    return spotipy.Spotify(auth=token_info['access_token'])

def format_track_info(track):
    return f"{track['name']} by {', '.join([artist['name'] for artist in track['artists']])}"

def search_tracks(query, limit=10):
    sp = get_spotify_client()
    if not sp:
        return []

    results = sp.search(q=query, type='track', limit=limit)
    tracks = results['tracks']['items']

    track_info = []
    for track in tracks:
        track_data = {
            'name': track['name'],
            'artists': ', '.join([artist['name'] for artist in track['artists']]),
            'album_art': track['album']['images'][0]['url'] if track['album']['images'] else None,
            'uri': track['uri'],
            'id': track['id']
        }
        track_info.append(track_data)

    return track_info

def add_track_to_queue(track_uri):
    sp = get_spotify_client()
    if not sp:
        return False, "Not authenticated"

    try:
        sp.add_to_queue(track_uri)
        return True, "Track added to queue"
    except spotipy.exceptions.SpotifyException as e:
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return False, "No active device found. Please open Spotify on a device and try again."
        else:
            return False, f"An error occurred: {str(e)}"

def get_current_queue():
    sp = get_spotify_client()
    if not sp:
        return None, None, "Not authenticated"

    try:
        queue_info = sp._get('me/player/queue')
        current_track = sp.currently_playing()

        if current_track and current_track['is_playing']:
            current = {
                'name': current_track['item']['name'],
                'artists': ', '.join([artist['name'] for artist in current_track['item']['artists']])
            }
        else:
            current = None

        queue = [{'name': track['name'], 'artists': ', '.join([artist['name'] for artist in track['artists']]), 'uri': track['uri']}
                 for track in queue_info['queue']]

        return current, queue, None
    except spotipy.exceptions.SpotifyException as e:
        return None, None, f"An error occurred: {str(e)}"
