const sessionMiddleware = require('./session');
const db = require('./db');
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const { Issuer, generators } = require('openid-client');
const { Readable } = require('stream');

const app = express();

app.use(sessionMiddleware);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// share the express session with socket.io so we know who is connected
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

app.use(express.static('public'));

let xaiClient;

// initialize the oidc client using xai's discovery endpoint
async function initOIDC() {
  try {
    const xaiIssuer = await Issuer.discover('https://auth.x.ai');
    xaiClient = new xaiIssuer.Client({
      client_id: 'b1a00492-073a-47ea-816f-4c329264a828',
      response_types: ['code'],
      token_endpoint_auth_method: 'none', // the cli does not use a client secret
      id_token_signed_response_alg: 'ES256' // explicitly tell the client to expect xAI's ES256 algorithm
    });
    console.log('oidc client initialized');
  } catch (err) {
    console.error('failed to initialize oidc:', err);
  }
}
initOIDC();

// endpoint for the frontend to check if a user is already logged in
app.get('/auth/status', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true });
  } else {
    res.json({ loggedIn: false });
  }
});

// 1. login route: generates the login link to give to the frontend
app.get('/login-url', (req, res) => {
  if (!xaiClient) return res.status(500).json({ error: 'OIDC client not ready' });

  const code_verifier = generators.codeVerifier();
  const code_challenge = generators.codeChallenge(code_verifier);

  // keep the verifier in the session so we can verify the pasted code later
  req.session.codeVerifier = code_verifier;

  // we must hardcode the cli's redirect uri here
  const authUrl = xaiClient.authorizationUrl({
    scope: 'openid profile email offline_access grok-cli:access api:access',
    code_challenge,
    code_challenge_method: 'S256',
    redirect_uri: 'http://127.0.0.1/callback' 
  });

  res.json({ url: authUrl });
});

