import { z } from "zod";

// ── Bid Stats ───────────────────────────────────────────────────────
// Program can be a comma-list like "Exchange, Full-Time, E&W" — kept as string
export const BidStatRowSchema = z.object({
  term: z.string(),
  courseTitle: z.string(),
  courseName: z.string(),
  sectionName: z.string(),
  program: z.string(),
  phase: z.string(),
  faculty: z.string(),
  campus: z.string(),
  meetingPattern: z.string(),
  numberOfBids: z.coerce.number(),
  closingCost: z.coerce.number(),
  seatsAvailable: z.coerce.number(),
  totalSeats: z.coerce.number(),
  enrolled: z.coerce.number(),
  waitlist: z.coerce.number(),
  openSeats: z.coerce.number(),
});
export type BidStatRow = z.infer<typeof BidStatRowSchema>;

export const BidStatsFiltersSchema = z.object({
  terms: z.array(z.string()),
  subjects: z.array(z.string()),
  programs: z.array(z.string()),
  phases: z.array(z.string()),
  campuses: z.array(z.string()),
  faculty: z.array(z.string()),
});
export type BidStatsFilters = z.infer<typeof BidStatsFiltersSchema>;

// ── TCE ─────────────────────────────────────────────────────────────
// Ratings: Class, Instructor Overall, Learning, Difficulty, Global, Examples, WorkLoad — all 0–6 floats
export const TceRowSchema = z.object({
  term: z.string(),
  courseTitle: z.string(),
  courseName: z.string(),
  sectionName: z.string(),
  courseOwner: z.string(),
  faculty: z.string(),
  campus: z.string(),
  meetingPattern: z.string(),
  classRating: z.coerce.number(),
  instructorOverall: z.coerce.number(),
  learning: z.coerce.number(),
  difficulty: z.coerce.number(),
  global: z.coerce.number(),
  examples: z.coerce.number(),
  workLoad: z.coerce.number(),
  totalResponses: z.coerce.number(),
  numberOfEnrollees: z.coerce.number(),
});
export type TceRow = z.infer<typeof TceRowSchema>;

// ── Schedule ─────────────────────────────────────────────────────────
// Meeting Pattern: "|" separated; Exam: HTML stripped
export const ScheduleRowSchema = z.object({
  courseName: z.string(),
  courseTitle: z.string(),
  credits: z.coerce.number(),
  academicYear: z.string(),
  term: z.string(),
  session: z.string(),
  section: z.string(),
  meetingPattern: z.string(),
  instructor: z.string(),
  campus: z.string(),
  location: z.string(),
  exam: z.string(),
});
export type ScheduleRow = z.infer<typeof ScheduleRowSchema>;

// ── My Classes ───────────────────────────────────────────────────────
export const MyClassSchema = z.object({
  courseName: z.string(),
  courseTitle: z.string(),
  section: z.string(),
  credits: z.string(),
  instructor: z.string(),
  meetingPattern: z.string(),
  campus: z.string(),
  term: z.string(),
});
export type MyClass = z.infer<typeof MyClassSchema>;
