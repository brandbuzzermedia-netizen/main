import { describe, expect, it } from "vitest";
import { LocalHashEmbedder } from "@/lib/ai/embeddings";
import { runQualityChecks, type QualityInput } from "@/lib/engine/quality";

const embedder = new LocalHashEmbedder();
const post = "5 things architects should consider when designing luxury villas: entrance proportion, natural light, door scale.";

function input(text: string, over: Partial<QualityInput> = {}): QualityInput {
  return {
    text,
    embedding: embedder.embedOne(text),
    embeddingModel: embedder.model,
    platform: "instagram",
    rules: { maxLength: 2200, linksClickable: false, maxHashtags: 2, maxMentions: 1, styleNotes: "" },
    postContent: post,
    authorHandle: "ar.meera",
    campaignId: "camp-1",
    campaignKeywords: ["luxury villa"],
    brand: {
      wordsToAvoid: ["cheap"],
      topicsToAvoid: [],
      competitors: ["DoorKing"],
      claimsRequiringApproval: ["termite-proof"],
      ctaStyle: "none",
      emojiPolicy: "sparing",
      commentLength: "medium",
      tone: ["Professional"],
    },
    history: [],
    ...over,
  };
}

const good =
  "The entrance proportion is often overlooked. In larger villas, getting the door scale right can completely change how premium the elevation feels.";

const status = (r: ReturnType<typeof runQualityChecks>, check: string) => r.checks.find((c) => c.check === check)!.status;

describe("quality checks", () => {
  it("passes a specific, non-promotional comment", () => {
    const r = runQualityChecks(input(good));
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.warnings).toEqual(["No issues detected"]);
  });

  it("fails generic praise", () => {
    const r = runQualityChecks(input("Great post!"));
    expect(r.passed).toBe(false);
    expect(status(r, "spam")).toBe("fail");
  });

  it("fails promotional language when the brand has no CTA", () => {
    const r = runQualityChecks(input("Door scale matters in luxury villas. DM us to see our wooden doors collection!"));
    expect(status(r, "promotional")).toBe("fail");
    expect(r.warnings.join(" ")).toMatch(/too promotional/);
  });

  it("only warns on promotional language when a soft CTA is allowed", () => {
    const i = input("Door scale matters in luxury villas — happy to share notes, contact us anytime.");
    const r = runQualityChecks({ ...i, brand: { ...i.brand, ctaStyle: "soft" } });
    expect(status(r, "promotional")).toBe("warn");
  });

  it("detects semantic duplicates within the same client's history", () => {
    const r = runQualityChecks(
      input(good, {
        history: [
          {
            text: good,
            embedding: embedder.embedOne(good),
            embeddingModel: embedder.model,
            campaignId: "camp-1",
            authorHandle: "someone",
            platform: "instagram",
            createdAt: new Date(),
          },
        ],
      }),
    );
    expect(status(r, "duplicate")).toBe("fail");
  });

  it("flags banned words, competitors, claims and invented experiences", () => {
    expect(status(runQualityChecks(input(`${good} Cheap options exist too.`)), "brand_voice")).toBe("fail");
    expect(status(runQualityChecks(input(`${good} DoorKing does this well.`)), "brand_voice")).toBe("fail");
    expect(status(runQualityChecks(input(`${good} Ours are termite-proof.`)), "safety")).toBe("warn");
    const fake = runQualityChecks(input("I once designed a luxury villa where the door scale changed everything about the entrance."));
    expect(status(fake, "safety")).toBe("fail");
  });

  it("fails links on platforms where they aren't clickable", () => {
    const r = runQualityChecks(input(`${good} https://example.com`));
    expect(status(r, "platform_policy")).toBe("fail");
  });

  it("fails comments that ignore the post", () => {
    const r = runQualityChecks(input("Monsoon season is here, stay safe on the roads everyone."));
    expect(status(r, "relevance")).toBe("fail");
  });
});
