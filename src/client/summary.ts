import { getAllBidStats, filterBidStatRows } from "./bidstats.js";
import { getAllTce, filterTceRows } from "./tce.js";
import { getSchedule } from "./schedule.js";
import type { BidRegClient } from "./http.js";

export interface CoursePhaseSummary {
  phase: string;
  program: string;
  termsObserved: number;
  medianClosingCost: number;
  minClosingCost: number;
  maxClosingCost: number;
  medianBids: number;
  avgBidsPerSeat: number;
}

export interface InstructorTceSummary {
  termsObserved: number;
  avgInstructorRating: number;
  avgClassRating: number;
  avgDifficulty: number;
  avgWorkLoad: number;
  totalResponses: number;
}

export interface InstructorSummary {
  name: string;
  termsTeaching: string[];
  tce: InstructorTceSummary | null;
}

export interface UpcomingOffering {
  term: string;
  section: string;
  instructor: string;
  meetingPattern: string;
  campus: string;
}

export interface CourseSummary {
  courseName: string;
  courseTitle: string;
  phases: CoursePhaseSummary[];
  instructors: InstructorSummary[];
  upcomingOfferings: UpcomingOffering[] | null; // null when no scheduleTermCode passed
}

function stripTermPrefix(phase: string): string {
  const parts = phase.split(" ");
  return parts.slice(2).join(" ");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return sorted[mid - 1]!;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function summarizeCourse(
  client: BidRegClient,
  courseName: string,
  scheduleTermCode?: string,
  program?: string,
): Promise<CourseSummary> {
  const [allBidStats, allTce] = await Promise.all([
    getAllBidStats(client),
    getAllTce(client),
  ]);

  const bidRows = filterBidStatRows(allBidStats, { courseName, program });
  const tceRows = filterTceRows(allTce, { courseName });

  // Determine course title from most frequent value in bidstats
  const titleCounts = new Map<string, number>();
  for (const row of bidRows) {
    if (row.courseTitle) {
      titleCounts.set(row.courseTitle, (titleCounts.get(row.courseTitle) ?? 0) + 1);
    }
  }
  let courseTitle = "";
  let bestCount = 0;
  for (const [title, count] of titleCounts) {
    if (count > bestCount) {
      bestCount = count;
      courseTitle = title;
    }
  }

  // Part 1 — Bid phases, grouped by (phaseLabel, program) so Full-Time and E&W pools stay separate
  const phaseGroups = new Map<string, { phase: string; program: string; terms: Set<string>; costs: number[]; bidCounts: number[]; bidsPerSeat: number[] }>();
  for (const row of bidRows) {
    const phaseLabel = stripTermPrefix(row.phase);
    const key = `${phaseLabel}\x00${row.program}`;
    if (!phaseGroups.has(key)) {
      phaseGroups.set(key, { phase: phaseLabel, program: row.program, terms: new Set(), costs: [], bidCounts: [], bidsPerSeat: [] });
    }
    const group = phaseGroups.get(key)!;
    group.terms.add(row.term);
    group.costs.push(row.closingCost);
    group.bidCounts.push(row.numberOfBids);
    if (row.totalSeats !== 0) {
      group.bidsPerSeat.push(row.numberOfBids / row.totalSeats);
    }
  }

  const phases: CoursePhaseSummary[] = [...phaseGroups.values()]
    .sort((a, b) => a.phase.localeCompare(b.phase) || a.program.localeCompare(b.program))
    .map(({ phase, program, terms, costs, bidCounts, bidsPerSeat }) => ({
      phase,
      program,
      termsObserved: terms.size,
      medianClosingCost: median(costs),
      minClosingCost: Math.min(...costs),
      maxClosingCost: Math.max(...costs),
      medianBids: median(bidCounts),
      avgBidsPerSeat:
        bidsPerSeat.length > 0
          ? round2(bidsPerSeat.reduce((s, v) => s + v, 0) / bidsPerSeat.length)
          : 0,
    }));

  // Part 2 — Per-instructor breakdown
  // Union all instructor names from bidstats and TCE
  const allInstructorNames = new Set<string>();
  for (const row of bidRows) {
    if (row.faculty) allInstructorNames.add(row.faculty);
  }
  for (const row of tceRows) {
    if (row.faculty) allInstructorNames.add(row.faculty);
  }

  // Build termsTeaching from bidstats rows
  const instructorTerms = new Map<string, Set<string>>();
  for (const row of bidRows) {
    if (!row.faculty) continue;
    if (!instructorTerms.has(row.faculty)) instructorTerms.set(row.faculty, new Set());
    instructorTerms.get(row.faculty)!.add(row.term);
  }
  // Also capture terms from TCE for instructors only in TCE
  for (const row of tceRows) {
    if (!row.faculty) continue;
    if (!instructorTerms.has(row.faculty)) instructorTerms.set(row.faculty, new Set());
    instructorTerms.get(row.faculty)!.add(row.term);
  }

  const instructors: InstructorSummary[] = [...allInstructorNames]
    .sort()
    .map((name) => {
      const terms = [...(instructorTerms.get(name) ?? new Set())].sort().reverse();

      const instrTceRows = tceRows.filter((r) => r.faculty === name);
      let tce: InstructorTceSummary | null = null;
      if (instrTceRows.length > 0) {
        const distinctTerms = new Set(instrTceRows.map((r) => r.term));
        const avg = (fn: (r: typeof instrTceRows[0]) => number) =>
          round2(instrTceRows.reduce((s, r) => s + fn(r), 0) / instrTceRows.length);
        tce = {
          termsObserved: distinctTerms.size,
          avgInstructorRating: avg((r) => r.instructorOverall),
          avgClassRating: avg((r) => r.classRating),
          avgDifficulty: avg((r) => r.difficulty),
          avgWorkLoad: avg((r) => r.workLoad),
          totalResponses: instrTceRows.reduce((s, r) => s + r.totalResponses, 0),
        };
      }

      return { name, termsTeaching: terms, tce };
    });

  let upcomingOfferings: UpcomingOffering[] | null = null;
  if (scheduleTermCode !== undefined) {
    const scheduleRows = await getSchedule(client, scheduleTermCode);
    const lowerCourseName = courseName.toLowerCase();
    upcomingOfferings = scheduleRows
      .filter((row) => row.courseName.toLowerCase().includes(lowerCourseName))
      .map((row) => ({
        term: row.term,
        section: row.section,
        instructor: row.instructor,
        meetingPattern: row.meetingPattern,
        campus: row.campus,
      }));
  }

  return { courseName, courseTitle, phases, instructors, upcomingOfferings };
}
