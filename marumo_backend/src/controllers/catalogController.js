import { HttpError } from '../utils/validation.js';
import { parseMovieInput, parseMovieId, parseMovieQuery, parseMovieVersionInput, parseShowtimeInput, parseShowtimeUpdateInput } from '../utils/catalogValidation.js';
import { createCatalogService } from '../services/catalogService.js';

function requireMovie(movie) {
  if (!movie) throw new HttpError(404, 'MOVIE_NOT_FOUND', 'Movie not found.');
  return movie;
}

export function createCatalogController(repository, { now = Date.now } = {}) {
  const service = createCatalogService(repository, { now });
  return {
    async listMovies(req, res) {
      const query = parseMovieQuery(req.query);
      const rows = await service.listMovies(query);
      const movies = rows.slice(0, query.limit);
      const nextAfter = rows.length > query.limit ? movies[movies.length - 1].id : null;
      res.status(200).json({ movies, nextAfter });
    },
    async getMovie(req, res) {
      const movie = requireMovie(await service.findMovie(parseMovieId(req.params.movieId)));
      res.status(200).json({ movie });
    },
    async createMovie(req, res) {
      const movie = await service.createMovie(parseMovieInput(req.body));
      res.status(201).location(`/admin/movies/${movie.id}`).json({ movie });
    },
    async updateMovie(req, res) {
      const id = parseMovieId(req.params.movieId);
      const movie = requireMovie(await service.updateMovie(id, parseMovieInput(req.body, { partial: true })));
      res.status(200).json({ movie });
    },
    async createMovieVersion(req, res) {
      const movieId = parseMovieId(req.params.movieId);
      requireMovie(await service.findMovie(movieId));
      const version = await service.createMovieVersion(movieId, parseMovieVersionInput(req.body));
      res.status(201).location(`/admin/movies/${movieId}/versions/${version.id}`).json({ version });
    },
    async createShowtime(req, res) {
      const showtime = await service.createShowtime(parseShowtimeInput(req.body), req.session.userId);
      res.status(201).location(`/admin/showtimes/${showtime.id}`).json({ showtime });
    },
    async listShowtimes(req, res) {
      const showtimes = await service.listShowtimes();
      res.status(200).json({ showtimes });
    },
    async updateShowtime(req, res) {
      const id = parseMovieId(req.params.showtimeId);
      const showtime = await service.updateShowtime(id, parseShowtimeUpdateInput(req.body));
      if (!showtime) throw new HttpError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');
      res.status(200).json({ showtime });
    },
  };
}
