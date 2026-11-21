SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
IF LEFT(DB_NAME(),20) <> N'MarumoIntegrityTest_'
    THROW 52900, 'Tests require a disposable MarumoIntegrityTest_ database.', 1;

DECLARE @u BIGINT,@b BIGINT,@r1 BIGINT,@r2 BIGINT,@movie BIGINT,@mv BIGINT,@show BIGINT,
        @seat BIGINT,@seat2 BIGINT,@ss BIGINT,@ss2 BIGINT,@bk BIGINT,@next BIGINT,@line BIGINT,@tx BIGINT;
DECLARE @rt INT=(SELECT TOP(1) room_type_id FROM dbo.room_types),
        @st INT=(SELECT TOP(1) seat_type_id FROM dbo.seat_types),
        @fmt INT=(SELECT TOP(1) format_id FROM dbo.screening_formats),
        @lang SMALLINT=(SELECT TOP(1) language_id FROM dbo.languages),
        @provider INT=(SELECT TOP(1) provider_id FROM dbo.payment_providers WHERE is_active=1),
        @method INT=(SELECT TOP(1) payment_method_id FROM dbo.payment_methods WHERE requires_provider=1 AND is_active=1),
        @pending SMALLINT=(SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code='PENDING_PAYMENT'),
        @confirmed SMALLINT=(SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code='CONFIRMED'),
        @issued SMALLINT=(SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code='ISSUED');
INSERT dbo.users(email,password_hash,full_name,status) VALUES('review@example.test','test-fixture',N'Review user','ACTIVE'); SET @u=SCOPE_IDENTITY();
INSERT dbo.branches(branch_code,branch_name,status) VALUES('REVIEW_BRANCH',N'Review branch','ACTIVE'); SET @b=SCOPE_IDENTITY();
INSERT dbo.auditoriums(branch_id,room_type_id,auditorium_code,auditorium_name) VALUES(@b,@rt,'REVIEW_R1',N'Room one'); SET @r1=SCOPE_IDENTITY();
INSERT dbo.auditoriums(branch_id,room_type_id,auditorium_code,auditorium_name) VALUES(@b,@rt,'REVIEW_R2',N'Room two'); SET @r2=SCOPE_IDENTITY();
INSERT dbo.auditorium_screening_formats(auditorium_id,format_id) VALUES(@r1,@fmt),(@r2,@fmt);
INSERT dbo.movies(movie_code,title,slug,duration_minutes) VALUES('REVIEW_MOVIE',N'Review movie','review-movie',60); SET @movie=SCOPE_IDENTITY();
INSERT dbo.movie_versions(movie_id,version_code,version_name,audio_language_id,format_id) VALUES(@movie,'REVIEW_VERSION',N'Review version',@lang,@fmt); SET @mv=SCOPE_IDENTITY();
DECLARE @start DATETIME2(0)=DATEADD(DAY,2,SYSDATETIME()),@end DATETIME2(0)=DATEADD(HOUR,2,DATEADD(DAY,2,SYSDATETIME()));
EXEC dbo.usp_showtime_create @showtime_code='REVIEW_SHOW',@branch_id=@b,@auditorium_id=@r1,@movie_version_id=@mv,@start_at=@start,@end_at=@end,@base_ticket_price=100000,@created_by_user_id=@u,@showtime_id=@show OUTPUT;
EXEC dbo.usp_showtime_reschedule @showtime_id=@show,@changed_by_user_id=@u,@change_type='ROOM_CHANGE',@change_reason=N'Review empty move',@auditorium_id=@r2;
IF NOT EXISTS(SELECT 1 FROM dbo.showtimes WHERE showtime_id=@show AND auditorium_id=@r2) THROW 52901,'Empty showtime did not move.',1;
PRINT 'PASS empty showtime room change';
INSERT dbo.seats(auditorium_id,seat_type_id,seat_code,row_label,seat_number) VALUES(@r2,@st,'A1','A',1); SET @seat=SCOPE_IDENTITY();
INSERT dbo.seats(auditorium_id,seat_type_id,seat_code,row_label,seat_number) VALUES(@r2,@st,'A2','A',2); SET @seat2=SCOPE_IDENTITY();
INSERT dbo.showtime_seats(showtime_id,auditorium_id,seat_id,seat_status,base_price,final_price) VALUES(@show,@r2,@seat,'AVAILABLE',100000,100000); SET @ss=SCOPE_IDENTITY();
INSERT dbo.showtime_seats(showtime_id,auditorium_id,seat_id,seat_status,base_price,final_price) VALUES(@show,@r2,@seat2,'AVAILABLE',100000,100000); SET @ss2=SCOPE_IDENTITY();
DECLARE @rejected BIT=0;
BEGIN TRY
 EXEC dbo.usp_showtime_reschedule @showtime_id=@show,@changed_by_user_id=@u,@change_type='ROOM_CHANGE',@change_reason=N'Review populated move',@auditorium_id=@r1;
