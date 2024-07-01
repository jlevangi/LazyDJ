import logging
from flask import Flask, request, render_template, redirect, url_for, session, jsonify, send_from_directory
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import time
from flask_session import Session
import os
from dotenv import load_dotenv
import argparse
from spotipy.exceptions import SpotifyException

load_dotenv()  # Load environment variables from .env file

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app.secret_key = os.getenv('SECRET_KEY')

# Admin keyword
ADMIN_KEYWORD = os.getenv('ADMIN_KEYWORD')

# Port number
PORT = int(os.getenv('PORT', 5000))  # Default to 5000 if not set

TIP_QR_CODE_PATH = '/static/tip-qr.png'

def qr_code_exists():
    """Check if the QR code file exists in the static folder."""
    static_folder = os.path.join(app.root_path, 'static')
    qr_code_file = os.path.join(static_folder, 'tip-qr.png')
    return os.path.exists(qr_code_file)

def check_if_admin():
    query = request.args.get('query', '').lower()
    return query == ADMIN_KEYWORD

# Configure server-side session
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

# Spotify API credentials
CLIENT_ID = os.getenv('SPOTIPY_CLIENT_ID')
CLIENT_SECRET = os.getenv('SPOTIPY_CLIENT_SECRET')
REDIRECT_URI = os.getenv('SPOTIPY_REDIRECT_URI')

# Spotify authorization scope
SCOPE = 'user-modify-playback-state user-read-playback-state'

sp_oauth = SpotifyOAuth(client_id=CLIENT_ID, client_secret=CLIENT_SECRET, redirect_uri=REDIRECT_URI, scope=SCOPE)

# Store recently added tracks
recent_tracks = {}

@app.before_request
def log_request_info():
    if app.debug:
        logger.debug('Headers: %s', request.headers)
        logger.debug('Body: %s', request.get_data())

@app.after_request
def log_response_info(response):
    if app.debug:
        logger.debug('Response Status: %s', response.status)
        logger.debug('Response Headers: %s', response.headers)
    return response

@app.errorhandler(405)
def method_not_allowed(error):
    logger.error('Method Not Allowed: %s', request.url)
    logger.error('Request Method: %s', request.method)
    return jsonify(error="Method Not Allowed"), 405

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login')
def login():
    auth_url = sp_oauth.get_authorize_url()
    return redirect(auth_url)

@app.route('/callback')
def callback():
    code = request.args.get('code')
    token_info = sp_oauth.get_access_token(code)
    session['token_info'] = token_info
    session['token_info']['expires_at'] = int(time.time()) + token_info['expires_in']
    return redirect(url_for('search'))

def get_token():
    token_info = session.get('token_info', None)
    if not token_info:
        return None

    now = int(time.time())
    is_token_expired = token_info['expires_at'] - now < 60

    if is_token_expired:
        token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
        session['token_info'] = token_info
        session['token_info']['expires_at'] = int(time.time()) + token_info['expires_in']

    return token_info

@app.route('/check_admin', methods=['POST'])
def check_admin():
    query = request.form.get('query', '').lower()
    is_admin = query == ADMIN_KEYWORD
    if is_admin:
        session['admin'] = True
        logger.info("Admin mode activated")
    else:
        session.pop('admin', None)
        logger.info("Admin mode not activated")
    return jsonify({"is_admin": is_admin})

@app.route('/check_admin_status', methods=['GET'])
def check_admin_status():
    is_admin = session.get('admin', False)
    return jsonify({"is_admin": is_admin})

@app.route('/deactivate_admin', methods=['POST'])
def deactivate_admin():
    logger.info("Deactivate admin route called")
    logger.info(f"Session before: {session}")
    
    if 'admin' in session:
        session.pop('admin', None)
        logger.info("Admin key removed from session")
    else:
        logger.info("Admin key not found in session")
    
    logger.info(f"Session after: {session}")
    
    return jsonify({"status": "success", "message": "Admin mode deactivated", "session": dict(session)})

@app.route('/search', methods=['GET', 'POST'])
def search():
    token_info = get_token()
    if not token_info:
        return redirect(url_for('index'))

    query = request.args.get('query')
    admin_mode = session.get('admin', False)
    
    app.logger.info(f"Search route accessed. Admin mode: {admin_mode}")

    tracks = []
    if query:
        sp = spotipy.Spotify(auth=token_info['access_token'])
        if admin_mode:
            results = sp.search(q='a', type='track', limit=10)
        else:
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

    qr_code_available = qr_code_exists()
    
    return render_template('search.html', 
                           token=token_info['access_token'], 
                           tracks=track_info, 
                           tip_qr_code_path=TIP_QR_CODE_PATH,
                           qr_code_available=qr_code_available,
                           admin_mode=admin_mode)

