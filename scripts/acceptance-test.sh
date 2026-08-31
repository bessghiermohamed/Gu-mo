#!/bin/bash
# =====================================================
# Talib — Round 2 Acceptance Tests
# Reproduces the user's test scenario from the report:
#   student in (specialty A, year 1) vs student in (specialty B, year 3)
#   → each must see ONLY their own content. Zero overlap.
# =====================================================
set -u
BASE="http://localhost:3100"
PASS=0; FAIL=0

check() { # name, expected, actual
  if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1 (expected [$2] got [$3])"; fi
}

contains() { # name, substring, text
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1 (missing [$2] in: $(echo "$3" | head -c 200))"; fi
}

not_contains() { # name, substring, text
  if echo "$3" | grep -q "$2"; then FAIL=$((FAIL+1)); echo "❌ FAIL: $1 (should NOT contain [$2])";
  else PASS=$((PASS+1)); echo "✅ PASS: $1"; fi
}

echo "=== 1. Sign up: owner (first user) + two students ==="
rm -f /tmp/owner.jar /tmp/stud1.jar /tmp/stud2.jar
R=$(curl -s -c /tmp/owner.jar -X POST $BASE/api/auth/signup -H "Content-Type: application/json" -d '{"fullName":"المالك التجريبي","email":"owner@test.dz"}')
contains "owner signup ok" '"role":"OWNER"' "$R"

R=$(curl -s -c /tmp/stud1.jar -X POST $BASE/api/auth/signup -H "Content-Type: application/json" -d '{"fullName":"طالب السنة الأولى","email":"s1@test.dz"}')
contains "student1 signup ok" '"role":"STUDENT"' "$R"

R=$(curl -s -c /tmp/stud2.jar -X POST $BASE/api/auth/signup -H "Content-Type: application/json" -d '{"fullName":"طالب السنة الثالثة","email":"s2@test.dz"}')
contains "student2 signup ok" '"role":"STUDENT"' "$R"

echo ""
echo "=== 2. Onboarding: student1 → (spec A, year 1, track PEP) / student2 → (spec B, year 3, track PES) ==="
# discover real IDs dynamically (no hardcoded ids — safe across re-seeds)
SPEC_A=$(curl -s $BASE/api/institutions | python3 -c "import sys,json; insts=json.load(sys.stdin)['institutions']; print([i['id'] for i in insts if 'بوزريعة' in i['nameAr']][0])")
SPEC_B_INST=$(curl -s $BASE/api/institutions | python3 -c "import sys,json; insts=json.load(sys.stdin)['institutions']; print([i['id'] for i in insts if 'وهران' in i['nameAr']][0])")
SPEC_A_ID=$(curl -s "$BASE/api/specialties?institutionId=$SPEC_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['specialties'][0]['id'])")
SPEC_B_ID=$(curl -s "$BASE/api/specialties?institutionId=$SPEC_B_INST" | python3 -c "import sys,json; print(json.load(sys.stdin)['specialties'][0]['id'])")
YEAR1_A=$(curl -s "$BASE/api/onboarding/years?specialtyId=$SPEC_A_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['years'][0]['id'])")
YEAR3_B=$(curl -s "$BASE/api/onboarding/years?specialtyId=$SPEC_B_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['years'][2]['id'])")
TRACK_A=$(curl -s "$BASE/api/tracks?specialtyId=$SPEC_A_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['tracks'][0]['id'])")
TRACK_B=$(curl -s "$BASE/api/tracks?specialtyId=$SPEC_B_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['tracks'][2]['id'])")
echo "   (ids: specA=$SPEC_A_ID specB=$SPEC_B_ID year1A=$YEAR1_A year3B=$YEAR3_B trackA=$TRACK_A trackB=$TRACK_B)"

R=$(curl -s -b /tmp/stud1.jar -X POST $BASE/api/onboarding/complete -H "Content-Type: application/json" -d "{\"fullName\":\"طالب السنة الأولى\",\"email\":\"s1@test.dz\",\"institutionId\":$SPEC_A,\"specialtyId\":$SPEC_A_ID,\"academicYearId\":$YEAR1_A,\"trackId\":$TRACK_A}")
contains "student1 onboarding ok" '"ok":true' "$R"

