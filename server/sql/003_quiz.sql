-- ============================================================
-- 003_quiz.sql — Role "user" + bài kiểm tra trắc nghiệm (chạy TAY trong SSMS)
-- ============================================================
-- Chạy trên database KVH, bằng tài khoản CÓ QUYỀN SỬA CẤU TRÚC (tạo bảng,
-- sửa bảng WebManualUsers, cấp quyền) — KHÔNG dùng kvh_write.
-- PHẢI chạy TRƯỚC khi cập nhật code mới (app kiểm tra lúc khởi động).
--
-- Làm gì:
--   1. Cho phép role mới "user" trong WebManualUsers (dữ liệu cũ giữ nguyên:
--      admin vẫn là admin, editor vẫn là editor).
--   2. Tạo 3 bảng mới: WebManualQuizzes, WebManualQuizAssignees, WebManualQuizAttempts.
--   3. Cấp quyền đọc/ghi 3 bảng mới cho kvh_write.
--   4. Đánh dấu "003_quiz.sql" để app không chạy lại.
--
-- Chạy lại nhiều lần cũng an toàn: bước nào đã xong thì bỏ qua.
-- Dừng hẳn, không làm gì, nếu sai database hoặc thiếu quyền.

USE KVH;
GO

IF DB_NAME() <> N'KVH' OR OBJECT_ID(N'dbo.WebManualUsers', N'U') IS NULL
BEGIN
  RAISERROR(N'Không đứng ở database KVH hoặc chưa có bảng WebManualUsers -> DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

-- Kiểm tra quyền TRƯỚC khi làm gì: thiếu quyền thì dừng, không ghi gì cả.
IF HAS_PERMS_BY_NAME(N'dbo.WebManualUsers', N'OBJECT', N'ALTER') = 0
   OR HAS_PERMS_BY_NAME(NULL, N'DATABASE', N'CREATE TABLE') = 0
   OR HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'ALTER') = 0
BEGIN
  DECLARE @who NVARCHAR(200) = SUSER_SNAME();
  RAISERROR(N'Tài khoản "%s" không đủ quyền (cần: sửa bảng WebManualUsers, tạo bảng) -> DỪNG. Đăng nhập SSMS bằng tài khoản quản trị hoặc nhờ IT.', 16, 1, @who);
  SET NOEXEC ON;
END
GO

SET XACT_ABORT ON;  -- lỗi giữa chừng trong một bước -> hoàn tác cả bước đó
GO

-- ---------- 1. Role "user" ----------
-- Đổi ràng buộc trong MỘT transaction: không bao giờ có lúc bảng thiếu ràng buộc.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_WebManualUsers_Role' AND parent_object_id = OBJECT_ID(N'dbo.WebManualUsers')
                 AND definition LIKE N'%user%')
BEGIN
  BEGIN TRAN;
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_WebManualUsers_Role' AND parent_object_id = OBJECT_ID(N'dbo.WebManualUsers'))
    ALTER TABLE dbo.WebManualUsers DROP CONSTRAINT CK_WebManualUsers_Role;
  ALTER TABLE dbo.WebManualUsers ADD CONSTRAINT CK_WebManualUsers_Role CHECK (Role IN (N'admin', N'editor', N'user'));
  COMMIT;
END
GO

-- Giá trị mặc định của cột Role: 'editor' -> 'user' (app luôn ghi rõ role, đây chỉ là dự phòng).
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints
               WHERE name = N'DF_WebManualUsers_Role' AND parent_object_id = OBJECT_ID(N'dbo.WebManualUsers')
                 AND definition LIKE N'%user%')
BEGIN
  BEGIN TRAN;
  IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_WebManualUsers_Role' AND parent_object_id = OBJECT_ID(N'dbo.WebManualUsers'))
    ALTER TABLE dbo.WebManualUsers DROP CONSTRAINT DF_WebManualUsers_Role;
  ALTER TABLE dbo.WebManualUsers ADD CONSTRAINT DF_WebManualUsers_Role DEFAULT N'user' FOR Role;
  COMMIT;
END
GO

