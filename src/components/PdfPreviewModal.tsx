import { useState } from "react";
import { Download, FileDown, X, CheckCircle2 } from "lucide-react";
import { jsPDF } from "jspdf";
import MarkdownView from "./MarkdownView";

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfContent: string;
  videoTitle: string;
  authorName: string;
  visualImageUrl?: string;
}

export default function PdfPreviewModal({
  isOpen,
  onClose,
  pdfContent,
  videoTitle,
  authorName,
  visualImageUrl,
}: PdfPreviewModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  // Custom multi-page PDF generator using jsPDF
  const handleDownloadPdf = () => {
    try {
      setDownloading(true);
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "letter",
      });

      // Page dimensions
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 54; // 0.75 in margins
      const maxLineWidth = pageWidth - margin * 2;
      
      let y = 72; // Start cursor below title margin

      const checkNewPage = (neededHeight: number) => {
        if (y + neededHeight > pageHeight - margin) {
          doc.addPage();
          y = margin + 18;
          // Add discrete page header
          doc.setFont("Helvetica", "oblique");
          doc.setFontSize(8);
          doc.setTextColor(140, 140, 140);
          doc.text(`STUDENT STUDY GUIDE | ${videoTitle.substring(0, 50)}...`, margin, margin - 15);
          doc.setDrawColor(220, 220, 220);
          doc.line(margin, margin - 8, pageWidth - margin, margin - 8);
        }
      };

      // 1. Document Cover Style Title
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(30, 30, 30);
      const splitTitle = doc.splitTextToSize(`STUDENT STUDY GUIDE: ${videoTitle.toUpperCase()}`, maxLineWidth);
      splitTitle.forEach((line: string) => {
        checkNewPage(24);
        doc.text(line, margin, y);
        y += 22;
      });

      y += 8;

      // 2. Author / Sync Metadata row
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Tuned Educational Syllabus - Source: ${authorName || "YouTube Video"}`, margin, y);
      y += 6;
      doc.setDrawColor(225, 29, 72); // Rose separator line
      doc.setLineWidth(2.0);
      doc.line(margin, y, pageWidth - margin, y);
      y += 24;

      // 3. Optional visual aid embedding
      if (visualImageUrl) {
        try {
          const isSvg = visualImageUrl.includes("svg+xml");
          if (!isSvg) {
            checkNewPage(180);
            doc.addImage(visualImageUrl, "PNG", margin, y, maxLineWidth, maxLineWidth * 9 / 16);
            y += (maxLineWidth * 9 / 16) + 12;
            doc.setFont("Helvetica", "oblique");
            doc.setFontSize(8);
            doc.setTextColor(140, 140, 140);
            doc.text("Visual Aid illustration (black-forest-labs/flux.2-klein-4b)", margin, y);
            y += 18;
          } else {
            checkNewPage(45);
            doc.setDrawColor(244, 63, 94);
            doc.setFillColor(254, 242, 248);
            doc.rect(margin, y, maxLineWidth, 30, "FD");
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(157, 23, 77);
            doc.text("FLUX ILLUSTRATION ATTACHED ONLINE (VIEWABLE IN STUDY CONTEXT PREVIEW)", margin + 12, y + 18);
            y += 42;
          }
        } catch (imgErr) {
          console.warn("Could not insert image directly in printed PDF, skipping gracefully", imgErr);
        }
      }

      // Parse markdown content line-by-line for drawing
      const rawLines = pdfContent.split("\n");
      
      doc.setLineWidth(0.5); // Reset line width

      rawLines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          y += 10; // spacing between paragraphs
          return;
        }

        // Section Headers
        if (trimmed.startsWith("# ")) {
          const headerText = trimmed.substring(2);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(14);
          doc.setTextColor(15, 15, 15);
          y += 12;
          checkNewPage(24);
          doc.text(headerText, margin, y);
          y += 18;
        } else if (trimmed.startsWith("## ")) {
          const headerText = trimmed.substring(3);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(30, 30, 30);
          y += 8;
          checkNewPage(18);
          doc.text(headerText, margin, y);
          y += 16;
        } else if (trimmed.startsWith("### ")) {
          const headerText = trimmed.substring(4);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(50, 50, 50);
          y += 6;
          checkNewPage(16);
          doc.text(headerText, margin, y);
          y += 14;
        } else if (trimmed.startsWith("> ")) {
          // Quote boxes
          const quoteText = trimmed.substring(2);
          doc.setFont("Helvetica", "oblique");
          doc.setFontSize(10);
          doc.setTextColor(80, 80, 80);
          
          const splitQuote = doc.splitTextToSize(quoteText, maxLineWidth - 15);
          checkNewPage(splitQuote.length * 14 + 10);
          
          // Draw simple accent vertical quote line
          doc.setDrawColor(225, 29, 72); // rose line
          doc.setLineWidth(1.5);
          doc.line(margin + 2, y - 8, margin + 2, y + (splitQuote.length * 13) - 8);
          
          splitQuote.forEach((qLine: string) => {
            doc.text(qLine, margin + 12, y);
            y += 13;
          });
          y += 6;
          
          doc.setLineWidth(0.5); // reset
        } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          // Bullets
          const bulletText = trimmed.substring(2);
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(50, 50, 50);

          const splitBullet = doc.splitTextToSize(bulletText, maxLineWidth - 15);
          splitBullet.forEach((bLine: string, idx: number) => {
            checkNewPage(14);
            if (idx === 0) {
              doc.text("•", margin + 5, y);
              doc.text(bLine, margin + 15, y);
            } else {
              doc.text(bLine, margin + 15, y);
            }
            y += 14;
          });
        } else if (/^\d+\.\s/.test(trimmed)) {
          // Numbered lists
          const numText = trimmed.replace(/^\d+\.\s+/, "");
          const numPrefix = trimmed.match(/^(\d+\.)/)?.[0] || "1.";
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(50, 50, 50);

          const splitNumText = doc.splitTextToSize(numText, maxLineWidth - 20);
          splitNumText.forEach((nLine: string, idx: number) => {
            checkNewPage(14);
            if (idx === 0) {
              doc.text(numPrefix, margin, y);
              doc.text(nLine, margin + 20, y);
            } else {
              doc.text(nLine, margin + 20, y);
            }
            y += 14;
          });
        } else {
          // Normal Paragraph lines
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(60, 60, 60);

          // Clean markdown bold symbols inside plain text to look nice
          const cleanedText = trimmed.replace(/\*\*/g, "");
          const splitParagraph = doc.splitTextToSize(cleanedText, maxLineWidth);
          
          splitParagraph.forEach((pLine: string) => {
            checkNewPage(14);
            doc.text(pLine, margin, y);
            y += 14;
          });
        }
      });

      // Save document
      const docName = `Syllabus_Study_Guide_${videoTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`;
      doc.save(docName);
      
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error("PDF download compilation failure:", err);
      alert("Failed compiling PDF. Try downloading again or copying markdown directly.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/45 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl border border-zinc-150 w-full max-w-4xl shadow-2xl flex flex-col h-full sm:max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50 rounded-t-2xl">
          <div>
            <h3 className="font-serif text-base sm:text-lg font-bold text-zinc-950">
              Professional Formatted Manual
            </h3>
            <p className="hidden sm:block text-xs text-zinc-500 font-mono">Ready for official corporate and academic distribution</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Preview Area */}
        <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 bg-zinc-50">
          <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-5 sm:p-8 md:p-12 max-w-3xl mx-auto min-h-[60vh] transition-all hover:border-zinc-350">
            <div className="border-b border-rose-100 pb-3 mb-6">
              <span className="text-[10px] uppercase font-mono tracking-widest font-bold text-rose-600 block mb-1">
                Unified Synthesis Manual
              </span>
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-zinc-900">
                Study Guide: {videoTitle}
              </h1>
              <p className="text-[10px] text-zinc-500 mt-1.5 font-mono">
                Model Synthesis: Parallel Distributed Synthesis Pipeline
              </p>
            </div>

            {/* FLUX Illustrative Graphic Banner */}
            {visualImageUrl && (
              <div className="mb-8 border border-rose-100 rounded-xl overflow-hidden shadow-sm bg-rose-50/10 max-w-xl mx-auto">
                <img
                  src={visualImageUrl}
                  alt="Flux AI Generated Visual Aid"
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-cover aspect-[16/9]"
                />
                <div className="px-4 py-2 bg-rose-50/50 border-t border-rose-100 text-[10px] text-rose-600 font-mono tracking-wider text-center">
                  black-forest-labs/flux.2-klein-4b // Dynamic Lesson Graphic Aid
                </div>
              </div>
            )}

            {/* Simulated Printed Paper Container */}
            <MarkdownView content={pdfContent} />
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 sm:px-6 py-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-b-2xl">
          <p className="hidden sm:block text-xs text-zinc-500 max-w-md text-center sm:text-left">
            Generated file contains beautiful title blocks, active child-friendly chapters, and Flux Illustrations.
          </p>

          <div className="flex items-center space-x-3 w-full sm:w-auto shrink-0">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-sm text-zinc-650 hover:bg-zinc-50 border border-zinc-200 rounded-lg font-semibold transition-all"
            >
              Close
            </button>
            <button
              id="download-pdf-button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className={`w-full sm:w-auto px-5 py-2 text-sm text-white font-semibold rounded-lg flex items-center justify-center space-x-2 transition-all cursor-pointer border ${
                downloadSuccess
                  ? "bg-emerald-600 border-emerald-655 hover:bg-emerald-750"
                  : "bg-rose-600 hover:bg-rose-750 border-rose-655 active:scale-98 shadow-sm"
              }`}
            >
              {downloading ? (
                <>
                  <FileDown className="w-4 h-4 animate-bounce" />
                  <span>Compiling PDF...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Formatted PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
