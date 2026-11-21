SET NOCOUNT ON;
IF LEFT(DB_NAME(),20) <> N'MarumoIntegrityTest_'
    THROW 52900, 'Tests require a disposable MarumoIntegrityTest_ database.', 1;
DECLARE @show BIGINT=(SELECT showtime_id FROM dbo.showtimes WHERE showtime_code='REVIEW_SHOW'),
        @branch BIGINT=(SELECT branch_id FROM dbo.branches WHERE branch_code='REVIEW_BRANCH'),
        @room BIGINT=(SELECT auditorium_id FROM dbo.auditoriums WHERE auditorium_code='REVIEW_R2'),
        @type INT=(SELECT TOP(1) seat_type_id FROM dbo.seat_types),
        @pending SMALLINT=(SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code='PENDING_PAYMENT'),
        @method INT=(SELECT TOP(1) payment_method_id FROM dbo.payment_methods WHERE requires_provider=1 AND is_active=1),
        @provider INT=(SELECT TOP(1) provider_id FROM dbo.payment_providers WHERE is_active=1),
        @booking BIGINT,@seat BIGINT;
INSERT dbo.bookings(booking_code,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount,expires_at)
VALUES('REVIEW_CONCURRENT',@branch,@show,@pending,'WEB',100000,100000,DATEADD(MINUTE,30,SYSDATETIME()));
SET @booking=SCOPE_IDENTITY();
INSERT dbo.booking_seats(booking_id,showtime_id,showtime_seat_id,seat_price,final_price)
SELECT @booking,@show,ss.showtime_seat_id,100000,100000 FROM dbo.showtime_seats ss JOIN dbo.seats s ON s.seat_id=ss.seat_id WHERE s.seat_code='A2';
UPDATE ss SET seat_status='BOOKED' FROM dbo.showtime_seats ss JOIN dbo.seats s ON s.seat_id=ss.seat_id WHERE s.seat_code='A2';
EXEC dbo.usp_payment_create @booking_id=@booking,@payment_method_id=@method,@provider_id=@provider,@idempotency_key='REVIEW_CONCURRENT_PAYMENT';
INSERT dbo.seats(auditorium_id,seat_type_id,seat_code,row_label,seat_number) VALUES(@room,@type,'REVIEW_RACE_SEAT','R',99);
SET @seat=SCOPE_IDENTITY();
INSERT dbo.showtime_seats(showtime_id,auditorium_id,seat_id,seat_status,base_price,final_price)
VALUES(@show,@room,@seat,'AVAILABLE',100000,100000);
INSERT dbo.bookings(booking_code,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount)
VALUES('REVIEW_RACE_ONE',@branch,@show,@pending,'WEB',100000,100000),('REVIEW_RACE_TWO',@branch,@show,@pending,'WEB',100000,100000);
