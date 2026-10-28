-- ============================================================
-- 011_category_defaults.sql — Mục mặc định + đề xuất thể loại (chạy TAY trong SSMS)
-- ============================================================
-- Chạy trên database KVH, bằng tài khoản CÓ QUYỀN TẠO BẢNG + SỬA BẢNG + CẤP QUYỀN
-- (KHÔNG dùng kvh_write). Chạy lại nhiều lần cũng an toàn: cái gì có rồi thì bỏ qua.
--
-- Làm 3 việc:
--   1. Tên thể loại: bỏ "không trùng trên toàn hệ thống", thay bằng "không trùng
--      trong cùng thể loại cha" -> mọi bộ phận đều có được "Biểu mẫu", "Quy trình"...
--   2. Bảng WebManualCategoryTemplates (mục mặc định) + 5 mục ban đầu.
--   3. Bảng WebManualCategoryRequests (biên tập đề xuất thể loại, admin duyệt).

USE KVH;
GO

IF DB_NAME() <> N'KVH' OR OBJECT_ID(N'dbo.WebManualCategories', N'U') IS NULL
BEGIN
  RAISERROR(N'Không đứng ở database KVH -> DỪNG.', 16, 1);
  SET NOEXEC ON;
END
GO

IF HAS_PERMS_BY_NAME(NULL, N'DATABASE', N'CREATE TABLE') = 0
   OR HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'ALTER') = 0
   OR HAS_PERMS_BY_NAME(N'dbo.WebManualCategories', N'OBJECT', N'ALTER') = 0
BEGIN
  DECLARE @who NVARCHAR(200) = SUSER_SNAME();
  RAISERROR(N'Tài khoản "%s" không có quyền tạo / sửa bảng -> DỪNG. Đăng nhập SSMS bằng tài khoản quản trị.', 16, 1, @who);
  SET NOEXEC ON;
END
GO

-- ---------- 1. Tên thể loại: không trùng trong cùng thể loại cha ----------
IF OBJECT_ID(N'dbo.UQ_WebManualCategories_Name') IS NOT NULL
  ALTER TABLE dbo.WebManualCategories DROP CONSTRAINT UQ_WebManualCategories_Name;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_WebManualCategories_Parent_Name' AND object_id = OBJECT_ID(N'dbo.WebManualCategories'))
  CREATE UNIQUE INDEX UX_WebManualCategories_Parent_Name ON dbo.WebManualCategories (ParentId, Name);
GO

-- ---------- 2. Mục mặc định ----------
IF OBJECT_ID(N'dbo.WebManualCategoryTemplates', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.WebManualCategoryTemplates (
    Id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualCategoryTemplates PRIMARY KEY,
    Name      NVARCHAR(100) NOT NULL,
    IconName  NVARCHAR(50)  NOT NULL CONSTRAINT DF_WebManualCategoryTemplates_IconName DEFAULT N'Folder',
    ParentId  INT NULL CONSTRAINT FK_WebManualCategoryTemplates_Parent REFERENCES dbo.WebManualCategoryTemplates (Id),
    CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualCategoryTemplates_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualCategoryTemplates_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX UX_WebManualCategoryTemplates_Parent_Name ON dbo.WebManualCategoryTemplates (ParentId, Name);
  -- 5 mục ban đầu (admin sửa được trên web: Quản lý thể loại -> tab "Mục mặc định")
  INSERT INTO dbo.WebManualCategoryTemplates (Name, IconName) VALUES
    (N'Quy trình', N'ClipboardList'),
    (N'Hướng dẫn', N'BookOpen'),
    (N'Biểu mẫu', N'FileText'),
    (N'Đào tạo', N'GraduationCap'),
    (N'Thông báo', N'Megaphone');
END
GO

-- ---------- 3. Đề xuất thể loại ----------
IF OBJECT_ID(N'dbo.WebManualCategoryRequests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.WebManualCategoryRequests (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualCategoryRequests PRIMARY KEY,
    ParentId      INT NOT NULL CONSTRAINT FK_WebManualCategoryRequests_Parent REFERENCES dbo.WebManualCategories (Id) ON DELETE CASCADE,
    Name          NVARCHAR(100) NOT NULL,
    IconName      NVARCHAR(50)  NOT NULL CONSTRAINT DF_WebManualCategoryRequests_IconName DEFAULT N'Folder',
    Note          NVARCHAR(500) NOT NULL CONSTRAINT DF_WebManualCategoryRequests_Note DEFAULT N'',
    Status        NVARCHAR(10)  NOT NULL CONSTRAINT DF_WebManualCategoryRequests_Status DEFAULT N'pending'
                  CONSTRAINT CK_WebManualCategoryRequests_Status CHECK (Status IN (N'pending', N'approved', N'rejected')),
    RejectReason  NVARCHAR(500) NULL,
    CategoryId    INT NULL,
    RequestedById INT NOT NULL CONSTRAINT FK_WebManualCategoryRequests_User REFERENCES dbo.WebManualUsers (Id) ON DELETE CASCADE,
    ReviewedById  INT NULL,
    ReviewedAt    DATETIME2(3) NULL,
    CreatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualCategoryRequests_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_WebManualCategoryRequests_Status ON dbo.WebManualCategoryRequests (Status, CreatedAt);
  CREATE INDEX IX_WebManualCategoryRequests_User ON dbo.WebManualCategoryRequests (RequestedById, CreatedAt DESC);
END
GO

IF USER_ID(N'kvh_write') IS NOT NULL
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualCategoryTemplates TO kvh_write;
  GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.WebManualCategoryRequests TO kvh_write;
END
ELSE
  RAISERROR(N'Không thấy user kvh_write -> tự cấp quyền 2 bảng mới cho tài khoản app.', 10, 1);
GO

IF OBJECT_ID(N'dbo.WebManualCategoryTemplates', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.WebManualCategoryRequests', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.UQ_WebManualCategories_Name') IS NULL
   AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_WebManualCategories_Parent_Name')
   AND NOT EXISTS (SELECT 1 FROM dbo.WebManualSchemaMigrations WHERE Name = N'011_category_defaults.sql')
  INSERT INTO dbo.WebManualSchemaMigrations (Name) VALUES (N'011_category_defaults.sql');
GO

-- Kiểm tra: phải thấy
--   * index UX_WebManualCategories_Parent_Name, KHÔNG còn UQ_WebManualCategories_Name
--   * 2 bảng mới + 5 mục mặc định, quyền của kvh_write trên 2 bảng
--   * 11 dòng đánh dấu (001–011)
SELECT name AS RangBuocTen FROM sys.objects WHERE name = N'UQ_WebManualCategories_Name'
UNION ALL SELECT name FROM sys.indexes WHERE name = N'UX_WebManualCategories_Parent_Name';
SELECT Id, Name, IconName, ParentId FROM dbo.WebManualCategoryTemplates ORDER BY Id;
SELECT OBJECT_NAME(major_id) AS Bang, permission_name AS Quyen FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'kvh_write')
  AND major_id IN (OBJECT_ID(N'dbo.WebManualCategoryTemplates'), OBJECT_ID(N'dbo.WebManualCategoryRequests'));
SELECT Name, AppliedAt FROM dbo.WebManualSchemaMigrations ORDER BY Name;
GO

SET NOEXEC OFF;
GO
