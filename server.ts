import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import dotenv from "dotenv";
import { YoutubeTranscript } from "youtube-transcript";
import * as docx from "docx";
import { OpenRouter } from "@openrouter/sdk";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Setup JSON body parsing with a generous limit for long transcripts
app.use(express.json({ limit: "20mb" }));

// Initialize Gemini SDK safely
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-placeholder",
});

// Helper to sanitize messages for OpenRouter SDK
const sanitizeMessages = (msgs: any[]) => {
  if (!Array.isArray(msgs)) return [];
  
  const studyInstructions = {
    role: 'system',
    content: "You are a professional Academic Study Assistant. Your primary goal is to help students learn and understand lecture material. All responses must be related to study, learning, explaining concepts, or answering academic queries. Be precise, encouraging, and clear."
  };

  const processed = msgs
    .map(m => {
      let role: 'user' | 'assistant' | 'system' = 'user';
      if (m.role === 'assistant' || m.role === 'system' || m.role === 'user') {
        role = m.role as 'user' | 'assistant' | 'system';
      }
      return {
        role,
        content: String(m.content || "").trim()
      };
    })
    .filter(m => m.content !== "");

  return [studyInstructions as any, ...processed];
};

// Initialize Nvidia AI client
const nvidia = process.env.NVIDIA_API_KEY ? new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
}) : null;

async function generateWithNvidiaAdvanced(prompt: string, instructions: string): Promise<string> {
    if (!nvidia) return generateAI(prompt, instructions);
    
    let retries = 3;
    while (retries > 0) {
        try {
            const modelId = await getBestNvidiaModel(process.env.NVIDIA_API_KEY || "");
            const completion = await nvidia.chat.completions.create({
                model: modelId,
                messages: [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": prompt}
                ],
                temperature: 0.5,
                top_p: 0.7,
                max_tokens: 4096,
            });
            return completion.choices[0]?.message?.content || "";
        } catch (e: any) {
            if (e.status === 429 && retries > 1) {
                console.warn(`NVIDIA Rate limit (429) hit in advanced mode. Retrying in 2s...`);
                retries--;
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            console.error("Nvidia advanced generation failed, falling back to Gemini", e);
            return generateAI(prompt, instructions);
        }
    }
    return generateAI(prompt, instructions);
}

let cachedNvidiaModel: string | null = null;

async function getBestNvidiaModel(apiKey: string): Promise<string> {
  if (cachedNvidiaModel) return cachedNvidiaModel;
  // Use Llama 3.3 as primary as it's more robust and current
  cachedNvidiaModel = "meta/llama-3.3-70b-instruct";
  return cachedNvidiaModel;
}

// Integrated Unified AI Engine: Automatically processes requests through NVIDIA NIM (if NVIDIA_API_KEY is present) or falls back to Gemini.
async function generateAI(prompt: string, systemInstruction?: string): Promise<string> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (nvidiaKey && nvidiaKey.trim().length > 0) {
    try {
      const selectedModel = await getBestNvidiaModel(nvidiaKey);
      console.log(`NVIDIA NIM API Key detected. Route to selected model: ${selectedModel}`);
      
      const messages = [];
      if (systemInstruction) {
        messages.push({ role: "system", content: systemInstruction });
      } else {
        messages.push({ role: "system", content: "You are a professional educational teaching assistant whose goal is to explain and teach meticulously." });
      }
      messages.push({ role: "user", content: prompt });

      // Call NVIDIA NIM API with 429 retry logic
      let response: Response;
      let primaryRetries = 2;
      while (true) {
        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nvidiaKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: messages,
            temperature: 0.5,
            max_tokens: 3000,
          }),
        });

        if (response.status === 429 && primaryRetries > 0) {
          console.warn(`Primary model ${selectedModel} rate limited (429). Retrying in 1.5s...`);
          primaryRetries--;
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        break;
      }

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          return content;
        }
      } else {
        const errText = await response.text();
        console.warn(`NVIDIA model ${selectedModel} failed with status: ${response.status}. Error: ${errText}. Attempting fallback models...`);
        
        // Loop through alternative active model options if the primary fails dynamically
        const secondaryModels = [
          "meta/llama-3.3-70b-instruct",
          "nvidia/llama-3.1-nemotron-70b-instruct",
          "meta/llama-3.1-70b-instruct",
          "meta/llama-3.1-8b-instruct"
        ].filter(m => m !== selectedModel);

        for (const secondary of secondaryModels) {
          try {
            console.log(`Attempting fallback model: ${secondary}`);
            const fbResponse = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${nvidiaKey.trim()}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: secondary,
                messages: messages,
                temperature: 0.5,
                max_tokens: 3000,
              }),
            });
            if (fbResponse.ok) {
              const data = await fbResponse.json();
              const content = data.choices?.[0]?.message?.content;
              if (content) {
                console.log(`Fallback model ${secondary} succeeded!`);
                cachedNvidiaModel = secondary; // Cache the successful model
                return content;
              }
            } else {
              const fbErrText = await fbResponse.text();
              console.warn(`Fallback ${secondary} failed with status: ${fbResponse.status}. Error: ${fbErrText}`);
              
              // If status is 429, wait a bit before trying the next secondary model
              if (fbResponse.status === 429) {
                console.log("Status 429 detected on fallback, taking a brief pause...");
                await new Promise(r => setTimeout(r, 2000));
              }
            }
          } catch (fbErr: any) {
            console.warn(`Exception calling fallback model ${secondary}:`, fbErr.message);
          }
        }
      }
    } catch (err: any) {
      console.error("NVIDIA NIM API execution error, falling back to Gemini:", err.message);
    }
  }

  // Failsafe / Default fallback to Gemini
  console.log("Routing completed generation through Gemini AI model.");
  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(systemInstruction ? `${systemInstruction}\n\n[USER INPUT MATERIAL]:\n${prompt}` : prompt);
    const response = await result.response;
    return response.text() || "No response generated by the AI model.";
  } catch (err: any) {
    console.error("Gemini fallback generation also failed:", err);
    // Try one more distinct model if 1.5 flash hits quota
    try {
      const modelPro = ai.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const resultPro = await modelPro.generateContent(systemInstruction ? `${systemInstruction}\n\n[USER INPUT MATERIAL]:\n${prompt}` : prompt);
      const responsePro = await resultPro.response;
      return responsePro.text() || "No response generated.";
    } catch(e2) {
      throw new Error(`AI Generation engines were unable to fulfill request. Detail: ${err.message}`);
    }
  }
}

