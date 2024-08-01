# sessions.py

from flask import Blueprint, render_template, redirect, url_for, request, jsonify, session, current_app
from app.models import Session, create_session, get_session, delete_session
from app.spotify_utils import get_token, get_spotify_oauth
import spotipy
from spotipy.exceptions import SpotifyException
import qrcode
from io import BytesIO
import base64
import json
import logging
from datetime import datetime

bp = Blueprint('sessions', __name__)
logger = logging.getLogger(__name__)

def create_session_playlist(sp):
    date_str = datetime.now().strftime("%Y-%m-%d")
    playlist_name = f"LazyDJ - {date_str}"
    user_id = sp.me()['id']
    logger.info(f"Attempting to create or find playlist: {playlist_name}")

    # Check if a playlist with this name already exists
    playlists = sp.current_user_playlists()
    existing_playlist = None
    while playlists:
        for playlist in playlists['items']:
            if playlist['name'] == playlist_name:
                existing_playlist = playlist
                break
        if existing_playlist:
            break
        if playlists['next']:
            playlists = sp.next(playlists)
        else:
            playlists = None

    if existing_playlist:
        logger.info(f"Found existing playlist: {playlist_name} (ID: {existing_playlist['id']})")
        return existing_playlist['id'], existing_playlist['name']
    else:
        try:
            logger.info(f"No existing playlist found. Creating new playlist: {playlist_name}")
            new_playlist = sp.user_playlist_create(user_id, playlist_name, public=False)
            logger.info(f"Created new playlist: {playlist_name} (ID: {new_playlist['id']})")
            return new_playlist['id'], new_playlist['name']
        except SpotifyException as e:
            logger.error(f"Error creating playlist: {str(e)}")
            return None, None

@bp.route('/create_session', methods=['POST'])
def create_new_session():
    token_info = get_token()
    if not token_info:
        logger.warning("No token info available when creating new session")
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    try:
        new_session = create_session(json.dumps(token_info))
        session['current_session_id'] = new_session.session_id
        logger.info(f"New session created with ID: {new_session.session_id}")

        # Create playlist for the new session
        sp = spotipy.Spotify(auth=token_info['access_token'])
        playlist_id, playlist_name = create_session_playlist(sp)  # Remove new_session.session_id
        if playlist_id and playlist_name:
            new_session.playlist_id = playlist_id
            new_session.playlist_name = playlist_name
            logger.info(f"Playlist created for session: {playlist_name}")
        else:
            logger.warning(f"Failed to create playlist for session {new_session.session_id}")
 
        redirect_url = url_for('sessions.session_view', 
                               session_id=new_session.session_id, 
                               _external=True, 
                               _scheme='https')
        
        response_data = {
            "status": "success",
            "session_id": new_session.session_id,
            "playlist_name": new_session.playlist_name,
            "redirect_url": redirect_url
        }
        logger.debug(f"Response data: {response_data}")
        
        return jsonify(response_data)
    except Exception as e:
        logger.error(f"Error creating new session: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error creating new session: {str(e)}"}), 500

@bp.route('/<session_id>')
def session_view(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return render_template('session_not_found.html'), 404

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(request.url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered)
    qr_code_base64 = base64.b64encode(buffered.getvalue()).decode()

    session['token_info'] = current_session.owner_token

    return render_template('session.html', session_id=session_id, qr_code_base64=qr_code_base64)

@bp.route('/session/<session_id>/token')
def get_session_token(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    return jsonify({"token": current_session.owner_token})

@bp.route('/session/<session_id>/search')
def session_search(session_id):
    query = request.args.get('query', '').strip()
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    token_info = json.loads(current_session.owner_token)
    if not token_info:
        return jsonify({"error": "Session owner not authenticated"}), 401

    sp = spotipy.Spotify(auth=token_info['access_token'])
    try:
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
        logger.error(f"Spotify API error in session search: {str(e)}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Unexpected error in session search: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/<session_id>/queue', methods=['POST'])
def session_queue(session_id):
    current_session = get_session(session_id)
    if not current_session:
        logger.warning(f"Session not found: {session_id}")
        return jsonify({"error": "Session not found"}), 404

    track_uri = request.form.get('track_uri')
    track_name = request.form.get('track_name')
    artist_name = request.form.get('artist_name')

    if not all([track_uri, track_name, artist_name]):
        logger.warning(f"Missing track information for session {session_id}")
        return jsonify({"error": "Missing track information"}), 400

    try:
        token_info = json.loads(current_session.owner_token)
        sp = spotipy.Spotify(auth=token_info['access_token'])
        
        # Add track to Spotify queue
        sp.add_to_queue(track_uri)
        
        # Add track to session queue and playlist
        track = {
            'uri': track_uri,
            'name': track_name,
            'artists': artist_name
        }
        current_session.add_to_queue(track)
        
        message = "Track added to session queue"
        if current_session.playlist_id:
            message += " and playlist"
        
        logger.info(f"{message}: {track_name} in session {session_id}")
        return jsonify({
            "status": "success", 
            "message": message,
            "track": track,
            "added_to_playlist": current_session.playlist_id is not None,
            "playlist_name": current_session.playlist_name
        })
    except SpotifyException as e:
        logger.error(f"Spotify API error adding track to session {session_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Error adding track to session {session_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@bp.route('/session/<session_id>/current_queue')
def session_current_queue(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    token_info = json.loads(current_session.owner_token)
    if not token_info:
        return jsonify({"error": "Session owner not authenticated"}), 401

    sp = spotipy.Spotify(auth=token_info['access_token'])
    
    try:
        queue_info = sp._get('me/player/queue')
        current_track = sp.currently_playing()

        user_queue = current_session.get_queue()
        radio_queue = [track for track in queue_info['queue'] if track['uri'] not in [t['uri'] for t in user_queue]]

        return jsonify({
            'current_track': {
                'name': current_track['item']['name'],
                'artists': ', '.join([artist['name'] for artist in current_track['item']['artists']])
            } if current_track and current_track['is_playing'] else None,
            'user_queue': user_queue,
            'radio_queue': radio_queue[:5]  # Limit to first 5 tracks
        })
    except Exception as e:
        logger.error(f"Error fetching queue for session {session_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/session/<session_id>/end', methods=['POST'])
def end_session(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    try:
        delete_session(session_id)
        logger.info(f"Session ended: {session_id}")
        return jsonify({"status": "success", "message": "Session ended successfully"})
    except Exception as e:
        logger.error(f"Error ending session {session_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500