const qrcode = require('qrcode-terminal');

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const readline = require('readline');
const { parse } = require('date-fns');
const schedule = require('node-schedule');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    browser: ['Ubuntu', 'Chrome', '22.04']
  });

  sock.ev.on('creds.update', saveCreds);

  // ✅ Show QR manually
  sock.ev.on('connection.update', ({ connection, qr }) => {
    if (qr) {
      console.log('📲 Scan this QR with your phone:\n');
      console.log(qr); // you can use 'qrcode-terminal' to display it better
    }
if (qr) {
  qrcode.generate(qr, { small: true }); // prints visual QR
}

    if (connection === 'close') {
      const shouldReconnect = (sock.lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startSock();
      }
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp!');
    }
  });

  // ✅ Reminder logic
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text) return;

    const match = text.match(/remind me to (.+) at (.+)/i);
    if (match) {
      const [, task, timeString] = match;
      const date = parse(timeString, 'h:mma', new Date());
      if (isNaN(date)) {
        await sock.sendMessage(msg.key.remoteJid, { text: `⛔ Invalid time format. Use e.g. "1:45pm"` });
        return;
      }

      schedule.scheduleJob(date, async () => {
        await sock.sendMessage(msg.key.remoteJid, { text: `⏰ Reminder: ${task}` });
      });

      await sock.sendMessage(msg.key.remoteJid, {
        text: `⏰ Okay! You said: "remind me to ${task} at ${timeString}"\nI'll remind you at that time.`
      });
    }
  });
};

startSock();
