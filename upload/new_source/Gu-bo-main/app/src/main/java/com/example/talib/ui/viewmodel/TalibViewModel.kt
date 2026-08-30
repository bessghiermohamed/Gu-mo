package com.example.talib.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.talib.data.local.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalCoroutinesApi::class)
class TalibViewModel(application: Application) : AndroidViewModel(application) {
  private val repository: TalibRepository
  private val supabaseSyncService: com.example.talib.data.supabase.SupabaseSyncService

  init {
    val db = TalibDatabase.getDatabase(application, viewModelScope)
    val dao = db.talibDao()
    repository = TalibRepository(dao)
    supabaseSyncService = com.example.talib.data.supabase.SupabaseSyncService(dao)
  }

  val supabaseSyncState = supabaseSyncService.syncState

  private val _supabaseConnectionStatus = MutableStateFlow<String?>(null)
  val supabaseConnectionStatus: StateFlow<String?> = _supabaseConnectionStatus.asStateFlow()

  fun testSupabaseConnection() {
    viewModelScope.launch {
      _supabaseConnectionStatus.value = "جاري اختبار الاتصال بـ Supabase..."
      val result = supabaseSyncService.testConnection()
      if (result.isSuccess) {
        _supabaseConnectionStatus.value = result.getOrNull() ?: "تم الاتصال بنجاح!"
      } else {
        _supabaseConnectionStatus.value = "فشل الاتصال: ${result.exceptionOrNull()?.localizedMessage}"
      }
    }
  }

  fun syncWithSupabase() {
    viewModelScope.launch {
      _supabaseConnectionStatus.value = "جاري المزامنة مع Supabase..."
      val res = supabaseSyncService.pullDataFromSupabase()
      if (res.isSuccess) {
        _supabaseConnectionStatus.value = "تمت المزامنة بنجاح! تم تحديث ${res.getOrNull()} عناصر سحابية."
      } else {
        _supabaseConnectionStatus.value = "خطأ في المزامنة: ${res.exceptionOrNull()?.localizedMessage}"
      }
    }
  }

  // UI Theme state
  private val _isDarkMode = MutableStateFlow(false)
  val isDarkMode: StateFlow<Boolean> = _isDarkMode.asStateFlow()

  fun toggleTheme() {
    _isDarkMode.value = !_isDarkMode.value
  }

  // Academic Emerald & Cream vs Modern Violet Palette
  private val _isAcademicTheme = MutableStateFlow(true)
  val isAcademicTheme: StateFlow<Boolean> = _isAcademicTheme.asStateFlow()

  fun toggleThemePalette() {
    _isAcademicTheme.value = !_isAcademicTheme.value
  }

  // Search Query for Courses
  private val _searchQuery = MutableStateFlow("")
  val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

  fun updateSearchQuery(query: String) {
    _searchQuery.value = query
  }

  // Schedule selected day
  private val _selectedScheduleDay = MutableStateFlow(1) // 1=الأحد
  val selectedScheduleDay: StateFlow<Int> = _selectedScheduleDay.asStateFlow()

  fun selectScheduleDay(day: Int) {
    _selectedScheduleDay.value = day
  }

  // Active PDF Viewer state
  private val _activePdfLecture = MutableStateFlow<Lecture?>(null)
  val activePdfLecture: StateFlow<Lecture?> = _activePdfLecture.asStateFlow()

  fun openPdfViewer(lecture: Lecture) {
    _activePdfLecture.value = lecture
    markLectureAsViewed(lecture.id)
  }

  fun closePdfViewer() {
    _activePdfLecture.value = null
  }

  // Active Cached Material Reader
  private val _selectedCachedMaterial = MutableStateFlow<CachedCourseMaterial?>(null)
  val selectedCachedMaterial: StateFlow<CachedCourseMaterial?> = _selectedCachedMaterial.asStateFlow()

  fun openCachedMaterial(material: CachedCourseMaterial) {
    _selectedCachedMaterial.value = material
  }

  fun closeCachedMaterial() {
    _selectedCachedMaterial.value = null
  }

