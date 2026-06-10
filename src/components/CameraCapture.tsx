import React, { useState, useRef } from "react";
import { Camera, Image, Check, RefreshCw, AlertCircle, Video, VideoOff } from "lucide-react";

interface CameraCaptureProps {
  onPhotoCaptured: (base64Image: string) => void;
  savedImage?: string;
}

export default function CameraCapture({ onPhotoCaptured, savedImage }: CameraCaptureProps) {
  const [photo, setPhoto] = useState<string | null>(savedImage || null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Activate capture stream (device webcam)
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setIsCameraActive(false);
      setCameraError("Camera access rejected. Please upload from gallery instead.");
    }
  };

  // Turn off webcam stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Capture frame & compress onto canvas 
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Match camera aspect ratio
        canvas.width = 640;
        canvas.height = 480;
        ctx.drawImage(video, 0, 0, 640, 480);
        
        // Compress as high performance jpeg to stay well below 100KB limits
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.65);
        setPhoto(compressedBase64);
        onPhotoCaptured(compressedBase64);
        stopCamera();
      }
    }
  };

  // Gallery File upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const resultString = reader.result as string;
        
        // Downscale uploaded image on temporary canvas to avoid crashing Firestore sizes
        const img = new Image();
        img.src = resultString;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const MAX_WIDTH = 640;
            const MAX_HEIGHT = 480;
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressed = canvas.toDataURL("image/jpeg", 0.65);
            setPhoto(compressed);
            onPhotoCaptured(compressed);
          }
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const clearPhoto = () => {
    setPhoto(null);
    onPhotoCaptured("");
    stopCamera();
  };

  return (
    <div className="w-full flex flex-col items-center gap-4 p-4 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
      <canvas ref={canvasRef} className="hidden" />

      {/* 1. Camera Viewfinder is Active */}
      {isCameraActive && (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
          <video
            ref={videoRef}
            className="w-full h-full object-cover transform"
            playsInline
            muted
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end justify-center p-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={capturePhoto}
                className="bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs px-5 py-2.5 rounded-full flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <Camera className="w-4 h-4" />
                Capture Photo
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="bg-gray-800/90 hover:bg-gray-700/90 text-white text-xs px-4 py-2.5 rounded-full backdrop-blur-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Photo has been Captured or Uploaded */}
      {!isCameraActive && photo && (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow bg-gray-100 flex items-center justify-center group">
          <img src={photo} alt="Report capture preview" className="w-full h-full object-cover" />
          
          <div className="absolute top-3 right-3 bg-indigo-600 p-1.5 rounded-full text-white shadow-md">
            <Check className="w-4 h-4 stroke-[2.5]" />
          </div>

          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
            <button
              type="button"
              onClick={clearPhoto}
              className="bg-white hover:bg-red-50 text-red-600 font-semibold text-xs px-4 py-2 rounded-lg py-1.5 shadow transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retake / Delete
            </button>
          </div>
        </div>
      )}

      {/* 3. Base Selection State (No camera, no image snapped yet) */}
      {!isCameraActive && !photo && (
        <div className="text-center py-6 px-4 flex flex-col items-center">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-3">
            <Camera className="w-6 h-6 stroke-[1.5]" />
          </div>
          <span className="text-sm font-semibold text-gray-700">Add Report Media</span>
          <p className="text-xs text-gray-400 mt-1 max-w-xs leading-relaxed">
            Snap potholes or broken infrastructure directly or pick a reference image from gallery
          </p>

          <div className="flex gap-4 mt-5">
            <button
              type="button"
              onClick={startCamera}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4.5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Video className="w-4 h-4" />
              Open Camera
            </button>

            <label className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-medium text-xs px-4.5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer">
              <Image className="w-4 h-4 text-gray-500" />
              Upload Photo
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="w-full flex items-center gap-2 bg-rose-50 text-rose-700 text-xs px-4 py-2.5 rounded-xl border border-rose-100">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}
    </div>
  );
}
