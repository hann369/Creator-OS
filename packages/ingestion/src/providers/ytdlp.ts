import { spawn } from 'node:child_process';

// Thin wrapper around the yt-dlp CLI (the reelstudio technique). Used to pull
// metadata + a downloadable media file from any site yt-dlp supports (Instagram,
// TikTok, X, YouTube, …) WITHOUT that platform's official API. The audio is then
// transcribed by Mistral voxtral (see YtDlpMistralTranscriptSource).
//
// Runtime note: this needs the `yt-dlp` binary (or `python -m yt_dlp`) available
// in the host — i.e. a worker/container/local box, NOT a serverless function.
// Everything is env-gated so its absence degrades cleanly.
//
//   YTDLP_CMD          override the invocation (default "yt-dlp"; on Windows dev
//                      set e.g. "py -m yt_dlp")
//   YTDLP_COOKIES / INSTAGRAM_COOKIES  path to a Netscape cookies.txt (needed
//                      for Instagram, which gates unauthenticated/datacenter access)

export interface YtDlpOptions {
  cmd?: string;        // e.g. "yt-dlp" or "py -m yt_dlp"
  cookiesFile?: string;
  timeoutMs?: number;
}

function invocation(opts: YtDlpOptions): string[] {
  const raw = opts.cmd ?? process.env.YTDLP_CMD ?? 'yt-dlp';
  return raw.split(/\s+/).filter(Boolean);
}

function run(args: string[], opts: YtDlpOptions): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  const [bin, ...prefix] = invocation(opts);
  const cookies = opts.cookiesFile ?? process.env.YTDLP_COOKIES ?? process.env.INSTAGRAM_COOKIES;
  const full = [...prefix, ...(cookies ? ['--cookies', cookies] : []), ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, full, { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('yt-dlp timed out')); }, opts.timeoutMs ?? 120000);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout: Buffer.concat(out), stderr: err }); });
  });
}

/** Is yt-dlp callable in this environment? Caches the answer. */
let _available: boolean | undefined;
export async function ytdlpAvailable(opts: YtDlpOptions = {}): Promise<boolean> {
  if (_available !== undefined && !opts.cmd) return _available;
  try {
    const { code } = await run(['--version'], { ...opts, timeoutMs: 8000 });
    const ok = code === 0;
    if (!opts.cmd) _available = ok;
    return ok;
  } catch {
    if (!opts.cmd) _available = false;
    return false;
  }
}

export interface YtDlpInfo {
  id: string;
  title?: string;
  description?: string;
  uploader?: string;
  uploaderId?: string;
  channelId?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
  thumbnail?: string;
  uploadDate?: string; // YYYYMMDD
  raw: any;
}

/** Fetch metadata JSON for a URL (yt-dlp --dump-single-json), no download. */
export async function ytdlpDumpJson(url: string, opts: YtDlpOptions = {}): Promise<YtDlpInfo> {
  const { code, stdout, stderr } = await run(['--dump-single-json', '--no-warnings', url], opts);
  if (code !== 0) throw new Error(`yt-dlp metadata failed: ${stderr.slice(0, 300)}`);
  const j = JSON.parse(stdout.toString('utf8'));
  return {
    id: j.id,
    title: j.title,
    description: j.description,
    uploader: j.uploader ?? j.channel,
    uploaderId: j.uploader_id ?? j.channel_id,
    channelId: j.channel_id,
    viewCount: typeof j.view_count === 'number' ? j.view_count : undefined,
    likeCount: typeof j.like_count === 'number' ? j.like_count : undefined,
    commentCount: typeof j.comment_count === 'number' ? j.comment_count : undefined,
    duration: typeof j.duration === 'number' ? j.duration : undefined,
    thumbnail: j.thumbnail,
    uploadDate: j.upload_date,
    raw: j,
  };
}

/** Download the best audio (or muxed media) to `outPath`. Returns the actual path. */
export async function ytdlpDownloadAudio(url: string, outPath: string, opts: YtDlpOptions = {}): Promise<string> {
  const { code, stderr } = await run(
    ['-f', 'ba[ext=m4a]/bestaudio/best', '-o', outPath, '--no-warnings', '--no-part', url],
    { ...opts, timeoutMs: opts.timeoutMs ?? 180000 },
  );
  if (code !== 0) throw new Error(`yt-dlp download failed: ${stderr.slice(0, 300)}`);
  return outPath;
}
