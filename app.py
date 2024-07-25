from flask import Flask
from flask_session import Session
from config import Config
import logging
import argparse
from logging.handlers import RotatingFileHandler
import os

def create_app(config_class=Config):
    app = Flask(__name__, 
                template_folder=os.path.abspath('app/templates'), 
                static_folder=os.path.abspath('app/static'))
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

    from app.sessions import bp as sessions_bp
    app.register_blueprint(sessions_bp, url_prefix='/session')

    # Import and register error handlers
    from app.error_handlers import bp as errors_bp
    app.register_blueprint(errors_bp)

    return app

# Import models at the bottom to avoid circular imports
from app import models

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run the Flask app with optional debug mode.')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()

    app = create_app()
    
    if args.debug:
        app.debug = True
        app.logger.setLevel(logging.DEBUG)
        app.logger.debug("Debug mode is enabled")
    else:
        app.debug = False
        app.logger.setLevel(logging.INFO)
        app.logger.info("Running in production mode")

    app.run(host='0.0.0.0', port=app.config['PORT'])