// 2. callback route: handles the manually pasted callback code or url
app.post('/auth/callback-manual', express.json(), async (req, res) => {
  try {
    const { pastedInput } = req.body;
    if (!pastedInput) return res.status(400).json({ error: 'No input provided' });

    const code_verifier = req.session.codeVerifier;
    if (!code_verifier) {
      return res.status(400).json({ error: 'Session expired. Please click login again.' });
    }

    // if they pasted the raw code, wrap it in a dummy url for the parser.
    // if they somehow pasted the full url, use it directly.
    const fullUrl = pastedInput.startsWith('http') 
      ? pastedInput 
      : `http://127.0.0.1/callback?code=${encodeURIComponent(pastedInput.trim())}`;

    const params = xaiClient.callbackParams(fullUrl);

    // exchange the code using the strict loopback uri matching the original request
    const tokenSet = await xaiClient.callback(
      'http://127.0.0.1/callback',
      params,
      { code_verifier }
    );

    let sub = 'unknown_user_' + Date.now();
    let email = 'unknown@example.com';

    // safely attempt to extract user claims
    try {
      const claims = tokenSet.claims();
      sub = claims.sub || sub;
      email = claims.email || email;
    } catch (claimErr) {
      console.log('No standard id_token present, checking access_token for user info...');
      // fallback: Grok CLI often stores claims directly inside the access token JWT
      try {
        const payload = JSON.parse(Buffer.from(tokenSet.access_token.split('.')[1], 'base64').toString());
        sub = payload.sub || payload.user_id || sub;
        email = payload.email || email;
      } catch (e) {
        console.log('Could not decode access token, using fallback IDs.');
      }
    }

    // upsert user
    const userStmt = db.prepare(`
      INSERT INTO users (xai_user_id, email, last_login_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(xai_user_id) DO UPDATE SET
      email=excluded.email, last_login_at=CURRENT_TIMESTAMP
    `);
    userStmt.run(sub, email);

    const userRow = db.prepare('SELECT id FROM users WHERE xai_user_id = ?').get(sub);

    // save tokens
    const tokenStmt = db.prepare(`
      INSERT INTO auth_tokens (user_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    tokenStmt.run(
      userRow.id,
      tokenSet.access_token,
      tokenSet.refresh_token,
      tokenSet.expires_at || Math.floor(Date.now() / 1000) + (6 * 60 * 60) // fallback to 6 hrs if missing
    );

    // establish persistent session state
    req.session.userId = userRow.id;
    req.session.xaiUserId = sub;
    delete req.session.codeVerifier;

    res.json({ success: true });
  } catch (err) {
    console.error('Manual callback processing failed:', err);
    res.status(500).json({ error: err.message || 'Unknown token exchange error.' });
  }
});

// 3. logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// 4. proxy download route to force browser to save the file
app.get('/download', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send('no video url provided');

    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error('failed to fetch video from xai');

    res.setHeader('Content-Disposition', 'attachment; filename="grok-video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');

    // pipe the web stream directly to the express response
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error('download proxy error:', err);
    res.status(500).send('download failed');
  }
});

const MAX_CONCURRENT = 15;
const RATE_LIMIT = 50;
const RATE_WINDOW = 60 * 60 * 1000;

const rateLimitMap = new Map();
let activeJobs = 0;

function getClientIP(socket) {
  return socket.handshake.headers['cf-connecting-ip'] || socket.handshake.address || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  let timestamps = rateLimitMap.get(ip).filter(ts => now - ts < RATE_WINDOW);
  rateLimitMap.set(ip, timestamps);
  return timestamps.length < RATE_LIMIT;
}

function recordGeneration(ip) {
  const timestamps = rateLimitMap.get(ip) || [];
  timestamps.push(Date.now());
  rateLimitMap.set(ip, timestamps);
}

io.on('connection', (socket) => {
  const ip = getClientIP(socket);

  socket.on('generate', async (data) => {
    // get user id from the session we wrapped earlier
    const userId = socket.request.session.userId;
    if (!userId) {
      return socket.emit('error', 'You must be logged in to generate videos.');
    }

    const { prompt, duration, aspectRatio, resolution } = data;

    if (!checkRateLimit(ip)) {
      return socket.emit('rate-limited');
    }

    if (activeJobs >= MAX_CONCURRENT) {
      return socket.emit('queued', 'Server is at capacity. Please try again in a moment.');
    }

    // fetch the user's latest token directly from the database
    const tokenRow = db.prepare('SELECT access_token FROM auth_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    if (!tokenRow || !tokenRow.access_token) {
      return socket.emit('error', 'No access token found. Please log in again.');
    }
    
    const accessToken = tokenRow.access_token;

    activeJobs++;
    recordGeneration(ip);
    socket.emit('start', { prompt });

    try {
      const startRes = await fetch('https://api.x.ai/v1/videos/generations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${accessToken}`,
          'X-XAI-Token-Auth': 'xai-grok-cli',
          'x-grok-client-version': '0.2.16'
        },
        body: JSON.stringify({
          model: "grok-imagine-video",
          prompt,
          duration: parseInt(duration),
          aspect_ratio: aspectRatio,
          resolution
        })
      });

      if (!startRes.ok) throw new Error('Failed to start generation');
      const { request_id } = await startRes.json();

      let done = false;
      while (!done) {
        await new Promise(r => setTimeout(r, 4000));
        const statusRes = await fetch(`https://api.x.ai/v1/videos/${request_id}`, {
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'X-XAI-Token-Auth': 'xai-grok-cli',
            'x-grok-client-version': '0.2.16'
          }
        });
        const resp = await statusRes.json();

        if (resp.status === 'done') {
          socket.emit('media', { url: resp.video.url, prompt });
          done = true;
        } else if (resp.status === 'failed' || resp.status === 'expired') {
          socket.emit('error', 'Generation failed or was moderated by xAI.');
          done = true;
        }
      }
    } catch (e) {
      socket.emit('error', e.message || 'Generation failed');
    } finally {
      activeJobs--;
    }
  });
});

httpServer.listen(5585, () => console.log('Grok Build Web ready on :5585'));