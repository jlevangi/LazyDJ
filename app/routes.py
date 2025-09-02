# routes.py

from flask import Blueprint, render_template, redirect, url_for, request, jsonify, session, current_app
from app.spotify_utils import get_token, get_spotify_oauth, format_track_info, get_spotify_client
from app.models import add_recent_track, Track, add_track_to_session, get_session, delete_session
from app.admin import check_if_admin
from app.sessions import create_new_session
from app.sessions import bp as sessions_bp
from .log_utils import format_debug_output

import spotipy
from spotipy.exceptions import SpotifyException
import time
import logging
import os
from threading import Lock
import traceback
import json

bp = Blueprint('routes', __name__)
logger = logging.getLogger(__name__)

# Store recently added tracks
recent_tracks = {}
queue_lock = Lock()

def qr_code_exists():
    """Check if the QR code file exists in the static folder."""
    static_folder = os.path.join(current_app.root_path, 'static')
    qr_code_file = os.path.join(static_folder, 'tip-qr.png')
    return os.path.exists(qr_code_file)

@bp.route('/debug_status')
def debug_status():
    return jsonify({"debug_mode": current_app.debug})

@bp.route('/api/version')
def get_version():
    """Get application version and status"""
    try:
        # Read version from VERSION file
        version_path = os.path.join(current_app.root_path, '..', 'VERSION')
        with open(version_path, 'r') as f:
            version = f.read().strip()
    except:
        version = "unknown"
    
    wedding_mode = os.getenv('WEDDING_MODE', 'false').lower() == 'true'
    
    return jsonify({
        "version": version,
        "wedding_mode": wedding_mode,
        "timestamp": time.time()
    })

