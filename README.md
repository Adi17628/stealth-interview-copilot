# AI Interview Assistant (Version 2.1)

A real-time, ultra-low-latency technical interview assistant that captures interviewer speech through any microphone and delivers clear, professional technical answers within **under 2.0 seconds**.

---

## 📄 Client Deliverables & Documentation

Official client handoff documents and architecture specifications are available in `docs/`:
- 📕 **[PDF Document](file:///c:/Users/WORK/Documents/ai-interview-demo/docs/AI_Interview_Assistant_System_Architecture_and_Client_Handoff_Document.pdf)** — Executive summary, technical architecture, empirical model benchmarks, and embedded live screenshots.
- 📘 **[Word (.docx) Document](file:///c:/Users/WORK/Documents/ai-interview-demo/docs/AI_Interview_Assistant_System_Architecture_and_Client_Handoff_Document.docx)** — Fully editable Microsoft Word handoff document.
- 📄 **[Technical Documentation](file:///c:/Users/WORK/Documents/ai-interview-demo/docs/PROJECT_DOCUMENTATION.md)** — Complete markdown documentation.

---

## ⚡ Key Highlights

- **Sub-2-Second Voice Pipeline**: Browser-native Web Speech API eliminates audio upload and server-side ASR delays.
- **Dual-Tier Retrieval**:
  - **Tier 1 (Instant Database):** In-memory 384-dim vector search across 80+ curated technical questions (**70–120ms** response).
  - **Tier 2 (AI Streaming Fallback):** Real-time streaming via **Google Gemini 2.5 Flash** with `thinking_budget: 0` (**1.2–1.8s** response).
- **Anti-Mismatch Accuracy Engine**: Content-word extraction and contrast rule penalties prevent cross-topic false positives (e.g. inner vs outer join, memory vs disk).
- **Formatted Answers**: Code blocks with language badges, 1-click **Copy Code** button, highlighted key takeaways, and glowing speed badges.

---

## 🚀 Quickstart Guide

### Prerequisites
- Python 3.10+
- Node.js 18+
- Google Chrome or Microsoft Edge (for Web Speech API)

### 1. Backend Setup
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
*Health check available at: `http://localhost:8000/health`*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs at: `http://localhost:5173`*

### 3. Usage
1. Open `http://localhost:5173` in Chrome or Edge.
2. Click the microphone button and speak a question, or click any suggestion chip to practice.
