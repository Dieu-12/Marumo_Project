export function createCatalogService(repository, { now = Date.now } = {}) {
  return {
    async listMovies(query) {
      return repository.listMovies({ ...query, limit: query.limit + 1 });
    },
    async findMovie(movieId) {
      return repository.findMovie(movieId);
    },
    async createMovie(input) {
      return repository.createMovie(input, now());
    },
    async updateMovie(movieId, input) {
      return repository.updateMovie(movieId, input, now());
    },
    async createMovieVersion(movieId, input) {
      return repository.createMovieVersion(movieId, input, now());
    },
    async createShowtime(input, userId) {
      return repository.createShowtime(input, userId, now());
    },
  };
}
