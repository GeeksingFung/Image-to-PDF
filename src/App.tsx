/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { jsPDF } from 'jspdf';
import { 
  FileImage, 
  Download, 
  Trash2, 
  GripVertical, 
  UploadCloud, 
  Plus,
  Loader2,
  FileText,
  Monitor,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
}

// Sortable Item Component
function SortableImage({ image, onRemove }: { image: ImageItem; onRemove: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-square relative overflow-hidden bg-slate-50">
        <img 
          src={image.previewUrl} 
          alt={image.name} 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div 
          {...attributes} 
          {...listeners}
          className="absolute top-2 left-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-4 h-4 text-slate-600" />
        </div>
        <button
          onClick={() => onRemove(image.id)}
          className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm text-rose-500 hover:bg-rose-50 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3">
        <p className="text-xs font-medium text-slate-700 truncate" title={image.name}>
          {image.name}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'p' | 'l'>('p');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const newImages: ImageItem[] = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name
      }));

    setImages(prev => {
      const combined = [...prev, ...newImages];
      // Initial sort by name
      return combined.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    });
  }, []);

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const item = prev.find(img => img.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(img => img.id !== id);
    });
  };

  const generatePDF = async () => {
    if (images.length === 0) return;
    setIsGenerating(true);

    try {
      // Create PDF with internal compression enabled
      const pdf = new jsPDF({
        orientation: orientation === 'p' ? 'portrait' : 'landscape',
        unit: 'px',
        compress: true, // Enable internal PDF compression
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < images.length; i++) {
        const imgItem = images[i];
        
        // Load image into HTMLImageElement
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imgItem.previewUrl;
        });

        // Calculate dimensions
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgWidth = img.width;
        const imgHeight = img.height;
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        
        const finalWidth = imgWidth * ratio;
        const finalHeight = imgHeight * ratio;
        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;

        // Use canvas to compress image to JPEG with high quality (0.85)
        // This significantly reduces file size compared to raw data while maintaining clarity
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        ctx?.drawImage(img, 0, 0);
        
        // Convert to JPEG with 0.85 quality - sweet spot for size/quality
        const compressedData = canvas.toDataURL('image/jpeg', 0.85);

        if (i > 0) pdf.addPage(undefined, orientation === 'p' ? 'portrait' : 'landscape');
        
        // Add compressed image to PDF
        // Using 'FAST' compression for the PDF structure itself
        pdf.addImage(compressedData, 'JPEG', x, y, finalWidth, finalHeight, undefined, 'FAST');
      }

      pdf.save('compressed-images.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const activeImage = useMemo(() => images.find(img => img.id === activeId), [activeId, images]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <FileText className="text-white w-6 h-6" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight">Image to PDF</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Professional Converter</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            {/* Orientation Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setOrientation('p')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  orientation === 'p' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Portrait Mode"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Portrait</span>
              </button>
              <button
                onClick={() => setOrientation('l')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  orientation === 'l' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Landscape Mode"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Landscape</span>
              </button>
            </div>

            <button
              onClick={generatePDF}
              disabled={images.length === 0 || isGenerating}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-all shadow-md shadow-indigo-100 active:scale-95"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden xs:inline">{isGenerating ? 'Generating...' : 'Export PDF'}</span>
              <span className="xs:hidden">{isGenerating ? '...' : 'Export'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 md:p-10">
        {/* Drop Zone */}
        <div 
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="mb-10"
        >
          <label className="relative group flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 rounded-3xl bg-white hover:bg-slate-50 hover:border-indigo-400 transition-all cursor-pointer overflow-hidden">
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              className="hidden" 
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-8 h-8 text-indigo-600" />
              </div>
              <p className="mb-2 text-lg font-semibold text-slate-700">
                Click or drag images here
              </p>
              <p className="text-sm text-slate-500">
                PNG, JPG, WEBP up to 10MB each
              </p>
            </div>
          </label>
        </div>

        {/* Image Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              Selected Images
              <span className="bg-slate-200 text-slate-600 text-xs px-2 py-1 rounded-full">
                {images.length}
              </span>
            </h2>
            {images.length > 0 && (
              <p className="text-sm text-slate-500 italic">
                Drag to reorder images
              </p>
            )}
          </div>

          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
              <FileImage className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-400 font-medium">No images uploaded yet</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={images.map(img => img.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  <AnimatePresence>
                    {images.map((image) => (
                      <motion.div
                        key={image.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                      >
                        <SortableImage image={image} onRemove={removeImage} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {/* Add More Button */}
                  <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-white hover:bg-slate-50 hover:border-indigo-300 transition-all cursor-pointer group">
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                    <Plus className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                    <span className="text-xs font-semibold text-slate-400 mt-2 group-hover:text-indigo-500">Add More</span>
                  </label>
                </div>
              </SortableContext>

              <DragOverlay adjustScale={true} dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                  styles: {
                    active: {
                      opacity: '0.5',
                    },
                  },
                }),
              }}>
                {activeId && activeImage ? (
                  <div className="w-40 bg-white rounded-xl border-2 border-indigo-500 shadow-2xl overflow-hidden opacity-90 scale-105">
                    <img 
                      src={activeImage.previewUrl} 
                      alt={activeImage.name} 
                      className="w-full h-40 object-cover"
                    />
                    <div className="p-2">
                      <p className="text-[10px] font-medium text-slate-700 truncate">
                        {activeImage.name}
                      </p>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto p-6 mt-10 border-t border-slate-200 text-center">
        <p className="text-sm text-slate-400">
          All processing happens locally in your browser. Your images are never uploaded to a server.
        </p>
      </footer>
    </div>
  );
}
