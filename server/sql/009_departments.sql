-- ============================================================
-- 009_departments.sql — Phân quyền xem theo bộ phận (chạy TAY trong SSMS)
-- ============================================================
-- Chạy trên database KVH, bằng tài khoản CÓ QUYỀN SỬA BẢNG (KHÔNG dùng kvh_write).
-- Chạy lại nhiều lần cũng an toàn: cột nào có rồi thì bỏ qua.
-- Không cần cấp quyền mới: chỉ thêm cột vào 2 bảng kvh_write đã dùng.

USE KVH;
GO

IF DB_NAME() <> N'KVH' OR OBJECT_ID(N'dbo.WebManualDocuments', N'U') IS NULL
BEGIN
  RAISERROR(N'Không đứng ở database KVH -> DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

IF HAS_PERMS_BY_NAME(N'dbo.WebManualUsers', N'OBJECT', N'ALTER') = 0
BEGIN
  DECLARE @who NVARCHAR(200) = SUSER_SNAME();
  RAISERROR(N'Tài khoản "%s" không có quyền sửa bảng -> DỪNG. Đăng nhập SSMS bằng tài khoản quản trị.', 16, 1, @who);
  SET NOEXEC ON;
END
GO

-- Mã nhân viên (nếu bạn đã tự thêm trước đó thì bỏ qua)
IF COL_LENGTH(N'dbo.WebManualUsers', N'EmployeeCode') IS NULL
  ALTER TABLE dbo.WebManualUsers ADD EmployeeCode NVARCHAR(20) NULL;
GO
-- Bộ phận của tài khoản (web tự điền từ view nhân viên mỗi lần đăng nhập)
IF COL_LENGTH(N'dbo.WebManualUsers', N'Department') IS NULL
  ALTER TABLE dbo.WebManualUsers ADD Department NVARCHAR(100) NULL;
GO
-- Thể loại dùng chung cho mọi bộ phận (admin tick trong Quản lý thể loại)
IF COL_LENGTH(N'dbo.WebManualCategories', N'IsShared') IS NULL
  ALTER TABLE dbo.WebManualCategories ADD IsShared BIT NOT NULL CONSTRAINT DF_WebManualCategories_IsShared DEFAULT 0;
GO

IF COL_LENGTH(N'dbo.WebManualUsers', N'EmployeeCode') IS NOT NULL
   AND COL_LENGTH(N'dbo.WebManualUsers', N'Department') IS NOT NULL
   AND COL_LENGTH(N'dbo.WebManualCategories', N'IsShared') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'009_departments.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'009_departments.sql');
GO

-- Kiểm tra: phải thấy 3 cột, và 9 dòng đánh dấu (001–009)
SELECT OBJECT_NAME(object_id) AS Bang, name AS Cot FROM sys.columns
WHERE (object_id = OBJECT_ID(N'dbo.WebManualUsers') AND name IN (N'EmployeeCode', N'Department'))
   OR (object_id = OBJECT_ID(N'dbo.WebManualCategories') AND name = N'IsShared');
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
