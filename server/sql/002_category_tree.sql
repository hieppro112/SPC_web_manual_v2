-- ============================================================
-- 002_category_tree.sql — Thêm thể loại dạng cây (chạy TAY trong SSMS)
-- ============================================================
-- Chạy trên database KVH, bằng tài khoản CÓ QUYỀN SỬA CẤU TRÚC BẢNG
-- (tài khoản đã dùng để tạo bảng, hoặc nhờ IT) — KHÔNG dùng kvh_write,
-- tài khoản đó chỉ được đọc/ghi dữ liệu.
-- PHẢI chạy TRƯỚC khi cập nhật code mới.
--
-- Chỉ THÊM một cột ParentId (NULL = cấp cao nhất) — dữ liệu hiện có giữ
-- nguyên, mọi thể loại cũ trở thành thể loại cấp cao nhất.
--
-- Chạy lại nhiều lần cũng an toàn: bước nào đã xong thì bỏ qua.
-- Dừng hẳn, không làm gì, nếu sai database hoặc thiếu quyền.

USE KVH;
GO

IF DB_NAME() <> N'KVH' OR OBJECT_ID(N'dbo.WebManualCategories', N'U') IS NULL
BEGIN
  RAISERROR(N'Không đứng ở database KVH hoặc chưa có bảng WebManualCategories -> DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

-- Kiểm tra quyền TRƯỚC khi làm gì: thiếu quyền thì dừng, không ghi gì cả.
IF HAS_PERMS_BY_NAME(N'dbo.WebManualCategories', N'OBJECT', N'ALTER') = 0
BEGIN
  DECLARE @who NVARCHAR(200) = SUSER_SNAME();
  RAISERROR(N'Tài khoản "%s" không có quyền sửa cấu trúc bảng -> DỪNG. Đăng nhập SSMS bằng tài khoản đã tạo bảng hoặc nhờ IT.', 16, 1, @who);
  SET NOEXEC ON;
END
GO

IF COL_LENGTH(N'dbo.WebManualCategories', N'ParentId') IS NULL
  ALTER TABLE dbo.WebManualCategories
    ADD ParentId INT NULL
        CONSTRAINT FK_WebManualCategories_Parent REFERENCES dbo.WebManualCategories (Id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WebManualCategories_ParentId'
                 AND object_id = OBJECT_ID(N'dbo.WebManualCategories'))
  CREATE INDEX IX_WebManualCategories_ParentId ON dbo.WebManualCategories (ParentId);
GO

-- Đánh dấu cho app: CHỈ ghi khi cột đã thật sự có.
IF COL_LENGTH(N'dbo.WebManualCategories', N'ParentId') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'002_category_tree.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'002_category_tree.sql');
GO

-- Kiểm tra: phải thấy cột ParentId, và 2 dòng đánh dấu (001, 002)
SELECT name AS ColumnName, TYPE_NAME(user_type_id) AS DataType, is_nullable AS AllowNull
FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.WebManualCategories') ORDER BY column_id;
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
