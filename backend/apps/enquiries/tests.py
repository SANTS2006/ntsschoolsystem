import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.enquiries.models import Enquiry

URL = "/api/v1/public/enquiries/"

DEMO = {
    "kind": "demo", "name": "Amina Kamara", "email": "amina@example.com", "phone": "+232 76 000 000",
    "organization": "Hill Valley Secondary", "school_type": "secondary", "student_count": "450",
    "interests": ["students", "exams"], "preferred_contact": "email", "message": "", "consent": True,
}
CONTACT = {"kind": "contact", "name": "Joe Bangura", "email": "joe@example.com", "topic": "pricing", "message": "How is pricing worked out for us?", "consent": True}


@pytest.fixture(autouse=True)
def _clear_throttle():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
def test_a_demo_request_is_stored_and_acknowledged(client):
    response = client.post(URL, DEMO, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True and body["reference"]
    enquiry = Enquiry.objects.get()
    assert enquiry.kind == "demo" and enquiry.organization == "Hill Valley Secondary"
    assert enquiry.interests == ["students", "exams"]
    assert enquiry.email_status in {"sent", "failed", "not_configured"}


@pytest.mark.django_db
def test_a_contact_message_is_stored(client):
    assert client.post(URL, CONTACT, format="json").status_code == 201
    assert Enquiry.objects.get().topic == "pricing"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "change,field",
    [
        ({"name": ""}, "name"),
        ({"email": "not-an-email"}, "email"),
        ({"consent": False}, "consent"),
        ({"organization": ""}, "organization"),
        ({"phone": "call me maybe"}, "phone"),
        ({"school_type": "castle"}, "school_type"),
    ],
)
def test_invalid_demo_requests_are_rejected_with_the_field_named(client, change, field):
    response = client.post(URL, {**DEMO, **change}, format="json")
    assert response.status_code == 400
    assert field in {e["field"] for e in response.json()["errors"]}
    assert Enquiry.objects.count() == 0


@pytest.mark.django_db
def test_a_contact_message_needs_some_words(client):
    response = client.post(URL, {**CONTACT, "message": "hi"}, format="json")
    assert response.status_code == 400
    assert Enquiry.objects.count() == 0


@pytest.mark.django_db
def test_the_honeypot_pretends_to_succeed_but_stores_nothing(client):
    response = client.post(URL, {**DEMO, "website": "http://spam.example"}, format="json")
    assert response.status_code == 201
    assert Enquiry.objects.count() == 0


@pytest.mark.django_db
def test_no_login_is_needed_and_it_is_post_only(client):
    assert client.get(URL).status_code == 405


@pytest.mark.django_db
def test_it_is_rate_limited(client):
    statuses = [client.post(URL, {**CONTACT, "email": f"p{i}@example.com"}, format="json").status_code for i in range(8)]
    assert statuses[:6] == [201] * 6
    assert 429 in statuses[6:]


@pytest.mark.django_db
def test_the_message_is_kept_even_when_the_email_step_fails(client, settings, monkeypatch):
    settings.BREVO_API_KEY = "test-key"

    def boom(*args, **kwargs):
        raise RuntimeError("mail provider down")

    monkeypatch.setattr("apps.enquiries.views.send_email", boom)
    assert client.post(URL, CONTACT, format="json").status_code == 201
    assert Enquiry.objects.get().email_status == "failed"


@pytest.mark.django_db
def test_the_team_is_emailed_when_mail_is_configured(client, settings, monkeypatch):
    settings.BREVO_API_KEY = "test-key"
    sent = []
    monkeypatch.setattr("apps.enquiries.views.send_email", lambda **kw: sent.append(kw) or True)
    client.post(URL, CONTACT, format="json")
    assert Enquiry.objects.get().email_status == "sent"
    assert sent[0]["to_email"] == settings.ENQUIRY_NOTIFY_EMAIL and "Joe Bangura" in sent[0]["subject"]


@pytest.mark.django_db
def test_without_mail_configured_the_status_says_so(client, settings):
    settings.BREVO_API_KEY = ""
    assert client.post(URL, CONTACT, format="json").status_code == 201
    assert Enquiry.objects.get().email_status == "not_configured"


# ---- the platform console's view of enquiries --------------------------------------------------------------------

@pytest.fixture
def platform_client(db):
    from apps.users.models import User

    admin = User.objects.create_user(email="ops@nts.example", password="Str0ng-Pass!word1", user_type=User.UserType.PLATFORM_ADMIN, first_name="Ops", last_name="Admin")
    client = APIClient()
    client.force_authenticate(admin)
    return client


@pytest.mark.django_db
def test_platform_admins_can_list_and_mark_enquiries_handled(client, platform_client):
    client.post(URL, DEMO, format="json")
    listing = platform_client.get("/api/v1/platform/enquiries/")
    assert listing.status_code == 200
    row = listing.json()["results"][0]
    assert row["name"] == "Amina Kamara" and row["handled"] is False
    done = platform_client.patch(f"/api/v1/platform/enquiries/{row['id']}/", {"handled": True, "name": "Changed"}, format="json")
    assert done.status_code == 200
    enquiry = Enquiry.objects.get()
    assert enquiry.handled is True and enquiry.name == "Amina Kamara"


@pytest.mark.django_db
def test_enquiries_are_not_visible_to_the_public_or_to_school_users(client):
    assert client.get("/api/v1/platform/enquiries/").status_code in {401, 403}


# ---- the e-mail the team receives --------------------------------------------------------------------------------

@pytest.mark.django_db
def test_the_team_email_shows_what_the_visitor_filled_in_and_escapes_it():
    from apps.enquiries.email_template import enquiry_subject, render_enquiry_email

    enquiry = Enquiry.objects.create(
        kind="demo", name="Amina <b>Kamara</b>", email="amina@example.com", phone="+232 76 000 000",
        organization="Hill Valley Secondary", school_type="secondary", student_count="450",
        interests=["students", "exams"], preferred_contact="whatsapp", message="Hello\n<script>alert(1)</script>", consent=True,
    )
    html = render_enquiry_email(enquiry)
    assert "Hill Valley Secondary" in html and "Secondary" in html and "450" in html
    assert "Student records, Exams &amp; results" in html and "WhatsApp" in html
    assert "<script>" not in html and "&lt;script&gt;" in html and "&lt;b&gt;Kamara" in html
    assert "https://wa.me/23276000000" in html and "mailto:amina@example.com" in html
    assert "NTS School System" in html and "Demo request" in html
    assert enquiry_subject(enquiry) == "New demo request — Hill Valley Secondary"


@pytest.mark.django_db
def test_a_contact_email_has_the_topic_and_message():
    from apps.enquiries.email_template import enquiry_subject, render_enquiry_email

    enquiry = Enquiry.objects.create(kind="contact", name="Joe", email="joe@example.com", topic="pricing", message="How is pricing worked out?", consent=True)
    html = render_enquiry_email(enquiry)
    assert "Pricing" in html and "How is pricing worked out?" in html and "Contact message" in html
    assert enquiry_subject(enquiry).startswith("New website message — Joe")
