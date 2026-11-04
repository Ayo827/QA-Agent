import { DATA_LAYER_REVIEWER_PROMPT } from "../../prompts/dataLayerReviewer.js";
import { ReviewAgent } from "./reviewAgent.js";

export class DataLayerReviewerAgent extends ReviewAgent {
  constructor() {
    super({
      name: "data-layer-reviewer",
      description: "Reviews database access patterns, transactions and rules/indexes files.",
      prompt: DATA_LAYER_REVIEWER_PROMPT,
      patterns: [
        "firestore.rules",
        "*.rules",
        "firestore.indexes.json",
        "**/models/**/*.{js,ts}",
        "**/repositor*/**/*.{js,ts}",
        "**/services/**/*.{js,ts}",
        "**/dao/**/*.{js,ts}",
        "**/db/**/*.{js,ts}",
        "**/controller*/**/*.{js,ts}",
      ],
      fileLimit: 10,
    });
  }
}
