# The Lazy DJ

Lazy DJ is a web application that allows users to search for and queue songs on Spotify, creating a collaborative playlist experience. It's perfect for parties, gatherings, or any situation where you want to give others control over the music without handing over your device.
The app is built with Flask and can be run as a Progressive Web App (PWA).

## Features

- Search for songs on Spotify
- Add songs to the current Spotify queue
- View the current playing track and upcoming queue
- Prevent duplicate song additions within a time frame
- Responsive design and PWA capabilities for a native app-like experience.

## Requirements

Before you begin, ensure you have met the following requirements:
- Python 3.7+
    ```Bash
    sudo apt install python3
    sudo apt install python3-pip
    ```
- A [Spotify Developer account](https://developer.spotify.com/) and [application](https://developer.spotify.com/dashboard/create)
    - Set "redirect URL" to be http://localhost:5000/callback for easy Docker deploy or create a custom DNS entry
    - Check `Web API`
    - Check `Web Playback SDK`
- Docker (optional, for containerized deployment)

## Installation

### Using a Virtual Environment

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/lazy-dj.git
   cd lazy-dj
   ```

2. Install the required packages:
   ```
   pip install -r requirements.txt
   ```
   1. NOTE: You may need to add Flask to your `$PATH` variable: `export PATH=$PATH:/home/USERNAME/.local/bin`

3. Set up your environment variables. Create a `.env` file in the root directory with the following contents ([example.env provided](./example.env)):
    ```
    SPOTIPY_CLIENT_ID=your_spotify_client_id
    SPOTIPY_CLIENT_SECRET=your_spotify_client_secret
    SPOTIPY_REDIRECT_URI=your_redirect_uri
    SECRET_KEY=your_flask_secret_key
    TIP_QR_CODE_PATH=/tip-qr.png #Optional
    ```

4. Create a `.env` file in the root directory of the project and add your Spotify API credentials:
    <!-- I'm confused by needing 2 .env files and where they actually go. -->
    ```dotenv
    SECRET_KEY=your_secret_key
    SPOTIPY_CLIENT_ID=your_spotify_client_id
    SPOTIPY_CLIENT_SECRET=your_spotify_client_secret
    SPOTIPY_REDIRECT_URI=your_spotify_redirect_uri
    TIP_QR_CODE_PATH=/tip-qr.png #Optional
    ```
## Usage

1. Start the Flask server:
   ```
   flask run
   ```

2. Open a web browser and navigate to `http://localhost:5000`

3. Log in with your Spotify account

4. Search for songs and add them to the queue

5. (Optional) Set up a device to play the Spotify queue

## Development

To run the app in development mode with debug features enabled:

```
flask run --debug
```

For testing the QR code feature during development:
1. Place a test QR code image in the `static` folder (e.g., `static/tip-qr.png`)
2. Set the `TIP_QR_CODE_PATH` in your `.env` file to `/static/tip-qr.png`

## Deployment

1. Ensure all environment variables are properly set.

### Using Docker

1. Clone the repository:

    ```bash
    git clone https://github.com/JLeVangie/LazyDJ.git
    cd LazyDJ
    ```

2. Create a `.env` file in the root directory of the project and add your Spotify API credentials:

    ```dotenv
    SECRET_KEY=your_secret_key
    SPOTIPY_CLIENT_ID=your_spotify_client_id
    SPOTIPY_CLIENT_SECRET=your_spotify_client_secret
    SPOTIPY_REDIRECT_URI=your_spotify_redirect_uri
    TIP_QR_CODE_PATH=/tip-qr.png #Optional
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


## Contributing

Contributions to Lazy DJ are welcome. Please feel free to submit a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgements

- [Spotipy](https://spotipy.readthedocs.io/) for Spotify API integration
- [Flask](https://flask.palletsprojects.com/) for the web framework
