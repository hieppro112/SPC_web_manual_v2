-- ============================================================
-- 010_engagement.sql — Lượt xem + thả tim tài liệu (chạy TAY trong SSMS)
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

IF OBJECT_ID(N'dbo.WebManualDocViews', N'U') IS NULL
  CREATE TABLE dbo.WebManualDocViews (
    DocumentId INT          NOT NULL CONSTRAINT FK_WebManualDocViews_Document REFERENCES dbo.WebManualDocuments (Id) ON DELETE CASCADE,
    ViewDate   DATE         NOT NULL,
    ViewerKey  NVARCHAR(64) NOT NULL,
    CreatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualDocViews_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_WebManualDocViews PRIMARY KEY (DocumentId, ViewDate, ViewerKey)
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualDocViews_Date' AND object_id = OBJECT_ID(N'dbo.WebManualDocViews'))
  CREATE INDEX IX_WebManualDocViews_Date ON dbo.WebManualDocViews (ViewDate, DocumentId);
GO

IF OBJECT_ID(N'dbo.WebManualDocLikes', N'U') IS NULL
  CREATE TABLE dbo.WebManualDocLikes (
    DocumentId INT          NOT NULL CONSTRAINT FK_WebManualDocLikes_Document REFERENCES dbo.WebManualDocuments (Id) ON DELETE CASCADE,
    UserId     INT          NOT NULL CONSTRAINT FK_WebManualDocLikes_User REFERENCES dbo.WebManualUsers (Id) ON DELETE CASCADE,
    CreatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualDocLikes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_WebManualDocLikes PRIMARY KEY (DocumentId, UserId)
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualDocLikes_User' AND object_id = OBJECT_ID(N'dbo.WebManualDocLikes'))
  CREATE INDEX IX_WebManualDocLikes_User ON dbo.WebManualDocLikes (UserId, CreatedAt DESC);
GO

IF USER_ID(N'kvh_write') IS NOT NULL
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualDocViews TO kvh_write;
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualDocLikes TO kvh_write;
END
ELSE
  RAISERROR(N'Không thấy user kvh_write -> tự cấp quyền 2 bảng lượt xem / tim cho tài khoản app.', 10, 1);
GO

IF OBJECT_ID(N'dbo.WebManualDocViews', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.WebManualDocLikes', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'010_engagement.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'010_engagement.sql');
GO

-- Kiểm tra: phải thấy 2 bảng mới, quyền của kvh_write trên cả 2, 10 dòng đánh dấu (001–010)
SELECT name AS BangMoi FROM sys.tables WHERE name IN (N'WebManualDocViews', N'WebManualDocLikes');
SELECT OBJECT_NAME(major_id) AS Bang, permission_name AS Quyen FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write')
  AND major_id IN (OBJECT_ID(N'dbo.WebManualDocViews'), OBJECT_ID(N'dbo.WebManualDocLikes'));
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
