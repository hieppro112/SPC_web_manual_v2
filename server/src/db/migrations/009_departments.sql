-- @applied-if: COL_LENGTH(N'WebManualUsers', N'EmployeeCode') IS NOT NULL AND COL_LENGTH(N'WebManualUsers', N'Department') IS NOT NULL AND COL_LENGTH(N'WebManualCategories', N'IsShared') IS NOT NULL
-- ============================================================
-- 009_departments.sql — Mã nhân viên, bộ phận, thể loại dùng chung
-- ============================================================
-- Users.EmployeeCode: mã nhân viên nhập lúc đăng ký (có thể đã được tạo tay trước đó)
-- Users.Department:   bộ phận tra từ view nhân viên của công ty, cập nhật MỖI LẦN đăng nhập
-- Categories.IsShared: thể loại dùng chung cho mọi bộ phận (+ khách); thể loại tên
--                      "Community" cũng được coi là dùng chung.
-- Tài khoản xem được: thể loại gốc trùng tên bộ phận + con cháu, và các thể loại
-- dùng chung + con cháu (xem server/src/services/access.ts).

IF COL_LENGTH(N'WebManualUsers', N'EmployeeCode') IS NULL
  ALTER TABLE WebManualUsers ADD EmployeeCode NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'WebManualUsers', N'Department') IS NULL
  ALTER TABLE WebManualUsers ADD Department NVARCHAR(100) NULL;
GO
IF COL_LENGTH(N'WebManualCategories', N'IsShared') IS NULL
  ALTER TABLE WebManualCategories ADD IsShared BIT NOT NULL CONSTRAINT DF_WebManualCategories_IsShared DEFAULT 0;
GO
