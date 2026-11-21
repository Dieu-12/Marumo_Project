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
    THROW 52600, N'Chọn database MARUMO trước khi chạy migration.', 1;
IF OBJECT_ID(N'dbo.booking_seats',N'U') IS NULL
    THROW 52600, N'Database chưa có schema MARUMO.', 1;
BEGIN TRANSACTION;
GO
IF EXISTS (
    SELECT 1 FROM dbo.showtime_seats ss
    JOIN dbo.showtimes st ON st.showtime_id=ss.showtime_id
    JOIN dbo.seats s ON s.seat_id=ss.seat_id
    WHERE st.auditorium_id<>s.auditorium_id
)
    THROW 52601, N'Có ghế suất chiếu sai phòng. Xử lý dữ liệu trước khi chạy migration.', 1;
IF EXISTS (
    SELECT 1 FROM dbo.booking_seats bs
    JOIN dbo.bookings b ON b.booking_id=bs.booking_id
    JOIN dbo.booking_statuses st ON st.booking_status_id=b.booking_status_id
    JOIN dbo.tickets t ON t.booking_seat_id=bs.booking_seat_id
    JOIN dbo.ticket_statuses ts ON ts.ticket_status_id=t.ticket_status_id
    WHERE st.status_code IN ('CANCELLED','EXPIRED') AND ts.status_code IN ('ISSUED','USED')
)
    THROW 52602, N'Booking đã hủy hoặc hết hạn còn vé sử dụng được. Cần xử lý trước migration.', 1;

IF COL_LENGTH(N'dbo.booking_seats',N'released_at') IS NULL
    ALTER TABLE dbo.booking_seats ADD released_at DATETIME2(0) NULL;
EXEC sys.sp_executesql N'
DECLARE @released TABLE(showtime_seat_id BIGINT PRIMARY KEY,booking_id BIGINT NOT NULL);
UPDATE bs SET released_at=COALESCE(b.updated_at,SYSUTCDATETIME())
OUTPUT inserted.showtime_seat_id,inserted.booking_id INTO @released
FROM dbo.booking_seats bs
JOIN dbo.bookings b ON b.booking_id=bs.booking_id
JOIN dbo.booking_statuses st ON st.booking_status_id=b.booking_status_id
WHERE bs.released_at IS NULL AND st.status_code IN (''CANCELLED'',''EXPIRED'');
UPDATE ss SET seat_status=''AVAILABLE'',hold_expires_at=NULL,held_by_session_id=NULL,updated_at=SYSUTCDATETIME()
FROM dbo.showtime_seats ss JOIN @released r ON r.showtime_seat_id=ss.showtime_seat_id
WHERE ss.seat_status IN (''HELD'',''BOOKED'',''SOLD'')
AND NOT EXISTS(SELECT 1 FROM dbo.booking_seats bs WHERE bs.showtime_seat_id=ss.showtime_seat_id AND bs.released_at IS NULL)
AND NOT EXISTS(SELECT 1 FROM dbo.seat_holds h WHERE h.showtime_seat_id=ss.showtime_seat_id AND h.hold_status=''ACTIVE'' AND (h.booking_id IS NULL OR h.booking_id<>r.booking_id));
UPDATE h SET hold_status=CASE WHEN st.status_code=''EXPIRED'' THEN ''EXPIRED'' ELSE ''RELEASED'' END,
             released_at=COALESCE(h.released_at,SYSDATETIME())
FROM dbo.seat_holds h JOIN dbo.bookings b ON b.booking_id=h.booking_id
JOIN dbo.booking_statuses st ON st.booking_status_id=b.booking_status_id
WHERE h.hold_status=''ACTIVE'' AND st.status_code IN (''CANCELLED'',''EXPIRED'');
IF EXISTS(SELECT showtime_seat_id FROM dbo.booking_seats WHERE released_at IS NULL GROUP BY showtime_seat_id HAVING COUNT(*)>1)
 THROW 52603,N''Một ghế có nhiều booking đang chiếm. Cần xử lý trước migration.'',1;
