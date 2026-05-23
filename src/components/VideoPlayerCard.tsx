import { VideoMetadata } from "../types";
import { Play, User, Layers, CheckCircle } from "lucide-react";

interface VideoPlayerCardProps {
  metadata: VideoMetadata;
}

export default function VideoPlayerCard({ metadata }: VideoPlayerCardProps) {
  const embedUrl = `https://www.youtube.com/embed/${metadata.videoId}?rel=0&autoplay=0`;

  return (
    <div id="video-player-root" className="bg-white rounded-2xl border border-zinc-150 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Iframe Column */}
        <div className="lg:col-span-7 bg-zinc-900 aspect-video relative">
          <iframe
            id="youtube-player-iframe"
            src={embedUrl}
            title={metadata.title}
            className="w-full h-full border-0 absolute inset-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {/* Info Column */}
        <div className="lg:col-span-5 p-4 sm:p-8 flex flex-col justify-between bg-zinc-50/50">
          <div>
            <div className="flex items-center space-x-2 mb-3 sm:mb-3.5">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs bg-red-50 text-red-600 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-medium border border-red-100">
                <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" /> Active Source
              </span>
              <span className="text-[10px] sm:text-xs text-zinc-400 font-mono">
                ID: {metadata.videoId}
              </span>
            </div>

            <h3 className="text-zinc-950 font-serif text-base sm:text-lg md:text-xl font-semibold leading-snug tracking-tight mb-4">
              {metadata.title}
            </h3>

            <div className="space-y-3">
              <div className="flex items-center text-sm text-zinc-650 font-sans">
                <User className="w-4 h-4 text-zinc-400 mr-2 shrink-0" />
                <span className="font-medium text-zinc-750">{metadata.authorName}</span>
              </div>
              <div className="flex items-start text-sm text-zinc-550 font-sans">
                <Layers className="w-4 h-4 text-rose-400 mr-2 mt-0.5 shrink-0" />
                <span>
                  Automatic captions split 50/50 mapped to analytical core servers.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-150/60 mt-6 flex items-center justify-between">
            <span className="text-xs text-zinc-400 flex items-center font-mono">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mr-1.5" /> Target Synced
            </span>
            <a
              href={`https://www.youtube.com/watch?v=${metadata.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-rose-600 font-medium hover:underline"
            >
              Watch on YouTube →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
