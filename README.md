# The Lazy DJ

The Lazy DJ is a web application that allows users to search for songs and add them to their Spotify queue. The app is built with Flask and can be run as a Progressive Web App (PWA).

## Features

- Search for songs and add them to your Spotify queue.
- View the next songs in your queue.
- Responsive design and PWA capabilities for a native app-like experience.

## Requirements

- Python 3.9+
- Docker (optional, for containerized deployment)

## Installation

### Using a Virtual Environment

1. Clone the repository:

    ```bash
    git clone https://github.com/JLeVangie/LazyDJ.git
    cd LazyDJ
    ```

2. Create and activate a virtual environment:

    ```bash
    python3 -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3. Install the dependencies:

    ```bash
    pip install -r requirements.txt
    ```

4. Create a `.env` file in the root directory of the project and add your Spotify API credentials:

    ```dotenv
    SECRET_KEY=your_secret_key
    SPOTIPY_CLIENT_ID=your_spotify_client_id
    SPOTIPY_CLIENT_SECRET=your_spotify_client_secret
    SPOTIPY_REDIRECT_URI=your_spotify_redirect_uri
    ```

5. Run the application:

    ```bash
    flask run
    ```

6. Open your browser and go to `http://localhost:5000`.

### Using Docker

1. Clone the repository:

    ```bash
    git clone https://github.com/your-username/spotify-queue-manager.git
    cd spotify-queue-manager
    ```

2. Create a `.env` file in the root directory of the project and add your Spotify API credentials:

    ```dotenv
    SECRET_KEY=your_secret_key
    SPOTIPY_CLIENT_ID=your_spotify_client_id
    SPOTIPY_CLIENT_SECRET=your_spotify_client_secret
    SPOTIPY_REDIRECT_URI=your_spotify_redirect_uri
    ```

3. Build and run the Docker container:

    ```bash
    docker-compose build
    docker-compose up
    ```

4. Open your browser and go to `http://localhost:5000`.

## PWA Features

To enable PWA features, the app includes a `manifest.json` and a `service-worker.js` file. When you open the app in a browser, you should see an option to install it as a web app. This allows for a native app-like experience, including being able to launch the app in full-screen mode.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
