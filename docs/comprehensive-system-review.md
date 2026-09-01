# Comprehensive System Review — Logical Issues, UX Gaps & Required Improvements

> **Status: BINDING for all future development.** Saved 2026-09-02 at the user's
> request: *"Save the following text or anything that will help you remember it
> in every project update."* Every future feature request, bug fix, and refactor
> in this repository MUST be analyzed against this document before coding.
> Companion documents: `upload/تنظيف-وقاعدة-حماية-git.md` (cleanup + git
> protection policy), `upload/قواعد-عمل-موجهة-للأداة.md` (tool work rules).

---

## 1. Core Problem: Feature-by-Feature Implementation

The main issue is not simply that some features are missing. The deeper issue is how features are being implemented.

When a new feature is requested, do not implement only the literal request.

For example:

If asked to add Courses, do not simply create a list containing course names.

Think about the feature as a complete system:

- What should be displayed?
- Who should see it?
- When should it appear?
- What happens when the user clicks it?
- What happens when there is no data?
- Who can create it?
- Who can edit it?
- Who can delete it?
- What happens in error cases?
- What happens when the student's institution, specialization, track, or year changes?
- Are there conflicting states?
- Is the feature logically useful for the student and supervisor?
- Is its current location in the UI appropriate?
- Are empty, loading, pending, success, and error states handled?

This level of reasoning must be applied to every existing and new feature, rather than implementing requests in isolation.

---

## 2. Student-to-Group Assignment — Logical Issue

A major issue was discovered while testing the student group-assignment feature.

Example:

A student selected:

English Literature → Year 1

When attempting to assign this student to a group, the system displays other specializations and years that are unrelated to the student.

This is incorrect.

### Required Behavior

When assigning a student to a group, the available groups must be automatically filtered according to the student's existing academic data.

If:

"Specialization = English Literature"

"Year = 1"

then only groups/sub-groups matching that student's academic scope should be displayed.

Do not display:

- Other specializations.
- Other years.
- Other tracks.
- Other institutions.
- Groups outside the student's academic scope.

This filtering must be enforced in the underlying logic/data layer, not merely hidden visually in the UI.

---

## 3. Join Requests — Incomplete Workflow

The student join-request feature exists, but the complete management workflow is missing.

There is no clear supervisor-facing:

Pending Join Requests

section with:

- Accept
- Reject

This makes the feature incomplete.

### Required Workflow

Implement the complete flow:

"Student → Join Request → Pending → Authorized Representative → Accept / Reject"

The implementation must define:

- Who receives the request.
- Who can see it.
- Where it appears.
- When it appears.
- What happens after acceptance.
- What happens after rejection.
- Whether the student can request again.
- What happens if the student already belongs to a group.

---

## 4. Join Requests — Poor Discoverability

There is currently a requests section somewhere near the bottom of the Profile page, but it is not sufficiently visible or discoverable.

The problem is not simply that the feature exists.

The user needs to clearly understand:

- Whether they have a pending request.
- Whether a new request requires their attention.
- Where supervisors should manage incoming requests.
- Whether a request was accepted or rejected.

Consider:

- A dedicated location.
- A notification badge.
- A visible pending state.
- Clear status indicators.
- A supervisor dashboard entry for pending requests.

Do not hide an important workflow inside a small element at the bottom of the Profile page.

---

## 5. Courses Page — Insufficient Functionality

The current Courses page essentially displays only the course/subject name.

This makes the page feel like a list of names that the student already knows, rather than an actual academic resource.

The key question is:

«What is the student supposed to do after opening a course?»

The course page should be designed around that question.

Depending on the actual data available, a course may contain:

- Course name.
- Basic course information.
- Lectures.
- Files.
- Summaries.
- Books/references.
- Exams/tests.
- Assignments.
- Progress.
- Recently added content.

Do not add these elements randomly.

First define the actual purpose of the Course page, then design the information architecture around that purpose.

---

## 6. Course Cards — Weak Visual Presentation

Even the existing course information is not presented attractively enough.

Review:

- Card structure.
- Visual hierarchy.
- Key information.
- Icons.
- Interaction behavior.
- Empty states.
- Content availability indicators.
- What happens when the card is opened.

A course card should not feel like:

Course Name + Empty Space

It should communicate useful information and provide a clear reason to open it.

