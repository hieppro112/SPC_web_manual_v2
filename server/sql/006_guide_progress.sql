-- ============================================================
-- 006_guide_progress.sql — Tiến độ hướng dẫn sử dụng (chạy TAY trong SSMS)
-- ============================================================
-- Chạy trên database KVH, bằng tài khoản CÓ QUYỀN TẠO BẢNG + CẤP QUYỀN
-- (KHÔNG dùng kvh_write). Chạy lại nhiều lần cũng an toàn.
-- (Tự tạo bảng bằng cách khác cũng được — app tự nhận ra bảng đã có.)

USE KVH;
GO

IF DB_NAME() <> N'KVH' OR OBJECT_ID(N'dbo.WebManualDocuments', N'U') IS NULL
BEGIN
  RAISERROR(N'Không đứng ở database KVH -> DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

IF HAS_PERMS_BY_NAME(NULL, N'DATABASE', N'CREATE TABLE') = 0 OR HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'ALTER') = 0
BEGIN
  DECLARE @who NVARCHAR(200) = SUSER_SNAME();
  RAISERROR(N'Tài khoản "%s" không có quyền tạo bảng -> DỪNG. Đăng nhập SSMS bằng tài khoản quản trị.', 16, 1, @who);
  SET NOEXEC ON;
END
GO

IF OBJECT_ID(N'dbo.WebManualGuideProgress', N'U') IS NULL
  CREATE TABLE dbo.WebManualGuideProgress (
    UserId      INT          NOT NULL CONSTRAINT FK_WebManualGuideProgress_User REFERENCES dbo.WebManualUsers (Id) ON DELETE CASCADE,
    TaskKey     NVARCHAR(40) NOT NULL,
    CompletedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualGuideProgress_CompletedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_WebManualGuideProgress PRIMARY KEY (UserId, TaskKey)
  );
GO

IF USER_ID(N'kvh_write') IS NOT NULL
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualGuideProgress TO kvh_write;
ELSE
  RAISERROR(N'Không thấy user kvh_write -> tự cấp quyền bảng WebManualGuideProgress cho tài khoản app.', 10, 1);
GO

IF OBJECT_ID(N'dbo.WebManualGuideProgress', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'006_guide_progress.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'006_guide_progress.sql');
GO

-- Kiểm tra: phải thấy bảng WebManualGuideProgress, quyền của kvh_write, 6 dòng đánh dấu (001–006)
SELECT name AS BangMoi FROM sys.tables WHERE name = N'WebManualGuideProgress';
SELECT permission_name AS Quyen FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write') AND major_id = OBJECT_ID(N'dbo.WebManualGuideProgress');
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
