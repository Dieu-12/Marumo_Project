:ON ERROR EXIT
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
GO
IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb')
    THROW 52700, N'Chọn database MARUMO trước khi chạy migration.', 1;
IF OBJECT_ID(N'dbo.booking_seats',N'U') IS NULL
    THROW 52700, N'Database chưa có schema MARUMO.', 1;
BEGIN TRANSACTION;
GO

-- Add scanned_at column to bookings table
IF COL_LENGTH(N'dbo.bookings',N'scanned_at') IS NULL
    ALTER TABLE dbo.bookings ADD scanned_at DATETIME2(0) NULL;
GO

COMMIT TRANSACTION;
GO

-- Procedure: usp_booking_scan
-- Quét booking (check-in tại cổng), chỉ được 1 lần
CREATE OR ALTER PROCEDURE dbo.usp_booking_scan
    @booking_code        VARCHAR(40),
    @branch_id           BIGINT,
    @scanned_by_user_id  BIGINT,
    @device_code         VARCHAR(50) = NULL,
    @scan_at             DATETIME2(0) = NULL,
    @early_entry_minutes SMALLINT = 30,
    @late_entry_minutes  SMALLINT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @booking_code IS NULL OR LTRIM(RTRIM(@booking_code)) = ''
        THROW 52701, N'Mã booking không được để trống.', 1;

    IF @early_entry_minutes < 0 OR @late_entry_minutes < 0
        THROW 52702, N'Khung thời gian vào rạp không hợp lệ.', 1;

    SET @scan_at = COALESCE(@scan_at, SYSDATETIME());

    DECLARE @confirmed_status_id SMALLINT =
        (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'CONFIRMED' AND is_active = 1);
    IF @confirmed_status_id IS NULL
        THROW 52703, N'Chưa cấu hình trạng thái booking CONFIRMED.', 1;

    DECLARE @booking_id BIGINT,
            @booking_status_code VARCHAR(30),
            @booking_branch_id BIGINT,
            @showtime_id BIGINT,
            @showtime_start_at DATETIME2(0),
            @showtime_end_at DATETIME2(0),
            @scanned_at_existing DATETIME2(0);

    DECLARE @scan_result BIT = 0;
    DECLARE @scan_error NVARCHAR(300);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Lock booking row for update
        SELECT @booking_id = b.booking_id,
               @booking_status_code = bs.status_code,
               @booking_branch_id = b.branch_id,
               @showtime_id = b.showtime_id,
               @scanned_at_existing = b.scanned_at
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_statuses bs ON bs.booking_status_id = b.booking_status_id
        WHERE b.booking_code = @booking_code;

        IF @booking_id IS NULL
        BEGIN
            SET @scan_error = N'Booking không tồn tại.';
        END
        ELSE IF @booking_status_code <> 'CONFIRMED'
        BEGIN
            SET @scan_error = N'Booking không ở trạng thái CONFIRMED.';
        END
        ELSE IF @booking_branch_id <> @branch_id
        BEGIN
            SET @scan_error = N'Booking thuộc chi nhánh khác.';
        END
        ELSE IF @scanned_at_existing IS NOT NULL
        BEGIN
            SET @scan_error = N'Booking đã được quét trước đó.';
        END
        ELSE
        BEGIN
            -- Check showtime timing
            SELECT @showtime_start_at = s.start_at,
                   @showtime_end_at = s.end_at
            FROM dbo.showtimes s
            WHERE s.showtime_id = @showtime_id;

            IF @showtime_start_at IS NULL OR @showtime_end_at IS NULL
            BEGIN
                SET @scan_error = N'Suất chiếu không hợp lệ.';
            END
            ELSE IF @scan_at < DATEADD(MINUTE, -@early_entry_minutes, @showtime_start_at)
                 OR @scan_at > DATEADD(MINUTE, @late_entry_minutes, @showtime_end_at)
            BEGIN
                SET @scan_error = N'Ngoài thời gian cho phép vào rạp.';
            END
            ELSE
            BEGIN
                -- Update booking scanned_at
                UPDATE dbo.bookings
                SET scanned_at = @scan_at,
                    updated_at = SYSUTCDATETIME()
                WHERE booking_id = @booking_id
                  AND scanned_at IS NULL;

                IF @@ROWCOUNT = 1
                BEGIN
                    SET @scan_result = 1;
                    SET @scan_error = NULL;
                END
                ELSE
                BEGIN
                    SET @scan_error = N'Booking vừa được quét bởi giao dịch khác.';
                END;
            END;
        END;

        -- Log scan attempt to ticket_validations for ALL tickets of this booking
        IF @scan_result = 1
        BEGIN
            DECLARE @issued_status_id SMALLINT =
                (SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'ISSUED');
            DECLARE @used_status_id SMALLINT =
                (SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'USED');

            IF @issued_status_id IS NULL OR @used_status_id IS NULL
                THROW 52704, N'Chưa cấu hình trạng thái vé ISSUED/USED.', 1;

            -- Get all tickets for this booking
            DECLARE @ticket_ids TABLE (ticket_id BIGINT PRIMARY KEY, booking_seat_id BIGINT NOT NULL);
            INSERT INTO @ticket_ids (ticket_id, booking_seat_id)
            SELECT t.ticket_id, t.booking_seat_id
            FROM dbo.tickets t
            JOIN dbo.booking_seats bs ON bs.booking_seat_id = t.booking_seat_id
            WHERE bs.booking_id = @booking_id
              AND t.ticket_status_id = @issued_status_id;

            -- Update all tickets to USED
            UPDATE t
            SET t.ticket_status_id = @used_status_id,
                t.used_at = @scan_at
            FROM dbo.tickets t
            JOIN @ticket_ids ti ON ti.ticket_id = t.ticket_id;

            -- Log validation for each ticket
            INSERT INTO dbo.ticket_validations (
                ticket_id, scanned_qr_hash, validated_by_user_id, branch_id,
                validation_result, rejection_reason, device_code, scanned_at
            )
            SELECT
                ti.ticket_id,
                t.qr_token_hash,
                @scanned_by_user_id,
                @branch_id,
                'ACCEPTED',
                NULL,
                @device_code,
                @scan_at
            FROM @ticket_ids ti
            JOIN dbo.tickets t ON t.ticket_id = ti.ticket_id;
        END
        ELSE
        BEGIN
            -- Log failed scan attempt (no ticket_id since booking not found or invalid)
            INSERT INTO dbo.ticket_validations (
                ticket_id, scanned_qr_hash, validated_by_user_id, branch_id,
                validation_result, rejection_reason, device_code, scanned_at
            )
            VALUES (
                NULL,
                @booking_code,
                @scanned_by_user_id,
                @branch_id,
                'REJECTED',
                @scan_error,
                @device_code,
                @scan_at
            );
        END;

        COMMIT TRANSACTION;

        -- Return result
        SELECT
            @booking_id AS booking_id,
            @booking_code AS booking_code,
            @booking_status_code AS status,
            @scan_at AS scanned_at,
            @scan_result AS success,
            @scan_error AS error_message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO