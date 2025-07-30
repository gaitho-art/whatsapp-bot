const qrcode = require('qrcode-terminal');

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const chrono = require('chrono-node');
const schedule = require('node-schedule');
const fs = require('fs');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // disable internal QR print
    });

    sock.ev.on('connection.update', (update) => {
        const { qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const sender = msg.key.remoteJid;

        if (!text?.toLowerCase().startsWith('remind me')) return;

        const time = chrono.parseDate(text);
        if (!time) {
            await sock.sendMessage(sender, { text: '⚠️ Could not detect a valid time in your message.' });
            return;
        }

        const now = new Date();
        if (time < now) {
            await sock.sendMessage(sender, { text: '⚠️ That time has already passed.' });
            return;
        }

        const reminderText = text.replace(/remind me (to|that)?/i, '').replace(/at .*$/i, '').trim() || 'Reminder!';

        await sock.sendMessage(sender, {
            text: `✅ Reminder set for ${time.toLocaleString()}: "${reminderText}"`
        });

        schedule.scheduleJob(time, async () => {
            await sock.sendMessage(sender, {
                text: `⏰ Reminder: ${reminderText}`
            });
        });
    });
}

startBot();
if (require.main === module) {
    startBot().catch(err => {
        console.error('Error starting bot:', err);
        process.exit(1);
    });
}