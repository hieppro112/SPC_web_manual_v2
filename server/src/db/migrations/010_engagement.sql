-- @applied-if: OBJECT_ID(N'WebManualDocViews', N'U') IS NOT NULL AND OBJECT_ID(N'WebManualDocLikes', N'U') IS NOT NULL
-- ============================================================
-- 010_engagement.sql — Lượt xem 👁 + thả tim ❤ của tài liệu
-- ============================================================
-- DocViews: mỗi người (hoặc mỗi khách) tối đa MỘT dòng / bài / ngày -> khóa chính
--   (DocumentId, ViewDate, ViewerKey) tự chặn đếm trùng khi F5.
--   ViewerKey = 'u:<id tài khoản>' hoặc 'g:<băm IP + trình duyệt>' (không lưu IP gốc).
-- DocLikes: mỗi tài khoản thả tim một bài tối đa một lần; bỏ tim = xóa dòng.
-- Sửa bài (phiên bản mới) không ảnh hưởng: gắn với bài, không gắn với phiên bản.

CREATE TABLE WebManualDocViews (
  DocumentId INT          NOT NULL CONSTRAINT FK_WebManualDocViews_Document REFERENCES WebManualDocuments (Id) ON DELETE CASCADE,
  ViewDate   DATE         NOT NULL,
  ViewerKey  NVARCHAR(64) NOT NULL,
  CreatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualDocViews_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_WebManualDocViews PRIMARY KEY (DocumentId, ViewDate, ViewerKey)
);
GO
CREATE INDEX IX_WebManualDocViews_Date ON WebManualDocViews (ViewDate, DocumentId);
GO

CREATE TABLE WebManualDocLikes (
  DocumentId INT          NOT NULL CONSTRAINT FK_WebManualDocLikes_Document REFERENCES WebManualDocuments (Id) ON DELETE CASCADE,
  UserId     INT          NOT NULL CONSTRAINT FK_WebManualDocLikes_User REFERENCES WebManualUsers (Id) ON DELETE CASCADE,
  CreatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualDocLikes_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_WebManualDocLikes PRIMARY KEY (DocumentId, UserId)
);
GO
CREATE INDEX IX_WebManualDocLikes_User ON WebManualDocLikes (UserId, CreatedAt DESC);
GO
