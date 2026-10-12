-- ============================================================
-- create-tables.sql — Tạo bảng WebManual trong database KVH (chạy trong SSMS)
-- ============================================================
-- Cách chạy: SSMS -> kết nối 192.168.122.2 -> New Query -> dán toàn bộ
-- file -> Execute (F5). Chạy MỘT lần.
--
-- An toàn: script DỪNG HẲN, không tạo gì, nếu
--   - không chuyển được sang database KVH, hoặc
--   - các bảng WebManual... đã có (tránh chạy lần hai).
-- Không đụng tới bất kỳ bảng nào khác trong KVH.
--
-- Nội dung bảng giống hệt server/src/db/migrations/001_init.sql, cộng
-- thêm bảng WebManualSchemaMigrations ở cuối để app biết bảng đã có sẵn.

USE KVH;
GO

IF DB_NAME() <> N'KVH'
BEGIN
  RAISERROR(N'Không đứng ở database KVH -> DỪNG, không tạo bảng nào.', 16, 1);
  SET NOEXEC ON;   -- mọi lô lệnh phía sau chỉ kiểm tra cú pháp, KHÔNG chạy
END
GO

IF OBJECT_ID(N'WebManualUsers', N'U') IS NOT NULL OR OBJECT_ID(N'WebManualSchemaMigrations', N'U') IS NOT NULL
BEGIN
  RAISERROR(N'Các bảng WebManual đã tồn tại -> DỪNG, không tạo lại.', 16, 1);
  SET NOEXEC ON;
END
GO

