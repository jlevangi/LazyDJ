import json
from termcolor import colored

def format_track_info(track):
    if not track:
        return "No track playing"
    return f"{track['name']} by {', '.join([artist['name'] for artist in track['artists']])}"

def format_queue(queue):
    return [f"{track['name']} by {track['artists']}" for track in queue]

def format_debug_output(data):
    output = []
    if 'current_track' in data:
        if data['current_track'] and 'item' in data['current_track']:
            output.append(colored(f"Current Track: {format_track_info(data['current_track']['item'])}", 'green'))
        else:
            output.append(colored("Current Track: No track playing", 'yellow'))
    
    if 'user_queue' in data:
        output.append(colored("User Queue:", 'yellow'))
        for track in format_queue(data['user_queue']):
            output.append(f"  - {track}")
    
    if 'radio_queue' in data:
        output.append(colored("Radio Queue:", 'blue'))
        for track in format_queue(data['radio_queue'][:5]):  # Limit to 5 tracks
            output.append(f"  - {track}")
    
    return "\n".join(output)