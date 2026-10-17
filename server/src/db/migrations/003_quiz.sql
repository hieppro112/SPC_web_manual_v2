-- @applied-if: OBJECT_ID(N'WebManualQuizAttempts', N'U') IS NOT NULL AND OBJECT_ID(N'WebManualQuizAssignees', N'U') IS NOT NULL
-- ============================================================
-- 003_quiz.sql — Role "user" + bài kiểm tra trắc nghiệm
-- ============================================================
-- 1. Role mới "user": chỉ đọc tài liệu đã xuất bản + làm bài kiểm tra.
--    Người tự đăng ký từ nay mặc định là "user".
-- 2. WebManualQuizzes        bộ đề (câu hỏi lưu dạng JSON, giống Blocks của tài liệu)
--    WebManualQuizAssignees  giao bài "Kiểm tra" cho người cụ thể
--    WebManualQuizAttempts   mỗi lần nộp bài "Kiểm tra" (bài "Ôn tập" không lưu)
--
-- Khóa ngoại tới Users KHÔNG tự xóa dây chuyền (giống các bảng khác): xóa
-- tài khoản thì app tự dọn trong repositories/users.ts -> deleteUser().

ALTER TABLE WebManualUsers DROP CONSTRAINT CK_WebManualUsers_Role;
GO
ALTER TABLE WebManualUsers ADD CONSTRAINT CK_WebManualUsers_Role CHECK (Role IN (N'admin', N'editor', N'user'));
GO
ALTER TABLE WebManualUsers DROP CONSTRAINT DF_WebManualUsers_Role;
GO
ALTER TABLE WebManualUsers ADD CONSTRAINT DF_WebManualUsers_Role DEFAULT N'user' FOR Role;
GO

CREATE TABLE WebManualQuizzes (
  Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualQuizzes PRIMARY KEY,
  Title       NVARCHAR(300) NOT NULL,
  -- practice = Ôn tập (không lưu điểm), exam = Kiểm tra (lưu điểm)
  Kind        NVARCHAR(10)  NOT NULL CONSTRAINT CK_WebManualQuizzes_Kind CHECK (Kind IN (N'practice', N'exam')),
  Status      NVARCHAR(10)  NOT NULL CONSTRAINT DF_WebManualQuizzes_Status DEFAULT N'draft'
                            CONSTRAINT CK_WebManualQuizzes_Status CHECK (Status IN (N'draft', N'published')),
  Language    NVARCHAR(5)   NOT NULL CONSTRAINT DF_WebManualQuizzes_Language DEFAULT N'vi',
  Questions   NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualQuizzes_Questions CHECK (ISJSON(Questions) = 1),
  -- Tài liệu nguồn [{id, title, slug}] — bản chụp, tài liệu bị xóa sau này vẫn còn tên
  SourceDocs  NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WebManualQuizzes_SourceDocs DEFAULT N'[]'
                            CONSTRAINT CK_WebManualQuizzes_SourceDocs CHECK (ISJSON(SourceDocs) = 1),
  PassPercent INT NOT NULL CONSTRAINT DF_WebManualQuizzes_PassPercent DEFAULT 85
                           CONSTRAINT CK_WebManualQuizzes_PassPercent CHECK (PassPercent BETWEEN 1 AND 100),
  MaxAttempts INT NOT NULL CONSTRAINT DF_WebManualQuizzes_MaxAttempts DEFAULT 3
                           CONSTRAINT CK_WebManualQuizzes_MaxAttempts CHECK (MaxAttempts BETWEEN 1 AND 100),
  DueAt       DATETIME2(3) NULL,
  CreatedById INT NULL CONSTRAINT FK_WebManualQuizzes_CreatedBy REFERENCES WebManualUsers (Id),
  UpdatedById INT NULL CONSTRAINT FK_WebManualQuizzes_UpdatedBy REFERENCES WebManualUsers (Id),
  CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizzes_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizzes_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE WebManualQuizAssignees (
  QuizId INT NOT NULL CONSTRAINT FK_WebManualQuizAssignees_Quiz REFERENCES WebManualQuizzes (Id) ON DELETE CASCADE,
  UserId INT NOT NULL CONSTRAINT FK_WebManualQuizAssignees_User REFERENCES WebManualUsers (Id),
  CONSTRAINT PK_WebManualQuizAssignees PRIMARY KEY (QuizId, UserId)
);
GO
CREATE INDEX IX_WebManualQuizAssignees_UserId ON WebManualQuizAssignees (UserId);
GO

CREATE TABLE WebManualQuizAttempts (
  Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualQuizAttempts PRIMARY KEY,
  QuizId      INT NOT NULL CONSTRAINT FK_WebManualQuizAttempts_Quiz REFERENCES WebManualQuizzes (Id) ON DELETE CASCADE,
  UserId      INT NOT NULL CONSTRAINT FK_WebManualQuizAttempts_User REFERENCES WebManualUsers (Id),
  Score       INT NOT NULL,           -- số câu đúng
  Total       INT NOT NULL,           -- tổng số câu
  Percentage  INT NOT NULL,           -- 0..100
  Passed      BIT NOT NULL,
  Answers     NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualQuizAttempts_Answers CHECK (ISJSON(Answers) = 1),
  SubmittedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizAttempts_SubmittedAt DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX IX_WebManualQuizAttempts_Quiz_User ON WebManualQuizAttempts (QuizId, UserId, SubmittedAt DESC);
GO
CREATE INDEX IX_WebManualQuizAttempts_SubmittedAt ON WebManualQuizAttempts (SubmittedAt);
GO
