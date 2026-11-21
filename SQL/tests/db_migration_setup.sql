SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
IF LEFT(DB_NAME(),20) <> N'MarumoIntegrityTest_'
    THROW 52900, 'Tests require a disposable MarumoIntegrityTest_ database.', 1;
DECLARE @old BIGINT=(SELECT booking_id FROM dbo.bookings WHERE booking_code='REVIEW_EXPIRED'),
        @booking BIGINT,@show BIGINT,@branch BIGINT,@seat BIGINT,
        @pending SMALLINT=(SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code='PENDING_PAYMENT'),
        @token UNIQUEIDENTIFIER=NEWID(),@session UNIQUEIDENTIFIER=NEWID(),@json NVARCHAR(MAX);
SELECT @show=showtime_id,@branch=branch_id FROM dbo.bookings WHERE booking_id=@old;
UPDATE dbo.booking_seats SET released_at=NULL WHERE booking_id=@old;
SELECT @seat=ss.seat_id FROM dbo.showtime_seats ss JOIN dbo.booking_seats bs ON bs.showtime_seat_id=ss.showtime_seat_id WHERE bs.booking_id=@old;
INSERT dbo.bookings(booking_code,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount,expires_at)
VALUES('REVIEW_HOLD_ONLY',@branch,@show,@pending,'WEB',100000,100000,DATEADD(MINUTE,30,SYSDATETIME()));
SET @booking=SCOPE_IDENTITY();
SET @json=N'['+CONVERT(NVARCHAR(30),@seat)+N']';
EXEC dbo.usp_showtime_hold_seats @showtime_id=@show,@seat_ids_json=@json,@hold_token=@token,@session_id=@session,@booking_id=@booking;
