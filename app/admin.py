from flask import Blueprint, request, jsonify, session, current_app
import logging

bp = Blueprint('admin', __name__)
logger = logging.getLogger(__name__)

def check_if_admin(query=None):
    """
    Check if the user is an admin.
    If a query is provided, check if it matches the admin keyword.
    Otherwise, check the session for admin status.
    """
    if query:
        return query.lower() == current_app.config['ADMIN_KEYWORD']
    return session.get('admin', False)

@bp.route('/check_admin', methods=['POST'])
def check_admin():
    query = request.form.get('query', '').lower()
    is_admin = check_if_admin(query)
    if is_admin:
        session['admin'] = True
        logger.info("Admin mode activated")
    else:
        session.pop('admin', None)
        logger.debug("Admin mode not activated")
    return jsonify({"is_admin": is_admin})

@bp.route('/check_admin_status', methods=['GET'])
def check_admin_status():
    is_admin = check_if_admin()
    return jsonify({"is_admin": is_admin})

@bp.route('/deactivate_admin', methods=['POST'])
def deactivate_admin():
    logger.info("Deactivate admin route called")
    if 'admin' in session:
        session.pop('admin', None)
        logger.info("Admin key removed from session")
        return jsonify({"status": "success", "message": "Admin mode deactivated"})
    else:
        logger.info("Admin key not found in session")
        return jsonify({"status": "error", "message": "Not in admin mode"})

@bp.route('/admin_actions', methods=['POST'])
def admin_actions():
    if not check_if_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    action = request.json.get('action')
    if action == 'clear_queue':
        # Implement clear queue functionality
        # This is a placeholder - you'll need to implement the actual functionality
        logger.info("Admin action: Clearing queue")
        return jsonify({"status": "success", "message": "Queue cleared"})
    elif action == 'skip_track':
        # Implement skip track functionality
        # This is a placeholder - you'll need to implement the actual functionality
        logger.info("Admin action: Skipping track")
        return jsonify({"status": "success", "message": "Track skipped"})
    else:
        return jsonify({"status": "error", "message": "Unknown action"}), 400

@bp.route('/admin_dashboard')
def admin_dashboard():
    if not check_if_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    # Implement admin dashboard functionality
    # This is a placeholder - you'll need to implement the actual functionality
    logger.info("Admin accessed dashboard")
    return jsonify({
        "status": "success",
        "data": {
            "total_tracks_played": 100,  # placeholder value
            "most_requested_track": "Song Name by Artist",  # placeholder value
            "active_users": 10  # placeholder value
        }
    })