R=$(curl -s -b /tmp/stud2.jar -X POST $BASE/api/onboarding/complete -H "Content-Type: application/json" -d "{\"fullName\":\"طالب السنة الثالثة\",\"email\":\"s2@test.dz\",\"institutionId\":$SPEC_B_INST,\"specialtyId\":$SPEC_B_ID,\"academicYearId\":$YEAR3_B,\"trackId\":$TRACK_B}")
contains "student2 onboarding ok" '"ok":true' "$R"

echo ""
echo "=== 3. As owner: create courses in (A, year1) and (B, year3) ==="
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/courses -H "Content-Type: application/json" -d "{\"name\":\"مقياس أ-سنة1\",\"code\":\"AR-101\",\"specialtyId\":$SPEC_A_ID,\"academicYearId\":$YEAR1_A,\"semester\":1}" )
contains "course A-year1 created" 'مقياس أ-سنة1' "$R"
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/courses -H "Content-Type: application/json" -d "{\"name\":\"مقياس أ-سنة1-سداسي2\",\"code\":\"AR-102\",\"specialtyId\":$SPEC_A_ID,\"academicYearId\":$YEAR1_A,\"semester\":2}" )
contains "course A-year1-s2 created" 'AR-102' "$R"
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/courses -H "Content-Type: application/json" -d "{\"name\":\"مقياس ب-سنة3\",\"code\":\"FR-301\",\"specialtyId\":$SPEC_B_ID,\"academicYearId\":$YEAR3_B,\"semester\":1}" )
contains "course B-year3 created" 'مقياس ب-سنة3' "$R"

echo ""
echo "=== 4. ACCEPTANCE TEST أ.3: course visibility (zero overlap) ==="
R=$(curl -s -b /tmp/stud1.jar $BASE/api/courses)
contains "student1 sees own course (A year1)" 'مقياس أ-سنة1' "$R"
not_contains "student1 does NOT see B's course" 'مقياس ب-سنة3' "$R"
not_contains "student1 does NOT see year-2+ courses (na)" 'FR-' "$R"

R=$(curl -s -b /tmp/stud2.jar $BASE/api/courses)
contains "student2 sees own course (B year3)" 'مقياس ب-سنة3' "$R"
not_contains "student2 does NOT see A's courses" 'مقياس أ' "$R"

echo ""
echo "=== 5. Semester filter data (real semester field) ==="
R=$(curl -s -b /tmp/stud1.jar $BASE/api/courses)
contains "course carries semester=1" '"semester":1' "$R"
contains "course carries semester=2" '"semester":2' "$R"

echo ""
echo "=== 6. ACCEPTANCE TEST أ.4: groups/cohorts visibility scoped by year ==="
R=$(curl -s -b /tmp/stud1.jar "$BASE/api/groups?specialtyId=$SPEC_A_ID&academicYearId=$YEAR1_A")
contains "student1 sees year-1 group" 'المجموعة 01 - AR' "$R"
R=$(curl -s -b /tmp/stud2.jar "$BASE/api/groups?specialtyId=$SPEC_B_ID&academicYearId=$YEAR3_B")
contains "student2 sees year-3-of-B group" 'المجموعة 01 - FR' "$R"

echo ""
echo "=== 7. Schedule scope (same year filtering) ==="
curl -s -b /tmp/owner.jar -X POST $BASE/api/schedule -H "Content-Type: application/json" -d '{"dayOfWeek":1,"startTime":"08:00","endTime":"10:00","moduleName":"محاضرة أ","type":"محاضرة","room":"قاعة 1","professor":"أ. محمد"}' > /dev/null
R=$(curl -s -b /tmp/stud2.jar $BASE/api/schedule)
not_contains "student2 (spec B) does NOT see A's schedule" 'محاضرة أ' "$R"

echo ""
echo "=== 8. ج: announcements — permission-gated creation ==="
R=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud1.jar -X POST $BASE/api/announcements -H "Content-Type: application/json" -d '{"title":"إعلان طالب","content":"محتوى"}')
check "student cannot publish announcement (403)" "403" "$R"

