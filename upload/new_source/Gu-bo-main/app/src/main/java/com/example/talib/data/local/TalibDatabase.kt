package com.example.talib.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
  entities = [
    Institution::class,
    Specialty::class,
    AcademicTrack::class,
    AcademicYear::class,
    CohortGroup::class,
    ModuleCourse::class,
    Lecture::class,
    CachedCourseMaterial::class,
    Assignment::class,
    ScheduleItem::class,
    Exam::class,
    StudentGrade::class,
    Announcement::class,
    StudentProfile::class,
    StudentNote::class,
    LibraryReference::class,
    AcademicCalendarEvent::class,
    AttendanceRecord::class,
    StudentIssueReport::class,
    ClassPoll::class,
    AppUser::class
  ],
  version = 7,
  exportSchema = false
)
abstract class TalibDatabase : RoomDatabase() {
  abstract fun talibDao(): TalibDao

  companion object {
    @Volatile
    private var INSTANCE: TalibDatabase? = null

    fun getDatabase(context: Context, scope: CoroutineScope): TalibDatabase {
      return INSTANCE ?: synchronized(this) {
        val instance = Room.databaseBuilder(
          context.applicationContext,
          TalibDatabase::class.java,
          "talib_database"
        )
          .addCallback(TalibDatabaseCallback(scope))
          .fallbackToDestructiveMigration(dropAllTables = true)
          .build()
        INSTANCE = instance
        instance
      }
    }

    private class TalibDatabaseCallback(
      private val scope: CoroutineScope
    ) : RoomDatabase.Callback() {
      override fun onCreate(db: SupportSQLiteDatabase) {
        super.onCreate(db)
        INSTANCE?.let { database ->
          scope.launch(Dispatchers.IO) {
            populateInitialData(database.talibDao())
          }
        }
      }
    }

    suspend fun populateInitialData(dao: TalibDao) {
      // 0. Higher Education Institutions
      val instEns = Institution(id = 1, nameAr = "المدرسة العليا للأساتذة - بوزريعة", type = "المدرسة العليا للأساتذة (ENS)", city = "الجزائر")
      val instUsthb = Institution(id = 2, nameAr = "جامعة العلوم والتكنولوجيا USTHB", type = "جامعة العلوم والتكنولوجيا", city = "الجزائر (باب الزوار)")
      val instUniv1 = Institution(id = 3, nameAr = "جامعة الجزائر 1 - بن يوسف بن خدة", type = "جامعة مركزية", city = "الجزائر (وسط)")
      dao.insertInstitutions(listOf(instEns, instUsthb, instUniv1))

      // 1. Core Specialties for Algerian Higher Education
      val specArabic = Specialty(
        id = 1,
        institutionId = 1,
        nameAr = "اللغة والأدب العربي",
        code = "ARB-ENS",
        iconName = "menu_book",
        description = "المدرسة العليا للأساتذة - تخصص التعليم واللسانيات",
        institution = "المدرسة العليا للأساتذة - بوزريعة",
        faculty = "قسم اللغة والأدب العربي"
      )
      val specInfo = Specialty(
        id = 2,
        institutionId = 2,
        nameAr = "الإعلام الآلي وتطوير البرمجيات",
        code = "INF-USTHB",
        iconName = "computer",
        description = "جامعة العلوم والتكنولوجيا هواري بومدين",
        institution = "جامعة العلوم والتكنولوجيا هواري بومدين (USTHB)",
        faculty = "كلية الإعلام الآلي"
      )
      val specEnglish = Specialty(
        id = 3,
        institutionId = 1,
        nameAr = "اللغة الإنجليزية وآدابها",
        code = "ENG-ENS",
        iconName = "translate",
        description = "المدرسة العليا للأساتذة - قسم اللغات الأجنبية",
        institution = "المدرسة العليا للأساتذة - بوزريعة",
        faculty = "قسم اللغات الأجنبية"
      )
      dao.insertSpecialties(listOf(specArabic, specInfo, specEnglish))

      // 1.5 Academic Tracks (التعليم الابتدائي / المتوسط / الثانوي / عام)
      val trPep = AcademicTrack(id = 1, specialtyId = 1, trackNameAr = "أستاذ التعليم الابتدائي (PEP)", code = "PEP")
      val trPem = AcademicTrack(id = 2, specialtyId = 1, trackNameAr = "أستاذ التعليم المتوسط (PEM)", code = "PEM")
      val trPes = AcademicTrack(id = 3, specialtyId = 1, trackNameAr = "أستاذ التعليم الثانوي (PES)", code = "PES")
      val trInfoL = AcademicTrack(id = 4, specialtyId = 2, trackNameAr = "مهندس / ليسانس إعلام آلي عام", code = "INF-GEN")
      val trInfoIsil = AcademicTrack(id = 5, specialtyId = 2, trackNameAr = "أنظمة معلومات وبرمجيات (ISIL)", code = "ISIL")
      dao.insertAcademicTracks(listOf(trPep, trPem, trPes, trInfoL, trInfoIsil))

      // 2. Academic Years
      val y1 = AcademicYear(id = 1, specialtyId = 1, yearName = "السنة الأولى (L1)", semester = 1)
      val y2 = AcademicYear(id = 2, specialtyId = 1, yearName = "السنة الثانية (L2)", semester = 1)
      val y3 = AcademicYear(id = 3, specialtyId = 1, yearName = "السنة الثالثة (L3)", semester = 1)
      val y4 = AcademicYear(id = 4, specialtyId = 1, yearName = "ماستر 1 (M1)", semester = 1)
      val y5 = AcademicYear(id = 5, specialtyId = 2, yearName = "السنة الأولى جذع مشترك (L1)", semester = 1)
      val y6 = AcademicYear(id = 6, specialtyId = 2, yearName = "السنة الثانية إعلام آلي (L2)", semester = 1)
      val y7 = AcademicYear(id = 7, specialtyId = 2, yearName = "السنة الثالثة ISIL / SI (L3)", semester = 1)
      dao.insertAcademicYears(listOf(y1, y2, y3, y4, y5, y6, y7))

      // 3. Cohort Groups (الأفواج المعرفة رقمياً بالدفعة والملمح)
      val g1 = CohortGroup(id = 1, specialtyId = 1, academicYearId = 2, trackId = 1, groupName = "الفوج 01")
      val g2 = CohortGroup(id = 2, specialtyId = 1, academicYearId = 2, trackId = 1, groupName = "الفوج 02")
      val g3 = CohortGroup(id = 3, specialtyId = 1, academicYearId = 2, trackId = 1, groupName = "الفوج 03")
      val g4 = CohortGroup(id = 4, specialtyId = 1, academicYearId = 2, trackId = 2, groupName = "الفوج 04")
      val g5 = CohortGroup(id = 5, specialtyId = 1, academicYearId = 2, trackId = 3, groupName = "الفوج 05")
      val g6 = CohortGroup(id = 6, specialtyId = 1, academicYearId = 1, trackId = 1, groupName = "الفوج 01")
      val g7 = CohortGroup(id = 7, specialtyId = 1, academicYearId = 1, trackId = 1, groupName = "الفوج 02")
      val g8 = CohortGroup(id = 8, specialtyId = 2, academicYearId = 6, trackId = 4, groupName = "الفوج 01 - G1")
      val g9 = CohortGroup(id = 9, specialtyId = 2, academicYearId = 6, trackId = 5, groupName = "الفوج 02 - G2")
      dao.insertCohortGroups(listOf(g1, g2, g3, g4, g5, g6, g7, g8, g9))

      // 4. Initial System Users with Structured Scope IDs
      val uOwner = AppUser(
        id = 1,
        fullName = "محمد بن علي (المالك)",
        email = "admin@univ.dz",
        studentId = "OWN-001",
        specialtyName = "اللغة والأدب العربي",
        yearName = "السنة الثانية (L2)",
        groupNumber = "الفوج 03",
        role = "OWNER",
        representativeScope = "النظام الشامل",
        assignedSpecialtyId = 1,
        scopeInstitutionId = 1,
        scopeSpecialtyId = 1,
        scopeAcademicYearId = 2,
        scopeCohortGroupId = 3
      )
      val uSpecAdmin = AppUser(
        id = 2,
        fullName = "د. كمال منصوري (مسؤول التخصص)",
        email = "specialty.admin@univ.dz",
        studentId = "ADM-002",
        specialtyName = "اللغة والأدب العربي",
        yearName = "كافة السنوات",
        groupNumber = "الكل",
        role = "SPECIALTY_ADMIN",
        representativeScope = "تخصص اللغة والأدب العربي",
        assignedSpecialtyId = 1,
        scopeInstitutionId = 1,
        scopeSpecialtyId = 1,
        scopeAcademicYearId = null,
        scopeCohortGroupId = null
      )
      val uRep = AppUser(
        id = 3,
        fullName = "ياسين قدور (ممثل الفوج 03)",
        email = "delegate.g3@univ.dz",
        studentId = "REP-003",
        specialtyName = "اللغة والأدب العربي",
        yearName = "السنة الثانية (L2)",
        groupNumber = "الفوج 03",
        role = "REPRESENTATIVE",
        representativeScope = "الفوج 03",
        assignedSpecialtyId = 1,
        scopeInstitutionId = 1,
        scopeSpecialtyId = 1,
        scopeAcademicYearId = 2,
        scopeCohortGroupId = 3
      )
      val uStudent = AppUser(
        id = 4,
        fullName = "أمين بلحاج (طالب)",
        email = "student@univ.dz",
        studentId = "STU-004",
        specialtyName = "اللغة والأدب العربي",
        yearName = "السنة الثانية (L2)",
        groupNumber = "الفوج 03",
        role = "STUDENT",
        representativeScope = "طالب",
        assignedSpecialtyId = 1,
        scopeInstitutionId = 1,
        scopeSpecialtyId = 1,
        scopeAcademicYearId = 2,
        scopeCohortGroupId = 3
      )
      dao.insertUsers(listOf(uOwner, uSpecAdmin, uRep, uStudent))

      // Clean default profile structure ready for student registration
      dao.insertStudentProfile(
        StudentProfile(
          id = 1,
          fullName = "محمد بن علي",
          studentId = "2026-TLB-8459",
          institution = "المدرسة العليا للأساتذة - بوزريعة (ENS)",
          university = "المدرسة العليا للأساتذة - بوزريعة",
          faculty = "قسم اللغة والأدب العربي",
          specialtyName = "اللغة والأدب العربي",
          profileTrack = "أستاذ التعليم الابتدائي",
          selectedSpecialtyId = 1,
          selectedYearId = 2,
          academicYearName = "السنة الثانية (L2)",
          semesterName = "السداسي الأول (S1)",
          groupNumber = "الفوج 03",
          subGroup = "الفوج الفرعي B",
          email = "mohamedbessghier8@gmail.com",
          isAdminMode = false,
          userRole = "STUDENT",
          themePalette = "ACADEMIC",
          isConfigured = true
        )
      )
    }
  }
}
