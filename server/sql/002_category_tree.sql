-- ============================================================
-- 002_category_tree.sql — Thêm thể loại dạng cây (chạy TAY trong SSMS)
-- ============================================================
-- Chạy MỘT lần trên database KVH (đã có các bảng WebManual...), bằng tài
-- khoản có quyền sửa cấu trúc bảng (tài khoản bạn dùng để tạo bảng).
-- PHẢI chạy TRƯỚC khi cập nhật code mới lên máy chủ.
--
-- Chỉ THÊM một cột ParentId (NULL = cấp cao nhất) — dữ liệu hiện có giữ
-- nguyên, mọi thể loại cũ trở thành thể loại cấp cao nhất.
-- An toàn: dừng hẳn nếu sai database hoặc đã chạy rồi.

USE KVH;
GO

IF DB_NAME() <> N'KVH' OR OBJECT_ID(N'WebManualCategories', N'U') IS NULL
BEGIN
  RAISERROR(N'Không đứng ở database KVH hoặc chưa có bảng WebManualCategories -> DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

IF COL_LENGTH(N'WebManualCategories', N'ParentId') IS NOT NULL
BEGIN
  RAISERROR(N'Cột ParentId đã có (script đã chạy rồi) -> DỪNG, không làm gì.', 16, 1);
  SET NOEXEC ON;
END
GO

ALTER TABLE WebManualCategories
  ADD ParentId INT NULL
      CONSTRAINT FK_WebManualCategories_Parent REFERENCES WebManualCategories (Id);
GO

CREATE INDEX IX_WebManualCategories_ParentId ON WebManualCategories (ParentId);
GO

-- Đánh dấu cho app: bản cập nhật 002 đã áp dụng, không tự chạy lại.
INSERT INTO WebManualSchemaMigrations (Name) VALUES (N'002_category_tree.sql');
GO

-- Kiểm tra: phải thấy cột ParentId và 2 dòng đánh dấu (001, 002)
SELECT name AS ColumnName, TYPE_NAME(user_type_id) AS DataType, is_nullable AS AllowNull
FROM sys.columns WHERE object_id = OBJECT_ID(N'WebManualCategories') ORDER BY column_id;
SELECT Name, AppliedAt FROM WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
