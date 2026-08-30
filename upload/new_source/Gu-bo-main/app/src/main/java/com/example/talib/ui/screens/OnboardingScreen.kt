package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.talib.data.local.StudentProfile
import com.example.talib.ui.viewmodel.TalibViewModel
import kotlin.random.Random

@Composable
fun OnboardingScreen(
  viewModel: TalibViewModel,
  onComplete: () -> Unit
) {
  var isLoginMode by remember { mutableStateOf(false) }
  // Steps: 1: Name & Email, 2: Institution, 3: Specialty, 4: Track (الملمح), 5: Academic Year, 6: Confirmation
  var step by remember { mutableStateOf(1) }
  val totalSteps = 6

  // Student Input Fields
  var firstName by remember { mutableStateOf("") }
  var lastName by remember { mutableStateOf("") }
  var email by remember { mutableStateOf("") }
  var generatedStudentId by remember {
    mutableStateOf("2026-TLB-${Random.nextInt(1000, 9999)}")
  }

  // Academic Configuration (Strict sequence: Institution -> Specialty -> Track -> Year)
  var selectedInstitution by remember { mutableStateOf("المدرسة العليا للأساتذة - بوزريعة (ENS)") }
  var selectedSpecialty by remember { mutableStateOf("اللغة والأدب العربي") }
  var selectedTrack by remember { mutableStateOf("أستاذ التعليم الثانوي") }
  var selectedYear by remember { mutableStateOf("السنة الأولى") }
  var selectedSemester by remember { mutableStateOf("السداسي الأول") }

  // Login inputs (Alternative login: Name + Last Name + Optional Email)
  var loginFirstName by remember { mutableStateOf("") }
  var loginLastName by remember { mutableStateOf("") }
  var loginEmail by remember { mutableStateOf("") }
  var errorMessage by remember { mutableStateOf<String?>(null) }

  val institutions = listOf(
    "المدرسة العليا للأساتذة - بوزريعة (ENS)",
    "المدرسة العليا للأساتذة - القبة (ENS)",
    "المدرسة العليا للأساتذة - قسنطينة (ENS)",
    "المدرسة العليا للأساتذة - وهران (ENS)",
    "المدرسة العليا للأساتذة - الأغواط (ENS)",
    "جامعة الجزائر 1 - بن يوسف بن خدة",
    "جامعة الجزائر 2 - أبو القاسم سعد الله",
    "جامعة الجزائر 3 - إبراهيم سلطان شيبوط",
    "جامعة العلوم والتكنولوجيا - هواري بومدين (USTHB)",
    "جامعة قسنطينة 1 - الإخوة منتوري",
    "جامعة وهران 1 - أحمد بن بلة",
    "جامعة سطيف 1 - فرحات عباس"
  )

  val specialtiesMap = mapOf(
    "المدرسة العليا للأساتذة - بوزريعة (ENS)" to listOf(
      "اللغة والأدب العربي",
      "اللغة الإنجليزية",
      "اللغة الفرنسية",
      "التاريخ والجغرافيا",
      "الفلسفة",
      "علوم التربية"
    ),
    "المدرسة العليا للأساتذة - القبة (ENS)" to listOf(
      "الرياضيات",
      "الفيزياء والكيمياء",
      "العلوم الطبيعية والحياة",
      "الإعلام الآلي"
    ),
    "جامعة العلوم والتكنولوجيا - هواري بومدين (USTHB)" to listOf(
      "الإعلام الآلي وتطوير البرمجيات",
      "الذكاء الاصطناعي وعلوم البيانات",
      "الرياضيات التطبيقية",
      "الإلكترونيك والاتصالات",
      "الهندسة المدنية"
    )
  )

  val tracksMap = mapOf(
    "اللغة والأدب العربي" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)",
      "أستاذ التعليم الابتدائي (PEP)",
      "دراسات لغوية ولسانيات (عام)"
    ),
    "اللغة الإنجليزية" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)",
      "أستاذ التعليم الابتدائي (PEP)",
      "أدب وحضارة إنجليزية"
    ),
    "اللغة الفرنسية" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)",
      "أستاذ التعليم الابتدائي (PEP)"
    ),
    "التاريخ والجغرافيا" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)"
    ),
    "الرياضيات" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)",
      "أستاذ التعليم الابتدائي (PEP)",
      "رياضيات عامة"
    ),
    "الفيزياء والكيمياء" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)"
    ),
    "العلوم الطبيعية والحياة" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)"
    ),
    "الإعلام الآلي" to listOf(
      "أستاذ التعليم الثانوي (PES)",
      "أستاذ التعليم المتوسط (PEM)",
      "أنظمة معلومات وبرمجيات"
    ),
    "الإعلام الآلي وتطوير البرمجيات" to listOf(
      "هندسة البرمجيات ونظم المعلومات",
      "نظم وشبكات موزعة",
      "الذكاء الاصطناعي"
    )
  )

  val years = listOf("السنة الأولى", "السنة الثانية", "السنة الثالثة", "السنة الرابعة", "السنة الخامسة (ماستر 2)")
  val semesters = listOf("السداسي الأول", "السداسي الثاني")

  val purplePrimary = MaterialTheme.colorScheme.primary

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("onboarding_screen"),
    topBar = {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .background(MaterialTheme.colorScheme.surface)
          .padding(horizontal = 20.dp, vertical = 16.dp)
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
                .size(42.dp)
                .clip(CircleShape)
                .background(purplePrimary),
              contentAlignment = Alignment.Center
            ) {
              Icon(Icons.Default.School, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            }
            Column {
              Text(
                text = "طالب | Tâlib",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )
              Text(
                text = if (isLoginMode) "تسجيل الدخول إلى حسابك" else "بوابة التسجيل الأكاديمي",
                style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
              )
            }
          }

          TextButton(
            onClick = {
              isLoginMode = !isLoginMode
              errorMessage = null
            }
          ) {
            Text(
              text = if (isLoginMode) "إنشاء حساب جديد" else "تسجيل الدخول",
              fontWeight = FontWeight.Bold,
              color = purplePrimary
            )
          }
        }

        if (!isLoginMode) {
          Spacer(modifier = Modifier.height(12.dp))
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Text(
              text = when (step) {
                1 -> "1. الهوية والاسم"
                2 -> "2. المؤسسة الجامعية"
                3 -> "3. التخصص"
                4 -> "4. الملمح الأكاديمي"
                5 -> "5. السنة والسداسي"
                else -> "6. تأكيد بطاقة الطالب"
              },
              style = MaterialTheme.typography.labelMedium.copy(color = purplePrimary, fontWeight = FontWeight.Bold)
            )
            Text(
              text = "الخطوة $step من $totalSteps",
              style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }

          Spacer(modifier = Modifier.height(6.dp))
          LinearProgressIndicator(
            progress = { step / totalSteps.toFloat() },
            modifier = Modifier
              .fillMaxWidth()
              .height(6.dp)
              .clip(RoundedCornerShape(3.dp)),
            color = purplePrimary,
            trackColor = purplePrimary.copy(alpha = 0.2f)
          )
        }
      }
    }
  ) { padding ->
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .padding(horizontal = 20.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
      contentPadding = PaddingValues(top = 16.dp, bottom = 32.dp)
    ) {
      if (errorMessage != null) {
        item {
          Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
          ) {
            Text(
              text = errorMessage ?: "",
              color = MaterialTheme.colorScheme.onErrorContainer,
              modifier = Modifier.padding(14.dp),
              style = MaterialTheme.typography.bodyMedium
            )
          }
        }
      }

      // LOGIN MODE (Name + Last Name + Optional Email - No Password)
      if (isLoginMode) {
        item {
          Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = purplePrimary.copy(alpha = 0.08f)),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
              Text(
                text = "مرحباً بك مجدداً في طالب 🎓",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )
              Text(
                text = "تسجيل الدخول في طالب لا يتطلب كلمة مرور. أدخل اسمك ولقبك لاستعادة حسابك أو التعرف على جهازك تلقائياً.",
                style = MaterialTheme.typography.bodySmall
              )
            }
          }
        }

        item {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
          ) {
            OutlinedTextField(
              value = loginFirstName,
              onValueChange = { loginFirstName = it },
              label = { Text("الاسم") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.weight(1f),
              singleLine = true
            )
            OutlinedTextField(
              value = loginLastName,
              onValueChange = { loginLastName = it },
              label = { Text("اللقب") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.weight(1f),
              singleLine = true
            )
          }
        }

        item {
          OutlinedTextField(
            value = loginEmail,
            onValueChange = { loginEmail = it },
            label = { Text("البريد الإلكتروني (اختياري)") },
            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
          )
        }

        item {
          Button(
            onClick = {
              if (loginFirstName.isBlank() || loginLastName.isBlank()) {
                errorMessage = "يرجى إدخال الاسم واللقب للمتابعة"
              } else {
                val full = "${loginFirstName.trim()} ${loginLastName.trim()}"
                viewModel.updateProfile(
                  StudentProfile(
                    fullName = full,
                    studentId = "2026-TLB-${Random.nextInt(1000, 9999)}",
                    email = if (loginEmail.isNotBlank()) loginEmail.trim() else "student@talib.dz",
                    institution = selectedInstitution,
                    university = selectedInstitution,
                    specialtyName = selectedSpecialty,
                    profileTrack = selectedTrack,
                    academicYearName = selectedYear,
                    semesterName = selectedSemester,
                    groupNumber = "", // Assigned later by supervisor
                    isConfigured = true
                  )
                )
                onComplete()
              }
            },
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = purplePrimary),
            modifier = Modifier.fillMaxWidth().height(52.dp)
          ) {
            Text("دخول التطبيق مباشرة 🎓", fontWeight = FontWeight.Bold, fontSize = 16.sp)
          }
        }
      } else {
        // REGISTRATION STEP 1: Name & Email
        if (step == 1) {
          item {
            Card(
              shape = RoundedCornerShape(18.dp),
              colors = CardDefaults.cardColors(containerColor = purplePrimary.copy(alpha = 0.08f)),
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
              ) {
                Icon(Icons.Default.Badge, contentDescription = null, tint = purplePrimary, modifier = Modifier.size(32.dp))
                Column {
                  Text("البيانات الشخصية", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                  Text("أدخل اسمك ولقبك وبريدك الإلكتروني. سيُمنح لك رقم تسلسلي تلقائياً.", style = MaterialTheme.typography.bodySmall)
                }
              }
            }
          }

          item {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
              OutlinedTextField(
                value = firstName,
                onValueChange = { firstName = it },
                label = { Text("الاسم") },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f),
                singleLine = true
              )
              OutlinedTextField(
                value = lastName,
                onValueChange = { lastName = it },
                label = { Text("اللقب") },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f),
                singleLine = true
              )
            }
          }

          item {
            OutlinedTextField(
              value = email,
              onValueChange = { email = it },
              label = { Text("البريد الإلكتروني (اختياري)") },
              leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth(),
              singleLine = true
            )
          }

          item {
            Card(
              shape = RoundedCornerShape(16.dp),
              colors = CardDefaults.cardColors(containerColor = purplePrimary.copy(alpha = 0.06f)),
              border = androidx.compose.foundation.BorderStroke(1.dp, purplePrimary.copy(alpha = 0.3f)),
              modifier = Modifier.fillMaxWidth()
            ) {
              Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                  text = "الرقم التسلسلي الأكاديمي الممنوح لك تلقائياً:",
                  style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                  text = generatedStudentId,
                  style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Black,
                    color = purplePrimary,
                    letterSpacing = 1.sp
                  )
                )
              }
            }
          }
        }

        // STEP 2: Institution
        if (step == 2) {
          item {
            Text("اختر المؤسسة الجامعية:", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
          }

          items(institutions.size) { index ->
            val inst = institutions[index]
            val isSelected = inst == selectedInstitution
            Card(
              shape = RoundedCornerShape(14.dp),
              colors = CardDefaults.cardColors(
                containerColor = if (isSelected) purplePrimary.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surface
              ),
              onClick = { 
                selectedInstitution = inst 
                // Reset specialty if institution changes
                val availableSpecs = specialtiesMap[inst] ?: listOf("اللغة والأدب العربي", "الرياضيات")
                if (selectedSpecialty notIn availableSpecs) {
                  selectedSpecialty = availableSpecs.firstOrNull() ?: "اللغة والأدب العربي"
                }
              },
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.fillMaxWidth().padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
              ) {
                RadioButton(selected = isSelected, onClick = { selectedInstitution = inst })
                Text(inst, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
              }
            }
          }
        }

        // STEP 3: Specialty
        if (step == 3) {
          item {
            Text("اختر التخصص الجامعي:", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
          }

          val specs = specialtiesMap[selectedInstitution] ?: listOf(
            "اللغة والأدب العربي",
            "اللغة الإنجليزية",
            "الرياضيات",
            "الإعلام الآلي وتطوير البرمجيات",
            "العلوم الطبيعية والحياة"
          )

          items(specs.size) { index ->
            val spec = specs[index]
            val isSelected = spec == selectedSpecialty
            Card(
              shape = RoundedCornerShape(14.dp),
              colors = CardDefaults.cardColors(
                containerColor = if (isSelected) purplePrimary.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surface
              ),
              onClick = { 
                selectedSpecialty = spec
                val availableTracks = tracksMap[spec] ?: listOf("أستاذ التعليم الثانوي", "أستاذ التعليم المتوسط", "أستاذ التعليم الابتدائي")
                selectedTrack = availableTracks.firstOrNull() ?: "أستاذ التعليم الثانوي"
              },
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.fillMaxWidth().padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
              ) {
                RadioButton(selected = isSelected, onClick = { selectedSpecialty = spec })
                Text(spec, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
              }
            }
          }
        }

        // STEP 4: Profile Track (الملمح)
        if (step == 4) {
          item {
            Text("اختر الملمح الأكاديمي والتكويني:", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
          }

          val tracks = tracksMap[selectedSpecialty] ?: listOf(
            "أستاذ التعليم الثانوي (PES)",
            "أستاذ التعليم المتوسط (PEM)",
            "أستاذ التعليم الابتدائي (PEP)",
            "تكوين أكاديمي عام"
          )

          items(tracks.size) { index ->
            val track = tracks[index]
            val isSelected = track == selectedTrack
            Card(
              shape = RoundedCornerShape(14.dp),
              colors = CardDefaults.cardColors(
                containerColor = if (isSelected) purplePrimary.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surface
              ),
              onClick = { selectedTrack = track },
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.fillMaxWidth().padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
              ) {
                RadioButton(selected = isSelected, onClick = { selectedTrack = track })
                Text(track, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
              }
            }
          }
        }

        // STEP 5: Academic Year & Semester (NO GROUP STEP!)
        if (step == 5) {
          item {
            Text("السنة والمستوى الدراسي:", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
            Spacer(modifier = Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
              years.forEach { yr ->
                val isSelected = yr == selectedYear
                Card(
                  shape = RoundedCornerShape(12.dp),
                  colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) purplePrimary.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface
                  ),
                  onClick = { selectedYear = yr },
                  modifier = Modifier.fillMaxWidth()
                ) {
                  Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                  ) {
                    RadioButton(selected = isSelected, onClick = { selectedYear = yr })
                    Text(yr, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                  }
                }
              }
            }
          }

          item {
            Spacer(modifier = Modifier.height(10.dp))
            Text("السداسي (Semester):", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
              semesters.forEach { sem ->
                FilterChip(
                  selected = sem == selectedSemester,
                  onClick = { selectedSemester = sem },
                  label = { Text(sem) },
                  modifier = Modifier.weight(1f)
                )
              }
            }
          }

          item {
            Card(
              shape = RoundedCornerShape(14.dp),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
              ) {
                Icon(Icons.Default.Info, contentDescription = null, tint = purplePrimary)
                Text(
                  text = "ملاحظة: لا يُختار الفوج عند التسجيل. بعد إتمام التسجيل ستبقى بحالة 'بلا فوج' وترى محتوى تخصصك الكامل، حتى يُضيفك ممثل الفوج أو المشرف لفوجه يدوياً.",
                  style = MaterialTheme.typography.bodySmall
                )
              }
            }
          }
        }

        // STEP 6: Confirmation & ID Card Preview
        if (step == 6) {
          item {
            Text(
              text = "بطاقة الطالب الرقمية الصادرة لك 🎓",
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
            )
          }

          val fullName = if (firstName.isNotBlank() && lastName.isNotBlank()) "${firstName.trim()} ${lastName.trim()}" else "طالب جامعي"
          val displayEmail = if (email.isNotBlank()) email.trim() else "طالب جديد"

          item {
            Card(
              shape = RoundedCornerShape(22.dp),
              colors = CardDefaults.cardColors(containerColor = purplePrimary),
              elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
              modifier = Modifier.fillMaxWidth()
            ) {
              Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
              ) {
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Column {
                    Text(
                      text = "الجمهورية الجزائرية الديمقراطية الشعبية",
                      style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f), fontSize = 10.sp)
                    )
                    Text(
                      text = "بطاقة الطالب الجامعية الرسمية",
                      style = MaterialTheme.typography.labelMedium.copy(color = Color.White.copy(alpha = 0.9f), fontWeight = FontWeight.Bold)
                    )
                  }
                  Box(
                    modifier = Modifier
                      .size(46.dp)
                      .clip(CircleShape)
                      .background(Color.White.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                  ) {
                    Icon(Icons.Default.School, contentDescription = null, tint = Color.White, modifier = Modifier.size(26.dp))
                  }
                }

                HorizontalDivider(color = Color.White.copy(alpha = 0.25f))

                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Column {
                    Text("الاسم واللقب:", style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f)))
                    Text(
                      text = fullName,
                      style = MaterialTheme.typography.titleMedium.copy(color = Color.White, fontWeight = FontWeight.Black)
                    )
                  }
                  Surface(
                    color = Color(0xFFD4AF37),
                    shape = RoundedCornerShape(8.dp)
                  ) {
                    Text(
                      text = generatedStudentId,
                      modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                      style = MaterialTheme.typography.labelSmall.copy(color = Color(0xFF1E293B), fontWeight = FontWeight.Black)
                    )
                  }
                }

                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween
                ) {
                  Column {
                    Text("المؤسسة والتخصص:", style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f)))
                    Text("$selectedSpecialty ($selectedYear)", style = MaterialTheme.typography.bodySmall.copy(color = Color.White, fontWeight = FontWeight.Bold))
                  }
                  Column(horizontalAlignment = Alignment.End) {
                    Text("الملمح الأكاديمي:", style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f)))
                    Text(selectedTrack, style = MaterialTheme.typography.bodySmall.copy(color = Color.White, fontWeight = FontWeight.Bold))
                  }
                }

                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween
                ) {
                  Text(
                    text = "الفوج: بلا فوج (قيد الإلحاق من المشرف)",
                    style = MaterialTheme.typography.labelSmall.copy(color = Color(0xFFFFD54F), fontWeight = FontWeight.Bold)
                  )
                  Text(
                    text = displayEmail,
                    style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.8f))
                  )
                }
              }
            }
          }
        }

        // Navigation Action Buttons
        item {
          Spacer(modifier = Modifier.height(10.dp))
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            if (step > 1) {
              OutlinedButton(
                onClick = { step-- },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f)
              ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("السابق")
              }
            }

            Button(
              onClick = {
                if (step == 1 && (firstName.isBlank() || lastName.isBlank())) {
                  errorMessage = "يرجى كتابة الاسم واللقب للمتابعة"
                } else if (step < totalSteps) {
                  errorMessage = null
                  step++
                } else {
                  val fullName = if (firstName.isNotBlank() && lastName.isNotBlank()) "${firstName.trim()} ${lastName.trim()}" else "طالب جامعي"
                  val displayEmail = if (email.isNotBlank()) email.trim() else "student@talib.dz"

                  viewModel.updateProfile(
                    StudentProfile(
                      fullName = fullName,
                      studentId = generatedStudentId,
                      email = displayEmail,
                      institution = selectedInstitution,
                      university = selectedInstitution,
                      specialtyName = selectedSpecialty,
                      profileTrack = selectedTrack,
                      academicYearName = selectedYear,
                      semesterName = selectedSemester,
                      groupNumber = "", // STRICT RULE: Student registers without group!
                      isConfigured = true
                    )
                  )
                  onComplete()
                }
              },
              shape = RoundedCornerShape(12.dp),
              colors = ButtonDefaults.buttonColors(containerColor = purplePrimary),
              modifier = Modifier.weight(if (step == 1) 1f else 1.5f)
            ) {
              Text(
                text = if (step == totalSteps) "تأكيد التسجيل ودخول التطبيق 🎓" else "متابعة",
                fontWeight = FontWeight.Bold
              )
              Spacer(modifier = Modifier.width(6.dp))
              Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
            }
          }
        }
      }
    }
  }
}

infix fun <T> T.notIn(collection: Collection<T>): Boolean = !collection.contains(this)
