package com.example.talib.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

// 0. المؤسسات الجامعية
@Entity(tableName = "institutions")
data class Institution(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val nameAr: String,
  val type: String = "المدرسة العليا للأساتذة",
  val city: String = "الجزائر"
)

@Entity(tableName = "specialties")
data class Specialty(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val institutionId: Long = 1,
  val nameAr: String,
  val code: String,
  val iconName: String = "book",
  val description: String = "",
  val institution: String = "المدرسة العليا للأساتذة - بوزريعة",
  val faculty: String = "قسم اللغة والأدب العربي"
)

@Entity(tableName = "academic_years")
data class AcademicYear(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val specialtyId: Long,
  val yearName: String,
  val semester: Int = 1
)

// 0.1 الأفواج الدراسية (Cohort Groups)
@Entity(tableName = "cohort_groups")
data class CohortGroup(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val specialtyId: Long,
  val academicYearId: Long,
  val groupName: String, // "الفوج 01", "الفوج 02", "الفوج 03"
  val subGroup: String = ""
)

// هيكل تعيين النطاق بالمعرفات الرقمية الفعلية
data class ScopeAssignment(
  val institutionId: Long? = null,
  val specialtyId: Long? = null,
  val yearId: Long? = null,
  val groupId: Long? = null,
  val scopeDescription: String = ""
)

@Entity(tableName = "modules")
data class ModuleCourse(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val specialtyId: Long,
  val academicYearId: Long,
  val name: String,
  val code: String,
  val coefficient: Double = 2.0,
  val credits: Int = 4,
  val professorName: String = "",
  val professorEmail: String = "",
  val category: String = "أساسي", // أساسي / منهجي / استكشافي
  val description: String = "",
  val isCachedOffline: Boolean = true,
  val lastViewedTimestamp: Long = 0L,
  val syllabusTopics: String = "",
  val visibilityScope: String = "تخصص كامل", // تخصص كامل / عدة أفواج محددة / فوج واحد
  val targetGroup: String = "الكل"
)

@Entity(tableName = "lectures")
data class Lecture(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val moduleId: Long,
  val weekNumber: Int,
  val title: String,
  val summary: String,
  val pdfFileName: String = "lecture_notes.pdf",
  val pdfUrl: String = "",
  val durationMinutes: Int = 90,
  val date: String = "",
  val isBookmarked: Boolean = false,
  val isDownloaded: Boolean = false,
  val isCachedOffline: Boolean = true,
  val isRead: Boolean = false,
  val lastViewedTimestamp: Long = 0L,
  val cachedContentText: String = "",
  val visibilityScope: String = "تخصص كامل", // تخصص كامل / عدة أفواج محددة / فوج واحد
  val targetGroup: String = "الكل",
  val authorName: String = "الممثل"
)

@Entity(tableName = "cached_materials")
data class CachedCourseMaterial(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val moduleId: Long,
  val moduleName: String,
  val title: String,
  val materialType: String = "محاضرة", // محاضرة / ملخص دراسي / أعمال موجهة TD / امتحان سابق
  val summary: String,
  val fullText: String,
  val keyConcepts: String = "",
  val weekNumber: Int = 1,
  val cachedDate: String = "مخزن محلياً",
  val lastViewedTimestamp: Long = System.currentTimeMillis(),
  val isOfflineAvailable: Boolean = true
)

@Entity(tableName = "assignments")
data class Assignment(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val moduleId: Long,
  val title: String,
  val dueDate: String,
  val description: String,
  val isCompleted: Boolean = false,
  val maxScore: Double = 20.0,
  val visibilityScope: String = "تخصص كامل",
  val targetGroup: String = "الكل"
)

@Entity(tableName = "schedules")
data class ScheduleItem(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val specialtyId: Long,
  val academicYearId: Long,
  val dayOfWeek: Int, // 1: الأحد, 2: الإثنين, 3: الثلاثاء, 4: الأربعاء, 5: الخميس
  val startTime: String,
  val endTime: String,
  val moduleName: String,
  val type: String, // محاضرة / أعمال موجهة TD / أعمال تطبيقية TP
  val room: String,
  val professor: String,
  val visibilityScope: String = "تخصص كامل", // تخصص كامل / عدة أفواج محددة / فوج واحد
  val targetGroup: String = "الفوج 03"
)

@Entity(tableName = "exams")
data class Exam(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val moduleId: Long,
  val moduleName: String,
  val title: String,
  val examDate: String,
  val time: String,
  val room: String,
  val coefficient: Double = 2.0,
  val isFinished: Boolean = false,
  val visibilityScope: String = "تخصص كامل",
  val targetGroup: String = "الكل"
)

@Entity(tableName = "grades")
data class StudentGrade(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val moduleId: Long,
  val moduleName: String,
  val continuousScore: Double = 14.0, // TD / TP out of 20
  val examScore: Double = 15.0, // Exam out of 20
  val coefficient: Double = 2.0,
  val credits: Int = 4,
  val isOfficial: Boolean = false, // تمييز بصري صريح: رسمي من الإدارة أو تقديري من الطالب
  val targetScore: Double = 10.0 // الدرجة المستهدفة للنجاح
)