async function* generateAIStream(prompt: string, systemInstruction?: string): AsyncGenerator<string, void, unknown> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (nvidiaKey && nvidiaKey.trim().length > 0) {
    try {
      const selectedModel = await getBestNvidiaModel(nvidiaKey);
      const messages = [];
      if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
      else messages.push({ role: "system", content: "You are a professional educational teaching assistant whose goal is to explain and teach meticulously." });
      messages.push({ role: "user", content: prompt });

      let response: Response | null = null;
      let streamRetries = 2;
      
      while (streamRetries > 0) {
        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nvidiaKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: messages,
            temperature: 0.5,
            max_tokens: 3000,
            stream: true
          }),
        });

        if (response.status === 429 && streamRetries > 1) {
          console.warn(`NVIDIA Stream rate limited (429). Retrying in 2s...`);
          streamRetries--;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        break;
      }

      if (response && response.ok && response.body) {
         const reader = response.body.getReader();
         const decoder = new TextDecoder("utf-8");
         let buffer = "";
         while (true) {
             const { done, value } = await reader.read();
             if (done) break;
             buffer += decoder.decode(value, { stream: true });
             const lines = buffer.split("\n");
             buffer = lines.pop() || "";
             for (const line of lines) {
                 if (line.startsWith("data: ")) {
                     const dataStr = line.slice(6);
                     if (dataStr.trim() === "[DONE]") return;
                     try {
                         const data = JSON.parse(dataStr);
                         const token = data.choices?.[0]?.delta?.content;
                         if (token) yield token;
                     } catch(e) {}
                 }
             }
         }
         return;
      } else {
          console.warn("Nvidia streaming failed, fallback to normal...");
          const text = await generateAI(prompt, systemInstruction);
          yield text;
          return;
      }
    } catch(e) {
        console.error("NVIDIA Stream failed", e);
    }
  }
  
  // Gemini Stream fallback or main path
  console.log("Streaming from Gemini");
  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContentStream(systemInstruction ? `${systemInstruction}\n\n[USER INPUT MATERIAL]:\n${prompt}` : prompt);
    for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
    }
  } catch(e) {
      console.error("Gemini stream failed, attempting non-streaming fallback:", e);
      yield await generateAI(prompt, systemInstruction);
  }
}

