from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.authorization.models import Role
from apps.tenants.context import set_current_school_id
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    SchoolClassFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    SubjectOfferingFactory,
    UserFactory,
)

from .models import Quiz, QuizAttempt, QuizOption
from .parsing import QuizFileError, parse_quiz_file

pytestmark = pytest.mark.django_db

QUIZ_TEXT = (
    "1. What is 2 + 2?\nA) 3\nB) 4*\nC) 5\nD) 6\n\n"
    "2. Capital of France?\nA) London\nB) Berlin\nC) Paris*\nD) Madrid\n\n"
    "3. Largest planet?\nA) Mars\nB) Jupiter*\nC) Venus\n"
)


@pytest.fixture(autouse=True)
def _tenant_context_cleanup():
    """Services are normally called inside a request (tenant context set by the view); tests that
    call them directly set the context via _world(), and this clears it afterwards."""
    yield
    set_current_school_id(None)


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _txt(text=QUIZ_TEXT, name="quiz.txt"):
    return SimpleUploadedFile(name, text.encode(), content_type="text/plain")


def _world():
    seed_permission_catalog()
    school = SchoolFactory()
    set_current_school_id(school.id)
    seed_default_roles_for_school(school)
    school_class = SchoolClassFactory(school=school)
    teacher = StaffFactory(school=school)
    assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    offering = SubjectOfferingFactory(school=school, school_class=school_class, main_teacher=teacher)
    student = StudentFactory(school=school, user=UserFactory(school=school), current_class=school_class, status="active")
    return school, teacher, offering, student


def _make_quiz(offering, teacher, **overrides):
    from . import services

    now = timezone.now()
    kwargs = dict(
        subject_offering=offering, title="Week 1", instructions="",
        start_time=now - timedelta(minutes=5), end_time=now + timedelta(hours=1),
        duration_minutes=20, file=_txt(), created_by=teacher.user,
    )
    kwargs.update(overrides)
    return services.create_quiz_from_file(**kwargs)


def _post_quiz(api_client, offering, file, **extra):
    now = timezone.now()
    payload = {
        "subject_offering": str(offering.id), "title": "Quiz 1",
        "start_time": (now + timedelta(hours=1)).isoformat(),
        "end_time": (now + timedelta(hours=3)).isoformat(),
        "duration_minutes": 30, "file": file,
    }
    payload.update(extra)
    return api_client.post("/api/v1/quizzes/", payload, format="multipart")


class TestParsing:
    def test_parses_valid_file(self):
        questions = parse_quiz_file(_txt())
        assert len(questions) == 3
        assert [o["text"] for o in questions[0]["options"]] == ["3", "4", "5", "6"]
        assert [o["is_correct"] for o in questions[0]["options"]] == [False, True, False, False]

    def test_missing_correct_marker_names_question(self):
        with pytest.raises(QuizFileError, match="Question 2 has no correct option"):
            parse_quiz_file(_txt("1. A?\nA) x*\nB) y\n2. B?\nA) x\nB) y\n"))

    def test_two_correct_markers_rejected(self):
        with pytest.raises(QuizFileError, match="more than one"):
            parse_quiz_file(_txt("1. A?\nA) x*\nB) y*\n"))

    def test_garbage_line_rejected(self):
        with pytest.raises(QuizFileError):
            parse_quiz_file(_txt("hello there\n"))

    def test_title_and_instructions_before_first_question_are_ignored(self):
        text = (
            "INTRODUCTION TO CHEMISTRY - SSS 1\n"
            "Answer all 2 questions.\n\n"
            "1. A?\nA) x*\nB) y\n"
            "2. B?\nA) x\nB) y*\n"
        )
        questions = parse_quiz_file(_txt(text))
        assert [q["text"] for q in questions] == ["A?", "B?"]

    def test_wrapped_lines_headings_and_answer_lines(self):
        text = (
            "1. Symbol for\nsodium?\nA) Na*\nB) So\n\n"
            "SECTION B\n"
            "2. Water?\nA. H2O\nB. CO2\nAnswer: A\n"
        )
        questions = parse_quiz_file(_txt(text))
        assert questions[0]["text"] == "Symbol for sodium?"
        assert [o["is_correct"] for o in questions[1]["options"]] == [True, False]

    def test_correct_answer_shown_with_icons_or_tags(self):
        text = (
            "1. A?\nA) x\nB) y \u2713\n"
            "2. B?\n\u2714 A) p\nB) q\nC) r\n"
            "3. C?\nA) a\nB) b (correct)\n"
        )
        questions = parse_quiz_file(_txt(text))
        assert [[o["is_correct"] for o in q["options"]] for q in questions] == [
            [False, True], [True, False, False], [False, True],
        ]
        assert questions[0]["options"][1]["text"] == "y"  # the tick is not part of the answer text

    def test_correct_answer_shown_by_bold_in_a_text_file(self):
        questions = parse_quiz_file(_txt("1. **A bold question?**\nA) x\nB) **y**\nC) z\n"))
        assert [o["is_correct"] for o in questions[0]["options"]] == [False, True, False]

    def test_bold_in_a_word_file_marks_the_answer(self):
        import io
        import zipfile

        def para(*runs):
            return "<w:p>" + "".join(
                f"<w:r><w:rPr><w:b/></w:rPr><w:t>{t}</w:t></w:r>" if b else f"<w:r><w:t>{t}</w:t></w:r>"
                for t, b in runs
            ) + "</w:p>"

        body = (
            para(("1. Capital of France?", True))
            + para(("A) London", False))
            + para(("B) ", False), ("Paris", True))
            + para(("C) Rome", False))
        )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("word/document.xml", f"<w:document><w:body>{body}</w:body></w:document>")
        upload = SimpleUploadedFile("quiz.docx", buffer.getvalue())

        questions = parse_quiz_file(upload)

        assert questions[0]["text"] == "Capital of France?"  # a bold question line is never mistaken for the answer
        assert [o["is_correct"] for o in questions[0]["options"]] == [False, True, False]

    def test_bold_on_every_option_is_just_styling(self):
        with pytest.raises(QuizFileError, match="no correct option"):
            parse_quiz_file(_txt("1. A?\n**A) x**\n**B) y**\n"))

    def test_empty_file_rejected(self):
        with pytest.raises(QuizFileError, match="No questions"):
            parse_quiz_file(_txt("\n\n"))


