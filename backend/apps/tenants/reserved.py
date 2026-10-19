"""Addresses a school cannot take.

A school's pages live under its slug (`/<slug>/dashboard`, `/<slug>/login`, ...). The web app also has
a handful of top-level paths of its own, and a school slugged like one of them would make the two
indistinguishable — so those words are reserved."""

from rest_framework import serializers

RESERVED_SLUGS = frozenset(
    {
        "academics", "admin", "admissions", "api", "apply", "assets", "assignments", "attendance", "audit",
        "change-password", "communications", "complaints", "dashboard", "discipline", "documents", "education",
        "events", "examinations", "finance", "forgot-password", "hostel", "idcards", "inventory", "library",
        "live-sessions", "login", "logout", "media", "medical", "meetings", "notifications", "parents",
        "permissions", "platform", "procurement", "quizzes", "records", "reports", "reset-password", "roles",
        "salary", "settings", "static", "staff", "students", "subjects", "timetable", "transcript", "transport",
        "two-factor", "verify-card", "verify-email", "accept-invitation", "find-school", "sw.js", "manifest.webmanifest",
        "favicon.ico", "robots.txt", "my-attendance", "my-discipline", "my-documents", "my-graduation-status",
        "my-id-card", "my-lessons", "my-live-sessions", "my-medical", "my-meetings", "my-quizzes", "my-results",
        "my-staff-attendance", "my-fees", "my-salary", "my-subjects", "my-timetable", "my-transport", "health", "www", "app", "nts",
        # the public website's own pages (see website/ and apps.common.spa)
        "product", "features", "who-its-for", "how-it-works", "benefits", "security", "pricing", "request-demo",
        "contact", "about", "support", "resources", "faq", "legal", "site-assets", "sitemap.xml", "my-hostel",
        "my-assignments", "my-library", "my-exam-timetable",
    }
)


def validate_school_slug(value: str) -> str:
    if value.lower() in RESERVED_SLUGS:
        raise serializers.ValidationError("That address is reserved by the system — please choose another.")
    return value
