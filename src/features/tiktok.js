// src/features/tiktok.js
import fs from "fs";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import ytdlpExec from "yt-dlp-exec";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function resolveTikTokUrl(url) {
  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    return response.request.res.responseUrl || url;
  } catch (err) {
    console.error("❌ Failed to resolve TikTok URL:", err.message);
    return url;
  }
}

export async function handleTikTokDownloader(sock, from, url) {
  if (!url.startsWith("http")) {
    await sock.sendMessage(from, { text: "❌ Invalid URL" });
    return;
  }

  await sock.sendMessage(from, { text: "📥 Downloading TikTok videos..." });

  const tempFile = `${__dirname}/tmp_tt.mp4`;

  try {
    const resolvedUrl = await resolveTikTokUrl(url);
    await ytdlpExec(resolvedUrl, {
      output: tempFile,
      format: "bv*[height<=1080]+ba/bv*+ba/best",
      quiet: true,
      noWarnings: true,
      preferFreeFormats: true,
    });

    await sock.sendMessage(from, {
      video: fs.readFileSync(tempFile),
      mimetype: "video/mp4",
      caption: "📹 TikTok Video (No Watermark)",
    });

    fs.unlinkSync(tempFile);
  } catch (err) {
    console.error("❌ Error while downloading TikTok:", err);
    await sock.sendMessage(from, {
      text: "❌ Failed to download TikTok video. Please try again with another link..",
    });
  }
}
