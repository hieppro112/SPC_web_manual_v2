-- ============================================================
-- setup-database.sql — Quyền cho tài khoản app trên các bảng WebManual
-- ============================================================
-- Chạy SAU create-tables.sql, trong SSMS, bằng tài khoản có quyền cấp
-- quyền trong database KVH (thường là IT / db_owner).
--
-- KVH là database DÙNG CHUNG của công ty. Tài khoản app (kvh_write) chỉ
-- được cấp quyền trên ĐÚNG 7 bảng WebManual..., KHÔNG dùng db_datareader /
-- db_datawriter (hai role đó cho đọc/ghi MỌI bảng của các hệ thống khác).
--
-- Login kvh_write (tên + mật khẩu cấp máy chủ) do IT tạo. Nếu chưa có,
-- bỏ dấu -- ở khối (1), thay <MAT_KHAU_MANH> NGAY TRONG SSMS, chạy xong
-- đóng file KHÔNG lưu. Không gửi mật khẩu qua chat / email / Git.

USE KVH;
GO

IF DB_NAME() <> N'KVH'
BEGIN
  RAISERROR(N'Không đứng ở database KVH -> DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

IF OBJECT_ID(N'WebManualUsers', N'U') IS NULL
BEGIN
  RAISERROR(N'Chưa có bảng WebManualUsers -> chạy create-tables.sql trước. DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

-- (1) Login cấp máy chủ — chỉ khi IT chưa tạo
-- IF SUSER_ID(N'kvh_write') IS NULL
--   CREATE LOGIN kvh_write WITH PASSWORD = N'<MAT_KHAU_MANH>', DEFAULT_DATABASE = KVH, CHECK_POLICY = ON;
-- GO

-- (2) User trong database KVH
IF USER_ID(N'kvh_write') IS NULL
  CREATE USER kvh_write FOR LOGIN kvh_write WITH DEFAULT_SCHEMA = dbo;
GO

-- (3) Quyền đọc/ghi CHỈ trên các bảng của WebManual
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualUsers            TO kvh_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualCategories       TO kvh_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualDocuments        TO kvh_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualDocumentVersions TO kvh_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualMedia            TO kvh_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualUploadSessions   TO kvh_write;
GRANT SELECT, INSERT                 ON dbo.WebManualSchemaMigrations TO kvh_write;
GO

-- Kiểm tra: kvh_write phải có quyền trên đúng 7 bảng WebManual
SELECT OBJECT_NAME(major_id) AS TableName, permission_name AS Permission
FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write') AND class = 1
ORDER BY TableName, Permission;

-- Kiểm tra: kvh_write KHÔNG nên nằm trong role đọc/ghi toàn database
SELECT r.name AS RoleName
FROM sys.database_role_members rm
JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
WHERE rm.member_principal_id = USER_ID(N'kvh_write');
GO

SET NOEXEC OFF;
GO