END TRY BEGIN CATCH SET @rejected=1; END CATCH;
IF @rejected=0 OR NOT EXISTS(SELECT 1 FROM dbo.showtimes WHERE showtime_id=@show AND auditorium_id=@r2) THROW 52902,'Populated showtime moved or lost its room.',1;
SET @rejected=0;
BEGIN TRY
 UPDATE dbo.showtime_seats SET auditorium_id=@r1 WHERE showtime_seat_id=@ss;
END TRY BEGIN CATCH IF ERROR_NUMBER()=547 SET @rejected=1; ELSE THROW; END CATCH;
IF @rejected=0 THROW 52903,'Wrong-room inventory was accepted.',1;
PRINT 'PASS populated room move and wrong-room inventory rejected';

INSERT dbo.bookings(booking_code,user_id,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount) VALUES('REVIEW_OLD',@u,@b,@show,@confirmed,'WEB',100000,100000); SET @bk=SCOPE_IDENTITY();
INSERT dbo.booking_seats(booking_id,showtime_id,showtime_seat_id,seat_price,final_price) VALUES(@bk,@show,@ss,100000,100000); SET @line=SCOPE_IDENTITY();
UPDATE dbo.showtime_seats SET seat_status='SOLD' WHERE showtime_seat_id=@ss;
INSERT dbo.tickets(ticket_code,booking_seat_id,ticket_status_id,qr_token_hash) VALUES('REVIEW_OLD_TICKET',@line,@issued,'REVIEW_OLD_HASH');
EXEC dbo.usp_booking_release @booking_id=@bk,@actor_user_id=@u,@reason=N'Review cancellation';
IF NOT EXISTS(SELECT 1 FROM dbo.booking_seats WHERE booking_seat_id=@line AND released_at IS NOT NULL) THROW 52904,'Cancellation did not release allocation.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.tickets t JOIN dbo.ticket_statuses s ON s.ticket_status_id=t.ticket_status_id WHERE t.booking_seat_id=@line AND s.status_code='VOIDED') THROW 52905,'Historical ticket missing or usable.',1;
INSERT dbo.bookings(booking_code,user_id,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount,expires_at) VALUES('REVIEW_NEW',@u,@b,@show,@pending,'WEB',100000,100000,DATEADD(MINUTE,30,SYSDATETIME())); SET @next=SCOPE_IDENTITY();
INSERT dbo.booking_seats(booking_id,showtime_id,showtime_seat_id,seat_price,final_price) VALUES(@next,@show,@ss,100000,100000);
UPDATE dbo.showtime_seats SET seat_status='BOOKED' WHERE showtime_seat_id=@ss;
EXEC dbo.usp_booking_release @booking_id=@bk,@actor_user_id=@u,@reason=N'Review repeated cancellation';
IF NOT EXISTS(SELECT 1 FROM dbo.showtime_seats WHERE showtime_seat_id=@ss AND seat_status='BOOKED') THROW 52906,'Repeated cancellation released another booking seat.',1;
SET @rejected=0;
BEGIN TRY
 INSERT dbo.booking_seats(booking_id,showtime_id,showtime_seat_id,seat_price,final_price) VALUES(@bk,@show,@ss,100000,100000);
END TRY BEGIN CATCH IF ERROR_NUMBER() IN(2601,2627) SET @rejected=1; ELSE THROW; END CATCH;
IF @rejected=0 THROW 52907,'Two active allocations claimed the same seat.',1;
PRINT 'PASS cancellation preserves tickets, resale succeeds and repeated cancellation is harmless';

