import { Youtube, Sparkles, HelpCircle, RefreshCcw, Library } from "lucide-react";

interface HeaderProps {
  onReset?: () => void;
  showReset?: boolean;
  onOpenHistory?: () => void;
}

export default function Header({ onReset, showReset, onOpenHistory }: HeaderProps) {
  return (
    <header id="app-header" className="border-b border-zinc-100 bg-white/85 backdrop-blur-md sticky top-0 z-50 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center border border-rose-100 text-rose-500">
            <Youtube className="w-5.5 h-5.5" />
          </div>
          <div className="cursor-pointer" onClick={onReset}>
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-900 flex items-center gap-1.5 font-sans">
              Syllabus Master <span className="text-[10px] sm:text-xs bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full font-medium tracking-normal">Academic 5.0</span>
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono text-left">Professional Lecture Analysis</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {showReset && (
            <button 
              onClick={onReset}
              className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all flex items-center space-x-2"
            >
               <RefreshCcw className="w-3.5 h-3.5" />
               <span className="hidden sm:inline">New Analysis</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
