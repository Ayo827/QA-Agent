import { PERFORMANCE_REVIEWER_PROMPT } from "../../prompts/performanceReviewer.js";
import { ReviewAgent } from "./reviewAgent.js";

export class PerformanceReviewerAgent extends ReviewAgent {
  constructor() {
    super({
      name: "performance-reviewer",
      description: "Reviews cold-start cost, sequential awaits, sync I/O and unbounded queries.",
      prompt: PERFORMANCE_REVIEWER_PROMPT,
      patterns: [
        "index.{js,ts}",
        "src/index.{js,ts}",
        "**/services/**/*.{js,ts}",
        "**/controller*/**/*.{js,ts}",
        "**/handlers/**/*.{js,ts}",
        "**/utils/**/*.{js,ts}",
      ],
      fileLimit: 10,
    });
  }
}