---

## 7. Schedule — Missing Manual Features

The Schedule section currently needs more functional depth.

The student should be able to maintain a personal timetable, including classes they add manually.

The system should support, where appropriate:

- Add class.
- Edit class.
- Delete class.
- Select day.
- Select time.
- Select course.
- Add location.
- Add optional notes.

These manually created classes are personal student data and should not automatically be treated as official institutional schedule data.

---

## 8. Class Images / Attachments

Consider allowing the student to attach images to a manually created class.

However, this must be intentionally limited.

Maximum:

2–3 images per class.

The system must clearly distinguish between:

- Personal class information added by the student.
- Official or supervisor-provided information, if such functionality exists.

Do not turn individual classes into unlimited image-storage containers.

---

## 9. Exams/Tests Card — Unclear Purpose

There is currently an Exams/Tests card among the first four cards.

However, its actual value is unclear.

The important question is:

«What does this card actually help the student accomplish?»

Possible purposes include:

- Upcoming exams.
- Previous exams.
- Exam files.
- Interactive tests.
- Course-related assessments.
- Exam archive.

The purpose must be clearly defined before deciding that it deserves a prominent position.

If it does not provide meaningful value in the current MVP, consider:

- Moving it.
- Integrating it into Courses.
- Replacing it.
- Removing it temporarily.

Do not keep a prominent card simply because the feature exists.

---

## 10. My Files — Unclear Purpose and Access

The My Files section is currently unclear in both purpose and navigation.

Questions that need to be resolved:

- What exactly belongs in My Files?
- Why does the student need this section?
- How is it different from files inside Courses?
- Is it for personal files?
- Is it for academic resources?
- Can students upload files?
- What actions are available?
- Where is the primary action button?

If My Files is intended for personal student files, make that distinction explicit.

Course materials should generally remain associated with their respective courses rather than being unnecessarily duplicated in My Files.

---

## 11. Assignments — Needs a Distinct Model

There is an Assignments section, but its current purpose and behavior are not sufficiently developed.

Assignments should be clearly separated from Announcements.

### Student Side

The student may need a personal space for locally written assignment notes.

They should be able to:

- Write a personal note.
- Save it locally.
- Edit it.
- Delete it.

These personal notes should remain private.

### Supervisor Side

A supervisor should be able to publish academic assignment information within their permitted scope.

However, this content must be treated as an Assignment, not as an Announcement.

### Announcement

Used for general information, notices, or important updates.

### Assignment

Used for an academic task that students are expected to know about, follow, or complete.

Do not merge both concepts simply because they look similar.

---

## 12. Group and Assignment Cards

There are currently separate cards for Group and Assignments.

Review whether these cards actually deserve prominent positions on the Home screen.

For every card, ask:

- What is its primary purpose?
- Who needs it?
- Is it frequently used?
- Does it deserve a Home-screen position?
- What happens when there is no data?
- Is there a clear primary action?
- Is it showing useful information or merely acting as a shortcut?

Do not keep cards simply because they correspond to existing features.

---

## 13. Bottom Navigation — Needs UX Review

The current bottom navigation contains:

- Home
- Courses
- Schedule
- My Files
- More

The placement of Courses and Schedule in the bottom navigation deserves further discussion.

First determine:

«What are the 4–5 destinations students actually need to access most frequently?»

Then design the bottom navigation around those priorities.

Do not change the navigation arbitrarily.

The decision should be based on the actual product structure and the student's most common workflows.

---

## 14. Reports — Missing Clear Entry Point

There is a reporting system, but there is no sufficiently clear way for the student to access it.

The following must be defined:

### Student

- Where can the student submit a report?
- What types of reports are available?
- What information must be provided?
- What happens after submission?
- Does the student receive confirmation?
- Can the student see the report status?
- Can the student see whether it has been resolved?

### Supervisor

- Where are incoming reports displayed?
- Which reports can the supervisor see?
- Are new reports clearly marked?
- Is there a notification badge?
- How are resolved reports distinguished from new reports?

A feature should not merely exist in the database or in a hidden page. It must be discoverable and usable.

---

## 15. In-App Guidance / Contextual Tooltips

The application needs lightweight contextual guidance for first-time users.

When a user interacts with an important feature for the first time, display a small tooltip or coach mark explaining its purpose.