class TestTeacherEndpoints:
    def test_teacher_creates_quiz_via_upload(self, api_client):
        _, teacher, offering, _ = _world()
        _login(api_client, teacher.user)
        response = _post_quiz(api_client, offering, _txt())
        assert response.status_code == 201, response.data
        assert response.data["quiz"]["question_count"] == 3
        assert response.data["quiz"]["status"] == "scheduled"

    def test_malformed_file_returns_400_with_message(self, api_client):
        _, teacher, offering, _ = _world()
        _login(api_client, teacher.user)
        response = _post_quiz(api_client, offering, _txt("1. Q?\nA) x\nB) y\n"))
        assert response.status_code == 400
        assert "no correct option" in response.data["message"]

    def test_other_teacher_cannot_create_or_see(self, api_client):
        school, teacher, offering, _ = _world()
        quiz = _make_quiz(offering, teacher)
        other = StaffFactory(school=school)
        assign_role(user=other.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, other.user)

        assert api_client.get("/api/v1/quizzes/").data["results"] == []
        assert api_client.get(f"/api/v1/quizzes/{quiz.id}/results/").status_code == 404
        assert _post_quiz(api_client, offering, _txt()).status_code == 403

    def test_school_administrator_cannot_see_results(self, api_client):
        school, teacher, offering, _ = _world()
        quiz = _make_quiz(offering, teacher)
        admin = UserFactory(school=school)
        assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
        _login(api_client, admin)
        assert api_client.get(f"/api/v1/quizzes/{quiz.id}/results/").status_code == 404

    def test_cannot_delete_after_attempts_but_can_cancel(self, api_client):
        from . import services

        _, teacher, offering, student = _world()
        quiz = _make_quiz(offering, teacher)
        services.start_attempt(quiz, student)
        _login(api_client, teacher.user)

        assert api_client.delete(f"/api/v1/quizzes/{quiz.id}/").status_code == 400
        assert api_client.post(f"/api/v1/quizzes/{quiz.id}/cancel/").status_code == 200
        quiz.refresh_from_db()
        assert quiz.status == Quiz.Status.CANCELLED
        assert QuizAttempt.unscoped_objects.get(quiz=quiz).status == QuizAttempt.Status.AUTO_SUBMITTED


