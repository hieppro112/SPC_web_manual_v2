-- ============================================================
-- create-tables.sql — Tạo toàn bộ bảng của WebManual (chạy trong SSMS)
-- ============================================================
-- Database WebManual phải CÓ SẴN (IT tạo — tạo database cần quyền riêng).
-- Cách chạy: SSMS -> kết nối 192.168.122.2 -> New Query -> chọn database
-- WebManual ở ô chọn database trên thanh công cụ -> dán toàn bộ file
-- này -> Execute (F5). Chạy MỘT lần trên database WebManual trống.
--
-- Nội dung giống hệt server/src/db/migrations/001_init.sql, cộng thêm
-- bảng SchemaMigrations ở cuối để app biết "bảng đã được tạo sẵn",
-- không tự tạo lại.

USE WebManual;
GO

-- AN TOÀN: nếu không đứng đúng database WebManual (vd USE ở trên thất
-- bại vì database chưa có) thì DỪNG HẲN — mọi lô lệnh phía sau chỉ được
-- kiểm tra cú pháp, KHÔNG chạy (SET NOEXEC ON). Tránh tạo nhầm bảng vào
-- database khác.
IF DB_NAME() <> N'WebManual'
BEGIN
  RAISERROR(N'Không đứng ở database WebManual -> DỪNG, không tạo bảng nào. Nhờ IT tạo database WebManual trước.', 16, 1);
  SET NOEXEC ON;
END
GO

-- Database phải còn trống (chưa có bảng Users) -> tránh chạy lần hai.
IF OBJECT_ID(N'Users', N'U') IS NOT NULL
BEGIN
  RAISERROR(N'Database WebManual đã có bảng Users -> DỪNG, không tạo lại.', 16, 1);
  SET NOEXEC ON;
END
GO

