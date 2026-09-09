-- r66: rebuild the minimal local DB state that the r65 regression suite expects
-- (specialty 1 + 2, year 1 = spec-1 first year, year 2 = spec-2 first year,
--  module 1 النحو / module 3 البلاغة, owner id 1 / student id 2).
INSERT INTO Specialty (id, institutionId, nameAr, code, iconName, description, institution, faculty, createdAt, updatedAt)
VALUES
  (1, 2, 'علوم الإعلام والاتصال (اختبار)', 'TST-INF', 'book', 'اختبار r65', 'المدرسة العليا للأساتذة - بوزريعة', 'قسم الاختبار', datetime('now'), datetime('now')),
  (2, 2, 'اللغة والأدب العربي (اختبار)', 'TST-LIT', 'book', 'اختبار r65', 'المدرسة العليا للأساتذة - بوزريعة', 'قسم الاختبار', datetime('now'), datetime('now'));
INSERT INTO AcademicYear (id, specialtyId, yearName, semester, createdAt, updatedAt) VALUES
  (1, 1, 'السنة الأولى', 1, datetime('now'), datetime('now')),
  (2, 2, 'السنة الأولى', 1, datetime('now'), datetime('now'));
INSERT INTO ModuleCourse (id, specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES
  (1, 1, 1, 1, 'النحو والتطبيق', 'TST-NHW', datetime('now'), datetime('now')),
  (3, 1, 1, 1, 'البلاغة', 'TST-BLG', datetime('now'), datetime('now'));
INSERT INTO AppUser (id, fullName, email, studentId, passwordHash, specialtyName, yearName, groupNumber, role, representativeScope, assignedSpecialtyId, scopeAcademicYearId, createdAt, updatedAt) VALUES
  (1, 'مالك التحقق', 'r52-owner@test.dz', 'r52owner', '', 'الأدب', 'سنة أولى', '01', 'OWNER', 'سنة كاملة', 2, NULL, datetime('now'), datetime('now')),
  (2, 'طالبة التحقق', 'r52-student@test.dz', 'r52student', '', 'الإعلام', 'سنة أولى', '01', 'STUDENT', 'سنة كاملة', 1, 1, datetime('now'), datetime('now'));