class TestStudentFlow:
    def test_full_attempt_scores_and_hides_correct_flag(self, api_client):
        _, teacher, offering, student = _world()
        quiz = _make_quiz(offering, teacher)
        _login(api_client, student.user)

        listing = api_client.get("/api/v1/quizzes/my-quizzes/")
        assert [r["id"] for r in listing.data["results"]] == [str(quiz.id)]

        start = api_client.post(f"/api/v1/quizzes/my-quizzes/{quiz.id}/start/")
        assert start.status_code == 200, start.data
        questions = start.data["attempt"]["questions"]
        assert len(questions) == 3
        assert all("is_correct" not in o for q in questions for o in q["options"])

        for question in questions:
            correct = QuizOption.unscoped_objects.get(question_id=question["id"], is_correct=True)
            api_client.post(
                f"/api/v1/quizzes/my-quizzes/{quiz.id}/view/", {"question_id": question["id"]}, format="json"
            )
            r = api_client.post(
                f"/api/v1/quizzes/my-quizzes/{quiz.id}/answer/",
                {"question_id": question["id"], "option_id": str(correct.id)}, format="json",
            )
            assert r.status_code == 200, r.data

        submit = api_client.post(f"/api/v1/quizzes/my-quizzes/{quiz.id}/submit/")
        assert submit.status_code == 200
        assert submit.data["result"]["score"] == "3.00"
        assert submit.data["result"]["percentage"] == 100.0
        assert api_client.post(f"/api/v1/quizzes/my-quizzes/{quiz.id}/submit/").status_code == 400

    def test_shuffle_is_stable_across_restarts(self):
        from . import services

        school, teacher, offering, student = _world()
        other = StudentFactory(school=school, user=UserFactory(school=school), current_class=offering.school_class)
        quiz = _make_quiz(offering, teacher)
        a1 = services.start_attempt(quiz, student)
        first_order, first_options = list(a1.question_order), dict(a1.option_order)
        a2 = services.start_attempt(quiz, student)
        assert a2.question_order == first_order
        assert a2.option_order == first_options
        b = services.start_attempt(quiz, other)
        assert sorted(b.question_order) == sorted(first_order)

    def test_cannot_start_before_window(self):
        from . import services

        _, teacher, offering, student = _world()
        future = _make_quiz(
            offering, teacher, start_time=timezone.now() + timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=2),
        )
        with pytest.raises(services.QuizAttemptError):
            services.start_attempt(future, student)

    def test_violation_threshold_auto_submits(self, api_client):
        _, teacher, offering, student = _world()
        quiz = _make_quiz(offering, teacher)
        _login(api_client, student.user)
        api_client.post(f"/api/v1/quizzes/my-quizzes/{quiz.id}/start/")
        for _ in range(2):
            r = api_client.post(
                f"/api/v1/quizzes/my-quizzes/{quiz.id}/violation/", {"kind": "tab_hidden"}, format="json"
            )
            assert r.data["status"] == "in_progress"
        r = api_client.post(f"/api/v1/quizzes/my-quizzes/{quiz.id}/violation/", {"kind": "blur"}, format="json")
        assert r.data["status"] == "auto_submitted"

    def test_expired_attempt_is_lazily_finalized(self, api_client):
        from . import services

        _, teacher, offering, student = _world()
        quiz = _make_quiz(offering, teacher, duration_minutes=5)
        attempt = services.start_attempt(quiz, student)
        QuizAttempt.unscoped_objects.filter(pk=attempt.pk).update(started_at=timezone.now() - timedelta(minutes=10))
        _login(api_client, student.user)
        result = api_client.get(f"/api/v1/quizzes/my-quizzes/{quiz.id}/result/")
        assert result.status_code == 200
        assert result.data["result"]["status"] == "auto_submitted"

    def test_student_outside_roster_cannot_see_quiz(self, api_client):
        school, teacher, offering, _ = _world()
        quiz = _make_quiz(offering, teacher)
        outsider = StudentFactory(
            school=school, user=UserFactory(school=school), current_class=SchoolClassFactory(school=school)
        )
        _login(api_client, outsider.user)
        assert api_client.get("/api/v1/quizzes/my-quizzes/").data["results"] == []
        assert api_client.post(f"/api/v1/quizzes/my-quizzes/{quiz.id}/start/").status_code == 404


class TestResults:
    def test_teacher_sees_table_and_breakdown(self, api_client):
        from . import services

        _, teacher, offering, student = _world()
        quiz = _make_quiz(offering, teacher)
        services.submit_attempt(services.start_attempt(quiz, student))
        _login(api_client, teacher.user)
        response = api_client.get(f"/api/v1/quizzes/{quiz.id}/results/")
        assert response.status_code == 200
        data = response.data["results"]
        assert data["summary"]["registered"] == 1
        assert data["summary"]["completed"] == 1
        assert len(data["questions"]) == 3
        assert data["rows"][0]["status"] == "submitted"

    def test_tenant_isolation(self, api_client):
        _, teacher, offering, _ = _world()
        _make_quiz(offering, teacher)
        _, other_teacher, _, _ = _world()
        _login(api_client, other_teacher.user)
        assert api_client.get("/api/v1/quizzes/").data["results"] == []