R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/announcements -H "Content-Type: application/json" -d '{"title":"إعلان رسمي","content":"مرحبا","urgency":"هام"}')
contains "owner publishes announcement" 'إعلان رسمي' "$R"

echo ""
echo "=== 9. ج: exams — create + scoped list ==="
MOD_A_ID=$(curl -s -b /tmp/owner.jar "$BASE/api/courses" | python3 -c "import sys,json; print([c['id'] for c in json.load(sys.stdin)['courses'] if c['code']=='AR-101'][0])")
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/exams -H "Content-Type: application/json" -d "{\"moduleId\":$MOD_A_ID,\"title\":\"امتحان منتصف السداسي\",\"examDate\":\"2026-09-15\",\"time\":\"09:00\",\"room\":\"قاعة 2\"}")
contains "owner creates exam" 'امتحان منتصف السداسي' "$R"
R=$(curl -s -b /tmp/stud2.jar $BASE/api/exams)
not_contains "student2 (spec B) does NOT see A's exam" 'امتحان منتصف السداسي' "$R"

echo ""
echo "=== 10. أ.5 flow: join request → owner sees → approve → student linked ==="
FIRST_COHORT=$(curl -s -b /tmp/owner.jar "$BASE/api/cohort?specialtyId=$SPEC_A_ID&academicYearId=$YEAR1_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['cohorts'][0]['id'])")
R=$(curl -s -b /tmp/stud1.jar -X POST $BASE/api/join-requests -H "Content-Type: application/json" -d "{\"cohortId\":$FIRST_COHORT,\"message\":\"أرغب بالانضمام\"}")
contains "student1 sends join request" 'pending' "$R"

R=$(curl -s -b /tmp/owner.jar $BASE/api/join-requests)
contains "owner sees pending request" 'طالب السنة الأولى' "$R"

REQ_ID=$(echo "$R" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/join-requests/$REQ_ID/approve -H "Content-Type: application/json" -d '{"note":""}')
contains "owner approves request" 'تم قبول' "$R"

R=$(curl -s -b /tmp/stud1.jar $BASE/api/auth/me)
contains "student1 now linked to cohort" "\"scopeCohortGroupId\":$FIRST_COHORT" "$R"

# round 3: deleting a cohort that has an attached student must be BLOCKED
R=$(curl -s -b /tmp/owner.jar -X DELETE "$BASE/api/cohort?id=$FIRST_COHORT")
contains "cohort with attached student cannot be deleted" 'لا يمكن حذف الفوج' "$R"

echo ""
echo "=== 11. Promote endpoint (was missing → 404) ==="
STUD2_ID=$(curl -s -b /tmp/owner.jar $BASE/api/users | python3 -c "import sys,json; users=json.load(sys.stdin)['users']; print([u['id'] for u in users if u['email']=='s2@test.dz'][0])")
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/users/$STUD2_ID/promote -H "Content-Type: application/json" -d '{"newRole":"REPRESENTATIVE"}')
contains "owner promotes student2 to representative" 'تم تحديث الدور' "$R"

R=$(curl -s -b /tmp/owner.jar $BASE/api/users | python3 -c "import sys,json; users=json.load(sys.stdin)['users']; print([u['role'] for u in users if u['email']=='s2@test.dz'][0])")
check "student2 role is now REPRESENTATIVE" "REPRESENTATIVE" "$R"

echo ""
echo "=== 12. أ.1/أ.2: specialty + track creation for a NEW institution ==="
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/institutions -H "Content-Type: application/json" -d '{"nameAr":"ملحقة سوقر","type":"مدرسة عليا","city":"سوقر"}')
contains "new institution created" 'ملحقة سوقر' "$R"
NEW_INST=$(curl -s -b /tmp/owner.jar $BASE/api/institutions | grep -o '"id":[0-9]*' | tail -1 | cut -d: -f2)
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/specialties -H "Content-Type: application/json" -d "{\"nameAr\":\"تخصص سوقر\",\"code\":\"SK-1\",\"institutionId\":$NEW_INST}")
contains "specialty for new institution" 'تخصص سوقر' "$R"
NEW_SPEC=$(curl -s -b /tmp/owner.jar "$BASE/api/specialties?institutionId=$NEW_INST" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/tracks -H "Content-Type: application/json" -d "{\"specialtyId\":$NEW_SPEC,\"trackNameAr\":\"أستاذ التعليم الابتدائي (PEP)\",\"code\":\"PEP\"}")
contains "track PEP preset for new specialty" 'PEP' "$R"

