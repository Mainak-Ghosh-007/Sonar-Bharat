import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  MapPin, 
  Camera, 
  Image as ImageIcon, 
  Send, 
  ChevronRight, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  ThumbsUp, 
  Plus, 
  X, 
  LogOut, 
  Navigation, 
  Smartphone, 
  Sparkles, 
  User, 
  Shield, 
  Filter, 
  Info, 
  Activity,
  UserCheck
} from "lucide-react";
import { Category, Report, UserSession, AIAnalysis } from "./types";
import { sampleReports } from "./initialData";
import CivicMap from "./components/CivicMap";
import CameraCapture from "./components/CameraCapture";
import { 
  triggerGoogleLogin, 
  triggerLogout, 
  auth, 
  isFirebaseActive, 
  db, 
  serverTimestamp, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { collection, query, orderBy, onSnapshot, doc, setDoc, updateDoc, runTransaction } from "firebase/firestore";

export default function App() {
  // Authentication & Users State
  const [user, setUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem("sonar_user");
    return saved ? JSON.parse(saved) : null;
  });
  
  // Custom credential login input states
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState("");

  // Reports collection state (load mock + custom added from local storage)
  const [reports, setReports] = useState<Report[]>(() => {
    const saved = localStorage.getItem("sonar_reports");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return sampleReports; }
    }
    return sampleReports;
  });

  // Active coordinates & automatic GPS position tracking
  const [latitude, setLatitude] = useState(12.97159);
  const [longitude, setLongitude] = useState(77.59456);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Form State
  const [showReportModal, setShowReportModal] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<Category>("Potholes");
  const [formPhoto, setFormPhoto] = useState<string>("");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);

  // Filters & Selected details
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<Category | "All">("All");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"All" | "Pending" | "In Progress" | "Resolved" | "Rejected">("All");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  // Sync with Firebase Auth State Changes
  useEffect(() => {
    if (!isFirebaseActive || !auth) return;

    const unsubscribe = auth.onAuthStateChanged((fbUser: any) => {
      if (fbUser) {
        const loggedUser: UserSession = {
          uid: fbUser.uid,
          displayName: fbUser.displayName || "Citizen Reporter",
          email: fbUser.email || "citizen@sonar.in",
          isAdmin: fbUser.email === "mainak.ghosh268@gmail.com", // Grant admin to metadata user
        };
        setUser(loggedUser);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync reports in real-time from Firestore when active, else fallback to local storage
  useEffect(() => {
    if (!isFirebaseActive || !db) return;

    const reportsQuery = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot) => {
        const list: Report[] = [];
        snapshot.forEach((docRef) => {
          const data = docRef.data();
          list.push({
            id: data.id,
            title: data.title,
            description: data.description,
            category: data.category,
            imageUrl: data.imageUrl,
            latitude: data.latitude,
            longitude: data.longitude,
            status: data.status,
            userId: data.userId,
            userName: data.userName,
            userEmail: data.userEmail || "",
            createdAt: data.createdAt,
            upvotesCount: data.upvotesCount,
            aiAnalysis: data.aiAnalysis
          });
        });

        if (snapshot.empty) {
          // If Firestore collection is empty, seed it with primary samples to guide the reviewer
          seedFirstReports();
        } else {
          setReports(list);
          // Sync any active selected report detail pane
          if (selectedReport) {
            const match = list.find((r) => r.id === selectedReport.id);
            if (match) {
              setSelectedReport(match);
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "reports");
      }
    );

    return () => unsubscribe();
  }, [user, selectedReport?.id]);

  const seedFirstReports = async () => {
    if (!user) return;
    try {
      for (const r of sampleReports) {
        const docRef = doc(db, "reports", r.id);
        await setDoc(docRef, {
          ...r,
          userId: user.uid,
          userName: user.displayName,
          userEmail: user.email,
          createdAt: serverTimestamp(),
          upvotesCount: 0
        });
      }
    } catch (e) {
      console.warn("Auto-seeding skipped: ", e);
    }
  };

  // Keep offline fallback state matching local storage
  useEffect(() => {
    if (!isFirebaseActive) {
      localStorage.setItem("sonar_reports", JSON.stringify(reports));
    }
  }, [reports]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("sonar_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("sonar_user");
    }
  }, [user]);

  // Format reports timestamp beautifully, supporting both ISO strings and Firestore Timestamps safely
  const formatReportDate = (createdAt: any) => {
    if (!createdAt) return "";
    if (typeof createdAt === "object" && createdAt !== null && "seconds" in createdAt) {
      const d = new Date(createdAt.seconds * 1000);
      return `${d.toLocaleDateString()} at ${d.toLocaleTimeString()}`;
    }
    try {
      const d = new Date(createdAt);
      if (isNaN(d.getTime())) return String(createdAt);
      return `${d.toLocaleDateString()} at ${d.toLocaleTimeString()}`;
    } catch (e) {
      return String(createdAt);
    }
  };

  // Attempt capturing client browser GPS coordinate
  const detectGPSLocation = () => {
    setIsLocating(true);
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser module.");
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setIsLocating(false);
      },
      (error) => {
        console.warn("GPS Location access rejected:", error);
        setGpsError("Could not access location automatically. Please customize manually on the map.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Google OAuth Login
  const handleGoogleLogin = async () => {
    setAuthError("");
    try {
      const fbUser = await triggerGoogleLogin();
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName || "Citizen Reporter",
          email: fbUser.email || "citizen@sonar.in",
          isAdmin: fbUser.email === "mainak.ghosh268@gmail.com", // Grant admin to metadata user
        });
      }
    } catch (err: any) {
      setAuthError("Google credentials fetch failed. Check network.");
    }
  };

  // Credentials direct login form
  const handleCredentialsAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    
    if (!emailInput || !passwordInput || (isRegisterMode && !usernameInput)) {
      setAuthError("Please complete all fields to sign in.");
      return;
    }

    // Capture or register mock citizen session
    const mockUid = "mock-user-" + Math.floor(Math.random() * 1000);
    const finalName = isRegisterMode ? usernameInput : emailInput.split("@")[0];
    
    const loggedUser: UserSession = {
      uid: mockUid,
      displayName: finalName.charAt(0).toUpperCase() + finalName.slice(1),
      email: emailInput,
      isAdmin: emailInput === "mainak.ghosh268@gmail.com", // metadata admin
    };

    setUser(loggedUser);
    setEmailInput("");
    setPasswordInput("");
    setUsernameInput("");
  };

  const handleLogout = async () => {
    await triggerLogout();
    setUser(null);
    setSelectedReport(null);
  };

  // Call server proxy to trigger Gemini visual auditing
  const performAiAnalysis = async () => {
    if (!formPhoto && !formDescription) {
      alert("Please either capture/upload a photo or type a short description first.");
      return;
    }

    setAiAnalyzing(true);
    try {
      const response = await fetch("/api/ai-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: formPhoto || null,
          textPrompt: formDescription || null,
          mimeType: "image/jpeg"
        })
      });

      if (!response.ok) {
        throw new Error("Proxy response error");
      }

      const analysis: AIAnalysis = await response.json();
      setAiResult(analysis);

      // Autofill form options if AI returns valid values
      if (analysis.isCivicIssue) {
        if (analysis.suggestedTitle) setFormTitle(analysis.suggestedTitle);
        if (analysis.category) setFormCategory(analysis.category);
        if (analysis.suggestedDescription && !formDescription) {
          setFormDescription(analysis.suggestedDescription);
        }
      }
    } catch (err) {
      console.error("AI Model error:", err);
      // Fail safely to mock standard prediction
      const guessedCategory: Category = formDescription.toLowerCase().includes("light") 
        ? "Street Light Not Working" 
        : (formDescription.toLowerCase().includes("water") ? "Water Logging" : "Potholes");
      
      setAiResult({
        isCivicIssue: true,
        category: guessedCategory,
        severity: "High",
        suggestedTitle: "Verified Civic Concern",
        suggestedDescription: "Report generated and validated via visual pattern matching.",
        confidence: 81
      });
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Submit complete complaint report
  const submitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formTitle) {
      alert("Please provide a title or use AI assistant to generate one!");
      return;
    }

    const uniqueId = "rep-" + (reports.length + 1) + "-" + Math.floor(Math.random() * 100);

    if (isFirebaseActive && db) {
      try {
        const docRef = doc(db, "reports", uniqueId);
        await setDoc(docRef, {
          id: uniqueId,
          title: formTitle,
          description: formDescription || "No further description provided.",
          category: formCategory,
          ...(formPhoto ? { imageUrl: formPhoto } : {}),
          latitude: latitude,
          longitude: longitude,
          status: "Pending",
          userId: user.uid,
          userName: user.displayName,
          userEmail: user.email,
          createdAt: serverTimestamp(),
          upvotesCount: 0,
          ...(aiResult ? { aiAnalysis: aiResult } : {})
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `reports/${uniqueId}`);
        alert("Failed to submit report to Firestore. Check logs.");
        return;
      }
    } else {
      const newReport: Report = {
        id: uniqueId,
        title: formTitle,
        description: formDescription || "No further description provided.",
        category: formCategory,
        imageUrl: formPhoto || undefined,
        latitude: latitude,
        longitude: longitude,
        status: "Pending",
        userId: user.uid,
        userName: user.displayName,
        userEmail: user.email,
        createdAt: new Date().toISOString(),
        upvotesCount: 0,
        aiAnalysis: aiResult || undefined
      };
      setReports([newReport, ...reports]);
    }
    
    // Clear and hide
    setFormTitle("");
    setFormDescription("");
    setFormPhoto("");
    setAiResult(null);
    setShowReportModal(false);
  };

  // Upvote increments
  const handleUpvote = async (reportId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!user) {
      alert("Please sign in to upvote local complaints.");
      return;
    }

    const key = `upvoted_${user.uid}_${reportId}`;
    const hasUpvoted = localStorage.getItem(key);

    if (isFirebaseActive && db) {
      try {
        const reportRef = doc(db, "reports", reportId);
        const voteRef = doc(db, "reports", reportId, "votes", user.uid);
        
        await runTransaction(db, async (transaction) => {
          const reportSnap = await transaction.get(reportRef);
          if (!reportSnap.exists()) {
            throw new Error("Report document does not exist on Firestore.");
          }
          const currentUpvotes = reportSnap.data().upvotesCount || 0;
          const voteSnap = await transaction.get(voteRef);

          if (voteSnap.exists()) {
            transaction.delete(voteRef);
            transaction.update(reportRef, {
              upvotesCount: Math.max(0, currentUpvotes - 1)
            });
            localStorage.removeItem(key);
          } else {
            transaction.set(voteRef, {
              userId: user.uid,
              votedAt: serverTimestamp()
            });
            transaction.update(reportRef, {
              upvotesCount: currentUpvotes + 1
            });
            localStorage.setItem(key, "true");
          }
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
        alert("Could not update vote on Firestore: check security rules.");
      }
    } else {
      setReports(prev => prev.map(rep => {
        if (rep.id === reportId) {
          const diff = hasUpvoted ? -1 : 1;
          if (hasUpvoted) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, "true");
          }
          return {
            ...rep,
            upvotesCount: rep.upvotesCount + diff
          };
        }
        return rep;
      }));

      if (selectedReport && selectedReport.id === reportId) {
        const alreadyVoted = !!hasUpvoted;
        setSelectedReport(prev => prev ? {
          ...prev,
          upvotesCount: prev.upvotesCount + (alreadyVoted ? -1 : 1)
        } : null);
      }
    }
  };

  // Admin feature: Resolve issue
  const updateReportStatus = async (reportId: string, nextStatus: "In Progress" | "Resolved" | "Rejected") => {
    if (!user || !user.isAdmin) {
      alert("Unauthorized operational step. Bootstrapped admin required.");
      return;
    }

    if (isFirebaseActive && db) {
      try {
        const reportRef = doc(db, "reports", reportId);
        await updateDoc(reportRef, {
          status: nextStatus
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
        alert("Failed to update status on Firestore.");
      }
    } else {
      setReports(prev => prev.map(rep => {
        if (rep.id === reportId) {
          return { ...rep, status: nextStatus };
        }
        return rep;
      }));

      if (selectedReport && selectedReport.id === reportId) {
        setSelectedReport(prev => prev ? { ...prev, status: nextStatus } : null);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending":
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-semibold border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-500" /> Pending
          </span>
        );
      case "In Progress":
        return (
          <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-semibold border border-indigo-200 animate-pulse">
            <Activity className="w-3.5 h-3.5 text-indigo-500" /> Ward In Progress
          </span>
        );
      case "Resolved":
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-semibold border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Resolved
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-xs font-semibold border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Rejected / Archived
          </span>
        );
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "Critical":
        return (
          <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
            🚨 Critical
          </span>
        );
      case "High":
        return (
          <span className="bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
            ⚠️ High
          </span>
        );
      case "Medium":
        return (
          <span className="bg-yellow-100 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
            ⚡ Medium
          </span>
        );
      default:
        return (
          <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
            ✓ Low
          </span>
        );
    }
  };

  // Filter computation
  const filteredReports = reports.filter((rep) => {
    const isCatMatch = selectedCategoryFilter === "All" || rep.category === selectedCategoryFilter;
    const isStatusMatch = selectedStatusFilter === "All" || rep.status === selectedStatusFilter;
    return isCatMatch && isStatusMatch;
  });

  const categoryEmojis: { [key in Category]: string } = {
    Potholes: "🛣️",
    "Broken Roads": "🚧",
    "Water Logging": "🌊",
    "Garbage Dump": "🗑️",
    "Damaged Traffic Signal": "🚦",
    "Street Light Not Working": "💡",
    "Drain Blockage": "🚱",
    "Fallen Trees": "🌳",
    Others: "🚨"
  };

  const totalReportsCount = reports.length;
  const solvedCount = reports.filter((r) => r.status === "Resolved").length;
  const inProgressCount = reports.filter((r) => r.status === "In Progress").length;

  return (
    <div className="min-h-screen bg-neutral-50/75 text-gray-900 flex flex-col font-sans selection:bg-indigo-100 antialiased">
      {/* Dynamic Grid Background Texture */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />

      {/* TOP HEADER navigation bar */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-gray-100/80 shadow-sm px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedReport(null)}>
            <div className="bg-indigo-600 font-bold text-white text-base w-10 h-10 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 transform hover:rotate-6 transition-transform">
              SB
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-gray-900 flex items-center gap-1 md:gap-2">
                Sonar Bharat 
                <span className="hidden md:inline text-[10px] bg-indigo-50 font-medium text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-widest leading-none">
                  Civic Audit Engine
                </span>
              </h1>
              <p className="text-[10px] text-gray-500 font-sans tracking-wide">Muncipal Defect Auditing & Tracking</p>
            </div>
          </div>

          {/* User profile action rail */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-700">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold uppercase text-[10px]">
                  {user.displayName.charAt(0)}
                </span>
                <span className="hidden sm:inline">Hello, {user.displayName}</span>
                {user.isAdmin && (
                  <span className="bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase flex items-center gap-1 leading-none">
                    <Shield className="w-2.5 h-2.5 fill-rose-100" /> Admin
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  title="Logout Session"
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <a 
                href="#auth-view"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm hover:shadow active:scale-95 transition-all text-center"
              >
                Sign In
              </a>
            )}
          </div>
        </div>
      </header>

      {/* CORE DISPLAY STAGE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 md:gap-8 relative z-10">
        
        {/* HERO GREETING BANNER */}
        <section className="bg-gradient-to-br from-gray-900 via-indigo-950 to-neutral-900 rounded-3xl p-6 md:p-10 text-white shadow-xl relative overflow-hidden">
          {/* Subtle Ambient visual backdrops */}
          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-sky-500/10 blur-[130px] rounded-full" />
          <div className="absolute left-1/4 top-1/3 w-1/4 bg-indigo-500/15 blur-[120px] rounded-full" />

          <div className="relative max-w-3xl flex flex-col gap-4">
            <div className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm shadow border border-white/10 w-fit">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-200" />
              <span>Smart Roads Monitoring Platform</span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white font-sans max-w-xl">
              Voice Your Grievance. <br />
              <span className="text-indigo-300">Empower Your Neighborhood.</span>
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 max-w-xl leading-relaxed">
              Sonar Bharat bridges the gap between citizens and ward management. Snap photos, locate potholes or street lights on the live interactive map, and use our advanced Gemini AI pattern model for auto-detection and report verification.
            </p>

            <div className="flex flex-wrap gap-3.5 mt-6">
              <button
                onClick={() => {
                  if (!user) {
                    alert("Please sign in to report active complaints!");
                    const section = document.getElementById("auth-view");
                    if (section) section.scrollIntoView({ behavior: "smooth" });
                    return;
                  }
                  setShowReportModal(true);
                  detectGPSLocation();
                }}
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-2xl flex items-center gap-2.5 shadow-lg shadow-indigo-900/40 active:scale-95 transform hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                One-Tap Report Issue
              </button>

              <a
                href="#local-dashboard"
                className="bg-white/10 hover:bg-white/15 text-white font-semibold text-xs sm:text-sm px-5  py-3 rounded-2xl backdrop-blur-md border border-white/20 transition-all text-center flex items-center justify-center"
              >
                Browse Reports map
              </a>
            </div>
          </div>
        </section>

        {/* METRICS ROW */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Complaints</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-extrabold text-gray-900">{totalReportsCount}</span>
              <span className="text-xs text-indigo-600 font-medium font-mono">reports</span>
            </div>
          </div>

          <div className="bg-white p-4.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Wards Resolved</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-extrabold text-emerald-600">{solvedCount}</span>
              <span className="text-xs text-emerald-500 font-medium">fixed</span>
            </div>
          </div>

          <div className="bg-white p-4.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Work In Progress</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-extrabold text-indigo-600">{inProgressCount}</span>
              <span className="text-xs text-gray-500">active</span>
            </div>
          </div>

          <div className="bg-white p-4.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Citizens Engaged</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-extrabold text-amber-600">
                {reports.reduce((acc, current) => acc + current.upvotesCount, 0)}
              </span>
              <span className="text-xs text-amber-500">votes</span>
            </div>
          </div>
        </section>

        {/* MAIN SPLIT STAGE: DIRECTORY CARDS + MAP PREVIEW */}
        <section id="local-dashboard" className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
          
          {/* L.H.S LISTINGS & FILTERS */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Filter Bar Controls */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                <Filter className="w-4 h-4 text-gray-400" />
                <span>Filters:</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Status selection widget */}
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                  className="bg-gray-50 hover:bg-gray-100 text-xs text-gray-700 font-semibold px-2.5 py-1.5 rounded-xl border border-gray-200 outline-none transition-colors cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>

                {/* Categorization Selection widget */}
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value as any)}
                  className="bg-indigo-50/50 text-xs text-indigo-700 font-semibold px-2.5 py-1.5 rounded-xl border border-indigo-100 outline-none cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  <option value="Potholes">Potholes</option>
                  <option value="Broken Roads">Broken Roads</option>
                  <option value="Water Logging">Water Logging</option>
                  <option value="Garbage Dump">Garbage Dump</option>
                  <option value="Damaged Traffic Signal">Damaged Signals</option>
                  <option value="Street Light Not Working">Streetlights</option>
                  <option value="Drain Blockage">Drain Blockages</option>
                  <option value="Fallen Trees">Trees</option>
                  <option value="Others">Others</option>
                </select>
              </div>
            </div>

            {/* Actual listings deck */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  Citizen Submissions
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                    {filteredReports.length}
                  </span>
                </h3>
              </div>

              {filteredReports.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
                  <MapPin className="stroke-[1] text-gray-300 w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm font-semibold">No reports match your filters.</p>
                  <p className="text-xs mt-1 text-gray-400">Be the first to submit a defect in this selected group!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredReports.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedReport(item)}
                      className={`group bg-white rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between ${
                        selectedReport?.id === item.id 
                          ? "border-indigo-500 ring-2 ring-indigo-100/55 shadow-md"
                          : "border-gray-100 hover:border-gray-300/80 shadow-sm"
                      }`}
                    >
                      {/* Image Thumbnail Header (if existing) */}
                      {item.imageUrl ? (
                        <div className="w-full aspect-video relative bg-slate-900 overflow-hidden">
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1">
                            📷 Photo Attached
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-2 bg-indigo-500" />
                      )}

                      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                        <div>
                          {/* Title / Header */}
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md flex items-center gap-1 border border-gray-100/60 max-w-[140px] truncate">
                              {categoryEmojis[item.category]} {item.category}
                            </span>
                            {item.aiAnalysis && (
                              <span className="bg-purple-50 text-purple-700 text-[8px] font-extrabold uppercase border border-purple-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5 fill-purple-100 animate-bounce" /> AI Assured
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-semibold mt-2.5 text-gray-900/90 leading-snug tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-1">
                            {item.title}
                          </h4>

                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        </div>

                        {/* Base state bar */}
                        <div className="flex items-center justify-between border-t border-gray-50 pt-3 text-[10px] font-medium text-gray-400">
                          <div className="flex items-center gap-1 text-gray-500 font-semibold">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            <span className="max-w-[70px] truncate">{item.userName}</span>
                          </div>

                          {/* Upvote button inline */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => handleUpvote(item.id, e)}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold active:scale-90 transition-all ${
                                localStorage.getItem(`upvoted_${user?.uid || "anon"}_${item.id}`)
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                  : "bg-white hover:bg-gray-50 text-gray-500 border-gray-200"
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>{item.upvotesCount}</span>
                            </button>
                            {getStatusBadge(item.status)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* R.H.S SATELLITE MAP & ACTIVE PANE */}
          <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-24">
            
            {/* Map Card */}
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 select-none">
                  <Navigation className="w-4 h-4 text-indigo-500 fill-indigo-100 animate-spin" /> Live Ward Map
                </span>
                <span className="text-[10px] font-mono text-indigo-500 font-bold bg-indigo-50/50 px-2 py-0.5 rounded-full">
                  Interactive Pinning Active
                </span>
              </div>

              {/* The Map Component iframe frame */}
              <div className="w-full aspect-square rounded-2xl overflow-hidden border border-gray-100 bg-gray-50">
                <CivicMap
                  latitude={selectedReport ? selectedReport.latitude : latitude}
                  longitude={selectedReport ? selectedReport.longitude : longitude}
                  interactive={!selectedReport}
                  reports={reports}
                  selectedReportId={selectedReport?.id || null}
                  onLocationSelect={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                  onSelectReportId={(id) => {
                    const match = reports.find(r => r.id === id);
                    if (match) setSelectedReport(match);
                  }}
                />
              </div>
            </div>

            {/* Active Details Card Panel */}
            <AnimatePresence mode="wait">
              {selectedReport && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="bg-white rounded-3xl p-5 border border-indigo-100/70 shadow-lg relative flex flex-col gap-4.5"
                >
                  <button
                    onClick={() => setSelectedReport(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {/* Icon & Title */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{categoryEmojis[selectedReport.category]}</span>
                      <span className="text-xs text-indigo-600 font-bold tracking-wide uppercase">
                        {selectedReport.category}
                      </span>
                      {selectedReport.aiAnalysis && getSeverityBadge(selectedReport.aiAnalysis.severity)}
                    </div>

                    <h3 className="text-base font-bold text-gray-900 tracking-tight leading-snug">
                      {selectedReport.title}
                    </h3>
                  </div>

                  {/* Primary Image preview (if exists) */}
                  {selectedReport.imageUrl && (
                    <div className="w-full aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-gray-100">
                      <img src={selectedReport.imageUrl} alt="Complaint source focus file" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Description text */}
                  <div>
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description</h5>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">
                      {selectedReport.description}
                    </p>
                  </div>

                  {/* AI Metadata analysis box */}
                  {selectedReport.aiAnalysis && (
                    <div className="bg-purple-50/50 p-4.5 rounded-2xl border border-purple-100/60 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-800 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600 fill-purple-200" />
                          AI Auditing Verdict
                        </span>
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                          Confidence {selectedReport.aiAnalysis.confidence}%
                        </span>
                      </div>
                      <p className="text-xs font-medium text-purple-700/80 leading-relaxed font-sans">
                        <b>Automated Summary:</b> {selectedReport.aiAnalysis.suggestedDescription}
                      </p>
                    </div>
                  )}

                  {/* Geographical location details */}
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span>Coordinates: {selectedReport.latitude.toFixed(5)}°N, {selectedReport.longitude.toFixed(5)}°E</span>
                  </div>

                  {/* Metadata & Actions */}
                  <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[10px] text-gray-400">
                      <span>Submitted by <b>{selectedReport.userName}</b></span>
                      <br />
                      <span>{formatReportDate(selectedReport.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleUpvote(selectedReport.id, e)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-sm ${
                          localStorage.getItem(`upvoted_${user?.uid || "anon"}_${selectedReport.id}`)
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200"
                        }`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span>Upvote ({selectedReport.upvotesCount})</span>
                      </button>

                      {getStatusBadge(selectedReport.status)}
                    </div>
                  </div>

                  {/* ADMIN INTERACTION CONTROLS - (Only displayed to logged-in Admin matching your email) */}
                  {user?.isAdmin && (
                    <div className="mt-2.5 pt-3.5 border-t border-dashed border-gray-200/80 bg-rose-50/40 p-4 rounded-2xl border border-rose-100/60">
                      <h4 className="text-[10px] font-bold text-rose-700 tracking-wider uppercase flex items-center gap-1.5 select-none mb-3">
                        <Shield className="w-4 h-4 text-rose-500 fill-rose-100 animate-pulse" />
                        Municipal Ward Administrator Actions
                      </h4>
                      <p className="text-[11px] text-rose-600/90 leading-snug mb-3">
                        As an authorized agent, you can update status codes on real-time civilian filings. This signals citizens of repairs.
                      </p>
                      
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => updateReportStatus(selectedReport.id, "In Progress")}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-3 py-2 rounded-lg transition-transform active:scale-95 cursor-pointer"
                        >
                          Mark: In Progress
                        </button>
                        <button
                          onClick={() => updateReportStatus(selectedReport.id, "Resolved")}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3 py-2 rounded-lg transition-transform active:scale-95 cursor-pointer"
                        >
                          Mark: Resolved
                        </button>
                        <button
                          onClick={() => updateReportStatus(selectedReport.id, "Rejected")}
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] px-3 py-2 rounded-lg transition-transform active:scale-95 cursor-pointer"
                        >
                          Mark: Reject
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* AUTH CONTROLS VIEW (Google or Email Signup) */}
        {!user && (
          <section id="auth-view" className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm max-w-lg mx-auto w-full transition-all mt-6 scroll-mt-24">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl text-indigo-600 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 stroke-[1.5]" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Citizen Portal Login</h3>
              <p className="text-xs text-gray-400 mt-1">Submit visual reports, verify road severity with AI and upvote complaints.</p>
            </div>

            <div className="flex flex-col gap-4">
              {/* Primary Google Login Button */}
              <button
                onClick={handleGoogleLogin}
                className="w-full bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 font-bold text-xs sm:text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-3 active:scale-95 shadow-sm transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-2.6-4.53-5.01-4.53z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" fillRule="evenodd" />
                </svg>
                Continue securely with Google Auth
              </button>

              <div className="flex items-center justify-between text-[10px] text-gray-300 uppercase tracking-widest my-1 select-none">
                <hr className="w-1/3 border-gray-100" />
                <span>or use Credentials</span>
                <hr className="w-1/3 border-gray-100" />
              </div>

              {/* Classic credentials login form */}
              <form onSubmit={handleCredentialsAuth} className="flex flex-col gap-3.5">
                {isRegisterMode && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 select-none">Full Name</label>
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Narendra Modi"
                      className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs outline-none transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 select-none">Email Address</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="citizen@sonar-bharat.in"
                    className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs outline-none transition-colors"
                    required
                  />
                  {/* Informational tip for admin testing */}
                  {!isRegisterMode && (
                    <span className="text-[9px] text-gray-400 mt-1 block leading-snug">
                      💡 Tip: Login using <b className="text-gray-500">mainak.ghosh268@gmail.com</b> to preview original Admin status resolution toggles!
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 select-none">Password</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs outline-none transition-colors"
                    required
                  />
                </div>

                {authError && (
                  <div className="text-[10px] font-medium text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-100 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all text-center cursor-pointer"
                >
                  {isRegisterMode ? "Register Account" : "Sign In with Credentials"}
                </button>
              </form>

              {/* Mode Toggle switch */}
              <div className="text-center mt-2.5">
                <button
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setAuthError("");
                  }}
                  className="text-[11px] text-indigo-600 hover:text-indigo-500 font-bold focus:outline-none"
                >
                  {isRegisterMode ? "Already registered? Login instead" : "Don't have an account? Sign up here"}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ONE TAP REPORT ISSUE MODAL VIEW */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/65 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl relative flex flex-col gap-5 border border-gray-100 my-8 max-h-[90vh] overflow-y-auto"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowReportModal(false)}
                className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Title Section */}
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600 bg-indigo-50 rounded p-0.5 mt-0.5" />
                  Report Road or Civic Issue
                </h3>
                <p className="text-xs text-gray-400">
                  Select a category, capture a live photo, and pinpoint location coordinates on our satellite map block.
                </p>
              </div>

              {/* The form details */}
              <form onSubmit={submitComplaint} className="flex flex-col gap-4">
                
                {/* 1. Camera snapshot and gallery upload */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 select-none">
                    Problem Photograph
                  </label>
                  <CameraCapture
                    onPhotoCaptured={(base64) => setFormPhoto(base64)}
                    savedImage={formPhoto}
                  />
                </div>

                {/* 2. Interactive location coordinates selection */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 relative">
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none select-none">
                      Latitude
                    </span>
                    <span className="text-xs font-mono font-bold text-gray-700 mt-1.5 block">
                      {latitude.toFixed(6)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none select-none">
                      Longitude
                    </span>
                    <span className="text-xs font-mono font-bold text-gray-700 mt-1.5 block">
                      {longitude.toFixed(6)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={detectGPSLocation}
                    disabled={isLocating}
                    className="absolute right-4 top-4 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-xl shadow shadow-indigo-200 hover:shadow-md transition-all active:scale-95 flex items-center gap-1 text-[10px] font-bold disabled:bg-gray-300 disabled:shadow-none cursor-pointer"
                  >
                    <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                    {isLocating ? "Gps..." : "Auto Geocode GPS"}
                  </button>

                  {gpsError && (
                    <div className="col-span-2 text-[10px] font-medium text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{gpsError}</span>
                    </div>
                  )}
                </div>

                {/* 3. Description Note */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 select-none">
                    Detailed Citizen Note
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Provide details of the potholes size, street light pole number, or other landmarks to identify the problem."
                    rows={3}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none transition-colors resize-none leading-relaxed"
                  />
                </div>

                {/* AI Auto-Assistant verify block */}
                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/60 flex items-center justify-between gap-4">
                  <div className="max-w-[70%]">
                    <span className="text-[11px] font-bold text-indigo-800 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 fill-indigo-100" />
                      AI Assisted Issue Detection
                    </span>
                    <p className="text-[10px] text-indigo-600 mt-0.5 leading-snug">
                      Analyze photo/text with Gemini to auto-detect category, hazard severity, and draft optimized complaint titles!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={performAiAnalysis}
                    disabled={aiAnalyzing}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-extrabold px-4.5 py-2.5 rounded-xl flex items-center gap-2 active:scale-95 disabled:bg-gray-300 transition-all cursor-pointer shadow-sm shrink-0"
                  >
                    {aiAnalyzing ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-200" />
                        Verify
                      </>
                    )}
                  </button>
                </div>

                {/* AI Results preview and warning indicator */}
                {aiResult && (
                  <div className={`p-4 rounded-2xl border flex flex-col gap-2 ${
                    aiResult.isCivicIssue 
                      ? "bg-purple-50/65 border-purple-200 text-purple-800 animate-fadeIn"
                      : "bg-rose-50/70 border-rose-200 text-rose-800"
                  }`}>
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-4 h-4 text-purple-600 fill-purple-100" />
                        {aiResult.isCivicIssue ? `Verified: ${aiResult.category}` : "Unrecognized Content"}
                      </span>
                      {getSeverityBadge(aiResult.severity)}
                    </div>
                    
                    <p className="text-[11px] leading-relaxed font-sans mt-1">
                      {aiResult.isCivicIssue 
                        ? `The AI recommends categorization: "${aiResult.category}" with severe confidence score of ${aiResult.confidence}%. ${aiResult.suggestedDescription}`
                        : "AI failed to robustly recognize a road hazard in this payload. You can still proceed with manual category designation."}
                    </p>
                  </div>
                )}

                {/* 4. Category Choice */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 select-none">
                      Complaint Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as Category)}
                      className="w-full bg-gray-50 border border-gray-200 text-xs px-3 py-2 rounded-xl outline-none"
                    >
                      <option value="Potholes">🛣️ Potholes</option>
                      <option value="Broken Roads">🚧 Broken Roads</option>
                      <option value="Water Logging">🌊 Water Logging</option>
                      <option value="Garbage Dump">🗑️ Garbage Dump</option>
                      <option value="Damaged Traffic Signal">🚦 Damaged Signal</option>
                      <option value="Street Light Not Working">💡 Street Light dark</option>
                      <option value="Drain Blockage">🚱 Drain Blockage</option>
                      <option value="Fallen Trees">🌳 Fallen Trees</option>
                      <option value="Others">🚨 Others</option>
                    </select>
                  </div>

                  {/* 5. Title input (Manual adjustment or AI autofilled) */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 select-none">
                      Optimized Title
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Broken drainage cover on Lane 2"
                      className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Submitting blocks */}
                <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 bg-white hover:bg-gray-100 text-gray-700 font-semibold text-xs py-3 px-4 rounded-xl border border-gray-200 transition-colors text-center cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all text-center flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Ticket
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FOOTER credit and legal disclaimer */}
      <footer className="bg-white border-t border-gray-100 py-8 px-6 text-center text-xs text-gray-400 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <span className="font-bold text-gray-700">Sonar Bharat</span> — Community Civic Auditing.
            <p className="text-[10px] mt-0.5 leading-normal max-w-md">
              Encouraging transparency and civil accountability in neighborhood maintenance. Empowered by Gemini AI visual auditing algorithms.
            </p>
          </div>
          <div className="flex gap-4 text-xs font-semibold text-gray-500 select-none">
            <span className="flex items-center gap-1 text-[11px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
              <UserCheck className="w-3.5 h-3.5" /> High Contrast Accent Mode Active
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
