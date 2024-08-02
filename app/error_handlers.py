# error_handlers.py

from flask import Blueprint, jsonify, current_app, request
from werkzeug.exceptions import HTTPException
from spotipy.exceptions import SpotifyException
import logging
import traceback

bp = Blueprint('errors', __name__)
logger = logging.getLogger(__name__)

@bp.app_errorhandler(404)
def not_found_error(error):
    if request.path.startswith('/session/'):
        # This is already handled in the routes, so we don't need to do anything here
        return error
    logger.error(f'Not Found: {error}')
    return jsonify({"error": "Not Found"}), 404

@bp.app_errorhandler(500)
def internal_error(error):
    logger.error(f'Server Error: {error}')
    return jsonify({"error": "Internal Server Error"}), 500

@bp.app_errorhandler(Exception)
def handle_unexpected_error(error):
    logger.error(f'Unexpected Error: {error}')
    logger.error(traceback.format_exc())
    if current_app.debug:
        # In debug mode, return the error details
        return jsonify({
            "error": str(error),
            "traceback": traceback.format_exc()
        }), 500
    return jsonify({"error": "An unexpected error occurred"}), 500

@bp.app_errorhandler(SpotifyException)
def handle_spotify_exception(error):
    logger.error(f'Spotify API Error: {error}')
    if error.http_status == 401:
        # Token has expired
        return jsonify({"error": "Spotify authentication has expired. Please log in again."}), 401
    elif error.http_status == 404 and 'NO_ACTIVE_DEVICE' in str(error):
        return jsonify({"error": "No active Spotify device found. Please open Spotify on a device and try again."}), 404
    else:
        return jsonify({"error": f"Spotify API error: {str(error)}"}), error.http_status

@bp.app_errorhandler(HTTPException)
def handle_http_exception(error):
    logger.error(f'HTTP Exception: {error}')
    response = jsonify({"error": str(error.description)})
    response.status_code = error.code
    return response

def init_app(app):
    # Register the error handlers directly on the app
    app.register_error_handler(404, not_found_error)
    app.register_error_handler(500, internal_error)
    app.register_error_handler(Exception, handle_unexpected_error)
    app.register_error_handler(SpotifyException, handle_spotify_exception)
    app.register_error_handler(HTTPException, handle_http_exception)