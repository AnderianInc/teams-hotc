import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
  MicOff,
  ArrowLeft,
  BookOpen,
  Plus,
  AlertCircle,
  Check,
  Radio,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// Web Speech API type declarations
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface VerseData {
  reference: string;
  text: string;
  translation_name?: string;
}

interface DetectedVerse {
  reference: string;
  verse?: VerseData;
  loading: boolean;
  addedToFeed: boolean;
}

const BIBLE_BOOK_NAMES = [
  "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles",
  "1 Corinthians","2 Corinthians","1 Thessalonians","2 Thessalonians",
  "1 Timothy","2 Timothy","1 Peter","2 Peter","1 John","2 John","3 John",
  "Song of Solomon",
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges",
  "Ruth","Ezra","Nehemiah","Esther","Job","Psalms","Psalm","Proverbs",
  "Ecclesiastes","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel",
  "Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk",
  "Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke",
  "John","Acts","Romans","Galatians","Ephesians","Philippians","Colossians",
  "Titus","Philemon","Hebrews","James","Jude","Revelation",
];

// Build regex once — longer names first to avoid partial matches
const bookPattern = BIBLE_BOOK_NAMES.sort((a, b) => b.length - a.length)
  .map((b) => b.replace(/\s+/g, "\\s+"))
  .join("|");
const VERSE_REGEX_SOURCE = `\\b(${bookPattern})\\s+(\\d+):(\\d+)(?:\\s*[-\u2013]\\s*(\\d+))?\\b`;

function detectVerseReferences(text: string): string[] {
  const regex = new RegExp(VERSE_REGEX_SOURCE, "gi");
  const results: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const ref = match[0].trim();
    const key = ref.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(ref);
    }
  }
  return results;
}

async function fetchVerse(reference: string): Promise<VerseData | null> {
  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return {
      reference: data.reference,
      text: (data.text as string).trim().replace(/\n/g, " "),
      translation_name: data.translation_name,
    };
  } catch {
    return null;
  }
}

type MicStatus = "idle" | "checking" | "granted" | "denied";

