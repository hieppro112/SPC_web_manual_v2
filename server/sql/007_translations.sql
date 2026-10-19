-- ============================================================
-- 007_translations.sql — Bản dịch tự động vi / en / ja (chạy TAY trong SSMS)
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

IF OBJECT_ID(N'dbo.WebManualDocTranslations', N'U') IS NULL
  CREATE TABLE dbo.WebManualDocTranslations (
    DocumentId    INT           NOT NULL CONSTRAINT FK_WebManualDocTranslations_Document REFERENCES dbo.WebManualDocuments (Id) ON DELETE CASCADE,
    Lang          NVARCHAR(5)   NOT NULL,
    SourceLang    NVARCHAR(5)   NOT NULL,
    SourceVersion INT           NOT NULL,
    Title         NVARCHAR(300) NOT NULL,
    Description   NVARCHAR(500) NOT NULL CONSTRAINT DF_WebManualDocTranslations_Description DEFAULT N'',
    Blocks        NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualDocTranslations_Blocks CHECK (ISJSON(Blocks) = 1),
    Hashes        NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualDocTranslations_Hashes CHECK (ISJSON(Hashes) = 1),
    SearchText    NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WebManualDocTranslations_SearchText DEFAULT N'',
    EditedById    INT           NULL,
    EditedAt      DATETIME2(3)  NULL,
    UpdatedAt     DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualDocTranslations_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_WebManualDocTranslations PRIMARY KEY (DocumentId, Lang)
  );
GO

IF OBJECT_ID(N'dbo.WebManualTranslationJobs', N'U') IS NULL
  CREATE TABLE dbo.WebManualTranslationJobs (
    DocumentId       INT           NOT NULL CONSTRAINT PK_WebManualTranslationJobs PRIMARY KEY
                                   CONSTRAINT FK_WebManualTranslationJobs_Document REFERENCES dbo.WebManualDocuments (Id) ON DELETE CASCADE,
    RequestedVersion INT           NOT NULL,
    Priority         TINYINT       NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Priority DEFAULT 1,
    Force            BIT           NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Force DEFAULT 0,
    Status           NVARCHAR(12)  NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Status DEFAULT N'pending'
                                   CONSTRAINT CK_WebManualTranslationJobs_Status CHECK (Status IN (N'pending', N'processing', N'failed')),
    Attempts         INT           NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Attempts DEFAULT 0,
    Error            NVARCHAR(1000) NULL,
    ClaimedAt        DATETIME2(3)  NULL,
    CreatedAt        DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualTranslationJobs_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt        DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualTranslationJobs_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualTranslationJobs_Queue' AND object_id = OBJECT_ID(N'dbo.WebManualTranslationJobs'))
  CREATE INDEX IX_WebManualTranslationJobs_Queue ON dbo.WebManualTranslationJobs (Status, Priority DESC, UpdatedAt);
GO

IF USER_ID(N'kvh_write') IS NOT NULL
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualDocTranslations TO kvh_write;
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualTranslationJobs TO kvh_write;
END
ELSE
  RAISERROR(N'Không thấy user kvh_write -> tự cấp quyền 2 bảng bản dịch cho tài khoản app.', 10, 1);
GO

IF OBJECT_ID(N'dbo.WebManualDocTranslations', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.WebManualTranslationJobs', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'007_translations.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'007_translations.sql');
GO

-- Kiểm tra: phải thấy 2 bảng mới, quyền của kvh_write trên cả 2, 7 dòng đánh dấu (001–007)
SELECT name AS BangMoi FROM sys.tables WHERE name IN (N'WebManualDocTranslations', N'WebManualTranslationJobs');
SELECT OBJECT_NAME(major_id) AS Bang, permission_name AS Quyen FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write')
  AND major_id IN (OBJECT_ID(N'dbo.WebManualDocTranslations'), OBJECT_ID(N'dbo.WebManualTranslationJobs'));
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