CREATE TABLE Users (
  Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
  Username     NVARCHAR(32)  NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
  DisplayName  NVARCHAR(100) NOT NULL,
  Email        NVARCHAR(254) NULL,
  PasswordHash NVARCHAR(100) NOT NULL,
  Role         NVARCHAR(10)  NOT NULL CONSTRAINT DF_Users_Role DEFAULT N'editor'
                             CONSTRAINT CK_Users_Role CHECK (Role IN (N'admin', N'editor')),
  -- pending = tự đăng ký, chờ admin duyệt
  Status       NVARCHAR(10)  NOT NULL CONSTRAINT DF_Users_Status DEFAULT N'active'
                             CONSTRAINT CK_Users_Status CHECK (Status IN (N'active', N'pending')),
  CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Email không bắt buộc nhưng nếu có thì không được trùng.
-- "Filtered index" (WHERE ... IS NOT NULL): nhiều tài khoản không có email
-- không bị coi là trùng nhau.
CREATE UNIQUE INDEX UX_Users_Email ON Users (Email) WHERE Email IS NOT NULL;
GO

CREATE TABLE Categories (
  Id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Categories PRIMARY KEY,
  Name      NVARCHAR(100) NOT NULL CONSTRAINT UQ_Categories_Name UNIQUE,
  IconName  NVARCHAR(50)  NOT NULL CONSTRAINT DF_Categories_IconName DEFAULT N'Folder',
  CreatedAt DATETIME2(3)  NOT NULL CONSTRAINT DF_Categories_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2(3)  NOT NULL CONSTRAINT DF_Categories_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE Documents (
  Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Documents PRIMARY KEY,
  Title       NVARCHAR(300) NOT NULL,
  Slug        NVARCHAR(100) NOT NULL CONSTRAINT UQ_Documents_Slug UNIQUE,
  CategoryId  INT NOT NULL CONSTRAINT FK_Documents_Categories REFERENCES Categories (Id),
  Status      NVARCHAR(10)  NOT NULL CONSTRAINT DF_Documents_Status DEFAULT N'draft'
                            CONSTRAINT CK_Documents_Status CHECK (Status IN (N'draft', N'published')),
  -- Toàn bộ mảng khối dạng JSON: [{ "id", "type", "props" }, ...]
  -- ISJSON: SQL Server tự từ chối nếu không phải JSON hợp lệ.
  Blocks      NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Documents_Blocks DEFAULT N'[]'
                            CONSTRAINT CK_Documents_Blocks CHECK (ISJSON(Blocks) = 1),
  Version     INT           NOT NULL CONSTRAINT DF_Documents_Version DEFAULT 0,
  Description NVARCHAR(200) NOT NULL CONSTRAINT DF_Documents_Description DEFAULT N'',
  -- Toàn bộ chữ trong bài, đã bỏ dấu + chữ thường, dùng cho tìm kiếm.
  SearchText  NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Documents_SearchText DEFAULT N'',
  CreatedById INT NULL CONSTRAINT FK_Documents_CreatedBy REFERENCES Users (Id),
  UpdatedById INT NULL CONSTRAINT FK_Documents_UpdatedBy REFERENCES Users (Id),
  CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_Documents_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_Documents_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_Documents_CategoryId ON Documents (CategoryId);
CREATE INDEX IX_Documents_UpdatedAt ON Documents (UpdatedAt DESC);
GO

-- Bản chụp tài liệu sau MỖI lần lưu (lịch sử phiên bản).
CREATE TABLE DocumentVersions (
  Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DocumentVersions PRIMARY KEY,
  -- Xóa tài liệu -> xóa luôn mọi phiên bản của nó.
  DocumentId   INT NOT NULL CONSTRAINT FK_DocumentVersions_Documents
                 REFERENCES Documents (Id) ON DELETE CASCADE,
  Version      INT NOT NULL,
  Title        NVARCHAR(300) NOT NULL,
  -- Không đặt khóa ngoại: thể loại cũ có thể đã bị xóa, bản chụp vẫn giữ.
  CategoryId   INT NULL,
  Status       NVARCHAR(10)  NOT NULL,
  Blocks       NVARCHAR(MAX) NOT NULL CONSTRAINT CK_DocumentVersions_Blocks CHECK (ISJSON(Blocks) = 1),
  SavedById    INT NULL CONSTRAINT FK_DocumentVersions_SavedBy REFERENCES Users (Id),
  RestoredFrom INT NULL,
  CreatedAt    DATETIME2(3) NOT NULL CONSTRAINT DF_DocumentVersions_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_DocumentVersions_DocumentId_Version UNIQUE (DocumentId, Version)
);
GO

-- Thông tin file đã upload (file thật nằm trên ổ đĩa, thư mục UPLOAD_DIR).
CREATE TABLE Media (
  Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Media PRIMARY KEY,
  Kind         NVARCHAR(10)  NOT NULL CONSTRAINT CK_Media_Kind CHECK (Kind IN (N'image', N'video', N'file')),
  Url          NVARCHAR(300) NOT NULL,
  OriginalName NVARCHAR(260) NOT NULL CONSTRAINT DF_Media_OriginalName DEFAULT N'',
  Mime         NVARCHAR(100) NOT NULL CONSTRAINT DF_Media_Mime DEFAULT N'',
  Size         BIGINT        NOT NULL CONSTRAINT DF_Media_Size DEFAULT 0,
  Width        INT NULL,
  Height       INT NULL,
  UploadedById INT NULL CONSTRAINT FK_Media_UploadedBy REFERENCES Users (Id),
  CreatedAt    DATETIME2(3) NOT NULL CONSTRAINT DF_Media_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_Media_Kind_CreatedAt ON Media (Kind, CreatedAt DESC);
GO

-- Phiên "quét QR để upload từ điện thoại" — sống 10 phút, dùng 1 lần.
CREATE TABLE UploadSessions (
  Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UploadSessions PRIMARY KEY,
  Token       CHAR(48)     NOT NULL CONSTRAINT UQ_UploadSessions_Token UNIQUE,
  Kind        NVARCHAR(10) NOT NULL CONSTRAINT CK_UploadSessions_Kind CHECK (Kind IN (N'image', N'video')),
  Status      NVARCHAR(10) NOT NULL CONSTRAINT DF_UploadSessions_Status DEFAULT N'pending'
                           CONSTRAINT CK_UploadSessions_Status CHECK (Status IN (N'pending', N'done')),
  MediaId     INT NULL CONSTRAINT FK_UploadSessions_Media REFERENCES Media (Id),
  CreatedById INT NOT NULL CONSTRAINT FK_UploadSessions_CreatedBy REFERENCES Users (Id),
  ExpiresAt   DATETIME2(3) NOT NULL,
  CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_UploadSessions_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_UploadSessions_ExpiresAt ON UploadSessions (ExpiresAt);
GO

-- Bảng ghi lại các bản cập nhật cấu trúc đã áp dụng. Dòng '001_init.sql'
-- báo cho app: phần tạo bảng ở trên đã xong.
CREATE TABLE SchemaMigrations (
  Name      NVARCHAR(200) NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
  AppliedAt DATETIME2(3)  NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME()
);
GO

INSERT INTO SchemaMigrations (Name) VALUES (N'001_init.sql');
GO

-- Kiểm tra: phải ra 7 bảng
SELECT DB_NAME() AS DatabaseName, name AS TableName FROM sys.tables ORDER BY name;
GO

-- Bật lại chế độ chạy lệnh bình thường cho cửa sổ query này.
SET NOEXEC OFF;
GO
