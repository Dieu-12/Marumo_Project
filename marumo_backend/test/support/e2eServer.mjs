import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { createMemoryRepository } from '../../src/repository.js';
import { testSession } from './sessionOptions.js';

const BACKEND_PORT = 3700;
const TOKEN_API_PORT = 3626;
const tokens = [];

const repository = createMemoryRepository('e2e');
const app = await createApp({
  repository,
  session: testSession(3600),
  logger: { error: () => {} },
  sendVerification: async ({ token }) => {
    tokens.push(token);
  },
  verificationUrl: 'http://127.0.0.1:5175/xac-thuc-email',
  allowedOrigins: ['http://127.0.0.1:5175', 'http://localhost:5175'],
});
app.listen(BACKEND_PORT, '127.0.0.1');

createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ token: tokens[tokens.length - 1] ?? null, count: tokens.length }));
}).listen(TOKEN_API_PORT, '127.0.0.1');
