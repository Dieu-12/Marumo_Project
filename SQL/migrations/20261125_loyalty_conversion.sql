:ON ERROR EXIT
SET XACT_ABORT ON;
GO
USE [$(DATABASE_NAME)];
GO

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NULL
   OR OBJECT_ID(N'dbo.fnb_orders', N'U') IS NULL
   OR OBJECT_ID(N'dbo.usp_payment_finalize', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_booking_pay_with_points', N'P') IS NULL
    THROW 53100, N'Database MARUMO cần migration loyalty và F&B trước khi đổi tỷ lệ điểm.', 1;
IF EXISTS (
    SELECT 1 FROM dbo.system_settings
    WHERE setting_key = 'LOYALTY_CONVERSION_VERSION' AND setting_value = '2'
)
BEGIN
    PRINT N'Tỷ lệ và đơn vị điểm đã được chuyển đổi.';
    RETURN;
END;

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE setting_key = 'LOYALTY_EARN_VND_PER_POINT')
    INSERT dbo.system_settings (setting_key, setting_value, value_type, description)
    VALUES ('LOYALTY_EARN_VND_PER_POINT', '10000', 'INTEGER', N'Số đồng đã thanh toán để tích lũy một điểm Marumo Point');

IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE setting_key = 'LOYALTY_REDEEM_VND_PER_POINT')
    INSERT dbo.system_settings (setting_key, setting_value, value_type, description)
    VALUES ('LOYALTY_REDEEM_VND_PER_POINT', '1000', 'INTEGER', N'Số đồng được thanh toán bằng một điểm Marumo Point');

DECLARE @earn_rate INT = TRY_CONVERT(INT, (SELECT setting_value FROM dbo.system_settings WHERE setting_key = 'LOYALTY_EARN_VND_PER_POINT'));
DECLARE @redeem_rate INT = TRY_CONVERT(INT, (SELECT setting_value FROM dbo.system_settings WHERE setting_key = 'LOYALTY_REDEEM_VND_PER_POINT'));
IF @earn_rate IS NULL OR @earn_rate <= 0 OR @redeem_rate IS NULL OR @redeem_rate <= 0
    THROW 53101, N'Tỷ lệ quy đổi điểm phải là số nguyên dương.', 1;

-- Scale each historical running balance so rounded ledger entries cannot create a negative wallet.
;WITH running_balances AS (
    SELECT ledger_id, user_id,
           SUM(CONVERT(DECIMAL(38, 2), points_delta)) OVER (
               PARTITION BY user_id ORDER BY ledger_id ROWS UNBOUNDED PRECEDING
           ) AS old_balance
    FROM dbo.loyalty_ledger
), rounded_balances AS (
    SELECT ledger_id, user_id,
           CONVERT(BIGINT, ROUND(old_balance / CONVERT(DECIMAL(18, 2), 1000), 0)) AS new_balance
    FROM running_balances
), rescaled_entries AS (
    SELECT ledger_id,
           new_balance - COALESCE(LAG(new_balance) OVER (PARTITION BY user_id ORDER BY ledger_id), 0) AS new_delta
    FROM rounded_balances
)
UPDATE ledger
SET points_delta = CONVERT(INT, rescaled_entries.new_delta)
FROM dbo.loyalty_ledger AS ledger
JOIN rescaled_entries ON rescaled_entries.ledger_id = ledger.ledger_id;

UPDATE account
SET balance_points = CONVERT(INT, COALESCE(ledger_totals.balance_points, ROUND(account.balance_points / 1000.0, 0))),
    lifetime_earned_points = CONVERT(INT, COALESCE(ledger_totals.earned_points, ROUND(account.lifetime_earned_points / 1000.0, 0))),
    lifetime_redeemed_points = CONVERT(INT, COALESCE(ledger_totals.redeemed_points, ROUND(account.lifetime_redeemed_points / 1000.0, 0))),
    updated_at = SYSUTCDATETIME()
FROM dbo.loyalty_accounts AS account
OUTER APPLY (
    SELECT SUM(CONVERT(BIGINT, ledger.points_delta)) AS balance_points,
           SUM(CASE WHEN ledger.change_type = 'EARN' THEN CONVERT(BIGINT, ledger.points_delta) ELSE 0 END) AS earned_points,
           -SUM(CASE WHEN ledger.change_type = 'REDEEM' THEN CONVERT(BIGINT, ledger.points_delta) ELSE 0 END) AS redeemed_points
    FROM dbo.loyalty_ledger AS ledger
    WHERE ledger.user_id = account.user_id
) AS ledger_totals;

DECLARE @definition NVARCHAR(MAX);

SET @definition = OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_payment_finalize'));
IF @definition IS NULL
    THROW 53102, N'Không đọc được dbo.usp_payment_finalize.', 1;
