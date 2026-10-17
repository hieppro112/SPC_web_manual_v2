-- @applied-if: OBJECT_ID(N'WebManualImportJobs', N'U') IS NOT NULL
-- ============================================================
-- 005_import_jobs.sql — Hàng đợi "nhập bài từ PowerPoint"
-- ============================================================
-- Editor tải file .pptx lên -> web đọc sẵn nội dung từng slide (chữ, bảng,
-- ảnh đã upload, ghi chú) vào cột Payload (JSON) + 1 dòng 'pending'.
-- Worker (máy có Claude) nhận việc, nhờ Claude dựng khối, gửi lại ->
-- web tạo BÀI NHÁP ('done', DocumentId trỏ tới bài đó).
--
--   pending -> processing -> done / failed;  pending/processing -> expired / cancelled

CREATE TABLE WebManualImportJobs (
  Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WebManualImportJobs PRIMARY KEY,
  FileName      NVARCHAR(260) NOT NULL,
  -- Thể loại của bài sẽ tạo; xóa thể loại thì về NULL (bài tạo ra sẽ báo lỗi, chọn lại)
  CategoryId    INT NULL CONSTRAINT FK_WebManualImportJobs_Category REFERENCES WebManualCategories (Id) ON DELETE SET NULL,
  Language      NVARCHAR(5)   NOT NULL CONSTRAINT DF_WebManualImportJobs_Language DEFAULT N'vi',
  SlideCount    INT           NOT NULL CONSTRAINT DF_WebManualImportJobs_SlideCount DEFAULT 0,
  -- Nội dung đã đọc sẵn từ file: { attachment, slides: [{ n, texts, tables, images, notes }] }
  Payload       NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualImportJobs_Payload CHECK (ISJSON(Payload) = 1),
  Status        NVARCHAR(12)  NOT NULL CONSTRAINT DF_WebManualImportJobs_Status DEFAULT N'pending'
                              CONSTRAINT CK_WebManualImportJobs_Status
                                CHECK (Status IN (N'pending', N'processing', N'done', N'failed', N'expired', N'cancelled')),
  RequestedById INT NULL CONSTRAINT FK_WebManualImportJobs_RequestedBy REFERENCES WebManualUsers (Id),
  DocumentId    INT NULL CONSTRAINT FK_WebManualImportJobs_Document REFERENCES WebManualDocuments (Id) ON DELETE SET NULL,
  Error         NVARCHAR(1000) NULL,
  ClaimedAt     DATETIME2(3) NULL,
  CompletedAt   DATETIME2(3) NULL,
  SeenAt        DATETIME2(3) NULL,
  CreatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualImportJobs_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt     DATETIME2(3) NOT NULL CONSTRAINT DF_WebManualImportJobs_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX IX_WebManualImportJobs_Status_CreatedAt ON WebManualImportJobs (Status, CreatedAt);
GO
CREATE INDEX IX_WebManualImportJobs_RequestedBy ON WebManualImportJobs (RequestedById, CreatedAt DESC);
GO
