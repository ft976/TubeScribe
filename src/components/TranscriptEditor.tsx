import { useState } from "react";
import { Edit3, Check, RefreshCw, FileText } from "lucide-react";

interface TranscriptEditorProps {
  transcript: string;
  part1: string;
  part2: string;
  part3: string;
  part4: string;
  part5: string;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  onSaveTranscript: (newText: string) => void;
  isLoading: boolean;
}

export default function TranscriptEditor({
  transcript,
  part1,
  part2,
  part3,
  part4,
  part5,
  isEditing,
  setIsEditing,
  onSaveTranscript,
  isLoading,
}: TranscriptEditorProps) {
  const [editText, setEditText] = useState(transcript);

  const handleSave = () => {
    onSaveTranscript(editText);
    setIsEditing(false);
  };

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div id="transcript-editor-container" className="bg-white rounded-2xl border border-zinc-150 p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-5 gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-zinc-900 font-bold">
            <FileText className="w-4 h-4 text-zinc-600" />
            <span className="text-xs sm:text-sm">Raw Transcript Feed</span>
          </div>
          
          {transcript && (
            <span className="bg-zinc-100 text-zinc-655 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono">
              {wordCount(transcript)} words
            </span>
          )}
        </div>

        {transcript && !isLoading && (
          <button
            id="toggle-edit-transcript-button"
            onClick={() => {
              if (isEditing) {
                handleSave();
              } else {
                setEditText(transcript);
                setIsEditing(true);
              }
            }}
            className={`w-full sm:w-auto text-[10px] sm:text-xs inline-flex items-center justify-center px-4 py-3 sm:py-1.5 rounded-lg border transition-all ${
              isEditing
                ? "bg-rose-600 text-white border-rose-655 font-bold shadow-md hover:bg-rose-700"
                : "bg-white text-zinc-650 hover:bg-zinc-50 border-zinc-200 font-bold"
            }`}
          >
            {isEditing ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" /> Finish Editing
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit Captions
              </>
            )}
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <p className="text-[10px] sm:text-xs text-rose-650 bg-rose-50/50 p-3 sm:p-4 rounded-lg border border-rose-100/50 font-medium">
            <strong>Edit Mode Active:</strong> You can refine the captions below. The AI engines will automatically split your revised text into five partition workloads for optimal study extraction.
          </p>
          <textarea
            id="transcript-edit-textarea"
            className="w-full min-h-[300px] border border-zinc-250 p-4 rounded-xl text-zinc-750 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono leading-relaxed"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Paste or type raw caption text here..."
          />
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            <button
              id="confirm-save-transcript-button"
              onClick={handleSave}
              className="flex-1 px-4 py-3 sm:py-1.5 bg-rose-600 hover:bg-rose-750 text-white text-xs font-bold rounded-xl shadow-md border border-rose-655 active:scale-95 transition-all"
            >
              Save &amp; Re-Analyze
            </button>
            <button
              id="cancel-edit-transcript-button"
              onClick={() => setIsEditing(false)}
              className="flex-1 px-4 py-3 sm:py-1.5 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 border border-zinc-200 active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="max-h-[250px] sm:max-h-[300px] overflow-y-auto bg-zinc-50 border border-zinc-150 p-4 sm:p-4.5 rounded-xl">
          <p className="text-[11px] sm:text-xs text-zinc-650 leading-relaxed font-sans whitespace-pre-wrap">
            {transcript || "No transcript compiled yet. Enter a YouTube URL and hit Generate Notes."}
          </p>
        </div>
      )}
    </div>
  );
}
