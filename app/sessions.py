# sessions.py

from flask import Blueprint, render_template, redirect, url_for, request, jsonify, session as flask_session, current_app
from app.models import Session, create_session, get_session, delete_session
from app.spotify_utils import get_token, get_spotify_oauth
from app.log_utils import format_debug_output
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
    logger.info(f"Attempting to create or find playlist: {playlist_name} for user: {user_id}")

    offset = 0
    limit = 50  # Maximum allowed by Spotify API
    total_playlists = None
    playlists_checked = 0

    while True:
        logger.info(f"Fetching playlists: offset={offset}, limit={limit}")
        try:
            playlists = sp.user_playlists(user_id, limit=limit, offset=offset)
            logger.debug(f"API Response: Total: {playlists['total']}, Items: {len(playlists['items'])}")
        except Exception as e:
            logger.error(f"Error fetching playlists: {str(e)}")
            break

        if total_playlists is None:
            total_playlists = playlists['total']
            logger.info(f"Total playlists reported by Spotify: {total_playlists}")

        for playlist in playlists['items']:
            playlists_checked += 1
            logger.debug(f"Checking playlist {playlists_checked}/{total_playlists}: {playlist['name']} (ID: {playlist['id']}, Public: {playlist['public']})")
            if playlist['name'] == playlist_name:
                logger.info(f"Found existing playlist: {playlist_name} (ID: {playlist['id']}, Public: {playlist['public']})")
                return playlist['id'], playlist['name']

        if len(playlists['items']) < limit or playlists_checked >= total_playlists:
            logger.info(f"Checked all {playlists_checked} playlists. No match found.")
            break

        offset += limit
        logger.debug(f"Moving to next page. New offset: {offset}")

    # If we've checked all playlists and haven't found a match, create a new one
    logger.info(f"No existing playlist found. Creating new public playlist: {playlist_name}")
    try:
        new_playlist = sp.user_playlist_create(user_id, playlist_name, public=True)
        logger.info(f"Successfully created new public playlist: {playlist_name} (ID: {new_playlist['id']})")
        return new_playlist['id'], new_playlist['name']
    except SpotifyException as e:
        logger.error(f"Spotify API error creating playlist: {str(e)}")
        return None, None
    except Exception as e:
        logger.error(f"Unexpected error creating playlist: {str(e)}")
        return None, None

@bp.route('/create_session', methods=['POST'])
def create_new_session():
    token_info = get_token()
    if not token_info:
        logger.warning("No token info available when creating new session")
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    try:
        sp = spotipy.Spotify(auth=token_info['access_token'])
        
        # First, try to find or create the playlist
        playlist_id, playlist_name = create_session_playlist(sp)
        if not playlist_id or not playlist_name:
            logger.error("Failed to create or find playlist")
            return jsonify({"status": "error", "message": "Failed to create or find playlist"}), 500

        # Now create the session
        new_session = create_session(json.dumps(token_info))
        flask_session['current_session_id'] = new_session.session_id
        logger.info(f"New session created with ID: {new_session.session_id}")

        # Associate the playlist with the session
        new_session.playlist_id = playlist_id
        new_session.playlist_name = playlist_name
        logger.info(f"Session {new_session.session_id} associated with playlist: {playlist_name} (ID: {playlist_id})")
 
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

    # Store the session ID and owner's token in the user's session
    flask_session['current_session_id'] = session_id
    flask_session['token_info'] = current_session.owner_token

    return render_template('session.html', session_id=session_id, qr_code_base64=qr_code_base64)

@bp.route('/session/<session_id>/token')
def get_session_token(session_id):
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    # Store the session ID and owner's token in the user's session
    flask_session['current_session_id'] = session_id
    flask_session['token_info'] = current_session.owner_token

    return jsonify({"token": current_session.owner_token})

@bp.route('/session/<session_id>/join', methods=['POST'])
def join_session(session_id):
    """Register a new participant when they join a session"""
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    # Check if participant already exists (from session storage)
    existing_participant_id = flask_session.get(f'participant_id_{session_id}')
    
    if existing_participant_id and existing_participant_id in current_session.participants:
        # Return existing participant info
        participant_info = current_session.participants[existing_participant_id]
        logger.info(f"Returning existing participant {existing_participant_id} for session {session_id}")
    else:
        # Create new participant
        participant_info = current_session.add_participant()
        # Store participant ID in user's session for future requests
        flask_session[f'participant_id_{session_id}'] = participant_info['id']
        logger.info(f"Created new participant {participant_info['id']} for session {session_id}")

    return jsonify({
        "participant": participant_info,
        "participant_count": current_session.get_participant_count()
    })

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

