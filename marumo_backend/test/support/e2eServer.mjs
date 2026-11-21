import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { createMemoryRepository } from '../../src/repository.js';
import { testSession } from './sessionOptions.js';

const BACKEND_PORT = 3700;
const TOKEN_API_PORT = 3626;
const tokens = [];

const repository = createMemoryRepository('e2e');
const seededAt = Date.now();
const nowShowing = await repository.createMovie({
  movieCode: 'E2E-MOV-001', title: 'Phim E2E Đang Chiếu', originalTitle: null, slug: 'phim-e2e-dang-chieu',
  synopsis: 'Nội dung phim E2E đang chiếu để kiểm tra web đọc catalog thật.', durationMinutes: 100,
  releaseDate: '2026-11-01', endDate: '2026-12-31', productionYear: 2026, productionCompany: 'E2E Studio',
  directorDisplay: 'Đạo diễn E2E', originalLanguageCode: 'vi', status: 'NOW_SHOWING', isFeatured: true,
}, seededAt);
await repository.createMovie({
  movieCode: 'E2E-MOV-002', title: 'Phim E2E Sắp Chiếu', originalTitle: null, slug: 'phim-e2e-sap-chieu',
  synopsis: 'Nội dung phim E2E sắp chiếu.', durationMinutes: 95,
  releaseDate: '2026-12-15', endDate: null, productionYear: 2026, productionCompany: 'E2E Studio',
  directorDisplay: 'Đạo diễn E2E', originalLanguageCode: 'vi', status: 'COMING_SOON', isFeatured: false,
}, seededAt);
await repository.createMovie({
  movieCode: 'E2E-MOV-003', title: 'Phim E2E Nổi Bật Hai', originalTitle: null, slug: 'phim-e2e-noi-bat-hai',
  synopsis: 'Nội dung phim E2E nổi bật thứ hai cho carousel.', durationMinutes: 110,
  releaseDate: '2026-11-02', endDate: '2026-12-30', productionYear: 2026, productionCompany: 'E2E Studio',
  directorDisplay: 'Đạo diễn E2E', originalLanguageCode: 'vi', status: 'NOW_SHOWING', isFeatured: true,
}, seededAt);
const seededVersion = await repository.createMovieVersion(nowShowing.id, {
  versionCode: 'V2D', versionName: '2D Phụ đề tiếng Việt', audioLanguageId: 1, subtitleLanguageId: null,
  formatId: 1, isOriginalAudio: true, isActive: true,
}, seededAt);
await repository.createShowtime({
  showtimeCode: 'E2E-ST-001', branchId: '1', auditoriumId: '1', movieVersionId: seededVersion.id,
  status: 'OPEN_FOR_BOOKING', startAt: new Date(seededAt + 2 * 3600000).toISOString().slice(0, 19),
  endAt: new Date(seededAt + 4 * 3600000).toISOString().slice(0, 19), preparationMinutes: 15,
  cleanupMinutes: 15, baseTicketPrice: 75000, salesOpenAt: null, salesCloseAt: null,
}, '1', seededAt);
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
