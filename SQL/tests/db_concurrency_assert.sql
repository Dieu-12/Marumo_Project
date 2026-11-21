SET NOCOUNT ON;
IF LEFT(DB_NAME(),20) <> N'MarumoIntegrityTest_'
    THROW 52900, 'Tests require a disposable MarumoIntegrityTest_ database.', 1;
IF (SELECT COUNT(*) FROM dbo.payment_provider_events WHERE provider_event_id='REVIEW_CONCURRENT_EVENT' AND processing_status='PROCESSED')<>1
    THROW 52920,'Concurrent callbacks did not converge to one processed event.',1;
IF (SELECT COUNT(*) FROM dbo.tickets t JOIN dbo.booking_seats bs ON bs.booking_seat_id=t.booking_seat_id JOIN dbo.bookings b ON b.booking_id=bs.booking_id WHERE b.booking_code='REVIEW_CONCURRENT')<>1
    THROW 52921,'Concurrent callbacks did not issue exactly one ticket.',1;
IF (SELECT COUNT(*) FROM dbo.booking_seats bs JOIN dbo.showtime_seats ss ON ss.showtime_seat_id=bs.showtime_seat_id JOIN dbo.seats s ON s.seat_id=ss.seat_id WHERE s.seat_code='REVIEW_RACE_SEAT' AND bs.released_at IS NULL)<>1
    THROW 52922,'Concurrent buyers did not converge to one active allocation.',1;
PRINT 'PASS concurrent webhooks issue one ticket and concurrent buyers claim one allocation';
DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS,NO_INFOMSGS;
