#!/usr/bin/env node
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'atexovi-baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import process from 'process';
import dotenv from 'dotenv';
import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';
import { registerWebPairing } from './webPairing.js';

dotenv.config({ debug: false });

const originalError = console.error;
const originalLog = console.log;
const originalStdoutWrite = process.stdout.write;

const FILTER_PATTERNS = [
  'Bad MAC',
  'Failed to decrypt message with any known session',
  'Session error:',
  'Failed to decrypt',
  'Closing open session',
  'Closing session:',
  'SessionEntry',
  '_chains:',
  'registrationId:',
  'currentRatchet:',
  'indexInfo:',
  '<Buffer',
  'pubKey:',
  'privKey:',
  'baseKey:',
  'remoteIdentityKey:',
  'lastRemoteEphemeralKey:',
  'ephemeralKeyPair:',
  'chainKey:',
  'chainType:',
  'messageKeys:'
];

process.stdout.write = function(chunk, encoding, callback) {
  const str = chunk?.toString() || '';
  
  const shouldFilter = FILTER_PATTERNS.some(pattern => str.includes(pattern));
  
  if (shouldFilter) {
    if (str.includes('Closing open session')) {
      const cleanMsg = chalk.blue('🔒 Signal: Enkripsi diperbarui\n');
      return originalStdoutWrite.call(this, Buffer.from(cleanMsg), encoding, callback);
    }
    
    if (typeof callback === 'function') callback();
    return true;
  }
  
  return originalStdoutWrite.call(this, chunk, encoding, callback);
};

console.error = function(...args) {
  const msg = args.join(' ');
  
  if (FILTER_PATTERNS.some(pattern => msg.includes(pattern))) {
    if (msg.includes('Bad MAC')) {
      console.log(chalk.yellow('🔄 Signal Protocol: Mengamankan koneksi...'));
    }
    return;
  }
  
  originalError.apply(console, args);
};

console.log = function(...args) {
  const msg = args.join(' ');
  
  if (FILTER_PATTERNS.some(pattern => msg.includes(pattern))) {
    return;
  }
  
  originalLog.apply(console, args);
};

const authDir = path.join(process.env.SESSION_DIR || process.cwd(), 'session');
let activeSock = null;
const webApp = registerWebPairing({ getSocket: () => activeSock, isConnected: () => Boolean(activeSock?.user) });
const webPort = Number(process.env.PORT || 3000);
webApp.listen(webPort, '0.0.0.0', () => console.log(chalk.cyan(`🌐 BICH-UXMD pairing page: /pair (port ${webPort})`)));

const bannerAscii = `
 __       __                  _______               __     
/  |  _  /  |                /       \\             /  |    
$$ | / \\ $$ |  ______        $$$$$$$  |  ______   _$$ |_   
$$ |/$  \\$$ | /      \\       $$ |__$$ | /      \\ / $$   |  
$$ /$$$  $$ | $$$$$$  |      $$    $$< /$$$$$$  |$$$$$$/   
$$ $$/$$ $$ | /    $$ |      $$$$$$$  |$$ |  $$ |  $$ | __ 
$$$$/  $$$$ |/$$$$$$$ |      $$ |__$$ |$$ \\__$$ |  $$ |/  |
$$$/    $$$ |$$    $$ |      $$    $$/ $$    $$/   $$  $$/ 
$$/      $$/  $$$$$$$/       $$$$$$$/   $$$$$$/     $$$$/  
`;

const features = [
  ' ▷ YouTube Downloader', 
  ' ⓕ Facebook Downloader',
  ' 🅾 Instagram Downloader',
  '【ꚠ】TikTok Downloader',
];

export function showBanner() {
  console.clear();
  const termWidth = process.stdout.columns || 80;

  bannerAscii.split('\n').forEach(line => {
    const padding = Math.max(0, Math.floor((termWidth - line.length) / 2));
    console.log(' '.repeat(padding) + chalk.cyanBright(line));
  });

  console.log();

  features.forEach(f => {
    const padding = Math.max(0, Math.floor((termWidth - f.length) / 2));
    console.log(' '.repeat(padding) + chalk.greenBright(f));
  });

  console.log();
}

async function startBot() {
  showBanner();

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
  });
  activeSock = sock;

  wrapSendMessageGlobally(sock);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(chalk.greenBright('✅ Terhubung ke WhatsApp!'));
      console.log(chalk.cyan(`👤 User: ${sock.user?.id || 'Unknown'}`));
    } else if (connection === 'close') {
      if (activeSock === sock) activeSock = null;
      const reason = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log(chalk.yellow('🔁 Koneksi terputus, reconnecting...'));
        startBot();
      } else {
        console.log(chalk.red('❌ Session invalid, hapus folder session/ dan coba lagi.'));
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages?.[0];
    if (!msg || msg.key.fromMe) return;

    try {
      await handler(sock, msg);
    } catch (err) {
      console.error(chalk.red('[Handler Error]'), err);
    }
  });

  const files = fs.readdirSync(authDir).filter(f => f.endsWith('.json'));
  if (files.length === 0 && process.stdin.isTTY) {
    let waNumber;
    try {
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'waNumber',
          message: chalk.cyanBright('Masukkan nomor WhatsApp (tanpa +):'),
          validate: (input) => /^\d{8,}$/.test(input) ? true : 'Nomor tidak valid',
        },
      ]);
      waNumber = response.waNumber;
    } catch (err) {
      if (err.name === 'ExitPromptError') process.exit(0);
      else throw err;
    }

    try {
      const code = await sock.requestPairingCode(waNumber);
      console.log(chalk.greenBright('\n✅ Pairing Code Ditemukan!'));
      console.log(chalk.yellowBright('📌 Kode:'), chalk.bold.magenta(code));
      console.log(chalk.cyan('Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat'));
      console.log(chalk.greenBright('\nMenunggu koneksi otomatis...'));
    } catch (error) {
      console.error(chalk.red('❌ Error saat meminta pairing code:'), error);
    }
  } else if (files.length === 0) {
    console.log(chalk.yellow('📱 Open the /pair page on your Railway domain to connect WhatsApp.'));
  }
}

startBot();
