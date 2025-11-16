import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import pdfParse from "pdf-parse-fork";
import axios from "axios";

const app = express();


const BASE_URL = process.env.BASE_URL || "http://localhost:5000";


app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

const upload = multer({ dest: "uploads/" });
const COHERE_API_KEY = "66oPD6qLIc6eaxLz7b872O2yWmyfwJGnJUPsprsQ";


app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Resume Ranker API is running!",
    base_url: BASE_URL,
  });
});


function extractKeywords(text) {
  const commonWords = new Set([
    "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
    "from","as","is","was","are","were","been","be","have","has","had","do",
    "does","did","will","would","should","could","may","might","must","can",
    "about","into","through","during"
  ]);

  const words = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s+#.]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.has(word));

  return [...new Set(words)];
}

function calculateKeywordMatch(resumeText, jobDescription) {
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(jobDescription);

  const matchedKeywords = resumeKeywords.filter(word => jobKeywords.includes(word));
  const missingKeywords = jobKeywords.filter(word => !resumeKeywords.includes(word));

  const matchPercentage = jobKeywords.length > 0
    ? Math.round((matchedKeywords.length / jobKeywords.length) * 100)
    : 0;

  return {
    keywordScore: matchPercentage,
    matchedKeywords: matchedKeywords.slice(0, 20),
    missingKeywords: missingKeywords.slice(0, 15),
    totalJobKeywords: jobKeywords.length,
    totalResumeKeywords: resumeKeywords.length,
  };
}


function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dot / (magA * magB);
}

