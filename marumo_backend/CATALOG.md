# Movie catalog API

The movie catalog API stores movie metadata in `dbo.movies`. Genres, media, ratings, movie versions, and showtimes use separate tables and are outside this API.

## Authentication and permissions

Every endpoint requires the JWT in the `marumo_session` HttpOnly cookie issued by `POST /auth/login`. The server verifies its signature and claims, then checks the current database session. Expired, revoked, disabled, and temporarily locked sessions are rejected.

The permission must belong to an active `GLOBAL` role assigned to the user without revocation. A `BRANCH` role cannot manage the global movie catalog. An unrelated global role does not promote a branch permission.

The JWT role snapshot does not grant permissions. Each request checks current database authorization. Cookie flags and JWT lifetime follow the [backend authentication configuration](README.md#jwt-và-cookie-phiên).

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

## Cinema API

The cinema API reads `branches`, `branch_addresses`, `auditoriums`, and `showtimes` from SQL. It does not require a migration. Branch codes and auditorium codes are immutable. Branch codes are unique across the system. Auditorium codes are unique within a branch. IDs are positive decimal BIGINT strings. Room type and format IDs are positive INT numbers.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/catalog/branches` | `{ branches, nextAfter }` for ACTIVE branches |
| GET | `/catalog/branches/:branchCode` | `{ branch }` for an ACTIVE branch |
| GET | `/catalog/branches/:branchCode/showtimes` | `{ showtimes, nextAfter }` for an ACTIVE branch |
| GET | `/admin/branches/options` | `{ roomTypes, formats }` with active SQL choices |
| GET | `/admin/branches` | `{ branches, nextAfter }` within the caller's scope |
| GET | `/admin/branches/:branchId` | `{ branch }` within the caller's scope |
| POST | `/admin/branches` | 201 with `{ branch }` |
| PATCH | `/admin/branches/:branchId` | `{ branch }` |
| GET | `/admin/branches/:branchId/auditoriums` | `{ auditoriums, nextAfter }` |
| GET | `/admin/branches/:branchId/auditoriums/:auditoriumId` | `{ auditorium }` |
| POST | `/admin/branches/:branchId/auditoriums` | 201 with `{ auditorium }` |
| PATCH | `/admin/branches/:branchId/auditoriums/:auditoriumId` | `{ auditorium }` |

The three `/catalog/branches` endpoints are public. Admin reads require `branch.view`. Writes require both `branch.view` and `branch.update`. Creating a branch requires both permissions with GLOBAL scope. Other writes accept GLOBAL scope or an ACTIVE branch assignment for the same user and role that owns the permission. The role must be active, the user role must not be revoked, and the assignment must have started without ending. SQL applies scope before pagination and rechecks scope inside write transactions. A permission from one role cannot use another role's assignment.

Branch lists accept `limit` from 1 to 100, default 25, and an optional positive ID `after`. Admin lists also accept `status` from ACTIVE, INACTIVE, CLOSED and an optional `branchId`. Auditorium lists accept `limit`, `after`, and optional `isActive=true` or `isActive=false`. Every list sorts by ascending ID and returns `nextAfter` only when another matching row exists. Unknown query fields are rejected.

The public branch fields are `id`, `code`, `name`, `phone`, `email`, `description`, `address`, `addressDetail`, `city`, `latitude`, and `longitude`. The primary address wins, followed by the lowest address ID. Missing address fields are null. Admin responses add `status`, `createdAt`, and `updatedAt`.

Public branch lookup accepts a branch code with 1 to 20 ASCII letters, digits, underscores, or hyphens. The first character is a letter or digit. Codes are normalized to uppercase. Branch showtimes also accept `date=YYYY-MM-DD`, `days` from 1 to 14 with default 3, and optional `movieId`. The default date is today in UTC+07:00. The range begins at midnight in Vietnam and excludes midnight after `days` days. Date ranges must fit SQL DATETIME2. The earliest accepted date is 0001-01-02. Future showtimes use the existing catalog writer's UTC storage convention and return ISO timestamps ending in `Z`.

Public showtimes include `id`, `movieId`, `movieTitle`, `movieSlug`, `movieVersionId`, `versionName`, `branchId`, `branchCode`, `branchName`, `auditoriumId`, `auditoriumName`, `formatCode`, `formatName`, `startAt`, `endAt`, `baseTicketPrice`, `status`, and `isBookable`. Only SCHEDULED, OPEN_FOR_BOOKING, and SOLD_OUT showtimes are public. The branch, auditorium, movie version, and format must be active. The movie must be NOW_SHOWING, COMING_SOON, or PUBLISHED. The existing movie showtime and seat endpoints apply the same visibility checks. `isBookable` additionally requires SCHEDULED or OPEN_FOR_BOOKING, an open sales window, and at least one AVAILABLE inventory seat. Booking verifies availability again.

Branch creation requires `code` and `name`. It accepts nullable `phone`, `email`, and `description`, plus `status`, default INACTIVE. Codes are trimmed and uppercased. Name allows 1 to 150 trimmed characters, phone allows 1 to 20 telephone characters, email allows a valid address up to 255 characters, and description allows 1 to 1000 trimmed characters. PATCH accepts a nonempty subset of `name`, `phone`, `email`, `description`, and `status`.

Auditorium creation requires `code`, `name`, `roomTypeId`, and `formatIds`. Code allows 1 to 30 ASCII letters, digits, underscores, or hyphens. Name allows 1 to 100 trimmed characters. `formatIds` contains 1 to 100 distinct active format IDs. The room type must be active. Optional fields are nullable `description` up to 500 trimmed characters, nullable `screenWidth` and `screenHeight` greater than zero and at most 999999.99 with two decimal places, and boolean `isActive`, default true. PATCH accepts a nonempty subset of these fields except `code`.

Auditorium responses add `id`, `branchId`, `roomTypeName`, `capacity`, `createdAt`, and `updatedAt`. Capacity counts active physical seats with active seat types and enabled entries in the PUBLISHED layout. Capacity, branch ownership, addresses, opening dates, photos, galleries, layouts, seats, and showtime inventory are read-only in this API. No DELETE endpoint exists.

An ACTIVE branch cannot become INACTIVE or CLOSED while it has unfinished showtimes that are not CANCELLED or COMPLETED. An active auditorium has the same deactivation restriction. An auditorium's room type and formats cannot change once any showtime references it. Each write runs in a SERIALIZABLE transaction and saves the metadata, format links, timestamp, and old/new audit values together. Audit uses the authenticated actor and actual branch.

Cinema errors use the standard `code`, `message`, and `requestId` envelope. Invalid fields, unknown fields, malformed IDs, invalid calendar dates, and inactive references return 400 `INVALID_INPUT`. Session and write proof errors use the existing 401/403 codes. Missing general permissions return 403 `PERMISSION_DENIED`. Missing or out-of-scope details return 404 `BRANCH_NOT_FOUND` or `AUDITORIUM_NOT_FOUND`. An out-of-scope `branchId` list filter returns an empty list. Duplicate codes return 409 `BRANCH_CONFLICT` or `AUDITORIUM_CONFLICT`. Protected status or configuration changes return 409 `BRANCH_IN_USE` or `AUDITORIUM_IN_USE`. Lock conflicts return 409 `CINEMA_BUSY`.
