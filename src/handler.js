// src/handler.js

/* WADUH... MAU NGAPAIN BANG?
KALAU MAU PAKE, MINIMAL FOLLOW DAN KASIH STAR!
https://github.com/atex-ovi
*/

import fs from 'fs';
import path from 'path';
import { userState } from './userState.js';
import { handleYouTubeDownloader, searchYouTube } from './features/youtube.js';
import { handleFacebookDownloader } from './features/facebook.js';
import { handleInstagramDownloader } from './features/instagram.js';
import { handleTikTokDownloader } from './features/tiktok.js';
import { validateUrl } from './utils/validateUrl.js';

const menuImagePath = path.join(process.cwd(), 'src/assets/menu.jpg');

export async function handler(sock, msg) {
  if (!msg?.message) return;

  const from = msg.key.remoteJid;
  const state = userState.get(from) || { step: 'start' };

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption;

  let rowId;
  try {
    if (msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
      rowId = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id;
    } else if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
      rowId = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
    }
  } catch (err) {
    console.error('[DEBUG] Gagal parsing rowId:', err);
  }

  const btnId = msg.message?.buttonsResponseMessage?.selectedButtonId;
  if (btnId === 'back_to_menu') {
    await sock.sendPresenceUpdate('composing', from);
    await new Promise(r => setTimeout(r, 800));

    await sendDownloaderMenu(sock, from);

    await sock.sendPresenceUpdate('paused', from);
    userState.set(from, { step: 'menuMain' });
    return;
  }

  if (rowId && /^yt_result_[0-4]$/.test(rowId)) {
    const selected = state.results?.[Number(rowId.split('_')[2])];
    if (!selected) return;
    await sendYouTubeQualityMenu(sock, from, selected);
    userState.set(from, { step: 'yt_wait_quality', video: selected });
    return;
  }

  if (rowId && ['yt_audio', 'yt_video_2160', 'yt_video_1440', 'yt_video_1080'].includes(rowId)) {
    const options = { yt_audio: ['audio', 'best'], yt_video_2160: ['video', '2160'], yt_video_1440: ['video', '1440'], yt_video_1080: ['video', '1080'] };
    const selected = options[rowId];
    if (!selected || !state.video) return;
    await handleYouTubeDownloader(sock, from, state.video.url, selected[0], selected[1]);
    userState.set(from, { step: 'menuMain' });
    return;
  }

  if (rowId) {
    switch (rowId) {
      case 'yt_downloader':
        userState.set(from, { step: 'yt_wait_input' });
        await sock.sendMessage(from, { text: '📌 YouTube video ka link ya title bhejein. Title bhejne par bot search results dega:' });
        break;
      case 'fb_downloader':
        userState.set(from, { step: 'fb_wait_url' });
        await sock.sendMessage(from, { text: '📌 Kirim link *Facebook* video:' });
        break;
      case 'ig_downloader':
        userState.set(from, { step: 'ig_wait_url' });
        await sock.sendMessage(from, { text: '📌 Kirim link *Instagram* video:' });
        break;
      case 'tt_downloader':
        userState.set(from, { step: 'tt_wait_url' });
        await sock.sendMessage(from, { text: '📌 Kirim link *TikTok* video:' });
        break;
      default:
        break;
    }
    return;
  }

  if (text) {
    switch (state.step) {
      case 'yt_wait_input':
        if (validateUrl(text, 'youtube')) {
          await sendYouTubeQualityMenu(sock, from, { url: text, title: 'Selected YouTube video' });
          userState.set(from, { step: 'yt_wait_quality', video: { url: text, title: 'Selected YouTube video' } });
          return;
        }
        try {
          await sock.sendMessage(from, { text: '🔎 YouTube par search ho raha hai...' });
          const results = await searchYouTube(text, 5);
          if (!results.length) throw new Error('No results');
          await sock.sendMessage(from, {
            text: '🎬 Search result select karein:',
            interactiveButtons: [{
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: 'YouTube Results',
                sections: [{ title: 'BICHUXZUBIII Search', rows: results.map((item, i) => ({ id: `yt_result_${i}`, title: item.title.slice(0, 60), description: `${item.channel || 'YouTube'} ${item.duration ? `• ${item.duration}` : ''}` })) }],
              }),
            }],
          });
          userState.set(from, { step: 'yt_wait_result', results });
        } catch {
          await sock.sendMessage(from, { text: '❌ Search result nahi mila. Dobara title ya valid YouTube link bhejein.' });
        }
        return;
      case 'yt_wait_result':
        if (!/^yt_result_[0-4]$/.test(rowId || '')) return;
        {
          const selected = state.results?.[Number(rowId.split('_')[2])];
          if (!selected) return;
          await sendYouTubeQualityMenu(sock, from, selected);
          userState.set(from, { step: 'yt_wait_quality', video: selected });
        }
        return;
      case 'yt_wait_quality':
        {
          const options = { yt_audio: ['audio', 'best'], yt_video_2160: ['video', '2160'], yt_video_1440: ['video', '1440'], yt_video_1080: ['video', '1080'] };
          const selected = options[rowId];
          if (!selected || !state.video) return;
          await handleYouTubeDownloader(sock, from, state.video.url, selected[0], selected[1]);
        }
        break;

      case 'fb_wait_url':
        if (!validateUrl(text, 'facebook')) {
          await sock.sendMessage(from, { 
            text: '❌ URL tidak valid, silakan kirim link Facebook yang benar.',
            buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: 'Kembali ke Menu' }, type: 1 }]
          });
          return;
        }
        await handleFacebookDownloader(sock, from, text);
        break;

      case 'ig_wait_url':
        if (!validateUrl(text, 'instagram')) {
          await sock.sendMessage(from, { 
            text: '❌ URL tidak valid, silakan kirim link Instagram yang benar.',
            buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: 'Kembali ke Menu' }, type: 1 }]
          });
          return;
        }
        await handleInstagramDownloader(sock, from, text);
        break;

      case 'tt_wait_url':
        if (!validateUrl(text, 'tiktok')) {
          await sock.sendMessage(from, { 
            text: '❌ URL tidak valid, silakan kirim link TikTok yang benar.',
            buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: 'Kembali ke Menu' }, type: 1 }]
          });
          return;
        }
        await handleTikTokDownloader(sock, from, text);
        break;

      default:
        await sendDownloaderMenu(sock, from);
        break;
    }

    userState.set(from, { step: 'menuMain' });
    return;
  }

  if (state.step === 'start' || state.step === 'menuMain') {
    await sendDownloaderMenu(sock, from);
    userState.set(from, { step: 'menuMain' });
  }
}

