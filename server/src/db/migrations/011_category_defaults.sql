-- @applied-if: OBJECT_ID(N'WebManualCategoryTemplates', N'U') IS NOT NULL AND OBJECT_ID(N'WebManualCategoryRequests', N'U') IS NOT NULL AND OBJECT_ID(N'UQ_WebManualCategories_Name') IS NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_WebManualCategories_Parent_Name')
-- ============================================================
-- 011_category_defaults.sql — Mục mặc định cho mọi bộ phận + đề xuất thể loại chờ duyệt
-- ============================================================
-- 1. Tên thể loại trước đây phải khác nhau trên TOÀN hệ thống -> không thể có
--    cả "PE IT › Biểu mẫu" lẫn "QA › Biểu mẫu". Đổi thành: không trùng tên
--    TRONG CÙNG thể loại cha. (SQL Server coi các ParentId NULL là bằng nhau
--    trong unique index -> các thể loại cấp cao nhất vẫn không được trùng tên,
--    nên phân quyền theo tên bộ phận không bị ảnh hưởng.)
-- 2. CategoryTemplates: cây "mục mặc định" admin sửa trên web. Tạo thể loại cấp
--    cao nhất (bộ phận) là tự có đủ các mục này.
-- 3. CategoryRequests: biên tập đề xuất thể loại mới, admin duyệt / từ chối.

ALTER TABLE WebManualCategories DROP CONSTRAINT UQ_WebManualCategories_Name;
GO
CREATE UNIQUE INDEX UX_WebManualCategories_Parent_Name ON WebManualCategories (ParentId, Name);
GO

CREATE TABLE WebManualCategoryTemplates (
  Id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualCategoryTemplates PRIMARY KEY,
  Name      NVARCHAR(100) NOT NULL,
  IconName  NVARCHAR(50)  NOT NULL CONSTRAINT DF_WebManualCategoryTemplates_IconName DEFAULT N'Folder',
  -- Mục cha trong cây mục mặc định; NULL = mục con trực tiếp của bộ phận.
  -- (SQL Server không cho ON DELETE CASCADE với khóa ngoại trỏ về chính bảng -> app tự xóa cả nhánh.)
  ParentId  INT NULL CONSTRAINT FK_WebManualCategoryTemplates_Parent REFERENCES WebManualCategoryTemplates (Id),
  CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualCategoryTemplates_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualCategoryTemplates_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO
CREATE UNIQUE INDEX UX_WebManualCategoryTemplates_Parent_Name ON WebManualCategoryTemplates (ParentId, Name);
GO
INSERT INTO WebManualCategoryTemplates (Name, IconName) VALUES
  (N'Quy trình', N'ClipboardList'),
  (N'Hướng dẫn', N'BookOpen'),
  (N'Biểu mẫu', N'FileText'),
  (N'Đào tạo', N'GraduationCap'),
  (N'Thông báo', N'Megaphone');
GO

CREATE TABLE WebManualCategoryRequests (
  Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualCategoryRequests PRIMARY KEY,
  -- Đề xuất tạo thể loại mới NẰM TRONG thể loại này. Thể loại cha bị xóa -> đề xuất mất theo.
  ParentId      INT NOT NULL CONSTRAINT FK_WebManualCategoryRequests_Parent REFERENCES WebManualCategories (Id) ON DELETE CASCADE,
  Name          NVARCHAR(100) NOT NULL,
  IconName      NVARCHAR(50)  NOT NULL CONSTRAINT DF_WebManualCategoryRequests_IconName DEFAULT N'Folder',
  Note          NVARCHAR(500) NOT NULL CONSTRAINT DF_WebManualCategoryRequests_Note DEFAULT N'',
  Status        NVARCHAR(10)  NOT NULL CONSTRAINT DF_WebManualCategoryRequests_Status DEFAULT N'pending'
                CONSTRAINT CK_WebManualCategoryRequests_Status CHECK (Status IN (N'pending', N'approved', N'rejected')),
  RejectReason  NVARCHAR(500) NULL,
  -- Thể loại đã tạo khi duyệt. Không đặt khóa ngoại: SQL Server cấm 2 đường
  -- ON DELETE từ cùng bảng Categories tới bảng này.
  CategoryId    INT NULL,
  RequestedById INT NOT NULL CONSTRAINT FK_WebManualCategoryRequests_User REFERENCES WebManualUsers (Id) ON DELETE CASCADE,
  -- Admin đã duyệt / từ chối. Không khóa ngoại: xóa tài khoản admin vẫn giữ lịch sử.
  ReviewedById  INT NULL,
  ReviewedAt    DATETIME2(3) NULL,
  CreatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualCategoryRequests_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX IX_WebManualCategoryRequests_Status ON WebManualCategoryRequests (Status, CreatedAt);
GO
CREATE INDEX IX_WebManualCategoryRequests_User ON WebManualCategoryRequests (RequestedById, CreatedAt DESC);
GO
