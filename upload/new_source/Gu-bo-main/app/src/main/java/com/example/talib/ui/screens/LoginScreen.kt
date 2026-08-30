package com.example.talib.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.StudentProfile
import com.example.talib.ui.viewmodel.TalibViewModel
import kotlin.random.Random

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
  viewModel: TalibViewModel,
  onLoginSuccess: () -> Unit
) {
  val focusManager = LocalFocusManager.current
  val currentUserProfile by viewModel.studentProfile.collectAsStateWithLifecycle()
  val isAuthLoading by viewModel.isAuthLoading.collectAsStateWithLifecycle()
  val purplePrimary = MaterialTheme.colorScheme.primary

  // Form Fields for Alternative Login: Name + Last Name + Optional Email
  var firstName by remember { mutableStateOf("") }
  var lastName by remember { mutableStateOf("") }
  var email by remember { mutableStateOf("") }
  var validationError by remember { mutableStateOf<String?>(null) }

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("login_screen"),
    containerColor = MaterialTheme.colorScheme.background
  ) { padding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 24.dp, vertical = 20.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      Spacer(modifier = Modifier.height(16.dp))

      // Logo and App Brand Header
      Box(
        modifier = Modifier
          .size(84.dp)
          .clip(CircleShape)
          .background(
            Brush.linearGradient(
              colors = listOf(
                purplePrimary,
                MaterialTheme.colorScheme.secondary
              )
            )
          ),
        contentAlignment = Alignment.Center
      ) {
        Icon(
          imageVector = Icons.Default.School,
          contentDescription = "شعار طالب",
          tint = Color.White,
          modifier = Modifier.size(48.dp)
        )
      }

      Text(
        text = "طالب | Tâlib",
        style = MaterialTheme.typography.headlineMedium.copy(
          fontWeight = FontWeight.Black,
          color = purplePrimary
        )
      )

      Text(
        text = "بوابة تسجيل الدخول واستعادة الحساب الأكاديمي",
        style = MaterialTheme.typography.bodyMedium.copy(
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          fontWeight = FontWeight.SemiBold
        ),
        textAlign = TextAlign.Center
      )

      // Auto-remember device card
      val activeProfile = currentUserProfile
      if (activeProfile != null && activeProfile.isConfigured && activeProfile.fullName.isNotBlank()) {
        Card(
          shape = RoundedCornerShape(18.dp),
          colors = CardDefaults.cardColors(containerColor = purplePrimary.copy(alpha = 0.1f)),
          border = androidx.compose.foundation.BorderStroke(1.dp, purplePrimary.copy(alpha = 0.3f)),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
          ) {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
              Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = purplePrimary)
              Column {
                Text("تم التعرف على جهازك تلقائياً", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text("الحساب النشط: ${activeProfile.fullName}", style = MaterialTheme.typography.bodySmall)
              }
            }
            Button(
              onClick = onLoginSuccess,
              shape = RoundedCornerShape(12.dp),
              colors = ButtonDefaults.buttonColors(containerColor = purplePrimary),
              modifier = Modifier.fillMaxWidth()
            ) {
              Text("المتابعة مباشرة كـ (${activeProfile.fullName}) 🎓", fontWeight = FontWeight.Bold)
            }
          }
        }
      }

      // Information notice: No passwords in Talib
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
          Icon(Icons.Default.Security, contentDescription = null, tint = purplePrimary)
          Text(
            text = "نظام طالب لا يعتمد على كلمات المرور إطلاقاً. يتم الدخول بتذكر الجهاز، أو بإدخال الاسم واللقب والبريد في حال تغيير الجهاز.",
            style = MaterialTheme.typography.bodySmall
          )
        }
      }

      if (validationError != null) {
        Card(
          shape = RoundedCornerShape(12.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
          modifier = Modifier.fillMaxWidth()
        ) {
          Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Text(
              text = validationError ?: "",
              color = MaterialTheme.colorScheme.onErrorContainer,
              style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold)
            )
          }
        }
      }

      // Input Form Fields (Name + Last Name + Optional Email)
      Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column(
          modifier = Modifier.padding(18.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
          Text(
            text = "تسجيل الدخول / استعادة الحساب الأكاديمي:",
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold, color = purplePrimary)
          )

          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
          ) {
            OutlinedTextField(
              value = firstName,
              onValueChange = {
                firstName = it
                validationError = null
              },
              label = { Text("الاسم") },
              leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
              shape = RoundedCornerShape(12.dp),
              singleLine = true,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
              keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
              modifier = Modifier
                .weight(1f)
                .testTag("login_firstname_input")
            )

            OutlinedTextField(
              value = lastName,
              onValueChange = {
                lastName = it
                validationError = null
              },
              label = { Text("اللقب") },
              shape = RoundedCornerShape(12.dp),
              singleLine = true,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
              keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
              modifier = Modifier
                .weight(1f)
                .testTag("login_lastname_input")
            )
          }

          OutlinedTextField(
            value = email,
            onValueChange = {
              email = it
              validationError = null
            },
            label = { Text("البريد الإلكتروني (اختياري)") },
            placeholder = { Text("student@talib.dz") },
            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
            shape = RoundedCornerShape(12.dp),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
            modifier = Modifier
              .fillMaxWidth()
              .testTag("login_email_input")
          )

          Spacer(modifier = Modifier.height(4.dp))

          // Submit Action Button
          Button(
            onClick = {
              focusManager.clearFocus()
              if (firstName.isBlank() || lastName.isBlank()) {
                validationError = "يرجى كتابة الاسم واللقب للمتابعة"
                return@Button
              }

              val full = "${firstName.trim()} ${lastName.trim()}"
              val existing = currentUserProfile ?: StudentProfile(studentId = "STD-${(100000..999999).random()}")
              viewModel.updateProfile(
                existing.copy(
                  fullName = full,
                  email = if (email.isNotBlank()) email.trim() else existing.email.ifBlank { "student@talib.dz" },
                  isConfigured = true
                )
              )
              onLoginSuccess()
            },
            enabled = !isAuthLoading,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = purplePrimary),
            modifier = Modifier
              .fillMaxWidth()
              .height(50.dp)
              .testTag("auth_submit_btn")
          ) {
            Icon(
              imageVector = Icons.Default.Login,
              contentDescription = null,
              modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
              text = "دخول ومطابقة الحساب 🎓",
              fontWeight = FontWeight.Bold,
              fontSize = 16.sp
            )
          }
        }
      }

      // Guest access
      TextButton(
        onClick = {
          viewModel.continueAsGuest(onSuccess = onLoginSuccess)
        },
        modifier = Modifier.testTag("continue_as_guest_btn")
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          Icon(Icons.Default.DirectionsWalk, contentDescription = null, modifier = Modifier.size(18.dp))
          Text(
            text = "المتابعة كطالب ضيف (استعراض دون اتصال)",
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold)
          )
        }
      }

      Spacer(modifier = Modifier.height(16.dp))
    }
  }
}
