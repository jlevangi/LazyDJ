<div align="center">
  <img src="https://github.com/JPLeVangie/LazyDJ/assets/47614776/97bc8f4e-a74d-4738-8de2-2b18ca785af9" height="200"/>
</div>
<h1 align="center" style="margin-top: -10px"> The Lazy DJ! </h1>

## What is The Lazy DJ
Lazy DJ is a web application that allows users to search for and queue songs on Spotify, creating a collaborative playlist experience. It's perfect for parties, gatherings, or any situation where you want to give others control over the music without handing over your device.
The app is built with Flask and can be run as a Progressive Web App (PWA).

![image](https://github.com/JPLeVangie/LazyDJ/assets/47614776/db85237b-afcf-4a1d-9966-715e5ad6c45d)




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
   git clone https://github.com/JPLeVangie/LazyDJ.git
   cd lazy-dj
   ```

2. Create a virtual environment:
   ```
   python3 -m venv venv
   ```

3. Activate the virtual environment:
   - On Windows:
     ```
     venv\Scripts\activate
     ```
   - On macOS and Linux:
     ```
     source venv/bin/activate
     ```

4. Install the required packages:
   ```
   pip install -r requirements.txt
   ```
   NOTE: You may need to add Flask to your `$PATH` variable: `export PATH=$PATH:/home/USERNAME/.local/bin`

5. Set up your environment variables. Create a `.env` file in the root directory with the following contents ([example.env provided](./example.env)):
    ```
    SPOTIPY_CLIENT_ID=your_spotify_client_id
    SPOTIPY_CLIENT_SECRET=your_spotify_client_secret
    SPOTIPY_REDIRECT_URI=your_redirect_uri
    SECRET_KEY=your_flask_secret_key
    TIP_QR_CODE_PATH=/tip-qr.png #Optional
    ```

### Usage

1. Ensure your virtual environment is activated.

2. Start the Application:
   ```
   python3 .\app.py
   ```

3. Open a web browser and navigate to `http://localhost:5000`

4. Log in with your Spotify account

5. Start playing music from any Spotify clien

6. Search for songs and add them to the queue

### Development

To run the app in development mode with debug features enabled:

```
python3 .\app.py --debug
```

For testing the QR code feature during development:
1. Place a test QR code image in the `static` folder (e.g., `static/tip-qr.png`)
2. Set the `TIP_QR_CODE_PATH` in your `.env` file to `/static/tip-qr.png`

## Using Docker

### Option 1: Build from source

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

3. Build the Docker image:
   ```bash
   docker-compose build
   ```

4. Run the Docker container:
   ```bash
   docker-compose up
   ```

### Option 2: Pull from Docker Hub

1. Create a `.env` file as described in step 2 of Option 1.

2. Create or modify the `docker-compose.yml` file to use the pre-built image:
   ```yaml
   version: '3'
   services:
     web:
       image: jlevangie/lazydj:latest
       container_name: lazydj
       ports:
         - "5000:5000"
       env_file:
         - .env
       environment:
         - SECRET_KEY=${SECRET_KEY}
         - SPOTIPY_CLIENT_ID=${SPOTIPY_CLIENT_ID}
         - SPOTIPY_CLIENT_SECRET=${SPOTIPY_CLIENT_SECRET}
         - SPOTIPY_REDIRECT_URI=${SPOTIPY_REDIRECT_URI}
       volumes:
         - app:/app
       restart: unless-stopped
   volumes:
     app:

   ```

3. Pull and run the Docker container:
   ```bash
   docker-compose up
   ```

### Accessing the Application

After following either option, open your browser and go to `http://localhost:5000` to access LazyDJ.

## PWA Features

To enable PWA features, the app includes a `manifest.json` and a `service-worker.js` file. When you open the app in a browser, you should see an option to install it as a web app. This allows for a native app-like experience, including being able to launch the app in full-screen mode.

## Contributing

Contributions to Lazy DJ are welcome. Please feel free to submit a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgements

- [Greybeard](https://github.com/strickdd) for the inspiration and support!
- [Spotipy](https://spotipy.readthedocs.io/) for Spotify API integration
- [Flask](https://flask.palletsprojects.com/) for the web framework