@bp.route('/session/<session_id>/recommendations')
def session_recommendations(session_id):
    """Get recommendations for a session (used for search autocomplete)"""
    query = request.args.get('query', '').strip()
    current_session = get_session(session_id)
    if not current_session:
        return jsonify({"error": "Session not found"}), 404

    if not query:
        return jsonify([])

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
                'uri': track['uri']
            }
            track_info.append(track_data)

        return jsonify(track_info)
    except SpotifyException as e:
        logger.error(f"Spotify API error in session recommendations: {str(e)}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Unexpected error in session recommendations: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/session/<session_id>/queue', methods=['POST'])
def session_queue(session_id):
    logger.info(f"Session queue request received for session: {session_id}")
    current_session = get_session(session_id)
    if not current_session:
        logger.warning(f"Session not found: {session_id}")
        return jsonify({"error": "Session not found"}), 404

    track_uri = request.form.get('track_uri')
    track_name = request.form.get('track_name')
    artist_name = request.form.get('artist_name')
    participant_id = request.form.get('participant_id')  # New field for participant tracking

    logger.info(f"Attempting to add track to session {session_id}: {track_name} by {artist_name} (URI: {track_uri}) from participant: {participant_id}")

    if not all([track_uri, track_name, artist_name]):
        logger.warning(f"Missing track information for session {session_id}")
        return jsonify({"error": "Missing track information"}), 400

    try:
        token_info = json.loads(current_session.owner_token)
        sp = spotipy.Spotify(auth=token_info['access_token'])
        
        # Log initial state
        initial_state = {
            'session_id': session_id,
            'playlist_id': current_session.playlist_id,
            'playlist_name': current_session.playlist_name,
            'current_queue': current_session.get_queue()
        }
        logger.debug(f"Initial state:\n{format_debug_output(initial_state)}")
        
        # Add track to Spotify queue
        logger.info(f"Adding track to Spotify queue: {track_name}")
        sp.add_to_queue(track_uri)
        logger.info(f"Successfully added to Spotify queue: {track_name}")
        
        # Add track to session queue
        track = {
            'uri': track_uri,
            'name': track_name,
            'artists': artist_name
        }
        current_session.add_to_queue(track, participant_id)
        logger.info(f"Added track to session queue: {track_name}")
        
        # Add track to playlist if playlist exists
        playlist_addition_success = False
        if current_session.playlist_id:
            logger.info(f"Attempting to add track to playlist: {current_session.playlist_id}")
            try:
                sp.user_playlist_add_tracks(sp.me()['id'], current_session.playlist_id, [track_uri])
                logger.info(f"Successfully added track {track_name} to playlist {current_session.playlist_id}")
                playlist_addition_success = True
            except Exception as playlist_error:
                logger.error(f"Error adding track to playlist: {str(playlist_error)}")
        else:
            logger.warning(f"No playlist associated with session {session_id}")
        
        # Log final state
        final_state = {
            'session_id': session_id,
            'playlist_id': current_session.playlist_id,
            'playlist_name': current_session.playlist_name,
            'current_queue': current_session.get_queue(),
            'added_to_playlist': playlist_addition_success
        }
        logger.debug(f"Final state:\n{format_debug_output(final_state)}")
        
        message = "Track added to session queue"
        if playlist_addition_success:
            message += " and playlist"
        
        logger.info(f"{message}: {track_name} in session {session_id}")
        return jsonify({
            "status": "success", 
            "message": message,
            "track": track,
            "added_to_playlist": playlist_addition_success,
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
            'radio_queue': radio_queue[:5],  # Limit to first 5 tracks
            'participants': current_session.participants,
            'participant_count': current_session.get_participant_count()
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
    
@bp.route('/create_session_playlist', methods=['POST'])
def create_session_playlist_route():
    logger.info("Create session playlist request received")
    try:
        # Get the current session ID from the session
        current_session_id = flask_session.get('current_session_id')
        if not current_session_id:
            raise ValueError("No active session found")

        current_session = get_session(current_session_id)
        if not current_session:
            raise ValueError("Session not found")

        token_info = json.loads(current_session.owner_token)
        sp = spotipy.Spotify(auth=token_info['access_token'])

        # Check if a playlist already exists for this session
        if current_session.playlist_id:
            logger.info(f"Playlist already exists for session {current_session_id}")
            return jsonify({
                "status": "success",
                "playlist_id": current_session.playlist_id,
                "playlist_name": current_session.playlist_name,
                "message": "Playlist already exists for this session"
            })

        # Create a new playlist
        playlist_id, playlist_name = create_session_playlist(sp)
        
        if not playlist_id or not playlist_name:
            raise ValueError("Failed to create playlist")

        # Update the session with the new playlist information
        current_session.playlist_id = playlist_id
        current_session.playlist_name = playlist_name

        logger.info(f"Playlist created successfully: {playlist_name} (ID: {playlist_id})")
        return jsonify({
            "status": "success",
            "playlist_id": playlist_id,
            "playlist_name": playlist_name
        })
    except Exception as e:
        logger.error(f"Error creating playlist: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

        