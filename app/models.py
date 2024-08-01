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

class Queue:
    def __init__(self):
        self.tracks = []

    def add_track(self, track):
        self.tracks.append(track)

    def remove_track(self, track_uri):
        self.tracks = [t for t in self.tracks if t.uri != track_uri]

    def get_tracks(self):
        return self.tracks

    def clear(self):
        self.tracks = []

# This dictionary will serve as an in-memory store for recent tracks
# Key: track URI, Value: Track object
recent_tracks = {}

def add_recent_track(track):
    recent_tracks[track.uri] = track

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

class Session:
    def __init__(self, owner_token, session_id=None):
        self.session_id = session_id or str(uuid.uuid4())[:8]
        self.owner_token = owner_token
        self.created_at = datetime.now()
        self.queue = []
        self.playlist_id = None
        self.playlist_name = None
        logger.info(f"Created new session: {self.session_id}")

    def get_token_info(self):
        return json.loads(self.owner_token)

    def add_to_queue(self, track):
        self.queue.append(track)
        logger.info(f"Added track to queue: {track['name']} (URI: {track['uri']})")
        if self.playlist_id:
            self.add_track_to_playlist(track['uri'])

    def add_track_to_playlist(self, track_uri):
        if not self.playlist_id:
            logger.warning(f"No playlist associated with session {self.session_id}, skipping playlist addition")
            return
        try:
            token_info = self.get_token_info()
            sp = spotipy.Spotify(auth=token_info['access_token'])
            
            # Check if the track is already in the playlist
            playlist_tracks = sp.playlist_tracks(self.playlist_id)
            track_uris = [item['track']['uri'] for item in playlist_tracks['items']]
            
            if track_uri not in track_uris:
                sp.user_playlist_add_tracks(sp.me()['id'], self.playlist_id, [track_uri])
                logger.info(f"Added track {track_uri} to playlist {self.playlist_id}")
            else:
                logger.info(f"Track {track_uri} already in playlist {self.playlist_id}, skipping addition")
        except Exception as e:
            logger.error(f"Error adding track to playlist: {str(e)}")

    def remove_from_queue(self, track_uri):
        self.queue = [t for t in self.queue if t['uri'] != track_uri]

    def get_queue(self):
        return self.queue

    def clear_queue(self):
        self.queue = []

# In-memory store for active sessions
active_sessions = {}

def create_session_playlist(sp):
    date_str = datetime.now().strftime("%Y-%m-%d")
    playlist_name = f"LazyDJ - {date_str}"
    user_id = sp.me()['id']
    logger.info(f"Attempting to create or find playlist: {playlist_name}")

    # Check if a playlist with this name already exists
    playlists = sp.user_playlists(user_id)
    existing_playlist = next((playlist for playlist in playlists['items'] if playlist['name'] == playlist_name), None)

    if existing_playlist:
        logger.info(f"Found existing playlist: {playlist_name} (ID: {existing_playlist['id']})")
        return existing_playlist['id'], existing_playlist['name']
    else:
        try:
            logger.info(f"No existing playlist found. Creating new playlist: {playlist_name}")
            new_playlist = sp.user_playlist_create(user_id, playlist_name, public=False)
            logger.info(f"Created new playlist: {playlist_name} (ID: {new_playlist['id']})")
            return new_playlist['id'], new_playlist['name']
        except spotipy.exceptions.SpotifyException as e:
            logger.error(f"Error creating playlist: {str(e)}")
            return None, None

def create_session(owner_token):
    session = Session(owner_token)
    token_info = json.loads(owner_token)
    sp = spotipy.Spotify(auth=token_info['access_token'])
    playlist_id, playlist_name = create_session_playlist(sp)
    if playlist_id and playlist_name:
        session.playlist_id = playlist_id
        session.playlist_name = playlist_name
        logger.info(f"Session {session.session_id} associated with playlist: {playlist_name} (ID: {playlist_id})")
    else:
        logger.warning(f"Failed to create or find playlist for session {session.session_id}")
    active_sessions[session.session_id] = session
    return session

def add_track_to_playlist(self, track_uri):
    if not self.playlist_id:
        logger.warning(f"No playlist associated with session {self.session_id}, skipping playlist addition")
        return
    try:
        token_info = self.get_token_info()
        sp = spotipy.Spotify(auth=token_info['access_token'])
        
        # Check if the track is already in the playlist
        playlist_tracks = sp.playlist_tracks(self.playlist_id)
        track_uris = [item['track']['uri'] for item in playlist_tracks['items']]
        
        if track_uri not in track_uris:
            sp.user_playlist_add_tracks(sp.me()['id'], self.playlist_id, [track_uri])
            logger.info(f"Added track {track_uri} to playlist {self.playlist_id}")
        else:
            logger.info(f"Track {track_uri} already in playlist {self.playlist_id}, skipping addition")
    except Exception as e:
        logger.error(f"Error adding track to playlist: {str(e)}")

def add_to_queue(self, track):
    self.queue.append(track)
    if self.playlist_id:
        self.add_track_to_playlist(track['uri'])

def get_session(session_id):
    return active_sessions.get(session_id)

def delete_session(session_id):
    if session_id in active_sessions:
        del active_sessions[session_id]

def add_track_to_session(session, track_uri, track_name, artist_name):
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

def cleanup_expired_sessions():
    current_time = time.time()
    expiration_time = current_app.config.get('SESSION_EXPIRATION_TIME', 24 * 60 * 60)  # Default to 24 hours
    expired_sessions = [sid for sid, session in active_sessions.items() 
                        if current_time - session.created_at > expiration_time]
    for sid in expired_sessions:
        del active_sessions[sid]