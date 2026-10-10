"""Turns a teacher-uploaded question file into a plain list of question dicts, ready for
apps.quizzes.services.create_quiz_from_questions.

Expected format (works equally well typed in Notepad or Word, saved as .txt or .docx):

    1. What is 2 + 2?
    A) 3
    B) 4*
    C) 5
    D) 6

    2. What is the capital of France?
    A) London
    B) Berlin
    C) Paris*
    D) Madrid

- A question line starts with a number followed by "." or ")".
- An option line starts with a single letter followed by "." or ")".
- The correct option has a trailing "*" (with or without a space before it) — exactly one
  option per question must be marked this way.
- Blank lines between questions are optional; extra blank lines are ignored.
- Anything before the first question (a title, "Answer all questions" instructions) is ignored.
- A line that is neither a question nor an option continues the previous one (a question or
  option wrapped over two lines); an ALL-CAPS line after the options (a "SECTION B" heading) is
  skipped.
- Instead of a trailing "*", the answer may be given on its own line: "Answer: B".
- The correct option can also be shown by formatting: it is the only **bold** option of its question
  (Word bold, or **markdown** bold in a .txt), or it carries a tick/check icon (✓ ✔ ✅ ☑) or a
  "(correct)" tag. A question's own formatting never counts, and if EVERY option is bold the bold is
  treated as plain styling, not an answer.

No third-party dependency for .docx: it's a zip archive of XML, and every visible paragraph of
text lives in <w:t> runs inside <w:p> paragraphs in word/document.xml — extracting those with the
standard library's zipfile + a couple of regexes is all a heading-free, table-free question file
needs (the same technique used elsewhere in this project to read a plain .docx's text).
"""

import re
import zipfile
from io import BytesIO

# Bold text is carried through the plain-text pipeline between these two control characters, so the
# line-by-line parser below can ask "was this option bold?" without a second pass over the document.
BOLD_ON = "\x02"
BOLD_OFF = "\x03"
_MARKDOWN_BOLD = re.compile(r"\*\*(.+?)\*\*")
# Check/tick icons and "(correct)" style tags that mark an option as the right answer.
_CORRECT_ICONS = "✓✔✅☑✔️✓️🗸"
_ICON_RUN = re.compile(f"[{_CORRECT_ICONS}\\uFE0F]+")
_CORRECT_TAG = re.compile(r"\s*[(\[]\s*(?:correct(?:\s+answer)?|right|answer|true)\s*[)\]]\s*$", re.IGNORECASE)

QUESTION_LINE = re.compile(r"^\s*(\d+)[.)]\s*(.+)$")
OPTION_LINE = re.compile(r"^\s*([A-Za-z])[.)]\s*(.+?)\s*(\*)?\s*$")
ANSWER_LINE = re.compile(r"^\s*(?:correct\s+)?answer\s*[:\-]\s*\(?([A-Za-z])\)?\.?\s*$", re.IGNORECASE)


class QuizFileError(ValueError):
    """Raised for a file that can't be read or doesn't parse into at least one valid,
    fully-specified question — the message is shown to the teacher as-is, so it always names
    the specific line/question at fault rather than a generic "invalid file"."""


def _extract_docx_text(raw: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, KeyError) as exc:
        raise QuizFileError("This doesn't look like a valid .docx file.") from exc

    # Each <w:p>...</w:p> is one paragraph; join every <w:t> run inside it, then treat each
    # paragraph as one line — mirrors how the same content reads in Word itself.
    paragraphs = re.split(r"</w:p>", xml)
    lines = []
    for paragraph in paragraphs:
        pieces = []
        for run in re.findall(r"<w:r[ >].*?</w:r>", paragraph, flags=re.DOTALL):
            text = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", run, flags=re.DOTALL))
            if not text:
                continue
            properties = re.search(r"<w:rPr>(.*?)</w:rPr>", run, flags=re.DOTALL)
            bold = bool(
                properties
                and re.search(r"<w:b(?:\s+w:val=\"(?:1|true|on)\")?\s*/>", properties.group(1))
            )
            pieces.append(f"{BOLD_ON}{text}{BOLD_OFF}" if bold else text)
        text = "".join(pieces).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def _extract_text(file) -> str:
    raw = file.read()
    name = (getattr(file, "name", "") or "").lower()
    if name.endswith(".docx"):
        return _extract_docx_text(raw)
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise QuizFileError("Could not read this file as text. Save it as .txt or .docx and try again.")


