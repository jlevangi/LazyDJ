from flask import Blueprint, jsonify, current_app
from werkzeug.exceptions import HTTPException
from spotipy.exceptions import SpotifyException
import logging
import traceback  # Add this import at the top of the file

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
    @app.errorhandler(Exception)
    def handle_exception(e):
        # Pass HTTPExceptions to the default handler
        if isinstance(e, HTTPException):
            return e

        # Log the error
        logger.error(f'Unhandled Exception: {str(e)}', exc_info=True)

        # Now handle non-HTTP exceptions
        if current_app.config['DEBUG']:
            # In debug mode, return detailed error information
            return jsonify({
                "error": "Internal Server Error",
                "details": str(e),
                "type": str(type(e).__name__)
            }), 500
        else:
            # In production, return a generic error message
            return jsonify({"error": "An unexpected error occurred"}), 500

    app.register_blueprint(bp)