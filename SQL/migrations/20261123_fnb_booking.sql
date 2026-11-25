USE [$(DATABASE_NAME)];
GO

SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.promotion_codes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.promotion_codes (
        promo_code_id       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_promotion_codes PRIMARY KEY,
        promo_code          VARCHAR(40)          NOT NULL,
        branch_id           BIGINT               NULL REFERENCES dbo.branches (branch_id),
        discount_type       VARCHAR(10)          NOT NULL CONSTRAINT DF_promotion_codes_discount_type DEFAULT 'AMOUNT',
        discount_value      DECIMAL(14,2)        NOT NULL,
        max_discount_amount DECIMAL(14,2)        NULL,
        min_order_amount    DECIMAL(14,2)        NOT NULL CONSTRAINT DF_promotion_codes_min_order DEFAULT 0,
        max_uses            INT                  NULL,
        max_uses_per_user   INT                  NULL,
        starts_at           DATETIME2(0)         NULL,
        expires_at          DATETIME2(0)         NULL,
        is_active           BIT                  NOT NULL CONSTRAINT DF_promotion_codes_is_active DEFAULT 1,
        created_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_promotion_codes_created_at DEFAULT SYSUTCDATETIME(),
        updated_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_promotion_codes_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_promotion_codes_code UNIQUE (promo_code),
        CONSTRAINT CK_promotion_codes_discount_type CHECK (discount_type IN ('PERCENT','AMOUNT')),
        CONSTRAINT CK_promotion_codes_discount_value CHECK (discount_value > 0),
        CONSTRAINT CK_promotion_codes_percent CHECK (discount_type <> 'PERCENT' OR discount_value <= 100),
        CONSTRAINT CK_promotion_codes_max_discount CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
        CONSTRAINT CK_promotion_codes_min_order CHECK (min_order_amount >= 0),
        CONSTRAINT CK_promotion_codes_max_uses CHECK (max_uses IS NULL OR max_uses > 0),
        CONSTRAINT CK_promotion_codes_max_uses_per_user CHECK (max_uses_per_user IS NULL OR max_uses_per_user > 0),
        CONSTRAINT CK_promotion_codes_window CHECK (expires_at IS NULL OR starts_at IS NULL OR starts_at < expires_at)
    );
END;
GO

IF OBJECT_ID(N'dbo.promotion_redemptions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.promotion_redemptions (
        promotion_redemption_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_promotion_redemptions PRIMARY KEY,
        promo_code_id           BIGINT        NOT NULL REFERENCES dbo.promotion_codes (promo_code_id),
        booking_id              BIGINT        NOT NULL REFERENCES dbo.bookings (booking_id),
        user_id                 BIGINT        NULL REFERENCES dbo.users (user_id),
        discount_amount         DECIMAL(14,2) NOT NULL,
        redemption_status       VARCHAR(10)   NOT NULL CONSTRAINT DF_promotion_redemptions_status DEFAULT 'ACTIVE',
        created_at              DATETIME2(0)  NOT NULL CONSTRAINT DF_promotion_redemptions_created_at DEFAULT SYSUTCDATETIME(),
        voided_at               DATETIME2(0)  NULL,
        CONSTRAINT CK_promotion_redemptions_amount CHECK (discount_amount > 0),
        CONSTRAINT CK_promotion_redemptions_status CHECK (redemption_status IN ('ACTIVE','VOID')),
        CONSTRAINT CK_promotion_redemptions_voided CHECK (
            (redemption_status = 'ACTIVE' AND voided_at IS NULL)
            OR (redemption_status = 'VOID' AND voided_at IS NOT NULL)
        )
    );

    CREATE UNIQUE INDEX UX_promotion_redemptions_active_booking
        ON dbo.promotion_redemptions (booking_id) WHERE redemption_status = 'ACTIVE';
    CREATE INDEX IX_promotion_redemptions_code_status
        ON dbo.promotion_redemptions (promo_code_id, redemption_status) INCLUDE (user_id);
END;
GO