async function sendYouTubeQualityMenu(sock, from, video) {
  await sock.sendMessage(from, {
    text: `✅ ${video.title || 'YouTube video'}\\n\\nAudio ya video quality select karein. 4K sirf us waqt milegi jab original video mein 4K available ho:`,
    interactiveButtons: [{
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: 'Download Options',
        sections: [{ title: 'BICHUXZUBIII Quality', rows: [
          { id: 'yt_audio', title: '🎵 Audio MP3', description: 'Best available audio' },
          { id: 'yt_video_2160', title: '🎬 Video up to 4K', description: '2160p, fallback if unavailable' },
          { id: 'yt_video_1440', title: '🎬 Video 1440p', description: '2K, fallback if unavailable' },
          { id: 'yt_video_1080', title: '🎬 Video 1080p', description: 'Full HD' },
        ] }],
      }),
    }],
  });
}

export async function sendDownloaderMenu(sock, from) {
  await sock.sendMessage(from, {
    image: fs.readFileSync(menuImagePath),
    caption: '',
    footer: '© 2026 BICHUXZUBIII | POWERED BY BICHUXMD',
    interactiveButtons: [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: 'BICHUXZUBIII Downloader',
          sections: [
            {
              title: 'Pilih Platform',
              rows: [
                { title: 'YouTube Downloader', description: 'Unduh video dari YouTube', id: 'yt_downloader' },
                { title: 'Facebook Downloader', description: 'Unduh video dari Facebook', id: 'fb_downloader' },
                { title: 'Instagram Downloader', description: 'Unduh video dari Instagram', id: 'ig_downloader' },
                { title: 'TikTok Downloader', description: 'Unduh video dari TikTok', id: 'tt_downloader' },
              ],
            },
          ],
        }),
      },
    ],
  });
}
