from flask import current_app
import time
import uuid


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
    def __init__(self, owner_id, session_id=None):
        self.session_id = session_id or str(uuid.uuid4())[:8]
        self.owner_id = owner_id
        self.created_at = time.time()
        self.participants = set([owner_id])
        self.queue = []

    def add_participant(self, participant_id):
        self.participants.add(participant_id)

    def add_to_queue(self, track):
        self.queue.append(track)

    def remove_from_queue(self, track_uri):
        self.queue = [t for t in self.queue if t['uri'] != track_uri]

    def get_queue(self):
        return self.queue

    def clear_queue(self):
        self.queue = []

# In-memory store for active sessions
active_sessions = {}

def create_session(owner_id):
    session = Session(owner_id)
    active_sessions[session.session_id] = session
    return session

def get_session(session_id):
    return active_sessions.get(session_id)

def delete_session(session_id):
    if session_id in active_sessions:
        del active_sessions[session_id]

def cleanup_expired_sessions():
    current_time = time.time()
    expiration_time = current_app.config.get('SESSION_EXPIRATION_TIME', 24 * 60 * 60)  # Default to 24 hours
    expired_sessions = [sid for sid, session in active_sessions.items() 
                        if current_time - session.created_at > expiration_time]
    for sid in expired_sessions:
        del active_sessions[sid]