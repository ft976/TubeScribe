import React, { useState, useEffect } from "react";
import {
  Youtube,
  Sparkles,
  ArrowRight,
  BookOpen,
  Zap,
  RotateCcw,
  Heading,
  Check,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  FileCheck2,
  FileText,
  User,
  ShieldCheck,
  Award,
  MessageSquare,
  MessageCircle,
  Library,
  X
} from "lucide-react";
import Header from "./components/Header";
import VideoPlayerCard from "./components/VideoPlayerCard";
import TranscriptEditor from "./components/TranscriptEditor";
import MarkdownView from "./components/MarkdownView";
import PdfPreviewModal from "./components/PdfPreviewModal";
import ChatSidebar from "./components/ChatSidebar";
import { saveNoteToHistory } from "./lib/firebase";
import { AppStage, VideoMetadata, GeneratedNotes, ShortNotes, PdfDocument } from "./types";

export default function App() {
  const [stage, setStage] = useState<AppStage>(AppStage.INPUT);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // App state
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [notes, setNotes] = useState<GeneratedNotes | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shortNotes, setShortNotes] = useState<ShortNotes | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  
  // Caption background extraction states
  const [extractionStatus, setExtractionStatus] = useState<"idle" | "extracting" | "success" | "failed">("idle");
  const [extractedTranscript, setExtractedTranscript] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  
  // Transcript states
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [tempTranscriptInput, setTempTranscriptInput] = useState("");
  const [showManualInputFallback, setShowManualInputFallback] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [managerInitialTab, setManagerInitialTab] = useState<"sessions" | "history">("sessions");
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);

  // Active API engine status
  const [configStatus, setConfigStatus] = useState<{ hasNvidiaKey: boolean; hasGeminiKey: boolean }>({
    hasNvidiaKey: false,
    hasGeminiKey: false,
  });

  // Auto load check config status when mounting
  useEffect(() => {
    const fetchConfigStatus = async () => {
      try {
        const response = await fetch("/api/config-status");
        if (response.ok) {
          const data = await response.json();
          setConfigStatus(data);
        }
      } catch (err) {
        console.warn("Could not check config status:", err);
      }
    };
    fetchConfigStatus();
  }, []);

  const triggerBackgroundExtraction = async (videoId: string, videoTitle?: string) => {
    setExtractionStatus("extracting");
    setExtractionError(null);
    setExtractedTranscript("");
    setShowManualInputFallback(false);

    try {
      const response = await fetch("/api/get-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, videoTitle: videoTitle || metadata?.title, stream: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to retrieve captions.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Could not initialize stream reader");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let synthOutput = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          if (message.startsWith("data: ")) {
            const dataStr = message.slice(6);
            if (dataStr.trim() !== "[DONE]") {
              try {
                const data = JSON.parse(dataStr);
                if (data.type === "init") {
                  synthOutput = "";
                } else if (data.type === "chunk" && data.text) {
                  synthOutput += data.text;
                  setExtractedTranscript(synthOutput);
                } else if (data.type === "error") {
                  setExtractionError(data.error);
                } else if (data.type === "done") {
                  setExtractionStatus("success");
                }
              } catch(e) {}
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      setExtractionStatus("success");
    } catch (err: any) {
      console.error("Background transcript load error:", err);
      setExtractionStatus("failed");
      setExtractionError(err.message || "Failed to fetch automated captions.");
      setTempTranscriptInput("");
    }
  };

  const handleFetchMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) return;

    setIsLoading(true);
    setErrorMsg(null);
    setShowManualInputFallback(false);

    try {
      const response = await fetch("/api/video-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to identify YouTube video properties.");
      }

      setMetadata({
        videoId: data.videoId,
        title: data.title,
        authorName: data.authorName,
        thumbnailUrl: data.thumbnailUrl,
      });

      // Automatically trigger caption download when metadata succeeds with video title passed for silent fallback synthesis
      setStage(AppStage.INPUT);
      triggerBackgroundExtraction(data.videoId, data.title);
    } catch (err: any) {
      setErrorMsg(err.message || "Network error. Please confirm your URL is accurate.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNotes = async (manualText?: string) => {
    if (!metadata) return;
    setIsLoading(true);
    setErrorMsg(null);

    setNotes({
      originalTranscript: "",
      part1: "",
      part2: "",
      part3: "",
      part4: "",
      part5: "",
      zAiAnalysis: "",
      minimaxAnalysis: "",
      deepseekAnalysis: "",
      nemotronAnalysis: "",
      qwenAnalysis: "",
      perfectedNotes: "",
    });
    setStatusMessage("Stage 1: Parallel AI Extractions...");
    setStage(AppStage.GENERATED_DETAIL);

    try {
      const response = await fetch("/api/generate-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream: true,
          videoId: metadata.videoId,
          videoTitle: metadata.title,
          manualTranscript: manualText || null,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to analyze transcript.");
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Could not initialize SSE reader stream");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          if (message.startsWith("data: ")) {
            const dataStr = message.slice(6);
            if (dataStr.trim() !== "[DONE]") {
                try {
                  const data = JSON.parse(dataStr);
                  if (data.error) {
                      throw new Error(data.error);
                  }
                  if (data.type === "init") {
                    setNotes((prev) => ({
                       ...(prev || {
                          zAiAnalysis: "",
                          minimaxAnalysis: "",
                          deepseekAnalysis: "",
                          nemotronAnalysis: "",
                          qwenAnalysis: "",
                          perfectedNotes: "",
                       }),
                       originalTranscript: data.originalTranscript || "",
                       part1: data.part1 || "",
                       part2: data.part2 || "",
                       part3: data.part3 || "",
                       part4: data.part4 || "",
                       part5: data.part5 || "",
                    }));
                  } else if (data.type === "status") {
                    setStatusMessage(data.text || data.message || "");
                  } else if (data.type === "chunk") {
                    setNotes((prev) => {
                       if (!prev) return prev;
                       return {
                         ...prev,
                         [data.engine]: (prev[data.engine as keyof typeof prev] || "") + data.text
                       };
                    });
                  } else if (data.type === "done") {
                    setStatusMessage(null);
                  }
                } catch(err) {
                    // Silent
                }
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }

    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected analytical failure occurred.");
      setStage(AppStage.INPUT);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateShortNotes = async () => {
    if (!notes) return;
    setIsLoading(true);
    setErrorMsg(null);
    setShortNotes({ synthesizedNotes: "" }); // initialize for stream
    setStage(AppStage.GENERATED_SHORT); // move stage ahead immediately so stream text shows

    try {
      const response = await fetch("/api/generate-short-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream: true,
          zAiAnalysis: notes.zAiAnalysis,
          minimaxAnalysis: notes.minimaxAnalysis,
          deepseekAnalysis: notes.deepseekAnalysis,
          nemotronAnalysis: notes.nemotronAnalysis,
          qwenAnalysis: notes.qwenAnalysis,
          videoTitle: metadata?.title,
        }),
      });

      if (!response.ok) {
        throw new Error("API stream generation failed.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Could not initialize SSE reader stream");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let synthOutput = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          if (message.startsWith("data: ")) {
            const dataStr = message.slice(6);
            if (dataStr.trim() !== "[DONE]") {
              try {
                const data = JSON.parse(dataStr);
                if (data.type === "init") {
                  synthOutput = "";
                } else if (data.type === "chunk" && data.text) {
                  synthOutput += data.text;
                  setShortNotes({ synthesizedNotes: synthOutput });
                } else if (data.type === "error") {
                  setErrorMsg(data.error || "Stream error.");
                } else if (data.type === "done") {
                  // Final completion
                }
              } catch(e) {}
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }

    } catch (err: any) {
      setErrorMsg(err.message || "Failed compiling condensed notes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePdfNotes = async () => {
    if (!notes || !shortNotes || !metadata) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/generate-pdf-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zAiAnalysis: notes.zAiAnalysis,
          minimaxAnalysis: notes.minimaxAnalysis,
          deepseekAnalysis: notes.deepseekAnalysis,
          nemotronAnalysis: notes.nemotronAnalysis,
          qwenAnalysis: notes.qwenAnalysis,
          synthesizedNotes: shortNotes.synthesizedNotes,
          videoTitle: metadata.title,
          authorName: metadata.authorName,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Synthesis models collapsed.");
      }

      setPdfDoc({
        pdfContent: data.pdfContent,
        visualPrompt: data.visualPrompt || "",
        visualImageUrl: data.visualImageUrl || "",
      });

      setStage(AppStage.PDF_COMPILED);
      setShowPdfModal(true);

      // Save to history (Local Persistence)
      const historyItem = {
        title: metadata.title,
        date: new Date().toLocaleDateString(),
        metadata,
        notes,
        shortNotes
      };

      saveNoteToHistory(null, historyItem);
    } catch (err: any) {
      setErrorMsg(err.message || "Professional PDF compilation had a fatal failure.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
      if (!notes || !shortNotes || !metadata) return;
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const response = await fetch("/api/generate-docx-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: notes,
            synthesizedNotes: shortNotes.synthesizedNotes,
            videoTitle: metadata.title,
          }),
        });

        if (!response.ok) {
          throw new Error("DOCX generation failed.");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "notes.docx";
        a.click();
        window.URL.revokeObjectURL(url);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to download DOCX.");
      } finally {
        setIsLoading(false);
      }
  };

  const handleSaveEditedTranscript = (newText: string) => {
    handleGenerateNotes(newText);
  };

  const resetAll = () => {
    setStage(AppStage.INPUT);
    setMetadata(null);
    setNotes(null);
    setShortNotes(null);
    setPdfDoc(null);
    setErrorMsg(null);
    setShowManualInputFallback(false);
    setExtractionStatus("idle");
    setExtractedTranscript(null);
    setExtractionError(null);
  };

  const handleSelectHistory = (item: any) => {
    setMetadata(item.metadata);
    setNotes(item.notes);
    setShortNotes(item.shortNotes);
    setStage(AppStage.GENERATED_SHORT);
    setIsHistoryVisible(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div id="app-root-viewport" className="min-h-screen bg-[#FDFDFD] text-zinc-800 flex font-sans selection:bg-rose-100">
      <div className="flex-1 flex flex-col">
        <Header 
          onReset={() => { resetAll(); setIsHistoryVisible(false); }} 
          showReset={stage !== AppStage.INPUT} 
          onOpenHistory={() => setIsHistoryVisible(!isHistoryVisible)}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-6 lg:px-8 py-6 sm:py-12">
        {isHistoryVisible ? (
          <div className="animate-in fade-in zoom-in-95 duration-500 min-h-[70vh]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
              <div>
                <h2 className="text-3xl font-serif font-bold text-zinc-950 tracking-tight">Academic Workspace</h2>
                <p className="text-sm text-zinc-500 mt-1">Manage your analytical conversations and saved syllabus library.</p>
              </div>
              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => setIsHistoryVisible(false)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-2xl transition-all uppercase tracking-wider"
                >
                  <X className="w-4 h-4" />
                  Close Manager
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-8">
              <div className="bg-white border-2 border-zinc-100 rounded-[32px] overflow-hidden shadow-2xl h-[700px] flex">
                <ChatSidebar 
                  mode="full" 
                  className="w-full h-full" 
                  onSelectHistory={handleSelectHistory}
                  initialTab={managerInitialTab}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* Step Progression Bar */}
        <div className="max-w-3xl mx-auto mb-6 sm:mb-10 select-none px-1">
          <div className="flex items-center justify-between text-[10px] sm:text-xs font-mono text-zinc-400 gap-x-2">
            <div className={`flex items-center whitespace-nowrap ${stage === AppStage.INPUT ? "text-rose-600 font-bold" : metadata ? "text-zinc-700" : ""}`}>
              <span className="sm:inline hidden mr-1">Step</span>1<span className="hidden sm:inline">: Sync</span>
            </div>
            <ChevronRight className={`w-3 h-3 shrink-0 ${metadata ? "text-rose-400" : "text-zinc-200"}`} />
            
            <div className={`flex items-center whitespace-nowrap ${stage === AppStage.GENERATED_DETAIL ? "text-rose-600 font-bold" : notes ? "text-zinc-700" : ""}`}>
              <span className="sm:inline hidden mr-1">Step</span>2<span className="hidden sm:inline">: Analysis</span>
            </div>
            <ChevronRight className={`w-3 h-3 shrink-0 ${notes ? "text-rose-400" : "text-zinc-200"}`} />

            <div className={`flex items-center whitespace-nowrap ${stage === AppStage.GENERATED_SHORT ? "text-rose-600 font-bold" : shortNotes ? "text-zinc-700" : ""}`}>
              <span className="sm:inline hidden mr-1">Step</span>3<span className="hidden sm:inline">: Quizzes</span>
            </div>
            <ChevronRight className={`w-3 h-3 shrink-0 ${shortNotes ? "text-rose-400" : "text-zinc-200"}`} />

            <div className={`flex items-center whitespace-nowrap ${stage === AppStage.PDF_COMPILED ? "text-rose-600 font-bold" : pdfDoc ? "text-zinc-700" : ""}`}>
              <span className="sm:inline hidden mr-1">Step</span>4<span className="hidden sm:inline">: PDF</span>
            </div>
          </div>
          
          <div className="w-full bg-zinc-100 h-1 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-rose-600 h-full transition-all duration-500 rounded-full"
              style={{
                width:
                  stage === AppStage.INPUT
                    ? metadata
                      ? "25%"
                      : "10%"
                    : stage === AppStage.GENERATED_DETAIL
                    ? "50%"
                    : stage === AppStage.GENERATED_SHORT
                    ? "75%"
                    : "100%",
              }}
            />
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="mb-8 max-w-4xl mx-auto border border-red-150 bg-red-50/50 p-4 rounded-xl flex items-start space-x-3 text-sm text-red-800 animate-shake">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">Process Interrupt</span>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Mobile Chat Toggle */}
        <div className="fixed bottom-6 right-6 z-[60] lg:hidden">
          <button 
            onClick={() => setShowMobileChat(true)}
            className="w-14 h-14 bg-zinc-950 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <MessageSquare className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Chat Drawer Overlay */}
        {showMobileChat && (
          <div className="fixed inset-0 z-[70] lg:hidden bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="absolute inset-y-0 right-0 w-[85%] max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
                <span className="font-bold text-sm tracking-tight">AI Academic Center</span>
                <button onClick={() => setShowMobileChat(false)} className="p-2 hover:bg-zinc-100 rounded-xl">
                   <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatSidebar 
                  mode="full" 
                  className="w-full h-full" 
                  onSelectHistory={(item) => {
                    handleSelectHistory(item);
                    setShowMobileChat(false);
                  }} 
                />
              </div>
            </div>
          </div>
        )}

            {/* STAGE 1: URL INPUT AREA */}
            {stage === AppStage.INPUT && !metadata && (
              <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto items-stretch overflow-hidden">
                <div className="flex-1 text-center py-4 sm:py-12 px-2">
              <div className="w-12 sm:w-14 h-12 sm:h-14 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mx-auto mb-6">
                <Youtube className="w-6 sm:w-7 h-6 sm:h-7" />
              </div>
              <h2 className="text-xl sm:text-3xl font-serif font-bold text-zinc-950 tracking-tight leading-tight mb-3">
                YouTube Notes AI Engine
              </h2>

              <p className="text-zinc-500 text-xs sm:text-sm max-w-sm mx-auto mb-8 px-4 sm:px-0">
                Analyze any YouTube video. Five expert AI engines generate high-density, professional study guides in parallel.
              </p>

              <form onSubmit={handleFetchMetadata} className="flex flex-col sm:flex-row gap-2 p-1.5 bg-white border border-zinc-200 shadow-sm rounded-xl sm:rounded-2xl focus-within:border-rose-450 transition-all max-w-xl mx-auto mb-6">
                <input
                  id="youtube-url-input"
                  type="text"
                  placeholder="Paste YouTube Link..."
                  required
                  className="flex-1 bg-transparent px-3 py-3 sm:py-0 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                <button
                  id="fetch-video-meta-button"
                  type="submit"
                  disabled={isLoading}
                  className="bg-zinc-950 hover:bg-zinc-850 disabled:bg-zinc-300 text-white font-bold text-xs py-4 sm:py-2.5 px-8 rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0 active:scale-95"
                >
                  {isLoading ? "Syncing..." : "Sync Video"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="text-[10px] sm:text-xs text-zinc-400 font-mono mt-2 select-none opacity-60">
                Supports: Shorts, Embeds, Lectures, & Podcasts.
              </div>

              {/* Quick Access Grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-6 mt-10 sm:mt-12 sm:max-w-xl mx-auto">
                <button 
                  onClick={() => {
                    setManagerInitialTab("sessions");
                    setIsHistoryVisible(true);
                  }}
                  className="group p-5 sm:p-7 bg-white border-2 border-zinc-100 rounded-[2rem] hover:border-zinc-950 shadow-sm hover:shadow-xl transition-all duration-300 text-left flex flex-col justify-between aspect-square active:scale-95"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-900 group-hover:bg-zinc-950 group-hover:text-white transition-colors duration-500 shadow-sm">
                    <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm sm:text-base text-zinc-950 leading-tight">AI Academic Workspace</h4>
                    <p className="text-[10px] sm:text-xs text-zinc-400 mt-1 font-medium sm:opacity-0 group-hover:opacity-100 transition-opacity">Discussion Core</p>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setManagerInitialTab("history");
                    setIsHistoryVisible(true);
                  }}
                  className="group p-5 sm:p-7 bg-white border-2 border-zinc-100 rounded-[2rem] hover:border-zinc-950 shadow-sm hover:shadow-xl transition-all duration-300 text-left flex flex-col justify-between aspect-square active:scale-95"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors duration-500 shadow-sm">
                    <Library className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm sm:text-base text-zinc-950 leading-tight">Mastery Lesson Library</h4>
                    <p className="text-[10px] sm:text-xs text-zinc-400 mt-1 font-medium sm:opacity-0 group-hover:opacity-100 transition-opacity">Stored Syllabus</p>
                  </div>
                </button>
              </div>
            </div>
            
            <div className="hidden lg:block w-80 h-[500px] border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-sm shrink-0">
               <ChatSidebar 
                  mode="full" 
                  className="w-full h-full" 
                  onSelectHistory={handleSelectHistory}
                  initialTab="history"
                />
            </div>
          </div>
        )}

        {/* METADATA PREVIEW / LOAD GENERATION STATE */}
        {metadata && (
          <div className="space-y-8 max-w-5xl mx-auto">
            {/* Display Visual Card */}
            <VideoPlayerCard metadata={metadata} />

            {stage === AppStage.INPUT && (
              <div id="extraction-status-banner" className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm transition-all duration-300">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 text-left">
                  <div className="flex items-start space-x-3.5">
                    <div className="relative shrink-0 mt-0.5">
                      {extractionStatus === "extracting" && (
                        <div className="absolute inset-0 bg-rose-500 rounded-xl animate-ping opacity-25" />
                      )}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border text-sm font-semibold transition-colors duration-300 ${
                        extractionStatus === "extracting" ? "bg-rose-50 border-rose-100 text-rose-600" :
                        extractionStatus === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                        extractionStatus === "failed" ? "bg-amber-50 border-amber-100 text-amber-600" :
                        "bg-zinc-50 border-zinc-200 text-zinc-400"
                      }`}>
                        {extractionStatus === "extracting" && (
                          <svg className="animate-spin h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        )}
                        {extractionStatus === "success" && <Check className="w-5 h-5 text-emerald-600" />}
                        {extractionStatus === "failed" && <AlertCircle className="w-5 h-5 text-amber-600" />}
                        {extractionStatus === "idle" && <Clock className="w-5 h-5" />}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-serif font-bold text-zinc-900 text-base leading-tight">
                        {extractionStatus === "extracting" && "Extracting Video Caption Stream (Ultra-Fast Parallel Mode)..."}
                        {extractionStatus === "success" && "Captions Extracted Successfully!"}
                        {extractionStatus === "failed" && "Captions Unavailable (Silent Fallback Active)"}
                        {extractionStatus === "idle" && "Ready to Extract Captions"}
                      </h4>
                      <p className="text-xs text-zinc-500 mt-1 max-w-xl leading-relaxed">
                        {extractionStatus === "extracting" && "Reading video captions and formatting sentences instantly in the background using concurrent racing scrapers..."}
                        {extractionStatus === "success" && `Successfully retrieved automatic transcript (${extractedTranscript ? extractedTranscript.split(/\s+/).length : 0} words parsed). All captions are saved. Tap 'Generate Notes' to process the entire transcript instantly into educational child-friendly lessons.`}
                        {extractionStatus === "failed" && `This video does not have searchable public captions. No worries! Click 'Generate Notes' to automatically synthesize a high-fidelity continuous lecture transcript in the background.`}
                        {extractionStatus === "idle" && "Preparing extraction engine..."}
                      </p>
                    </div>
                  </div>

                  <div className="w-full md:w-auto flex items-center gap-3 shrink-0">
                    <button
                      id="reset-notes-button"
                      onClick={resetAll}
                      className="w-full md:w-auto text-xs px-4 py-2.5 rounded-lg text-zinc-655 bg-zinc-50 border border-zinc-200 font-semibold hover:bg-zinc-100 transition-colors cursor-pointer"
                    >
                      Reset Video
                    </button>
                    
                    <button
                      id="initiate-generation-button"
                      onClick={() => handleGenerateNotes(extractedTranscript || undefined)}
                      disabled={isLoading || extractionStatus === "extracting"}
                      className="w-full md:w-auto bg-rose-600 hover:bg-rose-750 disabled:bg-zinc-100 disabled:text-zinc-400 select-none text-white font-bold text-xs py-2.5 px-5 rounded-lg flex items-center justify-center space-x-1.5 cursor-pointer transition-all shadow-sm active:scale-98 border border-rose-700/10"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {isLoading ? "Analyzing..." : 
                         extractionStatus === "extracting" ? "Extracting..." : "Generate Notes"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Animated progress bar for Extraction */}
                {extractionStatus === "extracting" && (
                  <div className="w-full bg-zinc-100 h-1 rounded-full mt-4 overflow-hidden">
                    <div className="bg-rose-500 h-full rounded-full animate-pulse" style={{ width: "70%" }} />
                  </div>
                )}
              </div>
            )}


            {/* STAGE 2: DETAILED SIDE-BY-SIDE PANELS (3 Engines) */}
            {stage !== AppStage.INPUT && notes && (
              <div className={`space-y-6 sm:space-y-8 max-w-full overflow-hidden ${isChatFullscreen ? 'fixed inset-0 z-[100] bg-white p-4 h-screen' : ''}`}>
                {isChatFullscreen && (
                  <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-4">
                     <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-rose-600" />
                        <h3 className="font-bold text-lg">AI Academic Workspace</h3>
                     </div>
                     <button 
                       onClick={() => setIsChatFullscreen(false)}
                       className="p-2 h-10 w-10 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-full transition-all"
                     >
                       <X className="w-5 h-5 text-zinc-600" />
                     </button>
                  </div>
                )}

                {/* Chat at the top of notes */}
                <div className={`${isChatFullscreen ? 'h-[calc(100vh-120px)] shadow-2xl' : 'h-64 sm:h-80 shadow-sm'} bg-white border border-zinc-200 rounded-2xl overflow-hidden transition-all duration-500`}>
                   <ChatSidebar 
                     mode="chat-only" 
                     className="w-full h-full" 
                   />
                   {!isChatFullscreen && (
                     <button 
                       onClick={() => setIsChatFullscreen(true)}
                       className="absolute top-3 right-3 p-1.5 bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-lg text-zinc-400 hover:text-rose-600 transition-colors z-10"
                     >
                       <ExternalLink className="w-3.5 h-3.5" />
                     </button>
                   )}
                </div>

                {!isChatFullscreen && (
                  <>
                {/* Visual Workload Div Split */}
                <TranscriptEditor
                  transcript={notes.originalTranscript}
                  part1={notes.part1}
                  part2={notes.part2}
                  part3={notes.part3}
                  part4={notes.part4}
                  part5={notes.part5}
                  isEditing={isEditingTranscript}
                  setIsEditing={setIsEditingTranscript}
                  onSaveTranscript={handleSaveEditedTranscript}
                  isLoading={isLoading}
                />

                {/* Unified Notes View */}
                <div className="bg-white border border-indigo-150 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col min-h-[500px] w-full max-w-full overflow-hidden">
                    <div className="px-3 py-3 sm:px-5 sm:py-4 bg-indigo-50/40 rounded-t-2xl flex items-center justify-between border-b border-indigo-100/50 overflow-hidden">
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-indigo-50 flex items-center justify-center border border-indigo-100 text-indigo-600 shrink-0">
                          <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </div>
                        <div className="min-w-0 overflow-hidden">
                          <h4 className="font-serif font-bold text-[10px] sm:text-xs text-zinc-900 leading-none truncate">
                            Comprehensive Learning Notes
                          </h4>
                          <span className="text-[8px] sm:text-[9px] text-indigo-600 uppercase tracking-wider font-mono font-bold block mt-0.5 truncate">
                            Master Study Material
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 sm:p-6 flex-1 select-text space-y-4 sm:space-y-6 overflow-hidden">
                    {/* Final Master Version (Perfected) or Individual AI Extraction Parts */}
                    {notes.perfectedNotes ? (
                      <MarkdownView content={notes.perfectedNotes} />
                    ) : (
                      <>
                        {notes.zAiAnalysis && <MarkdownView content={notes.zAiAnalysis} />}
                        {notes.minimaxAnalysis && <MarkdownView content={notes.minimaxAnalysis} />}
                        {notes.deepseekAnalysis && <MarkdownView content={notes.deepseekAnalysis} />}
                        {notes.nemotronAnalysis && <MarkdownView content={notes.nemotronAnalysis} />}
                        {notes.qwenAnalysis && <MarkdownView content={notes.qwenAnalysis} />}
                      </>
                    )}
                    
                    <div className="pt-8 text-center">
                      {statusMessage ? (
                        <div className="flex flex-col items-center animate-pulse py-4">
                          <span className="text-rose-600 font-bold text-[10px] sm:text-xs uppercase tracking-[0.2em] font-mono flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                            </span>
                            {statusMessage}
                          </span>
                        </div>
                      ) : (
                        <>
                          <span className="text-rose-900 font-bold text-xl uppercase tracking-[0.2em] font-serif">SYLLABUS MASTER READY</span>
                          <div className="h-0.5 w-12 bg-rose-900 mx-auto mt-2" />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {stage === AppStage.GENERATED_DETAIL && (
                  <div id="generate-short-notes-cta" className="bg-zinc-950 border border-black p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-5 text-white shadow-xl">
                    <div>
                      <div className="flex items-center space-x-1.5 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        Test Your Knowledge
                      </div>
                      <h4 className="font-serif font-bold text-lg leading-tight mb-1">
                        Generate Practice Quizzes & Questions
                      </h4>
                      <p className="text-xs text-zinc-400">
                        Automatically generate comprehensive multiple-choice, true/false, and short answer quizzes based on these complete notes.
                      </p>
                    </div>

                    <button
                      id="initiate-short-notes-button"
                      onClick={handleGenerateShortNotes}
                      disabled={isLoading}
                      className="w-full sm:w-auto bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs py-3 px-6 rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-lg active:scale-97"
                    >
                      <span>{isLoading ? "Generating Quizzes..." : "Generate Quizzes"}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-950" />
                    </button>
                  </div>
                )}
                  </>
                )}
              </div>
            )}

            {/* STAGE 3: SHORT TAKEAWAYS & HIGHLIGHTED CARDS */}
            {stage !== AppStage.INPUT && stage !== AppStage.GENERATED_DETAIL && shortNotes && !isChatFullscreen && (
              <div className="space-y-8 animate-fade-in max-w-full overflow-hidden">
                <div className="border bg-white border-rose-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="bg-rose-50/40 border-b border-rose-100/50 p-4 sm:p-4.5 flex items-center justify-between">
                    <div className="flex items-center space-x-2 overflow-hidden">
                      <Sparkles className="w-4 h-4 text-rose-650 shrink-0" />
                      <span className="text-xs font-serif font-bold text-zinc-900 truncate">
                        Practice Quizzes &amp; Questions
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100/50 shrink-0">
                      Assessment
                    </span>
                  </div>

                  <div className="p-4 sm:p-8 select-text overflow-hidden">
                    <MarkdownView content={shortNotes.synthesizedNotes} />
                    <div className="pt-8 text-center">
                      {isLoading && stage === AppStage.GENERATED_SHORT ? (
                        <div className="flex flex-col items-center animate-pulse py-4">
                          <span className="text-rose-600 font-bold text-[10px] sm:text-xs uppercase tracking-[0.2em] font-mono flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                            </span>
                            Drafting Evaluation Quizzes...
                          </span>
                        </div>
                      ) : (
                        <>
                          <span className="text-rose-900 font-bold text-xl uppercase tracking-[0.2em] font-serif">DONE</span>
                          <div className="h-0.5 w-12 bg-rose-900 mx-auto mt-2" />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section explaining how to synthesize professional PDF */}
                {stage === AppStage.GENERATED_SHORT && (
                  <div id="compile-pdf-cta" className="bg-zinc-950 border border-black p-6 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-5 text-white">
                    <div>
                      <span className="text-[10px] font-mono tracking-wider font-bold uppercase text-rose-400 block mb-1">
                        Stage 4: PDF Compilation with Visual Prompt Illustration
                      </span>
                      <h4 className="font-serif font-bold text-lg leading-tight mb-1">
                        Compile PDF with AI Illustrative Graphic
                      </h4>
                      <p className="text-xs text-zinc-400">
                        DeepSeek layouts children study manuals, crafts visual prompt instructions, and triggers Flux (**black-forest-labs/flux.2-klein-4b**) to draw dynamic graphic assets inside.
                      </p>
                    </div>

                    <button
                      id="compile-pdf-button"
                      onClick={handleGeneratePdfNotes}
                      disabled={isLoading}
                      className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3.5 px-6 rounded-xl flex items-center justify-center space-x-2 cursor-pointer shadow-md transition-all active:scale-97 border border-rose-500/20"
                    >
                      <FileCheck2 className="w-4 h-4" />
                      <span>{isLoading ? "Generating..." : "Compile PDF Notes"}</span>
                    </button>
                    
                    <button
                      id="download-docx-button"
                      onClick={handleDownloadDocx}
                      disabled={isLoading}
                      className="w-full sm:w-auto bg-white hover:bg-zinc-100 text-zinc-950 border border-zinc-200 font-bold text-xs py-3.5 px-6 rounded-xl flex items-center justify-center space-x-2 cursor-pointer shadow-md transition-all active:scale-97"
                    >
                      <FileText className="w-4 h-4" />
                      <span>{isLoading ? "Generating DOCX..." : "Download DOCX"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* STAGE 4: PDF MASTER MANUAL PREVIEW & QUICK ACCESS DRAWER */}
            {stage === AppStage.PDF_COMPILED && pdfDoc && !isChatFullscreen && (
              <div id="pdf-re-trigger-panel" className="bg-emerald-50 border border-emerald-200 py-4 sm:py-5 px-4 sm:px-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 shadow-sm overflow-hidden">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-650 shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <h5 className="font-semibold text-xs sm:text-sm text-emerald-900 leading-tight truncate">
                      Syllabus Manual Synthesis Complete
                    </h5>
                    <p className="text-[10px] sm:text-xs text-emerald-750 truncate">
                      The document has been formatted and paginated beautifully.
                    </p>
                  </div>
                </div>

                <button
                  id="view-compiled-pdf-button"
                  onClick={() => setShowPdfModal(true)}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-750 text-white font-bold text-xs py-3 sm:py-2.5 px-6 rounded-lg cursor-pointer border border-emerald-655 shadow-sm transition-all text-center flex items-center justify-center space-x-2 active:scale-95 shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Open PDF Manual Preview</span>
                </button>
              </div>
            )}

            {/* Reset control in case they want a new video */}
            {stage !== AppStage.INPUT && !isChatFullscreen && (
              <div className="flex justify-center pt-4 select-none">
                <button
                  onClick={resetAll}
                  className="text-xs font-semibold text-zinc-400 hover:text-rose-600 transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Submit Another Video URL
                </button>
              </div>
            )}
          </div>
        )}
          </>
        )}
        </main>

      <footer className="bg-zinc-50 border-t border-zinc-100 py-8 select-none">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-zinc-400 font-mono">
            &copy; 2026 Syllabus Master: Academic Lecture Analyst. All rights reserved.
          </p>
        </div>
      </footer>
    </div>

      {/* MODAL PREVIEW & DOWNLOAD PORTAL */}
      {metadata && pdfDoc && (
        <PdfPreviewModal
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
          pdfContent={pdfDoc.pdfContent}
          videoTitle={metadata.title}
          authorName={metadata.authorName}
        />
      )}
    </div>
  );
}