@bp.route('/api/toggle-wedding-mode', methods=['POST'])
def toggle_wedding_mode():
    """Toggle wedding mode on/off"""
    try:
        current_mode = os.getenv('WEDDING_MODE', 'false').lower() == 'true'
        new_mode = not current_mode
        
        # Note: This only works for the current session
        # To persist across container restarts, the environment variable 
        # would need to be set at the container/deployment level
        os.environ['WEDDING_MODE'] = 'true' if new_mode else 'false'
        
        return jsonify({
            "success": True,
            "wedding_mode": new_mode,
            "message": f"Wedding mode {'enabled' if new_mode else 'disabled'}"
        })
    except Exception as e:
        logger.error(f"Error toggling wedding mode: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@bp.route('/')
def index():
    current_app.logger.info('Rendering index.html')
    
    # Check if wedding mode is enabled
    wedding_mode = os.getenv('WEDDING_MODE', 'false').lower() == 'true'
    if wedding_mode:
        current_app.logger.info('Wedding mode enabled - redirecting to event-mode')
        return redirect(url_for('routes.event_mode'))
    
    return render_template('index.html')

@bp.route('/login')
def login():
    sp_oauth = get_spotify_oauth()
    auth_url = sp_oauth.get_authorize_url()
    return redirect(auth_url)

@bp.route('/callback')
def callback():
    sp_oauth = get_spotify_oauth()
    code = request.args.get('code')
    try:
        token_info = sp_oauth.get_access_token(code)
        session['token_info'] = json.dumps(token_info)
        logger.info("Token info stored in session")
        logger.debug(f"Token info: {json.dumps(token_info)}")
        
        # Check if wedding mode is enabled
        wedding_mode = os.getenv('WEDDING_MODE', 'false').lower() == 'true'
        if wedding_mode:
            logger.info("Wedding mode enabled - redirecting to event-mode after authentication")
            return redirect(url_for('routes.event_mode'))
        
        return redirect(url_for('routes.search'))
    except spotipy.oauth2.SpotifyOauthError as e:
        logger.error(f"Spotify OAuth Error: {e}")
        if 'invalid_grant' in str(e):
            # Clear the session and redirect to login
            session.clear()
            return redirect(url_for('routes.login'))
    except Exception as e:
        logger.error(f"Error in callback: {e}")
        return jsonify({"error": "Authentication failed"}), 400

@bp.route('/search')
def search():
    query = request.args.get('query', '').strip()
    token_info = get_token()
    
    if not token_info:
        return redirect(url_for('routes.login'))

    if not request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        qr_code_available = qr_code_exists()
        wedding_mode = os.getenv('WEDDING_MODE', 'false').lower() == 'true'
        return render_template('search.html', tracks=[], query=query, qr_code_available=qr_code_available, wedding_mode=wedding_mode)

    try:
        sp = spotipy.Spotify(auth=token_info['access_token'])
        results = sp.search(q=query, type='track', limit=10)
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

        return jsonify({"tracks": track_info})
    except SpotifyException as e:
        logger.error(f"Spotify API error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": f"Spotify API error: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

@bp.route('/queue', methods=['POST'])
def queue():
    logger.debug("Entering queue route")
    token_info = get_token()
    if not token_info:
        logger.warning('No token info available')
        return jsonify({"status": "error", "type": "error", "message": "No token info available"}), 401

    track_uri = request.form.get('track_uri')
    track_name = request.form.get('track_name')
    artist_name = request.form.get('artist_name')
    is_admin = request.form.get('is_admin') == 'true'

    logger.debug(f"Attempting to queue: {track_name} by {artist_name}")

    if not track_uri:
        logger.error("No track_uri provided in request")
        return jsonify({"status": "error", "type": "error", "message": "No track URI provided"}), 400

    cooldown_period = 1200  # 20 minutes in seconds

    with queue_lock:
        # Get the current session if it exists
        current_session_id = session.get('current_session_id')
        logger.debug(f"Current session ID: {current_session_id}")
        
        if current_session_id:
            current_session = get_session(current_session_id)
            if not current_session:
                logger.error(f"No session found for ID: {current_session_id}")
                return jsonify({"status": "error", "type": "error", "message": "Session not found"}), 404
        else:
            # If no session, we'll just add to the Spotify queue without session functionality
            logger.info("No active session, proceeding without session functionality")
            current_session = None

        if current_session and not is_admin and current_session.is_track_on_cooldown(track_uri, cooldown_period):
            logger.debug(f"Track on cooldown: {track_name} by {artist_name}")
            return jsonify({"status": "error", "message": "This track was recently played. Please try again later."}), 200

        sp = spotipy.Spotify(auth=token_info['access_token'])
        
        try:
            sp.add_to_queue(track_uri)
            logger.debug(f"Successfully added to Spotify queue: {track_name} by {artist_name}")
            
            # Add track to recent_tracks
            recent_tracks[track_uri] = {
                'name': track_name,
                'artists': artist_name,
                'added_at': time.time()
            }
            
            if current_session:
                # Add track to session
                result = add_track_to_session(current_session, track_uri, track_name, artist_name)
                logger.debug(f"Result of add_track_to_session: {result}")
                
                if result['added_to_playlist']:
                    logger.info(f"Track added to playlist: {track_name} by {artist_name}")
                else:
                    logger.warning(f"Track not added to playlist: {track_name} by {artist_name}")
                
                return jsonify({"status": "success", "type": "success", "message": "Track added to queue and session!"})
            else:
                return jsonify({"status": "success", "type": "success", "message": "Track added to queue!"})
        except SpotifyException as e:
            logger.error(f"Spotify API error: {str(e)}")
            if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
                return jsonify({"status": "error", "type": "error", "message": "No active device found. Please open Spotify on a device and try again."})
            else:
                return jsonify({"status": "error", "type": "error", "message": f"An error occurred: {str(e)}"})


@bp.route('/play_now', methods=['POST'])
def play_now():
    token_info = get_token()
    if not token_info:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    track_uri = request.form.get('track_uri')
    if not track_uri:
        return jsonify({"status": "error", "message": "No track URI provided"}), 400

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        sp.start_playback(uris=[track_uri])
        track_info = sp.track(track_uri)
        add_recent_track(Track(
            uri=track_uri,
            name=track_info['name'],
            artists=', '.join([artist['name'] for artist in track_info['artists']]),
            album_art=track_info['album']['images'][0]['url'] if track_info['album']['images'] else None
        ))
        return jsonify({"status": "success", "message": "Track started playing"})
    except SpotifyException as e:
        logger.error(f"Spotify API error: {str(e)}")
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return jsonify({"status": "error", "message": "No active device found. Please open Spotify on a device and try again."}), 404
        else:
            return jsonify({"status": "error", "message": f"An error occurred: {str(e)}"}), 500

@bp.route('/current_queue')
def current_queue():
    token_info = get_token()
    if not token_info:
        logger.warning("No token info available in current_queue route")
        return jsonify({"error": "Not authenticated"}), 401

    try:
        sp = spotipy.Spotify(auth=token_info['access_token'])
        queue_info = sp._get('me/player/queue')
        current_track = sp.currently_playing()

        user_queue = []
        radio_queue = []

        if queue_info and 'queue' in queue_info:
            for track in queue_info['queue']:
                track_info = {
                    'name': track['name'],
                    'artists': ', '.join([artist['name'] for artist in track['artists']]),
                    'uri': track['uri']
                }
                # Check if the track is in recent_tracks
                if track['uri'] in recent_tracks:
                    user_queue.append(track_info)
                else:
                    radio_queue.append(track_info)

        debug_data = {
            'current_track': current_track,
            'user_queue': user_queue,
            'radio_queue': radio_queue
        }
        formatted_output = format_debug_output(debug_data)
        logger.debug(f"Queue Information:\n{formatted_output}")

        return jsonify({
            'current_track': {
                'name': current_track['item']['name'],
                'artists': ', '.join([artist['name'] for artist in current_track['item']['artists']])
            } if current_track and current_track.get('item') else None,
            'user_queue': user_queue,
            'radio_queue': radio_queue[:5]  # Limit to first 5 tracks
        })
    except Exception as e:
        logger.error(f"Error fetching queue: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An unexpected error occurred"}), 500

@bp.route('/recommendations', methods=['GET'])
def recommendations():
    token_info = get_token()
    if not token_info:
        return redirect(url_for('routes.index'))

    query = request.args.get('query')
    if not query:
        return jsonify([])

    sp = spotipy.Spotify(auth=token_info['access_token'])
    results = sp.search(q=query, type='track', limit=10)
    tracks = results['tracks']['items']

    track_info = []
    for track in tracks:
        track_data = {
            'name': track['name'],
            'artists': ', '.join([artist['name'] for artist in track['artists']]),
            'album_art': track['album']['images'][0]['url'] if track['album']['images'] else None,
            'uri': track['uri']
        }
        track_info.append(track_data)

    return jsonify(track_info)

@bp.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@bp.route('/create_session', methods=['POST'])
def route_create_session():
    return create_new_session()

@bp.route('/end_session', methods=['POST'])
def end_session():
    session_id = session.get('current_session_id')
    if session_id:
        try:
            delete_session(session_id)
            session.pop('current_session_id', None)
            session.pop('token_info', None)
            logger.info(f"Session ended: {session_id}")
            return jsonify({"status": "success", "message": "Session ended successfully"})
        except Exception as e:
            logger.error(f"Error ending session {session_id}: {str(e)}")
            return jsonify({"status": "error", "message": f"Failed to end session: {str(e)}"}), 500
    else:
        logger.warning("Attempt to end session when no active session found")
        return jsonify({"status": "error", "message": "No active session found"}), 400

# Event Mode Routes - for single-user event control (weddings, parties, etc.)
def load_event_config():
    """Load event configuration including preset songs and playlist URI"""
    # Debug current paths
    logger.info(f"App root path: {current_app.root_path}")
    logger.info(f"Current working directory: {os.getcwd()}")
    
    # Try multiple possible locations for the config file
    possible_paths = [
        # Direct path in project root
        os.path.join(os.getcwd(), 'event_preset_songs.json'),
        # Relative to app directory
        os.path.join(current_app.root_path, '..', 'event_preset_songs.json'),
        # Using dirname approach
        os.path.join(os.path.dirname(current_app.root_path), 'event_preset_songs.json'),
        # Absolute path we know works
        '/mnt/c/Users/pierc/git/LazyDJ/event_preset_songs.json'
    ]
    
    config_path = None
    for path in possible_paths:
        abs_path = os.path.abspath(path)
        logger.debug(f"Checking path: {abs_path} - exists: {os.path.exists(path)}")
        if os.path.exists(path):
            config_path = path
            logger.info(f"Found config file at: {abs_path}")
            break
    
    if not config_path:
        logger.error("Config file not found in any expected location")
        config_path = possible_paths[0]  # Use first path for error message
    
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
            logger.info(f"Successfully loaded event config with {len(config.get('preset_songs', []))} preset songs")
            for song in config.get('preset_songs', []):
                logger.debug(f"Loaded preset song: {song.get('name')}")
            return config
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.error(f"Error loading event config from {config_path}: {str(e)}")
        logger.warning("Using fallback default config")
        # Fallback to default config if file is missing or invalid
        return {
            'preset_songs': [
                {'name': 'First Dance Song', 'uri': 'spotify:track:4uLU6hMCjMI75M1A2tKUQC'},
                {'name': 'Wedding Party Entrance', 'uri': 'spotify:track:2takcwOaAZWiXQijPHIx7B'},
                {'name': 'Cake Cutting Music', 'uri': 'spotify:track:1CS7Sd1u5tWkstBhpssyjP'},
                {'name': 'Grand Entrance', 'uri': 'spotify:track:6fxVffaTuwjgEk5h9XvInH'},
                {'name': 'Slow Dance', 'uri': 'spotify:track:3CeCwYWvdfXbZLXFhBrbnf'}
            ],
            'wedding_playlist_uri': 'spotify:playlist:2Td5DabJz8POOhcEYmCmEA'
        }

@bp.route('/event-mode')
def event_mode():
    """Event Mode interface for controlling music during live events"""
    token_info = get_token()
    if not token_info:
        return redirect(url_for('routes.login'))
    
    # Load event configuration including preset songs
    config = load_event_config()
    preset_songs = config.get('preset_songs', [])
    
    logger.info("Event Mode accessed - event configuration loaded")
    return render_template('event_mode.html', preset_songs=preset_songs)

@bp.route('/api/play-preset/<path:uri>')
def play_preset(uri):
    """Play a preset song with seamless transition (quick fade-out of current, immediate start of new)"""
    token_info = get_token()
    if not token_info:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    # Ensure the URI is properly formatted
    if not uri.startswith('spotify:track:'):
        return jsonify({"status": "error", "message": "Invalid Spotify URI"}), 400

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        # Check if something is currently playing
        current_playback = sp.current_playback()
        
        if current_playback and current_playback.get('is_playing', False):
            logger.info("Event Mode: Current song playing, performing quick fade-out for seamless transition")
            
            # Quick fade-out over 0.5 seconds for seamless transition (smooth with more steps)
            fade_steps = 12
            fade_interval = 0.5 / fade_steps  # 0.5 seconds total / 12 steps = ~0.042 seconds per step
            volume_step = 100 // fade_steps  # 100% / 12 steps = ~8% per step
            
            for step in range(fade_steps + 1):  # +1 to ensure we reach 0
                volume = max(0, 100 - (step * volume_step))
                try:
                    sp.volume(volume)
                    if volume > 0:  # Don't sleep after setting volume to 0
                        time.sleep(fade_interval)
                except SpotifyException as e:
                    logger.warning(f"Error during quick fade at volume {volume}: {str(e)}")
        
        # Immediately start the new preset song (no fade-in needed since songs have natural intros)
        sp.start_playback(uris=[uri])
        
        # Restore volume to 100% for the new song
        try:
            sp.volume(100)
        except SpotifyException as e:
            logger.warning(f"Error restoring volume: {str(e)}")
        
        # Get track info for logging and response
        track_info = sp.track(uri)
        track_name = track_info['name']
        artist_names = ', '.join([artist['name'] for artist in track_info['artists']])
        
        logger.info(f"Event Mode: Seamless transition to preset song - {track_name} by {artist_names}")
        
        return jsonify({
            "status": "success", 
            "message": f"Now playing: {track_name} by {artist_names}"
        })
        
    except SpotifyException as e:
        logger.error(f"Event Mode - Spotify API error: {str(e)}")
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return jsonify({"status": "error", "message": "No active device found. Please open Spotify on a device and try again."}), 404
        else:
            return jsonify({"status": "error", "message": f"An error occurred: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Event Mode - Unexpected error: {str(e)}")
        return jsonify({"status": "error", "message": "An unexpected error occurred"}), 500

@bp.route('/api/fade-out', methods=['POST'])
def fade_out():
    """Gradually fade out the current track volume over 4 seconds, then pause and restore volume"""
    token_info = get_token()
    if not token_info:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        # Get current playback info to check if something is playing
        current_playback = sp.current_playback()
        if not current_playback or not current_playback.get('is_playing', False):
            return jsonify({"status": "error", "message": "No track is currently playing"}), 400
        
        logger.info("Event Mode: Starting 4-second fade out")
        
        # Fade out over 4 seconds: reduce volume from 100% to 0% in steps
        fade_steps = 20
        fade_interval = 0.2  # 4 seconds total / 20 steps = 0.2 seconds per step
        volume_step = 5  # 100% / 20 steps = 5% per step
        
        for step in range(fade_steps + 1):  # +1 to ensure we reach 0
            volume = max(0, 100 - (step * volume_step))
            try:
                sp.volume(volume)
                if volume > 0:  # Don't sleep after setting volume to 0
                    time.sleep(fade_interval)
            except SpotifyException as e:
                logger.warning(f"Error during fade at volume {volume}: {str(e)}")
        
        logger.info("Event Mode: Fade completed, pausing playback")
        
        # Pause playback after fade completes
        try:
            sp.pause_playback()
            logger.info("Event Mode: Playback paused")
        except SpotifyException as e:
            logger.warning(f"Error pausing playback: {str(e)}")
        
        # Restore volume to maximum after pausing
        try:
            sp.volume(100)
            logger.info("Event Mode: Volume restored to 100%")
        except SpotifyException as e:
            logger.warning(f"Error restoring volume: {str(e)}")
        
        logger.info("Event Mode: Fade out, pause, and volume restore completed")
        return jsonify({"status": "success", "message": "Track faded out, paused, and volume restored"})
        
    except SpotifyException as e:
        logger.error(f"Event Mode - Spotify API error during fade: {str(e)}")
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return jsonify({"status": "error", "message": "No active device found. Please open Spotify on a device and try again."}), 404
        else:
            return jsonify({"status": "error", "message": f"An error occurred: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Event Mode - Unexpected error during fade: {str(e)}")
        return jsonify({"status": "error", "message": "An unexpected error occurred"}), 500

@bp.route('/api/fade-in', methods=['POST'])
def fade_in():
    """Resume playback and gradually fade in the volume over 2 seconds"""
    token_info = get_token()
    if not token_info:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        # Get current playback info
        current_playback = sp.current_playback()
        if not current_playback:
            return jsonify({"status": "error", "message": "No active device found"}), 400
        
        logger.info("Event Mode: Starting fade in")
        
        # Start at 0% volume and resume playback
        sp.volume(0)
        sp.start_playback()
        
        # Fade in over 2 seconds: increase volume from 0% to 100%
        fade_steps = 6
        fade_interval = 2.0 / fade_steps  # 2 seconds total / 6 steps = 0.33 seconds per step
        volume_step = 100 // fade_steps  # 100% / 6 steps = ~16% per step

        for step in range(1, fade_steps + 1):
            volume = min(100, step * volume_step)  # Cap at 100%
            try:
                sp.volume(volume)
                if step < fade_steps:  # Don't sleep after the final volume setting
                    time.sleep(fade_interval)
            except SpotifyException as e:
                logger.warning(f"Error during fade in at volume {volume}: {str(e)}")
        
        # Ensure we end at exactly 100%
        try:
            sp.volume(100)
        except SpotifyException as e:
            logger.warning(f"Error setting final volume: {str(e)}")
        
        logger.info("Event Mode: Fade in completed")
        return jsonify({"status": "success", "message": "Playback resumed and faded in"})
        
    except SpotifyException as e:
        logger.error(f"Event Mode - Spotify API error during fade in: {str(e)}")
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return jsonify({"status": "error", "message": "No active device found. Please open Spotify on a device and try again."}), 404
        else:
            return jsonify({"status": "error", "message": f"An error occurred: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Event Mode - Unexpected error during fade in: {str(e)}")
        return jsonify({"status": "error", "message": "An unexpected error occurred"}), 500

@bp.route('/api/resume-playlist', methods=['POST'])
def resume_playlist():
    """Start playing the wedding playlist on shuffle"""
    token_info = get_token()
    if not token_info:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        # Load the wedding playlist URI from config
        config = load_event_config()
        playlist_uri = config.get('wedding_playlist_uri')
        
        if not playlist_uri:
            return jsonify({"status": "error", "message": "Wedding playlist not configured"}), 400
        
        logger.info(f"Event Mode: Starting wedding playlist: {playlist_uri}")
        
        # Start playback with the playlist and enable shuffle
        sp.start_playback(context_uri=playlist_uri)
        sp.shuffle(True)
        
        logger.info("Event Mode: Wedding playlist started with shuffle enabled")
        return jsonify({"status": "success", "message": "Wedding playlist started on shuffle"})
        
    except SpotifyException as e:
        logger.error(f"Event Mode - Spotify API error starting playlist: {str(e)}")
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return jsonify({"status": "error", "message": "No active device found. Please open Spotify on a device and try again."}), 404
        else:
            return jsonify({"status": "error", "message": f"An error occurred: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Event Mode - Unexpected error starting playlist: {str(e)}")
        return jsonify({"status": "error", "message": "An unexpected error occurred"}), 500

@bp.route('/api/skip-song', methods=['POST'])
def skip_song():
    """Skip to the next song in the current playback"""
    token_info = get_token()
    if not token_info:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        # Get current playback info to check if something is playing
        current_playback = sp.current_playback()
        if not current_playback or not current_playback.get('is_playing', False):
            return jsonify({"status": "error", "message": "No track is currently playing"}), 400
        
        logger.info("Event Mode: Skipping to next song")
        
        # Skip to next track
        sp.next_track()
        
        logger.info("Event Mode: Successfully skipped to next song")
        return jsonify({"status": "success", "message": "Skipped to next song"})
        
    except SpotifyException as e:
        logger.error(f"Event Mode - Spotify API error skipping song: {str(e)}")
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return jsonify({"status": "error", "message": "No active device found. Please open Spotify on a device and try again."}), 404
        else:
            return jsonify({"status": "error", "message": f"An error occurred: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Event Mode - Unexpected error skipping song: {str(e)}")
        return jsonify({"status": "error", "message": "An unexpected error occurred"}), 500