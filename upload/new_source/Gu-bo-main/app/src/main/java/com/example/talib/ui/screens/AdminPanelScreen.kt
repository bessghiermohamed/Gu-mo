package com.example.talib.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.AppUser
import com.example.talib.data.local.ScopeAssignment
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminPanelScreen(
  viewModel: TalibViewModel,
  onNavigate: (ScreenRoute) -> Unit
) {
  val context = LocalContext.current
  val modules by viewModel.allModules.collectAsStateWithLifecycle()
  val specialties by viewModel.specialties.collectAsStateWithLifecycle()
  val institutions by viewModel.allInstitutions.collectAsStateWithLifecycle()
  val allAcademicYears by viewModel.allAcademicYears.collectAsStateWithLifecycle()
  val allAcademicTracks by viewModel.allAcademicTracks.collectAsStateWithLifecycle()
  val allCohortGroups by viewModel.allCohortGroups.collectAsStateWithLifecycle()
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()
  val users by viewModel.allUsers.collectAsStateWithLifecycle()
  val issueReports by viewModel.allIssueReports.collectAsStateWithLifecycle()

  val currentRole = profile?.userRole ?: "OWNER"
  val isOwner = currentRole == "OWNER"
  val canManageRoles = currentRole in listOf("OWNER", "SPECIALTY_ADMIN", "REPRESENTATIVE")

  var selectedTab by remember { mutableStateOf(0) }

  // Upload state
  var showUploadDialog by remember { mutableStateOf(false) }
  var uploadContentType by remember { mutableStateOf("محاضرة") }
  var visibilityScope by remember { mutableStateOf("تخصص كامل") }
  var targetGroupText by remember { mutableStateOf("الكل") }

  var statusMessage by remember { mutableStateOf<String?>(null) }
  var showAddStudentDialog by remember { mutableStateOf(false) }
  var showAddCohortDialog by remember { mutableStateOf(false) }
  var showAddModuleDialog by remember { mutableStateOf(false) }

  // State for Assigning Student to Cohort
  var studentForCohortAssignment by remember { mutableStateOf<AppUser?>(null) }

  // State for Role Assignment Dialog
  var targetUserForRole by remember { mutableStateOf<AppUser?>(null) }
  var targetUserForDeletion by remember { mutableStateOf<AppUser?>(null) }

  // Show raw developer keys toggle
  var showDevKeys by remember { mutableStateOf(false) }

  // Dialog: Assign Student to Cohort
  if (studentForCohortAssignment != null) {
    val target = studentForCohortAssignment!!
    var selectedCohortName by remember {
      mutableStateOf(allCohortGroups.firstOrNull()?.groupName ?: "الفوج 01")
    }

    AlertDialog(
      onDismissRequest = { studentForCohortAssignment = null },
      title = { Text("إلحاق الطالب بفوج دراسي 👥", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(
            text = "اختر الفوج لإلحاق الطالب: ${target.fullName}",
            style = MaterialTheme.typography.bodyMedium
          )
          allCohortGroups.forEach { cohort ->
            val isSelected = cohort.groupName == selectedCohortName
            Card(
              shape = RoundedCornerShape(10.dp),
              colors = CardDefaults.cardColors(
                containerColor = if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                else MaterialTheme.colorScheme.surface
              ),
              onClick = { selectedCohortName = cohort.groupName },
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
              ) {
                RadioButton(selected = isSelected, onClick = { selectedCohortName = cohort.groupName })
                Text(cohort.groupName, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
              }
            }
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.assignStudentToGroup(target.id, selectedCohortName)
            statusMessage = "تم إلحاق الطالب ${target.fullName} بـ [${selectedCohortName}] بنجاح 🎓"
            studentForCohortAssignment = null
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("تأكيد الإلحاق")
        }
      },
      dismissButton = {
        TextButton(onClick = { studentForCohortAssignment = null }) {
          Text("إلغاء")
        }
      }
    )
  }

  // Dialog: Add New Cohort Group
  if (showAddCohortDialog) {
    var newCohortName by remember { mutableStateOf("") }
    AlertDialog(
      onDismissRequest = { showAddCohortDialog = false },
      title = { Text("إنشاء فوج دراسي جديد 👥", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text("أدخل تسمية الفوج الجديد ليتم تسجيله في الهيكل الأكاديمي:", style = MaterialTheme.typography.bodySmall)
          OutlinedTextField(
            value = newCohortName,
            onValueChange = { newCohortName = it },
            label = { Text("اسم الفوج (مثال: الفوج 01، الفوج 04)") },
            placeholder = { Text("الفوج 05") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (newCohortName.isNotBlank()) {
              viewModel.addCohortGroup(newCohortName.trim())
              statusMessage = "تم إنشاء [${newCohortName.trim()}] بنجاح في قاعدة البيانات 🎓"
              showAddCohortDialog = false
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("إنشاء الفوج")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAddCohortDialog = false }) { Text("إلغاء") }
      }
    )
  }

  // Dialog: Add New Module / Course
  if (showAddModuleDialog) {
    var mName by remember { mutableStateOf("") }
    var mCode by remember { mutableStateOf("") }
    var mProf by remember { mutableStateOf("") }
    var mCoeff by remember { mutableStateOf("2.0") }
    var mCredits by remember { mutableStateOf("4") }
    var mCategory by remember { mutableStateOf("أساسي") }
    var mDesc by remember { mutableStateOf("") }

    AlertDialog(
      onDismissRequest = { showAddModuleDialog = false },
      title = { Text("إضافة مقياس دراسي جديد 📚", fontWeight = FontWeight.Bold) },
      text = {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          item {
            OutlinedTextField(
              value = mName,
              onValueChange = { mName = it },
              label = { Text("اسم المقياس") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth()
            )
          }
          item {
            OutlinedTextField(
              value = mProf,
              onValueChange = { mProf = it },
              label = { Text("الأستاذ المسؤول") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth()
            )
          }
          item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              OutlinedTextField(
                value = mCoeff,
                onValueChange = { mCoeff = it },
                label = { Text("المعامل (Coeff)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f)
              )
              OutlinedTextField(
                value = mCredits,
                onValueChange = { mCredits = it },
                label = { Text("الرصيد") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f)
              )
            }
          }
          item {
            OutlinedTextField(
              value = mDesc,
              onValueChange = { mDesc = it },
              label = { Text("وصف المقياس / المحاور") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth()
            )
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (mName.isNotBlank()) {
              val coeffVal = mCoeff.toDoubleOrNull() ?: 2.0
              val credVal = mCredits.toIntOrNull() ?: 4
              viewModel.addModule(
                name = mName.trim(),
                code = if (mCode.isNotBlank()) mCode.trim() else "MOD-${System.currentTimeMillis() % 1000}",
                coefficient = coeffVal,
                credits = credVal,
                professorName = if (mProf.isNotBlank()) mProf.trim() else "أستاذ المادة",
                category = mCategory,
                description = mDesc.ifBlank { "مقرر دراسي أكاديمي" }
              )
              statusMessage = "تمت إضافة المقياس [${mName.trim()}] بنجاح 📚"
              showAddModuleDialog = false
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("إضافة المقياس")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAddModuleDialog = false }) { Text("إلغاء") }
      }
    )
  }

  // Delete User Confirmation Dialog
  if (targetUserForDeletion != null) {
    val userToDelete = targetUserForDeletion!!
    AlertDialog(
      onDismissRequest = { targetUserForDeletion = null },
      icon = {
        Icon(
          Icons.Default.DeleteForever,
          contentDescription = null,
          tint = MaterialTheme.colorScheme.error,
          modifier = Modifier.size(36.dp)
        )
      },
      title = {
        Text("تأكيد حذف المستخدم نهائياً", fontWeight = FontWeight.Bold)
      },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(text = "هل أنت متأكد من حذف الحساب الخاص بـ:")
          Surface(
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(10.dp)) {
              Text(userToDelete.fullName, fontWeight = FontWeight.Bold)
              Text(
                "${userToDelete.email} • رتبته: ${userToDelete.role}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
              )
            }
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.deleteUser(userToDelete)
            statusMessage = "تم حذف المستخدم [${userToDelete.fullName}] بنجاح 🗑️"
            targetUserForDeletion = null
          },
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("تأكيد الحذف")
        }
      },
      dismissButton = {
        TextButton(onClick = { targetUserForDeletion = null }) { Text("إلغاء") }
      }
    )
  }

  // Upload Content Dialog (Lectures, Exams, Schedules, Announcements)
  if (showUploadDialog) {
    var selectedModId by remember { mutableStateOf(modules.firstOrNull()?.id ?: 1L) }
    var titleText by remember { mutableStateOf("") }
    var contentText by remember { mutableStateOf("") }
    var urgencyText by remember { mutableStateOf("عام") }
    var modExpanded by remember { mutableStateOf(false) }

    // Dynamic Week & Duration / Exam fields
    var weekNumberText by remember { mutableStateOf("1") }
    var durationMinutesText by remember { mutableStateOf("90") }
    var examDateText by remember { mutableStateOf("أسبوع الامتحانات") }
    var examTimeText by remember { mutableStateOf("09:00") }
    var examRoomText by remember { mutableStateOf("قاعة 12") }

    // Real File Picker State
    var selectedFileUri by remember { mutableStateOf<Uri?>(null) }
    var selectedFileName by remember { mutableStateOf("") }
    var isUploadingFile by remember { mutableStateOf(false) }
    var uploadError by remember { mutableStateOf<String?>(null) }

    val filePickerLauncher = rememberLauncherForActivityResult(
      contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
      selectedFileUri = uri
      if (uri != null) {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (cursor.moveToFirst() && nameIndex >= 0) {
            selectedFileName = cursor.getString(nameIndex)
          }
        }
        if (selectedFileName.isBlank()) {
          selectedFileName = "doc_${System.currentTimeMillis()}.pdf"
        }
      }
    }

    AlertDialog(
      onDismissRequest = { if (!isUploadingFile) showUploadDialog = false },
      title = { Text("رفع ونشر: $uploadContentType", fontWeight = FontWeight.Black) },
      text = {
        LazyColumn(
          modifier = Modifier.fillMaxWidth(),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          // Scope selection
          item {
            Card(
              shape = RoundedCornerShape(12.dp),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f))
            ) {
              Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("نطاق الظهور الإلزامي:", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                  listOf("تخصص كامل", "فوج واحد").forEach { sc ->
                    FilterChip(
                      selected = visibilityScope == sc,
                      onClick = {
                        visibilityScope = sc
                        targetGroupText = if (sc == "تخصص كامل") "الكل" else (allCohortGroups.firstOrNull()?.groupName ?: "الفوج 01")
                      },
                      label = { Text(sc, fontSize = 11.sp) }
                    )
                  }
                }
                if (visibilityScope == "فوج واحد") {
                  Text("اختر الفوج المعني:", style = MaterialTheme.typography.labelSmall)
                  Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    allCohortGroups.forEach { grp ->
                      FilterChip(
                        selected = targetGroupText == grp.groupName,
                        onClick = { targetGroupText = grp.groupName },
                        label = { Text(grp.groupName, fontSize = 10.sp) }
                      )
                    }
                  }
                }
              }
            }
          }

          if (uploadContentType == "محاضرة" || uploadContentType == "امتحان") {
            item {
              ExposedDropdownMenuBox(
                expanded = modExpanded,
                onExpandedChange = { modExpanded = !modExpanded }
              ) {
                OutlinedTextField(
                  value = modules.find { it.id == selectedModId }?.name ?: "اختر المقياس",
                  onValueChange = {},
                  readOnly = true,
                  label = { Text("المقياس الدراسي") },
                  trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = modExpanded) },
                  modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable, true)
                )
                ExposedDropdownMenu(
                  expanded = modExpanded,
                  onDismissRequest = { modExpanded = false }
                ) {
                  modules.forEach { mod ->
                    DropdownMenuItem(
                      text = { Text(mod.name) },
                      onClick = {
                        selectedModId = mod.id
                        modExpanded = false
                      }
                    )
                  }
                }
              }
            }
          }

          item {
            OutlinedTextField(
              value = titleText,
              onValueChange = { titleText = it },
              label = { Text(if (uploadContentType == "إعلان") "عنوان الإعلان" else "العنوان / الموضوع") },
              modifier = Modifier.fillMaxWidth()
            )
          }

          if (uploadContentType != "امتحان") {
            item {
              OutlinedTextField(
                value = contentText,
                onValueChange = { contentText = it },
                label = { Text(if (uploadContentType == "إعلان") "نص الإعلان" else "الملخص / التفاصيل") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth()
              )
            }
          }

          // Specific fields for Lecture
          if (uploadContentType == "محاضرة") {
            item {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
              ) {
                OutlinedTextField(
                  value = weekNumberText,
                  onValueChange = { weekNumberText = it.filter { char -> char.isDigit() } },
                  label = { Text("رقم الأسبوع") },
                  keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                  modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                  value = durationMinutesText,
                  onValueChange = { durationMinutesText = it.filter { char -> char.isDigit() } },
                  label = { Text("المدة (دقيقة)") },
                  keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                  modifier = Modifier.weight(1f)
                )
              }
            }

            // Real File Picker Card
            item {
              Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                modifier = Modifier.fillMaxWidth()
              ) {
                Column(
                  modifier = Modifier.padding(12.dp),
                  verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                  Text("ملف المحاضرة (PDF):", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                  if (selectedFileName.isNotBlank()) {
                    Row(
                      modifier = Modifier.fillMaxWidth(),
                      verticalAlignment = Alignment.CenterVertically,
                      horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                      Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = Color(0xFFE11D48))
                        Text(selectedFileName, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold), maxLines = 1)
                      }
                      IconButton(onClick = {
                        selectedFileUri = null
                        selectedFileName = ""
                      }) {
                        Icon(Icons.Default.Close, contentDescription = "حذف", tint = MaterialTheme.colorScheme.error)
                      }
                    }
                  } else {
                    OutlinedButton(
                      onClick = { filePickerLauncher.launch("application/pdf") },
                      modifier = Modifier.fillMaxWidth()
                    ) {
                      Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                      Spacer(modifier = Modifier.width(8.dp))
                      Text("اختيار ملف PDF من الجهاز")
                    }
                  }
                  if (isUploadingFile) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
              }
            }
          }

          // Specific fields for Exam
          if (uploadContentType == "امتحان") {
            item {
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                  value = examDateText,
                  onValueChange = { examDateText = it },
                  label = { Text("تاريخ الامتحان") },
                  modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                  value = examTimeText,
                  onValueChange = { examTimeText = it },
                  label = { Text("التوقيت") },
                  modifier = Modifier.weight(1f)
                )
              }
            }
            item {
              OutlinedTextField(
                value = examRoomText,
                onValueChange = { examRoomText = it },
                label = { Text("القاعة / المدرج") },
                modifier = Modifier.fillMaxWidth()
              )
            }
          }

          if (uploadContentType == "إعلان") {
            item {
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("عام", "هام", "عاجل").forEach { urg ->
                  FilterChip(
                    selected = urgencyText == urg,
                    onClick = { urgencyText = urg },
                    label = { Text(urg) }
                  )
                }
              }
            }
          }
        }
      },
      confirmButton = {
        Button(
          enabled = !isUploadingFile && titleText.isNotBlank(),
          onClick = {
            val parsedWeek = weekNumberText.toIntOrNull() ?: 1
            val parsedDuration = durationMinutesText.toIntOrNull() ?: 90

            if (uploadContentType == "محاضرة" && selectedFileUri != null) {
              isUploadingFile = true
              try {
                val inputStream = context.contentResolver.openInputStream(selectedFileUri!!)
                val bytes = inputStream?.readBytes() ?: ByteArray(0)
                inputStream?.close()

                if (bytes.isNotEmpty()) {
                  viewModel.uploadLecturePdf(selectedFileName, bytes) { result ->
                    isUploadingFile = false
                    viewModel.addLecture(
                      moduleId = selectedModId,
                      weekNumber = parsedWeek,
                      title = titleText,
                      summary = contentText.ifBlank { "ملخص المحاضرة" },
                      pdfFileName = selectedFileName,
                      durationMinutes = parsedDuration,
                      visibilityScope = visibilityScope,
                      targetGroup = targetGroupText
                    )
                    showUploadDialog = false
                    statusMessage = "تم حفظ ورفع المحاضرة بنجاح! 🚀"
                  }
                } else {
                  isUploadingFile = false
                }
              } catch (e: Exception) {
                isUploadingFile = false
              }
            } else {
              when (uploadContentType) {
                "محاضرة" -> {
                  viewModel.addLecture(
                    moduleId = selectedModId,
                    weekNumber = parsedWeek,
                    title = titleText,
                    summary = contentText.ifBlank { "ملخص المحاضرة" },
                    pdfFileName = selectedFileName.ifBlank { "lecture.pdf" },
                    durationMinutes = parsedDuration,
                    visibilityScope = visibilityScope,
                    targetGroup = targetGroupText
                  )
                }
                "إعلان" -> {
                  viewModel.publishAnnouncement(
                    title = titleText,
                    content = contentText.ifBlank { "تفاصيل الإعلان" },
                    author = "${profile?.userRole ?: "ممثل"}: ${profile?.fullName ?: "الممثل"}",
                    urgency = urgencyText,
                    visibilityScope = visibilityScope,
                    targetGroups = targetGroupText
                  )
                }
                "امتحان" -> {
                  val mod = modules.find { it.id == selectedModId }
                  viewModel.addExam(
                    moduleId = selectedModId,
                    moduleName = mod?.name ?: "مقياس دراسي",
                    title = titleText,
                    date = examDateText,
                    time = examTimeText,
                    room = examRoomText,
                    coeff = mod?.coefficient ?: 2.0,
                    visibilityScope = visibilityScope,
                    targetGroup = targetGroupText
                  )
                }
              }
              showUploadDialog = false
              statusMessage = "تم نشر $uploadContentType بنجاح! 🚀"
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text(if (isUploadingFile) "جارٍ الرفع..." else "نشر فوري")
        }
      },
      dismissButton = {
        TextButton(enabled = !isUploadingFile, onClick = { showUploadDialog = false }) { Text("إلغاء") }
      }
    )
  }

  // Hierarchy Role & Scope Assignment Dialog (النظام الخماسي الإلزامي)
  if (targetUserForRole != null) {
    val targetUser = targetUserForRole!!
    var selectedNewRole by remember { mutableStateOf(if (targetUser.role in listOf("SPECIALTY_ADMIN", "REPRESENTATIVE", "STUDENT")) targetUser.role else "REPRESENTATIVE") }
    
    // Level 1: المؤسسة (إلزامية دائماً)
    var selectedInstitutionId by remember {
      mutableStateOf(targetUser.scopeInstitutionId ?: institutions.firstOrNull()?.id ?: 1L)
    }

    // Dependent list of Specialties for Level 2
    val availableSpecialties = remember(selectedInstitutionId, specialties) {
      val filtered = specialties.filter { it.institutionId == selectedInstitutionId }
      if (filtered.isNotEmpty()) filtered else specialties
    }
    var selectedSpecId by remember(availableSpecialties) {
      mutableStateOf(
        targetUser.scopeSpecialtyId?.takeIf { id -> availableSpecialties.any { it.id == id } }
          ?: availableSpecialties.firstOrNull()?.id ?: 1L
      )
    }

    // Dependent list of Tracks for Level 3 (الملامح)
    val availableTracks = remember(selectedSpecId, allAcademicTracks) {
      val filtered = allAcademicTracks.filter { it.specialtyId == selectedSpecId }
      if (filtered.isNotEmpty()) filtered else allAcademicTracks
    }
    var selectedTrackId by remember(availableTracks) {
      mutableStateOf<Long?>(
        targetUser.scopeTrackId?.takeIf { id -> availableTracks.any { it.id == id } }
          ?: availableTracks.firstOrNull()?.id
      )
    }

    // Dependent list of Years for Level 4 (السنوات)
    val availableYears = remember(selectedSpecId, allAcademicYears) {
      val filtered = allAcademicYears.filter { it.specialtyId == selectedSpecId }
      if (filtered.isNotEmpty()) filtered else allAcademicYears
    }
    var selectedYearId by remember(availableYears) {
      mutableStateOf(
        targetUser.scopeAcademicYearId?.takeIf { id -> availableYears.any { it.id == id } }
          ?: availableYears.firstOrNull()?.id ?: 1L
      )
    }

    // Dependent list of Cohort Groups for Level 5 (الأفواج)
    val availableGroups = remember(selectedSpecId, selectedTrackId, selectedYearId, allCohortGroups) {
      val filtered = allCohortGroups.filter {
        it.specialtyId == selectedSpecId &&
          (selectedTrackId == null || it.trackId == null || it.trackId == selectedTrackId) &&
          it.academicYearId == selectedYearId
      }
      if (filtered.isNotEmpty()) filtered else allCohortGroups.filter { it.specialtyId == selectedSpecId }
    }
    var selectedGroupId by remember(availableGroups) {
      mutableStateOf(
        targetUser.scopeCohortGroupId?.takeIf { id -> availableGroups.any { it.id == id } }
          ?: availableGroups.firstOrNull()?.id ?: 1L
      )
    }

    val currentSelectedInst = institutions.find { it.id == selectedInstitutionId }
    val currentSelectedSpec = specialties.find { it.id == selectedSpecId }
    val currentSelectedTrack = allAcademicTracks.find { it.id == selectedTrackId }
    val currentSelectedYear = allAcademicYears.find { it.id == selectedYearId }
    val currentSelectedGroup = allCohortGroups.find { it.id == selectedGroupId }

    AlertDialog(
      onDismissRequest = { targetUserForRole = null },
      title = { Text("تعيين رتبة ونطاق إشراف لـ: ${targetUser.fullName}", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
      text = {
        LazyColumn(
          modifier = Modifier.fillMaxWidth(),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          item {
            Text("اختر الرتبة الصادرة:", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              if (isOwner) {
                FilterChip(
                  selected = selectedNewRole == "SPECIALTY_ADMIN",
                  onClick = { selectedNewRole = "SPECIALTY_ADMIN" },
                  label = { Text("مسؤول تخصص") }
                )
              }
              FilterChip(
                selected = selectedNewRole == "REPRESENTATIVE",
                onClick = { selectedNewRole = "REPRESENTATIVE" },
                label = { Text("ممثل فوج") }
              )
              FilterChip(
                selected = selectedNewRole == "STUDENT",
                onClick = { selectedNewRole = "STUDENT" },
                label = { Text("طالب") }
              )
            }
          }

          if (selectedNewRole != "STUDENT") {
            item {
              HorizontalDivider()
              Text("تحديد مسار النطاق الخماسي الهرمي (معرفات رقمية):", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary))
            }

            // 1. المؤسسة (إلزامية)
            item {
              Text("1. المؤسسة الجامعية (إلزامي):", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
              Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                institutions.forEach { inst ->
                  FilterChip(
                    selected = selectedInstitutionId == inst.id,
                    onClick = { selectedInstitutionId = inst.id },
                    label = { Text(inst.nameAr, fontSize = 11.sp) }
                  )
                }
              }
            }

            // 2. التخصص
            item {
              Text("2. التخصص الأكاديمي:", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
              Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                availableSpecialties.forEach { sp ->
                  FilterChip(
                    selected = selectedSpecId == sp.id,
                    onClick = { selectedSpecId = sp.id },
                    label = { Text(sp.nameAr, fontSize = 11.sp) }
                  )
                }
              }
            }

            // 3. الملمح (Track)
            if (availableTracks.isNotEmpty()) {
              item {
                Text("3. الملمح الأكاديمي (Track):", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                  availableTracks.forEach { tr ->
                    FilterChip(
                      selected = selectedTrackId == tr.id,
                      onClick = { selectedTrackId = tr.id },
                      label = { Text(tr.trackNameAr, fontSize = 11.sp) }
                    )
                  }
                }
              }
            }

            // 4. السنة الدراسية
            item {
              Text("4. السنة الدراسية:", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
              Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                availableYears.forEach { yr ->
                  FilterChip(
                    selected = selectedYearId == yr.id,
                    onClick = { selectedYearId = yr.id },
                    label = { Text(yr.yearName, fontSize = 11.sp) }
                  )
                }
              }
            }

            // 5. الفوج (خاص بممثل الفوج)
            if (selectedNewRole == "REPRESENTATIVE") {
              item {
                Text("5. الفوج الدراسي المعني:", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                  if (availableGroups.isEmpty()) {
                    Text("لا توجد أفواج في هذا الملمح، يرجى إنشاء فوج أولاً", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                  } else {
                    availableGroups.forEach { grp ->
                      FilterChip(
                        selected = selectedGroupId == grp.id,
                        onClick = { selectedGroupId = grp.id },
                        label = { Text(grp.groupName, fontSize = 11.sp) }
                      )
                    }
                  }
                }
              }
            }
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            val scopeAssignment = when (selectedNewRole) {
              "SPECIALTY_ADMIN" -> ScopeAssignment(
                institutionId = selectedInstitutionId,
                specialtyId = selectedSpecId,
                trackId = selectedTrackId,
                yearId = null,
                groupId = null,
                scopeDescription = "${currentSelectedInst?.nameAr ?: ""} • ${currentSelectedSpec?.nameAr ?: "تخصص"}"
              )
              "REPRESENTATIVE" -> ScopeAssignment(
                institutionId = selectedInstitutionId,
                specialtyId = selectedSpecId,
                trackId = selectedTrackId,
                yearId = selectedYearId,
                groupId = selectedGroupId,
                scopeDescription = "${currentSelectedSpec?.nameAr ?: ""} • ${currentSelectedTrack?.trackNameAr?.take(15) ?: ""} • ${currentSelectedGroup?.groupName ?: ""}"
              )
              else -> ScopeAssignment(
                institutionId = selectedInstitutionId,
                specialtyId = selectedSpecId,
                trackId = selectedTrackId,
                yearId = selectedYearId,
                groupId = selectedGroupId,
                scopeDescription = "طالب"
              )
            }
            viewModel.updateUserRole(targetUser.id, selectedNewRole, scopeAssignment)
            statusMessage = "تم تعيين ${targetUser.fullName} بنجاح كـ [$selectedNewRole] 🎯"
            targetUserForRole = null
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("تأكيد التعيين")
        }
      },
      dismissButton = {
        TextButton(onClick = { targetUserForRole = null }) { Text("إلغاء") }
      }
    )
  }

  // Add Student Dialog
  if (showAddStudentDialog) {
    var sName by remember { mutableStateOf("") }
    var sEmail by remember { mutableStateOf("") }
    var sId by remember { mutableStateOf("2026-TLB-9999") }
    var sGroup by remember { mutableStateOf(allCohortGroups.firstOrNull()?.groupName ?: "الفوج 01") }

    AlertDialog(
      onDismissRequest = { showAddStudentDialog = false },
      title = { Text("إضافة طالب جديد يدوياً", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = sName,
            onValueChange = { sName = it },
            label = { Text("اسم ولقب الطالب") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = sEmail,
            onValueChange = { sEmail = it },
            label = { Text("البريد الإلكتروني (اختياري)") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = sGroup,
            onValueChange = { sGroup = it },
            label = { Text("الفوج") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (sName.isNotBlank()) {
              viewModel.addUser(sName, sEmail.ifBlank { "student@talib.dz" }, sId, sGroup, "STUDENT")
              showAddStudentDialog = false
              statusMessage = "تمت إضافة الطالب $sName بنجاح! 🎓"
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("إضافة")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAddStudentDialog = false }) { Text("إلغاء") }
      }
    )
  }

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("admin_panel_screen"),
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text("لوحة الإشراف والرتب", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = "رتبتك: ${
                when (currentRole) {
                  "OWNER" -> "المالك العام للمنصة 👑"
                  "SPECIALTY_ADMIN" -> "مسؤول تخصص 🏛️"
                  "REPRESENTATIVE" -> "ممثل الفوج 🎓"
                  else -> "طالب"
                }
              }",
              style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.primary)
            )
          }
        },
        navigationIcon = {
          IconButton(onClick = { onNavigate(ScreenRoute.HOME) }) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
          }
        },
        actions = {
          IconButton(onClick = { showAddStudentDialog = true }) {
            Icon(Icons.Default.PersonAdd, contentDescription = "إضافة طالب")
          }
        }
      )
    }
  ) { padding ->
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .padding(horizontal = 16.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp),
      contentPadding = PaddingValues(top = 10.dp, bottom = 24.dp)
    ) {
      item {
        SecondaryScrollableTabRow(
          selectedTabIndex = selectedTab,
          modifier = Modifier.fillMaxWidth()
        ) {
          Tab(
            selected = selectedTab == 0,
            onClick = { selectedTab = 0 },
            text = { Text("السحابة والمزامنة", fontWeight = FontWeight.Bold) }
          )
          Tab(
            selected = selectedTab == 1,
            onClick = { selectedTab = 1 },
            text = { Text("رفع المحتوى", fontWeight = FontWeight.Bold) }
          )
          Tab(
            selected = selectedTab == 2,
            onClick = { selectedTab = 2 },
            text = { Text("الرتب والأفواج", fontWeight = FontWeight.Bold) }
          )
          Tab(
            selected = selectedTab == 3,
            onClick = { selectedTab = 3 },
            text = { Text("التبليغات (${issueReports.size})", fontWeight = FontWeight.Bold) }
          )
        }
      }

      if (statusMessage != null) {
        item {
          Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
          ) {
            Text(
              text = statusMessage ?: "",
              modifier = Modifier.padding(12.dp),
              style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold)
            )
          }
        }
      }

      // TAB 0: إدارة الاتصال السحابي بـ Supabase
      if (selectedTab == 0) {
        item {
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
              Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                  modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF3ECF8E)),
                  contentAlignment = Alignment.Center
                ) {
                  Icon(Icons.Default.CloudSync, contentDescription = null, tint = Color.White)
                }
                Column {
                  Text("الاتصال السحابي بـ Supabase", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black))
                  Text("قاعدة بيانات سحابية وتخزين لحظي Offline-First", style = MaterialTheme.typography.bodySmall)
                }
              }

              val syncStatus by viewModel.supabaseConnectionStatus.collectAsStateWithLifecycle()
              if (syncStatus != null) {
                Surface(
                  shape = RoundedCornerShape(10.dp),
                  color = MaterialTheme.colorScheme.surface,
                  modifier = Modifier.fillMaxWidth()
                ) {
                  Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                  ) {
                    Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    Text(syncStatus ?: "", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold))
                  }
                }
              }

              Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                  onClick = { viewModel.testSupabaseConnection() },
                  shape = RoundedCornerShape(10.dp),
                  modifier = Modifier.weight(1f)
                ) {
                  Icon(Icons.Default.Sensors, contentDescription = null, modifier = Modifier.size(16.dp))
                  Spacer(modifier = Modifier.width(6.dp))
                  Text("اختبار الاتصال")
                }

                Button(
                  onClick = { viewModel.syncWithSupabase() },
                  shape = RoundedCornerShape(10.dp),
                  colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                  modifier = Modifier.weight(1f)
                ) {
                  Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                  Spacer(modifier = Modifier.width(6.dp))
                  Text("مزامنة الآن")
                }
              }
            }
          }
        }

        // Developer diagnostics (Protected: only visible if Owner)
        if (isOwner) {
          item {
            Card(
              shape = RoundedCornerShape(16.dp),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
              modifier = Modifier.fillMaxWidth()
            ) {
              Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text("إعدادات وتشخيص المطور (خاص بالمالك):", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                  TextButton(onClick = { showDevKeys = !showDevKeys }) {
                    Text(if (showDevKeys) "إخفاء" else "عرض")
                  }
                }
                if (showDevKeys) {
                  Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth()
                  ) {
                    Text(
                      text = "SUPABASE_URL: مهيأة سحابياً\nSUPABASE_KEY: مهيأ ومشفر\nالوضع: Offline-First مع المزامنة التلقائية",
                      modifier = Modifier.padding(10.dp),
                      style = MaterialTheme.typography.bodySmall
                    )
                  }
                }
              }
            }
          }
        }
      }

      // TAB 1: واجهة الرفع الموحدة
      if (selectedTab == 1) {
        item {
          Text(
            text = "شاشة الرفع الموحدة (نشر فوري):",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
          )
        }

        item {
          Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(
              Triple("محاضرة وملف دراسي", "رفع وتخزين ملفات PDF وملخصات المحاضرات", Icons.Default.Description),
              Triple("إعلان بيداغوجي", "نشر تنبيه عاجل أو هام للطلبة", Icons.Default.Campaign),
              Triple("امتحان واختبار", "برمجة موعد امتحان وقاعة ومدرج", Icons.Default.Science)
            ).forEach { (title, subtitle, icon) ->
              Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                onClick = {
                  uploadContentType = when {
                    title.contains("محاضرة") -> "محاضرة"
                    title.contains("إعلان") -> "إعلان"
                    else -> "امتحان"
                  }
                  showUploadDialog = true
                },
                modifier = Modifier.fillMaxWidth()
              ) {
                Row(
                  modifier = Modifier.padding(16.dp),
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                  Box(
                    modifier = Modifier
                      .size(46.dp)
                      .clip(CircleShape)
                      .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                  ) {
                    Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                  }

                  Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                    Text(subtitle, style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant))
                  }

                  Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
              }
            }
          }
        }
      }

      // TAB 2: إدارة الرتب والأفواج والمقاييس
      if (selectedTab == 2) {
        // Section: Cohort Management (+ فوج جديد)
        item {
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Text("الأفواج الدراسية المسجلة:", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                Button(
                  onClick = { showAddCohortDialog = true },
                  shape = RoundedCornerShape(8.dp),
                  contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                  Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                  Spacer(modifier = Modifier.width(4.dp))
                  Text("+ فوج جديد", fontSize = 12.sp)
                }
              }

              Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                allCohortGroups.forEach { cohort ->
                  val studentCount = users.count { it.groupNumber == cohort.groupName }
                  Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                  ) {
                    Text(
                      text = "${cohort.groupName} ($studentCount طالب)",
                      modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                      style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
                    )
                  }
                }
              }
            }
          }
        }

        // Section: Courses Management (+ مقياس جديد)
        item {
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Text("المقاييس والمقررات (${modules.size}):", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                Button(
                  onClick = { showAddModuleDialog = true },
                  shape = RoundedCornerShape(8.dp),
                  contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                  Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                  Spacer(modifier = Modifier.width(4.dp))
                  Text("+ مقياس جديد", fontSize = 12.sp)
                }
              }
            }
          }
        }

        // Section: Unassigned Students (طلاب بدون فوج)
        val unassignedStudents = users.filter { it.groupNumber.isBlank() || it.groupNumber == "بلا فوج" }
        if (unassignedStudents.isNotEmpty()) {
          item {
            Text(
              text = "طلاب بحاجة للإلحاق بفوج (${unassignedStudents.size}):",
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Black, color = Color(0xFFD97706))
            )
          }

          items(unassignedStudents) { u ->
            Card(
              shape = RoundedCornerShape(12.dp),
              colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
              border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFDE68A)),
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Column {
                  Text(u.fullName, fontWeight = FontWeight.Bold)
                  Text("مسجل بدون فوج • ${u.email}", style = MaterialTheme.typography.bodySmall)
                }
                Button(
                  onClick = { studentForCohortAssignment = u },
                  shape = RoundedCornerShape(8.dp),
                  colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706))
                ) {
                  Text("إلحاق بالفوج 👥", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
              }
            }
          }
        }

        // Section: All registered users and roles
        item {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Text(
              text = "قائمة الطلاب وممثلي الأفواج:",
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
            )
            Text(
              text = "${users.size} مسجل",
              style = MaterialTheme.typography.labelMedium.copy(color = MaterialTheme.colorScheme.primary)
            )
          }
        }

        items(users) { u ->
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                  Box(
                    modifier = Modifier
                      .size(38.dp)
                      .clip(CircleShape)
                      .background(
                        when (u.role) {
                          "OWNER" -> Color(0xFFE11D48)
                          "SPECIALTY_ADMIN" -> MaterialTheme.colorScheme.primary
                          "REPRESENTATIVE" -> Color(0xFF8B5CF6)
                          else -> MaterialTheme.colorScheme.surfaceVariant
                        }
                      ),
                    contentAlignment = Alignment.Center
                  ) {
                    Icon(
                      imageVector = when (u.role) {
                        "OWNER" -> Icons.Default.Shield
                        "SPECIALTY_ADMIN" -> Icons.Default.SupervisorAccount
                        "REPRESENTATIVE" -> Icons.Default.School
                        else -> Icons.Default.Person
                      },
                      contentDescription = null,
                      tint = Color.White,
                      modifier = Modifier.size(20.dp)
                    )
                  }

                  Column {
                    Text(u.fullName, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                    Text("${u.groupNumber.ifBlank { "بلا فوج" }} • ${u.email}", style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant))
                  }
                }

                Box(
                  modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                  Text(
                    text = when (u.role) {
                      "OWNER" -> "المالك"
                      "SPECIALTY_ADMIN" -> "مسؤول تخصص"
                      "REPRESENTATIVE" -> "ممثل فوج"
                      else -> "طالب"
                    },
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
                  )
                }
              }

              if (canManageRoles && u.role != "OWNER") {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                  Button(
                    onClick = { targetUserForRole = u },
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f)
                  ) {
                    Icon(Icons.Default.ManageAccounts, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("تعيين رتبة ⚙️", style = MaterialTheme.typography.labelMedium)
                  }

                  FilledTonalButton(
                    onClick = { targetUserForDeletion = u },
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.filledTonalButtonColors(
                      containerColor = MaterialTheme.colorScheme.errorContainer,
                      contentColor = MaterialTheme.colorScheme.error
                    )
                  ) {
                    Icon(Icons.Default.PersonRemove, contentDescription = "حذف", modifier = Modifier.size(18.dp))
                  }
                }
              }
            }
          }
        }
      }

      // TAB 3: التبليغات الواردة من الطلاب
      if (selectedTab == 3) {
        item {
          Text("التبليغات والشكاوى الواردة من الطلبة:", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black))
        }

        if (issueReports.isEmpty()) {
          item {
            Card(
              shape = RoundedCornerShape(16.dp),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
              modifier = Modifier.fillMaxWidth()
            ) {
              Text(
                text = "لا توجد أي تبليغات واردة حالياً من الطلبة.",
                modifier = Modifier.padding(16.dp),
                style = MaterialTheme.typography.bodyMedium
              )
            }
          }
        } else {
          items(issueReports) { rep ->
            Card(
              shape = RoundedCornerShape(16.dp),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
              elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
              modifier = Modifier.fillMaxWidth()
            ) {
              Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text("من: ${rep.studentName} (${rep.studentGroup})", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                  Box(
                    modifier = Modifier
                      .clip(RoundedCornerShape(6.dp))
                      .background(if (rep.status == "تم الحل") Color(0xFF10B981) else Color(0xFFF59E0B))
                      .padding(horizontal = 8.dp, vertical = 2.dp)
                  ) {
                    Text(rep.status, style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontWeight = FontWeight.Bold))
                  }
                }

                Text(
                  text = "نوع المشكلة: ${rep.itemType} - ${rep.itemTitle}",
                  style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                )

                Text(
                  text = rep.description,
                  style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                )

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                  Button(
                    onClick = {
                      viewModel.updateIssueReportStatus(rep, "تم الحل", "تم تصحيح المحتوى بنجاح")
                      statusMessage = "تم وضع البلاغ كـ [تم الحل] وإشعار الطالب."
                    },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.weight(1f)
                  ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("تم التصحيح والحل")
                  }

                  OutlinedButton(
                    onClick = { viewModel.deleteIssueReport(rep) },
                    shape = RoundedCornerShape(8.dp)
                  ) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "حذف", tint = MaterialTheme.colorScheme.error)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