echo ""
echo "=== 13. ROUND 3: server-side scope enforcement (forged params rejected) ==="
# A student FORGES the specialtyId of the OTHER specialty — the server must
# ignore it and return only the student's own scope.
R=$(curl -s -b /tmp/stud1.jar "$BASE/api/groups?specialtyId=$SPEC_B_ID")
not_contains "forged specialtyId: student1 (spec A) does NOT see B's groups" 'المجموعة 01 - FR' "$R"
contains "forged specialtyId: student1 still sees own year-1 group" 'المجموعة 01 - AR' "$R"

# A student FORGES a foreign academicYearId — ignored as well (server forces
# the student's own year, so they still see exactly their 1 own group).
COUNT=$(curl -s -b /tmp/stud1.jar "$BASE/api/groups?specialtyId=$SPEC_A_ID&academicYearId=$YEAR3_B" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('groups',[])))")
check "forged yearId ignored: student1 sees exactly own 1 group" "1" "$COUNT"

# Unauthenticated access is now rejected (401) on the previously-open routes.
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/groups?specialtyId=$SPEC_A_ID")
check "anonymous /api/groups is 401" "401" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cohort?specialtyId=$SPEC_A_ID")
check "anonymous /api/cohort is 401" "401" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/groups/1/cohorts")
check "anonymous /api/groups/cohorts is 401" "401" "$CODE"

# A student cannot read another specialty's group cohorts even by id.
B_GROUP=$(curl -s -b /tmp/owner.jar "$BASE/api/groups?specialtyId=$SPEC_B_ID&academicYearId=$YEAR3_B" | python3 -c "import sys,json; print(json.load(sys.stdin)['groups'][0]['id'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud1.jar "$BASE/api/groups/$B_GROUP/cohorts")
check "student1 (spec A) reading spec-B group cohorts is 403" "403" "$CODE"

echo ""
echo "=== 14. ROUND 3: years management API (زر السنوات) ==="
# Owner adds a year to the NEW specialty (سكهر) which had none.
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/years -H "Content-Type: application/json" -d "{\"specialtyId\":$NEW_SPEC,\"yearName\":\"السنة الأولى\"}")
contains "owner adds year to new specialty" 'السنة الأولى' "$R"

NEW_YEAR_ID=$(curl -s -b /tmp/owner.jar "$BASE/api/years?specialtyId=$NEW_SPEC" | python3 -c "import sys,json; print(json.load(sys.stdin)['years'][0]['id'])")

# duplicate year is rejected.
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/owner.jar -X POST $BASE/api/years -H "Content-Type: application/json" -d "{\"specialtyId\":$NEW_SPEC,\"yearName\":\"السنة الأولى\"}")
check "duplicate year rejected (409)" "409" "$CODE"

# students cannot create years.
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud1.jar -X POST $BASE/api/years -H "Content-Type: application/json" -d "{\"specialtyId\":$NEW_SPEC,\"yearName\":\"سنة ممنوعة\"}")
check "student cannot create year (403)" "403" "$CODE"

# year deletion works for an EMPTY year.
R=$(curl -s -b /tmp/owner.jar -X DELETE "$BASE/api/years?id=$NEW_YEAR_ID")
contains "owner deletes empty year" 'تم حذف السنة' "$R"

# year deletion is BLOCKED while cohorts exist inside.
R=$(curl -s -b /tmp/owner.jar -X DELETE "$BASE/api/years?id=$YEAR1_A")
contains "year with cohorts cannot be deleted" 'لا يمكن حذف السنة' "$R"

