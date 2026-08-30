// src/features/youtube.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ytdlpExec from 'yt-dlp-exec';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, '../tmp');
fs.mkdirSync(tempDir, { recursive: true });

function safeFile(name) {
  return String(name || 'youtube').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'youtube';
}

export async function searchYouTube(query, limit = 5) {
  const result = await ytdlpExec(`ytsearch${limit}:${query}`, {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    quiet: true,
    noWarnings: true,
  });
  const entries = Array.isArray(result?.entries) ? result.entries : [];
  return entries.filter((item) => item?.id).map((item) => ({
    id: item.id,
    url: item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`,
    title: item.title || 'YouTube video',
    duration: item.duration_string || item.duration || '',
    channel: item.channel || item.uploader || '',
  }));
}

export async function handleYouTubeDownloader(sock, from, url, mode = 'video', quality = 'best') {
  if (!/^https?:\/\//i.test(url)) {
    await sock.sendMessage(from, { text: '❌ Invalid YouTube URL' });
    return;
  }

  const base = safeFile(`${Date.now()}_${mode}`);
  const output = path.join(tempDir, `${base}.%(ext)s`);
  const format = mode === 'audio'
    ? 'bestaudio/best'
    : quality === '2160'
      ? 'bv*[height<=2160]+ba/bv*[height<=1440]+ba/bv*+ba/best'
      : quality === '1440'
        ? 'bv*[height<=1440]+ba/bv*+ba/best'
        : quality === '1080'
          ? 'bv*[height<=1080]+ba/bv*+ba/best'
          : 'bv*+ba/best';

  await sock.sendMessage(from, { text: `📥 Downloading YouTube ${mode === 'audio' ? 'audio' : `${quality === '2160' ? 'up to 4K' : quality + 'p'} video`}...` });

  try {
    const args = { output, format, mergeOutputFormat: mode === 'audio' ? undefined : 'mp4', quiet: true, noWarnings: true };
    if (mode === 'audio') {
      args.extractAudio = true;
      args.audioFormat = 'mp3';
    }
    await ytdlpExec(url, args);
    const files = fs.readdirSync(tempDir).filter((name) => name.startsWith(base + '.') && !name.endsWith('.part'));
    const file = files[0] ? path.join(tempDir, files[0]) : null;
    if (!file || !fs.existsSync(file)) throw new Error('Downloaded file was not created');
    const data = fs.readFileSync(file);
    if (mode === 'audio') {
      await sock.sendMessage(from, { audio: data, mimetype: 'audio/mpeg', fileName: `${safeFile(base)}.mp3`, caption: '🎵 YouTube Audio — BICHUXZUBIII' });
    } else {
      await sock.sendMessage(from, { video: data, mimetype: 'video/mp4', fileName: `${safeFile(base)}.mp4`, caption: `📹 YouTube Video — BICHUXZUBIII (${quality === '2160' ? 'up to 4K' : quality + 'p'})` });
    }
    fs.rmSync(file, { force: true });
  } catch (err) {
    console.error('[YouTube downloader]', err?.message || err);
    for (const name of fs.readdirSync(tempDir)) if (name.startsWith(base + '.')) fs.rmSync(path.join(tempDir, name), { force: true });
    await sock.sendMessage(from, { text: '❌ Download failed. The requested quality may not be available, or the video may be restricted.' });
  }
}