  // Student Notes (ملفاتي)
  val allNotes: StateFlow<List<StudentNote>> = repository.allNotes
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun addNote(title: String, content: String, moduleName: String = "عام", colorHex: String = "#1B5E4B") {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertNote(
        StudentNote(
          title = title,
          content = content,
          moduleName = moduleName,
          createdAt = "اليوم",
          colorHex = colorHex
        )
      )
    }
  }

  fun deleteNote(note: StudentNote) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteNote(note)
    }
  }

  // Global Loading State
  private val _isLoading = MutableStateFlow(false)
  val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

  private val _loadingMessage = MutableStateFlow<String?>("جاري معالجة البيانات...")
  val loadingMessage: StateFlow<String?> = _loadingMessage.asStateFlow()

  fun setLoading(loading: Boolean, message: String? = null) {
    _loadingMessage.value = message ?: "جاري معالجة الطلب..."
    _isLoading.value = loading
  }

  fun refreshCourseContent(message: String = "جاري مزامنة المحتوى الأكاديمي...") {
    viewModelScope.launch {
      _loadingMessage.value = message
      _isLoading.value = true
      kotlinx.coroutines.delay(800)
      _isLoading.value = false
    }
  }

  // Active Navigation Screen
  private val _currentScreen = MutableStateFlow(ScreenRoute.HOME)
  val currentScreen: StateFlow<ScreenRoute> = _currentScreen.asStateFlow()

  fun navigateTo(screen: ScreenRoute) {
    _currentScreen.value = screen
  }

  fun navigateBack() {
    _currentScreen.value = ScreenRoute.HOME
  }

  // Student Profile
  val studentProfile: StateFlow<StudentProfile?> = repository.studentProfile
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

  // Higher Education Institutions
  val allInstitutions: StateFlow<List<Institution>> = repository.allInstitutions
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // Specialties
  val specialties: StateFlow<List<Specialty>> = repository.allSpecialties
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val allSpecialties: StateFlow<List<Specialty>> = repository.allSpecialties
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // All Academic Years
  val allAcademicYears: StateFlow<List<AcademicYear>> = repository.allAcademicYears
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // All Academic Tracks (التعليم الابتدائي / المتوسط / الثانوي / عام)
  val allAcademicTracks: StateFlow<List<AcademicTrack>> = repository.allAcademicTracks
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // All Cohort Groups
  val allCohortGroups: StateFlow<List<CohortGroup>> = repository.allCohortGroups
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // Selected Specialty ID & Year ID
  private val _selectedSpecialtyId = MutableStateFlow<Long>(1)
  val selectedSpecialtyId: StateFlow<Long> = _selectedSpecialtyId.asStateFlow()

  private val _selectedYearId = MutableStateFlow<Long>(2)
  val selectedYearId: StateFlow<Long> = _selectedYearId.asStateFlow()

  fun selectSpecialty(specialtyId: Long) {
    if (_selectedSpecialtyId.value != specialtyId) {
      _selectedSpecialtyId.value = specialtyId
      refreshCourseContent("جاري تحميل بيانات التخصص...")
    }
  }

  fun selectYear(yearId: Long) {
    if (_selectedYearId.value != yearId) {
      _selectedYearId.value = yearId
      refreshCourseContent("جاري تحميل مقررات السنة...")
    }
  }

  // Academic Years for chosen specialty
  val academicYearsForSpecialty: StateFlow<List<AcademicYear>> = _selectedSpecialtyId
    .flatMapLatest { specId -> repository.getYearsForSpecialty(specId) }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // Modules for student closed track
  val currentModules: StateFlow<List<ModuleCourse>> = combine(
    _selectedSpecialtyId,
    _selectedYearId
  ) { specId, yrId ->
    Pair(specId, yrId)
  }.flatMapLatest { (specId, yrId) ->
    repository.getModulesForSpecialtyAndYear(specId, yrId)
  }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val allModules: StateFlow<List<ModuleCourse>> = repository.allModules
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  private val _selectedModule = MutableStateFlow<ModuleCourse?>(null)
  val selectedModule: StateFlow<ModuleCourse?> = _selectedModule.asStateFlow()

  fun selectModule(module: ModuleCourse?) {
    _selectedModule.value = module
  }

  // Lectures
  val allLectures: StateFlow<List<Lecture>> = repository.allLectures
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val moduleLectures: StateFlow<List<Lecture>> = _selectedModule
    .flatMapLatest { module ->
      if (module != null) {
        repository.getLecturesForModule(module.id)
      } else {
        repository.allLectures
      }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val bookmarkedLectures: StateFlow<List<Lecture>> = repository.bookmarkedLectures
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // Offline Caching
  val previouslyViewedLectures: StateFlow<List<Lecture>> = repository.previouslyViewedLectures
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val previouslyViewedModules: StateFlow<List<ModuleCourse>> = repository.previouslyViewedModules
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val offlineAvailableLectures: StateFlow<List<Lecture>> = repository.offlineAvailableLectures
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val allCachedMaterials: StateFlow<List<CachedCourseMaterial>> = repository.allCachedMaterials
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  private val _isOfflineMode = MutableStateFlow(false)
  val isOfflineMode: StateFlow<Boolean> = _isOfflineMode.asStateFlow()

  fun toggleOfflineMode() {
    _isOfflineMode.value = !_isOfflineMode.value
  }

  fun recordModuleViewed(moduleId: Long) {
    markModuleAsViewed(moduleId)
  }

  fun markLectureAsViewed(lectureId: Long) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.markLectureAsViewed(lectureId)
    }
  }

  fun markModuleAsViewed(moduleId: Long) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.markModuleAsViewed(moduleId)
    }
  }

  fun cacheCourseContentForOffline(module: ModuleCourse) {
    viewModelScope.launch(Dispatchers.IO) {
      val cached = CachedCourseMaterial(
        moduleId = module.id,
        moduleName = module.name,
        title = "مقرر ${module.name} الكامل",
        materialType = "مقرر شامل",
        summary = module.description,
        fullText = "المحتوى الأكاديمي لمقياس ${module.name} تحت إشراف الأستاذ: ${module.professorName}. المعامل: ${module.coefficient}، الرصيد: ${module.credits}.",
        keyConcepts = "محاضرات، ملخصات، مراجع، تمارين تطبيقية",
        cachedDate = "محفوظ في الذاكرة",
        lastViewedTimestamp = System.currentTimeMillis()
      )
      repository.insertCachedMaterial(cached)
    }
  }

  fun saveMaterialOffline(
    moduleId: Long,
    moduleName: String,
    title: String,
    type: String,
    summary: String,
    fullText: String,
    keyConcepts: String = ""
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      val cached = CachedCourseMaterial(
        moduleId = moduleId,
        moduleName = moduleName,
        title = title,
        materialType = type,
        summary = summary,
        fullText = fullText,
        keyConcepts = keyConcepts,
        cachedDate = "تم الحفظ محلياً",
        lastViewedTimestamp = System.currentTimeMillis()
      )
      repository.insertCachedMaterial(cached)
    }
  }

  fun deleteCachedMaterial(material: CachedCourseMaterial) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteCachedMaterial(material)
    }
  }

  fun clearAllCachedMaterials() {
    viewModelScope.launch(Dispatchers.IO) {
      repository.clearAllCachedMaterials()
    }
  }

  fun toggleBookmark(lecture: Lecture) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateLectureBookmarkStatus(lecture.id, !lecture.isBookmarked)
    }
  }

  fun toggleRead(lecture: Lecture) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateLectureReadStatus(lecture.id, !lecture.isRead)
    }
  }

  fun toggleLectureRead(lecture: Lecture) {
    toggleRead(lecture)
  }

  fun toggleDownloaded(lecture: Lecture) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateLectureDownloadStatus(lecture.id, !lecture.isDownloaded)
    }
  }

  // Assignments
  val allAssignments: StateFlow<List<Assignment>> = repository.allAssignments
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun toggleAssignment(assignment: Assignment) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateAssignment(assignment.copy(isCompleted = !assignment.isCompleted))
    }
  }

  // Schedules
  val currentSchedule: StateFlow<List<ScheduleItem>> = combine(
    _selectedSpecialtyId,
    _selectedYearId
  ) { specId, yrId ->
    Pair(specId, yrId)
  }.flatMapLatest { (specId, yrId) ->
    repository.getScheduleForSpecialty(specId, yrId)
  }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val allScheduleItems: StateFlow<List<ScheduleItem>> = repository.allScheduleItems
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // Exams
  val allExams: StateFlow<List<Exam>> = repository.allExams
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  // Grades & GPA Calculation
  val allGrades: StateFlow<List<StudentGrade>> = repository.allGrades
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  val calculatedGPA: StateFlow<Double> = allGrades.map { gradesList ->
    if (gradesList.isEmpty()) 0.0
    else {
      var totalCoeff = 0.0
      var weightedSum = 0.0
      gradesList.forEach { g ->
        val modAvg = (g.continuousScore * 0.4) + (g.examScore * 0.6)
        weightedSum += (modAvg * g.coefficient)
        totalCoeff += g.coefficient
      }
      if (totalCoeff > 0) Math.round((weightedSum / totalCoeff) * 100.0) / 100.0 else 0.0
    }
  }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

  fun addGrade(
    moduleId: Long,
    moduleName: String,
    continuousScore: Double,
    examScore: Double,
    coefficient: Double,
    credits: Int
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertGrade(
        StudentGrade(
          moduleId = moduleId,
          moduleName = moduleName,
          continuousScore = continuousScore,
          examScore = examScore,
          coefficient = coefficient,
          credits = credits,
          isOfficial = false
        )
      )
    }
  }

  fun updateGrade(grade: StudentGrade) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateGrade(grade)
    }
  }

  fun updateGradeScore(grade: StudentGrade, continuous: Double, exam: Double) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateGrade(grade.copy(continuousScore = continuous, examScore = exam))
    }
  }

  fun toggleGradeOfficial(grade: StudentGrade) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateGrade(grade.copy(isOfficial = !grade.isOfficial))
    }
  }

  fun updateGradeTarget(grade: StudentGrade, target: Double) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateGrade(grade.copy(targetScore = target))
    }
  }

  fun deleteGrade(grade: StudentGrade) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteGrade(grade)
    }
  }

  // Announcements
  val allAnnouncements: StateFlow<List<Announcement>> = repository.allAnnouncements
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun toggleAnnouncementRead(announcement: Announcement) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateAnnouncement(announcement.copy(isRead = !announcement.isRead))
    }
  }

  // 1. Library References (المكتبة والمراجع العامة)
  val allLibraryReferences: StateFlow<List<LibraryReference>> = repository.allLibraryReferences
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun addLibraryReference(
    title: String,
    author: String,
    category: String,
    description: String,
    pageCount: Int = 200,
    visibilityScope: String = "تخصص كامل"
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertLibraryReference(
        LibraryReference(
          specialtyId = _selectedSpecialtyId.value,
          title = title,
          author = author,
          category = category,
          description = description,
          pageCount = pageCount,
          visibilityScope = visibilityScope
        )
      )
    }
  }

  fun deleteLibraryReference(reference: LibraryReference) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteLibraryReference(reference)
    }
  }

  // 2. Academic Calendar Events (التقويم الأكاديمي)
  val allCalendarEvents: StateFlow<List<AcademicCalendarEvent>> = repository.allCalendarEvents
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun addCalendarEvent(
    title: String,
    eventType: String,
    startDate: String,
    endDate: String,
    description: String
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertCalendarEvent(
        AcademicCalendarEvent(
          title = title,
          eventType = eventType,
          startDate = startDate,
          endDate = endDate,
          description = description
        )
      )
    }
  }

  fun deleteCalendarEvent(event: AcademicCalendarEvent) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteCalendarEvent(event)
    }
  }

  // 3. Attendance Records (سجل الحضور والغيابات)
  val allAttendanceRecords: StateFlow<List<AttendanceRecord>> = repository.allAttendanceRecords
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun recordAttendance(
    moduleName: String,
    sessionType: String,
    date: String,
    status: String,
    reason: String = "",
    maxAllowed: Int = 3
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertAttendanceRecord(
        AttendanceRecord(
          moduleName = moduleName,
          sessionType = sessionType,
          date = date,
          status = status,
          reason = reason,
          maxAllowedAbsences = maxAllowed
        )
      )
    }
  }

  fun deleteAttendanceRecord(record: AttendanceRecord) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteAttendanceRecord(record)
    }
  }

  // 4. Student Issue Reports (التبليغات)
  val allIssueReports: StateFlow<List<StudentIssueReport>> = repository.allIssueReports
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun reportIssue(
    itemType: String,
    itemTitle: String,
    description: String
  ) {
    val prof = studentProfile.value
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertIssueReport(
        StudentIssueReport(
          studentName = prof?.fullName ?: "طالب",
          studentGroup = prof?.groupNumber ?: "الفوج 03",
          itemType = itemType,
          itemTitle = itemTitle,
          description = description,
          date = "اليوم",
          status = "قيد المراجعة"
        )
      )
    }
  }

  fun updateIssueReportStatus(report: StudentIssueReport, newStatus: String, note: String = "") {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateIssueReport(
        report.copy(status = newStatus, representativeNote = note)
      )
    }
  }

  fun deleteIssueReport(report: StudentIssueReport) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteIssueReport(report)
    }
  }

  // 5. Class Polls (استطلاعات الرأي)
  val allPolls: StateFlow<List<ClassPoll>> = repository.allPolls
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun createPoll(
    question: String,
    optionA: String,
    optionB: String,
    optionC: String = "",
    targetGroup: String = "الفوج 03"
  ) {
    val prof = studentProfile.value
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertPoll(
        ClassPoll(
          creatorName = "${prof?.userRole ?: "طالب"}: ${prof?.fullName ?: "أمين"}",
          question = question,
          optionA = optionA,
          optionB = optionB,
          optionC = optionC,
          targetGroup = targetGroup,
          createdAt = "اليوم"
        )
      )
    }
  }

  fun voteOnPoll(poll: ClassPoll, selectedOption: String) {
    if (poll.userVotedOption != null) return // Already voted
    viewModelScope.launch(Dispatchers.IO) {
      val updated = when (selectedOption) {
        poll.optionA -> poll.copy(votesA = poll.votesA + 1, userVotedOption = selectedOption)
        poll.optionB -> poll.copy(votesB = poll.votesB + 1, userVotedOption = selectedOption)
        poll.optionC -> poll.copy(votesC = poll.votesC + 1, userVotedOption = selectedOption)
        else -> poll
      }
      repository.updatePoll(updated)
    }
  }

  fun deletePoll(poll: ClassPoll) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deletePoll(poll)
    }
  }

  // 6. App Users & Role Management (المالك ومسؤول التخصص والممثلين)
  val allUsers: StateFlow<List<AppUser>> = repository.allUsers
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

  fun updateUserRole(
    userId: Long,
    newRole: String,
    scopeAssignment: ScopeAssignment? = null
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      val users = repository.allUsers.first()
      val target = users.find { it.id == userId }
      if (target != null) {
        val updatedUser = target.copy(
          role = newRole,
          scopeInstitutionId = scopeAssignment?.institutionId,
          scopeSpecialtyId = scopeAssignment?.specialtyId,
          scopeTrackId = scopeAssignment?.trackId,
          scopeAcademicYearId = scopeAssignment?.yearId,
          scopeCohortGroupId = scopeAssignment?.groupId,
          representativeScope = scopeAssignment?.scopeDescription ?: when (newRole) {
            "SPECIALTY_ADMIN" -> "مسؤول تخصص"
            "REPRESENTATIVE" -> "ممثل فوج"
            "OWNER" -> "المالك الشامل"
            else -> "طالب"
          }
        )
        repository.updateUser(updatedUser)
      }
    }
  }

  fun updateUserRole(userId: Long, newRole: String, newScope: String) {
    updateUserRole(userId, newRole, ScopeAssignment(institutionId = 1L, scopeDescription = newScope))
  }

  fun addUser(
    fullName: String,
    email: String,
    studentId: String,
    groupNumber: String,
    role: String = "STUDENT"
  ) {
    val prof = studentProfile.value
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertUser(
        AppUser(
          fullName = fullName,
          email = email,
          studentId = studentId,
          specialtyName = prof?.specialtyName ?: "اللغة والأدب العربي",
          yearName = prof?.academicYearName ?: "السنة الثانية (L2)",
          groupNumber = groupNumber,
          role = role
        )
      )
    }
  }

  fun deleteUser(user: AppUser) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteUser(user)
    }
  }

  // Profile & Academic Path Configuration
  fun updateProfile(updatedProfile: StudentProfile) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.updateStudentProfile(updatedProfile)
    }
  }

  fun updateAcademicPath(
    institution: String,
    specialtyName: String,
    profileTrack: String,
    yearName: String,
    semesterName: String,
    groupNumber: String
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      val current = repository.studentProfile.first()
      val updated = (current ?: StudentProfile()).copy(
        institution = institution,
        university = institution,
        specialtyName = specialtyName,
        profileTrack = profileTrack,
        academicYearName = yearName,
        semesterName = semesterName,
        groupNumber = groupNumber,
        isConfigured = true
      )
      repository.updateStudentProfile(updated)
    }
  }

  fun switchUserRole(role: String) {
    viewModelScope.launch(Dispatchers.IO) {
      val current = repository.studentProfile.first() ?: return@launch
      repository.updateStudentProfile(current.copy(userRole = role))
    }
  }

  // Unified Admin Creation Actions with Visibility Scopes
  fun addModule(
    name: String,
    code: String,
    coefficient: Double,
    credits: Int,
    professorName: String,
    category: String,
    description: String,
    visibilityScope: String = "تخصص كامل",
    targetGroup: String = "الكل"
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertModule(
        ModuleCourse(
          specialtyId = _selectedSpecialtyId.value,
          academicYearId = _selectedYearId.value,
          name = name,
          code = code,
          coefficient = coefficient,
          credits = credits,
          professorName = professorName,
          category = category,
          description = description,
          visibilityScope = visibilityScope,
          targetGroup = targetGroup
        )
      )
    }
  }

  fun addLecture(
    moduleId: Long,
    weekNumber: Int,
    title: String,
    summary: String,
    pdfFileName: String,
    durationMinutes: Int,
    visibilityScope: String = "تخصص كامل",
    targetGroup: String = "الكل"
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertLecture(
        Lecture(
          moduleId = moduleId,
          weekNumber = weekNumber,
          title = title,
          summary = summary,
          pdfFileName = if (pdfFileName.endsWith(".pdf")) pdfFileName else "$pdfFileName.pdf",
          pdfUrl = "https://talib.edu/pdf/$pdfFileName",
          durationMinutes = durationMinutes,
          date = "اليوم",
          visibilityScope = visibilityScope,
          targetGroup = targetGroup
        )
      )
    }
  }

  fun publishAnnouncement(
    title: String,
    content: String,
    author: String,
    urgency: String,
    visibilityScope: String = "تخصص كامل",
    targetGroups: String = "الكل"
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertAnnouncement(
        Announcement(
          title = title,
          content = content,
          author = author,
          date = "الآن",
          urgency = urgency,
          specialtyId = _selectedSpecialtyId.value,
          visibilityScope = visibilityScope,
          targetGroups = targetGroups
        )
      )
    }
  }

  fun addScheduleItem(
    dayOfWeek: Int,
    startTime: String,
    endTime: String,
    moduleName: String,
    type: String,
    room: String,
    professor: String,
    visibilityScope: String = "تخصص كامل",
    targetGroup: String = "الفوج 03"
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertScheduleItem(
        ScheduleItem(
          specialtyId = _selectedSpecialtyId.value,
          academicYearId = _selectedYearId.value,
          dayOfWeek = dayOfWeek,
          startTime = startTime,
          endTime = endTime,
          moduleName = moduleName,
          type = type,
          room = room,
          professor = professor,
          visibilityScope = visibilityScope,
          targetGroup = targetGroup
        )
      )
    }
  }

  fun addExam(
    moduleId: Long,
    moduleName: String,
    title: String,
    date: String,
    time: String,
    room: String,
    coeff: Double,
    visibilityScope: String = "تخصص كامل",
    targetGroup: String = "الكل"
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.insertExam(
        Exam(
          moduleId = moduleId,
          moduleName = moduleName,
          title = title,
          examDate = date,
          time = time,
          room = room,
          coefficient = coeff,
          visibilityScope = visibilityScope,
          targetGroup = targetGroup
        )
      )
    }
  }

  fun uploadLecturePdf(
    fileName: String,
    byteArray: ByteArray,
    onResult: (Result<String>) -> Unit
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      val result = supabaseSyncService.uploadLecturePdf(fileName, byteArray)
      withContext(Dispatchers.Main) {
        onResult(result)
      }
    }
  }

  fun deleteLecture(lecture: Lecture) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteLecture(lecture)
    }
  }

  // Auth & Session Management
  private val _isAuthenticated = MutableStateFlow(true)
  val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

  private val _isAuthLoading = MutableStateFlow(false)
  val isAuthLoading: StateFlow<Boolean> = _isAuthLoading.asStateFlow()

  private val _authStatusMessage = MutableStateFlow<String?>(null)
  val authStatusMessage: StateFlow<String?> = _authStatusMessage.asStateFlow()

  fun loginUser(email: String, password: String, onSuccess: () -> Unit) {
    viewModelScope.launch {
      _isAuthLoading.value = true
      _authStatusMessage.value = null
      
      // Try Supabase auth in background
      val supabaseResult = supabaseSyncService.signInWithEmail(email, password)
      
      // Look up user or match roles
      val users = repository.allUsers.first()
      val matchedUser = users.find { it.email.equals(email.trim(), ignoreCase = true) }
      
      val roleDetermined = when {
        email.contains("admin") || email.contains("owner") -> "OWNER"
        email.contains("specialty") -> "SPECIALTY_ADMIN"
        email.contains("delegate") || email.contains("rep") -> "REPRESENTATIVE"
        matchedUser != null -> matchedUser.role
        else -> "STUDENT"
      }
      
      val currentProfile = repository.studentProfile.first()
      val updatedProfile = (currentProfile ?: StudentProfile()).copy(
        email = email.trim(),
        fullName = matchedUser?.fullName ?: (if (roleDetermined == "OWNER") "المالك (Super Admin)" else if (roleDetermined == "SPECIALTY_ADMIN") "مسؤول التخصص" else if (roleDetermined == "REPRESENTATIVE") "ممثل الفوج 03" else "طالب جامعي"),
        userRole = roleDetermined,
        groupNumber = matchedUser?.groupNumber ?: (currentProfile?.groupNumber ?: "الفوج 03"),
        isConfigured = true
      )
      
      repository.updateStudentProfile(updatedProfile)
      _isAuthenticated.value = true
      _isAuthLoading.value = false
      _currentScreen.value = ScreenRoute.HOME
      onSuccess()
    }
  }

  fun signUpUser(
    fullName: String,
    email: String,
    password: String,
    studentId: String,
    groupNumber: String,
    onSuccess: () -> Unit
  ) {
    viewModelScope.launch {
      _isAuthLoading.value = true
      _authStatusMessage.value = null
      
      val supabaseResult = supabaseSyncService.signUpWithEmail(email, password)
      
      // Save newly registered user to local database
      val newUser = AppUser(
        fullName = fullName,
        email = email.trim(),
        studentId = studentId,
        specialtyName = "اللغة والأدب العربي",
        yearName = "السنة الثانية (L2)",
        groupNumber = groupNumber,
        role = "STUDENT"
      )
      repository.insertUser(newUser)
      
      val currentProfile = repository.studentProfile.first()
      val updatedProfile = (currentProfile ?: StudentProfile()).copy(
        fullName = fullName,
        email = email.trim(),
        studentId = studentId,
        groupNumber = groupNumber,
        userRole = "STUDENT",
        isConfigured = true
      )
      repository.updateStudentProfile(updatedProfile)
      
      _isAuthenticated.value = true
      _isAuthLoading.value = false
      _currentScreen.value = ScreenRoute.HOME
      onSuccess()
    }
  }

  fun logout(onComplete: () -> Unit) {
    viewModelScope.launch {
      _isLoading.value = true
      _loadingMessage.value = "جاري تسجيل الخروج..."
      supabaseSyncService.signOut()
      _isAuthenticated.value = false
      _currentScreen.value = ScreenRoute.LOGIN
      _isLoading.value = false
      onComplete()
    }
  }

  fun continueAsGuest(onSuccess: () -> Unit) {
    viewModelScope.launch {
      _isAuthenticated.value = true
      _currentScreen.value = ScreenRoute.HOME
      onSuccess()
    }
  }

  fun addAssignment(
    title: String,
    courseName: String,
    dueDate: String,
    description: String,
    visibilityScope: String = "تخصص كامل",
    targetGroup: String = "الكل"
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      val foundMod = allModules.value.find { it.name == courseName }
      repository.insertAssignment(
        Assignment(
          moduleId = foundMod?.id ?: (_selectedModule.value?.id ?: 1L),
          title = title,
          dueDate = dueDate,
          description = description,
          visibilityScope = visibilityScope,
          targetGroup = targetGroup
        )
      )
    }
  }

  fun deleteAssignment(assignment: Assignment) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteAssignment(assignment)
    }
  }

  fun deleteExam(exam: Exam) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteExam(exam)
    }
  }

  fun addCohortGroup(
    groupName: String,
    specialtyId: Long = _selectedSpecialtyId.value,
    academicYearId: Long = _selectedYearId.value
  ) {
    viewModelScope.launch(Dispatchers.IO) {
      val cohort = CohortGroup(
        specialtyId = specialtyId,
        academicYearId = academicYearId,
        groupName = groupName
      )
      repository.insertCohortGroup(cohort)
    }
  }

  fun assignStudentToGroup(userId: Long, groupName: String) {
    viewModelScope.launch(Dispatchers.IO) {
      val users = repository.allUsers.first()
      val target = users.find { it.id == userId }
      if (target != null) {
        repository.updateUser(target.copy(groupNumber = groupName))
      }
    }
  }

  fun deleteAnnouncement(announcement: Announcement) {
    viewModelScope.launch(Dispatchers.IO) {
      repository.deleteAnnouncement(announcement)
    }
  }
}

enum class ScreenRoute(val titleAr: String) {
  LOGIN("تسجيل الدخول"),
  HOME("الرئيسية"),
  COURSES("المقررات"),
  LECTURES("المحاضرات والملفات"),
  MY_FILES("ملفاتي"),
  OFFLINE_CACHE("المحتوى المحفوظ"),
  ASSIGNMENTS("الواجبات"),
  SCHEDULE("الجدول"),
  EXAMS("الاختبارات"),
  GRADES("حاسبة الطالب"),
  GROUP("الفوج"),
  ANNOUNCEMENTS("الإعلانات"),
  PROFILE("حسابي"),
  ADMIN("لوحة الإشراف"),
  LIBRARY("المكتبة العامة"),
  ACADEMIC_CALENDAR("التقويم الأكاديمي"),
  ATTENDANCE("الغيابات"),
  REPORT_ISSUE("تقديم تبليغ"),
  NOTIFICATIONS_CENTER("مركز الإشعارات"),
  POLLS("استطلاعات الرأي"),
  ONBOARDING("بوابة التسجيل")
}
