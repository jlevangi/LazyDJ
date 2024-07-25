import os
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

class Config:
    # Flask settings
    SECRET_KEY = os.getenv('SECRET_KEY')
    SESSION_TYPE = 'filesystem'

    # Spotify API settings
    SPOTIPY_CLIENT_ID = os.getenv('SPOTIPY_CLIENT_ID')
    SPOTIPY_CLIENT_SECRET = os.getenv('SPOTIPY_CLIENT_SECRET')
    SPOTIPY_REDIRECT_URI = os.getenv('SPOTIPY_REDIRECT_URI')

    # Admin settings
    ADMIN_KEYWORD = os.getenv('ADMIN_KEYWORD')

    # Application settings
    PORT = int(os.getenv('PORT', 5000))
    TIP_QR_CODE_PATH = '/static/tip-qr.png'

    # Spotify API scope
    SPOTIFY_SCOPE = 'user-modify-playback-state user-read-playback-state'

    # Debug mode (set to False in production)
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')

    # Cooldown period for tracks (in seconds)
    TRACK_COOLDOWN_PERIOD = 1200  # 20 minutes

    # Logging configuration
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

    # Session expiration time (in seconds)
    SESSION_EXPIRATION_TIME = 24 * 60 * 60  # 24 hours in seconds