@app.route('/queue', methods=['POST'])
def queue():
    token_info = get_token()
    if not token_info:
        logger.warning('No token info available')
        return jsonify({"status": "error", "type": "error", "message": "No token info available"}), 401

    track_uri = request.form.get('track_uri')
    admin_mode = session.get('admin', False)
    current_time = time.time()

    logger.info(f"Queueing track: {track_uri}, Admin mode: {admin_mode}")

    if not track_uri:
        logger.error("No track_uri provided in request")
        return jsonify({"status": "error", "type": "error", "message": "No track URI provided"}), 400

    if admin_mode or track_uri not in recent_tracks or current_time - recent_tracks[track_uri] >= 1200:
        recent_tracks[track_uri] = current_time
        sp = spotipy.Spotify(auth=token_info['access_token'])
        
        try:
            sp.add_to_queue(track_uri)
            return jsonify({"status": "success", "type": "success", "message": "Track added to queue!"})
        except SpotifyException as e:
            logger.error(f"Spotify API error: {str(e)}")
            if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
                return jsonify({"status": "error", "type": "error", "message": "No active device found. Please open Spotify on a device and try again."})
            else:
                return jsonify({"status": "error", "type": "error", "message": f"An error occurred: {str(e)}"})
    else:
        return jsonify({"status": "error", "type": "error", "message": "Track recently added. Please wait before re-adding."})

    
@app.route('/play_next', methods=['POST'])
def play_next():
    token_info = get_token()
    if not token_info:
        logger.warning('No token info available')
        return jsonify({"status": "error", "type": "error", "message": "No token info available"}), 401

    track_uri = request.form.get('track_uri')
    admin_mode = session.get('admin', False)

    if not admin_mode:
        return jsonify({"status": "error", "type": "error", "message": "Admin mode required for this action"}), 403

    logger.info(f"Playing track next: {track_uri}")

    if not track_uri:
        logger.error("No track_uri provided in request")
        return jsonify({"status": "error", "type": "error", "message": "No track URI provided"}), 400

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        current_playback = sp.current_playback()
        
        if current_playback and current_playback['is_playing']:
            sp.add_to_queue(track_uri)
            sp.next_track()
        else:
            sp.start_playback(uris=[track_uri])
        
        return jsonify({"status": "success", "type": "success", "message": "Track will play next!"})
    except SpotifyException as e:
        logger.error(f"Spotify API error: {str(e)}")
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(e):
            return jsonify({"status": "error", "type": "error", "message": "No active device found. Please open Spotify on a device and try again."})
        else:
            return jsonify({"status": "error", "type": "error", "message": f"An error occurred: {str(e)}"})

@app.route('/current_queue', methods=['GET'])
def current_queue():
    token_info = get_token()
    if not token_info:
        return redirect(url_for('index'))

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        queue_info = sp._get('me/player/queue')
        current_track = sp.currently_playing()

        user_queue = []
        radio_queue = []
        for track in queue_info['queue']:
            track_info = {
                'name': track['name'],
                'artists': ', '.join([artist['name'] for artist in track['artists']]),
                'uri': track['uri']
            }
            if track['uri'] in recent_tracks:
                user_queue.append(track_info)
            else:
                radio_queue.append(track_info)

        return jsonify({
            'current_track': {
                'name': current_track['item']['name'],
                'artists': ', '.join([artist['name'] for artist in current_track['item']['artists']])
            } if current_track and current_track['is_playing'] else None,
            'user_queue': user_queue,
            'radio_queue': radio_queue
        })
    except spotipy.exceptions.SpotifyException as e:
        if e.http_status == 401:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            session['token_info'] = token_info
            session['token_info']['expires_at'] = int(time.time()) + token_info['expires_in']
            return redirect(url_for('current_queue'))
        else:
            return jsonify({"status": "error", "type": "error", "message": "An error occurred. Please try again."})

@app.errorhandler(spotipy.exceptions.SpotifyException)
def handle_spotify_exception(error):
    if error.http_status == 401:
        token_info = get_token()
        if token_info:
            return redirect(request.url)
        else:
            return redirect(url_for('index'))
    return jsonify({"status": "error", "type": "error", "message": "An error occurred. Please try again."}), error.http_status

@app.route('/recommendations', methods=['GET'])
def recommendations():
    token_info = get_token()
    if not token_info:
        return redirect(url_for('index'))

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

@app.errorhandler(spotipy.exceptions.SpotifyException)
def handle_spotify_exception(error):
    if error.http_status == 401:
        token_info = get_token()
        if token_info:
            return redirect(request.url)
        else:
            return redirect(url_for('index'))
    return jsonify({"status": "error", "message": "An error occurred. Please try again."}), error.http_status

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run the Flask app with optional debug mode.')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()

    if args.debug:
        logger.setLevel(logging.DEBUG)
        app.debug = True
        logger.debug("Debug mode is enabled")
    else:
        logger.setLevel(logging.INFO)
        app.debug = False
        logger.info("Running in production mode")

    # Silence other loggers
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('spotipy').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)

    app.run(host='0.0.0.0', port=PORT)