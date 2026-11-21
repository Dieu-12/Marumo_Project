SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
IF LEFT(DB_NAME(),20) <> N'MarumoIntegrityTest_'
    THROW 52900, 'Tests require a disposable MarumoIntegrityTest_ database.', 1;
DECLARE @booking BIGINT=(SELECT booking_id FROM dbo.bookings WHERE booking_code='REVIEW_HOLD_ONLY'),
        @show BIGINT,@branch BIGINT,@seat BIGINT,@ss BIGINT,@next BIGINT,
        @pending SMALLINT=(SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code='PENDING_PAYMENT'),
        @token UNIQUEIDENTIFIER=NEWID(),@session UNIQUEIDENTIFIER=NEWID(),@json NVARCHAR(MAX);
SELECT @ss=h.showtime_seat_id,@show=h.showtime_id,@seat=ss.seat_id
FROM dbo.seat_holds h JOIN dbo.showtime_seats ss ON ss.showtime_seat_id=h.showtime_seat_id WHERE h.booking_id=@booking AND h.hold_status='ACTIVE';
IF @ss IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.showtime_seats WHERE showtime_seat_id=@ss AND seat_status='HELD')
    THROW 52923,'Migration cleared a newer buyer hold.',1;
SELECT @branch=branch_id FROM dbo.bookings WHERE booking_id=@booking;
EXEC dbo.usp_booking_release @booking_id=@booking;
IF NOT EXISTS(SELECT 1 FROM dbo.showtime_seats WHERE showtime_seat_id=@ss AND seat_status='AVAILABLE')
    THROW 52924,'Hold-only booking cancellation did not return its seat.',1;
INSERT dbo.bookings(booking_code,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount,expires_at)
VALUES('REVIEW_HOLD_NEXT',@branch,@show,@pending,'WEB',100000,100000,DATEADD(MINUTE,30,SYSDATETIME()));
SET @next=SCOPE_IDENTITY();
SET @json=N'['+CONVERT(NVARCHAR(30),@seat)+N']';
EXEC dbo.usp_showtime_hold_seats @showtime_id=@show,@seat_ids_json=@json,@hold_token=@token,@session_id=@session,@booking_id=@next;
EXEC dbo.usp_booking_release @booking_id=@booking;
IF NOT EXISTS(SELECT 1 FROM dbo.showtime_seats WHERE showtime_seat_id=@ss AND seat_status='HELD' AND held_by_session_id=@session)
    THROW 52925,'Repeated cancellation cleared a newer buyer hold.',1;
EXEC dbo.usp_booking_release @booking_id=@next;
PRINT 'PASS migration and repeated cancellation preserve newer buyer holds';
