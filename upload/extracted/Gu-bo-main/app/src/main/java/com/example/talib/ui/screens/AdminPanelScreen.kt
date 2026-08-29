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
  val allCohortGroups by viewModel.allCohortGroups.collectAsStateWithLifecycle()
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()
  val users by viewModel.allUsers.collectAsStateWithLifecycle()
  val issueReports by viewModel.allIssueReports.collectAsStateWithLifecycle()

  val currentRole = profile?.userRole ?: "OWNER"
  val canManageRoles = currentRole in listOf("OWNER", "SPECIALTY_ADMIN", "REPRESENTATIVE")

  var selectedTab by remember { mutableStateOf(0) }

  var showUploadDialog by remember { mutableStateOf(false) }
  var uploadContentType by remember { mutableStateOf("محاضرة") }
  var visibilityScope by remember { mutableStateOf("تخصص كامل") }
  var targetGroupText by remember { mutableStateOf("الكل") }

  // Hierarchical scope IDs
  var scopeInstitutionId by remember { mutableStateOf(1L) }
  var scopeSpecialtyId by remember { mutableStateOf(profile?.selectedSpecialtyId ?: 1L) }
  var scopeYearId by remember { mutableStateOf(profile?.selectedYearId ?: 1L) }
  var scopeCohortId by remember { mutableStateOf<Long?>(null) }

  var statusMessage by remember { mutableStateOf<String?>(null) }
  var showAddStudentDialog by remember { mutableStateOf(false) }

  // State for Role Assignment Dialog
  var targetUserForRole by remember { mutableStateOf<AppUser?>(null) }
  var targetUserForDeletion by remember { mutableStateOf<AppUser?>(null) }

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
          Text(
            text = "هل أنت متأكد من حذف الحساب الخاص بـ:",
            style = MaterialTheme.typography.bodyMedium
          )
          Surface(
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(10.dp)) {
              Text(userToDelete.fullName, fontWeight = FontWeight.Bold)
              Text(
                "${userToDelete.email} • رتبته: ${
                  when (userToDelete.role) {
                    "SPECIALTY_ADMIN" -> "مسؤول تخصص"
                    "REPRESENTATIVE" -> "ممثل فوج"
                    else -> "طالب"
                  }
                }",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
              )
            }
          }
          Text(
            text = "سيتم إلغاء وصول هذا المستخدم وسحب كافة صلاحياته من المنظومة.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.deleteUser(userToDelete)
            statusMessage = "تم حذف المستخدم [${userToDelete.fullName}] وسحب صلاحياته بنجاح 🗑️"
            targetUserForDeletion = null
          },
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("تأكيد الحذف النهائي")
        }
      },
      dismissButton = {
        TextButton(onClick = { targetUserForDeletion = null }) {
          Text("إلغاء")
        }
      }
    )
  }

  // Upload Content Dialog
  if (showUploadDialog) {
    var selectedModId by remember { mutableStateOf(modules.firstOrNull()?.id ?: 1L) }
    var titleText by remember { mutableStateOf("") }
    var contentText by remember { mutableStateOf("") }
    var urgencyText by remember { mutableStateOf("عام") }
    var modExpanded by remember { mutableStateOf(false) }

    // Dynamic Week & Duration
    var weekNumberText by remember { mutableStateOf("1") }
    var durationMinutesText by remember { mutableStateOf("90") }

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
        // Query display name
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (cursor.moveToFirst() && nameIndex >= 0) {
            selectedFileName = cursor.getString(nameIndex)
          }
        }
        if (selectedFileName.isBlank()) {
          selectedFileName = "lecture_${System.currentTimeMillis()}.pdf"
        }
      }
    }

    AlertDialog(
      onDismissRequest = { if (!isUploadingFile) showUploadDialog = false },
      title = {
        Text("رفع ونشر: $uploadContentType", fontWeight = FontWeight.Black)
      },
      text = {
        LazyColumn(
          modifier = Modifier.fillMaxWidth(),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          // Mandatory Visibility Scope selector
          item {
            Card(
              shape = RoundedCornerShape(12.dp),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f))
            ) {
              Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("من يرى هذا المحتوى؟ (نطاق الظهور الإلزامي):", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                  listOf("تخصص كامل", "عدة أفواج محددة", "فوج واحد").forEach { sc ->
                    FilterChip(
                      selected = visibilityScope == sc,
                      onClick = {
                        visibilityScope = sc
                        targetGroupText = when (sc) {
                          "تخصص كامل" -> "الكل"
                          "فوج واحد" -> profile?.groupNumber ?: "الفوج 01"
                          else -> "الأفواج 01، 02، 03"
                        }
                      },
                      label = { Text(sc, fontSize = 10.sp) }
                    )
                  }
                }
                if (visibilityScope != "تخصص كامل") {
                  OutlinedTextField(
                    value = targetGroupText,
                    onValueChange = { targetGroupText = it },
                    label = { Text("الأفواج المستهدفة") },
                    modifier = Modifier.fillMaxWidth()
                  )
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

          item {
            OutlinedTextField(
              value = contentText,
              onValueChange = { contentText = it },
              label = { Text(if (uploadContentType == "إعلان") "نص الإعلان" else "الملخص / التفاصيل") },
              minLines = 2,
              modifier = Modifier.fillMaxWidth()
            )
          }

          // Specific dynamic fields for Lecture
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
                  Text(
                    text = "ملف المحاضرة (PDF حقيقي):",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                  )

                  if (selectedFileName.isNotBlank()) {
                    Row(
                      modifier = Modifier.fillMaxWidth(),
                      verticalAlignment = Alignment.CenterVertically,
                      horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                      Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                      ) {
                        Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = Color(0xFFE11D48))
                        Text(
                          text = selectedFileName,
                          style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                          maxLines = 1
                        )
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

                  if (uploadError != null) {
                    Text(
                      text = uploadError ?: "",
                      style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.error)
                    )
                  }

                  if (isUploadingFile) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                  }
                }
              }
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
              uploadError = null
              try {
                val inputStream = context.contentResolver.openInputStream(selectedFileUri!!)
                val bytes = inputStream?.readBytes() ?: ByteArray(0)
                inputStream?.close()

                if (bytes.isNotEmpty()) {
                  viewModel.uploadLecturePdf(selectedFileName, bytes) { result ->
                    isUploadingFile = false
                    result.fold(
                      onSuccess = { publicUrl ->
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
                        statusMessage = "تم رفع الملف ونشر المحاضرة بنجاح! 🚀"
                      },
                      onFailure = { err ->
                        // Fallback: save locally and notify
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
                        statusMessage = "تم حفظ المحاضرة محلياً (${err.localizedMessage ?: "خطأ سحابي"})"
                      }
                    )
                  }
                } else {
                  isUploadingFile = false
                  uploadError = "تعذر قراءة ملف الـ PDF المختار"
                }
              } catch (e: Exception) {
                isUploadingFile = false
                uploadError = "خطأ أثناء قراءة الملف: ${e.message}"
              }
            } else {
              // Other content types or lecture without file
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
                    date = "خلال أسبوع الامتحانات",
                    time = "09:00",
                    room = "قاعة 12",
                    coeff = 3.0,
                    visibilityScope = visibilityScope,
                    targetGroup = targetGroupText
                  )
                }
                "حصة جدول" -> {
                  viewModel.addScheduleItem(
                    dayOfWeek = 1,
                    startTime = "08:30",
                    endTime = "10:00",
                    moduleName = titleText,
                    type = "أعمال موجهة TD",
                    room = "قاعة 10",
                    professor = "أستاذ المقياس",
                    visibilityScope = visibilityScope,
                    targetGroup = targetGroupText
                  )
                }
              }
              showUploadDialog = false
              statusMessage = "تم نشر $uploadContentType فوراً بنطاق [$visibilityScope] بنجاح! 🚀"
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text(if (isUploadingFile) "جارٍ الرفع..." else "نشر فوري بدون مراجعة")
        }
      },
      dismissButton = {
        TextButton(
          enabled = !isUploadingFile,
          onClick = { showUploadDialog = false }
        ) { Text("إلغاء") }
      }
    )
  }

  // Hierarchy Role & Scope Assignment Dialog
  if (targetUserForRole != null) {
    val targetUser = targetUserForRole!!
    var selectedNewRole by remember { mutableStateOf("REPRESENTATIVE") }
    
    // Structured Hierarchy IDs
    var selectedInstitutionId by remember {
      mutableStateOf(targetUser.scopeInstitutionId ?: institutions.firstOrNull()?.id ?: 1L)
    }
    var selectedSpecId by remember {
      mutableStateOf(targetUser.scopeSpecialtyId ?: specialties.firstOrNull()?.id ?: 1L)
    }
    var selectedYearId by remember {
      mutableStateOf(targetUser.scopeAcademicYearId ?: allAcademicYears.firstOrNull()?.id ?: 2L)
    }
    var selectedGroupId by remember {
      mutableStateOf(targetUser.scopeCohortGroupId ?: allCohortGroups.firstOrNull()?.id ?: 3L)
    }

    // Filtered lists based on database relations
    val availableSpecialties = remember(selectedInstitutionId, specialties) {
      val filtered = specialties.filter { it.institutionId == selectedInstitutionId }
      if (filtered.isNotEmpty()) filtered else specialties
    }
    val availableYears = remember(selectedSpecId, allAcademicYears) {
      val filtered = allAcademicYears.filter { it.specialtyId == selectedSpecId }
      if (filtered.isNotEmpty()) filtered else allAcademicYears
    }
    val availableGroups = remember(selectedSpecId, selectedYearId, allCohortGroups) {
      val filtered = allCohortGroups.filter { it.specialtyId == selectedSpecId && it.academicYearId == selectedYearId }
      if (filtered.isNotEmpty()) filtered else allCohortGroups
    }

    val currentSelectedInstitution = institutions.find { it.id == selectedInstitutionId }
    val currentSelectedSpec = specialties.find { it.id == selectedSpecId }
    val currentSelectedYear = allAcademicYears.find { it.id == selectedYearId }
    val currentSelectedGroup = allCohortGroups.find { it.id == selectedGroupId }

    AlertDialog(
      onDismissRequest = { targetUserForRole = null },
      title = {
        Text("تعيين رتبة ونطاق إشراف لـ: ${targetUser.fullName}", fontWeight = FontWeight.Bold, fontSize = 16.sp)
      },
      text = {
        LazyColumn(
          modifier = Modifier.fillMaxWidth(),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          item {
            Text("اختر الرتبة الصادرة:", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              if (currentRole == "OWNER") {
                FilterChip(
                  selected = selectedNewRole == "SPECIALTY_ADMIN",
                  onClick = { selectedNewRole = "SPECIALTY_ADMIN" },
                  label = { Text("مسؤول تخصص") }
                )
              }
              FilterChip(
                selected = selectedNewRole == "REPRESENTATIVE",
                onClick = { selectedNewRole = "REPRESENTATIVE" },
                label = { Text("ممثل فوج/دفعة") }
              )
              FilterChip(
                selected = selectedNewRole == "STUDENT",
                onClick = { selectedNewRole = "STUDENT" },
                label = { Text("إرجاع كطالب") }
              )
            }
          }

          if (selectedNewRole != "STUDENT") {
            item {
              HorizontalDivider()
              Text(
                text = "تحديد شجرة النطاق بالمعرفات الحقيقية (Entity IDs):",
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
              )
            }

            // 1. Institution selection by ID
            item {
              Text("المؤسسة الجامعية (Institution ID):", style = MaterialTheme.typography.labelSmall)
              Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                institutions.forEach { inst ->
                  FilterChip(
                    selected = selectedInstitutionId == inst.id,
                    onClick = {
                      selectedInstitutionId = inst.id
                      val matchSpec = specialties.firstOrNull { it.institutionId == inst.id }
                      if (matchSpec != null) selectedSpecId = matchSpec.id
                    },
                    label = { Text("${inst.nameAr.substringBefore(" -")} [#${inst.id}]", fontSize = 11.sp) }
                  )
                }
              }
            }

            // 2. Specialty selection by ID
            item {
              Text("التخصص الأكاديمي (Specialty ID):", style = MaterialTheme.typography.labelSmall)
              Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                availableSpecialties.forEach { sp ->
                  FilterChip(
                    selected = selectedSpecId == sp.id,
                    onClick = {
                      selectedSpecId = sp.id
                      val matchYr = allAcademicYears.firstOrNull { it.specialtyId == sp.id }
                      if (matchYr != null) selectedYearId = matchYr.id
                    },
                    label = { Text("${sp.nameAr} [#${sp.id}]", fontSize = 11.sp) }
                  )
                }
              }
            }

            // 3. Representative Year and Group selections by ID
            if (selectedNewRole == "REPRESENTATIVE") {
              item {
                Text("السنة الدراسية (Academic Year ID):", style = MaterialTheme.typography.labelSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                  availableYears.take(4).forEach { yr ->
                    FilterChip(
                      selected = selectedYearId == yr.id,
                      onClick = {
                        selectedYearId = yr.id
                        val matchGrp = allCohortGroups.firstOrNull { it.specialtyId == selectedSpecId && it.academicYearId == yr.id }
                        if (matchGrp != null) selectedGroupId = matchGrp.id
                      },
                      label = { Text("${yr.yearName} [#${yr.id}]", fontSize = 11.sp) }
                    )
                  }
                }
              }

              item {
                Text("الفوج المعني (Cohort Group ID):", style = MaterialTheme.typography.labelSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                  availableGroups.take(5).forEach { grp ->
                    FilterChip(
                      selected = selectedGroupId == grp.id,
                      onClick = { selectedGroupId = grp.id },
                      label = { Text("${grp.groupName} [#${grp.id}]", fontSize = 11.sp) }
                    )
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
                yearId = null,
                groupId = null,
                scopeDescription = "${currentSelectedInstitution?.nameAr ?: ""} • ${currentSelectedSpec?.nameAr ?: ""}"
              )
              "REPRESENTATIVE" -> ScopeAssignment(
                institutionId = selectedInstitutionId,
                specialtyId = selectedSpecId,
                yearId = selectedYearId,
                groupId = selectedGroupId,
                scopeDescription = "${currentSelectedSpec?.nameAr ?: ""} • ${currentSelectedYear?.yearName ?: ""} • ${currentSelectedGroup?.groupName ?: ""}"
              )
              else -> ScopeAssignment(
                institutionId = selectedInstitutionId,
                specialtyId = selectedSpecId,
                yearId = selectedYearId,
                groupId = selectedGroupId,
                scopeDescription = "طالب"
              )
            }
            viewModel.updateUserRole(targetUser.id, selectedNewRole, scopeAssignment)
            statusMessage = "تم تعيين ${targetUser.fullName} بنجاح كـ [$selectedNewRole] بمعرفات نطاق فعلية: [Specialty ID: $selectedSpecId, Year ID: ${if (selectedNewRole == "REPRESENTATIVE") selectedYearId else "-"}, Group ID: ${if (selectedNewRole == "REPRESENTATIVE") selectedGroupId else "-"}] 🎯"
            targetUserForRole = null
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("تأكيد التعيين بالمعرفات الفعلية")
        }
      },
      dismissButton = {
        TextButton(onClick = { targetUserForRole = null }) {
          Text("إلغاء")
        }
      }
    )
  }

  // Add Student Dialog
  if (showAddStudentDialog) {
    var sName by remember { mutableStateOf("") }
    var sEmail by remember { mutableStateOf("") }
    var sId by remember { mutableStateOf("20263108") }
    var sGroup by remember { mutableStateOf(profile?.groupNumber ?: "الفوج 03") }

    AlertDialog(
      onDismissRequest = { showAddStudentDialog = false },
      title = { Text("إضافة طالب جديد للفوج يدوياً", fontWeight = FontWeight.Bold) },
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
            label = { Text("البريد الإلكتروني الجامعي") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = sId,
            onValueChange = { sId = it },
            label = { Text("رقم التسجيل") },
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
            if (sName.isNotBlank() && sEmail.isNotBlank()) {
              viewModel.addUser(sName, sEmail, sId, sGroup, "STUDENT")
              showAddStudentDialog = false
              statusMessage = "تمت إضافة الطالب $sName إلى قائمة الفوج بنجاح! 🎓"
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
            Text("لوحة الإدارة والرتب", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = "رتبتك الحالية: ${
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
            text = { Text("إدارة الرتب والأفواج", fontWeight = FontWeight.Bold) }
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

      // TAB 0: إدارة الاتصال السحابي بـ Supabase والمزامنة الفورية
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
                  Text("الاتصال السحابي المباشر بـ Supabase", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black))
                  Text("قاعدة بيانات سحابية وتخزين لحظي مع استمرارية العمل دون إنترنت", style = MaterialTheme.typography.bodySmall)
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

        item {
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
              Text("معلومات الجداول السحابية (Schema):", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
              Text(
                "تمت تهيئة الجداول في التطبيق: modules, lectures, announcements, schedules, exams مع دعم النطاقات الهرمية بالمعرفات (institution_id, specialty_id, year_id, cohort_id).",
                style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
              )
              Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.fillMaxWidth()
              ) {
                Text(
                  text = "SUPABASE_URL: مُهيأ من إعدادات البيئة\nSUPABASE_ANON_KEY: مفتاح الاتصال المشفر مُدمج\nوضع التخزين: Offline-First مع التحديث عند توفر الإنترنت",
                  modifier = Modifier.padding(10.dp),
                  style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp)
                )
              }
            }
          }
        }
      }

      // TAB 1: واجهة الرفع الموحدة لأنواع المحتوى الأربعة
      if (selectedTab == 1) {
        item {
          Text(
            text = "شاشة الرفع الموحدة (نشر فوري بثقة كاملة):",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
          )
        }

        item {
          Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(
              Triple("محاضرة وملف دراسي", "رفع وتخزين ملفات PDF وملخصات المحاضرات", Icons.Default.Description),
              Triple("إعلان بيداغوجي", "نشر تنبيه عاجل أو هام للطلبة", Icons.Default.Campaign),
              Triple("حصة جدول دراسي", "إضافة أو تعديل توقيت وقاعة حصة", Icons.Default.CalendarMonth),
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
                    title.contains("جدول") -> "حصة جدول"
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

      // TAB 2: إدارة المستخدمين والرتب
      if (selectedTab == 2) {
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
            Column(
              modifier = Modifier.padding(14.dp),
              verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Row(
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
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
                    Text("${u.groupNumber} • ${u.email}", style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant))
                  }
                }

                Box(
                  modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                  val idTag = if (u.scopeSpecialtyId != null && u.role != "STUDENT") {
                    val groupStr = if (u.scopeCohortGroupId != null) " • G#${u.scopeCohortGroupId}" else ""
                    " [S#${u.scopeSpecialtyId}$groupStr]"
                  } else ""

                  Text(
                    text = when (u.role) {
                      "OWNER" -> "المالك"
                      "SPECIALTY_ADMIN" -> "مسؤول تخصص$idTag"
                      "REPRESENTATIVE" -> "ممثل (${u.representativeScope})$idTag"
                      else -> "طالب"
                    },
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
                  )
                }
              }

              // Hierarchical Management: Role change and Delete user buttons
              val userLevel = when (u.role) {
                "OWNER" -> 4
                "SPECIALTY_ADMIN" -> 3
                "REPRESENTATIVE" -> 2
                else -> 1 // STUDENT
              }
              val myLevel = when (currentRole) {
                "OWNER" -> 4
                "SPECIALTY_ADMIN" -> 3
                "REPRESENTATIVE" -> 2
                else -> 1
              }

              // A supervisor can manage and delete users whose rank is lower than theirs
              val canDeleteThisUser = myLevel > userLevel && u.role != "OWNER"

              if (canManageRoles && u.role != "OWNER") {
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                  // Promotion & Scope Assignment Button
                  Button(
                    onClick = { targetUserForRole = u },
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f)
                  ) {
                    Icon(Icons.Default.ManageAccounts, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("تعيين رتبة ⚙️", style = MaterialTheme.typography.labelMedium)
                  }

                  // Delete User Button (Enabled strictly when supervisor rank is higher)
                  if (canDeleteThisUser) {
                    FilledTonalButton(
                      onClick = { targetUserForDeletion = u },
                      shape = RoundedCornerShape(10.dp),
                      colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.error
                      )
                    ) {
                      Icon(Icons.Default.PersonRemove, contentDescription = "حذف المستخدم", modifier = Modifier.size(18.dp))
                      Spacer(modifier = Modifier.width(4.dp))
                      Text("حذف 🗑️", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                    }
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
          Text(
            text = "التبليغات والشكاوى المباشرة الواردة من الطلبة:",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
          )
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
              Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
              ) {
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text(
                    text = "من: ${rep.studentName} (${rep.studentGroup})",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                  )
                  Box(
                    modifier = Modifier
                      .clip(RoundedCornerShape(6.dp))
                      .background(if (rep.status == "تم الحل") Color(0xFF10B981) else Color(0xFFF59E0B))
                      .padding(horizontal = 8.dp, vertical = 2.dp)
                  ) {
                    Text(
                      text = rep.status,
                      style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontWeight = FontWeight.Bold)
                    )
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

                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                  Button(
                    onClick = {
                      viewModel.updateIssueReportStatus(rep, "تم الحل", "تم تصحيح الملف/الجدول بنجاح")
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
