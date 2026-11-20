/* =====================================================================
   MARUMO - Xoá database MarumoDB nếu đang tồn tại
   Dùng khi cần chạy lại MarumoDB.sql từ đầu.
   CẢNH BÁO: toàn bộ dữ liệu trong MarumoDB sẽ bị xoá.
   ===================================================================== */

USE master;
GO

IF DB_ID(N'MarumoDB') IS NOT NULL
BEGIN
    ALTER DATABASE MarumoDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE MarumoDB;
END
GO
