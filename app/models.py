from flask import current_app
import time
import uuid
from datetime import datetime
import json
import spotipy
import logging

# Set up logger
logger = logging.getLogger(__name__)

class Track:
    def __init__(self, uri, name, artists, album_art=None):
        self.uri = uri
        self.name = name
        self.artists = artists
        self.album_art = album_art
        self.added_at = time.time()

    def __repr__(self):
        return f'<Track {self.name} by {self.artists}>'

    def to_dict(self):
        return {
            'uri': self.uri,
            'name': self.name,
            'artists': self.artists,
            'album_art': self.album_art
        }

    def is_on_cooldown(self):
        cooldown_period = current_app.config['TRACK_COOLDOWN_PERIOD']
        return (time.time() - self.added_at) < cooldown_period

class Session:
    def __init__(self, owner_token, session_id=None):
        self.session_id = session_id or str(uuid.uuid4())[:8]
        self.owner_token = owner_token
        self.created_at = datetime.now()
        self.queue = []  # List to maintain order
        self.queue_cooldowns = {}  # Dictionary to track cooldowns
        self.playlist_id = None
        self.playlist_name = None
        logger.info(f"Created new session: {self.session_id}")

    def get_token_info(self):
        return json.loads(self.owner_token)

    def add_to_queue(self, track):
        self.queue.append(track)
        self.queue_cooldowns[track['uri']] = time.time()
        logger.info(f"Added track to queue: {track['name']} (URI: {track['uri']})")
        if self.playlist_id:
            logger.debug(f"Attempting to add track {track['uri']} to playlist {self.playlist_id}")
            self.add_track_to_playlist(track['uri'])
        else:
            logger.warning(f"No playlist_id set for session {self.session_id}. Track not added to playlist.")

    def is_track_on_cooldown(self, track_uri, cooldown_period):
        last_played = self.queue_cooldowns.get(track_uri, 0)
        return (time.time() - last_played) < cooldown_period

    def add_track_to_playlist(self, track_uri):
        logger.debug(f"Entering add_track_to_playlist method for track {track_uri}")
        if not self.playlist_id:
            logger.warning(f"No playlist associated with session {self.session_id}, skipping playlist addition")
            return
        try:
            token_info = self.get_token_info()
            logger.debug(f"Token info retrieved for session {self.session_id}")
            sp = spotipy.Spotify(auth=token_info['access_token'])
            
            logger.info(f"Checking if track {track_uri} is already in playlist {self.playlist_id}")
            playlist_tracks = sp.playlist_tracks(self.playlist_id)
            track_uris = [item['track']['uri'] for item in playlist_tracks['items']]
            
            if track_uri not in track_uris:
                logger.info(f"Track {track_uri} not found in playlist. Attempting to add.")
                result = sp.user_playlist_add_tracks(sp.me()['id'], self.playlist_id, [track_uri])
                logger.info(f"Add track result: {result}")
                if result:
                    logger.info(f"Successfully added track {track_uri} to playlist {self.playlist_id}")
                else:
                    logger.warning(f"Failed to add track {track_uri} to playlist {self.playlist_id}. No error raised, but result was falsy.")
            else:
                logger.info(f"Track {track_uri} already in playlist {self.playlist_id}, skipping addition")
        except SpotifyException as e:
            logger.error(f"Spotify API error adding track to playlist: {str(e)}", exc_info=True)
        except Exception as e:
            logger.error(f"Unexpected error adding track to playlist: {str(e)}", exc_info=True)
        logger.debug(f"Exiting add_track_to_playlist method for track {track_uri}")

    def remove_from_queue(self, track_uri):
        self.queue = [t for t in self.queue if t['uri'] != track_uri]

    def get_queue(self):
        return self.queue

    def clear_queue(self):
        self.queue = []

# In-memory stores
active_sessions = {}
recent_tracks = {}
event_owner_token = None  # Global event owner token for wedding/event mode

def create_session(owner_token):
    session = Session(owner_token)
    active_sessions[session.session_id] = session
    logger.info(f"Created new session: {session.session_id}")
    return session

def get_session(session_id):
    return active_sessions.get(session_id)

def delete_session(session_id):
    if session_id in active_sessions:
        del active_sessions[session_id]
        logger.info(f"Deleted session: {session_id}")
    else:
        logger.warning(f"Attempted to delete non-existent session: {session_id}")

def set_event_owner_token(token_info):
    """Set the global event owner token for wedding/event mode"""
    global event_owner_token
    event_owner_token = token_info
    logger.info("Event owner token set for event mode")

def get_event_owner_token():
    """Get the global event owner token for wedding/event mode"""
    return event_owner_token

def add_track_to_session(session, track_uri, track_name, artist_name):
    logger.info(f"Attempting to add track to session {session.session_id}: {track_name} by {artist_name} (URI: {track_uri})")
    track = {
        'uri': track_uri,
        'name': track_name,
        'artists': artist_name
    }
    session.add_to_queue(track)
    added_to_playlist = session.playlist_id is not None
    logger.info(f"Track {track_name} added to session {session.session_id} queue. Added to playlist: {added_to_playlist}")
    return {
        'track': track,
        'added_to_playlist': added_to_playlist
    }

def add_recent_track(track):
    recent_tracks[track.uri] = track
    logger.debug(f"Added recent track: {track.name}")

def get_recent_track(track_uri):
    return recent_tracks.get(track_uri)

def is_track_on_cooldown(track_uri):
    track = get_recent_track(track_uri)
    return track and track.is_on_cooldown()

def clear_expired_tracks():
    current_time = time.time()
    cooldown_period = current_app.config['TRACK_COOLDOWN_PERIOD']
    expired_tracks = [uri for uri, track in recent_tracks.items() 
                      if current_time - track.added_at > cooldown_period]
    for uri in expired_tracks:
        del recent_tracks[uri]
    logger.info(f"Cleared {len(expired_tracks)} expired tracks")

def cleanup_expired_sessions():
    current_time = time.time()
    expiration_time = current_app.config.get('SESSION_EXPIRATION_TIME', 24 * 60 * 60)  # Default to 24 hours
    expired_sessions = [sid for sid, session in active_sessions.items() 
                        if (current_time - session.created_at.timestamp()) > expiration_time]
    for sid in expired_sessions:
        del active_sessions[sid]
        logger.info(f"Removed expired session: {sid}")
    logger.info(f"Cleaned up {len(expired_sessions)} expired sessions")