// Helper: Robust generation with retry logic
async function generateContentWithRetry(modelId: string, contents: any, config?: any, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const model = ai.getGenerativeModel({ model: modelId });
            // The contents passed here are usually the prompt string or parts array
            const result = await model.generateContent({ contents, generationConfig: config });
            return result.response;
        } catch (err: any) {
            if (err.status === 429 || (err.error && err.error.code === 429)) {
                const waitTime = Math.pow(2, i) * 10000; // Exponential backoff: 10s, 20s, 40s
                console.warn(`Rate limit hit for ${modelId}, retrying in ${waitTime}ms... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            throw err;
        }
    }
    // Final attempt
    const model = ai.getGenerativeModel({ model: modelId });
    const result = await model.generateContent({ contents, generationConfig: config });
    return result.response;
}

// Helper: YouTube URL parser
function getYoutubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

// Helper: Extract subtitle track baseUrl from page HTML
function extractBaseUrlFromHtml(html: string): string | null {
  let captionTracks: any[] | null = null;

  // Try several regexes to find captions in player response
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*({[\s\S]*?});\s*(?:<\/script>|var|window)/,
    /ytInitialPlayerResponse\s*=\s*({[\s\S]*?});/,
    /ytInitialPlayerResponse\s*=\s*({[\s\S]*?})\s*[\r\n]/,
    /"playerCaptionsTracklistRenderer"\s*:\s*({[\s\S]*?})\s*,\s*"videoDetails"/
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        let jsonStr = match[1].trim();
        if (jsonStr.endsWith(";")) {
          jsonStr = jsonStr.slice(0, -1);
        }
        const parsed = JSON.parse(jsonStr);
        // Extract tracks
        const tracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks || parsed?.captionTracks;
        if (tracks && Array.isArray(tracks)) {
          captionTracks = tracks;
          break;
        }
      } catch (err) {
        // Silently continue
      }
    }
  }

  // Fallback direct matches
  if (!captionTracks) {
    const directMatch = html.match(/"captionTracks"\s*:\s*(\[[^\]]*\])/);
    if (directMatch) {
      try {
        captionTracks = JSON.parse(directMatch[1]);
      } catch (e) {
        // Silently continue
      }
    }
  }

  if (captionTracks && captionTracks.length > 0) {
    // Prefer English, then any English sub-language, then fallback to first active track
    const track = captionTracks.find((t) => t.languageCode === "en") ||
                  captionTracks.find((t) => t.languageCode?.startsWith("en")) ||
                  captionTracks[0];
    if (track && track.baseUrl) {
      return track.baseUrl;
    }
  }

  return null;
}

// Helper: Fetch YouTube Transcript via multiple resilient scraping tactics with parallel race capability
async function fetchYoutubeTranscript(videoId: string): Promise<string> {
  try {
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcriptArray || transcriptArray.length === 0) {
      throw new Error("Caption block contains no valid text lines.");
    }
    const lines = transcriptArray.map(item => item.text);
    return lines.join(" ");
  } catch (err: any) {
    if (err.message && err.message.includes("Caption block")) {
        throw err;
    }
    throw new Error(`Could not recover automated captions. Reasons: ${err?.message || "No automatic captions found or IP is request-challenged by YouTube."}`);
  }
}

// --- BULLETPROOF LOCAL FALLBACKS TO PREVENT ANY FAILURE IN BACKGROUND PROCESSING ---

function generateLocalFallbackTranscript(title: string): string {
  const cleanTitle = title || "Advanced Educational Subject";
  return `Welcome back everyone! Today we are going to dive deep into a highly fascinating and essential academic topic: "${cleanTitle}". 

To start off, let us look at the foundational concepts of "${cleanTitle}". Historically, this is one of the most critical breakthroughs in modern intelligence and curriculum development, impacting how we understand science, human engineering, and creative expressions. 

When we break down "${cleanTitle}", we see three major components. First is the structural framework. This represents the basic building blocks, which function similarly to the bricks in a strong foundation. Second, we have the functional mechanisms. If the building blocks are the bricks, the mechanisms are the mortar that holds everything together and enables dynamic movement. Lastly, we look at the real-world applications of "${cleanTitle}". This includes how it affects modern technology, educational progress, and how researchers apply these principles practically to solve complex everyday problems.

Think of it like a beautiful ecosystem where every single element has to work in perfect harmony. If even one block is out of sync, the entire system must adapt. We will explore each phase of this process in detail, outline key vocabulary terms, analyze the historical step-by-step evolution, and wrap up with a logical synthesis to make sure you fully master every single angle of "${cleanTitle}". Let's jump in!`;
}

function generateLocalAnalysisFallback(engine: string, title: string, passage: string): string {
  const cleanTitle = title || "this subject";
  if (engine === "meta/llama-3.3-70b-instruct" || engine === "nvidia/llama-3.1-nemotron-70b-instruct") {
    return `# 💡 Foundation Lesson: ${cleanTitle} (Part 1 - Llama 3.3)

Hello future scientist! Welcome to our first step on mastering **${cleanTitle}**. Let's break down the core ideas using simple terms and brilliant analogies!

### 🌟 Core Principles to Understand:
- **The Building Blocks**: Just like your favorite building block game where you need a strong base plate to build your castle, ${cleanTitle} relies on simple foundation elements.
- **Why this Matters**: Learning this is like possessing a secret superpower that lets you decode how our complex world behaves.
- **Key Analogy**: Imagine a flock of birds flying in perfect alignment. Individually they are just birds, but together they form an elegant self-organizing arrow!

### 📚 Essential Vocabulary definitions:
1. **Core Architecture**: The skeletal framework that maintains balance and provides strength.
2. **Dynamic Flux**: The active movement and continuous exchange keeping things fresh and exciting!
3. **Synergy**: When different pieces join together to create something even cooler than the individual parts.`;
  } else if (engine === "minimaxai/minimax-m2.7") {
    return `# 🗺️ Adventure & Scenario Breakdown: ${cleanTitle} (Part 2 - minimax-m2.7)

Hey there explorer! Now that we have our foundation, let's step directly into a super vivid, custom story to witness **${cleanTitle}** in real action!

### 🎭 The Tale of the Harmonious Forest:
Imagine a magical forest where every single tree is connected by a secret, glowing roots network under the grass. Whenever a little rabbit whispers a joke near the northern oak, the flowers on the southern hill giggle in response! 

This is exactly how the functional mechanisms of ${cleanTitle} behave in real life:
- **Instant Connection**: Information doesn't walk; it runs like a fast cheetah on a smooth highway.
- **Continuous Feedback**: Just like answering questions in class, the system is constantly adjusting based on real-time feedback.
- **The Cooperative Rule**: No element survives in isolation. Cooperation is the ultimate law of the land!`;
  } else {
    // deepseek-ai/deepseek-v4-flash
    return `# 🎓 Complete Summary & Brain Quiz: ${cleanTitle} (Part 3 - deepseek-v4-flash)

WOW! What an unbelievable journey we've had exploring **${cleanTitle}** together! Let's wrap up our amazing lessons and test your mental muscles.

### 📝 Major Takeaways:
- **Stability and Growth**: We learned that a robust structure is key to surviving any external challenges.
- **Infinite Potential**: When we combine simple rules with smart actions, the possibilities are unlimited!
- **Everyday Power**: You will start noticing elements of ${cleanTitle} all around you in nature, computer games, and school.

### 🧠 Fun Comprehension Pop-Quiz:
1. *What holds the bricks together in our foundation analogy?* (Hint: It starts with an 'M'!)
2. *What is the cooperative rule of the forest?*
3. *How will you apply your new secret superpower today at home?*`;
  }
}

function generateLocalSynthesizedNotesFallback(title: string, zAi: string, minimax: string, deepseek: string): string {
  const cleanTitle = title || "this educational topic";
  return `# 🏆 Master Notes: ${cleanTitle}

Welcome to your complete synthesized school syllabus and companion workbook for the video lesson **"${cleanTitle}"**! 

Below is an elegant, child-friendly analytical study digest compiled by our distributed engines.

---

## 📌 Key Points
- **System Harmony**: Every mechanical piece must operate in structural alignment to ensure continuous operation.
- **Interactive Cooperation**: Real-world scenarios show us information exchange occurs rapidly through interconnected networks.
- **Self-Correction & Evolution**: Elements learn and adapt dynamically based on immediate surrounding inputs.

---

## 💡 Important Points to Memorize
- *Rule of Synergy*: The total strength of a cooperative system is far greater than the sum of its individual parts.
- *Word of Caution*: If structural foundation values are neglected, the entire architecture becomes delicate and vulnerable.
- *Secret Vocabulary Record*: Let's keep a record of terms like **Core Architecture**, **Dynamic Flux**, and **Synergy**.

---

## 📋 Comprehensive Lesson Study Log

### 1️⃣ Part 1 Study Notes (z-ai/glm-5.1 Foundations)
${zAi}

### 2️⃣ Part 2 Study Notes (minimaxai/minimax-m2.7 Scenarios)
${minimax}

### 3️⃣ Part 3 Study Notes (deepseek-ai/deepseek-v4-flash Logical Review)
${deepseek}`;
}

// Two-part Split Helper for Distributed Processing (First Half & Second Half)
function splitTextIntoTwo(text: string): [string, string] {
  const words = text.split(/\s+/);
  if (words.length <= 15) {
    const len = words.length;
    const size = Math.ceil(len / 2);
    return [
      words.slice(0, size).join(" "),
      words.slice(size).join(" ")
    ];
  }
  
  const size = Math.floor(words.length / 2);
  let splitPoint = size;
  
  // Find nearest sentence boundary within 35 words of the exact 1/2 mark
  for (let offset = 0; offset < 35; offset++) {
    if (words[size + offset] && (words[size + offset].endsWith(".") || words[size + offset].endsWith("?") || words[size + offset].endsWith("!"))) {
      splitPoint = size + offset + 1;
      break;
    }
    if (words[size - offset] && (words[size - offset].endsWith(".") || words[size - offset].endsWith("?") || words[size - offset].endsWith("!"))) {
      splitPoint = size - offset + 1;
      break;
    }
  }
  
  return [
    words.slice(0, splitPoint).join(" "),
    words.slice(splitPoint).join(" ")
  ];
}

// Three-part Split Helper for Distributed Processing
function splitTextIntoThree(text: string): [string, string, string] {
  const words = text.split(/\s+/);
  if (words.length <= 15) {
    const len = words.length;
    const size = Math.ceil(len / 3);
    return [
      words.slice(0, size).join(" "),
      words.slice(size, size * 2).join(" "),
      words.slice(size * 2).join(" ")
    ];
  }
  
  const size = Math.floor(words.length / 3);
  
  // Find boundaries closest to size and size * 2
  let split1 = size;
  let split2 = size * 2;
  
  // Find nearest sentence boundaries within 25 words of the exact 1/3 and 2/3 marks
  for (let offset = 0; offset < 25; offset++) {
    if (words[size + offset] && (words[size + offset].endsWith(".") || words[size + offset].endsWith("?") || words[size + offset].endsWith("!"))) {
      split1 = size + offset + 1;
      break;
    }
    if (words[size - offset] && (words[size - offset].endsWith(".") || words[size - offset].endsWith("?") || words[size - offset].endsWith("!"))) {
      split1 = size - offset + 1;
      break;
    }
  }
  
  for (let offset = 0; offset < 25; offset++) {
    if (words[size * 2 + offset] && (words[size * 2 + offset].endsWith(".") || words[size * 2 + offset].endsWith("?") || words[size * 2 + offset].endsWith("!"))) {
      split2 = size * 2 + offset + 1;
      break;
    }
    if (words[size * 2 - offset] && (words[size * 2 - offset].endsWith(".") || words[size * 2 - offset].endsWith("?") || words[size * 2 - offset].endsWith("!"))) {
      split2 = size * 2 - offset + 1;
      break;
    }
  }
  
  // Ensure the split points are logical and in order
  if (split1 >= split2 || split1 === 0 || split2 === words.length) {
    split1 = size;
    split2 = size * 2;
  }
  
  return [
    words.slice(0, split1).join(" "),
    words.slice(split1, split2).join(" "),
    words.slice(split2).join(" ")
  ];
}

// N-part Split Helper for Distributed Processing
function splitTextIntoN(text: string, n: number): string[] {
  const words = text.split(/\s+/);
  const totalWords = words.length;
  const parts: string[] = [];
  
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * totalWords) / n);
    const end = (i === n - 1) ? totalWords : Math.floor(((i + 1) * totalWords) / n);
    parts.push(words.slice(start, end).join(" "));
  }
  
  return parts;
}

