-- @applied-if: OBJECT_ID(N'WebManualReadingRules', N'U') IS NOT NULL AND OBJECT_ID(N'WebManualReadingProgress', N'U') IS NOT NULL
-- ============================================================
-- 008_reading.sql — Thời gian đọc tối thiểu + tiến độ đọc của từng người
-- ============================================================
-- Editor đặt thời gian đọc cho bài (không đặt = không bắt buộc). Người dùng
-- (role "user") phải đọc đủ thời gian + cuộn tới cuối bài mới được làm bài
-- kiểm tra / ôn tập tạo từ bài đó.
--
-- Tiến độ lưu theo PHIÊN BẢN bài: bài được sửa (phiên bản mới) -> đọc lại từ đầu,
-- dòng của phiên bản cũ vẫn giữ để admin xem lịch sử.

CREATE TABLE WebManualReadingRules (
  DocumentId      INT          NOT NULL CONSTRAINT PK_WebManualReadingRules PRIMARY KEY
                               CONSTRAINT FK_WebManualReadingRules_Document REFERENCES WebManualDocuments (Id) ON DELETE CASCADE,
  RequiredSeconds INT          NOT NULL CONSTRAINT CK_WebManualReadingRules_Seconds CHECK (RequiredSeconds BETWEEN 1 AND 36000),
  UpdatedById     INT          NULL,
  UpdatedAt       DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualReadingRules_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE WebManualReadingProgress (
  UserId          INT          NOT NULL CONSTRAINT FK_WebManualReadingProgress_User REFERENCES WebManualUsers (Id) ON DELETE CASCADE,
  DocumentId      INT          NOT NULL CONSTRAINT FK_WebManualReadingProgress_Document REFERENCES WebManualDocuments (Id) ON DELETE CASCADE,
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
CREATE INDEX IX_WebManualReadingProgress_Document ON WebManualReadingProgress (DocumentId, Version);
GO
