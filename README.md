⚠ **UPDATE: Text-to-video functionality has been stripped from Grok Build, it still works using this tool, but it is heavily moderated. There is little reason to use this at this point. The live site has been taken down for this reason.** ⚠

# Grok Build Web

A clean, browser-based interface for generating videos using Grok Build.

Built for users who want to avoid the terminal while still using Grok Build’s specialized video generation flow.

## Features

- Modern web UI (works on desktop and mobile)
- Secure browser-based login using xAI’s official OIDC flow (same as the Grok Build CLI)
- Simple self-hosted setup with Docker

## How Login Works

When you click **"Login with Grok"**, you are redirected to xAI’s authentication servers. After logging in, your access and refresh tokens are stored in your browser.

## How to Host It Yourself

1. Make sure you have Docker and Docker Compose installed.
2. Clone or download this repository.
3. Run the following command in the project folder:

```bash
docker compose up -d --build
```

4. The site will be available on port 5585 (e.g. http://localhost:5585 or your server’s IP).


## Credits

Built as a community-friendly web frontend for Grok Build.
For questions or issues, open an issue on GitHub or email swinggirl@proton.me.
