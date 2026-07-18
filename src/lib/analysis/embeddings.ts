import { createHash } from "node:crypto";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

env.cacheDir =
  process.env.TRANSFORMERS_CACHE ?? path.join(process.cwd(), ".cache", "transformers");

const embeddingCache = new Map<string, Float32Array>();
const pendingEmbeddings = new Map<string, Promise<Float32Array>>();

async function createFeatureExtractor() {
  return pipeline("feature-extraction", MODEL_ID);
}

let featureExtractorPromise: ReturnType<typeof createFeatureExtractor> | null = null;

function getFeatureExtractor() {
  if (!featureExtractorPromise) {
    featureExtractorPromise = createFeatureExtractor().catch((error) => {
      featureExtractorPromise = null;
      throw error;
    });
  }
  return featureExtractorPromise;
}

function textCacheKey(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/** Embed text locally with a process-wide, lazily loaded MiniLM pipeline. */
export async function embedText(text: string): Promise<Float32Array> {
  const key = textCacheKey(text);
  const cached = embeddingCache.get(key);
  if (cached) return cached;

  const pending = pendingEmbeddings.get(key);
  if (pending) return pending;

  const embeddingPromise = (async () => {
    const extractor = await getFeatureExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    const embedding = Float32Array.from(output.data as unknown as ArrayLike<number>);
    embeddingCache.set(key, embedding);
    pendingEmbeddings.delete(key);
    return embedding;
  })().catch((error) => {
    pendingEmbeddings.delete(key);
    throw error;
  });

  pendingEmbeddings.set(key, embeddingPromise);
  return embeddingPromise;
}

/** Cosine similarity retains the scoring engine's existing 0..1 clamp. */
export async function cosineSimilarity(
  a: Float32Array,
  b: Float32Array,
): Promise<number> {
  if (!a.length || a.length !== b.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dotProduct += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  const similarity = dotProduct / Math.sqrt(magnitudeA * magnitudeB);
  return Math.min(1, Math.max(0, similarity));
}

/** Called during Node server registration so a user's first analysis is not the cold load. */
export async function warmEmbeddingModel(): Promise<void> {
  console.info(`[embeddings] Warming local ${MODEL_ID} model...`);
  await getFeatureExtractor();
  console.info(`[embeddings] Local ${MODEL_ID} model is ready.`);
}
