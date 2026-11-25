:ON ERROR EXIT
SET XACT_ABORT ON;
GO
USE [$(DATABASE_NAME)];
GO

IF OBJECT_ID(N'dbo.usp_showtime_create', N'P') IS NULL
    THROW 53100, N'dbo.usp_showtime_create does not exist.', 1;
IF EXISTS (
    SELECT 1 FROM dbo.system_settings
    WHERE setting_key = 'SHOWTIME_AUTO_SEATS_VERSION' AND setting_value = '1'
)
BEGIN
    PRINT N'Showtime auto seat generation already enabled.';
    RETURN;
END;

BEGIN TRANSACTION;

DECLARE @definition NVARCHAR(MAX);

SET @definition = OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_showtime_create'));
IF @definition IS NULL
    THROW 53101, N'Cannot read dbo.usp_showtime_create definition.', 1;

IF CHARINDEX(N'INSERT INTO dbo.showtime_seats', @definition) > 0
    THROW 53102, N'dbo.usp_showtime_create already contains seat generation logic.', 1;

-- Check for the exact pattern
IF CHARINDEX(N'SET @showtime_id = SCOPE_IDENTITY();', @definition) = 0
    THROW 53103, N'dbo.usp_showtime_create does not have expected SCOPE_IDENTITY.', 1;

-- Insert seat generation logic after SET @showtime_id = SCOPE_IDENTITY();
SET @definition = REPLACE(
    @definition,
    N'SET @showtime_id = SCOPE_IDENTITY();',
    N'SET @showtime_id = SCOPE_IDENTITY();

        -- Auto-generate seats for this showtime from auditorium layout
        INSERT INTO dbo.showtime_seats (auditorium_id, showtime_id, seat_id, seat_status, base_price, final_price)
        SELECT st.auditorium_id, st.showtime_id, s.seat_id, N''AVAILABLE'',
               st.base_ticket_price + CASE WHEN stp.type_code = N''PREMIUM'' THEN 25000 ELSE 0 END,
               st.base_ticket_price + CASE WHEN stp.type_code = N''PREMIUM'' THEN 25000 ELSE 0 END
        FROM dbo.showtimes st
        JOIN dbo.seats s ON s.auditorium_id = st.auditorium_id
        JOIN dbo.seat_types stp ON stp.seat_type_id = s.seat_type_id
        WHERE st.showtime_id = @showtime_id
          AND NOT EXISTS (
              SELECT 1 FROM dbo.showtime_seats ss
              WHERE ss.showtime_id = st.showtime_id AND ss.seat_id = s.seat_id
          );'
);

IF CHARINDEX(N'INSERT INTO dbo.showtime_seats', @definition) = 0
    THROW 53104, N'Failed to inject seat generation logic.', 1;

IF CHARINDEX(N'CREATE', @definition) = 0
    THROW 53105, N'dbo.usp_showtime_create definition does not have CREATE prefix.', 1;

SET @definition = STUFF(@definition, CHARINDEX(N'CREATE', @definition), 6, N'ALTER');
EXEC sys.sp_executesql @definition;

INSERT dbo.system_settings (setting_key, setting_value, value_type, description)
VALUES ('SHOWTIME_AUTO_SEATS_VERSION', '1', 'INTEGER', N'Showtime auto seat generation enabled');

COMMIT TRANSACTION;
GO