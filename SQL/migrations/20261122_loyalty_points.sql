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
    THROW 52900, N'Chọn database MARUMO trước khi chạy migration.', 1;
IF OBJECT_ID(N'dbo.users',N'U') IS NULL
   OR OBJECT_ID(N'dbo.bookings',N'U') IS NULL
   OR OBJECT_ID(N'dbo.payment_transactions',N'U') IS NULL
   OR OBJECT_ID(N'dbo.system_settings',N'U') IS NULL
    THROW 52900, N'Database chưa có schema MARUMO.', 1;
BEGIN TRANSACTION;
GO
IF OBJECT_ID(N'dbo.loyalty_accounts',N'U') IS NULL
    CREATE TABLE dbo.loyalty_accounts (
    user_id                   BIGINT       NOT NULL,
    balance_points            INT          NOT NULL CONSTRAINT DF_loyalty_accounts_balance_points DEFAULT 0,
    lifetime_earned_points    INT          NOT NULL CONSTRAINT DF_loyalty_accounts_lifetime_earned_points DEFAULT 0,
    lifetime_redeemed_points  INT          NOT NULL CONSTRAINT DF_loyalty_accounts_lifetime_redeemed_points DEFAULT 0,
    created_at                DATETIME2(0) NOT NULL CONSTRAINT DF_loyalty_accounts_created_at DEFAULT SYSUTCDATETIME(),
    updated_at                DATETIME2(0) NOT NULL CONSTRAINT DF_loyalty_accounts_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_loyalty_accounts PRIMARY KEY (user_id),
    CONSTRAINT CK_loyalty_accounts_balance_points CHECK (balance_points >= 0),
    CONSTRAINT CK_loyalty_accounts_lifetime_earned CHECK (lifetime_earned_points >= 0),
    CONSTRAINT CK_loyalty_accounts_lifetime_redeemed CHECK (lifetime_redeemed_points >= 0),
    CONSTRAINT FK_loyalty_accounts_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id)
);
GO
IF OBJECT_ID(N'dbo.loyalty_ledger',N'U') IS NULL
    CREATE TABLE dbo.loyalty_ledger (
    ledger_id      BIGINT IDENTITY(1,1) NOT NULL,
    user_id        BIGINT               NOT NULL,
    change_type    VARCHAR(20)          NOT NULL,
    points_delta   INT                  NOT NULL,
    booking_id     BIGINT               NULL,
    payment_id     BIGINT               NULL,
    reference_code VARCHAR(100)         NULL,
    created_at     DATETIME2(0)         NOT NULL CONSTRAINT DF_loyalty_ledger_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_loyalty_ledger PRIMARY KEY (ledger_id),
    CONSTRAINT CK_loyalty_ledger_change_type CHECK (change_type IN ('EARN','REDEEM','ADJUST')),
    CONSTRAINT FK_loyalty_ledger_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_loyalty_ledger_bookings FOREIGN KEY (booking_id) REFERENCES dbo.bookings (booking_id),
    CONSTRAINT FK_loyalty_ledger_payments FOREIGN KEY (payment_id) REFERENCES dbo.payment_transactions (payment_transaction_id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_loyalty_ledger_earn_payment' AND object_id = OBJECT_ID(N'dbo.loyalty_ledger'))
    CREATE UNIQUE INDEX UX_loyalty_ledger_earn_payment
    ON dbo.loyalty_ledger (payment_id)
    WHERE change_type = 'EARN' AND payment_id IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_loyalty_ledger_redeem_booking' AND object_id = OBJECT_ID(N'dbo.loyalty_ledger'))
    CREATE UNIQUE INDEX UX_loyalty_ledger_redeem_booking
    ON dbo.loyalty_ledger (booking_id)
    WHERE change_type = 'REDEEM' AND booking_id IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_loyalty_ledger_adjust_reference' AND object_id = OBJECT_ID(N'dbo.loyalty_ledger'))
    CREATE UNIQUE INDEX UX_loyalty_ledger_adjust_reference
    ON dbo.loyalty_ledger (reference_code)
    WHERE reference_code IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_loyalty_ledger_user_id' AND object_id = OBJECT_ID(N'dbo.loyalty_ledger'))
    CREATE INDEX IX_loyalty_ledger_user_id ON dbo.loyalty_ledger (user_id, ledger_id);
GO
INSERT INTO dbo.system_settings (setting_key, setting_value, value_type, description)
SELECT 'LOYALTY_EARN_PERCENT', '5', 'INTEGER', N'Phần trăm tổng tiền vé quy thành điểm Marumo Point khi thanh toán thành công'
WHERE NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE setting_key = 'LOYALTY_EARN_PERCENT');
GO
INSERT INTO dbo.system_settings (setting_key, setting_value, value_type, description)
SELECT 'LOYALTY_REDEEM_POINT_PER_VND', '1', 'INTEGER', N'Số đồng quy đổi cho một điểm Marumo Point khi trả vé bằng điểm'
WHERE NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE setting_key = 'LOYALTY_REDEEM_POINT_PER_VND');
GO
COMMIT TRANSACTION;
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
                @booking_user_id BIGINT,
                @booking_total DECIMAL(18,2) = 0,
                @booking_currency CHAR(3),
                @booking_expires_at DATETIME2(0),
                @fnb_status VARCHAR(20),
                @fnb_total DECIMAL(14,2) = 0,
                @fnb_currency CHAR(3);

        SELECT @booking_status_code = bs.status_code,
               @booking_user_id = b.user_id,
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

        DECLARE @earn_percent INT =
            TRY_CONVERT(INT, (SELECT TOP (1) CONVERT(NVARCHAR(100), setting_value) FROM dbo.system_settings WHERE setting_key = 'LOYALTY_EARN_PERCENT'));
        IF @earn_percent IS NULL OR @earn_percent < 0 OR @earn_percent > 100
            SET @earn_percent = 0;
        DECLARE @earn_points INT = CONVERT(INT, FLOOR(@booking_total * @earn_percent / 100.0));
        IF @booking_user_id IS NOT NULL
           AND @earn_points > 0
           AND NOT EXISTS (
               SELECT 1 FROM dbo.loyalty_ledger
               WHERE change_type = 'EARN' AND payment_id = @payment_transaction_id
           )
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.loyalty_accounts WHERE user_id = @booking_user_id)
                INSERT INTO dbo.loyalty_accounts (user_id) VALUES (@booking_user_id);

            UPDATE dbo.loyalty_accounts
            SET balance_points = balance_points + @earn_points,
                lifetime_earned_points = lifetime_earned_points + @earn_points,
                updated_at = @now_utc
            WHERE user_id = @booking_user_id;

            INSERT INTO dbo.loyalty_ledger (user_id, change_type, points_delta, booking_id, payment_id)
            VALUES (@booking_user_id, 'EARN', @earn_points, @booking_id, @payment_transaction_id);
        END;
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