-- Tài khoản người soạn tài liệu (admin / editor)
CREATE TABLE WebManualUsers (
  Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualUsers PRIMARY KEY,
  Username     NVARCHAR(32)  NOT NULL CONSTRAINT UQ_WebManualUsers_Username UNIQUE,
  DisplayName  NVARCHAR(100) NOT NULL,
  Email        NVARCHAR(254) NULL,
  PasswordHash NVARCHAR(100) NOT NULL,
  Role         NVARCHAR(10)  NOT NULL CONSTRAINT DF_WebManualUsers_Role DEFAULT N'editor'
                             CONSTRAINT CK_WebManualUsers_Role CHECK (Role IN (N'admin', N'editor')),
  -- pending = tự đăng ký, chờ admin duyệt
  Status       NVARCHAR(10)  NOT NULL CONSTRAINT DF_WebManualUsers_Status DEFAULT N'active'
                             CONSTRAINT CK_WebManualUsers_Status CHECK (Status IN (N'active', N'pending')),
  CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualUsers_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualUsers_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Email không bắt buộc, nhưng nếu có thì không được trùng.
-- "Filtered index" (WHERE ... IS NOT NULL): nhiều tài khoản không có email
-- không bị coi là trùng nhau.
CREATE UNIQUE INDEX UX_WebManualUsers_Email ON WebManualUsers (Email) WHERE Email IS NOT NULL;
GO

-- Thể loại
CREATE TABLE WebManualCategories (
  Id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualCategories PRIMARY KEY,
  Name      NVARCHAR(100) NOT NULL CONSTRAINT UQ_WebManualCategories_Name UNIQUE,
  IconName  NVARCHAR(50)  NOT NULL CONSTRAINT DF_WebManualCategories_IconName DEFAULT N'Folder',
  CreatedAt DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualCategories_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualCategories_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Tài liệu. Cột Blocks chứa toàn bộ các khối dạng JSON: [{ "id", "type", "props" }, ...]
CREATE TABLE WebManualDocuments (
  Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualDocuments PRIMARY KEY,
  Title       NVARCHAR(300) NOT NULL,
  Slug        NVARCHAR(100) NOT NULL CONSTRAINT UQ_WebManualDocuments_Slug UNIQUE,
  CategoryId  INT NOT NULL CONSTRAINT FK_WebManualDocuments_Category REFERENCES WebManualCategories (Id),
  Status      NVARCHAR(10)  NOT NULL CONSTRAINT DF_WebManualDocuments_Status DEFAULT N'draft'
                            CONSTRAINT CK_WebManualDocuments_Status CHECK (Status IN (N'draft', N'published')),
  -- ISJSON: SQL Server tự từ chối nếu không phải JSON hợp lệ.
  Blocks      NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WebManualDocuments_Blocks DEFAULT N'[]'
                            CONSTRAINT CK_WebManualDocuments_Blocks CHECK (ISJSON(Blocks) = 1),
  Version     INT           NOT NULL CONSTRAINT DF_WebManualDocuments_Version DEFAULT 0,
  Description NVARCHAR(200) NOT NULL CONSTRAINT DF_WebManualDocuments_Description DEFAULT N'',
  -- Toàn bộ chữ trong bài, đã bỏ dấu + chữ thường, dùng cho tìm kiếm.
  SearchText  NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WebManualDocuments_SearchText DEFAULT N'',
  CreatedById INT NULL CONSTRAINT FK_WebManualDocuments_CreatedBy REFERENCES WebManualUsers (Id),
  UpdatedById INT NULL CONSTRAINT FK_WebManualDocuments_UpdatedBy REFERENCES WebManualUsers (Id),
  CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualDocuments_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualDocuments_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_WebManualDocuments_CategoryId ON WebManualDocuments (CategoryId);
CREATE INDEX IX_WebManualDocuments_UpdatedAt ON WebManualDocuments (UpdatedAt DESC);
GO

-- Lịch sử phiên bản: bản chụp tài liệu sau mỗi lần lưu
CREATE TABLE WebManualDocumentVersions (
  Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualDocumentVersions PRIMARY KEY,
  -- Xóa tài liệu -> xóa luôn mọi phiên bản của nó.
  DocumentId   INT NOT NULL CONSTRAINT FK_WebManualDocumentVersions_Document
                 REFERENCES WebManualDocuments (Id) ON DELETE CASCADE,
  Version      INT NOT NULL,
  Title        NVARCHAR(300) NOT NULL,
  -- Không đặt khóa ngoại: thể loại cũ có thể đã bị xóa, bản chụp vẫn giữ.
  CategoryId   INT NULL,
  Status       NVARCHAR(10)  NOT NULL,
  Blocks       NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualDocumentVersions_Blocks CHECK (ISJSON(Blocks) = 1),
  SavedById    INT NULL CONSTRAINT FK_WebManualDocumentVersions_SavedBy REFERENCES WebManualUsers (Id),
  RestoredFrom INT NULL,
  CreatedAt    DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualDocumentVersions_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_WebManualDocumentVersions_DocumentId_Version UNIQUE (DocumentId, Version)
);
GO

-- Thông tin file đã upload (file thật nằm trên ổ đĩa máy chủ app, thư mục UPLOAD_DIR)
CREATE TABLE WebManualMedia (
  Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualMedia PRIMARY KEY,
  Kind         NVARCHAR(10)  NOT NULL CONSTRAINT CK_WebManualMedia_Kind CHECK (Kind IN (N'image', N'video', N'file')),
  Url          NVARCHAR(300) NOT NULL,
  OriginalName NVARCHAR(260) NOT NULL CONSTRAINT DF_WebManualMedia_OriginalName DEFAULT N'',
  Mime         NVARCHAR(100) NOT NULL CONSTRAINT DF_WebManualMedia_Mime DEFAULT N'',
  Size         BIGINT        NOT NULL CONSTRAINT DF_WebManualMedia_Size DEFAULT 0,
  Width        INT NULL,
  Height       INT NULL,
  UploadedById INT NULL CONSTRAINT FK_WebManualMedia_UploadedBy REFERENCES WebManualUsers (Id),
  CreatedAt    DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualMedia_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_WebManualMedia_Kind_CreatedAt ON WebManualMedia (Kind, CreatedAt DESC);
GO

-- Phiên quét QR để upload ảnh từ điện thoại (sống 10 phút, dùng 1 lần)
CREATE TABLE WebManualUploadSessions (
  Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualUploadSessions PRIMARY KEY,
  Token       CHAR(48)     NOT NULL CONSTRAINT UQ_WebManualUploadSessions_Token UNIQUE,
  Kind        NVARCHAR(10) NOT NULL CONSTRAINT CK_WebManualUploadSessions_Kind CHECK (Kind IN (N'image', N'video')),
  Status      NVARCHAR(10) NOT NULL CONSTRAINT DF_WebManualUploadSessions_Status DEFAULT N'pending'
                           CONSTRAINT CK_WebManualUploadSessions_Status CHECK (Status IN (N'pending', N'done')),
  MediaId     INT NULL CONSTRAINT FK_WebManualUploadSessions_Media REFERENCES WebManualMedia (Id),
  CreatedById INT NOT NULL CONSTRAINT FK_WebManualUploadSessions_CreatedBy REFERENCES WebManualUsers (Id),
  ExpiresAt   DATETIME2(3) NOT NULL,
  CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualUploadSessions_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_WebManualUploadSessions_ExpiresAt ON WebManualUploadSessions (ExpiresAt);
GO

-- Thể loại dạng cây (giống src/db/migrations/002_category_tree.sql)
ALTER TABLE WebManualCategories
  ADD ParentId INT NULL
      CONSTRAINT FK_WebManualCategories_Parent REFERENCES WebManualCategories (Id);
GO

CREATE INDEX IX_WebManualCategories_ParentId ON WebManualCategories (ParentId);
GO

-- Đánh dấu cho app biết bảng đã được tạo sẵn, không tạo lại
CREATE TABLE WebManualSchemaMigrations (
  Name      NVARCHAR(200) NOT NULL CONSTRAINT PK_WebManualSchemaMigrations PRIMARY KEY,
  AppliedAt DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualSchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME()
);
GO

INSERT INTO WebManualSchemaMigrations (Name) VALUES (N'001_init.sql'), (N'002_category_tree.sql');
GO

-- Kiểm tra: phải ra đúng 7 bảng WebManual...
SELECT DB_NAME() AS DatabaseName, SCHEMA_NAME(schema_id) AS SchemaName, name AS TableName, create_date AS CreatedAt
FROM sys.tables
WHERE name LIKE N'WebManual%'
ORDER BY name;
GO

-- Bật lại chế độ chạy lệnh bình thường cho cửa sổ query này.
SET NOEXEC OFF;
GO
