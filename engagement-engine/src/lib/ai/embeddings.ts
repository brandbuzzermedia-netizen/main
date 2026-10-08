import { createHash } from "node:crypto";

export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

const DIMS = 512;

/**
 * Deterministic local embedder: hashed word unigrams, bigrams and character trigrams,
 * L2-normalised. Good at near-duplicate detection, needs no network, and never sends
 * client text to a third party.
 */
export class LocalHashEmbedder implements EmbeddingProvider {
  readonly model = "local-hash-512-v1";

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  embedOne(text: string): number[] {
    const v = new Array<number>(DIMS).fill(0);
    const norm = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    const ws = norm.split(" ").filter((w) => w.length > 2);
    const add = (feature: string, weight: number) => {
      const h = createHash("md5").update(feature).digest();
      const idx = h.readUInt32LE(0) % DIMS;
      const sign = h[4] & 1 ? 1 : -1;
      v[idx] += sign * weight;
    };
    for (const w of ws) add(`w:${w}`, 1);
    for (let i = 0; i < ws.length - 1; i++) add(`b:${ws[i]} ${ws[i + 1]}`, 1.5);
    for (let i = 0; i < norm.length - 2; i++) add(`c:${norm.slice(i, i + 3)}`, 0.3);
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / mag);
  }
}

/** Voyage AI embeddings (Anthropic's recommended embeddings partner). */
export class VoyageEmbedder implements EmbeddingProvider {
  readonly model = "voyage-3.5";
  constructor(private readonly apiKey: string) {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: texts, model: this.model, input_type: "document" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status}`);
    const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

export function getEmbedder(): EmbeddingProvider {
  const key = process.env.VOYAGE_API_KEY;
  return key ? new VoyageEmbedder(key) : new LocalHashEmbedder();
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