echo ""
echo "=== 15. ROUND 3: student without onboarding gets hint, not data ==="
rm -f /tmp/stud3.jar
R=$(curl -s -c /tmp/stud3.jar -X POST $BASE/api/auth/signup -H "Content-Type: application/json" -d '{"fullName":"طالب بلا إعداد","email":"s3@test.dz"}')
contains "student3 signup ok" '"role":"STUDENT"' "$R"
R=$(curl -s -b /tmp/stud3.jar "$BASE/api/groups?specialtyId=$SPEC_A_ID")
contains "un-onboarded student gets needsOnboarding flag" 'needsOnboarding' "$R"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud3.jar "$BASE/api/groups/1/cohorts")
check "un-onboarded student cohorts call returns 200 (hint in body)" "200" "$CODE"
# use a REAL group id (ids shift after re-seeds)
REAL_GROUP=$(curl -s -b /tmp/owner.jar "$BASE/api/groups?specialtyId=$SPEC_A_ID&academicYearId=$YEAR1_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['groups'][0]['id'])")
R=$(curl -s -b /tmp/stud3.jar "$BASE/api/groups/$REAL_GROUP/cohorts")
contains "un-onboarded student gets empty cohorts + hint" 'needsOnboarding' "$R"

echo ""
echo "=== 16. ROUND 5: the missing edit layer (PATCH endpoints) ==="
# 16a. year rename — even while groups/cohorts exist inside (unblocks the delete-guard deadlock)
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/years -H "Content-Type: application/json" -d "{\"id\":$YEAR1_A,\"yearName\":\"السنة الأولى (معدلة)\",\"semester\":2}")
contains "year renamed while dependents exist (deadlock fixed)" 'السنة الأولى (معدلة)' "$R"
contains "year semester updated via PATCH" '"semester":2' "$R"
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/years -H "Content-Type: application/json" -d "{\"id\":$YEAR1_A,\"yearName\":\"السنة الأولى (L1)\",\"semester\":1}")
contains "year restored" 'السنة الأولى (L1)' "$R"

# 16b. duplicate-name rename rejected (seed years use (L1)..(L5) suffixes)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/owner.jar -X PATCH $BASE/api/years -H "Content-Type: application/json" -d "{\"id\":$YEAR1_A,\"yearName\":\"السنة الثالثة (L3)\"}")
check "year rename to duplicate name rejected (409)" "409" "$CODE"

# 16c. cohort rename — this cohort has an ATTACHED student (section 10) yet renames safely
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/cohort -H "Content-Type: application/json" -d "{\"id\":$FIRST_COHORT,\"groupName\":\"الفوج 01 (معدل)\"}")
contains "cohort renamed while student attached" 'الفوج 01 (معدل)' "$R"
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/cohort -H "Content-Type: application/json" -d "{\"id\":$FIRST_COHORT,\"groupName\":\"الفوج 01\"}")
contains "cohort name restored" 'الفوج 01' "$R"

# 16d. group rename + description update (group contains cohorts)
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/groups -H "Content-Type: application/json" -d "{\"id\":$REAL_GROUP,\"groupName\":\"المجموعة 01 - AR (معدلة)\",\"description\":\"وصف محدث\"}")
contains "group renamed while cohorts inside" 'المجموعة 01 - AR (معدلة)' "$R"
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/groups -H "Content-Type: application/json" -d "{\"id\":$REAL_GROUP,\"groupName\":\"المجموعة 01 - AR\",\"description\":\"\"}")
contains "group name restored" 'المجموعة 01 - AR' "$R"

# 16e. exam edit (reschedule without delete + retype)
EXAM_ID=$(curl -s -b /tmp/owner.jar $BASE/api/exams | python3 -c "import sys,json; print([e['id'] for e in json.load(sys.stdin)['exams'] if 'منتصف' in e['title']][0])")
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/exams -H "Content-Type: application/json" -d "{\"id\":$EXAM_ID,\"room\":\"قاعة 9\",\"examDate\":\"2026-10-01\"}")
contains "exam rescheduled via PATCH" 'قاعة 9' "$R"