def _split_formatting(raw_line: str) -> tuple[str, float]:
    """Returns the line as plain text plus the share (0-1) of its visible characters that were bold,
    whether the bold came from a Word run or from **markdown** markers. The leading "A)" / "3."
    label is ignored for that share: people routinely bold just the answer text after it."""
    marked = _MARKDOWN_BOLD.sub(lambda m: f"{BOLD_ON}{m.group(1)}{BOLD_OFF}", raw_line)
    chars: list[tuple[str, bool]] = []
    in_bold = False
    for char in marked:
        if char == BOLD_ON:
            in_bold = True
        elif char == BOLD_OFF:
            in_bold = False
        else:
            chars.append((char, in_bold))
    plain = "".join(c for c, _ in chars)
    label = re.match(r"^\s*(?:\d+|[A-Za-z])[.)]\s*", plain)
    counted = chars[label.end():] if label else chars
    visible = [(c, b) for c, b in counted if not c.isspace()]
    share = (sum(1 for _, b in visible if b) / len(visible)) if visible else 0.0
    return plain, share


def _strip_correct_markers(text: str) -> tuple[str, bool]:
    """Removes a leading/trailing tick icon or a "(correct)" tag, reporting whether one was there."""
    found = False
    stripped = _ICON_RUN.sub("", text)
    found = stripped != text
    tagged = _CORRECT_TAG.sub("", stripped)
    found = found or tagged != stripped
    return tagged.strip(), found


def parse_quiz_file(file) -> list[dict]:
    """Returns `[{"text": str, "points": 1, "options": [{"text": str, "is_correct": bool}, ...]}]`.
    Raises QuizFileError, with a message naming the offending question number, for anything that
    doesn't parse cleanly — a file this can't confidently interpret should never silently produce
    a partial or wrong quiz."""
    text = _extract_text(file)

    questions: list[dict] = []
    current: dict | None = None

    for raw_line in text.splitlines():
        stripped_raw = raw_line.strip()
        if not stripped_raw:
            continue
        line, bold_share = _split_formatting(stripped_raw)
        line = line.strip()
        if not line:
            continue
        icon_marked = False
        if OPTION_LINE.match(_ICON_RUN.sub("", line)) and not QUESTION_LINE.match(line):
            line, icon_marked = _strip_correct_markers(line)

        question_match = QUESTION_LINE.match(line)
        answer_match = ANSWER_LINE.match(line) if not question_match else None
        option_match = OPTION_LINE.match(line) if not (question_match or answer_match) else None

        if question_match:
            current = {"text": question_match.group(2).strip(), "points": 1, "options": []}
            questions.append(current)
        elif answer_match:
            if current is None or not current["options"]:
                continue
            letter_index = ord(answer_match.group(1).upper()) - ord("A")
            if 0 <= letter_index < len(current["options"]):
                for i, option in enumerate(current["options"]):
                    option["is_correct"] = i == letter_index
        elif option_match:
            if current is None:
                continue  # a lettered line in the preamble (e.g. "A. Instructions") — not an option
            current["options"].append(
                {
                    "text": option_match.group(2).strip(),
                    "is_correct": option_match.group(3) == "*" or icon_marked,
                    "_bold": bold_share >= 0.6,
                }
            )
        elif current is None:
            continue  # title / instructions before the first question
        elif current["options"]:
            if line.isupper():
                continue  # a section heading such as "SECTION B"
            current["options"][-1]["text"] += " " + line.rstrip("*").strip()
            if line.endswith("*"):
                current["options"][-1]["is_correct"] = True
        else:
            current["text"] += " " + line

    if not questions:
        raise QuizFileError("No questions were found in this file.")

    for index, question in enumerate(questions, start=1):
        if len(question["options"]) < 2:
            raise QuizFileError(f"Question {index} needs at least two options.")
        if not any(option["is_correct"] for option in question["options"]):
            # No explicit marker: a single bold option (out of several) is the answer. All-bold or
            # no-bold tells us nothing, so it falls through to the "no correct option" error below.
            bold = [option for option in question["options"] if option["_bold"]]
            if len(bold) == 1 and len(question["options"]) > 1:
                bold[0]["is_correct"] = True
            elif 1 < len(bold) < len(question["options"]):
                raise QuizFileError(f"Question {index} has more than one option marked correct.")
        correct_count = sum(1 for option in question["options"] if option["is_correct"])
        if correct_count == 0:
            raise QuizFileError(
                f"Question {index} has no correct option marked — mark the right answer with a trailing "
                f'"*" (e.g. "B) 4*"), a tick (✓), "(correct)", or make just that option bold.'
            )
        if correct_count > 1:
            raise QuizFileError(f"Question {index} has more than one option marked correct.")

    for question in questions:
        for option in question["options"]:
            option.pop("_bold", None)
    return questions
