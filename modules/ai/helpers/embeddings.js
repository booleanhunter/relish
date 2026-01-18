import OpenAI from 'openai';
import CONFIG from '#config';
import { AppError, ErrorType } from '#lib/errors.js';

/**
 * Generate embeddings for restaurant descriptions
 * @param {Array<string>} texts - Array of text descriptions
 * @returns {Promise<Array<number[]>>} Array of embedding vectors
 */
export async function generateEmbeddings(texts) {
    if (!CONFIG.openAiApiKey) {
        throw new AppError(
            `ai.${ErrorType.INTERNAL_SERVER_ERROR}`,
            'OpenAI API key is not configured.',
            ErrorType.INTERNAL_SERVER_ERROR,
            {
                publicMessage: 'AI service is unavailable.'
            }
        );
    }

    const openai = new OpenAI({
        apiKey: CONFIG.openAiApiKey,
    });

    const response = await openai.embeddings.create({
        model: "text-embedding-3-small", // More cost-effective
        input: texts,
    });

    return response.data.map(item => item.embedding);
}

/**
 * Generate embedding for a single text query
 * @param {string} text - Text to generate embedding for
 */
export async function generateEmbedding(text) {
    const embeddings = await generateEmbeddings([text]);
    return embeddings[0];
}
