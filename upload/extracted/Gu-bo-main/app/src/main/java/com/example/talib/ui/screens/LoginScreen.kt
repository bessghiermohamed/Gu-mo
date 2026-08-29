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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
  viewModel: TalibViewModel,
  onLoginSuccess: () -> Unit
) {
  val focusManager = LocalFocusManager.current
  val authState by viewModel.authStatusMessage.collectAsStateWithLifecycle()
  val isAuthLoading by viewModel.isAuthLoading.collectAsStateWithLifecycle()
  val currentUserProfile by viewModel.studentProfile.collectAsStateWithLifecycle()

  var isSignUpMode by remember { mutableStateOf(false) }

  // Form Fields
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var confirmPassword by remember { mutableStateOf("") }
  var fullName by remember { mutableStateOf("") }
  var studentId by remember { mutableStateOf("") }
  var selectedGroup by remember { mutableStateOf("الفوج 03") }
  var selectedSpecialty by remember { mutableStateOf("اللغة والأدب العربي") }
  var selectedYear by remember { mutableStateOf("السنة الثانية (L2)") }

  var passwordVisible by remember { mutableStateOf(false) }
  var validationError by remember { mutableStateOf<String?>(null) }

  // Quick Preset Accounts for Easy Login/Testing
  val presetAccounts = listOf(
    Triple("👑 المالك (Super Admin)", "admin@univ.dz", "OWNER"),
    Triple("🏛️ مسؤول تخصص (الأدب)", "specialty.admin@univ.dz", "SPECIALTY_ADMIN"),
    Triple("🎓 ممثل الفوج 03", "delegate.g3@univ.dz", "REPRESENTATIVE"),
    Triple("👤 طالب جامعي", "student@univ.dz", "STUDENT")
  )

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
      Spacer(modifier = Modifier.height(12.dp))

      // Logo and App Brand Header
      Box(
        modifier = Modifier
          .size(80.dp)
          .clip(CircleShape)
          .background(
            Brush.linearGradient(
              colors = listOf(
                MaterialTheme.colorScheme.primary,
                MaterialTheme.colorScheme.secondary
              )
            )
          ),
        contentAlignment = Alignment.Center
      ) {
        Icon(
          imageVector = Icons.Default.School,
          contentDescription = "شعار التطبيق",
          tint = Color.White,
          modifier = Modifier.size(44.dp)
        )
      }

      Text(
        text = "طالب | Talib",
        style = MaterialTheme.typography.headlineMedium.copy(
          fontWeight = FontWeight.Black,
          color = MaterialTheme.colorScheme.primary
        )
      )

      Text(
        text = if (isSignUpMode) "إنشاء حساب جامعي جديد بالمنظومة" else "بوابة تسجيل الدخول الأكاديمية",
        style = MaterialTheme.typography.bodyMedium.copy(
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          fontWeight = FontWeight.SemiBold
        ),
        textAlign = TextAlign.Center
      )

      // Tab switcher between Sign In and Sign Up
      Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth()
      ) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(4.dp),
          horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          Button(
            onClick = {
              isSignUpMode = false
              validationError = null
            },
            colors = ButtonDefaults.buttonColors(
              containerColor = if (!isSignUpMode) MaterialTheme.colorScheme.surface else Color.Transparent,
              contentColor = if (!isSignUpMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            ),
            elevation = if (!isSignUpMode) ButtonDefaults.buttonElevation(defaultElevation = 2.dp) else ButtonDefaults.buttonElevation(0.dp),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.weight(1f)
          ) {
            Text("تسجيل الدخول", fontWeight = FontWeight.Bold)
          }

          Button(
            onClick = {
              isSignUpMode = true
              validationError = null
            },
            colors = ButtonDefaults.buttonColors(
              containerColor = if (isSignUpMode) MaterialTheme.colorScheme.surface else Color.Transparent,
              contentColor = if (isSignUpMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            ),
            elevation = if (isSignUpMode) ButtonDefaults.buttonElevation(defaultElevation = 2.dp) else ButtonDefaults.buttonElevation(0.dp),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.weight(1f)
          ) {
            Text("حساب جديد", fontWeight = FontWeight.Bold)
          }
        }
      }

      // Quick Role / Demo Selector for fast access
      if (!isSignUpMode) {
        Card(
          shape = RoundedCornerShape(16.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            Text(
              text = "دخول سريع برتبة محددة:",
              style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
              )
            )

            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
              presetAccounts.forEach { (label, presetEmail, role) ->
                Surface(
                  shape = RoundedCornerShape(8.dp),
                  color = if (email == presetEmail) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                  modifier = Modifier
                    .weight(1f)
                    .clickable {
                      email = presetEmail
                      password = "password123"
                    }
                ) {
                  Text(
                    text = label.split(" ")[0] + " " + label.split(" ")[1],
                    style = MaterialTheme.typography.labelSmall.copy(
                      fontSize = 10.sp,
                      fontWeight = FontWeight.Bold,
                      color = if (email == presetEmail) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                    ),
                    modifier = Modifier.padding(vertical = 6.dp, horizontal = 2.dp),
                    textAlign = TextAlign.Center
                  )
                }
              }
            }
          }
        }
      }

      // Status/Error banner
      if (validationError != null || authState != null) {
        Surface(
          shape = RoundedCornerShape(12.dp),
          color = if (validationError != null || authState?.startsWith("خطأ") == true)
            MaterialTheme.colorScheme.errorContainer
          else
            MaterialTheme.colorScheme.primaryContainer,
          modifier = Modifier.fillMaxWidth()
        ) {
          Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            Icon(
              imageVector = if (validationError != null || authState?.startsWith("خطأ") == true)
                Icons.Default.ErrorOutline
              else
                Icons.Default.CheckCircleOutline,
              contentDescription = null,
              tint = if (validationError != null || authState?.startsWith("خطأ") == true)
                MaterialTheme.colorScheme.error
              else
                MaterialTheme.colorScheme.primary
            )
            Text(
              text = validationError ?: authState ?: "",
              style = MaterialTheme.typography.bodySmall.copy(
                fontWeight = FontWeight.Bold,
                color = if (validationError != null || authState?.startsWith("خطأ") == true)
                  MaterialTheme.colorScheme.onErrorContainer
                else
                  MaterialTheme.colorScheme.onPrimaryContainer
              )
            )
          }
        }
      }

      // Input Form Fields
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
          if (isSignUpMode) {
            // Full Name
            OutlinedTextField(
              value = fullName,
              onValueChange = { fullName = it },
              label = { Text("الاسم واللقب الكامل") },
              leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
              shape = RoundedCornerShape(12.dp),
              singleLine = true,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
              keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
              modifier = Modifier
                .fillMaxWidth()
                .testTag("signup_fullname_input")
            )

            // Student ID (رقم التسجيل)
            OutlinedTextField(
              value = studentId,
              onValueChange = { studentId = it },
              label = { Text("رقم التسجيل الجامعي") },
              leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null) },
              shape = RoundedCornerShape(12.dp),
              singleLine = true,
              keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
              keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
              modifier = Modifier
                .fillMaxWidth()
                .testTag("signup_studentid_input")
            )

            // Group Number
            OutlinedTextField(
              value = selectedGroup,
              onValueChange = { selectedGroup = it },
              label = { Text("الفوج (مثال: الفوج 03)") },
              leadingIcon = { Icon(Icons.Default.Groups, contentDescription = null) },
              shape = RoundedCornerShape(12.dp),
              singleLine = true,
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
              keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
              modifier = Modifier
                .fillMaxWidth()
                .testTag("signup_group_input")
            )
          }

          // Email
          OutlinedTextField(
            value = email,
            onValueChange = {
              email = it
              validationError = null
            },
            label = { Text("البريد الإلكتروني الجامعي") },
            placeholder = { Text("student@univ.dz") },
            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
            shape = RoundedCornerShape(12.dp),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
            modifier = Modifier
              .fillMaxWidth()
              .testTag("login_email_input")
          )

          // Password
          OutlinedTextField(
            value = password,
            onValueChange = {
              password = it
              validationError = null
            },
            label = { Text("كلمة المرور") },
            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
            trailingIcon = {
              IconButton(onClick = { passwordVisible = !passwordVisible }) {
                Icon(
                  imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                  contentDescription = if (passwordVisible) "إخفاء كلمة المرور" else "إظهار كلمة المرور"
                )
              }
            },
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            shape = RoundedCornerShape(12.dp),
            singleLine = true,
            keyboardOptions = KeyboardOptions(
              keyboardType = KeyboardType.Password,
              imeAction = if (isSignUpMode) ImeAction.Next else ImeAction.Done
            ),
            keyboardActions = KeyboardActions(
              onNext = { focusManager.moveFocus(FocusDirection.Down) },
              onDone = { focusManager.clearFocus() }
            ),
            modifier = Modifier
              .fillMaxWidth()
              .testTag("login_password_input")
          )

          if (isSignUpMode) {
            // Confirm Password
            OutlinedTextField(
              value = confirmPassword,
              onValueChange = {
                confirmPassword = it
                validationError = null
              },
              label = { Text("تأكيد كلمة المرور") },
              leadingIcon = { Icon(Icons.Default.LockReset, contentDescription = null) },
              visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
              shape = RoundedCornerShape(12.dp),
              singleLine = true,
              keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
              keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
              modifier = Modifier
                .fillMaxWidth()
                .testTag("signup_confirm_password_input")
            )
          }

          Spacer(modifier = Modifier.height(4.dp))

          // Submit Action Button
          Button(
            onClick = {
              focusManager.clearFocus()
              if (email.isBlank()) {
                validationError = "يرجى كتابة البريد الإلكتروني"
                return@Button
              }
              if (password.isBlank()) {
                validationError = "يرجى كتابة كلمة المرور"
                return@Button
              }

              if (isSignUpMode) {
                if (fullName.isBlank()) {
                  validationError = "يرجى إدخال اسمك ولقبك"
                  return@Button
                }
                if (password != confirmPassword) {
                  validationError = "كلمتا المرور غير متطابقتين"
                  return@Button
                }
                viewModel.signUpUser(
                  fullName = fullName,
                  email = email,
                  password = password,
                  studentId = studentId.ifBlank { "20263108" },
                  groupNumber = selectedGroup.ifBlank { "الفوج 03" },
                  onSuccess = onLoginSuccess
                )
              } else {
                viewModel.loginUser(
                  email = email,
                  password = password,
                  onSuccess = onLoginSuccess
                )
              }
            },
            enabled = !isAuthLoading,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
              .fillMaxWidth()
              .height(50.dp)
              .testTag("auth_submit_btn")
          ) {
            if (isAuthLoading) {
              CircularProgressIndicator(
                color = Color.White,
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.5.dp
              )
              Spacer(modifier = Modifier.width(10.dp))
              Text("جاري المعالجة...")
            } else {
              Icon(
                imageVector = if (isSignUpMode) Icons.Default.PersonAdd else Icons.Default.Login,
                contentDescription = null,
                modifier = Modifier.size(20.dp)
              )
              Spacer(modifier = Modifier.width(8.dp))
              Text(
                text = if (isSignUpMode) "إنشاء الحساب والدخول" else "تسجيل الدخول",
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
              )
            }
          }
        }
      }

      // Guest / Offline Fast Access Option
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
            text = "المتابعة كطالب ضيف (وضع العمل دون اتصال)",
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold)
          )
        }
      }

      Spacer(modifier = Modifier.height(16.dp))
    }
  }
}
