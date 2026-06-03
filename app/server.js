const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const crypto = require('crypto');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.static('public'));
app.use(express.json());

// ==================== OIDC LOGIN ====================
app.get('/login-url', (req, res) => {
  try {
    const code_verifier = crypto.randomBytes(32).toString('base64url');
    const code_challenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    const params = new URLSearchParams({
      client_id: 'b1a00492-073a-47ea-816f-4c329264a828',
      redirect_uri: 'http://127.0.0.1/callback',
      response_type: 'code',
      scope: 'openid profile email offline_access grok-cli:access api:access',
      code_challenge: code_challenge,
      code_challenge_method: 'S256',
      state: crypto.randomBytes(16).toString('hex')
    });

    const loginUrl = `https://auth.x.ai/oauth2/authorize?${params.toString()}`;

    res.json({
      url: loginUrl,
      code_verifier: code_verifier
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate login URL' });
  }
});

// Exchange code for tokens (server-side to avoid CORS)
app.post('/auth/exchange', async (req, res) => {
  const { code, code_verifier } = req.body;

  if (!code || !code_verifier) {
    return res.status(400).json({ error: 'Missing code or code_verifier' });
  }

  try {
    const tokenRes = await fetch('https://auth.x.ai/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'http://127.0.0.1/callback',
        client_id: 'b1a00492-073a-47ea-816f-4c329264a828',
        code_verifier: code_verifier
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      res.json({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null
      });
    } else {
      res.status(400).json({ error: tokenData.error || 'Token exchange failed' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error during token exchange' });
  }
});

// Auth status (frontend now checks localStorage instead)
app.get('/auth/status', (req, res) => {
  res.json({ loggedIn: false });
});

// Logout
app.get('/logout', (req, res) => {
  res.redirect('/');
});

// Download helper
app.get('/download', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing URL');
  res.redirect(url);
});

// WebSocket (kept for future use)
io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 5585;
httpServer.listen(PORT, () => {
  console.log(`Grok Build Web running on port ${PORT}`);
});