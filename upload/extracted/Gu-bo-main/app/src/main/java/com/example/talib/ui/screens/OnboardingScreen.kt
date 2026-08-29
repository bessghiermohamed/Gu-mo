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
  var step by remember { mutableStateOf(1) } // 1 to 4 in registration

  // Student Input Fields
  var firstName by remember { mutableStateOf("") }
  var lastName by remember { mutableStateOf("") }
  var email by remember { mutableStateOf("") }
  var generatedStudentId by remember {
    mutableStateOf("2026-TLB-${Random.nextInt(1000, 9999)}")
  }

  // Academic Configuration
  var selectedInstitution by remember { mutableStateOf("المدرسة العليا للأساتذة - بوزريعة (ENS)") }
  var selectedSpecialty by remember { mutableStateOf("اللغة والأدب العربي") }
  var selectedTrack by remember { mutableStateOf("أستاذ التعليم الابتدائي") }
  var selectedYear by remember { mutableStateOf("السنة الثانية (L2)") }
  var selectedSemester by remember { mutableStateOf("السداسي الأول (S1)") }
  var selectedGroup by remember { mutableStateOf("الفوج 03") }

  var loginEmailOrSerial by remember { mutableStateOf("") }
  var errorMessage by remember { mutableStateOf<String?>(null) }

  val institutions = listOf(
    "المدرسة العليا للأساتذة - بوزريعة (ENS)",
    "المدرسة العليا للأساتذة - القبة (ENS)",
    "جامعة الجزائر 1 - بن يوسف بن خدة",
    "جامعة الجزائر 2 - أبو القاسم سعد الله",
    "جامعة العلوم والتكنولوجيا - هواري بومدين (USTHB)",
    "جامعة قسنطينة 1 - الإخوة منتوري",
    "جامعة وهران 1 - أحمد بن بلة",
    "جامعة سطيف 1 - فرحات عباس"
  )

  val specialtiesList = mapOf(
    "المدرسة العليا للأساتذة - بوزريعة (ENS)" to listOf(
      "اللغة والأدب العربي",
      "اللغة الإنجليزية",
      "اللغة الفرنسية",
      "التاريخ والجغرافيا",
      "الفلسفة"
    ),
    "جامعة العلوم والتكنولوجيا - هواري بومدين (USTHB)" to listOf(
      "الإعلام الآلي وتطوير البرمجيات",
      "الذكاء الاصطناعي وعلوم البيانات",
      "الرياضيات التطبيقية",
      "الإلكترونيك والاتصالات"
    )
  )

  val tracksList = mapOf(
    "اللغة والأدب العربي" to listOf(
      "أستاذ التعليم الابتدائي",
      "أستاذ التعليم المتوسط",
      "أستاذ التعليم الثانوي",
      "دراسات لغوية ولسانيات"
    ),
    "الإعلام الآلي وتطوير البرمجيات" to listOf(
      "هندسة البرمجيات ونظم المعلومات",
      "نظم وشبكات موزعة",
      "الذكاء الاصطناعي"
    )
  )

  val years = listOf("السنة الأولى (L1)", "السنة الثانية (L2)", "السنة الثالثة (L3)", "ماستر 1 (M1)", "ماستر 2 (M2)")
  val semesters = listOf("السداسي الأول (S1)", "السداسي الثاني (S2)")
  val groups = listOf("الفوج 01", "الفوج 02", "الفوج 03", "الفوج 04", "الفوج 05", "الفوج 06")

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
                .background(Color(0xFF1B5E4B)),
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
                text = if (isLoginMode) "تسجيل الدخول إلى حسابك" else "بوابة تسجيل الطلاب الجامعية",
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
              color = Color(0xFF1B5E4B)
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
                1 -> "البيانات الشخصية والرقم التسلسلي"
                2 -> "المؤسسة والتخصص الأكاديمي"
                3 -> "السنة الدراسية والفوج"
                else -> "تأكيد بطاقة الطالب الرقمية"
              },
              style = MaterialTheme.typography.labelMedium.copy(color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            )
            Text(
              text = "الخطوة $step من 4",
              style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }

          Spacer(modifier = Modifier.height(6.dp))
          LinearProgressIndicator(
            progress = { step / 4f },
            modifier = Modifier
              .fillMaxWidth()
              .height(6.dp)
              .clip(RoundedCornerShape(3.dp)),
            color = Color(0xFF1B5E4B),
            trackColor = Color(0xFF1B5E4B).copy(alpha = 0.2f)
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

      // LOGIN MODE
      if (isLoginMode) {
        item {
          Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
              Text(
                text = "مرحباً بك مجدداً في طالب",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )
              Text(
                text = "أدخل بريدك الإلكتروني أو رقمك التسلسلي المسجل للمتابعة المباشرة لمقرراتك وفوجك.",
                style = MaterialTheme.typography.bodySmall
              )
            }
          }
        }

        item {
          OutlinedTextField(
            value = loginEmailOrSerial,
            onValueChange = { loginEmailOrSerial = it },
            label = { Text("البريد الإلكتروني أو الرقم التسلسلي (Matricule)") },
            leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
          )
        }

        item {
          Button(
            onClick = {
              if (loginEmailOrSerial.isBlank()) {
                errorMessage = "يرجى إدخال البريد الإلكتروني أو الرقم التسلسلي"
              } else {
                onComplete()
              }
            },
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1B5E4B)),
            modifier = Modifier.fillMaxWidth().height(52.dp)
          ) {
            Text("تسجيل الدخول والمتابعة 🎓", fontWeight = FontWeight.Bold, fontSize = 16.sp)
          }
        }
      } else {
        // REGISTRATION STEP 1: Name, Email & Auto Serial
        if (step == 1) {
          item {
            Card(
              shape = RoundedCornerShape(18.dp),
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)),
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
              ) {
                Icon(Icons.Default.Badge, contentDescription = null, tint = Color(0xFF1B5E4B), modifier = Modifier.size(32.dp))
                Column {
                  Text("بيانات بطاقة الطالب الرسمية", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                  Text("سيتم منحك رقماً تسلسلياً تلقائياً يُعتمد في بطاقتك وقوائم الأساتذة.", style = MaterialTheme.typography.bodySmall)
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
              label = { Text("البريد الإلكتروني") },
              leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth(),
              singleLine = true
            )
          }

          item {
            Card(
              shape = RoundedCornerShape(16.dp),
              colors = CardDefaults.cardColors(containerColor = Color(0xFF1B5E4B).copy(alpha = 0.08f)),
              border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF1B5E4B).copy(alpha = 0.3f)),
              modifier = Modifier.fillMaxWidth()
            ) {
              Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                  text = "الرقم التسلسلي الممنوح في بطاقتك (Matricule):",
                  style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text(
                    text = generatedStudentId,
                    style = MaterialTheme.typography.titleLarge.copy(
                      fontWeight = FontWeight.Black,
                      color = Color(0xFF1B5E4B),
                      letterSpacing = 1.sp
                    )
                  )
                  IconButton(
                    onClick = {
                      generatedStudentId = "2026-TLB-${Random.nextInt(1000, 9999)}"
                    }
                  ) {
                    Icon(Icons.Default.Refresh, contentDescription = "توليد رقم جديد", tint = Color(0xFF1B5E4B))
                  }
                }
              }
            }
          }
        }

        // STEP 2: Institution & Specialty
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
                containerColor = if (isSelected) Color(0xFF1B5E4B).copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surface
              ),
              onClick = { selectedInstitution = inst },
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

          item {
            Spacer(modifier = Modifier.height(10.dp))
            Text("اختر التخصص:", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
          }

          val specs = specialtiesList[selectedInstitution] ?: listOf("اللغة والأدب العربي", "الإعلام الآلي وتطوير البرمجيات")
          items(specs.size) { index ->
            val spec = specs[index]
            val isSelected = spec == selectedSpecialty
            Card(
              shape = RoundedCornerShape(14.dp),
              colors = CardDefaults.cardColors(
                containerColor = if (isSelected) Color(0xFF1B5E4B).copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surface
              ),
              onClick = { selectedSpecialty = spec },
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

        // STEP 3: Year, Semester, and Group
        if (step == 3) {
          item {
            Text("السنة والمستوى الدراسي:", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            Spacer(modifier = Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              years.take(3).forEach { yr ->
                FilterChip(
                  selected = yr == selectedYear,
                  onClick = { selectedYear = yr },
                  label = { Text(yr) }
                )
              }
            }
          }

          item {
            Text("السداسي (Semester):", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            Spacer(modifier = Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              semesters.forEach { sem ->
                FilterChip(
                  selected = sem == selectedSemester,
                  onClick = { selectedSemester = sem },
                  label = { Text(sem) }
                )
              }
            }
          }

          item {
            Text("الفوج الدراسي (Group):", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            Spacer(modifier = Modifier.height(6.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
              groups.forEach { grp ->
                val isSelected = grp == selectedGroup
                Card(
                  shape = RoundedCornerShape(12.dp),
                  colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) Color(0xFF1B5E4B).copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface
                  ),
                  onClick = { selectedGroup = grp },
                  modifier = Modifier.fillMaxWidth()
                ) {
                  Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                  ) {
                    RadioButton(selected = isSelected, onClick = { selectedGroup = grp })
                    Text(grp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                  }
                }
              }
            }
          }
        }

        // STEP 4: Review and Official Student ID Card Preview
        if (step == 4) {
          item {
            Text(
              text = "بطاقة الطالب الرقمية الصادرة لك 🎓",
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
            )
          }

          val fullName = if (firstName.isNotBlank() && lastName.isNotBlank()) "$firstName $lastName" else "محمد بن علي"
          val displayEmail = if (email.isNotBlank()) email else "student@talib.dz"

          item {
            Card(
              shape = RoundedCornerShape(22.dp),
              colors = CardDefaults.cardColors(containerColor = Color(0xFF1B5E4B)),
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
                    Text("المؤسسة:", style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f)))
                    Text(selectedInstitution.substringBefore(" ("), style = MaterialTheme.typography.bodySmall.copy(color = Color.White, fontWeight = FontWeight.Bold))
                  }
                  Column(horizontalAlignment = Alignment.End) {
                    Text("التخصص والفوج:", style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f)))
                    Text("$selectedSpecialty • $selectedGroup", style = MaterialTheme.typography.bodySmall.copy(color = Color.White, fontWeight = FontWeight.Bold))
                  }
                }

                Text(
                  text = "البريد الإلكتروني: $displayEmail",
                  style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.8f))
                )
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
                } else if (step < 4) {
                  errorMessage = null
                  step++
                } else {
                  val fullName = if (firstName.isNotBlank() && lastName.isNotBlank()) "$firstName $lastName" else "محمد بن علي"
                  val displayEmail = if (email.isNotBlank()) email else "student@talib.dz"

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
                      groupNumber = selectedGroup,
                      isConfigured = true
                    )
                  )
                  onComplete()
                }
              },
              shape = RoundedCornerShape(12.dp),
              colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1B5E4B)),
              modifier = Modifier.weight(if (step == 1) 1f else 1.5f)
            ) {
              Text(
                text = if (step == 4) "تأكيد التسجيل ودخول التطبيق 🎓" else "متابعة",
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
