# Grok Build Web

A clean, browser-based interface for generating videos using Grok Build.

**Live Site:** [https://grok.swinggirl.party](https://grok.swinggirl.party)

Built for users who want to avoid the terminal while still using Grok Build’s specialized video generation flow.

## Features

- Modern web UI (works on desktop and mobile)
- Secure browser-based login using xAI’s official OIDC flow (same as the Grok Build CLI)
- **No API keys or tokens are stored on the server** — everything stays in your browser
- Direct video generation from the browser (server does not generate videos on your behalf)
- Simple self-hosted setup with Docker

## How Login Works

When you click **"Login with Grok"**, you are redirected to xAI’s authentication servers. After logging in, your access and refresh tokens are stored **only in your browser** (localStorage). The server never sees or stores your tokens.

This design gives you strong privacy — even the server operator cannot access your tokens.

## How to Host It Yourself

1. Make sure you have Docker and Docker Compose installed.
2. Clone or download this repository.
3. Run the following command in the project folder:

```bash
docker compose up -d --build
```

4. The site will be available on port 5585 (e.g. http://localhost:5585 or your server’s IP).

## Project Structure

- server.js — Lightweight backend (serves the frontend + helps with OIDC login to avoid CORS)
- public/index.html — Main web interface
- No database is required (tokens live in the browser)

## Notes

- Video generation happens directly from your browser to xAI’s API.
- The server only assists with the login flow and basic utilities (like file downloads).
- Rate limiting / concurrent generation limits are currently handled client-side.

## Credits

Built as a community-friendly web frontend for Grok Build.
For questions or issues, open an issue on GitHub or email swinggirl@proton.me.