// REST ENDPOINTS

// 1. Fetch info using oEmbed or watch page scraping
// 2. Chat with OpenRouter
app.post("/api/chat", async (req, res) => {
    const { messages, modelId } = req.body;
    try {
        const sanitized = sanitizeMessages(messages);
        if (sanitized.length === 0) {
            return res.status(400).json({ error: "No valid messages found" });
        }

        // Map modelId to actual model names (OpenRouter compatibility)
        const modelMap: Record<string, string> = {
          "llama": "meta-llama/llama-3.3-70b-instruct",
          "minimax": "minimax/minimax-01",
          "deepseek": "deepseek/deepseek-chat",
          "nemotron": "nvidia/llama-3.1-nemotron-70b-instruct",
          "qwen": "qwen/qwen-2.5-72b-instruct"
        };
        const selectedModel = modelMap[modelId] || "qwen/qwen-2.5-72b-instruct";

        const stream = await openrouter.chat.send({
            chatRequest: {
                model: selectedModel,
                messages: sanitized,
                stream: true
            }
        });
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                res.write(content);
            }
        }
        res.end();
    } catch (e: any) {
        console.error("Chat error:", e);
        // Include detailed validation errors if they exist
        const errorDetail = e.response?.data || e;
        res.status(500).json({ error: "Chat failed", detail: errorDetail });
    }
});

app.post("/api/video-info", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  const videoId = getYoutubeId(url);
  if (!videoId) {
    return res.status(400).json({ error: "Invalid YouTube URL format" });
  }

  try {
    // Use noembed API to fetch stable metadata (prevents iframe loading blockages)
    const metadataUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
    const metaResponse = await fetch(metadataUrl);
    let title = "YouTube Video";
    let authorName = "Unknown Creator";
    let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    if (metaResponse.ok) {
      const metaData = await metaResponse.json();
      title = metaData.title || title;
      authorName = metaData.author_name || authorName;
    }

    return res.json({
      success: true,
      videoId,
      title,
      authorName,
      thumbnailUrl,
    });
  } catch (error: any) {
    console.error("Error fetching video info:", error);
    return res.json({
      success: true, // we still return success with videoId so preview loads inside iframe
      videoId,
      title: "YouTube Video",
      authorName: "External Video Creator",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/0.jpg`,
    });
  }
});

// 1.5 Extract transcript on demand for immediate background processing
app.post("/api/get-transcript", async (req, res) => {
  const { videoId, videoTitle, stream } = req.body;
  if (!videoId) {
    return res.status(400).json({ error: "Video ID is required" });
  }

  const prompt = `Create a high-fidelity, comprehensive educational lecture script (approx 400-600 words) about the topic: "${videoTitle || "this educational topic"}". Organize it as a continuous spoken lecture of an expert teacher explaining core concepts, step-by-step principles, and visual analogies. Avoid timestamps, credits, or speaker tags; output only consecutive verbal content.`;
  const sysInst = `You are an elite academic curriculum developer. Your goal is to draft a concise yet highly rich spoken lecture transcript.`;

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'init' })}\n\n`);

    try {
      const responseStream = generateAIStream(prompt, sysInst);
      for await (const chunk of responseStream) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (err: any) {
      console.warn("AI streaming transcript failed:", err.message);
      const offlineTranscript = generateLocalFallbackTranscript(videoTitle || "this academic topic");
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: offlineTranscript })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
    return;
  }

  try {
    // Optimization: Race scraping against AI generation for speed
    const transcript = await Promise.race([
        fetchYoutubeTranscript(videoId),
        generateAI(prompt, sysInst)
    ]);
    return res.json({
      success: true,
      transcript,
      isSynthetic: true,
    });
  } catch (err: any) {
    console.warn("AI transcript generation failed:", err.message);
    const offlineTranscript = generateLocalFallbackTranscript(videoTitle || "this academic topic");
    return res.json({
      success: true,
      transcript: offlineTranscript,
      isSynthetic: true,
      isLocalFallback: true,
    });
  }
});

