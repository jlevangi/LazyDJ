from flask import Flask
from flask_session import Session
from config import Config
import logging
from logging.handlers import RotatingFileHandler
import os

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize Flask-Session
    Session(app)

    # Configure logging
    if not app.debug:
        if not os.path.exists('logs'):
            os.mkdir('logs')
        file_handler = RotatingFileHandler('logs/lazydj.log', maxBytes=10240, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)

    app.logger.setLevel(logging.INFO)
    app.logger.info('LazyDJ startup')

    # Import and register blueprints
    from app.routes import bp as routes_bp
    app.register_blueprint(routes_bp)

    from app.admin import bp as admin_bp
    app.register_blueprint(admin_bp)

    # Import and register error handlers
    from app.error_handlers import bp as errors_bp
    app.register_blueprint(errors_bp)

    return app

# Import models at the bottom to avoid circular imports
from app import models