CREATE OR ALTER PROCEDURE dbo.usp_booking_pay_with_points
    @booking_id BIGINT,
    @user_id    BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now_utc DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @now DATETIME2(0) = SYSDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @status_code VARCHAR(30),
                @expires_at DATETIME2(0),
                @total_amount DECIMAL(14,2);

        SELECT @status_code = st.status_code,
               @expires_at = b.expires_at,
               @total_amount = b.total_amount
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
        WHERE b.booking_id = @booking_id AND b.user_id = @user_id;

        IF @status_code IS NULL
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.bookings WHERE booking_id = @booking_id)
                THROW 52802, N'Booking không thuộc về người dùng này.', 1;
            THROW 52801, N'Booking không tồn tại.', 1;
        END;

        DECLARE @already_paid BIT = 0;
        IF @status_code = 'CONFIRMED'
           AND EXISTS (
               SELECT 1 FROM dbo.loyalty_ledger
               WHERE change_type = 'REDEEM' AND booking_id = @booking_id
           )
            SET @already_paid = 1;

        IF @already_paid = 0 AND @status_code <> 'PENDING_PAYMENT'
        BEGIN
            IF @status_code = 'EXPIRED'
                THROW 52803, N'Booking đã hết hạn giữ ghế.', 1;
            THROW 52804, N'Booking không ở trạng thái chờ thanh toán.', 1;
        END;

        IF @already_paid = 0 AND (@expires_at IS NULL OR @expires_at <= @now)
            THROW 52803, N'Booking đã hết hạn giữ ghế.', 1;

        DECLARE @points_required INT = CONVERT(INT, FLOOR(@total_amount));

        IF @already_paid = 0
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.loyalty_accounts WHERE user_id = @user_id)
                INSERT INTO dbo.loyalty_accounts (user_id) VALUES (@user_id);

            UPDATE dbo.loyalty_accounts
            SET balance_points = balance_points - @points_required,
                lifetime_redeemed_points = lifetime_redeemed_points + @points_required,
                updated_at = @now_utc
            WHERE user_id = @user_id
              AND balance_points >= @points_required;

            IF @@ROWCOUNT = 0
                THROW 52806, N'Số dư điểm Marumo Point không đủ để trả booking này.', 1;

            BEGIN TRY
                INSERT INTO dbo.loyalty_ledger (user_id, change_type, points_delta, booking_id)
                VALUES (@user_id, 'REDEEM', -@points_required, @booking_id);
            END TRY
            BEGIN CATCH
                IF ERROR_NUMBER() IN (2627, 2601)
                   AND ERROR_MESSAGE() LIKE '%UX_loyalty_ledger_redeem_booking%'
                BEGIN
                    ROLLBACK TRANSACTION;
                    SET @already_paid = 1;
                END
                ELSE
                    THROW;
            END CATCH;
        END;

        IF @already_paid = 0
        BEGIN
            DECLARE @pending_booking_status_id SMALLINT =
                (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'PENDING_PAYMENT');
            DECLARE @confirmed_booking_status_id SMALLINT =
                (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'CONFIRMED');
            DECLARE @issued_ticket_status_id SMALLINT =
                (SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'ISSUED');

            IF @pending_booking_status_id IS NULL
               OR @confirmed_booking_status_id IS NULL
               OR @issued_ticket_status_id IS NULL
                THROW 52809, N'Thiếu cấu hình trạng thái booking/vé.', 1;

            DECLARE @locked_showtime_seat_id BIGINT;
            SELECT @locked_showtime_seat_id = ss.showtime_seat_id
            FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK) ON bs.showtime_seat_id = ss.showtime_seat_id
            WHERE bs.booking_id = @booking_id;

            IF NOT EXISTS (SELECT 1 FROM dbo.booking_seats WHERE booking_id = @booking_id)
                THROW 52808, N'Booking không có ghế để phát hành vé.', 1;

            IF EXISTS (
                SELECT 1
                FROM dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK)
                JOIN dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK) ON ss.showtime_seat_id = bs.showtime_seat_id
                WHERE bs.booking_id = @booking_id
                  AND (bs.released_at IS NOT NULL OR ss.seat_status NOT IN ('BOOKED','HELD','SOLD'))
            )
                THROW 52808, N'Có ghế của booking không ở trạng thái giữ hoặc đã bán.', 1;

            UPDATE dbo.bookings
            SET booking_status_id = @confirmed_booking_status_id,
                confirmed_at = @now,
                updated_at = @now_utc
            WHERE booking_id = @booking_id
              AND booking_status_id = @pending_booking_status_id;

            IF @@ROWCOUNT <> 1
                THROW 52807, N'Booking vừa được thay đổi bởi luồng khác.', 1;

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
                released_at = COALESCE(released_at, @now)
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
                @now
            FROM dbo.booking_seats bs
            WHERE bs.booking_id = @booking_id
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.tickets t WHERE t.booking_seat_id = bs.booking_seat_id
              );

            DECLARE @audit_json NVARCHAR(MAX);
            SELECT @audit_json = (
                SELECT 'POINTS' AS method,
                       @points_required AS points_redeemed,
                       @now AS paid_at
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            INSERT INTO dbo.booking_audit_logs (booking_id, actor_user_id, actor_type, action_code, new_values)
            VALUES (@booking_id, @user_id, 'CUSTOMER', 'PAYMENT_SUCCESS', @audit_json);

            COMMIT TRANSACTION;
        END
        ELSE IF @@TRANCOUNT > 0
        BEGIN
            COMMIT TRANSACTION;
        END;

        SELECT
            CONVERT(varchar(20), b.booking_id) AS id,
            b.booking_code AS code,
            st.status_code AS status,
            CONVERT(varchar(20), b.showtime_id) AS showtimeId,
            CONVERT(varchar(20), b.branch_id) AS branchId,
            CONVERT(varchar(20), s.auditorium_id) AS auditoriumId,
            b.subtotal_amount AS subtotalAmount,
            b.discount_amount AS discountAmount,
            b.total_amount AS totalAmount,
            b.currency_code AS currencyCode,
            b.expires_at AS expiresAt,
            b.created_at AS createdAt,
            s.start_at AS startAt,
            s.end_at AS endAt,
            br.branch_name AS branchName,
            a.auditorium_name AS auditoriumName,
            f.format_name AS formatName,
            m.title AS movieTitle,
            m.slug AS movieSlug,
            poster.media_url AS posterImage,
            rating.rating_code AS ratingCode,
            u.full_name AS customerName,
            u.email AS customerEmail,
            COALESCE(pay_method.method_code, 'POINTS') AS paymentMethod
        FROM dbo.bookings b
        JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
        JOIN dbo.showtimes s ON s.showtime_id = b.showtime_id
        JOIN dbo.branches br ON br.branch_id = b.branch_id
        JOIN dbo.auditoriums a ON a.auditorium_id = s.auditorium_id
        JOIN dbo.movie_versions mv ON mv.movie_version_id = s.movie_version_id
        JOIN dbo.movies m ON m.movie_id = mv.movie_id
        JOIN dbo.screening_formats f ON f.format_id = mv.format_id
        LEFT JOIN dbo.users u ON u.user_id = b.user_id
        OUTER APPLY (
            SELECT TOP (1) mm.media_url
            FROM dbo.movie_media mm
            WHERE mm.movie_id = m.movie_id AND mm.media_type = 'POSTER'
            ORDER BY mm.is_primary DESC, mm.display_order, mm.media_id
        ) poster
        OUTER APPLY (
            SELECT TOP (1) r.rating_code
            FROM dbo.movie_content_ratings r
            WHERE r.movie_id = m.movie_id
            ORDER BY CASE WHEN r.country_code = 'VN' THEN 0 ELSE 1 END, r.movie_content_rating_id
        ) rating
        OUTER APPLY (
            SELECT TOP (1) pm.method_code
            FROM dbo.payment_transactions ptx
            JOIN dbo.payment_methods pm ON pm.payment_method_id = ptx.payment_method_id
            WHERE ptx.booking_id = b.booking_id
            ORDER BY ptx.payment_transaction_id DESC
        ) pay_method
        WHERE b.booking_id = @booking_id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_loyalty_get
    @user_id BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    IF @user_id IS NULL
        THROW 52800, N'Yêu cầu user_id hợp lệ.', 1;

    SELECT balance_points AS balancePoints,
           lifetime_earned_points AS lifetimeEarned,
           lifetime_redeemed_points AS lifetimeRedeemed
    FROM dbo.loyalty_accounts
    WHERE user_id = @user_id;

    SELECT l.change_type AS changeType,
           l.points_delta AS points,
           l.reference_code AS referenceCode,
           b.booking_code AS bookingCode,
           (
               SELECT SUM(l2.points_delta)
               FROM dbo.loyalty_ledger l2
               WHERE l2.user_id = l.user_id AND l2.ledger_id <= l.ledger_id
           ) AS balanceAfter,
           l.created_at AS createdAt
    FROM (
        SELECT TOP (20) ledger_id, user_id, change_type, points_delta, booking_id, reference_code, created_at
        FROM dbo.loyalty_ledger
        WHERE user_id = @user_id
        ORDER BY ledger_id DESC
    ) l
    LEFT JOIN dbo.bookings b ON b.booking_id = l.booking_id
    ORDER BY l.ledger_id DESC;
END
GO