# 16f. schedule slot edit
SCHED_ID=$(curl -s -b /tmp/owner.jar $BASE/api/schedule | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/schedule -H "Content-Type: application/json" -d "{\"id\":$SCHED_ID,\"room\":\"قاعة 7 (معدلة)\"}")
contains "schedule slot edited via PATCH" 'قاعة 7 (معدلة)' "$R"

# 16g. announcement edit + delete by owner (previously a mistake was PERMANENT)
ANN_ID=$(curl -s -b /tmp/owner.jar $BASE/api/announcements | python3 -c "import sys,json; print(json.load(sys.stdin)['announcements'][0]['id'])")
R=$(curl -s -b /tmp/owner.jar -X PATCH $BASE/api/announcements -H "Content-Type: application/json" -d "{\"id\":$ANN_ID,\"title\":\"إعلان رسمي (معدل)\",\"urgency\":\"عاجل\"}")
contains "announcement edited by owner" 'إعلان رسمي (معدل)' "$R"
R=$(curl -s -b /tmp/owner.jar -X DELETE "$BASE/api/announcements?id=$ANN_ID")
contains "announcement deleted by owner" 'تم حذف الإعلان' "$R"

echo ""
echo "=== 17. ROUND 5: cross-specialty delete/edit authorization (IDOR closed) ==="
# promote stud2 to SPECIALTY_ADMIN of spec B so the ROLE check passes and only
# the new SCOPE check can reject the cross-specialty request.
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/users/$STUD2_ID/promote -H "Content-Type: application/json" -d '{"newRole":"SPECIALTY_ADMIN"}')
contains "stud2 promoted to specialty admin (spec B)" 'تم تحديث الدور' "$R"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud2.jar -X DELETE "$BASE/api/years?id=$YEAR1_A")
check "admin of spec B cannot delete spec A year (403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud2.jar -X DELETE "$BASE/api/groups?id=$REAL_GROUP")
check "admin of spec B cannot delete spec A group (403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud2.jar -X DELETE "$BASE/api/cohort?id=$FIRST_COHORT")
check "admin of spec B cannot delete spec A cohort (403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud2.jar -X DELETE "$BASE/api/exams?id=$EXAM_ID")
check "admin of spec B cannot delete spec A exam (403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud2.jar -X DELETE "$BASE/api/schedule?id=$SCHED_ID")
check "admin of spec B cannot delete spec A schedule slot (403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud2.jar -X PATCH $BASE/api/years -H "Content-Type: application/json" -d "{\"id\":$YEAR1_A,\"yearName\":\"اختراق\"}")
check "admin of spec B cannot rename spec A year (403)" "403" "$CODE"
# announcements: cross-specialty delete also rejected
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/announcements -H "Content-Type: application/json" -d '{"title":"إعلان تخصص أ","content":"محتوى"}')
contains "owner creates announcement in spec A" 'إعلان تخصص أ' "$R"
ANN_B_ID=$(curl -s -b /tmp/owner.jar $BASE/api/announcements | python3 -c "import sys,json; print([a['id'] for a in json.load(sys.stdin)['announcements'] if 'تخصص أ' in a['title']][0])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud2.jar -X DELETE "$BASE/api/announcements?id=$ANN_B_ID")
check "admin of spec B cannot delete spec A announcement (403)" "403" "$CODE"
# students still cannot edit or delete announcements
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud1.jar -X PATCH $BASE/api/announcements -H "Content-Type: application/json" -d "{\"id\":$ANN_B_ID,\"title\":\"x\"}")
check "student cannot edit announcement (403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/stud1.jar -X DELETE "$BASE/api/announcements?id=$ANN_B_ID")
check "student cannot delete announcement (403)" "403" "$CODE"
# owner can still delete it (authority confirmed)
R=$(curl -s -b /tmp/owner.jar -X DELETE "$BASE/api/announcements?id=$ANN_B_ID")
contains "owner deletes the spec A announcement" 'تم حذف الإعلان' "$R"

echo ""
echo "=========================================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "=========================================="
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
