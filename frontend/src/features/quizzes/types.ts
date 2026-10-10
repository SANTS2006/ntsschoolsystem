export type QuizStatus = "scheduled" | "active" | "ended" | "cancelled";
export type AttemptStatus = "in_progress" | "submitted" | "auto_submitted";
export type ViolationKind = "fullscreen_exit" | "tab_hidden" | "blur";

export interface QuizOption {
  id: string;
  order: number;
  text: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  id: string;
  order: number;
  text: string;
  points: number;
  options: QuizOption[];
}

export interface Quiz {
  id: string;
  subject_offering: string;
  subject_offering_name: string;
  title: string;
  instructions: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: QuizStatus;
  source_file: string | null;
  question_count: number;
  attempted_count: number;
  questions: QuizQuestion[];
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuizCreatePayload {
  subject_offering: string;
  title: string;
  instructions: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  file: File;
}

export interface StudentQuiz {
  id: string;
  subject_offering_name: string;
  title: string;
  instructions: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: QuizStatus;
  question_count: number;
  my_attempt_status: AttemptStatus | null;
  my_score: string | null;
  my_max_score: string | null;
}

export interface AttemptQuestion {
  id: string;
  text: string;
  points: number;
  options: Array<{ id: string; text: string }>;
  my_option_id: string | null;
}

export interface AttemptState {
  attempt_id: string;
  status: AttemptStatus;
  started_at: string;
  deadline: string;
  questions: AttemptQuestion[];
}

export interface AttemptResult {
  status: AttemptStatus;
  score: string | null;
  max_score: string | null;
  percentage: number | null;
  submitted_at: string | null;
}

export interface QuizResultRow {
  student_id: string;
  student_name: string;
  status: AttemptStatus | "not_started";
  score: string | null;
  max_score: string | null;
  percentage: number | null;
  time_taken_seconds: number | null;
  violation_count: number;
}

export interface QuizResults {
  rows: QuizResultRow[];
  summary: {
    registered: number;
    attempted: number;
    completed: number;
    average_score: number | null;
    fastest_completion_seconds: number | null;
    slowest_completion_seconds: number | null;
    average_completion_seconds: number | null;
  };
  questions: Array<{
    question_id: string;
    text: string;
    average_time_seconds: number | null;
    correct_count: number;
    graded_count: number;
    percent_correct: number | null;
  }>;
}
