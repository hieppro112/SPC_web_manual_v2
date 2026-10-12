-- ============================================================
-- 002_category_tree.sql — Thể loại dạng cây (cha / con)
-- ============================================================
-- ParentId = Id của thể loại cha; NULL = thể loại cấp cao nhất.
--   Tất cả
--   ├── IT          (ParentId = NULL)
--   │   └── AI      (ParentId = Id của IT)
--   ├── PC          (ParentId = NULL)
--   └── QA          (ParentId = NULL)
-- Khóa ngoại trỏ về CHÍNH bảng này: không thể đặt cha là thể loại không
-- tồn tại, và không xóa được thể loại đang có con (app báo lỗi rõ ràng).

ALTER TABLE WebManualCategories
  ADD ParentId INT NULL
      CONSTRAINT FK_WebManualCategories_Parent REFERENCES WebManualCategories (Id);
GO

CREATE INDEX IX_WebManualCategories_ParentId ON WebManualCategories (ParentId);
GO
