:ON ERROR EXIT
SET XACT_ABORT ON;
GO
USE [$(DATABASE_NAME)];
GO

BEGIN TRANSACTION;
GO

CREATE OR ALTER PROCEDURE dbo.usp_showtime_create
    @showtime_code       VARCHAR(40),
    @branch_id           BIGINT,
    @auditorium_id       BIGINT,
    @movie_version_id    BIGINT,
    @status_code         VARCHAR(30) = 'DRAFT',
    @start_at            DATETIME2(0),
    @end_at              DATETIME2(0),
    @preparation_minutes SMALLINT = 15,
    @cleanup_minutes     SMALLINT = 15,
    @base_ticket_price   DECIMAL(12,2),
    @sales_open_at       DATETIME2(0) = NULL,
    @sales_close_at      DATETIME2(0) = NULL,
    @created_by_user_id  BIGINT,
    @showtime_id         BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @status_id SMALLINT =
        (SELECT status_id FROM dbo.showtime_statuses WHERE status_code = @status_code AND is_active = 1);
    IF @status_id IS NULL
        THROW 51001, N'Trạng thái suất chiếu không tồn tại hoặc đã ngừng sử dụng.', 1;

    IF @end_at <= @start_at
        THROW 51002, N'Thời điểm kết thúc phải sau thời điểm bắt đầu.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.auditoriums a
        JOIN dbo.branches b
          ON b.branch_id = a.branch_id AND b.status = 'ACTIVE'
        JOIN dbo.movie_versions mv
          ON mv.movie_version_id = @movie_version_id
         AND mv.is_active = 1
        JOIN dbo.screening_formats f
          ON f.format_id = mv.format_id AND f.is_active = 1
        JOIN dbo.auditorium_screening_formats asf
          ON asf.auditorium_id = a.auditorium_id
         AND asf.format_id = mv.format_id
         AND asf.is_active = 1
        WHERE a.auditorium_id = @auditorium_id
          AND a.branch_id = @branch_id
          AND a.is_active = 1
    )
        THROW 51003, N'Phòng chiếu không thuộc chi nhánh hoặc không hỗ trợ định dạng của phiên bản phim.', 1;

    DECLARE @movie_duration SMALLINT;
    SELECT @movie_duration = m.duration_minutes
    FROM dbo.movie_versions mv
    JOIN dbo.movies m ON m.movie_id = mv.movie_id
    WHERE mv.movie_version_id = @movie_version_id;

    IF @movie_duration IS NOT NULL
       AND @end_at < DATEADD(MINUTE, @movie_duration, @start_at)
        THROW 51004, N'Thời điểm kết thúc phải sau khi phim kết thúc (tối thiểu bằng thời lượng phim).', 1;

    DECLARE @cancelled_status_id SMALLINT =
        (SELECT status_id FROM dbo.showtime_statuses WHERE status_code = 'CANCELLED');
    IF @cancelled_status_id IS NULL
        THROW 51005, N'Chưa cấu hình trạng thái CANCELLED.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (
            SELECT 1
            FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK)
            WHERE s.auditorium_id = @auditorium_id
              AND s.status_id <> @cancelled_status_id
              AND DATEADD(MINUTE, -s.preparation_minutes, s.start_at) < DATEADD(MINUTE, @cleanup_minutes, @end_at)
              AND DATEADD(MINUTE, s.cleanup_minutes, s.end_at) > DATEADD(MINUTE, -@preparation_minutes, @start_at)
        )
            THROW 51006, N'Khoảng chiếm dụng phòng bị trùng với suất chiếu khác.', 1;

        INSERT INTO dbo.showtimes (
            showtime_code, branch_id, auditorium_id, movie_version_id, status_id,
            start_at, end_at, preparation_minutes, cleanup_minutes, base_ticket_price,
            sales_open_at, sales_close_at, created_by_user_id
        )
        VALUES (
            @showtime_code, @branch_id, @auditorium_id, @movie_version_id, @status_id,
            @start_at, @end_at, @preparation_minutes, @cleanup_minutes, @base_ticket_price,
            @sales_open_at, @sales_close_at, @created_by_user_id
        );

        SET @showtime_id = SCOPE_IDENTITY();

        INSERT INTO dbo.showtime_seats (auditorium_id, showtime_id, seat_id, seat_status, base_price, final_price)
        SELECT @auditorium_id, @showtime_id, s.seat_id,
               CASE WHEN EXISTS (
                   SELECT 1
                   FROM dbo.seat_unavailability u
                   WHERE u.seat_id = s.seat_id
                     AND u.status = 'ACTIVE'
                     AND u.start_at < @end_at
                     AND (u.end_at IS NULL OR u.end_at > @start_at)
               ) THEN 'UNAVAILABLE' ELSE 'AVAILABLE' END,
               @base_ticket_price + CASE WHEN stp.type_code = 'PREMIUM' THEN 25000 ELSE 0 END,
               @base_ticket_price + CASE WHEN stp.type_code = 'PREMIUM' THEN 25000 ELSE 0 END
        FROM dbo.seat_layout_versions lv
        JOIN dbo.seat_layout_version_seats ls
          ON ls.layout_version_id = lv.layout_version_id
         AND ls.auditorium_id = lv.auditorium_id
         AND ls.is_enabled = 1
        JOIN dbo.seats s
          ON s.seat_id = ls.seat_id
         AND s.auditorium_id = lv.auditorium_id
         AND s.seat_status = 'ACTIVE'
        JOIN dbo.seat_types stp
          ON stp.seat_type_id = s.seat_type_id
         AND stp.is_active = 1
        WHERE lv.auditorium_id = @auditorium_id
          AND lv.version_status = 'PUBLISHED';

        IF @@ROWCOUNT = 0
            THROW 51007, N'Phòng chiếu chưa có ghế hợp lệ trong sơ đồ đã công bố.', 1;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

IF EXISTS (SELECT 1 FROM dbo.system_settings WHERE setting_key = 'SHOWTIME_AUTO_SEATS_VERSION')
BEGIN
    UPDATE dbo.system_settings
    SET setting_value = N'2',
        value_type = 'INTEGER',
        description = N'Showtime seat inventory follows the published layout and seat availability',
        updated_at = SYSUTCDATETIME()
    WHERE setting_key = 'SHOWTIME_AUTO_SEATS_VERSION'
      AND (setting_value <> N'2' OR value_type <> 'INTEGER');
END
ELSE
BEGIN
    INSERT dbo.system_settings (setting_key, setting_value, value_type, description)
    VALUES ('SHOWTIME_AUTO_SEATS_VERSION', N'2', 'INTEGER', N'Showtime seat inventory follows the published layout and seat availability');
END;

COMMIT TRANSACTION;
GO
