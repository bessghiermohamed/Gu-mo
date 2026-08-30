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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.ClassPoll
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PollsScreen(
  viewModel: TalibViewModel,
  onNavigateBack: () -> Unit
) {
  val polls by viewModel.allPolls.collectAsStateWithLifecycle()
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()
  var showCreatePollDialog by remember { mutableStateOf(false) }

  if (showCreatePollDialog) {
    var question by remember { mutableStateOf("") }
    var optA by remember { mutableStateOf("") }
    var optB by remember { mutableStateOf("") }
    var optC by remember { mutableStateOf("") }

    AlertDialog(
      onDismissRequest = { showCreatePollDialog = false },
      title = { Text("إنشاء استطلاع رأي جديد للفوج", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = question,
            onValueChange = { question = it },
            label = { Text("سؤال الاستطلاع (مثال: موعد حصة التعويض)") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = optA,
            onValueChange = { optA = it },
            label = { Text("الخيار الأول (A)") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = optB,
            onValueChange = { optB = it },
            label = { Text("الخيار الثاني (B)") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = optC,
            onValueChange = { optC = it },
            label = { Text("الخيار الثالث (اختياري C)") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (question.isNotBlank() && optA.isNotBlank() && optB.isNotBlank()) {
              viewModel.createPoll(
                question = question,
                optionA = optA,
                optionB = optB,
                optionC = optC,
                targetGroup = profile?.groupNumber ?: "الفوج 03"
              )
              showCreatePollDialog = false
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("نشر الاستطلاع")
        }
      },
      dismissButton = {
        TextButton(onClick = { showCreatePollDialog = false }) { Text("إلغاء") }
      }
    )
  }

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("polls_screen"),
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text("استطلاعات الرأي والتصويت الصفي", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = "تفاعل صفي مباشر لطلبة ${profile?.groupNumber ?: "الفوج 03"}",
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
          IconButton(onClick = { showCreatePollDialog = true }) {
            Icon(Icons.Default.AddCircleOutline, contentDescription = "استطلاع جديد", tint = MaterialTheme.colorScheme.primary)
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
      verticalArrangement = Arrangement.spacedBy(16.dp),
      contentPadding = PaddingValues(top = 8.dp, bottom = 90.dp)
    ) {
      item {
        Card(
          shape = RoundedCornerShape(20.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)),
          modifier = Modifier.fillMaxWidth()
        ) {
          Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            Icon(Icons.Default.Poll, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
            Text(
              text = "شارك بصوتك في تحديد مواعيد الحصص التعويضية، تأجيل تسليم الواجبات، والقرارات المشتركة للفوج.",
              style = MaterialTheme.typography.bodyMedium
            )
          }
        }
      }

      if (polls.isEmpty()) {
        item {
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
          ) {
            Text(
              text = "لا توجد استطلاعات رأي نشطة حالياً للفوج.",
              modifier = Modifier.padding(16.dp),
              style = MaterialTheme.typography.bodyMedium
            )
          }
        }
      } else {
        items(polls) { poll ->
          val totalVotes = poll.votesA + poll.votesB + poll.votesC
          val hasVoted = poll.userVotedOption != null

          Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
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
                Text(
                  text = poll.creatorName,
                  style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                )
                Text(
                  text = "$totalVotes صوت",
                  style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                )
              }

              Text(
                text = poll.question,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )

              // Option A
              val percentA = if (totalVotes > 0) (poll.votesA * 100) / totalVotes else 0
              PollOptionItem(
                label = poll.optionA,
                votes = poll.votesA,
                percentage = percentA,
                isSelected = poll.userVotedOption == poll.optionA,
                hasVoted = hasVoted,
                onVote = { viewModel.voteOnPoll(poll, poll.optionA) }
              )

              // Option B
              val percentB = if (totalVotes > 0) (poll.votesB * 100) / totalVotes else 0
              PollOptionItem(
                label = poll.optionB,
                votes = poll.votesB,
                percentage = percentB,
                isSelected = poll.userVotedOption == poll.optionB,
                hasVoted = hasVoted,
                onVote = { viewModel.voteOnPoll(poll, poll.optionB) }
              )

              // Option C
              if (poll.optionC.isNotBlank()) {
                val percentC = if (totalVotes > 0) (poll.votesC * 100) / totalVotes else 0
                PollOptionItem(
                  label = poll.optionC,
                  votes = poll.votesC,
                  percentage = percentC,
                  isSelected = poll.userVotedOption == poll.optionC,
                  hasVoted = hasVoted,
                  onVote = { viewModel.voteOnPoll(poll, poll.optionC) }
                )
              }

              if (hasVoted) {
                Text(
                  text = "✓ تم تسجيل صوتك بنجاح",
                  style = MaterialTheme.typography.labelSmall.copy(color = Color(0xFF10B981), fontWeight = FontWeight.Bold)
                )
              }
            }
          }
        }
      }
    }
  }
}

@Composable
fun PollOptionItem(
  label: String,
  votes: Int,
  percentage: Int,
  isSelected: Boolean,
  hasVoted: Boolean,
  onVote: () -> Unit
) {
  Card(
    shape = RoundedCornerShape(12.dp),
    colors = CardDefaults.cardColors(
      containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer
      else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
    ),
    onClick = onVote,
    modifier = Modifier.fillMaxWidth()
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(12.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          if (isSelected) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
          }
          Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
          )
        }
        if (hasVoted) {
          Text(
            text = "$percentage% ($votes)",
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
          )
        }
      }

      if (hasVoted) {
        LinearProgressIndicator(
          progress = { percentage / 100f },
          modifier = Modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(2.dp)),
          color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
        )
      }
    }
  }
}