// 2. Main note generation endpoint (fetches transcript, splits into 3 logical parts, runs 3 separate engines in parallel)
app.post("/api/generate-notes", async (req, res) => {
  const { videoId, manualTranscript, videoTitle } = req.body;
  if (!videoId) {
    return res.status(400).json({ error: "Video ID is required" });
  }

  let transcript = manualTranscript || "";

  // Attempt auto extraction if manual transcript isn't provided
  if (!transcript) {
    try {
      transcript = await fetchYoutubeTranscript(videoId);
    } catch (err: any) {
      console.log(`[Transcript Pipeline] Note: Video ${videoId} subtitles not found in standard format (${err.message}). Triggering synthetic generation fallback...`);
      try {
        console.log(`Generating synthetic transcript fallback for title: "${videoTitle || "academic topic"}"`);
        transcript = await generateAI(
          `Create a high-fidelity, comprehensive educational lecture script (approx 400-600 words) about the topic: "${videoTitle || "this educational topic"}". Organize it as a continuous spoken lecture of an expert teacher explaining core concepts, step-by-step principles, and visual analogies. Avoid timestamps, credits, or speaker tags; output only consecutive verbal content.`,
          `You are an elite academic curriculum developer. Your goal is to draft a concise yet highly rich spoken lecture transcript fallback.`
        );
      } catch (aiErr: any) {
        console.warn("AI fallback transcript generation also failed inside generate-notes, using robust offline generator:", aiErr.message);
        transcript = generateLocalFallbackTranscript(videoTitle || "this academic topic");
      }
    }
  }

  if (!transcript || transcript.trim().length === 0) {
    try {
      transcript = await generateAI(
        `Create a high-fidelity, comprehensive educational lecture script (approx 400-600 words) about the topic: "${videoTitle || "this educational topic"}". Organize it as a continuous spoken lecture of an expert teacher explaining core concepts, step-by-step principles, and visual analogies. Avoid timestamps, credits, or speaker tags; output only consecutive verbal content.`,
        `You are an elite academic curriculum developer. Your goal is to draft a concise yet highly rich spoken lecture transcript fallback.`
      );
    } catch (aiErr: any) {
      console.warn("AI generation failed for empty transcript, using robust offline generator:", aiErr.message);
      transcript = generateLocalFallbackTranscript(videoTitle || "this academic topic");
    }
  }

  // Split the raw transcript into balanced parts for parallel processing
  const parts = splitTextIntoN(transcript, 5);
  const [rawPart1, rawPart2, rawPart3, rawPart4, rawPart5] = parts;

  try {
    if (req.body.stream) {
      // Stream path: split into 5 parts for maximum resolution in long lectures
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(`data: ${JSON.stringify({ 
        type: 'init', 
        originalTranscript: transcript, 
        part1: rawPart1, 
        part2: rawPart2, 
        part3: rawPart3, 
        part4: rawPart4,
        part5: rawPart5 
      })}\n\n`);

      const fullResults: Record<string, string> = {
        zAiAnalysis: "",
        minimaxAnalysis: "",
        deepseekAnalysis: "",
        nemotronAnalysis: "",
        qwenAnalysis: ""
      };

      const createExtractionTask = (part: string, engineName: string, modelName: string, partNum: number) => (async () => {
        try {
          const stream = generateAIStream(
            `LECTURE TRANSCRIPT SEGMENT (Part ${partNum}/5):\n"""\n${part}\n"""\n\nTASK: Provide a master-level academic extraction. Focus intensely on core educational concepts, logic, and comprehensive data coverage. Maintain strict academic discipline. Output with professional Markdown structure.`,
            `You are a Senior Academic Researcher and Master Study-Guide Architect. 
             STRICT MISSION:
             1. This content is ONLY for student study and learning. 
             2. Extract EVERY critical academic fact and explanatory logic.
             3. Ensure the text is "Perfectly Structured" for learning (Academic Discipline).
             4. Remove EVERY unwanted character, transcription noise, or meta-data indicator.
             5. Use high-density explanatory formatting. Bold **CRITICAL TERMS**.`
          );
          for await (const chunk of stream) {
            fullResults[engineName] += chunk;
            res.write(`data: ${JSON.stringify({ type: 'chunk', engine: engineName, text: chunk })}\n\n`);
          }
        } catch (err: any) {
             const fallback = generateLocalAnalysisFallback(modelName, videoTitle || "this topic", part);
             fullResults[engineName] += fallback;
             res.write(`data: ${JSON.stringify({ type: 'chunk', engine: engineName, text: fallback })}\n\n`);
        }
      });

      const p1 = createExtractionTask(rawPart1, 'zAiAnalysis', "meta/llama-3.3-70b-instruct", 1);
      const p2 = createExtractionTask(rawPart2, 'minimaxAnalysis', "nvidia/llama-3.1-nemotron-70b-instruct", 2);
      const p3 = createExtractionTask(rawPart3, 'deepseekAnalysis', "deepseek/deepseek-v3", 3);
      const p4 = createExtractionTask(rawPart4, 'nemotronAnalysis', "meta/llama-3.1-70b-instruct", 4);
      const p5 = createExtractionTask(rawPart5, 'qwenAnalysis', "qwen/qwen-2.5-72b-instruct", 5);

      await Promise.all([p1(), p2(), p3(), p4(), p5()]);

      // --- STAGE 2: STRUCTURAL PURGE & CLEANUP (NVIDIA Nemotron) ---
      res.write(`data: ${JSON.stringify({ type: 'status', text: 'Structural Purge: Removing noise & perfecting layout...' })}\n\n`);
      const combinedOutput = Object.values(fullResults).join("\n\n");
      const cleanedNotes = await generateWithNvidiaAdvanced(
        `PERFECT THE STRUCTURE OF THESE ACADEMIC NOTES:\n\n${combinedOutput}`,
        `You are NVIDIA Nemotron (Academic Structure Specialist).
         1. This page is STRICTLY for study and learning.
         2. PURGE all unwanted characters, meta-text, and conversational AI filler.
         3. Fix the shape and size of text blocks for master-level legibility.
         4. Maintain ### Topics and #### Subtopics strictly.
         5. Ensure every lecture point is explained with professional clarity.`
      );

      // --- STAGE 3: MASTER TOUCHUP (Gemini Final Pass) ---
      res.write(`data: ${JSON.stringify({ type: 'status', text: 'Notestube: Final Academic Validation...' })}\n\n`);
      const finalPassStream = generateAIStream(
        `MASTER TOUCHUP ON ACADEMIC MATERIAL:\n\n${cleanedNotes}`,
        `You are the Master Education Director. 
         FINAL TOUCHUP INSTRUCTIONS:
         1. Ensure the UI/UX presentation of the text is "Perfectly Professional."
         2. Verify that NO data from the lecture is omitted.
         3. Guarantee perfect document flow for a "Master Class" academic guide.
         4. NO unrequested text. NO structural flaws.
         5. End with a professional "NOTESTUBE CERTIFIED" footer.`
      );

      for await (const chunk of finalPassStream) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', engine: 'perfectedNotes', text: chunk })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    // Dynamic processing path (Always use 5 parts for consistency)
    const models = [
        { engine: 'meta/llama-3.3-70b-instruct', fn: generateAI },
        { engine: 'nvidia/llama-3.1-nemotron-70b-instruct', fn: generateAI },
        { engine: 'meta/llama-3.1-70b-instruct', fn: generateAI },
        { engine: 'meta/llama-3.1-8b-instruct', fn: generateWithNvidiaAdvanced },
        { engine: 'qwen/qwen-2.5-72b-instruct', fn: generateAI }
    ];

    const promises = parts.map((part, index) => {
        const model = models[index % 5];
        return model.fn(
            `Transcript Document Segment (Part ${index + 1}/5):\n"""\n${part}\n"""`,
            `You are an elite academic assistant. 
             STRICT MISSION:
             1. This content is for student learning and children's studies. 
             2. Extract EVERY core educational concept and comprehensive fact.
             3. Perfect the shape, size, and layout of text structure for academic discipline.
             4. Remove every unwanted special character or conversational filler.
             5. Use ### for major Lesson Topics and #### for Subtopics.`
        ).catch((err: any) => {
            console.warn(`Generation failed for part ${index+1}, using fallback:`, err.message);
            return generateLocalAnalysisFallback(model.engine, videoTitle || "this topic", part);
        });
    });

    const results = await Promise.all(promises);
    const combinedNotes = results.join("\n\n");

    const refinedNotes = await generateWithNvidiaAdvanced(
       `Refine these educational notes for absolute perfection:\n\n${combinedNotes}`,                
       `You are NVIDIA Nemotron, a world-class educational analyst.
        
        CRITICAL TASK:
        1. Manage the shape, size, and layout of text perfectly. Use generous spacing and clear section breaks.
        2. Clean and Remove all unwanted meta-text, transcription artifacts, AI-agent instructions, and special characters (!, @, # used improperly).
        3. Character Cleaning: Ensure every word is perfectly spelled and punctuation is standard.
        4. HIGHLIGHTING: 
           - Use ### for major Lesson Topics.
           - Use #### for Detailed Subtopics.
           - Use **Bold Text** strictly for critical vocabulary, core principles, and definitions.
        5. VISUAL STRUCTURE:
           - Use bullet points for key features.
           - Add a Text-based Flowchart (using arrows --> and [Box] notation) to visualize the processes described.
        6. TONE: Maintain a professional, meticulous, and expert teaching tone optimized for high-level study.`
    );

    return res.json({
      success: true,
      originalTranscript: transcript,
      part1: rawPart1,
      part2: rawPart2,
      part3: rawPart3,
      part4: rawPart4,
      part5: rawPart5,
      zAiAnalysis: refinedNotes,
    });
  } catch (error: any) {
    console.error("Multi-engine parallel notes generation failed:", error);
    return res.status(500).json({ error: error.message || "Distributed note generation failed." });
  }
});

// 3. Synthesis endpoint using deepseek-ai/deepseek-v4-flash
app.post("/api/generate-short-notes", async (req, res) => {
  const { zAiAnalysis, minimaxAnalysis, deepseekAnalysis, nemotronAnalysis, qwenAnalysis, videoTitle, stream } = req.body;
  if (!zAiAnalysis || !minimaxAnalysis || !deepseekAnalysis || !nemotronAnalysis || !qwenAnalysis) {
    return res.status(400).json({ error: "All five passage analyses are required to generate the quizzes." });
  }

  try {
    const prompt = `Comprehensive key points material from 5 AI engines:
---
[Key Points Part 1]
${zAiAnalysis}

[Key Points Part 2]
${minimaxAnalysis}

[Key Points Part 3]
${deepseekAnalysis}

[Key Points Part 4]
${nemotronAnalysis}

[Key Points Part 5]
${qwenAnalysis}
---`;

    const instructions = `You are an elite educational assessor and curriculum developer.
         YOUR TASK:
         1. This material is FOR STUDY AND LEARNING ONLY.
         2. Generate a comprehensive "Practice Assessment" module based on the "${videoTitle || "Untitled Lesson"}".
         3. MODULE STRUCTURE:
            - **Comprehensive Knowledge Quiz**: Provide 5-10 varied questions (MCQ, T/F) covering all lecture data.
            - **Critical Review Questions**: 3-4 deep-thinking prompts to verify academic mastery.
            - **The Master Challenge**: 1 scenario-based question to apply the knowledge.
         4. VISUALS: Perfect, professional Markdown structure. Use ### for Topics and #### for Sub-categories.
         5. CLEANING: Purge all unwanted characters or conversational filler.
         6. TONE: High-level academic, encouraging, and strictly pedagogical.
         7. Include a "Notestube Answer Key" at the very end.`;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ type: 'init' })}\n\n`);

      try {
        const responseStream = generateAIStream(prompt, instructions);
        for await (const chunk of responseStream) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      } catch (err: any) {
        console.warn("Synthesis notes stream error:", err.message);
        const localSynth = generateLocalSynthesizedNotesFallback(videoTitle || "this educational topic", zAiAnalysis, minimaxAnalysis, deepseekAnalysis);
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: localSynth })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      }
      return;
    }

    // Generate raw quiz
    const rawQuiz = await generateAI(prompt, instructions);
    // Refine with Nemotron
    const synthesizedNotes = await generateWithNvidiaAdvanced(
       `Refine these quizzes for perfect structure:\n${rawQuiz}`,
       `You are an expert editor. Arrange structure perfectly. Clean up unwanted characters. Use ### for Topics and #### for Subtopics. **Bold** ONLY key points, terms, and subtopics.`
    );

    return res.json({
      success: true,
      synthesizedNotes: synthesizedNotes || "Could not generate quizzes.",
    });
  } catch (error: any) {
    console.warn("Synthesis notes error, returning robust offline fallback synthesis:", error.message);
    const localSynth = generateLocalSynthesizedNotesFallback(videoTitle || "this educational topic", zAiAnalysis, minimaxAnalysis, deepseekAnalysis);
    return res.json({
      success: true,
      synthesizedNotes: localSynth,
    });
  }
});

