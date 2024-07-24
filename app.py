from flask import Flask
from flask_session import Session
from app import create_app
import argparse
import logging

app = create_app()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run the Flask app with optional debug mode.')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()

    if args.debug:
        app.debug = True
        logging.getLogger().setLevel(logging.DEBUG)
        app.logger.debug("Debug mode is enabled")
    else:
        app.debug = False
        logging.getLogger().setLevel(logging.INFO)
        app.logger.info("Running in production mode")

    app.run(host='0.0.0.0', port=app.config['PORT'])