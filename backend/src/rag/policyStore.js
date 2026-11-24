import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory vector store for chunked policies
let chunksStore = [];
let idfMap = {};
let vocabulary = [];
let isInitialized = false;

// Standard English stopwords for deterministic TF-IDF
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t',
  'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it',
  'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
  'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s',
  'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were',
  'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s',
  'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re',
  'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Tokenize and normalize text for TF-IDF with synonym/acronym expansion
 */
function tokenize(text) {
  let normalized = text.toLowerCase()
    .replace(/work[\s\-_]from[\s\-_]home/g, 'wfh remote work')
    .replace(/remote[\s\-_]work/g, 'wfh remote work')
    .replace(/leave[\s\-_]without[\s\-_]pay/g, 'unpaid lwp leave')
    .replace(/earned[\s\-_]leave/g, 'annual earned leave')
    .replace(/privilege[\s\-_]leave/g, 'annual privilege leave')
    .replace(/casual[\s\-_]leave/g, 'casual leave cl')
    .replace(/sick[\s\-_]leave/g, 'sick leave sl')
    .replace(/annual[\s\-_]leave/g, 'annual leave al el');

  return normalized
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Compute term frequency vector for token list
 */
function computeTF(tokens) {
  const tf = {};
  if (!tokens || tokens.length === 0) return tf;
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  // Log-normalized TF
  for (const token in tf) {
    tf[token] = 1 + Math.log(tf[token]);
  }
  return tf;
}

/**
 * Cosine similarity between two sparse vector maps
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key in vecA) {
    normA += vecA[key] * vecA[key];
    if (vecB[key]) {
      dotProduct += vecA[key] * vecB[key];
    }
  }

  for (const key in vecB) {
    normB += vecB[key] * vecB[key];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Cosine similarity between two dense float arrays
 */
function denseCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalize human policy name from filename
 */
function getPolicyDisplayName(fileName) {
  if (fileName.includes('leave')) return 'Leave Policy';
  if (fileName.includes('attendance')) return 'Attendance Policy';
  if (fileName.includes('wfh')) return 'WFH Policy';
  return 'Company Policy';
}

/**
 * Read and chunk Markdown files strictly by `## Section X`
 */
export function chunkPolicyFiles(policiesDir) {
  const chunks = [];
  const files = ['leave_policy.md', 'attendance_policy.md', 'wfh_policy.md'];

  for (const file of files) {
    const filePath = path.join(policiesDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[policyStore] Warning: Policy file not found: ${filePath}`);
      continue;
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const policyName = getPolicyDisplayName(file);

    // Split strictly by `## Section`
    // Matches headers like: ## Section 1: Purpose and Scope or ## Section 2
    const sectionRegex = /##\s+(Section\s+(\d+)(?::\s*([^\n\r]+))?)/gi;
    const matches = [...rawContent.matchAll(sectionRegex)];

    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];

      const startIndex = currentMatch.index;
      const endIndex = nextMatch ? nextMatch.index : rawContent.length;

      const fullSectionText = rawContent.slice(startIndex, endIndex).trim();
      const sectionNum = currentMatch[2];
      const sectionLabel = `Section ${sectionNum}`;
      const sectionTitle = currentMatch[3] ? currentMatch[3].trim() : `Section ${sectionNum}`;

      // Extract body text excluding the header line
      const firstLineEnd = fullSectionText.indexOf('\n');
      const bodyContent = firstLineEnd !== -1 ? fullSectionText.slice(firstLineEnd).trim() : fullSectionText;

      const formattedCitation = `(${policyName}, section ${sectionNum})`;
      const contractCitation = `docs/policies/${file}#Section ${sectionNum}`;

      const tokens = tokenize(fullSectionText);

      chunks.push({
        id: `${file.replace('.md', '')}_sec_${sectionNum}`,
        file_path: `docs/policies/${file}`,
        policy_name: policyName,
        section: sectionLabel,
        section_number: parseInt(sectionNum, 10),
        title: sectionTitle,
        content: fullSectionText,
        body: bodyContent,
        citation: formattedCitation,
        contract_citation: contractCitation,
        tokens,
        embedding: null, // Will hold API embedding if available
        tfidfVec: {}    // Will hold TF-IDF vector
      });
    }
  }

  return chunks;
}

/**
 * Attempt to generate embeddings via configured LLM provider endpoint
 */
async function generateRemoteEmbedding(text) {
  const provider = process.env.LLM_PROVIDER || 'gemini';
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) return null;

  try {
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] }
        })
      });

      if (!res.ok) {
        console.warn(`[policyStore] Gemini embedding returned status ${res.status}. Falling back to TF-IDF.`);
        return null;
      }

      const data = await res.json();
      return data?.embedding?.values || null;
    } else if (provider === 'openai') {
      const url = 'https://api.openai.com/v1/embeddings';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text
        })
      });

      if (!res.ok) {
        console.warn(`[policyStore] OpenAI embedding returned status ${res.status}. Falling back to TF-IDF.`);
        return null;
      }

      const data = await res.json();
      return data?.data?.[0]?.embedding || null;
    }
  } catch (err) {
    console.warn(`[policyStore] Embedding API call failed (${err.message}). Using deterministic TF-IDF fallback.`);
    return null;
  }

  return null;
}

