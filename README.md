# WhatsApp Rock-Paper-Scissors Bot 🪨📄✂️

A fun WhatsApp bot that lets you settle any decision with a quick game of Rock Paper Scissors — either solo vs. the bot or in a 1-vs-1 duel with someone in the chat.

## Commands

| Command | Description |
|---|---|
| `!rps rock\|paper\|scissors` | Play instantly against the bot |
| `!rps @username` | Challenge someone to a duel |
| `!accept` | Accept an incoming challenge |
| `!play rock\|paper\|scissors` | Submit your move in a duel |
| `!rps help` | Show all commands |

## How a duel works

1. **Challenge:** `!rps @John` in any group chat  
2. **Accept:** John types `!accept` within 60 seconds  
3. **Move:** Both players type `!play rock` / `!play paper` / `!play scissors` — the bot hides each move until both are in  
4. **Result:** The bot reveals both choices and announces the winner 🏆

## Setup

### Prerequisites

- **Node.js ≥ 18**
- **Google Chrome or Chromium** installed (used by Puppeteer under the hood)

### Install

```bash
cd whatsapp-rps-bot
npm install
```

### Run

```bash
npm start
```

A QR code will appear in the terminal. Scan it with the WhatsApp mobile app (**Linked Devices → Link a Device**).

Once authenticated the session is saved locally in `.wwebjs_auth/` so you only need to scan once.

### Notes

- The bot needs to be a participant in the group chats where you want to use it.
- Works in both group chats and private chats.
- Challenges and active games expire after **60 seconds** of inactivity.

## Project structure

```
whatsapp-rps-bot/
├── index.js     # Bot entry point & WhatsApp event handling
├── game.js      # Pure game logic (no WhatsApp dependency)
├── package.json
└── .gitignore
```
