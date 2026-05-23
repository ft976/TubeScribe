
export async function saveNoteToHistory(userId: string | null, data: any) {
  try {
    const history = JSON.parse(localStorage.getItem("note_history") || "[]");
    const newItem = {
      id: `history-${Date.now()}`,
      ...data,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("note_history", JSON.stringify([newItem, ...history].slice(0, 50)));
    window.dispatchEvent(new Event("history_updated"));
  } catch (err) {
    console.error("Failed to save note to history", err);
  }
}

export async function getNoteHistory(userId: string | null) {
  try {
    return JSON.parse(localStorage.getItem("note_history") || "[]");
  } catch (err) {
    console.error("Failed to fetch history", err);
    return [];
  }
}

export async function saveChatMessage(userId: string | null, sessionId: string, messages: any[]) {
  try {
    const sessions = JSON.parse(localStorage.getItem("chat_sessions") || "[]");
    const sessionIndex = sessions.findIndex((s: any) => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].messages = messages;
      sessions[sessionIndex].updatedAt = Date.now();
      localStorage.setItem("chat_sessions", JSON.stringify(sessions));
    }
  } catch (err) {
    console.error("Failed to save chat", err);
  }
}

export async function createChatSession(model: string, title: string = "Academic Inquiry") {
  try {
    const sessions = JSON.parse(localStorage.getItem("chat_sessions") || "[]");
    const newSession = {
      id: Math.random().toString(36).substring(2, 9),
      title: title,
      model: model,
      messages: [],
      updatedAt: Date.now()
    };
    sessions.unshift(newSession);
    localStorage.setItem("chat_sessions", JSON.stringify(sessions));
    window.dispatchEvent(new Event("sessions_updated"));
    return newSession;
  } catch (err) {
    console.error("Failed to create chat session", err);
    return null;
  }
}

export async function getChatSessions() {
  try {
    return JSON.parse(localStorage.getItem("chat_sessions") || "[]");
  } catch (err) {
    return [];
  }
}

export async function deleteChatSession(sessionId: string) {
  try {
    const sessions = JSON.parse(localStorage.getItem("chat_sessions") || "[]");
    const updated = sessions.filter((s: any) => s.id !== sessionId);
    localStorage.setItem("chat_sessions", JSON.stringify(updated));
    window.dispatchEvent(new Event("sessions_updated"));
  } catch (err) {
    console.error("Failed to delete chat session", err);
  }
}

export async function getChatSession(userId: string | null, sessionId: string) {
  try {
    const sessions = JSON.parse(localStorage.getItem("chat_sessions") || "[]");
    return sessions.find((s: any) => s.id === sessionId) || null;
  } catch (err) {
    console.error("Failed to fetch chat", err);
    return null;
  }
}

export async function deleteNoteFromHistory(userId: string | null, id: string) {
  try {
    const history = JSON.parse(localStorage.getItem("note_history") || "[]");
    const updated = history.filter((item: any) => item.id !== id);
    localStorage.setItem("note_history", JSON.stringify(updated));
    window.dispatchEvent(new Event("history_updated"));
  } catch (err) {
    console.error("Failed to delete history item", err);
  }
}

export async function clearAllHistory(userId: string | null) {
  try {
    localStorage.removeItem("note_history");
    window.dispatchEvent(new Event("history_updated"));
  } catch (err) {
    console.error("Failed to clear all history", err);
  }
}

export async function clearAllChats(userId: string | null) {
  try {
    localStorage.removeItem("ai_chats");
  } catch (err) {
    console.error("Failed to clear all chats", err);
  }
}

