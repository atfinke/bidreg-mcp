import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTceCsv, filterTceRows } from "../src/client/tce.js";

const FIXTURE_CSV = [
  "Term,Course Title,CourseName,SectionName,CourseOwner,Faculty,Campus,Meeting Pattern,Class,Instructor Overall,Learning,Difficulty,Global,Examples,WorkLoad,Total Responses,Number Of Enrollees",
  'Fall 2023,Financial Accounting,ACCT-430-0,31,FTPT,"Hagenberg, Tom",Evanston,Mon 8:30AM<br/>Thu 8:30AM,4.7,5.0,5.1,4.8,5.0,5.5,2.2,39,65',
  'Fall 2023,Financial Accounting,ACCT-430-0,36,FTPT,"Roychowdhury, Sugata",Evanston,Mon 1:30PM<br/>Thu 1:30PM,5.0,5.6,5.3,5.0,5.2,5.7,2.4,46,65',
  'Spring 2024,Data Analytics,DECS-433-0,20,FTPT,"Smith, John",Chicago,Mon 10:30AM,4.5,4.8,5.0,3.2,4.6,5.1,2.8,30,40',
].join("\n");

test("parseTceCsv returns correct row count", () => {
  assert.equal(parseTceCsv(FIXTURE_CSV).length, 3);
});

test("parseTceCsv maps columns to typed fields", () => {
  const rows = parseTceCsv(FIXTURE_CSV);
  assert.equal(rows[0].courseName, "ACCT-430-0");
  assert.equal(rows[0].faculty, "Hagenberg, Tom");
  assert.equal(rows[0].classRating, 4.7);
  assert.equal(rows[0].instructorOverall, 5.0);
  assert.equal(rows[0].totalResponses, 39);
  assert.equal(rows[0].numberOfEnrollees, 65);
});

test("parseTceCsv strips <br/> from meetingPattern", () => {
  const rows = parseTceCsv(FIXTURE_CSV);
  assert.ok(rows[0].meetingPattern.includes("\n"));
  assert.ok(!rows[0].meetingPattern.includes("<br/>"));
});

test("filterTceRows returns all rows when no params", () => {
  assert.equal(filterTceRows(parseTceCsv(FIXTURE_CSV), {}).length, 3);
});

test("filterTceRows filters by term", () => {
  const result = filterTceRows(parseTceCsv(FIXTURE_CSV), { term: "Spring 2024" });
  assert.equal(result.length, 1);
  assert.equal(result[0].courseName, "DECS-433-0");
});

test("filterTceRows filters by subject prefix", () => {
  const result = filterTceRows(parseTceCsv(FIXTURE_CSV), { subject: "ACCT" });
  assert.equal(result.length, 2);
});

test("filterTceRows filters by faculty substring", () => {
  const result = filterTceRows(parseTceCsv(FIXTURE_CSV), { faculty: "roychowdhury" });
  assert.equal(result.length, 1);
  assert.equal(result[0].instructorOverall, 5.6);
});

test("filterTceRows filters by minInstructorRating", () => {
  const result = filterTceRows(parseTceCsv(FIXTURE_CSV), { minInstructorRating: 5.5 });
  assert.equal(result.length, 1);
  assert.equal(result[0].faculty, "Roychowdhury, Sugata");
});

test("filterTceRows filters by minClassRating", () => {
  const result = filterTceRows(parseTceCsv(FIXTURE_CSV), { minClassRating: 4.8 });
  assert.equal(result.length, 1);
  assert.equal(result[0].faculty, "Roychowdhury, Sugata");
});
