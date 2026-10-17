-- ============================================================
-- 004_quiz_jobs.sql — Hàng đợi "nhờ Claude tạo đề"
-- ============================================================
-- Editor bấm "Gửi cho Claude" -> thêm 1 dòng trạng thái 'pending'.
-- Script quiz-worker (chạy trên máy có Claude) định kỳ "nhận việc"
-- ('processing'), gửi kết quả -> server lưu thành đề NHÁP ('done').
--
--   pending -> processing -> done
--                         -> failed     (Claude lỗi / đề không hợp lệ)
--   pending/processing    -> expired    (quá QUIZ_JOB_TIMEOUT_HOURS giờ)
--   pending/processing    -> cancelled  (editor hủy)

CREATE TABLE WebManualQuizJobs (
  Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualQuizJobs PRIMARY KEY,
  -- Tài liệu nguồn [{id, title, slug}] (bản chụp lúc gửi yêu cầu)
  SourceDocs    NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualQuizJobs_SourceDocs CHECK (ISJSON(SourceDocs) = 1),
  Language      NVARCHAR(5)   NOT NULL CONSTRAINT DF_WebManualQuizJobs_Language DEFAULT N'vi',
  QuestionCount INT           NOT NULL CONSTRAINT DF_WebManualQuizJobs_QuestionCount DEFAULT 10
                              CONSTRAINT CK_WebManualQuizJobs_QuestionCount CHECK (QuestionCount BETWEEN 1 AND 20),
  Status        NVARCHAR(12)  NOT NULL CONSTRAINT DF_WebManualQuizJobs_Status DEFAULT N'pending'
                              CONSTRAINT CK_WebManualQuizJobs_Status
                                CHECK (Status IN (N'pending', N'processing', N'done', N'failed', N'expired', N'cancelled')),
  RequestedById INT NULL CONSTRAINT FK_WebManualQuizJobs_RequestedBy REFERENCES WebManualUsers (Id),
  -- Đề Claude tạo ra; xóa đề thì cột này về NULL, yêu cầu vẫn còn trong lịch sử.
  QuizId        INT NULL CONSTRAINT FK_WebManualQuizJobs_Quiz REFERENCES WebManualQuizzes (Id) ON DELETE SET NULL,
  Error         NVARCHAR(1000) NULL,
  ClaimedAt     DATETIME2(3) NULL,   -- lúc worker nhận việc (nhận quá lâu không xong -> cho nhận lại)
  CompletedAt   DATETIME2(3) NULL,
  SeenAt        DATETIME2(3) NULL,   -- người yêu cầu đã mở đề chưa (chấm đỏ trên thanh trên cùng)
  CreatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizJobs_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualQuizJobs_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX IX_WebManualQuizJobs_Status_CreatedAt ON WebManualQuizJobs (Status, CreatedAt);
GO
CREATE INDEX IX_WebManualQuizJobs_RequestedBy ON WebManualQuizJobs (RequestedById, CreatedAt DESC);
GO