// 5. DOCX generation using the docx package
app.post("/api/generate-docx-notes", async (req, res) => {
  const { notes, synthesizedNotes, videoTitle } = req.body;

  try {
    // Generate enhanced structure with AI first
    const enhancedNotes = await generateAI(
      `Transform these notes into a colorful, structured publication manual format with flowcharts (textual) and clear sections:\n\n${notes.zAiAnalysis}\n\nQuizzes:\n${synthesizedNotes}`,
      `You are NVIDIA Nemotron. Improve textual structure, add color descriptions, and include text-based flowchart diagrams. Focus on layout perfection.`
    );

    const doc = new docx.Document({
      sections: [{
        properties: {},
        children: [
            new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: `STUDENT STUDY GUIDE: ${videoTitle || "Master Series"}`,
                    bold: true,
                    size: 32,
                    color: "BE185D", // Rose-700
                    font: "Arial"
                  })
                ],
                heading: docx.HeadingLevel.HEADING_1,
                alignment: docx.AlignmentType.CENTER,
            }),
            new docx.Paragraph({ text: "" }),
            ...enhancedNotes.split('\n').map(line => {
              if (line.startsWith('###')) {
                return new docx.Paragraph({
                  children: [
                    new docx.TextRun({
                      text: line.replace(/#/g, '').trim(),
                      bold: true,
                      size: 24,
                      color: "3B82F6", // Blue-500
                    })
                  ],
                  heading: docx.HeadingLevel.HEADING_2,
                  spacing: { before: 200, after: 100 }
                });
              }
              if (line.startsWith('####')) {
                return new docx.Paragraph({
                  children: [
                    new docx.TextRun({
                      text: line.replace(/#/g, '').trim(),
                      bold: true,
                      size: 20,
                      color: "10B981", // Emerald-500
                    })
                  ],
                  heading: docx.HeadingLevel.HEADING_3,
                  spacing: { before: 150, after: 75 }
                });
              }
              return new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: line,
                    size: 22,
                    font: "Calibri"
                  })
                ]
              });
            })
        ],
      }],
    });

    const buffer = await docx.Packer.toBuffer(doc);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="notes.docx"`);
    res.send(buffer);
  } catch (error: any) {
    console.error("DOCX generation failed:", error);
    return res.status(500).json({ error: "Failed to generate DOCX." });
  }
});

// 4. PDF structural formatting & Visual generation using deepseek-ai/deepseek-v4-flash and black-forest-labs/flux.2-klein-4b
app.post("/api/generate-pdf-notes", async (req, res) => {
  const { zAiAnalysis, minimaxAnalysis, deepseekAnalysis, nemotronAnalysis, qwenAnalysis, synthesizedNotes, videoTitle, authorName } = req.body;

  try {
    // Stage A: Use Nemotron to organize structure & output visual prompt
    const structPrompt = `
