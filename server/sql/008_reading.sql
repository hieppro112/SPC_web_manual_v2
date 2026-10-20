-- ============================================================
-- 008_reading.sql — Thời gian đọc tối thiểu + tiến độ đọc (chạy TAY trong SSMS)
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

IF OBJECT_ID(N'dbo.WebManualReadingRules', N'U') IS NULL
  CREATE TABLE dbo.WebManualReadingRules (
    DocumentId      INT          NOT NULL CONSTRAINT PK_WebManualReadingRules PRIMARY KEY
                                 CONSTRAINT FK_WebManualReadingRules_Document REFERENCES dbo.WebManualDocuments (Id) ON DELETE CASCADE,
    RequiredSeconds INT          NOT NULL CONSTRAINT CK_WebManualReadingRules_Seconds CHECK (RequiredSeconds BETWEEN 1 AND 36000),
    UpdatedById     INT          NULL,
    UpdatedAt       DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualReadingRules_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
GO

IF OBJECT_ID(N'dbo.WebManualReadingProgress', N'U') IS NULL
  CREATE TABLE dbo.WebManualReadingProgress (
    UserId          INT          NOT NULL CONSTRAINT FK_WebManualReadingProgress_User REFERENCES dbo.WebManualUsers (Id) ON DELETE CASCADE,
    DocumentId      INT          NOT NULL CONSTRAINT FK_WebManualReadingProgress_Document REFERENCES dbo.WebManualDocuments (Id) ON DELETE CASCADE,
    Version         INT          NOT NULL,
    Seconds         INT          NOT NULL CONSTRAINT DF_WebManualReadingProgress_Seconds DEFAULT 0,
    RequiredSeconds INT          NOT NULL,
    ReachedEnd      BIT          NOT NULL CONSTRAINT DF_WebManualReadingProgress_ReachedEnd DEFAULT 0,
    CompletedAt     DATETIME2(3) NULL,
    StartedAt       DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualReadingProgress_StartedAt DEFAULT SYSUTCDATETIME(),
    LastBeatAt      DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualReadingProgress_LastBeatAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_WebManualReadingProgress PRIMARY KEY (UserId, DocumentId, Version)
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualReadingProgress_Document' AND object_id = OBJECT_ID(N'dbo.WebManualReadingProgress'))
  CREATE INDEX IX_WebManualReadingProgress_Document ON dbo.WebManualReadingProgress (DocumentId, Version);
GO

IF USER_ID(N'kvh_write') IS NOT NULL
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualReadingRules TO kvh_write;
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualReadingProgress TO kvh_write;
END
ELSE
  RAISERROR(N'Không thấy user kvh_write -> tự cấp quyền 2 bảng thời gian đọc cho tài khoản app.', 10, 1);
GO

IF OBJECT_ID(N'dbo.WebManualReadingRules', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.WebManualReadingProgress', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'008_reading.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'008_reading.sql');
GO

-- Kiểm tra: phải thấy 2 bảng mới, quyền của kvh_write trên cả 2, 8 dòng đánh dấu (001–008)
SELECT name AS BangMoi FROM sys.tables WHERE name IN (N'WebManualReadingRules', N'WebManualReadingProgress');
SELECT OBJECT_NAME(major_id) AS Bang, permission_name AS Quyen FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write')
  AND major_id IN (OBJECT_ID(N'dbo.WebManualReadingRules'), OBJECT_ID(N'dbo.WebManualReadingProgress'));
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
