package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.LibraryReference
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
  viewModel: TalibViewModel,
  onNavigateBack: () -> Unit
) {
  val libraryReferences by viewModel.allLibraryReferences.collectAsStateWithLifecycle()
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()
  var searchQuery by remember { mutableStateOf("") }
  var selectedCategory by remember { mutableStateOf("الكل") }
  var showAddDialog by remember { mutableStateOf(false) }
  var statusMessage by remember { mutableStateOf<String?>(null) }

  val categories = listOf("الكل", "كتاب مرجعي", "معجم وقاموس", "أطروحة", "مقال علمي")

  val filteredReferences = libraryReferences.filter { ref ->
    val matchesCat = selectedCategory == "الكل" || ref.category == selectedCategory
    val matchesSearch = searchQuery.isBlank() || ref.title.contains(searchQuery, ignoreCase = true) || ref.author.contains(searchQuery, ignoreCase = true)
    matchesCat && matchesSearch
  }

  if (showAddDialog) {
    var title by remember { mutableStateOf("") }
    var author by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("كتاب مرجعي") }
    var description by remember { mutableStateOf("") }
    var pages by remember { mutableStateOf("250") }

    AlertDialog(
      onDismissRequest = { showAddDialog = false },
      title = { Text("إضافة مرجع / كتاب جديد للمكتبة", fontWeight = FontWeight.Black) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("عنوان الكتاب أو المرجع") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = author,
            onValueChange = { author = it },
            label = { Text("المؤلف / المحقق") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            label = { Text("نبذة مختصرة عن المرجع") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = pages,
            onValueChange = { pages = it },
            label = { Text("عدد الصفحات التقديري") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (title.isNotBlank()) {
              viewModel.addLibraryReference(
                title = title,
                author = author.ifBlank { "مؤلف أكاديمي" },
                category = category,
                description = description.ifBlank { "مرجع عام لدعم التخصص." },
                pageCount = pages.toIntOrNull() ?: 200
              )
              showAddDialog = false
              statusMessage = "تمت إضافة المرجع للمكتبة بنجاح 📚"
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("إضافة للمكتبة")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAddDialog = false }) { Text("إلغاء") }
      }
    )
  }

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("library_screen"),
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text("مكتبة المراجع والمصادر العامة", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = "كتب ومراجع تخصص ${profile?.specialtyName ?: "الأدب العربي"} (غير مرتبطة بأسبوع)",
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )
          }
        },
        navigationIcon = {
          IconButton(onClick = onNavigateBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
          }
        },
        actions = {
          IconButton(onClick = { showAddDialog = true }) {
            Icon(Icons.Default.AddCircleOutline, contentDescription = "إضافة مرجع", tint = MaterialTheme.colorScheme.primary)
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
      contentPadding = PaddingValues(top = 8.dp, bottom = 90.dp)
    ) {
      item {
        OutlinedTextField(
          value = searchQuery,
          onValueChange = { searchQuery = it },
          placeholder = { Text("ابحث عن كتاب، معجم، أو مؤلف...") },
          leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
          trailingIcon = {
            if (searchQuery.isNotEmpty()) {
              IconButton(onClick = { searchQuery = "" }) {
                Icon(Icons.Default.Clear, contentDescription = "مسح")
              }
            }
          },
          shape = RoundedCornerShape(16.dp),
          modifier = Modifier.fillMaxWidth()
        )
      }

      // Categories filter
      item {
        LazyColumn(modifier = Modifier.height(0.dp)) {} // helper
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          categories.forEach { cat ->
            FilterChip(
              selected = selectedCategory == cat,
              onClick = { selectedCategory = cat },
              label = { Text(cat) }
            )
          }
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

      if (filteredReferences.isEmpty()) {
        item {
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .padding(top = 40.dp),
            contentAlignment = Alignment.Center
          ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
              Icon(Icons.Default.MenuBook, contentDescription = null, modifier = Modifier.size(54.dp), tint = MaterialTheme.colorScheme.outline)
              Text("لا توجد مراجع مطابقة لبحثك في المكتبة", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        }
      } else {
        items(filteredReferences) { ref ->
          Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
              horizontalArrangement = Arrangement.spacedBy(14.dp),
              verticalAlignment = Alignment.CenterVertically
            ) {
              Box(
                modifier = Modifier
                  .size(52.dp)
                  .clip(RoundedCornerShape(12.dp))
                  .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
              ) {
                Icon(
                  imageVector = if (ref.category.contains("معجم")) Icons.Default.AutoStories else Icons.Default.Book,
                  contentDescription = null,
                  tint = MaterialTheme.colorScheme.primary,
                  modifier = Modifier.size(28.dp)
                )
              }

              Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text(
                    text = ref.title,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Black)
                  )
                  Box(
                    modifier = Modifier
                      .clip(RoundedCornerShape(6.dp))
                      .background(MaterialTheme.colorScheme.secondaryContainer)
                      .padding(horizontal = 6.dp, vertical = 2.dp)
                  ) {
                    Text(
                      text = ref.category,
                      style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    )
                  }
                }

                Text(
                  text = "المؤلف: ${ref.author} • ${ref.pageCount} صفحة",
                  style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                )

                Text(
                  text = ref.description,
                  style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
                  maxLines = 2,
                  overflow = TextOverflow.Ellipsis
                )

                Row(
                  modifier = Modifier.padding(top = 4.dp),
                  horizontalArrangement = Arrangement.spacedBy(8.dp),
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Button(
                    onClick = {
                      statusMessage = "تم فتح وتحميل مرجع: ${ref.title} بنجاح 📖"
                    },
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    modifier = Modifier.height(32.dp)
                  ) {
                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("قراءة وتحميل PDF", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                  }

                  IconButton(
                    onClick = { viewModel.deleteLibraryReference(ref) },
                    modifier = Modifier.size(32.dp)
                  ) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "حذف", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
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