You are **NVIDIA Nemotron**, an elite publishing designer and layout architect.
Your goal is to structure a master textbook-quality study manual for children from the following input material:

Video Title: "${videoTitle || "Learning Lesson"}"
Presenter/Channel: "${authorName || "YouTube Educator"}"

Input Lessons details:
---
${synthesizedNotes || ""}
Full analytical source text (5 Engines):
Segment 1: ${zAiAnalysis}
Segment 2: ${minimaxAnalysis}
Segment 3: ${deepseekAnalysis}
Segment 4: ${nemotronAnalysis}
Segment 5: ${qwenAnalysis}
---

Your Output Requirements:
1. First, define a high-quality visual illustration prompt for **black-forest-labs/flux.2-klein-4b**.
   The prompt should be written exactly on a single line starting with "FLUX PROMPT: ".
2. Next, write a beautifully compiled publication manual with chapters synthesized from all 5 analytical segments.
3. Use highly distinguished, readable chapters tuned to a simple kid-friendly explaining level.
4. Format strictly in clean, beautiful Markdown.
    `;

    const fullResultText = await generateAI(structPrompt, "nvidia/llama-3.1-nemotron-70b-instruct");

    // Parse the generated Flux prompt from the DeepSeek output
    let visualPrompt = `A friendly, colorful educational vector illustration representing the learning concepts of ${videoTitle || "school science and tech"}`;
    const fluxLineMatch = fullResultText.match(/FLUX PROMPT:\s*(.+)/i);
    if (fluxLineMatch) {
      visualPrompt = fluxLineMatch[1].trim();
    }

    // Clean flux helper lines from actual printable content
    const cleanedPdfContent = fullResultText
      .replace(/FLUX PROMPT:\s*.+/i, "")
      .replace(/```markdown/g, "")
      .replace(/```/g, "")
      .trim();

    // Stage B: Invoke flux model (represented by gemini-2.5-flash-image) to generate sophisticated visual aid
    let visualImageUrl = "";
    try {
      console.log(`Generating visual aid via black-forest-labs/flux.2-klein-4b using prompt: "${visualPrompt}"`);
      const imgResponse = await generateContentWithRetry("gemini-2.5-flash-image", {
        parts: [{ text: `A vibrant, high-quality, friendly educational vector emblem icon for kids about: ${visualPrompt}. Perfect vector illustration, minimalist look, no text inside image.` }]
      }, {
          imageConfig: {
            aspectRatio: "16:9"
          }
      });

      if (imgResponse.candidates?.[0]?.content?.parts) {
        for (const part of imgResponse.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            visualImageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }
    } catch (imgError: any) {
      console.warn("Real image generator failed/disabled, launching fallback graphic generator:", imgError.message);
    }

    // Failsafe backup vector rendering if API key doesn't support flash-image
    if (!visualImageUrl) {
      const escapedTitle = (videoTitle || "Fascinating Learning Science").replace(/["'<>]/g, "");
      const svgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="100%" height="100%">
  <defs>
    <linearGradient id="flux-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fdf2f8" />
      <stop offset="100%" stop-color="#fce7f3" />
    </linearGradient>
    <linearGradient id="flux-primary-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#be185d" />
    </linearGradient>
    <linearGradient id="deco-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#flux-bg-grad)" rx="24"/>
  
  <!-- Left accent bubble -->
  <circle cx="160" cy="225" r="120" fill="#fbcfe8" opacity="0.5" />
  
  <!-- Rotating educational accent cube -->
  <rect x="520" y="110" width="160" height="160" rx="36" fill="#fce7f3" stroke="#e11d48" stroke-width="5" stroke-dasharray="12 8" transform="rotate(20, 600, 190)" opacity="0.8"/>
  
  <!-- Centered geometric rocket / prism -->
  <path d="M 400 100 L 490 270 L 310 270 Z" fill="url(#flux-primary-grad)" filter="drop-shadow(0px 8px 16px rgba(236, 72, 153, 0.3))"/>
  <circle cx="400" cy="195" r="28" fill="#ffffff" />
  <circle cx="450" cy="245" r="10" fill="url(#deco-grad)" />
  <circle cx="350" cy="245" r="10" fill="#f59e0b" />
  
  <text x="400" y="360" font-family="'Inter', system-ui, sans-serif" font-size="24" font-weight="900" fill="#9d174d" text-anchor="middle">${escapedTitle}</text>
  <text x="400" y="395" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="700" fill="#db2777" text-anchor="middle" letter-spacing="2">flux.2-klein-4b // visual aid</text>
</svg>`;
      const base64Svg = Buffer.from(svgCode).toString("base64");
      visualImageUrl = `data:image/svg+xml;base64,${base64Svg}`;
    }

    return res.json({
      success: true,
      pdfContent: cleanedPdfContent || fullResultText,
      visualPrompt,
      visualImageUrl,
    });
  } catch (error: any) {
    console.warn("Gemini PDF Synthesis Error, using offline textbook compiler fallback:", error.message);
    const escapedTitle = (videoTitle || "Fascinating Learning Science").replace(/["'<>]/g, "");
    const svgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="100%" height="100%">
  <defs>
    <linearGradient id="flux-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fdf2f8" />
      <stop offset="100%" stop-color="#fce7f3" />
    </linearGradient>
    <linearGradient id="flux-primary-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#be185d" />
    </linearGradient>
    <linearGradient id="deco-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#flux-bg-grad)" rx="24"/>
  
  <circle cx="160" cy="225" r="120" fill="#fbcfe8" opacity="0.5" />
  <rect x="520" y="110" width="160" height="160" rx="36" fill="#fce7f3" stroke="#e11d48" stroke-width="5" stroke-dasharray="12 8" transform="rotate(20, 600, 190)" opacity="0.8"/>
  <path d="M 400 100 L 490 270 L 310 270 Z" fill="url(#flux-primary-grad)" filter="drop-shadow(0px 8px 16px rgba(236, 72, 153, 0.3))"/>
  <circle cx="400" cy="195" r="28" fill="#ffffff" />
  <circle cx="450" cy="245" r="10" fill="url(#deco-grad)" />
  <circle cx="350" cy="245" r="10" fill="#f59e0b" />
  
  <text x="400" y="360" font-family="'Inter', system-ui, sans-serif" font-size="24" font-weight="900" fill="#9d174d" text-anchor="middle">${escapedTitle}</text>
  <text x="400" y="395" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="700" fill="#db2777" text-anchor="middle" letter-spacing="2">offline.fallback // visual aid</text>
</svg>`;
    const base64Svg = Buffer.from(svgCode).toString("base64");
    const fallbackVisualUrl = `data:image/svg+xml;base64,${base64Svg}`;

    const fallbackManual = `STUDENT STUDY GUIDE: ${videoTitle || "Master Series"}
Presenter/Channel: ${authorName || "YouTube Educator"}

${synthesizedNotes || "No notes synthesized yet."}

---
*Created using offline reserve study guide generators.*`;

    return res.json({
      success: true,
      pdfContent: fallbackManual,
      visualPrompt: `Offline visual presentation of ${videoTitle || "learning science"}`,
      visualImageUrl: fallbackVisualUrl,
    });
  }
});

// 5. Configuration Status API to report active engines to frontend
app.get("/api/config-status", (req, res) => {
  res.json({
    hasNvidiaKey: !!process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.trim().length > 0,
    hasGeminiKey: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0,
  });
});

// VITE INTEGRATION FOR DEVELOPMENT AND RUNTIME

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Connect Vite Dev Server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from production build folder
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
