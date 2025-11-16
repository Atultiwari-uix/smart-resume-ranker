import React, { useState, useEffect } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [jobDesc, setJobDesc] = useState("");
  const [jobType, setJobType] = useState("software");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || true
  );

  useEffect(() => {
    document.body.className = darkMode ? "dark" : "light";
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    localStorage.setItem("darkMode", !darkMode);
  };

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return alert("Please upload a resume first!");
    if (!jobDesc.trim()) return alert("Please enter a job description!");

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("jobDescription", jobDesc);
    formData.append("jobType", jobType);

    setLoading(true);
    try {
      const res = await axios.post("http://localhost:5000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResults(res.data);
    } catch (err) {
      console.error(err);
      alert("Upload failed — check backend");
    } finally {
      setLoading(false);
    }
  };

  const copyKeywords = (keywords) => {
    navigator.clipboard.writeText(keywords.join(", "));
    alert("Copied to clipboard!");
  };

  const downloadPDF = async () => {
    const element = document.getElementById("results-card");
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save("resume-analysis.pdf");
  };

  return (
    <div className="app-container">
      <header className="top-bar">
        <h1>🎯 Smart Resume Ranker</h1>
        <button className="dark-toggle" onClick={toggleDarkMode}>
          {darkMode ? "🌞 Light Mode" : "🌙 Dark Mode"}
        </button>
      </header>

      <div
        className={`card input-card ${file ? "file-present" : ""}`}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <p className="subtitle">AI-Powered Resume Analysis</p>

        <div className="input-group">
          <label>📄 Upload Resume (PDF):</label>
          <input type="file" accept=".pdf" onChange={handleFileChange} />
          {file && <span className="file-name">{file.name}</span>}
          {!file && <span className="drag-info">Or drag & drop file here</span>}
        </div>

        <div className="input-group">
          <label>💼 Job Description:</label>
          <textarea
            placeholder="Paste job description..."
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>📝 Job Type:</label>
          <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
            <option value="software">Software Developer</option>
            <option value="data science">Data Scientist / ML</option>
            <option value="web">Web / Frontend</option>
            <option value="general">General</option>
          </select>
        </div>

        <button
          className={`upload-btn ${loading ? "loading" : ""}`}
          onClick={handleUpload}
          disabled={loading}
        >
          {loading ? "🤖 Analyzing..." : "🚀 Analyze Resume"}
        </button>
      </div>

      {results && (
        <div className="card results-card" id="results-card">
          <button className="pdf-btn" onClick={downloadPDF}>📄 Download PDF</button>

          <div
            className="final-score"
            style={{ background: "linear-gradient(90deg, #7289DA, #4B6CB7)" }}
          >
            <h2>{results.finalScore}%</h2>
            <p>Overall Match</p>
          </div>

          <div className="score-bars">
            {[
              { label: "🔍 Keyword Match", score: results.keywordScore, color: "#2563EB" },
              { label: "🤖 AI Semantic Match", score: results.semanticScore || 0, color: "#A855F7" },
              { label: "📁 Project / Experience", score: results.projectExperienceScore || 0, color: "#FBBF24" },
              { label: "🧩 Problem Solving", score: results.problemSolvingScore || 0, color: "#22C55E" },
            ].map((item, i) => (
              <div className="score-bar" key={i}>
                <span>{item.label}</span>
                <div className="bar-background">
                  <div className="bar-fill" style={{ width: `${item.score}%`, background: item.color }} />
                  <span className="bar-label">{item.score}%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="feedback">
            <h3>💡 Feedback</h3>
            <ul>{results.feedback.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>

          <div className="keywords">
            <div className="keyword-header">
              <h3>✅ Matched Keywords</h3>
              <button onClick={() => copyKeywords(results.matchedKeywords)}>📋 Copy</button>
            </div>
            <div className="keyword-list">{results.matchedKeywords.map((k, i) => <span key={i}>{k}</span>)}</div>

            {results.missingKeywords.length > 0 && (
              <>
                <div className="keyword-header">
                  <h3>❌ Missing Keywords</h3>
                  <button onClick={() => copyKeywords(results.missingKeywords)}>📋 Copy</button>
                </div>
                <div className="keyword-list missing">{results.missingKeywords.map((k, i) => <span key={i}>{k}</span>)}</div>
              </>
            )}
          </div>

          <details>
            <summary>📄 View Extracted Resume Text</summary>
            <pre>{results.resumeText}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default App;
