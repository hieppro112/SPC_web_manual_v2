-- @applied-if: OBJECT_ID(N'WebManualDocTranslations', N'U') IS NOT NULL AND OBJECT_ID(N'WebManualTranslationJobs', N'U') IS NOT NULL
-- ============================================================
-- 007_translations.sql — Bản dịch tự động của tài liệu (vi / en / ja)
-- ============================================================
-- Bài gốc KHÔNG bị đụng tới. Mỗi bài có tối đa 2 bản dịch (2 ngôn ngữ còn lại),
-- dựng y hệt cấu trúc bài gốc (cùng id khối), chỉ khác phần chữ.
--
-- Hashes: "dấu vân tay" của từng khối gốc lúc dịch ({ idKhối: sha1, __title: sha1 }).
--   Bài gốc sửa một khối -> chỉ khối đó lệch dấu -> chỉ dịch lại khối đó.
--   Khối editor sửa tay mà bản gốc không đổi -> giữ nguyên phần sửa tay.

CREATE TABLE WebManualDocTranslations (
  DocumentId    INT           NOT NULL CONSTRAINT FK_WebManualDocTranslations_Document REFERENCES WebManualDocuments (Id) ON DELETE CASCADE,
  Lang          NVARCHAR(5)   NOT NULL,
  SourceLang    NVARCHAR(5)   NOT NULL,
  SourceVersion INT           NOT NULL,
  Title         NVARCHAR(300) NOT NULL,
  Description   NVARCHAR(500) NOT NULL CONSTRAINT DF_WebManualDocTranslations_Description DEFAULT N'',
  Blocks        NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualDocTranslations_Blocks CHECK (ISJSON(Blocks) = 1),
  Hashes        NVARCHAR(MAX) NOT NULL CONSTRAINT CK_WebManualDocTranslations_Hashes CHECK (ISJSON(Hashes) = 1),
  SearchText    NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WebManualDocTranslations_SearchText DEFAULT N'',
  -- Người sửa tay gần nhất (không khóa ngoại: xóa tài khoản thì chỉ mất tên)
  EditedById    INT           NULL,
  EditedAt      DATETIME2(3)  NULL,
  UpdatedAt     DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualDocTranslations_UpdatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_WebManualDocTranslations PRIMARY KEY (DocumentId, Lang)
);
GO

-- Hàng đợi: MỖI BÀI MỘT DÒNG. Lưu bài liên tục chỉ cập nhật dòng này (không chất đống việc).
--   Priority 1 = vừa lưu bài (làm trước), 0 = dịch bù các bài cũ
--   Force 1 = editor bấm "Dịch lại từ đầu" (bỏ qua phần đã dịch / sửa tay)
CREATE TABLE WebManualTranslationJobs (
  DocumentId       INT           NOT NULL CONSTRAINT PK_WebManualTranslationJobs PRIMARY KEY
                                 CONSTRAINT FK_WebManualTranslationJobs_Document REFERENCES WebManualDocuments (Id) ON DELETE CASCADE,
  RequestedVersion INT           NOT NULL,
  Priority         TINYINT       NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Priority DEFAULT 1,
  Force            BIT           NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Force DEFAULT 0,
  Status           NVARCHAR(12)  NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Status DEFAULT N'pending'
                                 CONSTRAINT CK_WebManualTranslationJobs_Status CHECK (Status IN (N'pending', N'processing', N'failed')),
  Attempts         INT           NOT NULL CONSTRAINT DF_WebManualTranslationJobs_Attempts DEFAULT 0,
  Error            NVARCHAR(1000) NULL,
  ClaimedAt        DATETIME2(3)  NULL,
  CreatedAt        DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualTranslationJobs_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt        DATETIME2(3)  NOT NULL CONSTRAINT DF_WebManualTranslationJobs_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX IX_WebManualTranslationJobs_Queue ON WebManualTranslationJobs (Status, Priority DESC, UpdatedAt);
GO
