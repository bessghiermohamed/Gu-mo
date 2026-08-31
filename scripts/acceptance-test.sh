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
echo "=== 2. Onboarding: student1 → (spec A=1, year 1, track PEP) / student2 → (spec B=2, year 3, track PES) ==="
# years: spec A years 1..5 → ids 1-5; spec B years → ids 6-10 (year 3 of B = id 8)
R=$(curl -s -b /tmp/stud1.jar -X POST $BASE/api/onboarding/complete -H "Content-Type: application/json" -d '{"fullName":"طالب السنة الأولى","email":"s1@test.dz","institutionId":1,"specialtyId":1,"academicYearId":1,"trackId":1}')
contains "student1 onboarding ok" '"ok":true' "$R"

R=$(curl -s -b /tmp/stud2.jar -X POST $BASE/api/onboarding/complete -H "Content-Type: application/json" -d '{"fullName":"طالب السنة الثالثة","email":"s2@test.dz","institutionId":2,"specialtyId":2,"academicYearId":8,"trackId":5}')
contains "student2 onboarding ok" '"ok":true' "$R"

echo ""
echo "=== 3. As owner: create courses in (A, year1) and (B, year3) ==="
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/courses -H "Content-Type: application/json" -d '{"name":"مقياس أ-سنة1","code":"AR-101","specialtyId":1,"academicYearId":1,"semester":1}')
contains "course A-year1 created" 'مقياس أ-سنة1' "$R"
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/courses -H "Content-Type: application/json" -d '{"name":"مقياس أ-سنة1-سداسي2","code":"AR-102","specialtyId":1,"academicYearId":1,"semester":2}')
contains "course A-year1-s2 created" 'AR-102' "$R"
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/courses -H "Content-Type: application/json" -d '{"name":"مقياس ب-سنة3","code":"FR-301","specialtyId":2,"academicYearId":8,"semester":1}')
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
R=$(curl -s -b /tmp/stud1.jar "$BASE/api/groups?specialtyId=1&academicYearId=1")
contains "student1 sees year-1 group" 'المجموعة 01 - AR' "$R"
R=$(curl -s -b /tmp/stud2.jar "$BASE/api/groups?specialtyId=2&academicYearId=8")
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
COHORT_ID=$(curl -s -b /tmp/stud1.jar "$BASE/api/groups?specialtyId=1&academicYearId=1" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
GROUP_ID=$COHORT_ID  # first id in groups response is the group
R=$(curl -s -b /tmp/stud1.jar -X POST $BASE/api/join-requests -H "Content-Type: application/json" -d "{\"cohortId\":1,\"groupId\":1,\"message\":\"أرغب بالانضمام\"}")
contains "student1 sends join request" 'pending' "$R"

R=$(curl -s -b /tmp/owner.jar $BASE/api/join-requests)
contains "owner sees pending request" 'طالب السنة الأولى' "$R"

REQ_ID=$(echo "$R" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
R=$(curl -s -b /tmp/owner.jar -X POST $BASE/api/join-requests/$REQ_ID/approve -H "Content-Type: application/json" -d '{"note":""}')
contains "owner approves request" 'تم قبول' "$R"

R=$(curl -s -b /tmp/stud1.jar $BASE/api/auth/me)
contains "student1 now linked to cohort" '"scopeCohortGroupId":1' "$R"

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
echo "=========================================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "=========================================="
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
