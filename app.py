from flask import Flask, request, render_template, redirect, url_for, session, jsonify, send_from_directory
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import time
from flask_session import Session
import os
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

app = Flask(__name__)

app.secret_key = os.getenv('SECRET_KEY')

if app.debug:
    TIP_QR_CODE_PATH = '/static/tip-qr.png'
else:
    TIP_QR_CODE_PATH = os.environ.get('TIP_QR_CODE_PATH', '/qr/tip-qr.png')

def qr_code_exists():
    """Check if the QR code file exists."""
    if TIP_QR_CODE_PATH.startswith('/static/'):
        return os.path.exists(os.path.join(app.root_path, TIP_QR_CODE_PATH[1:]))
    return os.path.exists(TIP_QR_CODE_PATH)

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

@app.route('/search', methods=['GET', 'POST'])
def search():
    token_info = get_token()
    if not token_info:
        return redirect(url_for('index'))

    query = request.args.get('query')

    tracks = []
    if query:
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

    qr_code_available = qr_code_exists()
    
    return render_template('search.html', 
                           token=token_info['access_token'], 
                           tracks=track_info, 
                           tip_qr_code_path=TIP_QR_CODE_PATH if qr_code_available else None)


# Update the queue function to set a flag
@app.route('/queue', methods=['POST'])
def queue():
    token_info = get_token()
    if not token_info:
        return redirect(url_for('index'))

    track_uri = request.form['track_uri']
    current_time = time.time()
    
    # Check if track has been added within the last 20 minutes
    if track_uri in recent_tracks and current_time - recent_tracks[track_uri] < 1200:
        return jsonify({"status": "error", "message": "This track has already been added recently."})

    recent_tracks[track_uri] = current_time
    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        sp.add_to_queue(track_uri)
        return jsonify({"status": "success", "message": "Track added to queue!"})
    except spotipy.exceptions.SpotifyException as e:
        if e.http_status == 404 and 'NO_ACTIVE_DEVICE' in e.reason:
            return jsonify({"status": "error", "message": "No active device found. Please play a song on Spotify and try again."})
        else:
            return jsonify({"status": "error", "message": "An error occurred. Please try again."})
        
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
            return jsonify({"status": "error", "message": "An error occurred. Please try again."})


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
    app.run(host='0.0.0.0', port=5000, debug=True)
