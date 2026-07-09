# Pronoia Transcript API

Self-hosted YouTube transcript service — runs as a Vercel Python Serverless Function.

## Quick Deploy

```bash
cd packages/transcript-api
npx vercel --prod
```

After deploy, copy the URL (e.g. `https://pronoia-transcript.vercel.app`) into your Creator OS API env:

```env
TRANSCRIPT_API_URL=https://pronoia-transcript.vercel.app/transcript
```

## API

### `POST /transcript`

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

Supports all YouTube URL formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- Raw video IDs (`dQw4w9WgXcQ`)

**Response:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "video_id": "VIDEO_ID",
  "transcript": "Full spoken text from the video...",
  "language": "English",
  "language_code": "en",
  "is_generated": true
}
```

### `GET /health`

```json
{ "status": "ok", "proxy": false }
```

## Environment Variables (Vercel)

| Variable | Required | Description |
|---|---|---|
| `TRANSCRIPT_API_SECRET` | No | If set, requests must include `Authorization: Bearer <secret>` |
| `WEBSHARE_PROXY_USERNAME` | No | Webshare rotating proxy username (recommended for production) |
| `WEBSHARE_PROXY_PASSWORD` | No | Webshare rotating proxy password |
| `PROXY_HTTP_URL` | No | Custom HTTP proxy URL (alternative to Webshare) |
| `PROXY_HTTPS_URL` | No | Custom HTTPS proxy URL (alternative to Webshare) |

## Note on IP Bans

YouTube blocks most cloud provider IPs. The service works without proxies for most videos,
but under heavy load or for certain videos you may see `502` errors.

**Recommended for production:** Set up [Webshare rotating residential proxies](https://www.webshare.io)
and add the credentials to your Vercel env vars.

## Local Development

```bash
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8001
```

Then test:
```bash
curl -X POST http://localhost:8001/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```
