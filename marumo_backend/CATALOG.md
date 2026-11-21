# Movie catalog API

The movie catalog API stores movie metadata in `dbo.movies`. Genres, media, ratings, movie versions, and showtimes use separate tables and are outside this API.

## Authentication and permissions

Every endpoint requires the `marumo_session` cookie issued by `POST /auth/login`. Expired, revoked, disabled, and temporarily locked sessions are rejected.

The permission must belong to an active `GLOBAL` role assigned to the user without revocation. A `BRANCH` role cannot manage the global movie catalog. An unrelated global role does not promote a branch permission.

POST and PATCH require `X-CSRF-Token` to match the `marumo_csrf` cookie. A supplied `Origin` must appear in `ALLOWED_ORIGINS`. Requests without an `Origin` still require the CSRF proof.

| Method | Path | Permission | Success |
| --- | --- | --- | --- |
| GET | `/admin/movies` | `movie.create` or `movie.update` | 200 with `{ movies, nextAfter }` |
| GET | `/admin/movies/:movieId` | `movie.create` or `movie.update` | 200 with `{ movie }` |
| POST | `/admin/movies` | `movie.create` | 201 with `{ movie }` and a `Location` header |
| PATCH | `/admin/movies/:movieId` | `movie.update` | 200 with `{ movie }` |

## Movie fields

POST requires `movieCode`, `title`, `slug`, and `durationMinutes`. PATCH accepts a nonempty subset of the writable fields. Omitted fields retain their values during PATCH. Unexpected fields are rejected.

| Field | Accepted value | POST default |
| --- | --- | --- |
| `movieCode` | 1 to 30 ASCII letters, digits, underscores, or hyphens. First character is a letter or digit. Trimmed and uppercased. Unique. | Required |
| `title` | 1 to 250 characters after trimming | Required |
| `slug` | 1 to 280 ASCII letters or digits, with single hyphens between words. Trimmed and lowercased. Unique. | Required |
| `durationMinutes` | Integer from 1 to 600 | Required |
| `originalTitle` | Null or 1 to 250 trimmed characters | Null |
| `synopsis` | Null or 1 to 8000 trimmed characters | Null |
| `releaseDate`, `endDate` | Null or a real `YYYY-MM-DD` date from year 0001 to 9999 | Null |
| `productionYear` | Null or an integer from 1888 to 2100 | Null |
| `productionCompany` | Null or 1 to 200 trimmed characters | Null |
| `directorDisplay` | Null or 1 to 250 trimmed characters | Null |
| `originalLanguageCode` | Null or 1 to 10 ASCII letters, digits, or hyphens | Null |
| `status` | `DRAFT`, `PUBLISHED`, `COMING_SOON`, `NOW_SHOWING`, `ENDED`, or `ARCHIVED` | `DRAFT` |
| `isFeatured` | Boolean | False |

When both dates exist, `endDate` must be on or after `releaseDate`. SQL checks this rule atomically against the stored row during PATCH. Concurrent PATCH requests retain changes to different fields. For the same field, the last completed update wins.

`id`, `createdAt`, and `updatedAt` are read-only. IDs are positive decimal strings within SQL Server BIGINT range, including values above JavaScript's safe integer range. Calendar dates have no timezone. Technical timestamps are UTC ISO strings ending in `Z`.

The JSON request body limit is 16 KB, including all fields and their UTF-8 encoding.

## Pagination

`GET /admin/movies` accepts only `limit`, `after`, and `status`.

`limit` is an integer from 1 to 100 and defaults to 25. `after` is a positive decimal movie ID. Omit `after` for the first page. `status` optionally filters by one movie status. Results use ascending movie ID order.

`nextAfter` is the last returned ID when another matching row exists, or null at the end. Use that value as `after` on the next request with the same status filter. Pages reflect current data and are not a fixed snapshot.

## Errors

Errors include `code`, `message`, and `requestId`. The request ID matches the `X-Request-Id` response header. Internal failures return a generic message.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Invalid body, field, date window, query, or movie ID |
| 401 | `SESSION_INVALID` | Missing or unusable session |
| 403 | `PERMISSION_DENIED` | Required globally scoped permission is absent |
| 403 | `CSRF_INVALID` | CSRF proof is missing or does not match |
| 403 | `ORIGIN_INVALID` | Supplied origin is not configured |
| 404 | `MOVIE_NOT_FOUND` | Movie does not exist |
| 409 | `MOVIE_CONFLICT` | Movie code or slug is already used |
| 500 | `INTERNAL` | Unexpected server failure |
