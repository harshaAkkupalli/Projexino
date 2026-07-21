/**
 * PublicTestimonialSubmit.jsx — /testimonial/:token
 *
 * Token-based public form that lets a client submit a testimonial. Supports:
 *   • Star rating
 *   • Text message
 *   • Video upload (any device) OR in-browser recording (MediaRecorder, max 3 min)
 *
 * Once submitted, the testimonial goes to status=pending and the admin must
 * approve it before it surfaces on the public site.
 */
import React, { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Star, Video as VideoIcon, Square, Upload, RotateCcw, Send, CheckCircle2, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_RECORD_SECONDS = 180; // 3 minutes
const MAX_UPLOAD_MB = 200;

export default function PublicTestimonialSubmit() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: "", already: false, prefill: null });
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [designation, setDesignation] = useState("");
  const [projectName, setProjectName] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("none"); // none | upload | record
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Recording
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const livePreviewRef = useRef(null);

  // Load token
  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API}/public/testimonials/by-token/${token}`)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.already_submitted) {
          setState({ loading: false, error: "", already: true, prefill: data });
        } else {
          setState({ loading: false, error: "", already: false, prefill: data });
          setClientName(data.client_name || "");
          setCompany(data.company || "");
          setProjectName(data.project_name || "");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err?.response?.data?.detail || "This feedback link is invalid or has expired.",
          already: false,
          prefill: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ----- recording helpers -----
  const stopTracks = () => {
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {
      /* ignore stop errors */
    }
    streamRef.current = null;
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => {
    stopTracks();
    stopTimer();
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (livePreviewRef.current) {
        livePreviewRef.current.srcObject = stream;
        livePreviewRef.current.muted = true;
        await livePreviewRef.current.play().catch(() => {});
      }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], `testimonial-${Date.now()}.webm`, { type: mime });
        setVideoFile(file);
        setVideoUrl(URL.createObjectURL(blob));
        stopTracks();
      };
      recorderRef.current = rec;
      rec.start(1000);
      setRecording(true);
      setRecordedSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordedSeconds((s) => {
          const n = s + 1;
          if (n >= MAX_RECORD_SECONDS) {
            stopRecording();
          }
          return n;
        });
      }, 1000);
    } catch (e) {
      toast.error(`Microphone / camera access denied. ${e?.message || ""}`);
    }
  };

  const stopRecording = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore stop errors */
    }
    stopTimer();
    setRecording(false);
  };

  const clearVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl("");
    setRecordedSeconds(0);
  };

  const onFilePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_UPLOAD_MB} MB)`);
      return;
    }
    if (!f.type.startsWith("video/")) {
      toast.error("Please pick a video file");
      return;
    }
    setVideoFile(f);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!clientName.trim()) return toast.error("Please enter your name");
    if (message.trim().length < 4) return toast.error("Please write at least a few words");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("client_name", clientName);
      fd.append("company", company);
      fd.append("designation", designation);
      fd.append("project_name", projectName);
      fd.append("rating", String(rating));
      fd.append("message", message);
      if (videoFile) fd.append("video", videoFile);
      if (avatarFile) fd.append("avatar", avatarFile);
      await axios.post(`${API}/public/testimonials/submit/${token}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSubmitted(true);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to submit. Please try again.");
    }
    setSubmitting(false);
  };

  if (state.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FFF7ED]">
        <Loader2 size={28} className="animate-spin text-[#F97316]" />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="bg-[#FFF7ED]">
        <Navbar />
        <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-3xl font-light text-[#0F2042] md:text-4xl">Link unavailable</h1>
          <p className="mt-3 text-sm text-slate-600">{state.error}</p>
          <Link to="/" className="btn-primary mt-6">Back to homepage</Link>
        </div>
        <Footer />
      </div>
    );
  }
  if (state.already || submitted) {
    return (
      <div className="bg-[#FFF7ED]">
        <Navbar />
        <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center" data-testid="testimonial-submit-success">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700 shadow-lg">
            <CheckCircle2 size={42} />
          </div>
          <h1 className="font-display mt-6 text-3xl font-light text-[#0F2042] md:text-4xl">Thank you! 🎉</h1>
          <p className="mt-3 max-w-md text-sm text-slate-600">
            Your testimonial has been received. Once our team approves it, it&apos;ll appear on our Client Stories page.
          </p>
          <Link to="/testimonials" className="btn-primary mt-6">See all client stories</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="bg-[#FFF7ED]">
      <Navbar />
      <section className="relative overflow-hidden pt-28 pb-16">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-[#F97316]/25 blur-3xl" />
          <div className="absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-[#7C3AED]/20 blur-3xl" />
        </div>
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// feedback</div>
          <h1 className="font-display mt-2 text-4xl font-light text-[#0F2042] sm:text-5xl">
            Share your <span className="italic text-[#F97316]">experience</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-600">
            Your honest feedback helps us improve and gives future clients the confidence to pick us. Takes ~2 minutes.
          </p>

          <div
            className="mt-10 overflow-hidden rounded-3xl border border-white/40 p-7 shadow-2xl backdrop-blur-xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,247,237,0.75) 100%)",
            }}
            data-testid="testimonial-form-card"
          >
            {/* Rating */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">// rating</label>
              <div className="mt-2 flex items-center gap-1" data-testid="testimonial-rating">
                {Array.from({ length: 5 }).map((_, i) => {
                  const n = i + 1;
                  const active = (hoverRating || rating) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(n)}
                      data-testid={`rating-${n}`}
                      className="transition-transform hover:scale-110"
                      aria-label={`${n} stars`}
                    >
                      <Star
                        size={32}
                        className={active ? "fill-[#FBBF24] text-[#FBBF24]" : "text-slate-300"}
                      />
                    </button>
                  );
                })}
                <span className="ml-3 text-sm text-slate-500">{rating} out of 5</span>
              </div>
            </div>

            {/* Identity */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Your name *">
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  data-testid="testimonial-name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
                  placeholder="e.g. Riya Sharma"
                />
              </Field>
              <Field label="Company">
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  data-testid="testimonial-company"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
                  placeholder="Optional"
                />
              </Field>
              <Field label="Designation" className="sm:col-span-2">
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  data-testid="testimonial-designation"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
                  placeholder="e.g. CTO, Founder, Product Manager"
                />
              </Field>
              <Field label="Project" className="sm:col-span-2">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  data-testid="testimonial-project"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
                  placeholder="e.g. Mobile app revamp"
                />
              </Field>
            </div>

            {/* Message */}
            <div className="mt-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">// your story</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                data-testid="testimonial-message"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#F97316]"
                placeholder="What did the team get right? Any specific outcomes you're proud of?"
              />
              <div className="text-right text-[10px] text-slate-400">{message.length} / 4000</div>
            </div>

            {/* Profile photo (optional) */}
            <div className="mt-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">// profile photo (optional)</label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div
                  className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-gradient-to-br from-[#F97316] to-[#7C3AED] text-lg font-bold text-white"
                  data-testid="avatar-preview"
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    : <span>{(clientName || "C").charAt(0).toUpperCase()}</span>}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:border-[#F97316] hover:text-[#F97316]" data-testid="avatar-pick">
                  <Upload size={11} /> Upload photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 6 * 1024 * 1024) { toast.error("Photo too big (max 6 MB)"); return; }
                      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
                      setAvatarFile(f);
                      setAvatarUrl(URL.createObjectURL(f));
                    }}
                  />
                </label>
                {avatarFile && (
                  <button
                    type="button"
                    onClick={() => {
                      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
                      setAvatarFile(null);
                      setAvatarUrl("");
                    }}
                    className="text-xs text-slate-500 hover:text-rose-500"
                    data-testid="avatar-clear"
                  >
                    Remove
                  </button>
                )}
                <span className="text-[10px] text-slate-400">PNG / JPG up to 6 MB. Skip to use a generated avatar.</span>
              </div>
            </div>

            {/* Video options */}
            <div className="mt-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">// video (optional, 3 min max)</label>
              {mode === "none" && !videoFile && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("record")}
                    data-testid="video-mode-record"
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow"
                  >
                    <VideoIcon size={12} /> Record now
                  </button>
                  <label
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:border-[#F97316] hover:text-[#F97316]"
                    data-testid="video-mode-upload"
                  >
                    <Upload size={12} /> Upload a file
                    <input type="file" accept="video/*" onChange={onFilePick} className="hidden" />
                  </label>
                </div>
              )}

              {mode === "record" && !videoFile && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-black p-2 text-white">
                  <video ref={livePreviewRef} className="aspect-video w-full rounded-xl bg-black" playsInline />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {!recording ? (
                      <button
                        onClick={startRecording}
                        data-testid="rec-start"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow"
                      >
                        <VideoIcon size={12} /> Start recording
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        data-testid="rec-stop"
                        className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow"
                      >
                        <Square size={12} /> Stop
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (recording) stopRecording();
                        setMode("none");
                      }}
                      className="text-xs text-slate-300 hover:text-white"
                      data-testid="rec-cancel"
                    >
                      Cancel
                    </button>
                    {recording && (
                      <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-200">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" /> REC · {mmss(recordedSeconds)} / {mmss(MAX_RECORD_SECONDS)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {videoFile && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3" data-testid="video-preview">
                  <video src={videoUrl} controls className="aspect-video w-full rounded-xl bg-black" />
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{(videoFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                    <button
                      onClick={() => {
                        clearVideo();
                        setMode("none");
                      }}
                      data-testid="video-clear"
                      className="inline-flex items-center gap-1 text-[#F97316] hover:underline"
                    >
                      <RotateCcw size={11} /> Replace
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="mt-7 flex justify-end">
              <button
                onClick={submit}
                disabled={submitting}
                data-testid="testimonial-submit"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Submit feedback
              </button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