export default function SermonMode() {
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [feedText, setFeedText] = useState("");
  const [detectedVerses, setDetectedVerses] = useState<DetectedVerse[]>([]);
  const [feedItems, setFeedItems] = useState<string[]>([]);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const isListeningRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const seenRefsRef = useRef(new Set<string>());

  const processVerses = useCallback((text: string) => {
    const refs = detectVerseReferences(text).filter(
      (r) => !seenRefsRef.current.has(r.toLowerCase())
    );
    if (!refs.length) return;

    refs.forEach((r) => seenRefsRef.current.add(r.toLowerCase()));

    setDetectedVerses((prev) => [
      ...prev,
      ...refs.map((reference) => ({ reference, loading: true, addedToFeed: false })),
    ]);

    refs.forEach((ref) => {
      fetchVerse(ref).then((verse) => {
        setDetectedVerses((prev) =>
          prev.map((v) =>
            v.reference.toLowerCase() === ref.toLowerCase()
              ? { ...v, verse: verse ?? undefined, loading: false }
              : v
          )
        );
      });
    });
  }, []);

  // Detect verses in feed text (debounced)
  useEffect(() => {
    if (feedText.length < 4) return;
    const timer = setTimeout(() => processVerses(feedText), 500);
    return () => clearTimeout(timer);
  }, [feedText, processVerses]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
      recognitionRef.current?.abort();
    };
  }, []);

  const enableMic = async () => {
    setMicStatus("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setAudioLevel(avg / 128);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
    }
  };

  const startListening = useCallback(() => {
    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += " " + t;
        } else {
          interim = t;
        }
      }
      const combined = finalTranscriptRef.current + (interim ? " " + interim : "");
      setLiveTranscript(combined.trimStart());
      processVerses(combined);
    };

    rec.onerror = () => {
      isListeningRef.current = false;
      setIsListening(false);
    };

    rec.onend = () => {
      // Auto-restart unless the user stopped it
      if (isListeningRef.current) rec.start();
    };

    rec.start();
    recognitionRef.current = rec;
    isListeningRef.current = true;
    setIsListening(true);
  }, [processVerses]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const addToFeed = useCallback((ref: string, verse: VerseData) => {
    const item = `${verse.reference} — "${verse.text}"`;
    setFeedItems((prev) => [...prev, item]);
    setDetectedVerses((prev) =>
      prev.map((v) =>
        v.reference.toLowerCase() === ref.toLowerCase() ? { ...v, addedToFeed: true } : v
      )
    );
    toast.success(`${verse.reference} added to feed`);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>

          <div className="flex items-center gap-2 font-semibold font-display">
            <Radio className="w-4 h-4 text-primary" />
            Sermon Mode
          </div>

          <div className="flex items-center gap-2 min-w-0">
            {micStatus === "granted" && (
              <>
                <div
                  className="h-3 w-20 rounded-full bg-muted overflow-hidden"
                  title="Microphone level"
                >
                  <div
                    className="h-full bg-primary transition-all duration-75 rounded-full"
                    style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                  />
                </div>
                {isListening && (
                  <Badge variant="outline" className="text-xs gap-1 border-primary/50 text-primary">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    Live
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 container py-8">
        {/* Microphone setup */}
        {micStatus !== "granted" && (
          <div className="max-w-md mx-auto text-center py-20">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
                micStatus === "denied" ? "bg-destructive/10" : "bg-accent"
              }`}
            >
              {micStatus === "denied" ? (
                <MicOff className="w-12 h-12 text-destructive" />
              ) : (
                <Mic className={`w-12 h-12 text-primary ${micStatus === "checking" ? "animate-pulse" : ""}`} />
              )}
            </div>

            <h2 className="text-2xl font-bold font-display mb-2">
              {micStatus === "denied" ? "Microphone Access Denied" : "Verify Microphone"}
            </h2>
            <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">
              {micStatus === "denied"
                ? "Microphone access was blocked. Allow it in your browser's site settings, then reload the page."
                : "Sermon Mode listens to the audio stream to detect Bible references and generate verse suggestions in real time."}
            </p>

            {micStatus !== "denied" && (
              <Button size="lg" onClick={enableMic} disabled={micStatus === "checking"}>
                <Mic className="w-4 h-4 mr-2" />
                {micStatus === "checking" ? "Verifying microphone…" : "Enable Microphone"}
              </Button>
            )}

            {micStatus === "denied" && (
              <div className="flex items-start gap-3 text-left p-4 rounded-xl bg-destructive/10 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Click the lock/camera icon in your browser's address bar → Site settings →
                  Microphone → Allow, then reload this page.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Main two-panel layout */}
        {micStatus === "granted" && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left panel: Stream + Feed */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold font-display flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  Live Stream
                </h2>
                <Button
                  size="sm"
                  variant={isListening ? "destructive" : "default"}
                  onClick={isListening ? stopListening : startListening}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-3.5 h-3.5 mr-1.5" /> Stop Listening
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 mr-1.5" /> Start Listening
                    </>
                  )}
                </Button>
              </div>

              {/* Voice transcript */}
              <div className="min-h-40 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-4 text-sm leading-relaxed">
                {liveTranscript ? (
                  <p>{liveTranscript}</p>
                ) : (
                  <p className="text-muted-foreground italic">
                    {isListening
                      ? "Listening… speak a Bible reference like "John 3:16""
                      : "Press "Start Listening" to begin voice detection from the stream."}
                  </p>
                )}
              </div>

              {/* Feed input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Feed Input</label>
                <Textarea
                  placeholder="Type sermon notes or stream captions — verse references are detected automatically alongside voice input…"
                  value={feedText}
                  onChange={(e) => setFeedText(e.target.value)}
                  className="min-h-32 resize-none text-sm"
                />
              </div>

              {/* Feed output */}
              {feedItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Added to Feed
                  </p>
                  <div className="space-y-2">
                    {feedItems.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-accent/50 border border-border px-3 py-2.5 text-sm"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right panel: Verse suggestions */}
            <div className="space-y-4">
              <h2 className="font-semibold font-display flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Verse Suggestions
                {detectedVerses.length > 0 && (
                  <Badge variant="secondary">{detectedVerses.length}</Badge>
                )}
              </h2>

              {detectedVerses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-10 text-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    Bible references detected from voice or feed input will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {detectedVerses.map((v) => (
                    <div
                      key={v.reference.toLowerCase()}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Badge variant="outline" className="font-medium shrink-0">
                          {v.verse?.reference ?? v.reference}
                        </Badge>
                        {v.addedToFeed ? (
                          <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                            <Check className="w-3 h-3" /> Added
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs shrink-0"
                            disabled={v.loading || !v.verse}
                            onClick={() => v.verse && addToFeed(v.reference, v.verse)}
                          >
                            <Plus className="w-3 h-3 mr-1" /> Add to Feed
                          </Button>
                        )}
                      </div>

                      {v.loading ? (
                        <p className="text-xs text-muted-foreground animate-pulse">
                          Fetching verse…
                        </p>
                      ) : v.verse ? (
                        <>
                          <p className="text-sm leading-relaxed">{v.verse.text}</p>
                          {v.verse.translation_name && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {v.verse.translation_name}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Could not fetch verse text.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
