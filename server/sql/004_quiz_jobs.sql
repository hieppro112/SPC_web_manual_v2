-- ============================================================
-- 004_quiz_jobs.sql — Hàng đợi "nhờ Claude tạo đề" (chạy TAY trong SSMS)
-- ============================================================
-- Chạy trên database KVH, bằng tài khoản CÓ QUYỀN TẠO BẢNG + CẤP QUYỀN
-- (KHÔNG dùng kvh_write). PHẢI chạy TRƯỚC khi cập nhật code mới.
-- Cần đã chạy 003_quiz.sql trước (bảng mới tham chiếu WebManualQuizzes).
--
-- Làm gì:
--   1. Tạo bảng WebManualQuizJobs (+ 2 index)
--   2. Cấp quyền đọc/ghi bảng mới cho kvh_write
--   3. Đánh dấu "004_quiz_jobs.sql" để app không chạy lại
-- Chạy lại nhiều lần cũng an toàn. Dừng hẳn nếu sai database / thiếu quyền / chưa có 003.

USE KVH;
GO

IF DB_NAME() <> N'KVH' OR OBJECT_ID(N'dbo.WebManualQuizzes', N'U') IS NULL
BEGIN
  RAISERROR(N'Không đứng ở database KVH hoặc chưa chạy 003_quiz.sql (chưa có bảng WebManualQuizzes) -> DỪNG.', 16, 1);
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

IF OBJECT_ID(N'dbo.WebManualQuizJobs', N'U') IS NULL
  CREATE TABLE dbo.WebManualQuizJobs (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualQuizJobs PRIMARY KEY,
    SourceDocs    NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualQuizJobs_SourceDocs CHECK (ISJSON(SourceDocs) = 1),
    Language      NVARCHAR(5)   NOT NULL CONSTRAINT DF_WebManualQuizJobs_Language DEFAULT N'vi',
    QuestionCount INT           NOT NULL CONSTRAINT DF_WebManualQuizJobs_QuestionCount DEFAULT 10
                                CONSTRAINT CK_WebManualQuizJobs_QuestionCount CHECK (QuestionCount BETWEEN 1 AND 20),
    Status        NVARCHAR(12)  NOT NULL CONSTRAINT DF_WebManualQuizJobs_Status DEFAULT N'pending'
                                CONSTRAINT CK_WebManualQuizJobs_Status
                                  CHECK (Status IN (N'pending', N'processing', N'done', N'failed', N'expired', N'cancelled')),
    RequestedById INT NULL CONSTRAINT FK_WebManualQuizJobs_RequestedBy REFERENCES dbo.WebManualUsers (Id),
    QuizId        INT NULL CONSTRAINT FK_WebManualQuizJobs_Quiz REFERENCES dbo.WebManualQuizzes (Id) ON DELETE SET NULL,
    Error         NVARCHAR(1000) NULL,
    ClaimedAt     DATETIME2(3) NULL,
    CompletedAt   DATETIME2(3) NULL,
    SeenAt        DATETIME2(3) NULL,
    CreatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizJobs_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizJobs_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualQuizJobs_Status_CreatedAt' AND object_id = OBJECT_ID(N'dbo.WebManualQuizJobs'))
  CREATE INDEX IX_WebManualQuizJobs_Status_CreatedAt ON dbo.WebManualQuizJobs (Status, CreatedAt);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualQuizJobs_RequestedBy' AND object_id = OBJECT_ID(N'dbo.WebManualQuizJobs'))
  CREATE INDEX IX_WebManualQuizJobs_RequestedBy ON dbo.WebManualQuizJobs (RequestedById, CreatedAt DESC);
GO

IF USER_ID(N'kvh_write') IS NOT NULL
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualQuizJobs TO kvh_write;
ELSE
  RAISERROR(N'Không thấy user kvh_write -> tự cấp quyền bảng WebManualQuizJobs cho tài khoản app.', 10, 1);
GO

IF OBJECT_ID(N'dbo.WebManualQuizJobs', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'004_quiz_jobs.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'004_quiz_jobs.sql');
GO

-- Kiểm tra: phải thấy bảng WebManualQuizJobs, quyền của kvh_write, 4 dòng đánh dấu (001–004)
SELECT name AS BangMoi FROM sys.tables WHERE name = N'WebManualQuizJobs';
SELECT permission_name AS Quyen FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write') AND major_id = OBJECT_ID(N'dbo.WebManualQuizJobs');
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
