import { parse as parseHtml } from "node-html-parser";
import type { BidRegClient } from "./http.js";
import { MyClassSchema } from "./types.js";
import type { MyClass } from "./types.js";

export async function getMyClasses(client: BidRegClient): Promise<MyClass[]> {
  const res = await client.get("/myclass");
  if (res.status !== 200) throw new Error(`/myclass fetch failed: HTTP ${res.status}`);
  return parseMyClassHtml(await res.text());
}

// /myclass uses Bootstrap cards, not a table — each course is a .section-container div
export function parseMyClassHtml(html: string): MyClass[] {
  const root = parseHtml(html);
  const classes: MyClass[] = [];

  for (const section of root.querySelectorAll(".section-container")) {
    try {
      const nameEl = section.querySelector(".log-course-name-link");
      const rawName = nameEl?.text.trim() ?? "";
      // "FINC-615-0 (99)" → courseName = "FINC-615-0", section = "99"
      // "HCAK-951-5 (HC)" → courseName = "HCAK-951-5", section = "HC"
      const nameMatch = rawName.match(/^([^\s(]+)\s*\(([^)]+)\)$/);
      const courseName = nameMatch ? nameMatch[1] : rawName;
      const sectionNum = nameMatch ? nameMatch[2] : "";

      const courseTitle = section.querySelector(".log-section-title-link")?.text.trim() ?? "";
      const term = nameEl?.getAttribute("data-termname") ?? "";
      const instructor = section.querySelector(".instructor a")?.text.trim() ?? "";
      const meetingPattern =
        section.querySelector(".meeting-dates-location p.mb-0")?.text.trim() ?? "";
      const campus = section.querySelector(".location")?.text.trim() ?? "";
      const credits =
        section
          .querySelectorAll(".boxed-info span")
          .find((sp) => sp.getAttribute("title") === "Credits")
          ?.text.trim() ?? "";

      classes.push(
        MyClassSchema.parse({
          courseName,
          courseTitle,
          section: sectionNum,
          credits,
          instructor,
          meetingPattern,
          campus,
          term,
        }),
      );
    } catch {
      // Skip sections whose structure doesn't match
    }
  }
  return classes;
}