';
IF EXISTS(SELECT 1 FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.booking_seats') AND name=N'UQ_booking_seats_showtime_seat')
    ALTER TABLE dbo.booking_seats DROP CONSTRAINT UQ_booking_seats_showtime_seat;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.booking_seats') AND name=N'UX_booking_seats_active_seat')
    EXEC(N'CREATE UNIQUE INDEX UX_booking_seats_active_seat ON dbo.booking_seats(showtime_seat_id) WHERE released_at IS NULL;');

IF COL_LENGTH(N'dbo.showtime_seats',N'auditorium_id') IS NULL
    ALTER TABLE dbo.showtime_seats ADD auditorium_id BIGINT NULL;
EXEC sys.sp_executesql N'
UPDATE ss SET auditorium_id=st.auditorium_id
FROM dbo.showtime_seats ss JOIN dbo.showtimes st ON st.showtime_id=ss.showtime_id
WHERE ss.auditorium_id IS NULL;
IF EXISTS(SELECT 1 FROM dbo.showtime_seats ss JOIN dbo.showtimes st ON st.showtime_id=ss.showtime_id WHERE ss.auditorium_id<>st.auditorium_id)
 THROW 52601,N''Có ghế suất chiếu sai phòng. Cần xử lý dữ liệu trước migration.'',1;
ALTER TABLE dbo.showtime_seats ALTER COLUMN auditorium_id BIGINT NOT NULL;
';
IF NOT EXISTS(SELECT 1 FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.showtimes') AND name=N'UQ_showtimes_id_auditorium')
    ALTER TABLE dbo.showtimes ADD CONSTRAINT UQ_showtimes_id_auditorium UNIQUE(showtime_id,auditorium_id);
IF OBJECT_ID(N'dbo.FK_showtime_seats_showtimes',N'F') IS NOT NULL
    ALTER TABLE dbo.showtime_seats DROP CONSTRAINT FK_showtime_seats_showtimes;
IF OBJECT_ID(N'dbo.FK_showtime_seats_seats',N'F') IS NOT NULL
    ALTER TABLE dbo.showtime_seats DROP CONSTRAINT FK_showtime_seats_seats;
EXEC(N'ALTER TABLE dbo.showtime_seats WITH CHECK ADD CONSTRAINT FK_showtime_seats_showtimes FOREIGN KEY(showtime_id,auditorium_id) REFERENCES dbo.showtimes(showtime_id,auditorium_id);
ALTER TABLE dbo.showtime_seats WITH CHECK ADD CONSTRAINT FK_showtime_seats_seats FOREIGN KEY(seat_id,auditorium_id) REFERENCES dbo.seats(seat_id,auditorium_id);');
GO

CREATE OR ALTER PROCEDURE dbo.usp_showtime_reschedule
    @showtime_id         BIGINT,
    @changed_by_user_id  BIGINT,
    @change_type         VARCHAR(30),
    @change_reason       NVARCHAR(1000),
    @auditorium_id       BIGINT = NULL,
    @movie_version_id    BIGINT = NULL,
    @start_at            DATETIME2(0) = NULL,
    @end_at              DATETIME2(0) = NULL,
    @preparation_minutes SMALLINT = NULL,
    @cleanup_minutes     SMALLINT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @change_type IS NULL OR @change_type NOT IN ('TIME_CHANGE','ROOM_CHANGE','MOVIE_VERSION_CHANGE')
        THROW 51010, N'Loại thay đổi không được hỗ trợ bởi procedure này.', 1;

    IF @change_reason IS NULL OR LTRIM(RTRIM(@change_reason)) = N''
        THROW 51011, N'Lý do thay đổi không được để trống.', 1;

    IF @auditorium_id IS NULL AND @movie_version_id IS NULL
       AND @start_at IS NULL AND @end_at IS NULL
       AND @preparation_minutes IS NULL AND @cleanup_minutes IS NULL
        THROW 51012, N'Không có thay đổi nào được cung cấp.', 1;

    DECLARE @old_auditorium_id BIGINT,
            @old_movie_version_id BIGINT,
            @old_start_at DATETIME2(0),
            @old_end_at DATETIME2(0),
            @old_preparation_minutes SMALLINT,
            @old_cleanup_minutes SMALLINT;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @old_auditorium_id = auditorium_id,
               @old_movie_version_id = movie_version_id,
               @old_start_at = start_at,
               @old_end_at = end_at,
               @old_preparation_minutes = preparation_minutes,
               @old_cleanup_minutes = cleanup_minutes
        FROM dbo.showtimes WITH (UPDLOCK, HOLDLOCK)
        WHERE showtime_id = @showtime_id;

        IF @old_auditorium_id IS NULL
            THROW 51013, N'Suất chiếu không tồn tại.', 1;

        DECLARE @new_auditorium_id BIGINT = COALESCE(@auditorium_id, @old_auditorium_id);
        DECLARE @new_movie_version_id BIGINT = COALESCE(@movie_version_id, @old_movie_version_id);
        DECLARE @new_start_at DATETIME2(0) = COALESCE(@start_at, @old_start_at);
        DECLARE @new_end_at DATETIME2(0) = COALESCE(@end_at, @old_end_at);
        DECLARE @new_preparation_minutes SMALLINT = COALESCE(@preparation_minutes, @old_preparation_minutes);
        DECLARE @new_cleanup_minutes SMALLINT = COALESCE(@cleanup_minutes, @old_cleanup_minutes);

        IF @new_end_at <= @new_start_at
            THROW 51014, N'Thời điểm kết thúc phải sau thời điểm bắt đầu.', 1;

        DECLARE @new_branch_id BIGINT =
            (SELECT branch_id FROM dbo.auditoriums WHERE auditorium_id = @new_auditorium_id AND is_active = 1);
        IF @new_branch_id IS NULL
            THROW 51015, N'Phòng chiếu không tồn tại hoặc đã ngừng sử dụng.', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.movie_versions mv
            JOIN dbo.auditorium_screening_formats asf
              ON asf.auditorium_id = @new_auditorium_id
             AND asf.format_id = mv.format_id
             AND asf.is_active = 1
            WHERE mv.movie_version_id = @new_movie_version_id
              AND mv.is_active = 1
        )
            THROW 51016, N'Phòng chiếu không hỗ trợ định dạng của phiên bản phim.', 1;

        DECLARE @movie_duration SMALLINT;
        SELECT @movie_duration = m.duration_minutes
        FROM dbo.movie_versions mv
        JOIN dbo.movies m ON m.movie_id = mv.movie_id
        WHERE mv.movie_version_id = @new_movie_version_id;

        IF @movie_duration IS NOT NULL
           AND @new_end_at < DATEADD(MINUTE, @movie_duration, @new_start_at)
            THROW 51017, N'Thời điểm kết thúc phải sau khi phim kết thúc (tối thiểu bằng thời lượng phim).', 1;

        DECLARE @cancelled_status_id SMALLINT =
            (SELECT status_id FROM dbo.showtime_statuses WHERE status_code = 'CANCELLED');
        IF @cancelled_status_id IS NULL
            THROW 51018, N'Chưa cấu hình trạng thái CANCELLED.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK)
            WHERE s.auditorium_id = @new_auditorium_id
              AND s.showtime_id <> @showtime_id
              AND s.status_id <> @cancelled_status_id
              AND DATEADD(MINUTE, -s.preparation_minutes, s.start_at) < DATEADD(MINUTE, @new_cleanup_minutes, @new_end_at)
              AND DATEADD(MINUTE, s.cleanup_minutes, s.end_at) > DATEADD(MINUTE, -@new_preparation_minutes, @new_start_at)
        )
            THROW 51019, N'Khoảng chiếm dụng phòng bị trùng với suất chiếu khác.', 1;

        IF @new_auditorium_id <> @old_auditorium_id AND EXISTS (
            SELECT 1 FROM dbo.showtime_seats WHERE showtime_id = @showtime_id
        )
            THROW 51022, N'Không thể đổi phòng khi suất chiếu đã có dữ liệu ghế.', 1;

        UPDATE dbo.showtimes
        SET branch_id = @new_branch_id,
            auditorium_id = @new_auditorium_id,
            movie_version_id = @new_movie_version_id,
            start_at = @new_start_at,
            end_at = @new_end_at,
            preparation_minutes = @new_preparation_minutes,
            cleanup_minutes = @new_cleanup_minutes,
            updated_at = SYSUTCDATETIME()
        WHERE showtime_id = @showtime_id;

        INSERT INTO dbo.showtime_schedule_changes (
            showtime_id, changed_by_user_id, change_type,
            old_auditorium_id, new_auditorium_id,
            old_movie_version_id, new_movie_version_id,
            old_start_at, new_start_at,
            old_end_at, new_end_at,
            change_reason
        )
        VALUES (
            @showtime_id, @changed_by_user_id, @change_type,
            @old_auditorium_id, @new_auditorium_id,
            @old_movie_version_id, @new_movie_version_id,
            @old_start_at, @new_start_at,
            @old_end_at, @new_end_at,
            @change_reason
        );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_payment_finalize
    @payment_transaction_id  BIGINT,
    @provider_transaction_id VARCHAR(150) = NULL,
    @paid_at                 DATETIME2(0) = NULL,
    @return_result           BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @paid_at = COALESCE(@paid_at, SYSDATETIME());
    DECLARE @now_utc DATETIME2(0) = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @booking_id BIGINT,
                @fnb_order_id BIGINT,
                @tx_status VARCHAR(20),
                @tx_amount DECIMAL(18,2),
                @tx_currency CHAR(3),
                @tx_expires_at DATETIME2(0),
                @cash_session_id BIGINT;

        SELECT @booking_id = booking_id,
               @fnb_order_id = fnb_order_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_expires_at = expired_at,
               @cash_session_id = cash_register_session_id
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE payment_transaction_id = @payment_transaction_id;

        IF @tx_status IS NULL
            THROW 52130, N'Giao dịch thanh toán không tồn tại.', 1;

        IF @tx_status = 'SUCCESS'
        BEGIN
            COMMIT TRANSACTION;

            IF @return_result = 1
                SELECT @payment_transaction_id AS payment_transaction_id,
                       @booking_id AS booking_id,
                       0 AS tickets_issued;
            RETURN;
        END;

        IF @tx_status NOT IN ('PENDING','PROCESSING')
            THROW 52131, N'Giao dịch không ở trạng thái có thể chốt.', 1;

        DECLARE @booking_status_code VARCHAR(30),
                @booking_total DECIMAL(18,2) = 0,
                @booking_currency CHAR(3),
                @booking_expires_at DATETIME2(0),
                @fnb_status VARCHAR(20),
                @fnb_total DECIMAL(14,2) = 0,
                @fnb_currency CHAR(3);

        SELECT @booking_status_code = bs.status_code,
               @booking_total = b.total_amount,
               @booking_currency = b.currency_code,
               @booking_expires_at = b.expires_at
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_statuses bs ON bs.booking_status_id = b.booking_status_id
        WHERE b.booking_id = @booking_id;

        IF @booking_id IS NOT NULL AND @booking_status_code IS NULL
            THROW 52132, N'Booking của giao dịch không tồn tại.', 1;
        IF @booking_status_code <> 'PENDING_PAYMENT'
            THROW 52132, N'Booking không ở trạng thái chờ thanh toán.', 1;
        IF @fnb_order_id IS NOT NULL
        BEGIN
            SELECT @fnb_status = order_status, @fnb_total = total_amount, @fnb_currency = currency_code
            FROM dbo.fnb_orders WITH (UPDLOCK, HOLDLOCK)
            WHERE fnb_order_id = @fnb_order_id;

            IF @fnb_status <> 'PENDING' OR @fnb_status IS NULL
                THROW 52132, N'Đơn F&B không ở trạng thái chờ thanh toán.', 1;
            IF @tx_expires_at IS NOT NULL AND @tx_expires_at < @paid_at
                THROW 52134, N'Đơn F&B đã hết hạn trước thời điểm thanh toán.', 1;
        END;

        IF @booking_total + @fnb_total <> @tx_amount
           OR (@booking_id IS NOT NULL AND @booking_currency <> @tx_currency)
           OR (@fnb_order_id IS NOT NULL AND @fnb_currency <> @tx_currency)
            THROW 52133, N'Số tiền hoặc loại tiền không khớp tổng tiền vé và F&B.', 1;
        IF @booking_expires_at IS NOT NULL AND @booking_expires_at < @paid_at
            THROW 52134, N'Booking đã hết hạn trước thời điểm thanh toán.', 1;

        IF @cash_session_id IS NOT NULL
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM dbo.cash_register_sessions WITH (UPDLOCK, HOLDLOCK)
                WHERE cash_register_session_id = @cash_session_id
                  AND status = 'OPEN'
            )
                THROW 52135, N'Ca thu ngân đã đóng; không thể chốt thanh toán tiền mặt.', 1;
        END;

        DECLARE @locked_showtime_seat_id BIGINT;
        SELECT @locked_showtime_seat_id = ss.showtime_seat_id
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK) ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id;

        IF @booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.booking_seats WHERE booking_id = @booking_id)
            THROW 52136, N'Booking không có ghế để phát hành vé.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK) ON ss.showtime_seat_id = bs.showtime_seat_id
            WHERE bs.booking_id = @booking_id
              AND (bs.released_at IS NOT NULL OR ss.seat_status NOT IN ('BOOKED','HELD','SOLD'))
        )
            THROW 52136, N'Có ghế của booking không ở trạng thái giữ hoặc đã bán.', 1;

        DECLARE @pending_booking_status_id SMALLINT =
            (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'PENDING_PAYMENT');
        DECLARE @confirmed_booking_status_id SMALLINT =
            (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'CONFIRMED');
        DECLARE @issued_ticket_status_id SMALLINT =
            (SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'ISSUED');

        IF @pending_booking_status_id IS NULL
           OR @confirmed_booking_status_id IS NULL
           OR @issued_ticket_status_id IS NULL
            THROW 52137, N'Thiếu cấu hình trạng thái booking/vé.', 1;

        UPDATE dbo.payment_transactions
        SET status = 'SUCCESS',
            paid_at = @paid_at,
            provider_transaction_id = COALESCE(@provider_transaction_id, provider_transaction_id),
            updated_at = @now_utc
        WHERE payment_transaction_id = @payment_transaction_id
          AND status IN ('PENDING','PROCESSING');

        IF @@ROWCOUNT <> 1
            THROW 52138, N'Giao dịch vừa được xử lý bởi luồng khác.', 1;

        IF @fnb_order_id IS NOT NULL
        BEGIN
            EXEC dbo.usp_fnb_reserve_stock @fnb_order_id, NULL;
            UPDATE dbo.fnb_orders
            SET order_status = 'PAID', updated_at = @now_utc
            WHERE fnb_order_id = @fnb_order_id;
        END;

        DECLARE @tickets_issued INT = 0;

        IF @booking_id IS NOT NULL
        BEGIN
        UPDATE dbo.bookings
        SET booking_status_id = @confirmed_booking_status_id,
            confirmed_at = @paid_at,
            updated_at = @now_utc
        WHERE booking_id = @booking_id
          AND booking_status_id = @pending_booking_status_id;

        IF @@ROWCOUNT <> 1
            THROW 52139, N'Booking vừa được thay đổi bởi luồng khác.', 1;

        UPDATE ss
        SET seat_status = 'SOLD',
            hold_expires_at = NULL,
            held_by_session_id = NULL,
            updated_at = @now_utc
        FROM dbo.showtime_seats ss
        JOIN dbo.booking_seats bs ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id
          AND ss.seat_status IN ('BOOKED','HELD');

        UPDATE dbo.seat_holds
        SET hold_status = 'CONVERTED',
            released_at = COALESCE(released_at, @paid_at)
        WHERE booking_id = @booking_id
          AND hold_status = 'ACTIVE';

        INSERT INTO dbo.tickets (
            ticket_code, booking_seat_id, ticket_status_id, qr_token_hash, issued_at
        )
        SELECT
            'TKT-' + CONVERT(VARCHAR(36), NEWID()),
            bs.booking_seat_id,
            @issued_ticket_status_id,
            CONVERT(VARCHAR(128), HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())), 2),
            @paid_at
        FROM dbo.booking_seats bs
        WHERE bs.booking_id = @booking_id
          AND NOT EXISTS (
              SELECT 1 FROM dbo.tickets t WHERE t.booking_seat_id = bs.booking_seat_id
          );

        SET @tickets_issued = @@ROWCOUNT;
        DECLARE @audit_json NVARCHAR(MAX);
        SELECT @audit_json = (
            SELECT @payment_transaction_id AS payment_transaction_id,
                   @paid_at AS paid_at
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.booking_audit_logs (booking_id, actor_type, action_code, new_values)
        VALUES (@booking_id, 'SYSTEM', 'PAYMENT_SUCCESS', @audit_json);
        END;

        COMMIT TRANSACTION;

        IF @return_result = 1
            SELECT @payment_transaction_id AS payment_transaction_id,
                   @booking_id AS booking_id,
                   @tickets_issued AS tickets_issued;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_payment_provider_event_apply
    @provider_id             INT,
    @provider_event_id       VARCHAR(150) = NULL,
    @payment_transaction_id  BIGINT = NULL,
    @event_type              VARCHAR(100),
    @event_payload           NVARCHAR(MAX),
    @signature_valid         BIT,
    @provider_transaction_id VARCHAR(150) = NULL,
    @event_amount            DECIMAL(18,2) = NULL,
    @event_currency          CHAR(3) = NULL,
    @paid_at                 DATETIME2(0) = NULL,
    @received_at             DATETIME2(0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @received_at = COALESCE(@received_at, SYSDATETIME());
    IF @received_at > SYSDATETIME() SET @received_at = SYSDATETIME();
    SET @paid_at = COALESCE(@paid_at, SYSDATETIME());
    SET @signature_valid = ISNULL(@signature_valid, 0);
    SET @event_type = UPPER(LTRIM(RTRIM(@event_type)));

    IF @provider_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_id = @provider_id)
        THROW 52200, N'Nhà cung cấp thanh toán không tồn tại.', 1;
    IF @event_type IS NULL OR @event_type = ''
        THROW 52201, N'Loại sự kiện không được để trống.', 1;
    IF @event_payload IS NULL OR ISJSON(@event_payload) = 0
        THROW 52202, N'Payload webhook phải là JSON hợp lệ.', 1;

    DECLARE @event_id BIGINT;
    DECLARE @effective_transaction_id BIGINT = @payment_transaction_id;
    DECLARE @pre_error NVARCHAR(1000);
    DECLARE @tx_provider_id INT,
            @tx_fnb_order_id BIGINT,
            @tx_status VARCHAR(20),
            @tx_amount DECIMAL(18,2),
            @tx_currency CHAR(3),
            @tx_provider_txn VARCHAR(150),
            @tx_expired_at DATETIME2(0);

    IF @effective_transaction_id IS NOT NULL
    BEGIN
        SELECT @tx_provider_id = provider_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_provider_txn = provider_transaction_id,
               @tx_expired_at = expired_at
        FROM dbo.payment_transactions
        WHERE payment_transaction_id = @effective_transaction_id;

        IF @tx_status IS NULL
        BEGIN
            SET @effective_transaction_id = NULL;
            SET @pre_error = N'Không tìm thấy giao dịch thanh toán.';
        END
        ELSE IF @tx_provider_id IS NULL OR @tx_provider_id <> @provider_id
        BEGIN
            SET @effective_transaction_id = NULL;
            SET @pre_error = N'Provider của sự kiện không khớp giao dịch.';
        END
    END
    ELSE IF @provider_transaction_id IS NOT NULL
    BEGIN
        SELECT @effective_transaction_id = payment_transaction_id,
               @tx_provider_id = provider_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_provider_txn = provider_transaction_id,
               @tx_expired_at = expired_at
        FROM dbo.payment_transactions
        WHERE provider_id = @provider_id
          AND provider_transaction_id = @provider_transaction_id;

        IF @effective_transaction_id IS NULL
            SET @pre_error = N'Không tìm thấy giao dịch thanh toán theo mã provider.';
    END
    ELSE
        SET @pre_error = N'Không xác định được giao dịch thanh toán.';

    IF @signature_valid = 0
    BEGIN
        INSERT INTO dbo.payment_provider_events (
            provider_id, payment_transaction_id, provider_event_id, event_type,
            event_payload, signature_valid, processing_status, received_at, processed_at, error_message
        )
        VALUES (
            @provider_id, @effective_transaction_id, NULL, @event_type,
            @event_payload, 0, 'FAILED', @received_at, SYSDATETIME(),
            LEFT(N'Chữ ký webhook không hợp lệ. Event: ' + COALESCE(@provider_event_id, N''), 1000)
        );
        SET @event_id = SCOPE_IDENTITY();
        SELECT event_id, processing_status, payment_transaction_id, error_message,
               CAST(0 AS BIT) AS is_duplicate
        FROM dbo.payment_provider_events WHERE event_id = @event_id;
        RETURN;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @provider_event_id IS NOT NULL
            SELECT @event_id = event_id
            FROM dbo.payment_provider_events WITH (UPDLOCK, HOLDLOCK)
            WHERE provider_id = @provider_id AND provider_event_id = @provider_event_id;

        IF @event_id IS NOT NULL
        BEGIN
            IF EXISTS (
                SELECT 1 FROM dbo.payment_provider_events
                WHERE event_id = @event_id AND signature_valid = 1
                  AND (event_type <> @event_type OR event_payload COLLATE Latin1_General_100_BIN2 <> @event_payload COLLATE Latin1_General_100_BIN2
                       OR (payment_transaction_id IS NOT NULL AND
                           (@effective_transaction_id IS NULL OR payment_transaction_id <> @effective_transaction_id)))
            )
                THROW 52203, N'Event ID đã được dùng cho nội dung khác.', 1;

            IF EXISTS (
                SELECT 1 FROM dbo.payment_provider_events
                WHERE event_id = @event_id AND signature_valid = 1
                  AND processing_status IN ('PROCESSED','IGNORED')
            )
            BEGIN
                SELECT event_id, processing_status, payment_transaction_id, error_message,
                       CAST(1 AS BIT) AS is_duplicate
                FROM dbo.payment_provider_events WHERE event_id = @event_id;
                COMMIT TRANSACTION;
                RETURN;
            END;

            UPDATE dbo.payment_provider_events
            SET payment_transaction_id = @effective_transaction_id,
                event_type = @event_type, event_payload = @event_payload,
                signature_valid = 1, processing_status = 'RECEIVED',
                processed_at = NULL, error_message = NULL
            WHERE event_id = @event_id;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.payment_provider_events (
                provider_id, payment_transaction_id, provider_event_id, event_type,
                event_payload, signature_valid, processing_status, received_at
            ) VALUES (
                @provider_id, @effective_transaction_id, @provider_event_id, @event_type,
                @event_payload, 1, 'RECEIVED', @received_at
            );
            SET @event_id = SCOPE_IDENTITY();
        END;

    IF @event_type NOT IN ('PAYMENT_SUCCESS','PAYMENT_FAILED','PAYMENT_CANCELLED','PAYMENT_PENDING')
    BEGIN
        UPDATE dbo.payment_provider_events
        SET processing_status = 'IGNORED',
            processed_at = SYSDATETIME(),
            error_message = N'Loại sự kiện không được hỗ trợ.'
        WHERE event_id = @event_id;

        SELECT event_id, processing_status, payment_transaction_id, error_message,
               CAST(0 AS BIT) AS is_duplicate
        FROM dbo.payment_provider_events
        WHERE event_id = @event_id;
        COMMIT TRANSACTION;
        RETURN;
    END;

    IF @pre_error IS NOT NULL
    BEGIN
        UPDATE dbo.payment_provider_events
        SET processing_status = 'FAILED',
            processed_at = SYSDATETIME(),
            error_message = @pre_error
        WHERE event_id = @event_id;

        SELECT event_id, processing_status, payment_transaction_id, error_message,
               CAST(0 AS BIT) AS is_duplicate
        FROM dbo.payment_provider_events
        WHERE event_id = @event_id;
        COMMIT TRANSACTION;
        RETURN;
    END;

    DECLARE @final_status VARCHAR(20),
            @final_error NVARCHAR(1000),
            @need_finalize BIT = 0;

        SELECT @tx_provider_id = provider_id,
               @tx_fnb_order_id = fnb_order_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_provider_txn = provider_transaction_id,
               @tx_expired_at = expired_at
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE payment_transaction_id = @effective_transaction_id;

        IF @tx_status IS NULL
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Không tìm thấy giao dịch thanh toán.';
        END
        ELSE IF @tx_provider_id IS NULL OR @tx_provider_id <> @provider_id
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Provider của sự kiện không khớp giao dịch.';
        END
        ELSE IF @event_amount IS NOT NULL AND @event_amount <> @tx_amount
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Số tiền sự kiện không khớp giao dịch.';
        END
        ELSE IF @event_currency IS NOT NULL AND @event_currency <> @tx_currency
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Loại tiền sự kiện không khớp giao dịch.';
        END
        ELSE IF @event_type = 'PAYMENT_SUCCESS'
        BEGIN
            IF @tx_fnb_order_id IS NOT NULL AND (@event_amount IS NULL OR @event_currency IS NULL)
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Thiếu số tiền hoặc loại tiền của khoản thu có F&B.';
            END
            ELSE IF @provider_transaction_id IS NULL
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Thiếu mã giao dịch provider.';
            END
            ELSE IF @tx_status = 'SUCCESS'
            BEGIN
                IF @tx_provider_txn IS NOT NULL AND @tx_provider_txn <> @provider_transaction_id
                BEGIN
                    SET @final_status = 'FAILED';
                    SET @final_error = N'Giao dịch đã chốt với mã provider khác.';
                END
                ELSE
                    SET @final_status = 'PROCESSED';
            END
            ELSE IF @tx_status IN ('PENDING','PROCESSING')
                SET @need_finalize = 1;
            ELSE
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Giao dịch đang ở trạng thái ' + @tx_status + N'; không thể chốt.';
            END
        END
        ELSE IF @event_type = 'PAYMENT_FAILED'
        BEGIN
            IF @tx_status = 'SUCCESS'
            BEGIN
                SET @final_status = 'IGNORED';
                SET @final_error = N'Giao dịch đã thành công; bỏ qua sự kiện thất bại.';
            END
            ELSE IF @tx_status IN ('PENDING','PROCESSING')
            BEGIN
                UPDATE dbo.payment_attempts
                SET status = 'FAILED',
                    completed_at = SYSDATETIME(),
                    error_code = COALESCE(error_code, 'PROVIDER_FAILED'),
                    error_message = COALESCE(error_message, N'Provider báo giao dịch thất bại.')
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

                IF @tx_expired_at IS NOT NULL AND @tx_expired_at <= SYSDATETIME()
                    UPDATE dbo.payment_transactions
                    SET status = 'EXPIRED', updated_at = SYSUTCDATETIME()
                    WHERE payment_transaction_id = @effective_transaction_id
                      AND status IN ('PENDING','PROCESSING');
                ELSE
                    UPDATE dbo.payment_transactions
                    SET status = 'PENDING', updated_at = SYSUTCDATETIME()
                    WHERE payment_transaction_id = @effective_transaction_id
                      AND status IN ('PENDING','PROCESSING');

                SET @final_status = 'PROCESSED';
            END
            ELSE
                SET @final_status = 'PROCESSED';
        END
        ELSE IF @event_type = 'PAYMENT_CANCELLED'
        BEGIN
            IF @tx_status = 'SUCCESS'
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Không thể hủy giao dịch đã thành công khi không có hoàn tiền.';
            END
            ELSE IF @tx_status IN ('PENDING','PROCESSING')
            BEGIN
                UPDATE dbo.payment_attempts
                SET status = 'CANCELLED',
                    completed_at = SYSDATETIME(),
                    error_code = COALESCE(error_code, 'PROVIDER_CANCELLED'),
                    error_message = COALESCE(error_message, N'Provider hủy giao dịch.')
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

                UPDATE dbo.payment_transactions
                SET status = 'CANCELLED', updated_at = SYSUTCDATETIME()
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

                SET @final_status = 'PROCESSED';
            END
            ELSE
                SET @final_status = 'PROCESSED';
        END
        ELSE
            SET @final_status = 'PROCESSED';

        IF @need_finalize = 1
        BEGIN
            UPDATE dbo.payment_provider_events
            SET processing_status = 'PROCESSING',
                processed_at = NULL,
                error_message = NULL
            WHERE event_id = @event_id;
        END
        ELSE
        BEGIN
            IF @final_status IS NULL
            BEGIN
                SET @final_status = 'IGNORED';
                SET @final_error = N'Không có thay đổi trạng thái.';
            END;

            UPDATE dbo.payment_provider_events
            SET processing_status = @final_status,
                processed_at = SYSDATETIME(),
                error_message = @final_error
            WHERE event_id = @event_id;
        END;

        IF @need_finalize = 1
        BEGIN
            EXEC dbo.usp_payment_finalize
                @payment_transaction_id = @effective_transaction_id,
                @provider_transaction_id = @provider_transaction_id,
                @paid_at = @paid_at,
                @return_result = 0;

            IF NOT EXISTS (
                SELECT 1 FROM dbo.payment_attempts
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status = 'SUCCESS'
            )
                UPDATE dbo.payment_attempts
                SET status = 'SUCCESS',
                    completed_at = SYSDATETIME(),
                    provider_reference = COALESCE(provider_reference, @provider_transaction_id),
                    error_code = NULL,
                    error_message = NULL
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');
            ELSE
                UPDATE dbo.payment_attempts
                SET status = 'CANCELLED',
                    completed_at = SYSDATETIME(),
                    error_code = 'SUPERSEDED',
                    error_message = N'Đã có attempt thành công.'
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

            UPDATE dbo.payment_provider_events
            SET processing_status = 'PROCESSED',
                processed_at = SYSDATETIME(),
                error_message = NULL
            WHERE event_id = @event_id;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        DECLARE @failure NVARCHAR(1000) = LEFT(ERROR_MESSAGE(), 1000);
        DECLARE @failure_number INT = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF @failure_number = 52203 THROW;

        BEGIN TRANSACTION;
        SET @event_id = NULL;
        IF @provider_event_id IS NOT NULL
            SELECT @event_id = event_id
            FROM dbo.payment_provider_events WITH (UPDLOCK, HOLDLOCK)
            WHERE provider_id = @provider_id AND provider_event_id = @provider_event_id;

        IF @event_id IS NULL
        BEGIN
            INSERT INTO dbo.payment_provider_events (
                provider_id, payment_transaction_id, provider_event_id, event_type,
                event_payload, signature_valid, processing_status, received_at, processed_at, error_message
            ) VALUES (
                @provider_id, @effective_transaction_id, @provider_event_id, @event_type,
                @event_payload, 1, 'FAILED', @received_at, SYSDATETIME(), @failure
            );
            SET @event_id = SCOPE_IDENTITY();
        END
        ELSE
            UPDATE dbo.payment_provider_events
            SET processing_status = 'FAILED', processed_at = SYSDATETIME(), error_message = @failure
            WHERE event_id = @event_id AND processing_status NOT IN ('PROCESSED','IGNORED')
              AND signature_valid = 1 AND event_type = @event_type
              AND event_payload COLLATE Latin1_General_100_BIN2 = @event_payload COLLATE Latin1_General_100_BIN2
              AND (payment_transaction_id = @effective_transaction_id
                   OR (payment_transaction_id IS NULL AND @effective_transaction_id IS NULL));
        COMMIT TRANSACTION;
    END CATCH;

    SELECT event_id, processing_status, payment_transaction_id, error_message,
           CAST(0 AS BIT) AS is_duplicate
    FROM dbo.payment_provider_events
    WHERE event_id = @event_id;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_fnb_inventory_apply_transaction
    @inventory_id BIGINT,
    @transaction_type VARCHAR(30),
    @quantity_change DECIMAL(18,3),
    @idempotency_key UNIQUEIDENTIFIER,
    @stock_batch_id BIGINT = NULL,
    @batch_code VARCHAR(60) = NULL,
    @unit_cost DECIMAL(18,4) = NULL,
    @manufactured_at DATE = NULL,
    @expiry_date DATE = NULL,
    @reference_type VARCHAR(30) = NULL,
    @reference_id BIGINT = NULL,
    @reversal_of_inventory_transaction_id BIGINT = NULL,
    @note NVARCHAR(500) = NULL,
    @created_by BIGINT = NULL,
    @inventory_transaction_id BIGINT OUTPUT,
    @result_stock_batch_id BIGINT OUTPUT
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @started_transaction BIT = 0;

    IF @inventory_id IS NULL OR @idempotency_key IS NULL OR
       @quantity_change IS NULL OR @transaction_type IS NULL
        THROW 52301, N'Thiếu thông tin bắt buộc của giao dịch kho.', 1;
    IF @quantity_change = 0
        THROW 52301, N'Lượng thay đổi phải khác 0.', 1;
    IF @transaction_type NOT IN ('PURCHASE','SALE','WASTE','ADJUSTMENT','REVERSAL')
        THROW 52302, N'Loại giao dịch kho không hợp lệ.', 1;
    IF @transaction_type = 'PURCHASE' AND @quantity_change <= 0
        THROW 52303, N'Giao dịch nhập hàng phải làm tăng tồn kho.', 1;
    IF @transaction_type IN ('SALE','WASTE') AND @quantity_change >= 0
        THROW 52304, N'Giao dịch bán hoặc hao hụt phải làm giảm tồn kho.', 1;
    IF (@reference_type IS NULL AND @reference_id IS NOT NULL) OR
       (@reference_type IS NOT NULL AND @reference_id IS NULL)
        THROW 52305, N'Thông tin chứng từ phải có đủ loại và mã.', 1;
    IF @reference_type IS NOT NULL AND LEN(@reference_type) = 0
        THROW 52305, N'Loại chứng từ không được để trống.', 1;
    IF @transaction_type = 'PURCHASE' AND
       (@stock_batch_id IS NOT NULL OR @batch_code IS NULL OR LEN(LTRIM(RTRIM(@batch_code))) = 0 OR @unit_cost IS NULL OR @unit_cost < 0)
        THROW 52306, N'Nhập hàng cần mã lô và giá vốn hợp lệ, không truyền stock_batch_id.', 1;
    IF @transaction_type = 'PURCHASE'
        SET @batch_code = LTRIM(RTRIM(@batch_code));
    IF @manufactured_at IS NOT NULL AND @expiry_date IS NOT NULL AND @manufactured_at > @expiry_date
        THROW 52326, N'Ngày sản xuất phải trước hoặc bằng hạn sử dụng.', 1;
    IF @transaction_type <> 'PURCHASE' AND
       (@batch_code IS NOT NULL OR @unit_cost IS NOT NULL OR @manufactured_at IS NOT NULL OR @expiry_date IS NOT NULL)
        THROW 52307, N'Thông tin tạo lô chỉ dùng cho giao dịch PURCHASE.', 1;
    IF @transaction_type <> 'PURCHASE' AND @stock_batch_id IS NULL
        THROW 52308, N'Giao dịch phải chỉ định lô hàng.', 1;
    IF @transaction_type = 'REVERSAL' AND @reversal_of_inventory_transaction_id IS NULL
        THROW 52309, N'Giao dịch đảo ngược phải chỉ định giao dịch gốc.', 1;
    IF @transaction_type <> 'REVERSAL' AND @reversal_of_inventory_transaction_id IS NOT NULL
        THROW 52310, N'Chỉ giao dịch REVERSAL được chỉ định giao dịch gốc.', 1;

    SET @inventory_transaction_id = NULL;
    SET @result_stock_batch_id = NULL;

    DECLARE @existing_id BIGINT,
            @existing_inventory_id BIGINT,
            @existing_batch_id BIGINT,
            @existing_type VARCHAR(30),
            @existing_change DECIMAL(18,3),
            @existing_reference_type VARCHAR(30),
            @existing_reference_id BIGINT,
            @existing_reversal_id BIGINT,
            @existing_note NVARCHAR(500),
            @existing_created_by BIGINT,
            @existing_batch_code VARCHAR(60),
            @existing_unit_cost DECIMAL(18,4),
            @existing_manufactured_at DATE,
            @existing_expiry_date DATE,
            @quantity_before DECIMAL(18,3),
            @quantity_after DECIMAL(18,3),
            @batch_total DECIMAL(38,3),
            @batch_before DECIMAL(18,3),
            @batch_after DECIMAL(18,3),
            @batch_received DECIMAL(18,3),
            @batch_status VARCHAR(20),
            @batch_expiry DATE,
            @batch_manufactured DATE,
            @batch_unit_cost DECIMAL(18,4),
            @original_inventory_id BIGINT,
            @original_batch_id BIGINT,
            @original_change DECIMAL(18,3),
            @already_reversed DECIMAL(38,3);

    BEGIN TRY
        IF @@TRANCOUNT = 0
        BEGIN
            BEGIN TRANSACTION;
            SET @started_transaction = 1;
        END

        EXEC dbo.usp_fnb_lock_stock;

        SELECT @existing_id = t.inventory_transaction_id,
               @existing_inventory_id = t.inventory_id,
               @existing_batch_id = t.stock_batch_id,
               @existing_type = t.transaction_type,
               @existing_change = t.quantity_change,
               @existing_reference_type = t.reference_type,
               @existing_reference_id = t.reference_id,
               @existing_reversal_id = t.reversal_of_inventory_transaction_id,
               @existing_note = t.note,
               @existing_created_by = t.created_by,
               @existing_batch_code = b.batch_code,
               @existing_unit_cost = b.unit_cost,
               @existing_manufactured_at = b.manufactured_at,
               @existing_expiry_date = b.expiry_date
        FROM dbo.fnb_inventory_transactions t WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.fnb_stock_batches b ON b.stock_batch_id = t.stock_batch_id
        WHERE t.idempotency_key = @idempotency_key;

        IF @existing_id IS NOT NULL
        BEGIN
            IF @existing_inventory_id <> @inventory_id OR
               @existing_type <> @transaction_type OR
               @existing_change <> @quantity_change OR
               (@existing_reference_type IS NULL AND @reference_type IS NOT NULL) OR
               (@existing_reference_type IS NOT NULL AND @reference_type IS NULL) OR
               (@existing_reference_type IS NOT NULL AND @existing_reference_type <> @reference_type) OR
               (@existing_reference_id IS NULL AND @reference_id IS NOT NULL) OR
               (@existing_reference_id IS NOT NULL AND @existing_reference_id <> @reference_id) OR
               (@existing_reversal_id IS NULL AND @reversal_of_inventory_transaction_id IS NOT NULL) OR
               (@existing_reversal_id IS NOT NULL AND @existing_reversal_id <> @reversal_of_inventory_transaction_id) OR
               (@existing_note IS NULL AND @note IS NOT NULL) OR
               (@existing_note IS NOT NULL AND @existing_note <> @note) OR
               (@existing_created_by IS NULL AND @created_by IS NOT NULL) OR
               (@existing_created_by IS NOT NULL AND @existing_created_by <> @created_by) OR
               (@transaction_type = 'PURCHASE' AND
                   (@existing_batch_code <> @batch_code OR @existing_unit_cost <> @unit_cost OR
                    (@existing_manufactured_at IS NULL AND @manufactured_at IS NOT NULL) OR
                     (@existing_manufactured_at IS NOT NULL AND @manufactured_at IS NULL) OR
                    (@existing_manufactured_at IS NOT NULL AND @existing_manufactured_at <> @manufactured_at) OR
                    (@existing_expiry_date IS NULL AND @expiry_date IS NOT NULL) OR
                     (@existing_expiry_date IS NOT NULL AND @expiry_date IS NULL) OR
                    (@existing_expiry_date IS NOT NULL AND @existing_expiry_date <> @expiry_date))) OR
               (@transaction_type <> 'PURCHASE' AND
                   (@existing_batch_id IS NULL AND @stock_batch_id IS NOT NULL OR
                    @existing_batch_id IS NOT NULL AND @existing_batch_id <> @stock_batch_id))
                THROW 52311, N'idempotency_key đã được dùng cho nội dung giao dịch khác.', 1;

            SET @inventory_transaction_id = @existing_id;
            SET @result_stock_batch_id = @existing_batch_id;
            IF @started_transaction = 1 COMMIT TRANSACTION;
            RETURN;
        END;

        SELECT @quantity_before = quantity_on_hand
        FROM dbo.fnb_inventory WITH (UPDLOCK, HOLDLOCK)
        WHERE inventory_id = @inventory_id;
        IF @quantity_before IS NULL
            THROW 52312, N'Dòng tồn kho không tồn tại.', 1;

        SELECT @batch_total = COALESCE(SUM(remaining_quantity), 0)
        FROM dbo.fnb_stock_batches
        WHERE inventory_id = @inventory_id;
        IF @batch_total <> @quantity_before
            THROW 52327, N'Tồn tổng không khớp tổng số dư các lô.', 1;

        SET @quantity_after = @quantity_before + @quantity_change;
        IF @quantity_after < 0
            THROW 52313, N'Tồn kho không đủ để thực hiện giao dịch.', 1;

        IF @transaction_type = 'PURCHASE'
        BEGIN
            IF @expiry_date IS NOT NULL AND @expiry_date < CONVERT(DATE, SYSUTCDATETIME())
                THROW 52314, N'Không thể nhập lô đã hết hạn.', 1;

            SELECT @result_stock_batch_id = stock_batch_id,
                   @batch_before = remaining_quantity,
                   @batch_received = received_quantity,
                   @batch_status = batch_status,
                   @batch_expiry = expiry_date,
                   @batch_manufactured = manufactured_at,
                   @batch_unit_cost = unit_cost
            FROM dbo.fnb_stock_batches WITH (UPDLOCK, HOLDLOCK)
            WHERE inventory_id = @inventory_id AND batch_code = @batch_code;

            IF @result_stock_batch_id IS NOT NULL
            BEGIN
                IF @batch_expiry IS NOT NULL AND @batch_expiry < CONVERT(DATE, SYSUTCDATETIME())
                    THROW 52314, N'Không thể nhập lô đã hết hạn.', 1;

                IF @batch_status NOT IN ('AVAILABLE','DEPLETED') OR
                   @batch_unit_cost <> @unit_cost OR
                   (@batch_manufactured IS NULL AND @manufactured_at IS NOT NULL) OR
                   (@batch_manufactured IS NOT NULL AND @manufactured_at IS NULL) OR
                   (@batch_manufactured IS NOT NULL AND @batch_manufactured <> @manufactured_at) OR
                   (@batch_expiry IS NULL AND @expiry_date IS NOT NULL) OR
                   (@batch_expiry IS NOT NULL AND @expiry_date IS NULL) OR
                   (@batch_expiry IS NOT NULL AND @batch_expiry <> @expiry_date)
                    THROW 52315, N'Mã lô đã tồn tại với trạng thái hoặc thông tin khác.', 1;
            END
            ELSE
            BEGIN
                INSERT INTO dbo.fnb_stock_batches (
                    inventory_id, batch_code, unit_cost, manufactured_at, expiry_date,
                    batch_status
                )
                VALUES (
                    @inventory_id, @batch_code, @unit_cost, @manufactured_at, @expiry_date,
                    'DEPLETED'
                );
                SET @result_stock_batch_id = SCOPE_IDENTITY();
                SET @batch_before = 0;
                SET @batch_received = 0;
                SET @batch_status = 'DEPLETED';
                SET @batch_expiry = @expiry_date;
            END;
        END
        ELSE
        BEGIN
            SELECT @result_stock_batch_id = stock_batch_id,
                   @batch_before = remaining_quantity,
                   @batch_received = received_quantity,
                   @batch_status = batch_status,
                   @batch_expiry = expiry_date
            FROM dbo.fnb_stock_batches WITH (UPDLOCK, HOLDLOCK)
            WHERE inventory_id = @inventory_id AND stock_batch_id = @stock_batch_id;
            IF @result_stock_batch_id IS NULL
                THROW 52316, N'Lô hàng không thuộc dòng tồn kho đã chọn.', 1;
        END;

        IF @result_stock_batch_id IS NOT NULL
        BEGIN
            IF @transaction_type = 'SALE' AND
               (@batch_status <> 'AVAILABLE' OR
                (@batch_expiry IS NOT NULL AND @batch_expiry < CONVERT(DATE, SYSUTCDATETIME())))
                THROW 52317, N'Lô hàng không khả dụng để bán.', 1;
            IF @transaction_type = 'PURCHASE' AND @batch_status NOT IN ('AVAILABLE','DEPLETED')
                THROW 52318, N'Lô hàng không thể nhận thêm.', 1;

            SET @batch_after = @batch_before + @quantity_change;
            IF @batch_after < 0
                THROW 52319, N'Số lượng lô không đủ để thực hiện giao dịch.', 1;
            IF @quantity_change < 0 AND @batch_after < (
                SELECT COALESCE(SUM(quantity), 0)
                FROM dbo.fnb_stock_reservations
                WHERE stock_batch_id = @result_stock_batch_id
                  AND (expires_at IS NULL OR expires_at > SYSDATETIME())
            )
                THROW 52329, N'Lô không còn đủ số lượng sau khi trừ phần đã giữ cho đơn hàng.', 1;
            IF @transaction_type = 'PURCHASE'
                SET @batch_received = @batch_received + @quantity_change;
            IF @batch_after > @batch_received
                THROW 52320, N'Số dư lô không thể vượt số lượng đã nhận.', 1;
        END
        ELSE
            THROW 52316, N'Giao dịch phải chỉ định lô hàng.', 1;

        IF @transaction_type = 'REVERSAL'
        BEGIN
            SELECT @original_inventory_id = inventory_id,
                   @original_batch_id = stock_batch_id,
                   @original_change = quantity_change
            FROM dbo.fnb_inventory_transactions WITH (UPDLOCK, HOLDLOCK)
            WHERE inventory_transaction_id = @reversal_of_inventory_transaction_id
              AND transaction_type <> 'REVERSAL';
            IF @original_inventory_id IS NULL
                THROW 52321, N'Giao dịch gốc không tồn tại hoặc không thể đảo ngược.', 1;
            IF @original_inventory_id <> @inventory_id OR
               @original_batch_id <> @result_stock_batch_id OR
               @original_change * @quantity_change >= 0
                THROW 52322, N'Giao dịch đảo ngược không khớp với giao dịch gốc.', 1;

            SELECT @already_reversed = COALESCE(SUM(ABS(CAST(quantity_change AS DECIMAL(38,3)))), 0)
            FROM dbo.fnb_inventory_transactions WITH (UPDLOCK, HOLDLOCK)
            WHERE reversal_of_inventory_transaction_id = @reversal_of_inventory_transaction_id;
            IF @already_reversed + ABS(CAST(@quantity_change AS DECIMAL(38,3))) >
               ABS(CAST(@original_change AS DECIMAL(38,3)))
                THROW 52323, N'Tổng lượng đảo ngược vượt lượng giao dịch gốc.', 1;
        END;

        UPDATE dbo.fnb_inventory
        SET quantity_on_hand = @quantity_after,
            updated_at = SYSUTCDATETIME()
        WHERE inventory_id = @inventory_id;

        IF @result_stock_batch_id IS NOT NULL
        BEGIN
            UPDATE dbo.fnb_stock_batches
            SET received_quantity = CASE WHEN @transaction_type = 'PURCHASE' THEN @batch_received ELSE received_quantity END,
                remaining_quantity = @batch_after,
                batch_status = CASE
                    WHEN @batch_after = 0 THEN 'DEPLETED'
                    WHEN @transaction_type = 'PURCHASE' THEN 'AVAILABLE'
                    WHEN batch_status = 'DEPLETED' AND expiry_date < CONVERT(DATE, SYSUTCDATETIME()) THEN 'EXPIRED'
                    WHEN batch_status = 'DEPLETED' THEN 'AVAILABLE'
                    WHEN expiry_date < CONVERT(DATE, SYSUTCDATETIME()) THEN 'EXPIRED'
                    ELSE batch_status
                END
            WHERE inventory_id = @inventory_id
              AND stock_batch_id = @result_stock_batch_id;
        END;

        INSERT INTO dbo.fnb_inventory_transactions (
            inventory_id, stock_batch_id, transaction_type, quantity_change,
            quantity_before, quantity_after, batch_quantity_before, batch_quantity_after,
            reference_type, reference_id, reversal_of_inventory_transaction_id,
            idempotency_key, note, created_by
        )
        VALUES (
            @inventory_id, @result_stock_batch_id, @transaction_type, @quantity_change,
            @quantity_before, @quantity_after, @batch_before, @batch_after,
            @reference_type, @reference_id, @reversal_of_inventory_transaction_id,
            @idempotency_key, @note, @created_by
        );
        SET @inventory_transaction_id = SCOPE_IDENTITY();

        IF @started_transaction = 1 COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_booking_release
    @booking_id BIGINT,
    @status_code VARCHAR(30) = 'CANCELLED',
    @actor_user_id BIGINT = NULL,
    @reason NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @status_code IS NULL OR @status_code NOT IN ('CANCELLED','EXPIRED')
        THROW 52500, N'Trạng thái giải phóng booking không hợp lệ.', 1;
    DECLARE @now DATETIME2(0) = SYSDATETIME(), @utc DATETIME2(0) = SYSUTCDATETIME(),
            @current VARCHAR(30), @expires_at DATETIME2(0), @target SMALLINT,
            @voided SMALLINT, @payment_id BIGINT, @locked_seat BIGINT;
    BEGIN TRY
        BEGIN TRANSACTION;
        SELECT @payment_id = payment_transaction_id
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE booking_id = @booking_id;
        SELECT @current = st.status_code, @expires_at = b.expires_at
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
        WHERE b.booking_id = @booking_id;
        IF @current IS NULL THROW 52501, N'Booking không tồn tại.', 1;
        IF @current = @status_code
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;
        IF @current NOT IN ('PENDING_PAYMENT','CONFIRMED')
            THROW 52502, N'Booking không thể giải phóng ở trạng thái hiện tại.', 1;
        IF @status_code = 'EXPIRED' AND
           (@current <> 'PENDING_PAYMENT' OR @expires_at IS NULL OR @expires_at > @now)
            THROW 52503, N'Booking chưa hết hạn thanh toán.', 1;
        SELECT @target = booking_status_id FROM dbo.booking_statuses WHERE status_code = @status_code;
        SELECT @voided = ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'VOIDED';
        IF @target IS NULL OR @voided IS NULL THROW 52504, N'Thiếu cấu hình trạng thái booking hoặc vé.', 1;
        SELECT @locked_seat = ss.showtime_seat_id
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK) ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id AND bs.released_at IS NULL;
        SELECT @locked_seat = ss.showtime_seat_id
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        WHERE EXISTS (
            SELECT 1 FROM dbo.seat_holds h
            WHERE h.showtime_seat_id = ss.showtime_seat_id
              AND h.booking_id = @booking_id AND h.hold_status = 'ACTIVE'
        );
        IF EXISTS (
            SELECT 1 FROM dbo.tickets t WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.ticket_statuses ts ON ts.ticket_status_id = t.ticket_status_id
            JOIN dbo.booking_seats bs ON bs.booking_seat_id = t.booking_seat_id
            WHERE bs.booking_id = @booking_id AND ts.status_code = 'USED'
        ) THROW 52505, N'Không thể giải phóng booking có vé đã sử dụng.', 1;
        UPDATE t SET ticket_status_id = @voided, voided_at = COALESCE(voided_at,@now)
        FROM dbo.tickets t JOIN dbo.booking_seats bs ON bs.booking_seat_id = t.booking_seat_id
        WHERE bs.booking_id = @booking_id;
        UPDATE ss SET seat_status = 'AVAILABLE', hold_expires_at = NULL,
                      held_by_session_id = NULL, updated_at = @utc
        FROM dbo.showtime_seats ss JOIN dbo.booking_seats bs ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id AND bs.released_at IS NULL
          AND ss.seat_status IN ('HELD','BOOKED','SOLD');
        UPDATE ss SET seat_status = 'AVAILABLE', hold_expires_at = NULL,
                      held_by_session_id = NULL, updated_at = @utc
        FROM dbo.showtime_seats ss
        WHERE ss.seat_status = 'HELD'
          AND EXISTS (
              SELECT 1 FROM dbo.seat_holds h WITH (UPDLOCK, HOLDLOCK)
              WHERE h.showtime_seat_id = ss.showtime_seat_id
                AND h.booking_id = @booking_id AND h.hold_status = 'ACTIVE'
                AND h.session_id = ss.held_by_session_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK)
              WHERE bs.showtime_seat_id = ss.showtime_seat_id
                AND bs.booking_id <> @booking_id AND bs.released_at IS NULL
          );
        UPDATE dbo.booking_seats SET released_at = @utc
        WHERE booking_id = @booking_id AND released_at IS NULL;
        UPDATE dbo.seat_holds SET hold_status = CASE WHEN @status_code = 'EXPIRED' THEN 'EXPIRED' ELSE 'RELEASED' END,
                                 released_at = COALESCE(released_at,@now)
        WHERE booking_id = @booking_id AND hold_status = 'ACTIVE';
        UPDATE dbo.payment_attempts SET status = 'CANCELLED', completed_at = @now
        WHERE payment_transaction_id = @payment_id AND status IN ('PENDING','PROCESSING');
        UPDATE dbo.payment_transactions SET status = @status_code,
            expired_at = CASE WHEN @status_code = 'EXPIRED' THEN COALESCE(expired_at,@now) ELSE expired_at END,
            updated_at = @utc
        WHERE payment_transaction_id = @payment_id AND status IN ('PENDING','PROCESSING');
        UPDATE dbo.bookings SET booking_status_id = @target, updated_at = @utc WHERE booking_id = @booking_id;
        IF @status_code = 'CANCELLED'
            INSERT dbo.booking_cancellations (booking_id,requested_by_user_id,processed_by_user_id,cancellation_code,
                cancellation_reason,cancellation_status,requested_at,processed_at)
            VALUES (@booking_id,@actor_user_id,@actor_user_id,'CAN-' + CONVERT(VARCHAR(36),NEWID()),
                COALESCE(NULLIF(LTRIM(RTRIM(@reason)),N''),N'Hủy booking'),'COMPLETED',@now,@now);
        DECLARE @json NVARCHAR(MAX) = (SELECT @status_code AS status_code, @reason AS reason FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.booking_audit_logs (booking_id,actor_user_id,actor_type,action_code,new_values)
        VALUES (@booking_id,@actor_user_id,CASE WHEN @actor_user_id IS NULL THEN 'SYSTEM' ELSE 'STAFF' END,'BOOKING_RELEASED',@json);
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO

IF @@TRANCOUNT <> 1 THROW 52604, N'Transaction migration không hợp lệ.', 1;
COMMIT TRANSACTION;
GO
