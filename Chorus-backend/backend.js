import express from 'express';
import querystring from 'querystring';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
dotenv.config();

import crypto from 'crypto';

const generateRandomSecret = () => {
  return crypto.randomBytes(20).toString('hex');
};

const strongSecret = generateRandomSecret();

const client_id = process.env.client_id;
const client_secret = process.env.client_secret;
const redirect_uri = process.env.REDIRECT_URI;
const port = 8888;

const app = express();
app.use(cors());

// Use sessions
app.use(session({
  secret: 'your-secret-key', // Change this to a secure value
  resave: false,
  saveUninitialized: true,
}));

let isAuthenticated = false;

app.get('/login', (req, res) => {
  const scope = 'user-read-private user-read-email user-top-read user-read-recently-played';
  const state = Math.random().toString(36).substring(2, 15);

  const redirectUrl = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id,
      scope,
      redirect_uri,
      state,
    });

  res.json({ redirectUrl, state });
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (!code || !state) {
    return res.status(400).send('Error: Missing authorization code or state');
  }

  if (state !== req.query.state) {
    return res.status(403).send('Error: Invalid state parameter');
  }

  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    method: 'post',
    params: {
      code,
      redirect_uri,
      grant_type: 'authorization_code',
    },
    headers: {
      'Authorization': 'Basic ' + (Buffer.from(client_id + ':' + client_secret).toString('base64')),
    },
  };

  try {
    const response = await axios(authOptions);
    const access_token = response.data.access_token;
    const refresh_token = response.data.refresh_token;
    const expireTime = response.data.expires_in;
    console.log(expireTime)
    // Store the access token in the session
    req.session.access_token = access_token;
    isAuthenticated = true;

    // Redirect without exposing the access token in the URL
    res.redirect(`http://localhost:5173/?access_token=${access_token}&refresh_token=${refresh_token}`);
  } catch (error) {
    console.error('Error during token exchange:', error);
    res.status(500).send('Error during token exchange');
  }
});


app.listen(port, () => console.info(`Listening on port ${port}`));
