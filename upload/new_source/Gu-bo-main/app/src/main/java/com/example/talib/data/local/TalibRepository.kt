package com.example.talib.data.local

import kotlinx.coroutines.flow.Flow

class TalibRepository(private val dao: TalibDao) {
  // Institutions
  val allInstitutions: Flow<List<Institution>> = dao.getAllInstitutions()
  suspend fun insertInstitution(institution: Institution) = dao.insertInstitution(institution)
  suspend fun insertInstitutions(institutions: List<Institution>) = dao.insertInstitutions(institutions)

  // Specialties
  val allSpecialties: Flow<List<Specialty>> = dao.getAllSpecialties()
  fun getSpecialtiesForInstitution(institutionId: Long): Flow<List<Specialty>> = dao.getSpecialtiesForInstitution(institutionId)
  suspend fun insertSpecialty(specialty: Specialty) = dao.insertSpecialty(specialty)
  suspend fun insertSpecialties(specialties: List<Specialty>) = dao.insertSpecialties(specialties)
  suspend fun deleteSpecialty(specialty: Specialty) = dao.deleteSpecialty(specialty)

  // Academic Years
  fun getYearsForSpecialty(specialtyId: Long): Flow<List<AcademicYear>> = dao.getYearsForSpecialty(specialtyId)
  val allAcademicYears: Flow<List<AcademicYear>> = dao.getAllAcademicYears()
  suspend fun insertAcademicYear(year: AcademicYear) = dao.insertAcademicYear(year)
  suspend fun insertAcademicYears(years: List<AcademicYear>) = dao.insertAcademicYears(years)

  // Academic Tracks
  val allAcademicTracks: Flow<List<AcademicTrack>> = dao.getAllAcademicTracks()
  fun getTracksForSpecialty(specialtyId: Long): Flow<List<AcademicTrack>> = dao.getTracksForSpecialty(specialtyId)
  suspend fun insertAcademicTracks(tracks: List<AcademicTrack>) = dao.insertAcademicTracks(tracks)
  suspend fun insertAcademicTrack(track: AcademicTrack) = dao.insertAcademicTrack(track)

  // Cohort Groups
  val allCohortGroups: Flow<List<CohortGroup>> = dao.getAllCohortGroups()
  fun getGroupsForSpecialtyAndYear(specialtyId: Long, yearId: Long): Flow<List<CohortGroup>> =
    dao.getGroupsForSpecialtyAndYear(specialtyId, yearId)
  fun getGroupsForSpecialtyTrackAndYear(specialtyId: Long, trackId: Long?, yearId: Long): Flow<List<CohortGroup>> =
    dao.getGroupsForSpecialtyTrackAndYear(specialtyId, trackId, yearId)
  suspend fun insertCohortGroups(groups: List<CohortGroup>) = dao.insertCohortGroups(groups)
  suspend fun insertCohortGroup(group: CohortGroup) = dao.insertCohortGroup(group)

  // Modules
  val allModules: Flow<List<ModuleCourse>> = dao.getAllModules()
  fun getModulesForSpecialtyAndYear(specialtyId: Long, yearId: Long): Flow<List<ModuleCourse>> =
    dao.getModulesForSpecialtyAndYear(specialtyId, yearId)
  suspend fun getModuleById(id: Long): ModuleCourse? = dao.getModuleById(id)
  suspend fun insertModule(module: ModuleCourse) = dao.insertModule(module)
  suspend fun insertModules(modules: List<ModuleCourse>) = dao.insertModules(modules)
  suspend fun deleteModule(module: ModuleCourse) = dao.deleteModule(module)

  // Lectures
  val allLectures: Flow<List<Lecture>> = dao.getAllLectures()
  fun getLecturesForModule(moduleId: Long): Flow<List<Lecture>> = dao.getLecturesForModule(moduleId)
  val bookmarkedLectures: Flow<List<Lecture>> = dao.getBookmarkedLectures()
  suspend fun insertLecture(lecture: Lecture) = dao.insertLecture(lecture)
  suspend fun insertLectures(lectures: List<Lecture>) = dao.insertLectures(lectures)
  suspend fun updateLecture(lecture: Lecture) = dao.updateLecture(lecture)
  suspend fun deleteLecture(lecture: Lecture) = dao.deleteLecture(lecture)