Example:

«"Here you can submit a request to join a group."»

Provide:

Got it

After the user dismisses it:

- Hide the guidance.
- Do not repeatedly show the same tooltip to the same user.

Use contextual guidance selectively.

Do not overwhelm the user by explaining every button.

---

## 16. Supervisor Dashboard — Poor Organization

The Supervisor Dashboard currently feels unorganized.

The problem is not necessarily one individual component; the overall information architecture needs review.

Organize the dashboard according to:

- Priority.
- Type of task.
- Supervisor scope.
- Frequently performed actions.
- Items requiring immediate attention.
- Information vs. management functions.

Do not place every feature into equal-sized cards.

Separate the dashboard conceptually into:

### Actions Requiring Attention

Examples:

- Pending join requests.
- New reports.
- Items requiring review.

### Information

Examples:

- Number of students.
- Number of groups.
- Statistics.

### Management

Examples:

- Student management.
- Group management.
- Supervisor management.
- Content management.

The goal is to make the Supervisor Dashboard feel like a real Control Center, not a collection of unrelated feature cards.

---

## 17. Required Development Mindset — Think About the Whole System

From this point forward, do not interpret development requests as:

«"Add this element."»

Instead, treat every request as:

«"Analyze and implement this feature as part of the complete system."»

For every new or modified feature, automatically consider:

### A. Visibility

- Who sees it?
- Who does not?
- Does visibility depend on Role?
- Does visibility depend on Scope?

### B. Placement

- Where should it appear?
- Is its current location logical?
- Does it need its own navigation entry?

### C. States

Handle appropriate states such as:

- Empty
- Loading
- Pending
- Success
- Error
- Disabled
- Completed

### D. Actions

Consider all relevant actions:

- Add
- Edit
- Delete
- Accept
- Reject
- Cancel
- Retry

### E. Permissions

Define:

- Who can read?
- Who can create?
- Who can edit?
- Who can delete?
- Who can approve/reject?

### F. Data Relationships

Check relationships with:

- Institution
- Specialization
- Track
- Year
- Group
- SubGroup
- Course
- Student
- Supervisor

### G. Edge Cases

Always consider cases such as:

- Student without a group.
- Student with a pending request.
- Rejected student.
- Student already assigned to a group.
- Group deletion while students are assigned to it.
- Student changing year.
- Student changing specialization.
- No courses available.
- No files available.
- No exams available.
- No assignments available.
- No subordinate supervisors.
- A subordinate supervisor who has their own subordinates.

### H. UX

Ask:

- Does the user know what to do?
- Is the primary action obvious?
- Is the result of the action clear?
- Is there a success message?
- Is there an error message?
- Can the user recover from an error?
- Can the user go back?
- Is the feature discoverable?

### I. Consistency

Every feature must remain consistent with:

- Permission architecture.
- Scope system.
- Existing visual design.
- Database structure.
- Navigation.
- Other application workflows.

---

## 18. Required Analysis Before Coding

Before implementing any significant change, analyze its impact on the existing system.

Do not immediately write code just because a feature was requested.

First determine:

1. The actual purpose of the feature.
2. Target users.
3. Correct UI location.
4. Required permissions.
5. Relevant states.
6. Available actions.
7. Error cases.
8. Empty states.
9. Data relationships.
10. Dependencies on existing features.
11. What needs to be added.
12. What needs to be modified.
13. What should be removed or relocated if it becomes redundant.
14. Whether the feature actually deserves its current UI position.

Do not assume that every existing element must remain.

If an existing card, feature, button, or section provides little value, identify it and recommend whether it should be:

- Removed.
- Replaced.
- Merged.
- Relocated.
- Simplified.

Do not preserve something merely because it already exists.

---

## 19. Final Product Goal

The goal is not simply to make the application contain more features.

The goal is to make the application:

Logically consistent + Role-aware + Scope-aware + Discoverable + Easy to use + Visually organized

Every feature should therefore:

- Make logical sense.
- Exist in the appropriate location.
- Appear to the correct user.
- Appear at the correct time.
- Handle all relevant states.
- Provide clear actions.
- Handle errors and edge cases.
- Integrate correctly with the rest of the system.

Think about the application as one complete product, not as a collection of isolated feature requests implemented one by one.