/**
 * Initialize the in-memory policy store. Called on server startup.
 */
export async function initializePolicyStore(customPoliciesDir = null) {
  const policiesDir = customPoliciesDir || path.resolve(__dirname, '../../../docs/policies');
  console.log(`[policyStore] Indexing policy documents from ${policiesDir}...`);

  const chunks = chunkPolicyFiles(policiesDir);
  const numDocs = chunks.length;

  if (numDocs === 0) {
    console.warn('[policyStore] No policy sections found to index.');
    chunksStore = [];
    isInitialized = true;
    return chunksStore;
  }

  // 1. Calculate Document Frequencies (DF) for IDF calculation
  const docFreq = {};
  for (const chunk of chunks) {
    const uniqueTokens = new Set(chunk.tokens);
    for (const t of uniqueTokens) {
      docFreq[t] = (docFreq[t] || 0) + 1;
    }
  }

  // 2. Compute IDF for all vocabulary words: smooth IDF = ln((N + 1) / (df + 1)) + 1
  idfMap = {};
  for (const t in docFreq) {
    idfMap[t] = Math.log((numDocs + 1) / (docFreq[t] + 1)) + 1;
  }
  vocabulary = Object.keys(idfMap);

  // 3. Compute TF-IDF vectors for each chunk
  for (const chunk of chunks) {
    const tf = computeTF(chunk.tokens);
    const tfidf = {};
    for (const token in tf) {
      tfidf[token] = tf[token] * (idfMap[token] || 1);
    }
    chunk.tfidfVec = tfidf;
  }

  // 4. Optionally fetch remote embeddings if configured
  if (process.env.LLM_API_KEY) {
    console.log('[policyStore] Generating remote embeddings for policy sections...');
    for (const chunk of chunks) {
      try {
        const emb = await generateRemoteEmbedding(`${chunk.policy_name} ${chunk.title}: ${chunk.content}`);
        if (emb) {
          chunk.embedding = emb;
        }
      } catch (e) {
        // Continue with local TF-IDF
      }
    }
  }

  chunksStore = chunks;
  isInitialized = true;
  console.log(`[policyStore] Successfully loaded and indexed ${chunksStore.length} policy sections.`);
  return chunksStore;
}

/**
 * Search policy chunks using vector similarity with deterministic TF-IDF fallback.
 *
 * @param {string} query - The search query
 * @param {number} topK - Number of top chunks to return (default: 3)
 * @returns {Promise<Array<{ policy_name: string, section: string, title: string, content: string, citation: string, score: number }>>}
 */
export async function searchPolicy(query, topK = 3) {
  if (!isInitialized || chunksStore.length === 0) {
    await initializePolicyStore();
  }

  if (!query || typeof query !== 'string' || query.trim() === '') {
    return [];
  }

  const cleanQuery = query.trim();
  const queryTokens = tokenize(cleanQuery);

  // Check if we can use remote query embedding
  let queryEmbedding = null;
  const hasRemoteEmbeddings = chunksStore.some(c => c.embedding !== null);
  if (hasRemoteEmbeddings && process.env.LLM_API_KEY) {
    queryEmbedding = await generateRemoteEmbedding(cleanQuery);
  }

  // Compute TF-IDF vector for query
  const queryTF = computeTF(queryTokens);
  const queryTFIDF = {};
  for (const t in queryTF) {
    if (idfMap[t]) {
      queryTFIDF[t] = queryTF[t] * idfMap[t];
    } else {
      // Out of vocabulary query term
      queryTFIDF[t] = queryTF[t] * 1.5;
    }
  }

  // Score each chunk
  const scoredChunks = chunksStore.map(chunk => {
    let score = 0;

    if (queryEmbedding && chunk.embedding) {
      score = denseCosineSimilarity(queryEmbedding, chunk.embedding);
    } else {
      // Deterministic TF-IDF cosine similarity
      score = cosineSimilarity(queryTFIDF, chunk.tfidfVec);

      // Keyword boost for exact phrase/token matches in title or section
      const lowerContent = chunk.content.toLowerCase();
      const lowerTitle = chunk.title.toLowerCase();
      const lowerQuery = cleanQuery.toLowerCase();

      // Exact substring match in title/content bonus
      if (lowerTitle.includes(lowerQuery) || lowerContent.includes(lowerQuery)) {
        score += 0.35;
      }

      // Individual token hits
      for (const token of queryTokens) {
        if (lowerTitle.includes(token)) {
          score += 0.15;
        } else if (lowerContent.includes(token)) {
          score += 0.05;
        }
      }
    }

    return {
      policy_name: chunk.policy_name,
      section: chunk.section,
      section_number: chunk.section_number,
      title: chunk.title,
      content: chunk.content,
      citation: chunk.citation,
      contract_citation: chunk.contract_citation,
      score: parseFloat(score.toFixed(4))
    };
  });

  // Sort by score descending and take topK
  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, topK);
}

/**
 * Access all indexed chunks
 */
export function getAllChunks() {
  return chunksStore;
}

export default {
  initializePolicyStore,
  searchPolicy,
  getAllChunks,
  chunkPolicyFiles
};
