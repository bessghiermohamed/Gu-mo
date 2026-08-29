package com.example.talib.data.supabase

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SupabaseSpecialtyDto(
  @SerialName("id") val id: Long? = null,
  @SerialName("name_ar") val nameAr: String,
  @SerialName("code") val code: String,
  @SerialName("icon_name") val iconName: String = "book",
  @SerialName("description") val description: String = "",
  @SerialName("institution") val institution: String = "المدرسة العليا للأساتذة - بوزريعة",
  @SerialName("faculty") val faculty: String = "قسم اللغة والأدب العربي"
)

@Serializable
data class SupabaseModuleDto(
  @SerialName("id") val id: Long? = null,
  @SerialName("institution_id") val institutionId: Long? = null,
  @SerialName("specialty_id") val specialtyId: Long,
  @SerialName("academic_year_id") val academicYearId: Long = 1,
  @SerialName("cohort_id") val cohortId: Long? = null,
  @SerialName("name") val name: String,
  @SerialName("code") val code: String,
  @SerialName("coefficient") val coefficient: Double = 2.0,
  @SerialName("credits") val credits: Int = 4,
  @SerialName("professor_name") val professorName: String = "",
  @SerialName("professor_email") val professorEmail: String = "",
  @SerialName("category") val category: String = "أساسي",
  @SerialName("description") val description: String = "",
  @SerialName("syllabus_topics") val syllabusTopics: String = "",
  @SerialName("visibility_scope") val visibilityScope: String = "تخصص كامل",
  @SerialName("target_group") val targetGroup: String = "الكل"
)

@Serializable
data class SupabaseLectureDto(
  @SerialName("id") val id: Long? = null,
  @SerialName("module_id") val moduleId: Long,
  @SerialName("institution_id") val institutionId: Long? = null,
  @SerialName("specialty_id") val specialtyId: Long? = null,
  @SerialName("academic_year_id") val academicYearId: Long? = null,
  @SerialName("cohort_id") val cohortId: Long? = null,
  @SerialName("week_number") val weekNumber: Int,
  @SerialName("title") val title: String,
  @SerialName("summary") val summary: String,
  @SerialName("pdf_file_name") val pdfFileName: String = "lecture_notes.pdf",
  @SerialName("pdf_url") val pdfUrl: String = "",
  @SerialName("duration_minutes") val durationMinutes: Int = 90,
  @SerialName("date") val date: String = "",
  @SerialName("cached_content_text") val cachedContentText: String = "",
  @SerialName("visibility_scope") val visibilityScope: String = "تخصص كامل",
  @SerialName("target_group") val targetGroup: String = "الكل",
  @SerialName("author_name") val authorName: String = "الممثل"
)

@Serializable
data class SupabaseAnnouncementDto(
  @SerialName("id") val id: Long? = null,
  @SerialName("institution_id") val institutionId: Long? = null,
  @SerialName("specialty_id") val specialtyId: Long? = null,
  @SerialName("academic_year_id") val academicYearId: Long? = null,
  @SerialName("cohort_id") val cohortId: Long? = null,
  @SerialName("title") val title: String,
  @SerialName("content") val content: String,
  @SerialName("author") val author: String,
  @SerialName("date") val date: String,
  @SerialName("urgency") val urgency: String = "عام",
  @SerialName("visibility_scope") val visibilityScope: String = "تخصص كامل",
  @SerialName("target_groups") val targetGroups: String = "الكل"
)

@Serializable
data class SupabaseScheduleDto(
  @SerialName("id") val id: Long? = null,
  @SerialName("institution_id") val institutionId: Long? = null,
  @SerialName("specialty_id") val specialtyId: Long,
  @SerialName("academic_year_id") val academicYearId: Long = 1,
  @SerialName("cohort_id") val cohortId: Long? = null,
  @SerialName("day_of_week") val dayOfWeek: Int,
  @SerialName("start_time") val startTime: String,
  @SerialName("end_time") val endTime: String,
  @SerialName("module_name") val moduleName: String,
  @SerialName("type") val type: String,
  @SerialName("room") val room: String,
  @SerialName("professor") val professor: String,
  @SerialName("visibility_scope") val visibilityScope: String = "تخصص كامل",
  @SerialName("target_group") val targetGroup: String = "الفوج 03"
)

@Serializable
data class SupabaseExamDto(
  @SerialName("id") val id: Long? = null,
  @SerialName("module_id") val moduleId: Long,
  @SerialName("institution_id") val institutionId: Long? = null,
  @SerialName("specialty_id") val specialtyId: Long? = null,
  @SerialName("academic_year_id") val academicYearId: Long? = null,
  @SerialName("cohort_id") val cohortId: Long? = null,
  @SerialName("module_name") val moduleName: String,
  @SerialName("title") val title: String,
  @SerialName("exam_date") val examDate: String,
  @SerialName("time") val time: String,
  @SerialName("room") val room: String,
  @SerialName("coefficient") val coefficient: Double = 2.0,
  @SerialName("is_finished") val isFinished: Boolean = false,
  @SerialName("visibility_scope") val visibilityScope: String = "تخصص كامل",
  @SerialName("target_group") val targetGroup: String = "الكل"
)

@Serializable
data class SupabaseAssignmentDto(
  @SerialName("id") val id: Long? = null,
  @SerialName("module_id") val moduleId: Long,
  @SerialName("title") val title: String,
  @SerialName("due_date") val dueDate: String,
  @SerialName("description") val description: String,
  @SerialName("max_score") val maxScore: Double = 20.0,
  @SerialName("visibility_scope") val visibilityScope: String = "تخصص كامل",
  @SerialName("target_group") val targetGroup: String = "الكل"
)
