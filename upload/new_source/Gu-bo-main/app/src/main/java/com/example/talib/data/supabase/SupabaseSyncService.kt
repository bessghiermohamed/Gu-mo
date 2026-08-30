package com.example.talib.data.supabase

import android.content.Context
import android.util.Log
import com.example.talib.data.local.Announcement
import com.example.talib.data.local.Assignment
import com.example.talib.data.local.Exam
import com.example.talib.data.local.Lecture
import com.example.talib.data.local.ModuleCourse
import com.example.talib.data.local.ScheduleItem
import com.example.talib.data.local.Specialty
import com.example.talib.data.local.TalibDatabase
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

sealed class SupabaseSyncState {
  object Idle : SupabaseSyncState()
  object Syncing : SupabaseSyncState()
  data class Success(val message: String, val syncedCount: Int) : SupabaseSyncState()
  data class Error(val errorMessage: String) : SupabaseSyncState()
}

class SupabaseSyncService(
  private val dao: com.example.talib.data.local.TalibDao
) {
  private val TAG = "SupabaseSyncService"
  private val client = SupabaseClientProvider.client

  private val _syncState = MutableStateFlow<SupabaseSyncState>(SupabaseSyncState.Idle)
  val syncState: StateFlow<SupabaseSyncState> = _syncState.asStateFlow()

  /**
   * Test current Supabase connectivity by doing a lightweight query
   */
  suspend fun testConnection(): Result<String> = withContext(Dispatchers.IO) {
    try {
      val modules = client.postgrest.from("modules").select {
        limit(1)
      }.decodeList<SupabaseModuleDto>()
      Result.success("تم الاتصال بـ Supabase بنجاح! وجد ${modules.size} سجلات.")
    } catch (e: Exception) {
      Log.w(TAG, "Test connection result: ${e.localizedMessage}")
      // If table is not yet created, the endpoint responded which still indicates connectivity
      if (e.message?.contains("relation") == true || e.message?.contains("does not exist") == true) {
        Result.success("تم الاتصال بـ Supabase بنجاح (الجداول قيد الإعداد في لوحة التحكم).")
      } else {
        Result.failure(e)
      }
    }
  }

  /**
   * Pull data from Supabase tables into local Room database
   */
  suspend fun pullDataFromSupabase(): Result<Int> = withContext(Dispatchers.IO) {
    _syncState.value = SupabaseSyncState.Syncing
    var totalCount = 0
    try {
      // 1. Fetch Modules
      try {
        val remoteModules = client.postgrest.from("modules").select().decodeList<SupabaseModuleDto>()
        if (remoteModules.isNotEmpty()) {
          val localModules = remoteModules.map { dto ->
            ModuleCourse(
              id = dto.id ?: 0L,
              specialtyId = dto.specialtyId,
              academicYearId = dto.academicYearId,
              name = dto.name,
              code = dto.code,
              coefficient = dto.coefficient,
              credits = dto.credits,
              professorName = dto.professorName,
              professorEmail = dto.professorEmail,
              category = dto.category,
              description = dto.description,
              syllabusTopics = dto.syllabusTopics,
              visibilityScope = dto.visibilityScope,
              targetGroup = dto.targetGroup
            )
          }
          dao.insertModules(localModules)
          totalCount += localModules.size
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to pull modules: ${e.message}")
      }

      // 2. Fetch Lectures
      try {
        val remoteLectures = client.postgrest.from("lectures").select().decodeList<SupabaseLectureDto>()
        if (remoteLectures.isNotEmpty()) {
          val localLectures = remoteLectures.map { dto ->
            Lecture(
              id = dto.id ?: 0L,
              moduleId = dto.moduleId,
              weekNumber = dto.weekNumber,
              title = dto.title,
              summary = dto.summary,
              pdfFileName = dto.pdfFileName,
              pdfUrl = dto.pdfUrl,
              durationMinutes = dto.durationMinutes,
              date = dto.date,
              cachedContentText = dto.cachedContentText,
              visibilityScope = dto.visibilityScope,
              targetGroup = dto.targetGroup,
              authorName = dto.authorName
            )
          }
          dao.insertLectures(localLectures)
          totalCount += localLectures.size
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to pull lectures: ${e.message}")
      }

      // 3. Fetch Announcements
      try {
        val remoteAnnouncements = client.postgrest.from("announcements").select().decodeList<SupabaseAnnouncementDto>()
        if (remoteAnnouncements.isNotEmpty()) {
          val localAnnouncements = remoteAnnouncements.map { dto ->
            Announcement(
              id = dto.id ?: 0L,
              title = dto.title,
              content = dto.content,
              author = dto.author,
              date = dto.date,
              urgency = dto.urgency,
              specialtyId = dto.specialtyId,
              visibilityScope = dto.visibilityScope,
              targetGroups = dto.targetGroups
            )
          }
          dao.insertAnnouncements(localAnnouncements)
          totalCount += localAnnouncements.size
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to pull announcements: ${e.message}")
      }

      // 4. Fetch Schedules
      try {
        val remoteSchedules = client.postgrest.from("schedules").select().decodeList<SupabaseScheduleDto>()
        if (remoteSchedules.isNotEmpty()) {
          val localSchedules = remoteSchedules.map { dto ->
            ScheduleItem(
              id = dto.id ?: 0L,
              specialtyId = dto.specialtyId,
              academicYearId = dto.academicYearId,
              dayOfWeek = dto.dayOfWeek,
              startTime = dto.startTime,
              endTime = dto.endTime,
              moduleName = dto.moduleName,
              type = dto.type,
              room = dto.room,
              professor = dto.professor,
              visibilityScope = dto.visibilityScope,
              targetGroup = dto.targetGroup
            )
          }
          dao.insertScheduleItems(localSchedules)
          totalCount += localSchedules.size
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to pull schedules: ${e.message}")
      }

      // 5. Fetch Exams
      try {
        val remoteExams = client.postgrest.from("exams").select().decodeList<SupabaseExamDto>()
        if (remoteExams.isNotEmpty()) {
          val localExams = remoteExams.map { dto ->
            Exam(
              id = dto.id ?: 0L,
              moduleId = dto.moduleId,
              moduleName = dto.moduleName,
              title = dto.title,
              examDate = dto.examDate,
              time = dto.time,
              room = dto.room,
              coefficient = dto.coefficient,
              isFinished = dto.isFinished,
              visibilityScope = dto.visibilityScope,
              targetGroup = dto.targetGroup
            )
          }
          dao.insertExams(localExams)
          totalCount += localExams.size
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to pull exams: ${e.message}")
      }

      _syncState.value = SupabaseSyncState.Success("تمت المزامنة السحابية بنجاح ($totalCount عنصر)", totalCount)
      Result.success(totalCount)
    } catch (e: Exception) {
      val err = "خطأ في المزامنة مع Supabase: ${e.localizedMessage}"
      _syncState.value = SupabaseSyncState.Error(err)
      Result.failure(e)
    }
  }

  /**
   * Push newly created announcement to Supabase
   */
  suspend fun pushAnnouncement(announcement: Announcement): Result<Boolean> = withContext(Dispatchers.IO) {
    try {
      val dto = SupabaseAnnouncementDto(
        title = announcement.title,
        content = announcement.content,
        author = announcement.author,
        date = announcement.date,
        urgency = announcement.urgency,
        specialtyId = announcement.specialtyId,
        visibilityScope = announcement.visibilityScope,
        targetGroups = announcement.targetGroups
      )
      client.postgrest.from("announcements").insert(dto)
      Result.success(true)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to push announcement: ${e.message}")
      Result.failure(e)
    }
  }

  /**
   * Push newly added lecture to Supabase
   */
  suspend fun pushLecture(lecture: Lecture): Result<Boolean> = withContext(Dispatchers.IO) {
    try {
      val dto = SupabaseLectureDto(
        moduleId = lecture.moduleId,
        weekNumber = lecture.weekNumber,
        title = lecture.title,
        summary = lecture.summary,
        pdfFileName = lecture.pdfFileName,
        pdfUrl = lecture.pdfUrl,
        durationMinutes = lecture.durationMinutes,
        date = lecture.date,
        cachedContentText = lecture.cachedContentText,
        visibilityScope = lecture.visibilityScope,
        targetGroup = lecture.targetGroup,
        authorName = lecture.authorName
      )
      client.postgrest.from("lectures").insert(dto)
      Result.success(true)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to push lecture: ${e.message}")
      Result.failure(e)
    }
  }

  companion object {
    const val SUPABASE_SCHEMA_SQL = """
-- Supabase Schema for Talib Academic App (SQL)
-- Updated with integer foreign keys / IDs for precise hierarchical scoping

create table if not exists institutions (
  id bigint primary key generated always as identity,
  name text not null,
  code text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists specialties (
  id bigint primary key generated always as identity,
  institution_id bigint references institutions(id),
  name_ar text not null,
  code text not null,
  icon_name text default 'book',
  description text default '',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists academic_years (
  id bigint primary key generated always as identity,
  specialty_id bigint references specialties(id),
  year_name text not null,
  semester int default 1
);

create table if not exists cohorts (
  id bigint primary key generated always as identity,
  year_id bigint references academic_years(id),
  name text not null -- e.g. "الفوج 01", "الفوج 02"
);

create table if not exists modules (
  id bigint primary key generated always as identity,
  institution_id bigint,
  specialty_id bigint not null default 1,
  academic_year_id bigint not null default 1,
  cohort_id bigint,
  name text not null,
  code text not null,
  coefficient double precision default 2.0,
  credits int default 4,
  professor_name text default '',
  professor_email text default '',
  category text default 'أساسي',
  description text default '',
  syllabus_topics text default '',
  visibility_scope text default 'تخصص كامل',
  target_group text default 'الكل',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists lectures (
  id bigint primary key generated always as identity,
  module_id bigint not null,
  institution_id bigint,
  specialty_id bigint,
  academic_year_id bigint,
  cohort_id bigint,
  week_number int default 1,
  title text not null,
  summary text default '',
  pdf_file_name text default 'lecture.pdf',
  pdf_url text default '',
  duration_minutes int default 90,
  date text default '',
  cached_content_text text default '',
  visibility_scope text default 'تخصص كامل',
  target_group text default 'الكل',
  author_name text default 'الممثل',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists announcements (
  id bigint primary key generated always as identity,
  institution_id bigint,
  specialty_id bigint default 1,
  academic_year_id bigint,
  cohort_id bigint,
  title text not null,
  content text not null,
  author text default 'الإدارة',
  date text default '',
  urgency text default 'عام',
  visibility_scope text default 'تخصص كامل',
  target_groups text default 'الكل',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists schedules (
  id bigint primary key generated always as identity,
  institution_id bigint,
  specialty_id bigint default 1,
  academic_year_id bigint default 1,
  cohort_id bigint,
  day_of_week int not null,
  start_time text not null,
  end_time text not null,
  module_name text not null,
  type text default 'محاضرة',
  room text default '',
  professor text default '',
  visibility_scope text default 'تخصص كامل',
  target_group text default 'الفوج 03'
);

create table if not exists exams (
  id bigint primary key generated always as identity,
  module_id bigint default 1,
  institution_id bigint,
  specialty_id bigint,
  academic_year_id bigint,
  cohort_id bigint,
  module_name text not null,
  title text not null,
  exam_date text not null,
  time text default '09:00',
  room text default '',
  coefficient double precision default 2.0,
  is_finished boolean default false,
  visibility_scope text default 'تخصص كامل',
  target_group text default 'الكل'
);
"""
  }

  /**
   * Upload actual PDF file to Supabase Storage bucket 'lectures'
   * Returns public download URL on success
   */
  suspend fun uploadLecturePdf(fileName: String, byteArray: ByteArray): Result<String> = withContext(Dispatchers.IO) {
    try {
      val bucket = client.storage.from("lectures")
      val safeFileName = "${System.currentTimeMillis()}_${fileName.replace(" ", "_")}"
      bucket.upload(safeFileName, byteArray) {
        upsert = true
      }
      val publicUrl = bucket.publicUrl(safeFileName)
      Result.success(publicUrl)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to upload PDF to Supabase Storage: ${e.message}")
      Result.failure(e)
    }
  }

  /**
   * Supabase Auth: Sign in with email and password
   */
  suspend fun signInWithEmail(email: String, pass: String): Result<String> = withContext(Dispatchers.IO) {
    try {
      client.auth.signInWith(Email) {
        this.email = email
        this.password = pass
      }
      Result.success("تم تسجيل الدخول السحابي بنجاح")
    } catch (e: Exception) {
      Log.w(TAG, "Supabase sign in notice: ${e.message}")
      // Allow seamless offline login if local credentials match or network is unavailable
      Result.failure(e)
    }
  }

  /**
   * Supabase Auth: Sign up new student account
   */
  suspend fun signUpWithEmail(email: String, pass: String): Result<String> = withContext(Dispatchers.IO) {
    try {
      client.auth.signUpWith(Email) {
        this.email = email
        this.password = pass
      }
      Result.success("تم إنشاء الحساب السحابي بنجاح")
    } catch (e: Exception) {
      Log.w(TAG, "Supabase sign up notice: ${e.message}")
      Result.failure(e)
    }
  }

  /**
   * Supabase Auth: Sign out
   */
  suspend fun signOut(): Result<Unit> = withContext(Dispatchers.IO) {
    try {
      client.auth.signOut()
      Result.success(Unit)
    } catch (e: Exception) {
      Log.w(TAG, "Supabase sign out notice: ${e.message}")
      Result.success(Unit)
    }
  }
}
