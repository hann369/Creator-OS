"""
Quick test: can Vercel's Python runtime reach YouTube caption track URLs?
Deploy this as a test endpoint to check if InnerTube caption fetch works from cloud IPs.
"""
from fastapi import FastAPI
import httpx

app = FastAPI()

INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
PLAYER_URL = f'https://www.youtube.com/youtubei/v1/player?key={INNERTUBE_KEY}'
WEB_CONTEXT = {'client': {'clientName': 'WEB', 'clientVersion': '2.20240826.01.00', 'hl': 'en'}}

@app.get('/test/{video_id}')
async def test_transcript(video_id: str):
    """Test all transcript fetch methods for a video."""
    results = {}

    # Step 1: InnerTube player to get caption track URLs
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.post(PLAYER_URL,
                json={'context': WEB_CONTEXT, 'videoId': video_id},
                headers={'Content-Type': 'application/json'})
            data = r.json()
            tracks = data.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
            results['innertube_status'] = r.status_code
            results['tracks_found'] = len(tracks)

            if tracks:
                track = tracks[0]
                results['track_url_prefix'] = track['baseUrl'][:80]

                # Step 2: Try fetching the caption track directly
                try:
                    cr = await client.get(track['baseUrl'] + '&fmt=json3',
                        headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9'})
                    results['caption_fetch_status'] = cr.status_code
                    if cr.status_code == 200:
                        cdata = cr.json()
                        events = cdata.get('events', [])
                        text = ' '.join(
                            seg.get('utf8', '') for e in events[:5] for seg in e.get('segs', [])
                        ).strip()
                        results['caption_sample'] = text[:200] if text else '(empty)'
                    else:
                        results['caption_body'] = cr.text[:200]
                except Exception as e:
                    results['caption_error'] = str(e)[:200]
        except Exception as e:
            results['innertube_error'] = str(e)[:200]

    # Step 3: youtube-transcript-api
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        ytt = YouTubeTranscriptApi()
        tlist = ytt.list(video_id)
        first = next(iter(tlist))
        fetched = first.fetch()
        text = ' '.join(s.text for s in fetched[:5])
        results['ytt_api'] = 'OK: ' + text[:200]
    except Exception as e:
        results['ytt_api_error'] = str(e)[:300]

    return results
