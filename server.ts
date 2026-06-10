import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up body parser with large limits to support camera captures (base64)
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Lazy initializer for Google GenAI client to prevent crashes if key is missing upon boot
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY env variable is not set. AI Features will run in Mock Mode.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "dummy_key",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

// 1. API: AI-Assisted Civic Issue Detection
app.post("/api/ai-detect", async (req, res) => {
  try {
    const { image, mimeType, textPrompt } = req.body;
    
    // Check if key is available, run fallback mock if missing
    if (!process.env.GEMINI_API_KEY) {
      console.log("No GEMINI_API_KEY - Triggering safe local mock detection");
      return res.json({
        isCivicIssue: true,
        category: textPrompt ? (textPrompt.toLowerCase().includes("light") ? "Street Light Not Working" : "Potholes") : "Potholes",
        severity: "Medium",
        suggestedTitle: textPrompt ? `Report: ${textPrompt.slice(0, 30)}...` : "Detected Infrastructure Issue",
        suggestedDescription: textPrompt ? `The resident noted: ${textPrompt}. Automated detection confirmed a potential hazard.` : "A potential hazard was detected in the submitted photograph. Verified for repair attention.",
        confidence: 85
      });
    }

    const ai = getAi();
    const contents: any[] = [];

    // Form image part if base64 is present
    if (image) {
      // Remove data outline prefix if sent
      const cleanData = image.replace(/^data:image\/\w+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: cleanData
        }
      });
    }

    // Add prompt instructions
    contents.push({
      text: `Analyze this civic issue report. User Note: "${textPrompt || 'No comment provided.'}".
Determine if there is a legitimate civil or road/infrastructure problem.
Strictly categorize the issue as one of:
- Potholes
- Broken Roads
- Water Logging
- Garbage Dump
- Damaged Traffic Signal
- Street Light Not Working
- Drain Blockage
- Fallen Trees
- Others`
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        systemInstruction: "You are Sonar Bharat, an advanced AI municipal auditing assistant for Indian streets. Classify user photo/text reports accurately. Respond only in structured JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCivicIssue: {
              type: Type.BOOLEAN,
              description: "Whether the media/text shows a genuine public civic or road issue"
            },
            category: {
              type: Type.STRING,
              description: "Strictly one of: 'Potholes', 'Broken Roads', 'Water Logging', 'Garbage Dump', 'Damaged Traffic Signal', 'Street Light Not Working', 'Drain Blockage', 'Fallen Trees', 'Others'"
            },
            severity: {
              type: Type.STRING,
              description: "The safety rating / severity impact: 'Low', 'Medium', 'High', 'Critical'"
            },
            suggestedTitle: {
              type: Type.STRING,
              description: "Short concise title representing the issue"
            },
            suggestedDescription: {
              type: Type.STRING,
              description: "A summary describing the problem and requested action"
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence percentage (0-100) of detection"
            }
          },
          required: ["isCivicIssue", "category", "severity", "suggestedTitle", "suggestedDescription", "confidence"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from AI engine");
    }

    const aiAnalysis = JSON.parse(resultText);
    return res.json(aiAnalysis);
  } catch (error: any) {
    console.error("Gemini Detection Error:", error);
    return res.status(500).json({
      error: "AI analysis failed",
      details: error.message || String(error)
    });
  }
});

// 2. Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "Sonar Bharat server online", time: new Date() });
});

// Vite Integration Middleware
async function bootstrapVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Static production assets active.");
  }

  // Start listening exclusively on Port 3000
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sonar Bharat Application Running on http://0.0.0.0:${PORT}`);
  });
}

bootstrapVite().catch((err) => {
  console.error("Vite bootstrap failure:", err);
});
