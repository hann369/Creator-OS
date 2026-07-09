"""
Pronoia Transcript API — self-hosted, Vercel Serverless (Python runtime).

Compatible with our HttpTranscriptSource contract:
  POST /api  { "url": "<youtube-url-or-video-id>" }
  → 200      { "url": "...", "transcript": "...", "language": "en" }
  → 404      { "detail": "No transcript available for this video" }
  → 422      { "detail": "Invalid YouTube URL or video ID" }

Supports:
  - https://www.youtube.com/watch?v=VIDEO_ID
  - https://youtu.be/VIDEO_ID
  - https://www.youtube.com/shorts/VIDEO_ID
  - Raw video IDs (e.g. "dQw4w9WgXcQ")

Note on IP bans: YouTube blocks cloud provider IPs. Set WEBSHARE_PROXY_USERNAME +
WEBSHARE_PROXY_PASSWORD in your Vercel env vars to route through rotating
residential proxies (https://www.webshare.io). Without proxies the service still
works but may get 429s under heavy load.
"""

import os
import re
from urllib.parse import urlparse, parse_qs

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled, VideoUnavailable

# ── optional proxy support (Webshare rotating residential) ───────────────────
try:
    from youtube_transcript_api.proxies import WebshareProxyConfig, GenericProxyConfig

    _PROXY_USERNAME = os.environ.get("WEBSHARE_PROXY_USERNAME")
    _PROXY_PASSWORD = os.environ.get("WEBSHARE_PROXY_PASSWORD")
    _PROXY_HTTP = os.environ.get("PROXY_HTTP_URL")
    _PROXY_HTTPS = os.environ.get("PROXY_HTTPS_URL")

    if _PROXY_USERNAME and _PROXY_PASSWORD:
        _proxy_cfg = WebshareProxyConfig(
            proxy_username=_PROXY_USERNAME,
            proxy_password=_PROXY_PASSWORD,
        )
    elif _PROXY_HTTP and _PROXY_HTTPS:
        _proxy_cfg = GenericProxyConfig(http_url=_PROXY_HTTP, https_url=_PROXY_HTTPS)
    else:
        _proxy_cfg = None
except ImportError:
    _proxy_cfg = None

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Pronoia Transcript API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Optional API key guard — set TRANSCRIPT_API_SECRET in Vercel env to require it.
_API_SECRET = os.environ.get("TRANSCRIPT_API_SECRET")


# ── helpers ───────────────────────────────────────────────────────────────────
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{11}$")


def extract_video_id(raw: str) -> str | None:
    """Extract an 11-char YouTube video ID from a URL or bare ID string."""
    raw = raw.strip()

    # Bare video ID
    if _VIDEO_ID_RE.match(raw):
        return raw

    try:
        parsed = urlparse(raw)
    except Exception:
        return None

    # https://youtu.be/VIDEO_ID
    if parsed.netloc in ("youtu.be",):
        vid = parsed.path.lstrip("/").split("/")[0]
        return vid if _VIDEO_ID_RE.match(vid) else None

    # https://www.youtube.com/watch?v=VIDEO_ID
    if "youtube.com" in parsed.netloc:
        # /watch?v=...
        qs = parse_qs(parsed.query)
        if "v" in qs:
            vid = qs["v"][0]
            return vid if _VIDEO_ID_RE.match(vid) else None

        # /shorts/VIDEO_ID  or  /embed/VIDEO_ID  or  /v/VIDEO_ID
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("shorts", "embed", "v"):
            vid = parts[1]
            return vid if _VIDEO_ID_RE.match(vid) else None

    return None


def build_ytt_api() -> YouTubeTranscriptApi:
    if _proxy_cfg:
        return YouTubeTranscriptApi(proxy_config=_proxy_cfg)
    return YouTubeTranscriptApi()


# ── request / response models ─────────────────────────────────────────────────
class TranscriptRequest(BaseModel):
    url: str
    languages: list[str] = ["en", "de", "fr", "es", "pt", "it", "ja", "ko", "zh"]


class TranscriptResponse(BaseModel):
    url: str
    video_id: str
    transcript: str
    language: str
    language_code: str
    is_generated: bool


# ── routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "proxy": bool(_proxy_cfg)}


@app.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(req: TranscriptRequest, authorization: str | None = None):
    # Optional auth guard
    if _API_SECRET:
        token = (authorization or "").removeprefix("Bearer ").strip()
        if token != _API_SECRET:
            raise HTTPException(status_code=401, detail="Unauthorized")

    video_id = extract_video_id(req.url)
    if not video_id:
        raise HTTPException(status_code=422, detail=f"Invalid YouTube URL or video ID: {req.url!r}")

    ytt = build_ytt_api()
    try:
        transcript_list = ytt.list(video_id)
    except TranscriptsDisabled:
        raise HTTPException(status_code=404, detail="Transcripts are disabled for this video")
    except VideoUnavailable:
        raise HTTPException(status_code=404, detail="Video is unavailable or private")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"YouTube API error: {str(e)[:200]}")

    # Try requested languages first, then fall back to any available transcript
    transcript_obj = None
    for try_languages in [req.languages, None]:
        try:
            if try_languages:
                transcript_obj = transcript_list.find_transcript(try_languages)
            else:
                # Last resort: grab the first available transcript
                transcript_obj = next(iter(transcript_list))
            break
        except (NoTranscriptFound, StopIteration):
            continue

    if transcript_obj is None:
        raise HTTPException(status_code=404, detail="No transcript available for this video")

    try:
        fetched = transcript_obj.fetch()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch transcript: {str(e)[:200]}")

    # Join all snippet texts into a single clean string
    full_text = " ".join(
        snippet.text.replace("\n", " ").strip()
        for snippet in fetched
        if snippet.text and snippet.text.strip()
    )

    canonical_url = f"https://www.youtube.com/watch?v={video_id}"

    return TranscriptResponse(
        url=canonical_url,
        video_id=video_id,
        transcript=full_text,
        language=transcript_obj.language,
        language_code=transcript_obj.language_code,
        is_generated=transcript_obj.is_generated,
    )
