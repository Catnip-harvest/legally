export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { warmEmbeddingModel } = await import("@/lib/analysis/embeddings");
  await warmEmbeddingModel();
}