CREATE OR ALTER TRIGGER dbo.TRG_promotion_redemptions_no_delete
ON dbo.promotion_redemptions
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 53000, N'promotion_redemptions chỉ được ghi thêm hoặc chuyển VOID; không xóa.', 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_booking_apply_promo
    @booking_id BIGINT,
    @promo_code VARCHAR(40),
    @user_id    BIGINT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @code VARCHAR(40) = UPPER(LTRIM(RTRIM(@promo_code)));
    IF @code IS NULL OR @code = ''
        THROW 53001, N'Mã khuyến mãi không được để trống.', 1;

    DECLARE @booking_subtotal DECIMAL(14,2), @booking_discount DECIMAL(14,2),
            @branch_id BIGINT, @booking_status VARCHAR(30);
    SELECT @booking_subtotal = b.subtotal_amount, @booking_discount = b.discount_amount,
           @branch_id = b.branch_id, @booking_status = st.status_code
    FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
    WHERE b.booking_id = @booking_id;
    IF @booking_status IS NULL
        THROW 53002, N'Booking không tồn tại.', 1;
    IF @booking_status <> 'PENDING_PAYMENT'
        THROW 53003, N'Booking không còn ở trạng thái chờ thanh toán.', 1;
    IF @booking_discount > 0
        THROW 53011, N'Booking đã áp dụng một mã khuyến mãi.', 1;

    DECLARE @fnb_subtotal DECIMAL(14,2) = 0;
    SELECT @fnb_subtotal = fo.subtotal
    FROM dbo.fnb_orders fo WITH (UPDLOCK, HOLDLOCK)
    WHERE fo.booking_id = @booking_id AND fo.order_status = 'PENDING';
    DECLARE @combined DECIMAL(14,2) = @booking_subtotal + @fnb_subtotal;

    DECLARE @promo_id BIGINT, @discount_type VARCHAR(10), @discount_value DECIMAL(14,2),
            @max_discount DECIMAL(14,2), @min_order DECIMAL(14,2), @max_uses INT,
            @max_uses_per_user INT, @starts_at DATETIME2(0), @expires_at DATETIME2(0),
            @is_active BIT, @promo_branch BIGINT;
    SELECT @promo_id = promo_code_id, @discount_type = discount_type, @discount_value = discount_value,
           @max_discount = max_discount_amount, @min_order = min_order_amount, @max_uses = max_uses,
           @max_uses_per_user = max_uses_per_user, @starts_at = starts_at, @expires_at = expires_at,
           @is_active = is_active, @promo_branch = branch_id
    FROM dbo.promotion_codes WITH (UPDLOCK, HOLDLOCK)
    WHERE promo_code = @code;
    IF @promo_id IS NULL OR @is_active = 0
        THROW 53004, N'Mã khuyến mãi không tồn tại hoặc đã ngừng áp dụng.', 1;
    IF @promo_branch IS NOT NULL AND @promo_branch <> @branch_id
        THROW 53005, N'Mã khuyến mãi không áp dụng cho chi nhánh này.', 1;
    DECLARE @now DATETIME2(0) = SYSDATETIME();
    IF (@starts_at IS NOT NULL AND @starts_at > @now) OR (@expires_at IS NOT NULL AND @expires_at <= @now)
        THROW 53006, N'Mã khuyến mãi đã hết hiệu lực hoặc chưa mở.', 1;
    IF @combined < @min_order
        THROW 53007, N'Đơn chưa đạt giá trị tối thiểu để dùng mã khuyến mãi.', 1;

    DECLARE @active_total INT = (
        SELECT COUNT(*) FROM dbo.promotion_redemptions
        WHERE promo_code_id = @promo_id AND redemption_status = 'ACTIVE');
    IF @max_uses IS NOT NULL AND @active_total >= @max_uses
        THROW 53008, N'Mã khuyến mãi đã hết số lượt sử dụng.', 1;
    IF @max_uses_per_user IS NOT NULL AND @user_id IS NOT NULL
    BEGIN
        DECLARE @active_user INT = (
            SELECT COUNT(*) FROM dbo.promotion_redemptions
            WHERE promo_code_id = @promo_id AND redemption_status = 'ACTIVE' AND user_id = @user_id);
        IF @active_user >= @max_uses_per_user
            THROW 53009, N'Tài khoản đã dùng hết số lượt cho phép của mã khuyến mãi.', 1;
    END

    DECLARE @discount DECIMAL(14,2);
    IF @discount_type = 'PERCENT'
        SET @discount = ROUND(@booking_subtotal * @discount_value / 100.0, 2);
    ELSE
        SET @discount = @discount_value;
    IF @max_discount IS NOT NULL AND @discount > @max_discount
        SET @discount = @max_discount;
    IF @discount > @booking_subtotal
        SET @discount = @booking_subtotal;
    IF @discount <= 0
        THROW 53010, N'Mã khuyến mãi không tạo được số tiền giảm hợp lệ.', 1;

    INSERT dbo.promotion_redemptions (promo_code_id, booking_id, user_id, discount_amount)
    VALUES (@promo_id, @booking_id, @user_id, @discount);

    UPDATE dbo.bookings
    SET discount_amount = @discount,
        total_amount = @booking_subtotal - @discount,
        updated_at = SYSUTCDATETIME()
    WHERE booking_id = @booking_id;
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
        DECLARE @fnb_pending BIGINT;
        SELECT @fnb_pending = MIN(fnb_order_id)
        FROM dbo.fnb_orders
        WHERE booking_id = @booking_id AND order_status = 'PENDING';
        IF @fnb_pending IS NOT NULL
        BEGIN
            EXEC dbo.usp_fnb_lock_stock;
            DELETE r
            FROM dbo.fnb_stock_reservations r
            WHERE r.fnb_order_id = @fnb_pending AND r.expires_at IS NOT NULL;
            UPDATE dbo.fnb_orders SET order_status = 'CANCELLED', updated_at = @utc
            WHERE fnb_order_id = @fnb_pending AND order_status = 'PENDING';
        END;
        IF @current = 'PENDING_PAYMENT'
        BEGIN
            UPDATE pr SET redemption_status = 'VOID', voided_at = @now
            FROM dbo.promotion_redemptions pr
            WHERE pr.booking_id = @booking_id AND pr.redemption_status = 'ACTIVE';
        END;
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
    END CATCH
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

        DECLARE @fnb_order_id BIGINT;
        SELECT @fnb_order_id = fo.fnb_order_id
        FROM dbo.fnb_orders fo WITH (UPDLOCK, HOLDLOCK)
        WHERE fo.booking_id = @booking_id AND fo.order_status = 'PENDING';
        IF @fnb_order_id IS NOT NULL
        BEGIN
            SELECT @total_amount = @total_amount + fo.total_amount
            FROM dbo.fnb_orders fo WITH (UPDLOCK, HOLDLOCK)
            WHERE fo.fnb_order_id = @fnb_order_id;
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

            IF @fnb_order_id IS NOT NULL
            BEGIN
                EXEC dbo.usp_fnb_reserve_stock @fnb_order_id, NULL;
                UPDATE dbo.fnb_orders
                SET order_status = 'PAID', updated_at = @now_utc
                WHERE fnb_order_id = @fnb_order_id AND order_status = 'PENDING';
            END;

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
    END CATCH
END
GO
