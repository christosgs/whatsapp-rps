/**
 * WhatsApp Rock-Paper-Scissors  (runs on YOUR own number)
 *
 * In a private DM:
 *   !rps [rounds]                     – Challenge the person you're chatting with
 *                                        e.g.  !rps 5  → first to 5 wins  (default 3)
 *
 * In a group chat:
 *   !rps @friend [rounds]             – Challenge a specific group member
 *
 * During a match (works in both DM and group):
 *   !accept                           – Accept an incoming challenge
 *   !play <rock|paper|scissors>       – Submit your move for the current round
 *   !score                            – Show current score
 *   !forfeit                          – Concede the match
 *   !rps help                         – Show command list
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {
    buildRoundResult, buildMatchOver,
    CHOICES, EMOJI,
} = require('./game');

// ── Constants ────────────────────────────────────────────────────────────────
const CHALLENGE_TIMEOUT_MS  = 60_000;   // 60 s to accept a challenge
const MOVE_TIMEOUT_MS       = 120_000;  // 2 min per round before auto-timeout
const MAX_WINS_NEEDED       = 11;       // cap to prevent abuse

// ── State ────────────────────────────────────────────────────────────────────
/**
 * pendingChallenges: challengerId → {
 *   chatId, challengedId, challengedName, challengerName, winsNeeded
 * }
 */
const pendingChallenges = new Map();

/**
 * activeGames: gameId (= challengerId) → {
 *   chatId,
 *   player1Id, player1Name,
 *   player2Id, player2Name,
 *   winsNeeded,
 *   score1, score2,    ← wins per player
 *   round,             ← current round number (1-based)
 *   choice1, choice2,  ← moves for the current round (null = not yet played)
 *   moveTimer,         ← setTimeout handle for move timeout
 * }
 */
const activeGames = new Map();

/** playerToGame: userId → gameId */
const playerToGame = new Map();

// ── WhatsApp client ──────────────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // In Docker (Railway) use the system Chromium set via env var;
        // locally Puppeteer uses its own bundled browser.
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

client.on('qr', (qr) => {
    console.log('\nScan this QR code with your WhatsApp to log in:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅  WhatsApp RPS Bot is ready!');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failure:', msg);
});