-- ---------- 2. Bảng mới ----------
IF OBJECT_ID(N'dbo.WebManualQuizzes', N'U') IS NULL
  CREATE TABLE dbo.WebManualQuizzes (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualQuizzes PRIMARY KEY,
    Title       NVARCHAR(300) NOT NULL,
    Kind        NVARCHAR(10)  NOT NULL CONSTRAINT CK_WebManualQuizzes_Kind CHECK (Kind IN (N'practice', N'exam')),
    Status      NVARCHAR(10)  NOT NULL CONSTRAINT DF_WebManualQuizzes_Status DEFAULT N'draft'
                              CONSTRAINT CK_WebManualQuizzes_Status CHECK (Status IN (N'draft', N'published')),
    Language    NVARCHAR(5)   NOT NULL CONSTRAINT DF_WebManualQuizzes_Language DEFAULT N'vi',
    Questions   NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualQuizzes_Questions CHECK (ISJSON(Questions) = 1),
    SourceDocs  NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WebManualQuizzes_SourceDocs DEFAULT N'[]'
                              CONSTRAINT CK_WebManualQuizzes_SourceDocs CHECK (ISJSON(SourceDocs) = 1),
    PassPercent INT NOT NULL CONSTRAINT DF_WebManualQuizzes_PassPercent DEFAULT 85
                             CONSTRAINT CK_WebManualQuizzes_PassPercent CHECK (PassPercent BETWEEN 1 AND 100),
    MaxAttempts INT NOT NULL CONSTRAINT DF_WebManualQuizzes_MaxAttempts DEFAULT 3
                             CONSTRAINT CK_WebManualQuizzes_MaxAttempts CHECK (MaxAttempts BETWEEN 1 AND 100),
    DueAt       DATETIME2(3) NULL,
    CreatedById INT NULL CONSTRAINT FK_WebManualQuizzes_CreatedBy REFERENCES dbo.WebManualUsers (Id),
    UpdatedById INT NULL CONSTRAINT FK_WebManualQuizzes_UpdatedBy REFERENCES dbo.WebManualUsers (Id),
    CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizzes_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizzes_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
GO

IF OBJECT_ID(N'dbo.WebManualQuizAssignees', N'U') IS NULL
  CREATE TABLE dbo.WebManualQuizAssignees (
    QuizId INT NOT NULL CONSTRAINT FK_WebManualQuizAssignees_Quiz REFERENCES dbo.WebManualQuizzes (Id) ON DELETE CASCADE,
    UserId INT NOT NULL CONSTRAINT FK_WebManualQuizAssignees_User REFERENCES dbo.WebManualUsers (Id),
    CONSTRAINT PK_WebManualQuizAssignees PRIMARY KEY (QuizId, UserId)
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualQuizAssignees_UserId' AND object_id = OBJECT_ID(N'dbo.WebManualQuizAssignees'))
  CREATE INDEX IX_WebManualQuizAssignees_UserId ON dbo.WebManualQuizAssignees (UserId);
GO

IF OBJECT_ID(N'dbo.WebManualQuizAttempts', N'U') IS NULL
  CREATE TABLE dbo.WebManualQuizAttempts (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualQuizAttempts PRIMARY KEY,
    QuizId      INT NOT NULL CONSTRAINT FK_WebManualQuizAttempts_Quiz REFERENCES dbo.WebManualQuizzes (Id) ON DELETE CASCADE,
    UserId      INT NOT NULL CONSTRAINT FK_WebManualQuizAttempts_User REFERENCES dbo.WebManualUsers (Id),
    Score       INT NOT NULL,
    Total       INT NOT NULL,
    Percentage  INT NOT NULL,
    Passed      BIT NOT NULL,
    Answers     NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualQuizAttempts_Answers CHECK (ISJSON(Answers) = 1),
    SubmittedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizAttempts_SubmittedAt DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualQuizAttempts_Quiz_User' AND object_id = OBJECT_ID(N'dbo.WebManualQuizAttempts'))
  CREATE INDEX IX_WebManualQuizAttempts_Quiz_User ON dbo.WebManualQuizAttempts (QuizId, UserId, SubmittedAt DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualQuizAttempts_SubmittedAt' AND object_id = OBJECT_ID(N'dbo.WebManualQuizAttempts'))
  CREATE INDEX IX_WebManualQuizAttempts_SubmittedAt ON dbo.WebManualQuizAttempts (SubmittedAt);
GO

-- ---------- 3. Quyền cho tài khoản app ----------
-- Chỉ đọc/ghi DỮ LIỆU 3 bảng mới (không có quyền sửa cấu trúc), giống các bảng cũ.
IF USER_ID(N'kvh_write') IS NOT NULL
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualQuizzes       TO kvh_write;
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualQuizAssignees TO kvh_write;
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualQuizAttempts  TO kvh_write;
END
ELSE
  RAISERROR(N'Không thấy user kvh_write trong KVH -> tự cấp quyền 3 bảng mới cho tài khoản app.', 10, 1);
GO

-- ---------- 4. Đánh dấu cho app: CHỈ ghi khi mọi thứ đã có ----------
IF OBJECT_ID(N'dbo.WebManualQuizzes', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.WebManualQuizAssignees', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.WebManualQuizAttempts', N'U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_WebManualUsers_Role' AND definition LIKE N'%user%')
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'003_quiz.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'003_quiz.sql');
GO

-- ---------- Kiểm tra ----------
-- Phải thấy: ràng buộc Role có 'user'; 3 bảng Quiz; quyền của kvh_write; 3 dòng đánh dấu (001, 002, 003)
SELECT name AS RangBuoc, definition AS DieuKien FROM sys.check_constraints WHERE name = N'CK_WebManualUsers_Role';
SELECT name AS BangMoi FROM sys.tables WHERE name LIKE N'WebManualQuiz%' ORDER BY name;
SELECT OBJECT_NAME(major_id) AS Bang, permission_name AS Quyen
FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write') AND OBJECT_NAME(major_id) LIKE N'WebManualQuiz%'
ORDER BY Bang, Quyen;
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
