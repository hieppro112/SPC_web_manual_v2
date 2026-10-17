-- ============================================================
-- 005_import_jobs.sql — Hàng đợi "nhập bài từ PowerPoint" (chạy TAY trong SSMS)
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

IF OBJECT_ID(N'dbo.WebManualImportJobs', N'U') IS NULL
  CREATE TABLE dbo.WebManualImportJobs (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualImportJobs PRIMARY KEY,
    FileName      NVARCHAR(260) NOT NULL,
    CategoryId    INT NULL CONSTRAINT FK_WebManualImportJobs_Category REFERENCES dbo.WebManualCategories (Id) ON DELETE SET NULL,
    Language      NVARCHAR(5)   NOT NULL CONSTRAINT DF_WebManualImportJobs_Language DEFAULT N'vi',
    SlideCount    INT           NOT NULL CONSTRAINT DF_WebManualImportJobs_SlideCount DEFAULT 0,
    Payload       NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualImportJobs_Payload CHECK (ISJSON(Payload) = 1),
    Status        NVARCHAR(12)  NOT NULL CONSTRAINT DF_WebManualImportJobs_Status DEFAULT N'pending'
                                CONSTRAINT CK_WebManualImportJobs_Status
                                  CHECK (Status IN (N'pending', N'processing', N'done', N'failed', N'expired', N'cancelled')),
    RequestedById INT NULL CONSTRAINT FK_WebManualImportJobs_RequestedBy REFERENCES dbo.WebManualUsers (Id),
    DocumentId    INT NULL CONSTRAINT FK_WebManualImportJobs_Document REFERENCES dbo.WebManualDocuments (Id) ON DELETE SET NULL,
    Error         NVARCHAR(1000) NULL,
    ClaimedAt     DATETIME2(3) NULL,
    CompletedAt   DATETIME2(3) NULL,
    SeenAt        DATETIME2(3) NULL,
    CreatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualImportJobs_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualImportJobs_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualImportJobs_Status_CreatedAt' AND object_id = OBJECT_ID(N'dbo.WebManualImportJobs'))
  CREATE INDEX IX_WebManualImportJobs_Status_CreatedAt ON dbo.WebManualImportJobs (Status, CreatedAt);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualImportJobs_RequestedBy' AND object_id = OBJECT_ID(N'dbo.WebManualImportJobs'))
  CREATE INDEX IX_WebManualImportJobs_RequestedBy ON dbo.WebManualImportJobs (RequestedById, CreatedAt DESC);
GO

IF USER_ID(N'kvh_write') IS NOT NULL
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualImportJobs TO kvh_write;
ELSE
  RAISERROR(N'Không thấy user kvh_write -> tự cấp quyền bảng WebManualImportJobs cho tài khoản app.', 10, 1);
GO

IF OBJECT_ID(N'dbo.WebManualImportJobs', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'005_import_jobs.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'005_import_jobs.sql');
GO

-- Kiểm tra: phải thấy bảng WebManualImportJobs, quyền của kvh_write, 5 dòng đánh dấu (001–005)
SELECT name AS BangMoi FROM sys.tables WHERE name = N'WebManualImportJobs';
SELECT permission_name AS Quyen FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write') AND major_id = OBJECT_ID(N'dbo.WebManualImportJobs');
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