// ── Message handler ──────────────────────────────────────────────────────────
// message_create fires for ALL messages (sent by you OR received from contacts)
// so you can type commands from your own phone just like your friend does.
client.on('message_create', async (msg) => {
    const body = msg.body.trim();

    // Fast exit — only process lines that start with a command prefix
    if (!body.startsWith('!')) return;

    const chat       = await msg.getChat();
    const contact    = await msg.getContact();
    const senderId   = contact.id._serialized;
    const senderName = contact.pushname || contact.name || senderId.split('@')[0];
    const isGroup    = chat.isGroup;

    // ── !rps help ──────────────────────────────────────────────────────────
    if (/^!rps\s+help$/i.test(body)) {
        await chat.sendMessage(
            `🎮 *Rock Paper Scissors*\n\n` +
            `*In a private chat:*\n` +
            `  \`!rps [wins]\`  – Challenge the person you're chatting with\n` +
            `  e.g. \`!rps 5\` → first to 5 wins  (default: 3)\n\n` +
            `*In a group chat:*\n` +
            `  \`!rps @friend [wins]\`  – Challenge a specific member\n\n` +
            `*During a match:*\n` +
            `  \`!accept\`   – accept a challenge\n` +
            `  \`!play rock|paper|scissors\`  – submit your move\n` +
            `  \`!score\`    – show current score\n` +
            `  \`!forfeit\`  – concede the match\n\n` +
            `Choices: ${CHOICES.map(c => `${EMOJI[c]} ${c}`).join('  ')}`
        );
        return;
    }

    // ── !rps (challenge) ───────────────────────────────────────────────────
    // • Private DM:  !rps [rounds]          — challenges the other person
    // • Group chat:  !rps @mention [rounds] — challenges a specific member
    const rpsMatch = body.match(/^!rps(?:\s+(.*))?$/i);
    if (rpsMatch) {
        const args = (rpsMatch[1] || '').trim();

        let challengedId, challengedName, winsNeeded;

        if (!isGroup) {
            // ── Private DM: other participant is automatically the opponent ─
            challengedId   = chat.id._serialized;
            const otherContact = await client.getContactById(challengedId);
            challengedName = otherContact.pushname || otherContact.name || challengedId.split('@')[0];
            winsNeeded     = parseInt(args || '3', 10);
        } else {
            // ── Group chat: must @mention someone ─────────────────────────
            const mentions = await msg.getMentions();
            if (!mentions.length) {
                await chat.sendMessage(
                    '❌ In a group, please @mention who you want to challenge.\n' +
                    'Example: `!rps @John` or `!rps @John 5`\n\n' +
                    'In a private chat you can just type `!rps` or `!rps 5`.'
                );
                return;
            }
            const challenged = mentions[0];
            challengedId     = challenged.id._serialized;
            challengedName   = challenged.pushname || challenged.name || challengedId.split('@')[0];
            const roundsStr  = args.replace(/@\S+\s*/g, '').trim();
            winsNeeded       = parseInt(roundsStr || '3', 10);
        }

        if (challengedId === senderId) {
            await chat.sendMessage("🤔 You can't challenge yourself!");
            return;
        }

        if (isNaN(winsNeeded) || winsNeeded < 1) winsNeeded = 3;
        if (winsNeeded > MAX_WINS_NEEDED) winsNeeded = MAX_WINS_NEEDED;

        pendingChallenges.delete(senderId);

        pendingChallenges.set(senderId, {
            chatId: chat.id._serialized,
            challengedId,
            challengedName,
            challengerName: senderName,
            winsNeeded,
        });

        setTimeout(() => {
            if (pendingChallenges.has(senderId)) {
                pendingChallenges.delete(senderId);
                chat.sendMessage(`⏰ Challenge from *${senderName}* to *${challengedName}* expired.`);
            }
        }, CHALLENGE_TIMEOUT_MS);

        await chat.sendMessage(
            `⚔️ *${senderName}* challenges *${challengedName}* to Rock Paper Scissors!\n\n` +
            `🏆 First to *${winsNeeded} win${winsNeeded > 1 ? 's' : ''}* takes the match.\n\n` +
            `*${challengedName}*, type \`!accept\` within 60 seconds!`
        );
        return;
    }

    // ── !accept ────────────────────────────────────────────────────────────
    if (/^!accept$/i.test(body)) {
        let challengerId  = null;
        let challengeData = null;
        for (const [cId, data] of pendingChallenges.entries()) {
            if (data.challengedId === senderId) {
                challengerId  = cId;
                challengeData = data;
                break;
            }
        }

        if (!challengerId) {
            await chat.sendMessage(`❌ You have no pending challenge, ${senderName}.`);
            return;
        }

        pendingChallenges.delete(challengerId);

        const gameId = challengerId;
        const game = {
            chatId:      challengeData.chatId,
            player1Id:   challengerId,
            player1Name: challengeData.challengerName,
            player2Id:   senderId,
            player2Name: senderName,
            winsNeeded:  challengeData.winsNeeded,
            score1:      0,
            score2:      0,
            round:       1,
            choice1:     null,
            choice2:     null,
            moveTimer:   null,
        };

        activeGames.set(gameId, game);
        playerToGame.set(challengerId, gameId);
        playerToGame.set(senderId, gameId);

        startMoveTimer(game, gameId, chat);

        await chat.sendMessage(
            `✅ *${senderName}* accepted the challenge!\n\n` +
            `⚔️ *${challengeData.challengerName}* vs *${senderName}*\n` +
            `🏆 First to *${game.winsNeeded} win${game.winsNeeded > 1 ? 's' : ''}* wins the match\n\n` +
            `*Round 1 — GO!*\n` +
            `Both players type \`!play rock\`, \`!play paper\`, or \`!play scissors\` 🤫`
        );
        return;
    }

    // ── !score ─────────────────────────────────────────────────────────────
    if (/^!score$/i.test(body)) {
        const gameId = playerToGame.get(senderId);
        const game   = gameId ? activeGames.get(gameId) : null;
        if (!game) {
            await chat.sendMessage(`❌ You are not in an active match, ${senderName}.`);
            return;
        }
        await chat.sendMessage(
            `📊 *Match score — Round ${game.round}*\n` +
            `${game.player1Name}: *${game.score1}* | ${game.player2Name}: *${game.score2}*\n` +
            `(first to ${game.winsNeeded} wins)`
        );
        return;
    }

    // ── !forfeit ───────────────────────────────────────────────────────────
    if (/^!forfeit$/i.test(body)) {
        const gameId = playerToGame.get(senderId);
        const game   = gameId ? activeGames.get(gameId) : null;
        if (!game) {
            await chat.sendMessage(`❌ You are not in an active match, ${senderName}.`);
            return;
        }
        const opponentName = game.player1Id === senderId ? game.player2Name : game.player1Name;
        endGame(gameId, game);
        await chat.sendMessage(
            `🏳️ *${senderName}* forfeited the match.\n` +
            `🏆 *${opponentName} wins by forfeit!*`
        );
        return;
    }

    // ── !play <choice> ─────────────────────────────────────────────────────
    const playMatch = body.match(/^!play\s+(\S+)$/i);
    if (playMatch) {
        const choice = parseChoice(playMatch[1]);
        if (!choice) {
            await chat.sendMessage(`❌ Unknown choice. Use: ${CHOICES.join(', ')}`);
            return;
        }

        const gameId = playerToGame.get(senderId);
        if (!gameId) {
            await chat.sendMessage(
                `❌ You are not in an active match, ${senderName}.\n` +
                `Start one with \`!rps\` (in a DM) or \`!rps @friend\` (in a group).`
            );
            return;
        }

        const game = activeGames.get(gameId);
        if (!game) {
            playerToGame.delete(senderId);
            await chat.sendMessage(`❌ Match not found — it may have expired.`);
            return;
        }

        // Assign choice, guard against double-submission
        const isPlayer1 = game.player1Id === senderId;
        if (isPlayer1) {
            if (game.choice1) {
                await chat.sendMessage(`⚠️ ${senderName}, you've already played this round. Waiting for your opponent…`);
                return;
            }
            game.choice1 = choice;
        } else {
            if (game.choice2) {
                await chat.sendMessage(`⚠️ ${senderName}, you've already played this round. Waiting for your opponent…`);
                return;
            }
            game.choice2 = choice;
        }

        await chat.sendMessage(`✅ *${senderName}* has made their move! 🤫`);

        // Both players have moved → resolve the round
        if (game.choice1 && game.choice2) {
            clearTimeout(game.moveTimer);

            const { text, outcome, s1, s2 } = buildRoundResult(
                game.round,
                game.player1Name, game.choice1,
                game.player2Name, game.choice2,
                game.score1, game.score2,
                game.winsNeeded
            );

            game.score1 = s1;
            game.score2 = s2;

            // Check if someone has reached winsNeeded
            const matchOver = game.score1 >= game.winsNeeded || game.score2 >= game.winsNeeded;

            if (matchOver) {
                const summary = buildMatchOver(
                    game.player1Name, game.score1,
                    game.player2Name, game.score2,
                    game.round
                );
                await chat.sendMessage(`${text}\n\n${summary}`);
                endGame(gameId, game);
            } else {
                // Start next round
                game.round   += 1;
                game.choice1  = null;
                game.choice2  = null;
                startMoveTimer(game, gameId, chat);

                await chat.sendMessage(
                    `${text}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `*Round ${game.round} — GO!*\n` +
                    `Both type \`!play rock|paper|scissors\` 🤫`
                );
            }
        }
        return;
    }

    // ── Bare !rps (no args) → show quick help ─────────────────────────────
    if (/^!rps$/i.test(body)) {
        await chat.sendMessage(
            `🎮 *Rock Paper Scissors Bot*\n\n` +
            `• \`!rps rock|paper|scissors\` – Play vs. bot\n` +
            `• \`!rps @someone [wins]\` – Challenge to a match\n` +
            `• \`!rps help\` – Full help`
        );
    }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Remove a game from all state maps and clear its timer. */
function endGame(gameId, game) {
    clearTimeout(game.moveTimer);
    activeGames.delete(gameId);
    playerToGame.delete(game.player1Id);
    playerToGame.delete(game.player2Id);
}

/** Start (or restart) the per-round move timer. */
function startMoveTimer(game, gameId, chat) {
    clearTimeout(game.moveTimer);
    game.moveTimer = setTimeout(async () => {
        if (!activeGames.has(gameId)) return;
        endGame(gameId, game);
        await chat.sendMessage(
            `⏰ Round ${game.round} timed out — the match between ` +
            `*${game.player1Name}* and *${game.player2Name}* has been cancelled.`
        );
    }, MOVE_TIMEOUT_MS);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
client.initialize();
