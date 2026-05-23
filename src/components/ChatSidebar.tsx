import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, History, ChevronRight, BookOpen, Settings, Trash2, X, Info, Trash, Eraser, Plus, LayoutGrid, MessageCircle, Library } from "lucide-react";
import { 
  saveChatMessage, 
  getChatSession, 
  getNoteHistory, 
  deleteNoteFromHistory, 
  clearAllHistory, 
  createChatSession, 
  getChatSessions, 
  deleteChatSession 
} from "../lib/firebase";
import { ChatSession } from "../types";

interface ChatSidebarProps {
  mode?: "full" | "chat-only" | "library-only";
  className?: string;
  onSelectHistory?: (item: any) => void;
  preferredModel?: string;
  initialTab?: "chat" | "history" | "sessions";
}

export default function ChatSidebar({ mode = "full", className = "lg:w-80 border-l border-zinc-200 bg-white", onSelectHistory, preferredModel, initialTab }: ChatSidebarProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "history" | "sessions">(initialTab || (mode === "full" ? "sessions" : mode === "chat-only" ? "chat" : "history"));
  const [messages, setMessages] = useState<{ role: "user" | "assistant", content: string }[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(preferredModel || "qwen");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'wipe' | 'clear' | 'delete', id?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const models = [
    { id: "llama", name: "Llama 3.3 (Meta)", icon: "🦙" },
    { id: "minimax", name: "MiniMax-M2.7", icon: "🚀" },
    { id: "deepseek", name: "DeepSeek-V4", icon: "🐳" },
    { id: "nemotron", name: "Nemotron-3", icon: "⚡" },
    { id: "qwen", name: "Qwen-2.5 (Alibaba)", icon: "🤖" },
  ];

  // Initialize a session if none exists and we are in chat mode
  const ensureSession = async () => {
    if (!currentSessionId && (activeTab === "chat" || mode === "chat-only")) {
      const existingSessions = await getChatSessions();
      if (existingSessions.length > 0) {
        handleSelectSession(existingSessions[0]);
      } else {
        const newSess = await createChatSession(selectedModel, "Discussion: New Academic Topic");
        if (newSess) handleSelectSession(newSess);
      }
    }
  };

  useEffect(() => {
    ensureSession();
  }, [activeTab, mode]);

  const handleCreateNewChat = async () => {
    const newSess = await createChatSession(selectedModel, `Discussion: ${new Date().toLocaleTimeString()}`);
    if (newSess) {
      handleSelectSession(newSess);
      setActiveTab("chat");
    }
  };

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setSelectedModel(session.model);
    setMessages(session.messages || []);
    setActiveTab("chat");
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmAction({ type: 'delete', id });
  };

  const refreshSessions = async () => {
    const s = await getChatSessions();
    setSessions(s);
  };

  useEffect(() => {
    refreshSessions();
    window.addEventListener("sessions_updated", refreshSessions);
    return () => window.removeEventListener("sessions_updated", refreshSessions);
  }, []);

  const clearChat = async () => {
    setMessages([]);
    if (currentSessionId) {
      await saveChatMessage(null, currentSessionId, []);
    }
    setConfirmAction(null);
  };

  const handleClearAllHistory = async () => {
    await clearAllHistory(null);
    setConfirmAction(null);
  };

  const executeDeleteHistoryItem = async () => {
    if (confirmAction?.id) {
      await deleteNoteFromHistory(null, confirmAction.id);
    }
    setConfirmAction(null);
  };

  const executeDeleteSession = async () => {
    if (confirmAction?.id) {
       await deleteChatSession(confirmAction.id);
       if (currentSessionId === confirmAction.id) {
         setCurrentSessionId(null);
         setMessages([]);
         setActiveTab("sessions");
       }
       refreshSessions();
    }
    setConfirmAction(null);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (mode !== "chat-only") {
      const loadHistory = async () => {
        const saved = await getNoteHistory(null);
        setHistory(saved);
      };
      loadHistory();
      window.addEventListener("history_updated", loadHistory);
      return () => window.removeEventListener("history_updated", loadHistory);
    }
  }, [mode]);

  const handleSend = async () => {
    if (!input.trim() || !currentSessionId) return;
    const newMessages = [...messages, { role: "user" as const, content: input }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, modelId: selectedModel }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      let assistantResponse = "";
      const tempMessages = [...newMessages, { role: "assistant" as const, content: "" }];
      setMessages(tempMessages);

      const decoder = new TextDecoder();
      while(true) {
        const { done, value } = await reader.read();
        if(done) break;
        const chunk = decoder.decode(value);
        assistantResponse += chunk;
        const updatedMessages = [...newMessages, { role: "assistant" as const, content: assistantResponse }];
        setMessages(updatedMessages);
        saveChatMessage(null, currentSessionId, updatedMessages);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`${className} flex flex-col h-full select-none`}>
      {mode === "full" && (
        <div className="flex border-b-2 border-zinc-50 bg-white sticky top-0 z-20">
          <button 
            onClick={() => setActiveTab("sessions")}
            className={`flex-1 p-5 font-bold flex items-center justify-center space-x-3 transition-all relative ${activeTab === 'sessions' || activeTab === 'chat' ? 'text-zinc-950' : 'text-zinc-300 hover:text-zinc-500'}`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm tracking-tight">AI Conversations</span>
            {(activeTab === 'sessions' || activeTab === 'chat') && <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950 rounded-full" />}
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={`flex-1 p-5 font-bold flex items-center justify-center space-x-3 transition-all relative ${activeTab === 'history' ? 'text-zinc-950' : 'text-zinc-300 hover:text-zinc-500'}`}
          >
            <Library className="w-5 h-5" />
            <span className="text-sm tracking-tight">Saved Library</span>
            {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-600 rounded-full" />}
          </button>
        </div>
      )}

      {mode === "chat-only" && (
        <div className="p-3 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Ask AI assistant</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1 hover:bg-zinc-200 rounded-md transition-colors">
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      )}

      {showSettings && (
        <div className="p-4 border-b border-zinc-200 bg-zinc-50/80 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between mb-4">
             <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase tracking-wider">
               <Settings className="w-3.5 h-3.5" />
               Configuration
             </h4>
             <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-zinc-200 rounded-lg">
                <X className="w-3 h-3 text-zinc-400" />
             </button>
          </div>
          
          <div className="space-y-4">
             <div>
               <label className="text-[10px] text-zinc-400 font-bold uppercase block mb-1.5">Selected Model</label>
               <div className="grid grid-cols-2 gap-2">
                 {models.map(m => (
                   <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={`px-3 py-2 rounded-lg text-[10px] border transition-all flex items-center gap-2 ${selectedModel === m.id ? 'bg-zinc-900 border-zinc-900 text-white font-bold' : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}
                   >
                     <span>{m.icon}</span> {m.id.split('-')[0].charAt(0).toUpperCase() + m.id.split('-')[0].slice(1)}
                   </button>
                 ))}
               </div>
             </div>

             <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                <button 
                  onClick={() => setConfirmAction({ type: 'clear' })}
                  className="text-[10px] text-rose-500 font-bold flex items-center gap-1 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Current History
                </button>
                <div className="group relative">
                  <Info className="w-3 h-3 text-zinc-300 cursor-help" />
                  <div className="absolute right-0 bottom-full mb-2 w-48 p-2 bg-zinc-900 text-[10px] text-white rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    Strict Study Mode Active.
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === "chat" && (
         <div className="p-3 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center transition-all">
            <div className="flex items-center gap-3">
              {mode === "full" && (
                <button 
                  onClick={() => setActiveTab("sessions")}
                  className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-400"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
              )}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold block">Current Chat</label>
                <div className="text-[11px] font-bold text-zinc-900 flex items-center gap-1.5">
                  {models.find(m => m.id === selectedModel)?.icon} Active Session
                </div>
              </div>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-zinc-200 rounded-lg text-zinc-400">
               <Settings className="w-4 h-4" />
            </button>
         </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-zinc-50/10">
        {activeTab === "sessions" ? (
          <div className="space-y-4">
             <div className="px-1 mb-4 pt-1">
                <button 
                  onClick={handleCreateNewChat}
                  className="w-full flex items-center justify-center gap-3 py-3.5 bg-zinc-950 text-white rounded-2xl text-xs uppercase tracking-widest font-bold hover:bg-zinc-800 transition-all shadow-lg active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  New AI Conversation
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-2 mb-3">Recent Discussions</h4>
                {sessions.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400 text-xs italic">
                    No active sessions found.
                  </div>
                ) : (
                  sessions.map(s => (
                    <div 
                      key={s.id} 
                      onClick={() => handleSelectSession(s)}
                      className={`p-4 border rounded-2xl transition-all group cursor-pointer flex items-center justify-between ${currentSessionId === s.id ? 'bg-white border-zinc-900 shadow-md ring-1 ring-zinc-900' : 'bg-white border-zinc-100 hover:border-zinc-300 shadow-sm'}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 ${currentSessionId === s.id ? 'bg-zinc-900 text-white' : 'bg-zinc-50 text-zinc-400'}`}>
                          {models.find(m => m.id === s.model)?.icon || "🧠"}
                        </div>
                        <div className="overflow-hidden">
                          <h5 className={`font-bold text-xs truncate ${currentSessionId === s.id ? 'text-zinc-900' : 'text-zinc-600'}`}>
                            {s.title}
                          </h5>
                          <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                            {new Date(s.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteSession(e, s.id)}
                        className="p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-xl text-rose-500 transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
          </div>
        ) : activeTab === "chat" ? (
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-20 px-6">
                <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-100">
                   <MessageSquare className="w-6 h-6 text-zinc-300" />
                </div>
                <h4 className="text-xs font-bold text-zinc-950 mb-1 uppercase tracking-tight">Academic Board Initialized</h4>
                <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                  The model is ready to assist with lecture clarifications, logic checks, or general study guide assistance.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`p-3 sm:p-4 rounded-2xl max-w-[92%] sm:max-w-[85%] text-xs sm:text-xs leading-relaxed shadow-sm border ${m.role === 'user' ? 'bg-zinc-950 text-white border-zinc-900' : 'bg-white text-zinc-900 border-zinc-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-zinc-400 text-[10px] uppercase font-bold tracking-[0.2em] font-mono text-center animate-pulse py-4 flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
              Processing Logic...
            </div>}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="space-y-3">
            {history.length > 0 && (
              <div className="px-1 mb-4 pt-1">
                <button 
                  onClick={() => setConfirmAction({ type: 'wipe' })}
                  className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-rose-100 text-rose-600 rounded-2xl text-[10px] uppercase tracking-widest font-bold hover:bg-rose-50 transition-all"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Wipe Entire Library
                </button>
              </div>
            )}
            {history.length === 0 ? (
              <div className="text-center py-20 text-zinc-400 text-xs">
                <History className="w-10 h-10 mx-auto mb-3 opacity-10" />
                Your academic library is empty.
              </div>
            ) : (
              history.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => onSelectHistory?.(item)}
                  className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm hover:border-zinc-900 transition-all group cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                       <BookOpen className="w-3.5 h-3.5 text-rose-300" />
                       <span className="text-[10px] font-mono text-zinc-400">{item.date}</span>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction({ type: 'delete', id: item.id });
                      }}
                      className="p-1.5 hover:bg-rose-50 rounded-lg text-zinc-200 hover:text-rose-600 transition-all"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h5 className="font-bold text-xs mt-2.5 text-zinc-950 line-clamp-2 leading-snug">
                    {item.title}
                  </h5>
                  <div className="mt-3 flex items-center text-[10px] font-bold text-rose-600 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                    Open Syllabus <ChevronRight className="w-3 h-3 ml-1" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {activeTab === "chat" && (
        <div className="p-3 sm:p-5 border-t border-zinc-200 bg-white">
          <div className="flex items-end space-x-2">
            <textarea 
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border-2 border-zinc-100 bg-zinc-50 rounded-2xl px-4 py-3 text-xs sm:text-[13px] focus:outline-none focus:border-zinc-900 focus:bg-white transition-all resize-none max-h-32"
              placeholder="Ask for clarification or deeper context..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button onClick={handleSend} className="bg-zinc-950 text-white w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center hover:bg-zinc-800 active:scale-90 transition-all shadow-lg shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Global Custom Confirmation Overlay */}
      {confirmAction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
           <div className="bg-white border rounded-3xl p-6 w-full max-w-xs shadow-2xl relative animate-in fade-in zoom-in-95 duration-300">
              <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                 <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-zinc-950 font-bold text-base text-center mb-2">Confirm Removal</h3>
              <p className="text-zinc-500 text-xs text-center mb-6 leading-relaxed">
                {confirmAction.type === 'wipe' ? 'Are you sure you want to permanently delete your entire academic library? This cannot be undone.' : 
                 confirmAction.type === 'clear' ? 'This will permanently remove all messages in the current conversation.' : 
                 'Are you sure you want to delete this specific item?'}
              </p>
              <div className="flex gap-2">
                 <button 
                   onClick={() => setConfirmAction(null)}
                   className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={
                     confirmAction.type === 'wipe' ? handleClearAllHistory :
                     confirmAction.type === 'clear' ? clearChat :
                     confirmAction.type === 'delete' ? (activeTab === 'history' ? executeDeleteHistoryItem : executeDeleteSession) :
                     () => setConfirmAction(null)
                   }
                   className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md shadow-rose-200"
                 >
                   Confirm
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
