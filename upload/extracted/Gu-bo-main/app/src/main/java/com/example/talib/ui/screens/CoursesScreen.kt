package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
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
import com.example.talib.data.local.ModuleCourse
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoursesScreen(
  viewModel: TalibViewModel,
  onNavigate: (ScreenRoute) -> Unit
) {
  val specialties by viewModel.specialties.collectAsStateWithLifecycle()
  val selectedSpecialtyId by viewModel.selectedSpecialtyId.collectAsStateWithLifecycle()
  val years by viewModel.academicYearsForSpecialty.collectAsStateWithLifecycle()
  val selectedYearId by viewModel.selectedYearId.collectAsStateWithLifecycle()
  val modules by viewModel.currentModules.collectAsStateWithLifecycle()
  val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()

  var specialtyExpanded by remember { mutableStateOf(false) }

  val currentSpecialty = specialties.find { it.id == selectedSpecialtyId }

  val filteredModules = modules.filter {
    searchQuery.isEmpty() ||
      it.name.contains(searchQuery, ignoreCase = true) ||
      it.professorName.contains(searchQuery, ignoreCase = true)
  }

  LazyColumn(
    modifier = Modifier
      .fillMaxSize()
      .testTag("courses_screen"),
    contentPadding = PaddingValues(bottom = 90.dp, top = 8.dp, start = 16.dp, end = 16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp)
  ) {
    // 1. Specialty Selector Dropdown
    item {
      ExposedDropdownMenuBox(
        expanded = specialtyExpanded,
        onExpandedChange = { specialtyExpanded = !specialtyExpanded }
      ) {
        OutlinedTextField(
          value = currentSpecialty?.nameAr ?: "اختر التخصص الأكاديمي",
          onValueChange = {},
          readOnly = true,
          label = { Text("التخصص الجامعي") },
          leadingIcon = {
            Icon(Icons.Default.School, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
          },
          trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = specialtyExpanded) },
          shape = RoundedCornerShape(16.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline
          ),
          modifier = Modifier
            .fillMaxWidth()
            .menuAnchor(MenuAnchorType.PrimaryNotEditable, true)
            .testTag("specialty_dropdown")
        )

        ExposedDropdownMenu(
          expanded = specialtyExpanded,
          onDismissRequest = { specialtyExpanded = false }
        ) {
          specialties.forEach { spec ->
            DropdownMenuItem(
              text = {
                Column {
                  Text(spec.nameAr, fontWeight = FontWeight.Bold)
                  if (spec.description.isNotEmpty()) {
                    Text(spec.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                  }
                }
              },
              onClick = {
                viewModel.selectSpecialty(spec.id)
                specialtyExpanded = false
              },
              leadingIcon = {
                Icon(
                  imageVector = if (spec.id == selectedSpecialtyId) Icons.Default.CheckCircle else Icons.Default.Book,
                  contentDescription = null,
                  tint = if (spec.id == selectedSpecialtyId) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
              }
            )
          }
        }
      }
    }

    // 2. Academic Year Tabs
    if (years.isNotEmpty()) {
      item {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Text(
            text = "المستوى الدراسي والسنة:",
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
          )
          LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(years) { yr ->
              val isSelected = yr.id == selectedYearId
              FilterChip(
                selected = isSelected,
                onClick = { viewModel.selectYear(yr.id) },
                label = {
                  Text(
                    text = yr.yearName,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                  )
                },
                colors = FilterChipDefaults.filterChipColors(
                  selectedContainerColor = MaterialTheme.colorScheme.primary,
                  selectedLabelColor = Color.White
                ),
                shape = RoundedCornerShape(12.dp)
              )
            }
          }
        }
      }
    }

    // 3. Search Bar
    item {
      OutlinedTextField(
        value = searchQuery,
        onValueChange = { viewModel.updateSearchQuery(it) },
        placeholder = { Text("ابحث عن مقياس أو أستاذ...") },
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
        trailingIcon = {
          if (searchQuery.isNotEmpty()) {
            IconButton(onClick = { viewModel.updateSearchQuery("") }) {
              Icon(Icons.Default.Clear, contentDescription = "مسح")
            }
          }
        },
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
      )
    }

    // 4. Module Counter & Sync action
    item {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = "قائمة المقاييس والوحدات التعليمية",
          style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
        )
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Text(
            text = "${filteredModules.size} مقاييس",
            style = MaterialTheme.typography.labelSmall.copy(
              color = MaterialTheme.colorScheme.primary,
              fontWeight = FontWeight.Bold
            )
          )
          IconButton(
            onClick = { viewModel.refreshCourseContent("جاري تحديث المقاييس والمقررات...") },
            modifier = Modifier.size(32.dp).testTag("courses_refresh_btn")
          ) {
            Icon(
              imageVector = Icons.Default.Sync,
              contentDescription = "تحديث المقررات من الخادم",
              tint = MaterialTheme.colorScheme.primary,
              modifier = Modifier.size(18.dp)
            )
          }
        }
      }
    }

    // 5. Module Cards List
    if (filteredModules.isEmpty()) {
      item {
        Card(
          shape = RoundedCornerShape(18.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            Icon(
              imageVector = Icons.AutoMirrored.Filled.MenuBook,
              contentDescription = null,
              tint = MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.size(48.dp)
            )
            Text(
              text = "لا توجد مقاييس في هذا المستوى حالياً",
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
            )
            Text(
              text = "يمكنك إضافة مقاييس ومحاضرات من لوحة الإدارة.",
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }
        }
      }
    } else {
      items(filteredModules, key = { it.id }) { module ->
        ModuleCardItem(
          module = module,
          onOpenLectures = {
            viewModel.recordModuleViewed(module.id)
            viewModel.selectModule(module)
            onNavigate(ScreenRoute.LECTURES)
          },
          onCacheOffline = {
            viewModel.cacheCourseContentForOffline(module)
          }
        )
      }
    }
  }
}