async function getSemanticSimilarity(resumeText, jobDescription) {
  if (!String(resumeText || "").trim()) return null;

  const API_URL = "https://api.cohere.ai/v1/embed";

  try {
    const inputs = [
      String(resumeText || "").slice(0, 512),
      String(jobDescription || "").slice(0, 512)
    ];

    const response = await axios.post(
      API_URL,
      { texts: inputs, model: "embed-english-v3.0", input_type: "search_document" },
      { headers: { Authorization: `Bearer ${COHERE_API_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
    );

    const embeddings = response.data.embeddings;
    const similarity = cosineSimilarity(embeddings[0], embeddings[1]);

    return Math.round(Math.max(0, Math.min(100, similarity * 100)));
  } catch (error) {
    console.error("❌ Cohere API error:", error.response?.data || error.message);
    return null;
  }
}


function extractSections(resumeText) {
  const lower = String(resumeText || "").toLowerCase();

  const projectStart = lower.indexOf("projects:");
  const experienceStart = lower.indexOf("experience:");

  const projectText = projectStart !== -1
    ? String(resumeText).slice(projectStart, experienceStart !== -1 ? experienceStart : undefined)
    : "";

  const experienceText = experienceStart !== -1
    ? String(resumeText).slice(experienceStart)
    : "";

  return { projectText, experienceText };
}

function calculateProjectExperienceScore(resumeText, jobDescription) {
  const { projectText, experienceText } = extractSections(resumeText);
  const jdKeywords = extractKeywords(jobDescription);
  const sectionText = projectText + " " + experienceText;

  if (!sectionText) return 0;

  const matched = extractKeywords(sectionText).filter(word =>
    jdKeywords.includes(word)
  );

  const score = jdKeywords.length > 0
    ? Math.round((matched.length / jdKeywords.length) * 100)
    : 0;

  return Math.min(100, score);
}

function calculateProblemSolvingScore(resumeText) {
  if (!String(resumeText || "").trim()) return 0;

  const text = String(resumeText || "").toLowerCase();

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const safeInt = (s, d = 0) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : d;
  };

  const logistic = (x, c, k, maxPts) => {
    const y = 1 / (1 + Math.exp(-k * (x - c)));
    return clamp(y * maxPts, 0, maxPts);
  };

  const minMax = (x, min, max, maxPts) => {
    if (max <= min) return 0;
    const z = (x - min) / (max - min);
    return clamp(z * maxPts, 0, maxPts);
  };

  const leetSolvedMatch = text.match(/solved\s+(\d+)\+?\s+(?:problems|qs?)\s+(?:on\s+)?leetcode/);
  const leetSolved = leetSolvedMatch ? safeInt(leetSolvedMatch[1]) : 0;

  const leetRatingMatch = text.match(/leetcode\s+rating[:\s]*([0-9]{3,4})/);
  const leetRating = leetRatingMatch ? safeInt(leetRatingMatch[1]) : 0;

  const ccRatingMatch = text.match(/codechef\s+rating[:\s]*([0-9]{3,4})/);
  const ccRating = ccRatingMatch ? safeInt(ccRatingMatch[1]) : 0;

  const topPctMatch = text.match(/top\s+(\d+)\s*%/);
  const topPct = topPctMatch ? safeInt(topPctMatch[1]) : null;

  const W_LEET_SOLVED = 35;
  const W_LEET_RATING = 30;
  const W_CC_RATING = 20;
  const W_TOP_PCT = 15;

  let solvedLinear = minMax(leetSolved, 0, 300, W_LEET_SOLVED * 0.55);
  let solvedLogi = logistic(leetSolved, 200, 0.01, W_LEET_SOLVED * 0.60);
  let leetSolvedPts = clamp(solvedLinear + solvedLogi, 0, W_LEET_SOLVED);

  let lcLinear = minMax(leetRating, 1200, 2000, W_LEET_RATING * 0.6);
  let lcLogi = logistic(leetRating, 1700, 0.01, W_LEET_RATING * 0.6);
  let leetRatingPts = clamp(lcLinear + lcLogi, 0, W_LEET_RATING);

  let ccLinear = minMax(ccRating, 1200, 2000, W_CC_RATING * 0.6);
  let ccLogi = logistic(ccRating, 1700, 0.01, W_CC_RATING * 0.6);
  let ccPts = clamp(ccLinear + ccLogi, 0, W_CC_RATING);

  let topPctPts = 0;
  if (topPct !== null) {
    const inv = clamp((100 - topPct) / 100, 0, 1);
    const lin = inv * (W_TOP_PCT * 0.5);
    const logi = logistic(100 - topPct, 70, 0.1, W_TOP_PCT * 0.7);
    topPctPts = clamp(lin + logi, 0, W_TOP_PCT);
  }

  const total = clamp(leetSolvedPts + leetRatingPts + ccPts + topPctPts, 0, 100);
  return Math.round(total);
}


function generateFeedback(keywordResults, projectScore, problemScore) {
  const feedback = [];

  if (keywordResults.missingKeywords.length) {
    feedback.push(`Add missing skills: ${keywordResults.missingKeywords.join(", ")}`);
  }

  if (projectScore < 70) {
    feedback.push("Highlight more relevant projects and experience");
  }

  if (problemScore < 70) {
    feedback.push("Include competitive programming or problem-solving achievements");
  }

  if (!feedback.length) {
    feedback.push("Great! Resume is well-aligned with the job description");
  }

  return feedback;
}


function getWeights(jobType = "general") {
  switch (jobType.toLowerCase()) {
    case "software":
    case "dev":
      return { keyword: 0.25, semantic: 0.25, project: 0.2, problem: 0.3 };

    case "data science":
    case "ml":
      return { keyword: 0.35, semantic: 0.35, project: 0.2, problem: 0.1 };

    case "web":
    case "frontend":
      return { keyword: 0.3, semantic: 0.3, project: 0.3, problem: 0.1 };

    default:
      return { keyword: 0.35, semantic: 0.35, project: 0.2, problem: 0.1 };
  }
}


app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (req.file?.originalname) {
      console.log("📥 File uploaded:", req.file.originalname);
    }

    const jobDescription = req.body.jobDescription || "";
    const jobType = req.body.jobType || "general";

    if (!jobDescription) {
      return res.status(400).json({ success: false, error: "Job description is required" });
    }

    const warnings = [];

    
    if (!req.file) {
      warnings.push("No PDF uploaded. Scoring computed with empty resume.");

      const emptyText = "";
      const keywordResults = calculateKeywordMatch(emptyText, jobDescription);
      const semanticScore = await getSemanticSimilarity(emptyText, jobDescription);
      const projectScore = calculateProjectExperienceScore(emptyText, jobDescription);
      const problemScore = calculateProblemSolvingScore(emptyText);
      const weights = getWeights(jobType);

      const finalScore = Math.round(
        (keywordResults.keywordScore * weights.keyword) +
        ((semanticScore !== null ? semanticScore : 0) * weights.semantic) +
        (projectScore * weights.project) +
        (problemScore * weights.problem)
      );

      const feedback = generateFeedback(keywordResults, projectScore, problemScore);

      return res.json({
        success: true,
        warnings,
        resumeText: emptyText,
        jobDescription,
        jobType,
        finalScore,
        keywordScore: keywordResults.keywordScore,
        semanticScore,
        projectExperienceScore: projectScore,
        problemSolvingScore: problemScore,
        matchedKeywords: keywordResults.matchedKeywords,
        missingKeywords: keywordResults.missingKeywords,
        stats: {
          totalJobKeywords: keywordResults.totalJobKeywords,
          totalResumeKeywords: keywordResults.totalResumeKeywords,
          matchedCount: keywordResults.matchedKeywords.length,
        },
        feedback,
      });
    }

   
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    fs.unlinkSync(req.file.path);

    const resumeText = String(data?.text || "").trim();
    if (!resumeText.length) {
      warnings.push("Resume appears empty after text extraction. Scoring computed with empty resume.");
    }

    const textForScoring = resumeText.length ? resumeText : "";

    const keywordResults = calculateKeywordMatch(textForScoring, jobDescription);
    const semanticScore = await getSemanticSimilarity(textForScoring, jobDescription);
    const projectScore = calculateProjectExperienceScore(textForScoring, jobDescription);
    const problemScore = calculateProblemSolvingScore(textForScoring);

    const weights = getWeights(jobType);

    const finalScore = Math.round(
      (keywordResults.keywordScore * weights.keyword) +
      (semanticScore !== null ? semanticScore * weights.semantic : 0) +
      (projectScore * weights.project) +
      (problemScore * weights.problem)
    );

    const feedback = generateFeedback(keywordResults, projectScore, problemScore);

    res.json({
      success: true,
      warnings,
      resumeText: textForScoring,
      jobDescription,
      jobType,
      finalScore,
      keywordScore: keywordResults.keywordScore,
      semanticScore,
      projectExperienceScore: projectScore,
      problemSolvingScore: problemScore,
      matchedKeywords: keywordResults.matchedKeywords,
      missingKeywords: keywordResults.missingKeywords,
      stats: {
        totalJobKeywords: keywordResults.totalJobKeywords,
        totalResumeKeywords: keywordResults.totalResumeKeywords,
        matchedCount: keywordResults.matchedKeywords.length,
      },
      feedback,
    });

  } catch (error) {
    console.error("❌ Error in backend:", error);

    const jobDescription = req.body?.jobDescription || "";
    const jobType = req.body?.jobType || "general";
    const emptyText = "";

    const warnings = ["Unexpected server issue. Computed with empty resume."];

    const keywordResults = calculateKeywordMatch(emptyText, jobDescription);
    const semanticScore = await getSemanticSimilarity(emptyText, jobDescription);
    const projectScore = calculateProjectExperienceScore(emptyText, jobDescription);
    const problemScore = calculateProblemSolvingScore(emptyText);

    const weights = getWeights(jobType);

    const finalScore = Math.round(
      (keywordResults.keywordScore * weights.keyword) +
      ((semanticScore !== null ? semanticScore : 0) * weights.semantic) +
      (projectScore * weights.project) +
      (problemScore * weights.problem)
    );

    const feedback = generateFeedback(keywordResults, projectScore, problemScore);

    res.status(200).json({
      success: true,
      warnings,
      resumeText: emptyText,
      jobDescription,
      jobType,
      finalScore,
      keywordScore: keywordResults.keywordScore,
      semanticScore,
      projectExperienceScore: projectScore,
      problemSolvingScore: problemScore,
      matchedKeywords: keywordResults.matchedKeywords,
      missingKeywords: keywordResults.missingKeywords,
      stats: {
        totalJobKeywords: keywordResults.totalJobKeywords,
        totalResumeKeywords: keywordResults.totalResumeKeywords,
        matchedCount: keywordResults.matchedKeywords.length,
      },
      feedback,
    });
  }
});


app.listen(5000, () => {
  console.log(`🚀 Server running at ${BASE_URL}`);
  console.log(`🔑 Using Cohere API Key: ${COHERE_API_KEY.slice(0, 10)}...`);
});
