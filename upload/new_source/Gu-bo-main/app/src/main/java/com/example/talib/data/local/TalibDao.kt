package com.example.talib.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TalibDao {
  // Institutions
  @Query("SELECT * FROM institutions ORDER BY id ASC")
  fun getAllInstitutions(): Flow<List<Institution>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertInstitutions(institutions: List<Institution>)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertInstitution(institution: Institution): Long

  // Specialties
  @Query("SELECT * FROM specialties ORDER BY id ASC")
  fun getAllSpecialties(): Flow<List<Specialty>>

  @Query("SELECT * FROM specialties WHERE institutionId = :institutionId ORDER BY id ASC")
  fun getSpecialtiesForInstitution(institutionId: Long): Flow<List<Specialty>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertSpecialty(specialty: Specialty): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertSpecialties(specialties: List<Specialty>)

  @Delete
  suspend fun deleteSpecialty(specialty: Specialty)

  // Academic Years
  @Query("SELECT * FROM academic_years WHERE specialtyId = :specialtyId ORDER BY id ASC")
  fun getYearsForSpecialty(specialtyId: Long): Flow<List<AcademicYear>>

  @Query("SELECT * FROM academic_years ORDER BY id ASC")
  fun getAllAcademicYears(): Flow<List<AcademicYear>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAcademicYears(years: List<AcademicYear>)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAcademicYear(year: AcademicYear): Long

  // Academic Tracks (الملامح الأكاديمية)
  @Query("SELECT * FROM academic_tracks ORDER BY id ASC")
  fun getAllAcademicTracks(): Flow<List<AcademicTrack>>

  @Query("SELECT * FROM academic_tracks WHERE specialtyId = :specialtyId ORDER BY id ASC")
  fun getTracksForSpecialty(specialtyId: Long): Flow<List<AcademicTrack>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAcademicTracks(tracks: List<AcademicTrack>)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAcademicTrack(track: AcademicTrack): Long

  // Cohort Groups
  @Query("SELECT * FROM cohort_groups ORDER BY id ASC")
  fun getAllCohortGroups(): Flow<List<CohortGroup>>

  @Query("SELECT * FROM cohort_groups WHERE specialtyId = :specialtyId AND academicYearId = :yearId ORDER BY id ASC")
  fun getGroupsForSpecialtyAndYear(specialtyId: Long, yearId: Long): Flow<List<CohortGroup>>

  @Query("SELECT * FROM cohort_groups WHERE specialtyId = :specialtyId AND academicYearId = :yearId AND (:trackId IS NULL OR trackId = :trackId) ORDER BY id ASC")
  fun getGroupsForSpecialtyTrackAndYear(specialtyId: Long, trackId: Long?, yearId: Long): Flow<List<CohortGroup>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertCohortGroups(groups: List<CohortGroup>)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertCohortGroup(group: CohortGroup): Long

  // Modules
  @Query("SELECT * FROM modules ORDER BY id ASC")
  fun getAllModules(): Flow<List<ModuleCourse>>

  @Query("SELECT * FROM modules WHERE specialtyId = :specialtyId AND academicYearId = :yearId ORDER BY id ASC")
  fun getModulesForSpecialtyAndYear(specialtyId: Long, yearId: Long): Flow<List<ModuleCourse>>

  @Query("SELECT * FROM modules WHERE id = :id LIMIT 1")
  suspend fun getModuleById(id: Long): ModuleCourse?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertModule(module: ModuleCourse): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertModules(modules: List<ModuleCourse>)

  @Delete
  suspend fun deleteModule(module: ModuleCourse)

  // Lectures
  @Query("SELECT * FROM lectures ORDER BY weekNumber ASC, id ASC")
  fun getAllLectures(): Flow<List<Lecture>>

  @Query("SELECT * FROM lectures WHERE moduleId = :moduleId ORDER BY weekNumber ASC, id ASC")
  fun getLecturesForModule(moduleId: Long): Flow<List<Lecture>>

  @Query("SELECT * FROM lectures WHERE isBookmarked = 1")
  fun getBookmarkedLectures(): Flow<List<Lecture>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertLecture(lecture: Lecture): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertLectures(lectures: List<Lecture>)

  @Update
  suspend fun updateLecture(lecture: Lecture)

  @Delete
  suspend fun deleteLecture(lecture: Lecture)

  // Assignments
  @Query("SELECT * FROM assignments ORDER BY dueDate ASC")
  fun getAllAssignments(): Flow<List<Assignment>>

  @Query("SELECT * FROM assignments WHERE moduleId = :moduleId")
  fun getAssignmentsForModule(moduleId: Long): Flow<List<Assignment>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAssignment(assignment: Assignment): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAssignments(assignments: List<Assignment>)

  @Update
  suspend fun updateAssignment(assignment: Assignment)

  @Delete
  suspend fun deleteAssignment(assignment: Assignment)

  // Schedules
  @Query("SELECT * FROM schedules WHERE specialtyId = :specialtyId AND academicYearId = :yearId ORDER BY dayOfWeek ASC, startTime ASC")
  fun getScheduleForSpecialty(specialtyId: Long, yearId: Long): Flow<List<ScheduleItem>>

  @Query("SELECT * FROM schedules ORDER BY dayOfWeek ASC, startTime ASC")
  fun getAllScheduleItems(): Flow<List<ScheduleItem>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertScheduleItem(item: ScheduleItem): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertScheduleItems(items: List<ScheduleItem>)

  @Delete
  suspend fun deleteScheduleItem(item: ScheduleItem)

  // Exams
  @Query("SELECT * FROM exams ORDER BY examDate ASC, time ASC")
  fun getAllExams(): Flow<List<Exam>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertExam(exam: Exam): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertExams(exams: List<Exam>)

  @Update
  suspend fun updateExam(exam: Exam)

  @Delete
  suspend fun deleteExam(exam: Exam)

  // Grades
  @Query("SELECT * FROM grades ORDER BY id ASC")
  fun getAllGrades(): Flow<List<StudentGrade>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertGrade(grade: StudentGrade): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertGrades(grades: List<StudentGrade>)

  @Update
  suspend fun updateGrade(grade: StudentGrade)

  @Delete
  suspend fun deleteGrade(grade: StudentGrade)

  // Announcements
  @Query("SELECT * FROM announcements ORDER BY id DESC")
  fun getAllAnnouncements(): Flow<List<Announcement>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAnnouncement(announcement: Announcement): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAnnouncements(announcements: List<Announcement>)

  @Update
  suspend fun updateAnnouncement(announcement: Announcement)

  @Delete
  suspend fun deleteAnnouncement(announcement: Announcement)

  // Student Profile
  @Query("SELECT * FROM student_profiles WHERE id = 1 LIMIT 1")
  fun getStudentProfile(): Flow<StudentProfile?>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertStudentProfile(profile: StudentProfile)

  @Update
  suspend fun updateStudentProfile(profile: StudentProfile)

  // Offline Caching & Previously Viewed Materials
  @Query("SELECT * FROM lectures WHERE lastViewedTimestamp > 0 ORDER BY lastViewedTimestamp DESC")
  fun getPreviouslyViewedLectures(): Flow<List<Lecture>>

  @Query("SELECT * FROM modules WHERE lastViewedTimestamp > 0 ORDER BY lastViewedTimestamp DESC")
  fun getPreviouslyViewedModules(): Flow<List<ModuleCourse>>

  @Query("SELECT * FROM lectures WHERE isCachedOffline = 1 OR isDownloaded = 1 ORDER BY weekNumber ASC")
  fun getOfflineAvailableLectures(): Flow<List<Lecture>>

  @Query("SELECT * FROM cached_materials ORDER BY lastViewedTimestamp DESC")
  fun getAllCachedMaterials(): Flow<List<CachedCourseMaterial>>

  @Query("SELECT * FROM cached_materials WHERE moduleId = :moduleId ORDER BY weekNumber ASC")
  fun getCachedMaterialsForModule(moduleId: Long): Flow<List<CachedCourseMaterial>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertCachedMaterial(material: CachedCourseMaterial): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertCachedMaterials(materials: List<CachedCourseMaterial>)

  @Delete
  suspend fun deleteCachedMaterial(material: CachedCourseMaterial)

  @Query("DELETE FROM cached_materials")
  suspend fun clearAllCachedMaterials()

  @Query("UPDATE lectures SET lastViewedTimestamp = :timestamp, isCachedOffline = 1 WHERE id = :lectureId")
  suspend fun markLectureAsViewed(lectureId: Long, timestamp: Long)

  @Query("UPDATE modules SET lastViewedTimestamp = :timestamp, isCachedOffline = 1 WHERE id = :moduleId")
  suspend fun markModuleAsViewed(moduleId: Long, timestamp: Long)

  @Query("UPDATE cached_materials SET lastViewedTimestamp = :timestamp WHERE id = :materialId")
  suspend fun markCachedMaterialAsViewed(materialId: Long, timestamp: Long)

  // Notes
  @Query("SELECT * FROM student_notes ORDER BY id DESC")
  fun getAllNotes(): Flow<List<StudentNote>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertNote(note: StudentNote): Long

  @Delete
  suspend fun deleteNote(note: StudentNote)

  @Query("UPDATE lectures SET isRead = :isRead WHERE id = :lectureId")
  suspend fun updateLectureReadStatus(lectureId: Long, isRead: Boolean)

  @Query("UPDATE lectures SET isBookmarked = :isBookmarked WHERE id = :lectureId")
  suspend fun updateLectureBookmarkStatus(lectureId: Long, isBookmarked: Boolean)

  @Query("UPDATE lectures SET isDownloaded = :isDownloaded WHERE id = :lectureId")
  suspend fun updateLectureDownloadStatus(lectureId: Long, isDownloaded: Boolean)

  // 1. Library References (المكتبة والمراجع العامة)
  @Query("SELECT * FROM library_references ORDER BY id DESC")
  fun getAllLibraryReferences(): Flow<List<LibraryReference>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertLibraryReference(reference: LibraryReference): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertLibraryReferences(references: List<LibraryReference>)

  @Delete
  suspend fun deleteLibraryReference(reference: LibraryReference)

  // 2. Academic Calendar Events (التقويم الأكاديمي)
  @Query("SELECT * FROM academic_calendar_events ORDER BY id ASC")
  fun getAllCalendarEvents(): Flow<List<AcademicCalendarEvent>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertCalendarEvent(event: AcademicCalendarEvent): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertCalendarEvents(events: List<AcademicCalendarEvent>)

  @Delete
  suspend fun deleteCalendarEvent(event: AcademicCalendarEvent)

  // 3. Attendance Records (سجل الحضور والغياب)
  @Query("SELECT * FROM attendance_records ORDER BY id DESC")
  fun getAllAttendanceRecords(): Flow<List<AttendanceRecord>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAttendanceRecord(record: AttendanceRecord): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertAttendanceRecords(records: List<AttendanceRecord>)

  @Delete
  suspend fun deleteAttendanceRecord(record: AttendanceRecord)

  // 4. Student Issue Reports (التبليغات والشكاوى)
  @Query("SELECT * FROM student_issue_reports ORDER BY id DESC")
  fun getAllIssueReports(): Flow<List<StudentIssueReport>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertIssueReport(report: StudentIssueReport): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertIssueReports(reports: List<StudentIssueReport>)

  @Update
  suspend fun updateIssueReport(report: StudentIssueReport)

  @Delete
  suspend fun deleteIssueReport(report: StudentIssueReport)

  // 5. Class Polls (استطلاعات الرأي والتصويت)
  @Query("SELECT * FROM class_polls ORDER BY id DESC")
  fun getAllPolls(): Flow<List<ClassPoll>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertPoll(poll: ClassPoll): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertPolls(polls: List<ClassPoll>)

  @Update
  suspend fun updatePoll(poll: ClassPoll)

  @Delete
  suspend fun deletePoll(poll: ClassPoll)

  // 6. App Users & Role Management (المستخدمون والرتب)
  @Query("SELECT * FROM app_users ORDER BY id ASC")
  fun getAllUsers(): Flow<List<AppUser>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertUser(user: AppUser): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertUsers(users: List<AppUser>)

  @Update
  suspend fun updateUser(user: AppUser)

  @Delete
  suspend fun deleteUser(user: AppUser)
}