EXEC dbo.usp_payment_create @booking_id=@next,@payment_method_id=@method,@provider_id=@provider,@idempotency_key='REVIEW_PAYMENT';
SELECT @tx=payment_transaction_id FROM dbo.payment_transactions WHERE idempotency_key='REVIEW_PAYMENT';
EXEC dbo.usp_payment_provider_event_apply @provider_id=@provider,@provider_event_id='REVIEW_SIGNATURE',@payment_transaction_id=@tx,@event_type='PAYMENT_SUCCESS',@event_payload=N'{}',@signature_valid=0,@provider_transaction_id='REVIEW_PROVIDER_TX',@event_amount=100000,@event_currency='VND';
EXEC dbo.usp_payment_provider_event_apply @provider_id=@provider,@provider_event_id='REVIEW_SIGNATURE',@payment_transaction_id=@tx,@event_type='PAYMENT_SUCCESS',@event_payload=N'{}',@signature_valid=1,@provider_transaction_id='REVIEW_PROVIDER_TX',@event_amount=100000,@event_currency='VND';
IF NOT EXISTS(SELECT 1 FROM dbo.payment_transactions WHERE payment_transaction_id=@tx AND status='SUCCESS') THROW 52908,'Valid signature retry did not finalize payment.',1;
EXEC dbo.usp_payment_provider_event_apply @provider_id=@provider,@provider_event_id='REVIEW_SIGNATURE',@payment_transaction_id=@tx,@event_type='PAYMENT_SUCCESS',@event_payload=N'{}',@signature_valid=1,@provider_transaction_id='REVIEW_PROVIDER_TX',@event_amount=100000,@event_currency='VND';
IF (SELECT COUNT(*) FROM dbo.tickets t JOIN dbo.booking_seats bs ON bs.booking_seat_id=t.booking_seat_id WHERE bs.booking_id=@next)<>1 THROW 52909,'Duplicate event issued extra tickets.',1;
PRINT 'PASS valid webhook after invalid signature and duplicate success';

DECLARE @retry BIGINT;
INSERT dbo.bookings(booking_code,user_id,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount,expires_at) VALUES('REVIEW_RETRY',@u,@b,@show,@pending,'WEB',100000,100000,DATEADD(MINUTE,30,SYSDATETIME())); SET @retry=SCOPE_IDENTITY();
INSERT dbo.booking_seats(booking_id,showtime_id,showtime_seat_id,seat_price,final_price) VALUES(@retry,@show,@ss2,100000,100000);
EXEC dbo.usp_payment_create @booking_id=@retry,@payment_method_id=@method,@provider_id=@provider,@idempotency_key='REVIEW_RETRY_PAYMENT';
SELECT @tx=payment_transaction_id FROM dbo.payment_transactions WHERE idempotency_key='REVIEW_RETRY_PAYMENT';
EXEC dbo.usp_payment_provider_event_apply @provider_id=@provider,@provider_event_id='REVIEW_FAILED_RETRY',@payment_transaction_id=@tx,@event_type='PAYMENT_SUCCESS',@event_payload=N'{}',@signature_valid=1,@provider_transaction_id='REVIEW_RETRY_TX',@event_amount=100000,@event_currency='VND';
IF EXISTS(SELECT 1 FROM dbo.payment_transactions WHERE payment_transaction_id=@tx AND status='SUCCESS') THROW 52910,'Unavailable seat unexpectedly finalized.',1;
UPDATE dbo.showtime_seats SET seat_status='BOOKED' WHERE showtime_seat_id=@ss2;
UPDATE dbo.booking_seats SET released_at=SYSUTCDATETIME() WHERE booking_id=@retry;
SET @rejected=0;
BEGIN TRY
 EXEC dbo.usp_payment_finalize @payment_transaction_id=@tx;
