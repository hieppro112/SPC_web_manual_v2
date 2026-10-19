-- @applied-if: OBJECT_ID(N'WebManualGuideProgress', N'U') IS NOT NULL
-- ============================================================
-- 006_guide_progress.sql — Tiến độ "nhiệm vụ thực hành" của từng người
-- ============================================================
-- Mỗi nhiệm vụ làm xong = 1 dòng (UserId, TaskKey). Danh sách nhiệm vụ nằm
-- trong code (server/src/services/guide/tasks.ts), bảng chỉ ghi "ai xong gì, lúc nào".
-- Xóa tài khoản -> dòng của người đó tự xóa theo (ON DELETE CASCADE).

CREATE TABLE WebManualGuideProgress (
  UserId      INT          NOT NULL CONSTRAINT FK_WebManualGuideProgress_User REFERENCES WebManualUsers (Id) ON DELETE CASCADE,
  TaskKey     NVARCHAR(40) NOT NULL,
  CompletedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualGuideProgress_CompletedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_WebManualGuideProgress PRIMARY KEY (UserId, TaskKey)
);
GO
