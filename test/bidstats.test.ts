import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBidStatsCsv,
  deriveBidStatsFilters,
  filterBidStatRows,
} from "../src/client/bidstats.js";

const FIXTURE_CSV = [
  "Term,Course Title,CourseName,SectionName,Program,Phase,Faculty,Campus,Meeting Pattern,Number of Bids,Closing Cost,Seats Available,Total Seats,Enrolled,Waitlist,Open Seats",
  'Fall 2023,Financial Accounting,ACCT-430-0,61,E&W,Fall 2023 Bid Phase 2,"Sridharan, Swaminathan",Chicago,Tue 6:00PM - 9:00PM,3,0,59,70,3,0,56',
  'Fall 2023,Business Law,BLAW-435-0,31,"Exchange, Full-Time, E&W",Fall 2023 Bid Phase 1,"McCareins, Mark",Evanston,Mon 8:30AM - 10:00AM,77,150,62,62,62,0,0',
  'Spring 2024,Data Analytics,DECS-433-0,20,Full-Time,Spring 2024 Bid Phase 1,"Smith, John",Evanston,Mon 10:30AM - 12:00PM,15,200,5,40,35,0,5',
].join("\n");

test("parseBidStatsCsv returns correct row count", () => {
  assert.equal(parseBidStatsCsv(FIXTURE_CSV).length, 3);
});

test("parseBidStatsCsv maps columns to typed fields", () => {
  const rows = parseBidStatsCsv(FIXTURE_CSV);
  assert.equal(rows[0].term, "Fall 2023");
  assert.equal(rows[0].courseName, "ACCT-430-0");
  assert.equal(rows[0].faculty, "Sridharan, Swaminathan");
  assert.equal(rows[0].numberOfBids, 3);
  assert.equal(rows[1].program, "Exchange, Full-Time, E&W");
  assert.equal(rows[1].closingCost, 150);
  assert.equal(rows[2].closingCost, 200);
});

test("parseBidStatsCsv strips <br/> from meetingPattern", () => {
  const csv = [
    "Term,Course Title,CourseName,SectionName,Program,Phase,Faculty,Campus,Meeting Pattern,Number of Bids,Closing Cost,Seats Available,Total Seats,Enrolled,Waitlist,Open Seats",
    "Fall 2023,Title,ACCT-430-0,61,E&W,Phase,,Chicago,Mon<br/>Wed<br/>Fri,0,0,0,0,0,0,0",
  ].join("\n");
  assert.equal(parseBidStatsCsv(csv)[0].meetingPattern, "Mon\nWed\nFri");
});

test("deriveBidStatsFilters extracts unique sorted terms", () => {
  const filters = deriveBidStatsFilters(parseBidStatsCsv(FIXTURE_CSV));
  assert.deepEqual(filters.terms, ["Fall 2023", "Spring 2024"]);
});

test("deriveBidStatsFilters extracts subject codes", () => {
  const filters = deriveBidStatsFilters(parseBidStatsCsv(FIXTURE_CSV));
  assert.ok(filters.subjects.includes("ACCT"));
  assert.ok(filters.subjects.includes("BLAW"));
  assert.ok(filters.subjects.includes("DECS"));
});

test("filterBidStatRows returns all rows when no params", () => {
  assert.equal(filterBidStatRows(parseBidStatsCsv(FIXTURE_CSV), {}).length, 3);
});

test("filterBidStatRows filters by term substring", () => {
  const result = filterBidStatRows(parseBidStatsCsv(FIXTURE_CSV), { term: "fall 2023" });
  assert.equal(result.length, 2);
});

test("filterBidStatRows filters by subject prefix", () => {
  const result = filterBidStatRows(parseBidStatsCsv(FIXTURE_CSV), { subject: "decs" });
  assert.equal(result.length, 1);
  assert.equal(result[0].courseName, "DECS-433-0");
});

test("filterBidStatRows filters by program substring (handles comma-list programs)", () => {
  const result = filterBidStatRows(parseBidStatsCsv(FIXTURE_CSV), { program: "Exchange" });
  assert.equal(result.length, 1);
  assert.equal(result[0].courseName, "BLAW-435-0");
});
