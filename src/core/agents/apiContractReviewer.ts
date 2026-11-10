import { API_CONTRACT_REVIEWER_PROMPT } from "../../prompts/apiContractReviewer.js";
import { ReviewAgent } from "./reviewAgent.js";

export class ApiContractReviewerAgent extends ReviewAgent {
  constructor() {
    super({
      name: "api-contract-reviewer",
      description: "Reviews routes, request validation, response shape and error format consistency.",
      prompt: API_CONTRACT_REVIEWER_PROMPT,
      patterns: [
        "**/routes/**/*.{js,ts}",
        "**/router*/**/*.{js,ts}",
        "**/*[Rr]outer*.{js,ts}",
        "**/controller*/**/*.{js,ts}",
        "**/handlers/**/*.{js,ts}",
        "**/validat*/**/*.{js,ts}",
        "**/middleware/**/*.{js,ts}",
        "index.{js,ts}",
        "src/index.{js,ts}",
      ],
      fileLimit: 10,
    });
  }
}