  // Assignments
  val allAssignments: Flow<List<Assignment>> = dao.getAllAssignments()
  fun getAssignmentsForModule(moduleId: Long): Flow<List<Assignment>> = dao.getAssignmentsForModule(moduleId)
  suspend fun insertAssignment(assignment: Assignment) = dao.insertAssignment(assignment)
  suspend fun insertAssignments(assignments: List<Assignment>) = dao.insertAssignments(assignments)
  suspend fun updateAssignment(assignment: Assignment) = dao.updateAssignment(assignment)
  suspend fun deleteAssignment(assignment: Assignment) = dao.deleteAssignment(assignment)

  // Schedules
  fun getScheduleForSpecialty(specialtyId: Long, yearId: Long): Flow<List<ScheduleItem>> =
    dao.getScheduleForSpecialty(specialtyId, yearId)
  val allScheduleItems: Flow<List<ScheduleItem>> = dao.getAllScheduleItems()
  suspend fun insertScheduleItem(item: ScheduleItem) = dao.insertScheduleItem(item)
  suspend fun insertScheduleItems(items: List<ScheduleItem>) = dao.insertScheduleItems(items)
  suspend fun deleteScheduleItem(item: ScheduleItem) = dao.deleteScheduleItem(item)

  // Exams
  val allExams: Flow<List<Exam>> = dao.getAllExams()
  suspend fun insertExam(exam: Exam) = dao.insertExam(exam)
  suspend fun insertExams(exams: List<Exam>) = dao.insertExams(exams)
  suspend fun updateExam(exam: Exam) = dao.updateExam(exam)
  suspend fun deleteExam(exam: Exam) = dao.deleteExam(exam)

  // Grades
  val allGrades: Flow<List<StudentGrade>> = dao.getAllGrades()
  suspend fun insertGrade(grade: StudentGrade) = dao.insertGrade(grade)
  suspend fun insertGrades(grades: List<StudentGrade>) = dao.insertGrades(grades)
  suspend fun updateGrade(grade: StudentGrade) = dao.updateGrade(grade)
  suspend fun deleteGrade(grade: StudentGrade) = dao.deleteGrade(grade)

  // Announcements
  val allAnnouncements: Flow<List<Announcement>> = dao.getAllAnnouncements()
  suspend fun insertAnnouncement(announcement: Announcement) = dao.insertAnnouncement(announcement)
  suspend fun insertAnnouncements(announcements: List<Announcement>) = dao.insertAnnouncements(announcements)
  suspend fun updateAnnouncement(announcement: Announcement) = dao.updateAnnouncement(announcement)
  suspend fun deleteAnnouncement(announcement: Announcement) = dao.deleteAnnouncement(announcement)

  // Student Profile
  val studentProfile: Flow<StudentProfile?> = dao.getStudentProfile()
  suspend fun updateStudentProfile(profile: StudentProfile) = dao.updateStudentProfile(profile)
  suspend fun insertStudentProfile(profile: StudentProfile) = dao.insertStudentProfile(profile)

  // Offline Caching & Previously Viewed Materials
  val previouslyViewedLectures: Flow<List<Lecture>> = dao.getPreviouslyViewedLectures()
  val previouslyViewedModules: Flow<List<ModuleCourse>> = dao.getPreviouslyViewedModules()
  val offlineAvailableLectures: Flow<List<Lecture>> = dao.getOfflineAvailableLectures()
  val allCachedMaterials: Flow<List<CachedCourseMaterial>> = dao.getAllCachedMaterials()
  fun getCachedMaterialsForModule(moduleId: Long): Flow<List<CachedCourseMaterial>> =
    dao.getCachedMaterialsForModule(moduleId)