END TRY BEGIN CATCH SET @rejected=1; END CATCH;
IF @rejected=0 OR EXISTS(SELECT 1 FROM dbo.tickets t JOIN dbo.booking_seats bs ON bs.booking_seat_id=t.booking_seat_id WHERE bs.booking_id=@retry) THROW 52914,'Released allocation was finalized.',1;
UPDATE dbo.booking_seats SET released_at=NULL WHERE booking_id=@retry;
EXEC dbo.usp_payment_provider_event_apply @provider_id=@provider,@provider_event_id='REVIEW_FAILED_RETRY',@payment_transaction_id=@tx,@event_type='PAYMENT_SUCCESS',@event_payload=N'{}',@signature_valid=1,@provider_transaction_id='REVIEW_RETRY_TX',@event_amount=100000,@event_currency='VND';
IF NOT EXISTS(SELECT 1 FROM dbo.payment_transactions WHERE payment_transaction_id=@tx AND status='SUCCESS') THROW 52911,'Failed finalization could not retry.',1;
PRINT 'PASS failed finalization rolls back and retries successfully';
EXEC dbo.usp_booking_release @booking_id=@retry,@actor_user_id=@u,@reason=N'Review release for expiry fixture';
DECLARE @expired BIGINT;
INSERT dbo.bookings(booking_code,user_id,branch_id,showtime_id,booking_status_id,booking_channel,subtotal_amount,total_amount,expires_at) VALUES('REVIEW_EXPIRED',@u,@b,@show,@pending,'WEB',100000,100000,DATEADD(MINUTE,-1,SYSDATETIME())); SET @expired=SCOPE_IDENTITY();
INSERT dbo.booking_seats(booking_id,showtime_id,showtime_seat_id,seat_price,final_price) VALUES(@expired,@show,@ss2,100000,100000);
UPDATE dbo.showtime_seats SET seat_status='BOOKED' WHERE showtime_seat_id=@ss2;
EXEC dbo.usp_booking_release @booking_id=@expired,@status_code='EXPIRED',@reason=N'Review expiration';
IF NOT EXISTS(SELECT 1 FROM dbo.bookings b JOIN dbo.booking_statuses s ON s.booking_status_id=b.booking_status_id WHERE b.booking_id=@expired AND s.status_code='EXPIRED') OR EXISTS(SELECT 1 FROM dbo.booking_seats WHERE booking_id=@expired AND released_at IS NULL) OR NOT EXISTS(SELECT 1 FROM dbo.showtime_seats WHERE showtime_seat_id=@ss2 AND seat_status='AVAILABLE') THROW 52915,'Expiration failed to release the whole booking.',1;
PRINT 'PASS released allocations cannot finalize and expiry releases seats';

DECLARE @ingredient BIGINT,@inventory BIGINT,@batch BIGINT,@itx BIGINT,@key UNIQUEIDENTIFIER=NEWID(),@unit BIGINT=(SELECT TOP(1) unit_id FROM dbo.fnb_units),@tomorrow DATE=DATEADD(DAY,1,CONVERT(DATE,SYSUTCDATETIME()));
INSERT dbo.fnb_ingredients(ingredient_code,ingredient_name,ingredient_type,base_unit_id) VALUES('REVIEW_INGREDIENT',N'Review ingredient','RAW_MATERIAL',@unit); SET @ingredient=SCOPE_IDENTITY();
EXEC dbo.usp_fnb_inventory_open @branch_id=@b,@ingredient_id=@ingredient,@inventory_id=@inventory OUTPUT;
EXEC dbo.usp_fnb_inventory_apply_transaction @inventory_id=@inventory,@transaction_type='PURCHASE',@quantity_change=20,@idempotency_key=@key,@batch_code='REVIEW_LOT',@unit_cost=100,@expiry_date=@tomorrow,@inventory_transaction_id=@itx OUTPUT,@result_stock_batch_id=@batch OUTPUT;
UPDATE dbo.fnb_stock_batches SET expiry_date=DATEADD(DAY,-1,CONVERT(DATE,SYSUTCDATETIME())) WHERE stock_batch_id=@batch;
DECLARE @count INT=(SELECT COUNT(*) FROM dbo.fnb_inventory_transactions WHERE inventory_id=@inventory);
SET @rejected=0; SET @key=NEWID();
BEGIN TRY
 EXEC dbo.usp_fnb_inventory_apply_transaction @inventory_id=@inventory,@transaction_type='PURCHASE',@quantity_change=5,@idempotency_key=@key,@batch_code='REVIEW_LOT',@unit_cost=100,@expiry_date=NULL,@inventory_transaction_id=@itx OUTPUT,@result_stock_batch_id=@batch OUTPUT;
END TRY BEGIN CATCH SET @rejected=1; END CATCH;
IF @rejected=0 THROW 52912,'Expired lot accepted a purchase with omitted expiry.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.fnb_inventory WHERE inventory_id=@inventory AND quantity_on_hand=20) OR NOT EXISTS(SELECT 1 FROM dbo.fnb_stock_batches WHERE stock_batch_id=@batch AND remaining_quantity=20 AND received_quantity=20) OR @count<>(SELECT COUNT(*) FROM dbo.fnb_inventory_transactions WHERE inventory_id=@inventory) THROW 52913,'Rejected purchase changed stock or ledger.',1;
PRINT 'PASS expired lot purchase rejected without stock or ledger mutation';
DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS,NO_INFOMSGS;
PRINT 'PASS DB integrity regression suite';
