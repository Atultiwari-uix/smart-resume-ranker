# Resume Ranker

Node.js backend that scores how well a PDF resume matches a job description, meant to be used by a frontend (for example on `localhost:3000`).

## Features

- REST API on `localhost:5000` with a health check at `/` and main scoring endpoint at `/upload`.
- Upload a PDF resume plus a job description and optional job type.
- Calculates keyword match, Cohere-based semantic similarity, project/experience relevance, and problem-solving score.
- Combines metrics into a single final score with matched/missing keywords and textual feedback.

## API

### GET `/`

Returns basic status and `base_url`.

### POST `/upload`

- Body: `multipart/form-data`
  - `pdf`: resume file (optional but recommended)
  - `jobDescription`: string (required)
  - `jobType`: string (optional, e.g. `software`, `data science`, `web`, `general`)
- Response: JSON with
  - `finalScore`
  - `keywordScore`, `semanticScore`, `projectExperienceScore`, `problemSolvingScore`
  - `matchedKeywords`, `missingKeywords`, `stats`, `feedback`, `warnings`

## Scoring Overview

- **Keyword score**: overlap between JD and resume keywords after stopword removal.
- **Semantic score**: cosine similarity between Cohere embeddings of resume and JD.
- **Project/experience score**: keyword overlap focused on `"Projects:"` and `"Experience:"` sections.
- **Problem-solving score**: derived from LeetCode/CodeChef stats and top-percentile mentions.
- **Final score**: weighted combination depending on `jobType` (e.g., software gives more weight to problem-solving).

## Getting Started

1. Install dependencies (`express`, `multer`, `cors`, `pdf-parse-fork`, `axios`).
2. Set your Cohere API key (preferably via environment variable).
3. Start the server

## Demo
<img width="1758" height="888" alt="image" src="https://github.com/user-attachments/assets/de9e11e6-9c12-4d6a-9278-dae9ebc496c9" />
<img width="1743" height="1006" alt="image" src="https://github.com/user-attachments/assets/7d0e3de8-209b-45c2-b1c4-66477a209d08" />
