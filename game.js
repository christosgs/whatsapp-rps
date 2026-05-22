// ── Rock Paper Scissors game logic ──────────────────────────────────────────

const CHOICES = ['rock', 'paper', 'scissors'];

const EMOJI = {
    rock: '🪨',
    paper: '📄',
    scissors: '✂️',
};

const BEATS = {
    rock: 'scissors',
    scissors: 'paper',
    paper: 'rock',
};

/** Parse a raw string from a user into a valid RPS choice or null. */
function parseChoice(text) {
    const t = text.trim().toLowerCase();
    return CHOICES.includes(t) ? t : null;
}

/** Pick a random choice for the bot. */
function botChoice() {
    return CHOICES[Math.floor(Math.random() * CHOICES.length)];
}

/**
 * Determine outcome from player1's perspective.
 * Returns 'win', 'lose', or 'draw'.
 */
function getOutcome(choice1, choice2) {
    if (choice1 === choice2) return 'draw';
    return BEATS[choice1] === choice2 ? 'win' : 'lose';
}

/** Build the result string for a solo game vs. the bot. */
function buildSoloResult(playerName, playerChoice, botPick) {
    const outcome = getOutcome(playerChoice, botPick);
    const playerLine = `${playerName}: ${EMOJI[playerChoice]} ${playerChoice}`;
    const botLine    = `🤖 Bot: ${EMOJI[botPick]} ${botPick}`;

    let verdict;
    if (outcome === 'win')  verdict = `🏆 *${playerName} wins!*`;
    if (outcome === 'lose') verdict = `💀 *Bot wins!*`;
    if (outcome === 'draw') verdict = `🤝 *It's a draw!*`;

    return `${playerLine}\n${botLine}\n\n${verdict}`;
}

/**
 * Build the per-round result for a multi-round duel.
 *
 * @param {number} round       Current round number (1-based)
 * @param {string} name1
 * @param {string} choice1
 * @param {string} name2
 * @param {string} choice2
 * @param {number} score1      Wins so far for player 1 (before this round)
 * @param {number} score2      Wins so far for player 2 (before this round)
 * @param {number} winsNeeded  How many wins are needed to take the match
 * @returns {{ text: string, outcome: 'win'|'lose'|'draw' }}
 */
function buildRoundResult(round, name1, choice1, name2, choice2, score1, score2, winsNeeded) {
    const outcome = getOutcome(choice1, choice2);

    // Update scores for display
    const s1 = score1 + (outcome === 'win'  ? 1 : 0);
    const s2 = score2 + (outcome === 'lose' ? 1 : 0);

    const line1 = `${name1}: ${EMOJI[choice1]} ${choice1}`;
    const line2 = `${name2}: ${EMOJI[choice2]} ${choice2}`;

    let roundVerdict;
    if (outcome === 'win')  roundVerdict = `✅ *${name1}* takes the round!`;
    if (outcome === 'lose') roundVerdict = `✅ *${name2}* takes the round!`;
    if (outcome === 'draw') roundVerdict = `🤝 Round draw!`;

    const scoreLine = `📊 Score — ${name1}: *${s1}* | ${name2}: *${s2}* (first to ${winsNeeded})`;

    const text = `🎮 *Round ${round}*\n${line1}\n${line2}\n\n${roundVerdict}\n${scoreLine}`;
    return { text, outcome, s1, s2 };
}

/** Build the match-over announcement. */
function buildMatchOver(name1, score1, name2, score2, totalRounds) {
    let winner;
    if (score1 > score2)       winner = `🏆 *${name1} wins the match!*`;
    else if (score2 > score1)  winner = `🏆 *${name2} wins the match!*`;
    else                       winner = `🤝 *The match ends in a tie!*`;

    return (
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${winner}\n` +
        `Final score after ${totalRounds} rounds:\n` +
        `${name1}: *${score1}* | ${name2}: *${score2}*\n` +
        `━━━━━━━━━━━━━━━━━━━━`
    );
}

module.exports = {
    parseChoice, botChoice, buildSoloResult,
    buildRoundResult, buildMatchOver,
    CHOICES, EMOJI,
};
