-- ============================================================
-- setup-database.sql — Tạo database WebManual + tài khoản cho app
-- ============================================================
-- Chạy MỘT LẦN trong SSMS, đăng nhập bằng tài khoản có quyền tạo database
-- và login (sysadmin, hoặc dbcreator + securityadmin).
--
-- TRƯỚC KHI CHẠY: thay <MAT_KHAU_MANH> bằng mật khẩu mạnh NGAY TRONG SSMS.
--   - KHÔNG lưu file này sau khi đã điền mật khẩu, KHÔNG commit, KHÔNG gửi qua chat.
--   - Điền cùng mật khẩu đó vào DB_PASSWORD trong server\.env.
--
-- App chỉ cần tài khoản này. Bảng KHÔNG tạo ở đây — app tự tạo khi khởi
-- động lần đầu (file server/src/db/migrations/*.sql).
--
-- Yêu cầu: SQL Server bật chế độ đăng nhập "SQL Server and Windows
-- Authentication mode" (Mixed Mode) — nếu không, tài khoản SQL không đăng nhập được.

USE master;
GO

-- 1. Database
IF DB_ID(N'WebManual') IS NULL
  CREATE DATABASE WebManual;
GO

-- 2. Login cấp máy chủ (tên đăng nhập + mật khẩu)
IF SUSER_ID(N'kvh_write') IS NULL
  CREATE LOGIN kvh_write
    WITH PASSWORD = N'<MAT_KHAU_MANH>',
         DEFAULT_DATABASE = WebManual,
         CHECK_POLICY = ON;
GO

-- 3. User trong database + quyền tối thiểu cần thiết
USE WebManual;
GO

IF USER_ID(N'kvh_write') IS NULL
  CREATE USER kvh_write FOR LOGIN kvh_write;
GO

ALTER ROLE db_datareader ADD MEMBER kvh_write;  -- đọc dữ liệu
ALTER ROLE db_datawriter ADD MEMBER kvh_write;  -- thêm / sửa / xóa dữ liệu
ALTER ROLE db_ddladmin   ADD MEMBER kvh_write;  -- tạo / sửa bảng (app tự chạy migration)
GO

-- ------------------------------------------------------------
-- (CHỈ TRÊN MÁY PHÁT TRIỂN) Database riêng để chạy test tự động.
-- Test sẽ XÓA SẠCH dữ liệu trong database này mỗi lần chạy.
-- Bỏ dấu -- ở các dòng dưới nếu cần.
-- ------------------------------------------------------------
-- USE master;
-- GO
-- IF DB_ID(N'WebManual_Test') IS NULL CREATE DATABASE WebManual_Test;
-- GO
-- USE WebManual_Test;
-- GO
-- IF USER_ID(N'kvh_write') IS NULL CREATE USER kvh_write FOR LOGIN kvh_write;
-- ALTER ROLE db_datareader ADD MEMBER kvh_write;
-- ALTER ROLE db_datawriter ADD MEMBER kvh_write;
-- ALTER ROLE db_ddladmin   ADD MEMBER kvh_write;
-- GO

-- Kiểm tra: phải thấy kvh_write với 3 quyền trên
USE WebManual;
SELECT dp.name AS UserName, r.name AS RoleName
FROM sys.database_role_members rm
JOIN sys.database_principals r  ON r.principal_id  = rm.role_principal_id
JOIN sys.database_principals dp ON dp.principal_id = rm.member_principal_id
WHERE dp.name = N'kvh_write';