@Composable
fun ModuleCardItem(
  module: ModuleCourse,
  onOpenLectures: () -> Unit,
  onCacheOffline: () -> Unit = {}
) {
  Card(
    shape = RoundedCornerShape(20.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onOpenLectures)
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          Box(
            modifier = Modifier
              .clip(RoundedCornerShape(8.dp))
              .background(
                when (module.category) {
                  "أساسي" -> MaterialTheme.colorScheme.primary
                  "منهجي" -> Color(0xFF10B981)
                  else -> Color(0xFFF59E0B)
                }
              )
              .padding(horizontal = 8.dp, vertical = 3.dp)
          ) {
            Text(
              text = "وحدة ${module.category}",
              style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontWeight = FontWeight.Bold)
            )
          }

          if (module.isCachedOffline || module.lastViewedTimestamp > 0) {
            Box(
              modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF10B981).copy(alpha = 0.15f))
                .padding(horizontal = 6.dp, vertical = 3.dp)
            ) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp)
              ) {
                Icon(
                  imageVector = Icons.Default.OfflinePin,
                  contentDescription = null,
                  tint = Color(0xFF10B981),
                  modifier = Modifier.size(12.dp)
                )
                Text(
                  text = "مخزن محلياً",
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = Color(0xFF10B981),
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp
                  )
                )
              }
            }
          }
        }

        Text(
          text = module.code,
          style = MaterialTheme.typography.labelSmall.copy(
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
        )
      }

      Text(
        text = module.name,
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black, fontSize = 16.sp)
      )

      if (module.description.isNotEmpty()) {
        Text(
          text = module.description,
          style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
          lineHeight = 18.sp
        )
      }

      HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          Icon(
            imageVector = Icons.Default.Person,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(16.dp)
          )
          Text(
            text = module.professorName.ifEmpty { "أستاذ المقياس" },
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold)
          )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(
            text = "المعامل: ${module.coefficient}",
            style = MaterialTheme.typography.labelSmall.copy(
              color = MaterialTheme.colorScheme.primary,
              fontWeight = FontWeight.Bold
            )
          )
          Text(
            text = "الأرصدة: ${module.credits}",
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
          )
        }
      }

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        Button(
          onClick = onOpenLectures,
          shape = RoundedCornerShape(12.dp),
          modifier = Modifier.weight(1f),
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
        ) {
          Icon(
            imageVector = Icons.Default.Description,
            contentDescription = null,
            modifier = Modifier.size(18.dp)
          )
          Spacer(modifier = Modifier.width(6.dp))
          Text(
            text = "المحاضرات وملفات PDF",
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
          )
        }

        OutlinedIconButton(
          onClick = onCacheOffline,
          shape = RoundedCornerShape(12.dp)
        ) {
          Icon(
            imageVector = Icons.Default.DownloadForOffline,
            contentDescription = "حفظ في الذاكرة المحلية (Room DB)",
            tint = MaterialTheme.colorScheme.primary
          )
        }
      }
    }
  }
}