  suspend fun markLectureAsViewed(lectureId: Long, timestamp: Long = System.currentTimeMillis()) =
    dao.markLectureAsViewed(lectureId, timestamp)

  suspend fun markModuleAsViewed(moduleId: Long, timestamp: Long = System.currentTimeMillis()) =
    dao.markModuleAsViewed(moduleId, timestamp)

  suspend fun markCachedMaterialAsViewed(materialId: Long, timestamp: Long = System.currentTimeMillis()) =
    dao.markCachedMaterialAsViewed(materialId, timestamp)

  suspend fun insertCachedMaterial(material: CachedCourseMaterial) = dao.insertCachedMaterial(material)
  suspend fun insertCachedMaterials(materials: List<CachedCourseMaterial>) = dao.insertCachedMaterials(materials)
  suspend fun deleteCachedMaterial(material: CachedCourseMaterial) = dao.deleteCachedMaterial(material)
  suspend fun clearAllCachedMaterials() = dao.clearAllCachedMaterials()

  // Student Notes (ملفاتي)
  val allNotes: Flow<List<StudentNote>> = dao.getAllNotes()
  suspend fun insertNote(note: StudentNote) = dao.insertNote(note)
  suspend fun deleteNote(note: StudentNote) = dao.deleteNote(note)

  // Status updates
  suspend fun updateLectureReadStatus(lectureId: Long, isRead: Boolean) =
    dao.updateLectureReadStatus(lectureId, isRead)

  suspend fun updateLectureBookmarkStatus(lectureId: Long, isBookmarked: Boolean) =
    dao.updateLectureBookmarkStatus(lectureId, isBookmarked)

  suspend fun updateLectureDownloadStatus(lectureId: Long, isDownloaded: Boolean) =
    dao.updateLectureDownloadStatus(lectureId, isDownloaded)

  // 1. Library References
  val allLibraryReferences: Flow<List<LibraryReference>> = dao.getAllLibraryReferences()
  suspend fun insertLibraryReference(reference: LibraryReference) = dao.insertLibraryReference(reference)
  suspend fun deleteLibraryReference(reference: LibraryReference) = dao.deleteLibraryReference(reference)

  // 2. Academic Calendar Events
  val allCalendarEvents: Flow<List<AcademicCalendarEvent>> = dao.getAllCalendarEvents()
  suspend fun insertCalendarEvent(event: AcademicCalendarEvent) = dao.insertCalendarEvent(event)
  suspend fun deleteCalendarEvent(event: AcademicCalendarEvent) = dao.deleteCalendarEvent(event)

  // 3. Attendance Records
  val allAttendanceRecords: Flow<List<AttendanceRecord>> = dao.getAllAttendanceRecords()
  suspend fun insertAttendanceRecord(record: AttendanceRecord) = dao.insertAttendanceRecord(record)
  suspend fun deleteAttendanceRecord(record: AttendanceRecord) = dao.deleteAttendanceRecord(record)

  // 4. Student Issue Reports
  val allIssueReports: Flow<List<StudentIssueReport>> = dao.getAllIssueReports()
  suspend fun insertIssueReport(report: StudentIssueReport) = dao.insertIssueReport(report)
  suspend fun updateIssueReport(report: StudentIssueReport) = dao.updateIssueReport(report)
  suspend fun deleteIssueReport(report: StudentIssueReport) = dao.deleteIssueReport(report)

  // 5. Class Polls
  val allPolls: Flow<List<ClassPoll>> = dao.getAllPolls()
  suspend fun insertPoll(poll: ClassPoll) = dao.insertPoll(poll)
  suspend fun updatePoll(poll: ClassPoll) = dao.updatePoll(poll)
  suspend fun deletePoll(poll: ClassPoll) = dao.deletePoll(poll)

  // 6. App Users & Roles
  val allUsers: Flow<List<AppUser>> = dao.getAllUsers()
  suspend fun insertUser(user: AppUser) = dao.insertUser(user)
  suspend fun updateUser(user: AppUser) = dao.updateUser(user)
  suspend fun deleteUser(user: AppUser) = dao.deleteUser(user)
}
