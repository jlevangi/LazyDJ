from flask import Blueprint, render_template, redirect, url_for, request, jsonify, session, current_app
from app.models import create_session, get_session, delete_session
from app.spotify_utils import get_token, get_spotify_oauth, format_track_info
import spotipy

bp = Blueprint('sessions', __name__)

@bp.route('/create', methods=['POST'])
def create_new_session():
    token_info = get_token()
    if not token_info:
        return jsonify({"error": "Not authenticated"}), 401

    new_session = create_session(token_info['access_token'])
    return jsonify({"session_id": new_session.session_id})

@bp.route('/<session_id>')
def join_session(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return render_template('error.html', message="Session not found"), 404

    return render_template('session.html', session_id=session_id)

@bp.route('/<session_id>/queue', methods=['POST'])
def add_to_session_queue(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    track_uri = request.form.get('track_uri')
    track_name = request.form.get('track_name')
    artist_name = request.form.get('artist_name')

    if not all([track_uri, track_name, artist_name]):
        return jsonify({"error": "Missing track information"}), 400

    track = {
        'uri': track_uri,
        'name': track_name,
        'artists': artist_name
    }
    current_session.add_to_queue(track)

    return jsonify({"status": "success", "message": "Track added to session queue"})

@bp.route('/<session_id>/queue', methods=['GET'])
def get_session_queue(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    return jsonify({"queue": current_session.get_queue()})

@bp.route('/<session_id>/search', methods=['GET', 'POST'])
def session_search(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return render_template('error.html', message="Session not found"), 404

    query = request.args.get('query')
    tracks = []
    if query:
        sp = spotipy.Spotify(auth=current_session.owner_id)
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

    return render_template('session_search.html', 
                           session_id=session_id,
                           tracks=track_info)