IF CHARINDEX(N'DECLARE @earn_percent INT =', @definition) = 0
   OR CHARINDEX(N'LOYALTY_EARN_PERCENT', @definition) = 0
   OR CHARINDEX(N'FLOOR(@booking_total * @earn_percent / 100.0)', @definition) = 0
    THROW 53103, N'dbo.usp_payment_finalize không có phiên bản loyalty được hỗ trợ.', 1;

SET @definition = REPLACE(@definition, N'DECLARE @earn_percent INT =', N'DECLARE @earn_vnd_per_point INT =');
SET @definition = REPLACE(@definition, N'LOYALTY_EARN_PERCENT', N'LOYALTY_EARN_VND_PER_POINT');
SET @definition = REPLACE(@definition, N'@earn_percent IS NULL OR @earn_percent < 0 OR @earn_percent > 100', N'@earn_vnd_per_point IS NULL OR @earn_vnd_per_point <= 0');
SET @definition = REPLACE(@definition, N'SET @earn_percent = 0;', N'THROW 52136, N''Tỷ lệ tích điểm không hợp lệ.'', 1;');
SET @definition = REPLACE(@definition, N'FLOOR(@booking_total * @earn_percent / 100.0)', N'FLOOR(@tx_amount / @earn_vnd_per_point)');
IF CHARINDEX(N'@earn_percent', @definition) > 0
   OR CHARINDEX(N'FLOOR(@booking_total *', @definition) > 0
    THROW 53104, N'Không cập nhật đầy đủ phép tính tích điểm.', 1;
IF CHARINDEX(N'CREATE', @definition) = 0
    THROW 53108, N'Định nghĩa dbo.usp_payment_finalize không có tiền tố CREATE được hỗ trợ.', 1;
SET @definition = STUFF(@definition, CHARINDEX(N'CREATE', @definition), 6, N'ALTER');
EXEC sys.sp_executesql @definition;

SET @definition = OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_booking_pay_with_points'));
IF @definition IS NULL
    THROW 53105, N'Không đọc được dbo.usp_booking_pay_with_points.', 1;
IF CHARINDEX(N'LOYALTY_CONVERSION_VERSION', @definition) > 0
BEGIN
    IF CHARINDEX(N'LOYALTY_REDEEM_VND_PER_POINT', @definition) = 0
       OR CHARINDEX(N'CEILING(@total_amount / @redeem_vnd_per_point)', @definition) = 0
        THROW 53107, N'Không cập nhật đầy đủ phép tính dùng điểm.', 1;
END
ELSE
BEGIN
    IF CHARINDEX(N'DECLARE @status_code VARCHAR(30),', @definition) = 0
       OR CHARINDEX(N'DECLARE @points_required INT = CONVERT(INT, FLOOR(@total_amount));', @definition) = 0
        THROW 53106, N'dbo.usp_booking_pay_with_points không có phiên bản loyalty được hỗ trợ.', 1;

    SET @definition = REPLACE(
        @definition,
        N'DECLARE @status_code VARCHAR(30),',
        N'DECLARE @redeem_vnd_per_point INT = TRY_CONVERT(INT, (SELECT TOP (1) CONVERT(NVARCHAR(100), setting_value) FROM dbo.system_settings WHERE setting_key = ''LOYALTY_REDEEM_VND_PER_POINT'')), @status_code VARCHAR(30),'
    );
    SET @definition = REPLACE(
        @definition,
        N'DECLARE @points_required INT = CONVERT(INT, FLOOR(@total_amount));',
        N'IF @redeem_vnd_per_point IS NULL OR @redeem_vnd_per_point <= 0 THROW 52809, N''Tỷ lệ đổi điểm không hợp lệ.'', 1; DECLARE @points_required INT = CONVERT(INT, CEILING(@total_amount / @redeem_vnd_per_point));'
    );
    IF CHARINDEX(N'FLOOR(@total_amount)', @definition) > 0
       OR CHARINDEX(N'LOYALTY_REDEEM_VND_PER_POINT', @definition) = 0
        THROW 53107, N'Không cập nhật đầy đủ phép tính dùng điểm.', 1;
    IF CHARINDEX(N'CREATE', @definition) = 0
        THROW 53109, N'Định nghĩa dbo.usp_booking_pay_with_points không có tiền tố CREATE được hỗ trợ.', 1;
    SET @definition = STUFF(@definition, CHARINDEX(N'CREATE', @definition), 6, N'ALTER');
    EXEC sys.sp_executesql @definition;
END;

DELETE dbo.system_settings
WHERE setting_key IN ('LOYALTY_EARN_PERCENT', 'LOYALTY_REDEEM_POINT_PER_VND');

INSERT dbo.system_settings (setting_key, setting_value, value_type, description)
VALUES ('LOYALTY_CONVERSION_VERSION', '2', 'INTEGER', N'Đơn vị Marumo Point đã được chuyển đổi sang tỷ giá mới');

COMMIT TRANSACTION;
GO