@Entity(tableName = "announcements")
data class Announcement(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val title: String,
  val content: String,
  val author: String,
  val date: String,
  val urgency: String = "عام", // عاجل / هام / عام
  val specialtyId: Long? = null,
  val isRead: Boolean = false,
  val visibilityScope: String = "تخصص كامل", // تخصص كامل / عدة أفواج محددة / فوج واحد
  val targetGroups: String = "الكل"
)

@Entity(tableName = "student_profiles")
data class StudentProfile(
  @PrimaryKey val id: Long = 1,
  val fullName: String = "محمد البشير بن علي",
  val studentId: String = "202631084592",
  val institution: String = "المدرسة العليا للأساتذة - بوزريعة (ENS)",
  val university: String = "المدرسة العليا للأساتذة - بوزريعة",
  val faculty: String = "قسم اللغة والأدب العربي",
  val specialtyName: String = "اللغة والأدب العربي",
  val profileTrack: String = "أستاذ التعليم الابتدائي",
  val selectedSpecialtyId: Long = 1,
  val selectedYearId: Long = 2,
  val academicYearName: String = "السنة الثانية (L2)",
  val semesterName: String = "السداسي الأول (S1)",
  val groupNumber: String = "الفوج 03",
  val subGroup: String = "الفوج الفرعي B",
  val email: String = "mohamedbessghier8@gmail.com",
  val isAdminMode: Boolean = false,
  val userRole: String = "STUDENT", // STUDENT / REPRESENTATIVE / SPECIALTY_ADMIN / OWNER
  val themePalette: String = "ACADEMIC", // ACADEMIC (#1B5E4B) or MODERN (#8B5CF6)
  val isConfigured: Boolean = false // false means onboarding flow appears on first start
)

@Entity(tableName = "student_notes")
data class StudentNote(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val title: String,
  val content: String,
  val moduleName: String = "عام",
  val createdAt: String = "اليوم",
  val colorHex: String = "#1B5E4B"
)

// 1. كتب ومراجع عامة للتخصص غير مرتبطة بأسبوع أو مقرر محدد
@Entity(tableName = "library_references")
data class LibraryReference(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val specialtyId: Long = 1,
  val title: String,
  val author: String,
  val category: String = "كتاب مرجعي", // كتاب مرجعي / معجم وقاموس / أطروحة / مقال علمي
  val description: String,
  val fileFormat: String = "PDF",
  val pageCount: Int = 250,
  val downloadUrl: String = "",
  val isSavedOffline: Boolean = true,
  val visibilityScope: String = "تخصص كامل"
)

// 2. التقويم الأكاديمي للجامعة والمؤسسة
@Entity(tableName = "academic_calendar_events")
data class AcademicCalendarEvent(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val title: String,
  val eventType: String = "محطة رسمية", // محطة رسمية / عطلة جامعية / فترة امتحانات / مداولات
  val startDate: String,
  val endDate: String = "",
  val description: String = "",
  val isCurrent: Boolean = false
)

// 3. سجل الحضور والغيابات الخاص بالطالب
@Entity(tableName = "attendance_records")
data class AttendanceRecord(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val moduleName: String,
  val sessionType: String = "أعمال موجهة TD", // أعمال موجهة TD / محاضرة / أعمال تطبيقية TP
  val date: String,
  val status: String = "غائب", // حاضر / غائب / مبرر
  val reason: String = "",
  val maxAllowedAbsences: Int = 3
)

// 4. تبليغات ومشاكل الطلاب المرسلة للممثل
@Entity(tableName = "student_issue_reports")
data class StudentIssueReport(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val studentName: String,
  val studentGroup: String,
  val itemType: String, // ملف تالف / خطأ في الجدول / موعد امتحان غير دقيق / أخرى
  val itemTitle: String,
  val description: String,
  val date: String,
  val status: String = "قيد المراجعة", // قيد المراجعة / تم الحل / مرفوض
  val representativeNote: String = ""
)

// 5. استطلاعات الرأي والتصويت الصفي
@Entity(tableName = "class_polls")
data class ClassPoll(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val creatorName: String,
  val question: String,
  val optionA: String,
  val votesA: Int = 0,
  val optionB: String,
  val votesB: Int = 0,
  val optionC: String = "",
  val votesC: Int = 0,
  val userVotedOption: String? = null,
  val targetGroup: String = "الفوج 03",
  val isClosed: Boolean = false,
  val createdAt: String = "اليوم"
)

// 6. قائمة مستخدمي النظام والإدارة والأفواج
@Entity(tableName = "app_users")
data class AppUser(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val fullName: String,
  val email: String,
  val studentId: String,
  val specialtyName: String,
  val yearName: String,
  val groupNumber: String,
  val role: String = "STUDENT", // STUDENT / REPRESENTATIVE / SPECIALTY_ADMIN / OWNER
  val representativeScope: String = "فوج واحد", // فوج واحد / سنة كاملة / تخصص كامل
  val assignedSpecialtyId: Long = 1,
  val scopeInstitutionId: Long? = null,
  val scopeSpecialtyId: Long? = null,
  val scopeAcademicYearId: Long? = null,
  val scopeCohortGroupId: Long? = null
)
