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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.StudentProfile
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@Composable
fun ProfileScreen(
  viewModel: TalibViewModel,
  onNavigate: (ScreenRoute) -> Unit
) {
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()
  val isDarkMode by viewModel.isDarkMode.collectAsStateWithLifecycle()
  val isAcademicTheme by viewModel.isAcademicTheme.collectAsStateWithLifecycle()
  val gpa by viewModel.calculatedGPA.collectAsStateWithLifecycle()

  var showEditProfileDialog by remember { mutableStateOf(false) }
  var showAcademicPathDialog by remember { mutableStateOf(false) }
  var showAdminPinDialog by remember { mutableStateOf(false) }
  var showLogoutConfirmDialog by remember { mutableStateOf(false) }
  var adminPinInput by remember { mutableStateOf("") }
  var adminPinError by remember { mutableStateOf(false) }

  // Logout Confirmation Dialog
  if (showLogoutConfirmDialog) {
    AlertDialog(
      onDismissRequest = { showLogoutConfirmDialog = false },
      icon = {
        Icon(
          Icons.AutoMirrored.Filled.Logout,
          contentDescription = null,
          tint = MaterialTheme.colorScheme.error,
          modifier = Modifier.size(32.dp)
        )
      },
      title = { Text("تسجيل الخروج من الحساب", fontWeight = FontWeight.Bold) },
      text = {
        Text("هل ترغب بالفعل في تسجيل الخروج من حساب [${profile?.fullName ?: "الطالب"}]؟ سيتم نقلك إلى شاشة تسجيل الدخول.")
      },
      confirmButton = {
        Button(
          onClick = {
            showLogoutConfirmDialog = false
            viewModel.logout {
              onNavigate(ScreenRoute.LOGIN)
            }
          },
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("نعم، تسجيل الخروج")
        }
      },
      dismissButton = {
        TextButton(onClick = { showLogoutConfirmDialog = false }) {
          Text("إلغاء")
        }
      }
    )
  }

  // Admin PIN Protection Dialog
  if (showAdminPinDialog) {
    AlertDialog(
      onDismissRequest = {
        showAdminPinDialog = false
        adminPinInput = ""
        adminPinError = false
      },
      title = {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
          Text("رمز الدخول الإداري", fontWeight = FontWeight.Bold)
        }
      },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(
            text = "هذه المساحة مخصصة للأساتذة وإدارة القسم لرفع المحاضرات ونشر الإعلانات.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
          OutlinedTextField(
            value = adminPinInput,
            onValueChange = {
              adminPinInput = it
              adminPinError = false
            },
            label = { Text("رمز المرور (الافتراضي: 1234)") },
            isError = adminPinError,
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          if (adminPinError) {
            Text(
              text = "رمز المرور غير صحيح! حاول مرة أخرى.",
              color = MaterialTheme.colorScheme.error,
              style = MaterialTheme.typography.bodySmall
            )
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (adminPinInput == "1234" || adminPinInput == "admin") {
              showAdminPinDialog = false
              adminPinInput = ""
              adminPinError = false
              onNavigate(ScreenRoute.ADMIN)
            } else {
              adminPinError = true
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("دخول للوحة الإدارة")
        }
      },
      dismissButton = {
        TextButton(onClick = {
          showAdminPinDialog = false
          adminPinInput = ""
          adminPinError = false
        }) {
          Text("إلغاء")
        }
      }
    )
  }

  // Academic Path Dialog (المسار الأكاديمي: مؤسسة ← تخصص ← ملمح ← سنة ← سداسي)
  if (showAcademicPathDialog && profile != null) {
    var institutionText by remember { mutableStateOf(profile?.institution ?: "المدرسة العليا للأساتذة - بوزريعة") }
    var trackText by remember { mutableStateOf(profile?.profileTrack ?: "أستاذ التعليم الابتدائي") }
    var yearText by remember { mutableStateOf(profile?.academicYearName ?: "السنة الثانية") }
    var semText by remember { mutableStateOf(profile?.semesterName ?: "السداسي الأول") }
    var groupText by remember { mutableStateOf(profile?.groupNumber ?: "الفوج 03") }

    AlertDialog(
      onDismissRequest = { showAcademicPathDialog = false },
      title = { Text("تحديد المسار الأكاديمي", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = institutionText,
            onValueChange = { institutionText = it },
            label = { Text("المؤسسة الجامعية / المدرسة العليا") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = trackText,
            onValueChange = { trackText = it },
            label = { Text("الملمح والتخصص (مثال: أستاذ التعليم الابتدائي)") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
              value = yearText,
              onValueChange = { yearText = it },
              label = { Text("السنة الدراسية") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
              value = semText,
              onValueChange = { semText = it },
              label = { Text("السداسي") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.weight(1f)
            )
          }
          OutlinedTextField(
            value = groupText,
            onValueChange = { groupText = it },
            label = { Text("الفوج المخصص") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.updateAcademicPath(
              institution = institutionText,
              specialtyName = "الأدب العربي",
              profileTrack = trackText,
              yearName = yearText,
              semesterName = semText,
              groupNumber = groupText
            )
            showAcademicPathDialog = false
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("تحديث المسار")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAcademicPathDialog = false }) {
          Text("إلغاء")
        }
      }
    )
  }

  // Edit Profile Dialog
  if (showEditProfileDialog && profile != null) {
    var nameText by remember { mutableStateOf(profile?.fullName ?: "") }
    var uniText by remember { mutableStateOf(profile?.university ?: "") }
    var groupText by remember { mutableStateOf(profile?.groupNumber ?: "") }
    var emailText by remember { mutableStateOf(profile?.email ?: "") }

    AlertDialog(
      onDismissRequest = { showEditProfileDialog = false },
      title = { Text("تعديل بيانات الطالب", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = nameText,
            onValueChange = { nameText = it },
            label = { Text("الاسم واللقب") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = uniText,
            onValueChange = { uniText = it },
            label = { Text("الجامعة / الكلية") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = groupText,
            onValueChange = { groupText = it },
            label = { Text("الفوج الدراسي") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = emailText,
            onValueChange = { emailText = it },
            label = { Text("البريد الإلكتروني") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            profile?.let { p ->
              viewModel.updateProfile(
                p.copy(
                  fullName = nameText,
                  university = uniText,
                  groupNumber = groupText,
                  email = emailText
                )
              )
            }
            showEditProfileDialog = false
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("حفظ التغييرات")
        }
      },
      dismissButton = {
        TextButton(onClick = { showEditProfileDialog = false }) {
          Text("إلغاء")
        }
      }
    )
  }

  LazyColumn(
    modifier = Modifier
      .fillMaxSize()
      .testTag("profile_screen"),
    contentPadding = PaddingValues(bottom = 90.dp, top = 8.dp, start = 16.dp, end = 16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp)
  ) {
    // 1. Digital Student Card
    item {
      Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .padding(20.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column {
              Text(
                text = "بطاقة الطالب الرقمية • ${profile?.userRole ?: "طالب"}",
                style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.8f))
              )
              Text(
                text = profile?.fullName ?: "محمد بن علي",
                style = MaterialTheme.typography.titleLarge.copy(
                  color = Color.White,
                  fontWeight = FontWeight.Black,
                  fontSize = 20.sp
                )
              )
            }

            Surface(
              color = Color(0xFFD4AF37),
              shape = RoundedCornerShape(8.dp)
            ) {
              Text(
                text = profile?.studentId ?: "2026-TLB-8459",
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                style = MaterialTheme.typography.labelSmall.copy(
                  color = Color(0xFF1E293B),
                  fontWeight = FontWeight.Black
                )
              )
            }
          }

          HorizontalDivider(color = Color.White.copy(alpha = 0.2f))

          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
          ) {
            Column {
              Text(
                text = "المسار والملمح الأكاديمي",
                style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f))
              )
              Text(
                text = profile?.profileTrack ?: "أستاذ التعليم الابتدائي",
                style = MaterialTheme.typography.labelMedium.copy(
                  color = Color.White,
                  fontWeight = FontWeight.Bold
                )
              )
            }

            Column(horizontalAlignment = Alignment.End) {
              Text(
                text = "الفوج والمستوى",
                style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.7f))
              )
              Text(
                text = "${profile?.groupNumber ?: "الفوج 03"} • ${profile?.academicYearName ?: "L2"}",
                style = MaterialTheme.typography.labelMedium.copy(
                  color = Color.White,
                  fontWeight = FontWeight.Bold
                )
              )
            }
          }

          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
          ) {
            Text(
              text = "${profile?.institution ?: "المدرسة العليا للأساتذة - بوزريعة"}",
              style = MaterialTheme.typography.bodySmall.copy(color = Color.White.copy(alpha = 0.9f))
            )
            Text(
              text = profile?.email ?: "mohamedbessghier8@gmail.com",
              style = MaterialTheme.typography.labelSmall.copy(color = Color.White.copy(alpha = 0.75f))
            )
          }
        }
      }
    }

    // 2. Profile & Visual Appearance Settings
    item {
      Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column(
          modifier = Modifier.fillMaxWidth().padding(16.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
          Text(
            text = "إعدادات المسار والمظهر الأكاديمي",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
          )

          // Change Academic Track item
          ListItem(
            headlineContent = { Text("المسار الأكاديمي والمؤسسة", fontWeight = FontWeight.SemiBold) },
            supportingContent = { Text("${profile?.institution ?: "المدرسة العليا للأساتذة"} • ${profile?.profileTrack ?: "ملمح ابتدائي"}") },
            leadingContent = {
              Icon(Icons.Default.AccountTree, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            },
            trailingContent = {
              IconButton(onClick = { showAcademicPathDialog = true }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBackIos, contentDescription = null, modifier = Modifier.size(16.dp))
              }
            }
          )

          HorizontalDivider()

          // Edit Profile item
          ListItem(
            headlineContent = { Text("تعديل المعلومات الشخصية", fontWeight = FontWeight.SemiBold) },
            supportingContent = { Text(profile?.email ?: "mohamedbessghier8@gmail.com") },
            leadingContent = {
              Icon(Icons.Default.Edit, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            },
            trailingContent = {
              IconButton(onClick = { showEditProfileDialog = true }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBackIos, contentDescription = null, modifier = Modifier.size(16.dp))
              }
            }
          )

          HorizontalDivider()

          // Academic Palette Toggle (Emerald/Cream vs Modern Violet)
          ListItem(
            headlineContent = { Text("السمة البصرية الأكاديمية", fontWeight = FontWeight.SemiBold) },
            supportingContent = {
              Text(
                if (isAcademicTheme) "السمة الأكاديمية الأصيلة (الزمردي/الورقي/البرونزي)"
                else "السمة المعاصرة (البنفسجي/الأرجواني)"
              )
            },
            leadingContent = {
              Icon(
                imageVector = Icons.Default.Palette,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
              )
            },
            trailingContent = {
              Switch(
                checked = isAcademicTheme,
                onCheckedChange = { viewModel.toggleThemePalette() }
              )
            }
          )

          HorizontalDivider()

          // Dark Mode Toggle
          ListItem(
            headlineContent = { Text("الوضع الليلي / النهاري", fontWeight = FontWeight.SemiBold) },
            supportingContent = { Text(if (isDarkMode) "الوضع الداكن الليلي" else "الوضع الفاتح") },
            leadingContent = {
              Icon(
                imageVector = if (isDarkMode) Icons.Default.WbSunny else Icons.Default.NightlightRound,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
              )
            },
            trailingContent = {
              Switch(
                checked = isDarkMode,
                onCheckedChange = { viewModel.toggleTheme() }
              )
            }
          )
        }
      }
    }

    // 3. Quick Academic Features (التقويم، المكتبة، الحضور)
    item {
      Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column(
          modifier = Modifier.fillMaxWidth().padding(16.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Text(
            text = "الخدمات والمراجع الأكاديمية",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
          )

          ListItem(
            headlineContent = { Text("التقويم الأكاديمي الجامعي", fontWeight = FontWeight.SemiBold) },
            supportingContent = { Text("مواعيد السداسيات، العطل الرسمية، وفترات الامتحانات") },
            leadingContent = {
              Icon(Icons.Default.DateRange, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            },
            trailingContent = {
              IconButton(onClick = { onNavigate(ScreenRoute.ACADEMIC_CALENDAR) }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBackIos, contentDescription = null, modifier = Modifier.size(16.dp))
              }
            }
          )

          HorizontalDivider()

          ListItem(
            headlineContent = { Text("المكتبة والمراجع العامة", fontWeight = FontWeight.SemiBold) },
            supportingContent = { Text("كتب ومصادر التخصص المعتمدة من الأساتذة") },
            leadingContent = {
              Icon(Icons.Default.MenuBook, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            },
            trailingContent = {
              IconButton(onClick = { onNavigate(ScreenRoute.LIBRARY) }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBackIos, contentDescription = null, modifier = Modifier.size(16.dp))
              }
            }
          )

          HorizontalDivider()

          ListItem(
            headlineContent = { Text("سجل الحضور والغيابات", fontWeight = FontWeight.SemiBold) },
            supportingContent = { Text("متابعة عدد الغيابات الشخصية لكل مقرر") },
            leadingContent = {
              Icon(Icons.Default.FactCheck, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            },
            trailingContent = {
              IconButton(onClick = { onNavigate(ScreenRoute.ATTENDANCE) }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBackIos, contentDescription = null, modifier = Modifier.size(16.dp))
              }
            }
          )
        }
      }
    }

    // 4. Supervisor Portal Entry (يظهر حصراً للمشرفين أو المالكين بحدود ذهبية مميزة)
    val isSupervisor = profile?.userRole != "STUDENT" || profile?.isAdminMode == true
    if (isSupervisor) {
      item {
        Card(
          shape = RoundedCornerShape(20.dp),
          border = androidx.compose.foundation.BorderStroke(1.5.dp, Color(0xFFD4AF37)),
          colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
          ),
          elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
          modifier = Modifier
            .fillMaxWidth()
            .testTag("supervisor_portal_card")
        ) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
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
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFD4AF37).copy(alpha = 0.18f)),
                  contentAlignment = Alignment.Center
                ) {
                  Icon(
                    imageVector = Icons.Default.Shield,
                    contentDescription = null,
                    tint = Color(0xFFB48C1C),
                    modifier = Modifier.size(24.dp)
                  )
                }

                Column {
                  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                      text = "لوحة الإشراف",
                      style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Black,
                        color = Color(0xFFB48C1C)
                      )
                    )
                    Surface(
                      color = Color(0xFFD4AF37).copy(alpha = 0.2f),
                      shape = RoundedCornerShape(6.dp)
                    ) {
                      Text(
                        text = profile?.userRole ?: "مشرف",
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall.copy(
                          fontWeight = FontWeight.Bold,
                          color = Color(0xFFB48C1C)
                        )
                      )
                    }
                  }
                  Text(
                    text = "إدارة ونشر المحتوى، تعيين المشرفين، والتبليغات ضمن نطاقاتك",
                    style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                  )
                }
              }
            }

            Button(
              onClick = { onNavigate(ScreenRoute.ADMIN) },
              shape = RoundedCornerShape(12.dp),
              colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF1B5E4B)
              ),
              modifier = Modifier.fillMaxWidth().testTag("open_supervision_panel_btn")
            ) {
              Icon(Icons.Default.Shield, contentDescription = null, modifier = Modifier.size(18.dp), tint = Color.White)
              Spacer(modifier = Modifier.width(8.dp))
              Text("فتح لوحة الإشراف ونطاقاتي", fontWeight = FontWeight.Bold, color = Color.White)
            }
          }
        }
      }
    }

    // 5. Role Switcher for Testing & Demonstration
    item {
      Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(
            text = "الرتبة والصلاحيات الحالية:",
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
          )
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            FilterChip(
              selected = profile?.userRole == "STUDENT",
              onClick = { viewModel.switchUserRole("STUDENT") },
              label = { Text("طالب عادي") },
              modifier = Modifier.weight(1f)
            )
            FilterChip(
              selected = profile?.userRole == "REPRESENTATIVE" || profile?.userRole == "مستشار / ممثل القسم",
              onClick = { viewModel.switchUserRole("REPRESENTATIVE") },
              label = { Text("ممثل الفوج / مشرف") },
              modifier = Modifier.weight(1f)
            )
          }
        }
      }
    }

    // 6. Logout Action Card
    item {
      Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column(
          modifier = Modifier.padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
          ) {
            Box(
              modifier = Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.errorContainer),
              contentAlignment = Alignment.Center
            ) {
              Icon(
                imageVector = Icons.AutoMirrored.Filled.Logout,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp)
              )
            }

            Column(modifier = Modifier.weight(1f)) {
              Text("تسجيل الخروج", fontWeight = FontWeight.Bold)
              Text(
                text = "إنهاء الجلسة الحالية والعودة لشاشة تسجيل الدخول",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
              )
            }
          }

          FilledTonalButton(
            onClick = { showLogoutConfirmDialog = true },
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.filledTonalButtonColors(
              containerColor = MaterialTheme.colorScheme.errorContainer,
              contentColor = MaterialTheme.colorScheme.error
            ),
            modifier = Modifier
              .fillMaxWidth()
              .testTag("profile_logout_button")
          ) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("تسجيل الخروج من الحساب", fontWeight = FontWeight.Bold)
          }
        }
      }
    }

    item {
      Spacer(modifier = Modifier.height(16.dp))
    }
  }
}
