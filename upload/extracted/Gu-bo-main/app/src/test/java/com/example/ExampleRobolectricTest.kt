package com.example

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.example.talib.data.local.CachedCourseMaterial
import com.example.talib.data.local.TalibDatabase
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("طالب | Talib", appName)
  }

  @Test
  fun `room database cached course material persistence test`() = runBlocking {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val db = Room.inMemoryDatabaseBuilder(context, TalibDatabase::class.java).build()
    val dao = db.talibDao()

    val testMaterial = CachedCourseMaterial(
      moduleId = 1L,
      moduleName = "النحو والصرف",
      title = "ملخص الجملة الاسمية ونواسخها",
      materialType = "ملخص دراسي",
      summary = "شرح شامل ومبسط للمبتدأ والخبر وكان وأخواتها",
      fullText = "المبتدأ اسم صريح أو مؤول بالصريح مجرد عن العوامل اللفظية غير الزائدة مخبر عنه...",
      keyConcepts = "المبتدأ، الخبر، كان وأخواتها، إن وأخواتها",
      weekNumber = 1,
      cachedDate = "2026-08-27"
    )

    val id = dao.insertCachedMaterial(testMaterial)
    assertTrue(id > 0)

    val cached = dao.getCachedMaterialById(id)
    assertNotNull(cached)
    assertEquals("النحو والصرف", cached?.moduleName)
    assertEquals(1, cached?.weekNumber)

    db.close()
  }

  @Test
  fun `student grade official and target score calculation test`() = runBlocking {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val db = Room.inMemoryDatabaseBuilder(context, TalibDatabase::class.java).build()
    val dao = db.talibDao()

    val grade = com.example.talib.data.local.StudentGrade(
      moduleId = 1L,
      moduleName = "الأدب المقارن",
      coefficient = 3.0,
      credits = 5,
      continuousScore = 14.5,
      examScore = 16.0,
      targetScore = 15.0,
      isOfficial = true
    )
    dao.insertGrades(listOf(grade))

    val allGrades = dao.getAllGrades().first()
    assertEquals(1, allGrades.size)
    assertTrue(allGrades[0].isOfficial)
    assertEquals(15.0, allGrades[0].targetScore, 0.01)

    val average = (allGrades[0].continuousScore * 0.4) + (allGrades[0].examScore * 0.6)
    assertEquals(15.4, average, 0.01)

    db.close()
  }

  @Test
  fun `announcement read status and visibility scope test`() = runBlocking {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val db = Room.inMemoryDatabaseBuilder(context, TalibDatabase::class.java).build()
    val dao = db.talibDao()

    val announcement = com.example.talib.data.local.Announcement(
      title = "إعلان تأجيل حصة النحو",
      content = "تم تأجيل حصة النحو ليوم الإثنين القادم للمجموعتين 1 و 3",
      date = "28 أوت 2026",
      urgency = "هام",
      author = "أ.د. عبد الرحمن الحاج",
      isRead = false,
      visibilityScope = "أفواج محددة",
      targetGroups = "الفوج 01، الفوج 03"
    )
    val id = dao.insertAnnouncement(announcement)
    assertTrue(id > 0)

    dao.updateAnnouncementReadStatus(id, true)
    val updated = dao.getAllAnnouncements().first().find { it.id == id }
    assertNotNull(updated)
    assertTrue(updated!!.isRead)
    assertEquals("أفواج محددة", updated.visibilityScope)
    assertEquals("الفوج 01، الفوج 03", updated.targetGroups)

    db.close()
  }
}

