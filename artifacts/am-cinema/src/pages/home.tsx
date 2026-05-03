import { useState, useEffect } from "react";
import { useGetTrendingMovies, useGetTrendingSeries } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Play, TrendingUp, Tv, Film, Star, History, X, Sparkles, Grid3X3, ChevronRight, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getWatchHistory, removeFromWatchHistory, type WatchHistoryItem } from "@/hooks/use-watch-history";
import { useLang } from "@/contexts/lang";
import { GENRES } from "@/data/genres-client";

interface MediaCardItem {
  imdbId: string;
  title: string;
  poster?: string | null;
  year?: string | null;
  imdbRating?: string | null;
  genre?: string | null;
  type?: string;
}

function ContinueWatchingRow() {
  const { t } = useLang();
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  useEffect(() => { setHistory(getWatchHistory()); }, []);
  const handleRemove = (e: React.MouseEvent, imdbId: string) => {
    e.preventDefault(); e.stopPropagation();
    removeFromWatchHistory(imdbId); setHistory(getWatchHistory());
  };
  if (history.length === 0) return null;
  return (
    <section>
      <SectionHeader icon={<History size={20} className="text-primary" />} title={t("متابعة المشاهدة", "Continue Watching")} />
      <div className="relative">
        <div className="flex overflow-x-auto gap-5 pb-6 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          <AnimatePresence>
            {history.map((item, i) => (
              <motion.div key={item.imdbId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.4, delay: i * 0.05 }} className="snap-start flex-shrink-0 w-[150px] md:w-[200px] relative group/card">
                <Link href={`/watch/${item.imdbId}`} className="group block">
                  <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 shadow-2xl shadow-black/60 border border-white/8 mb-3">
                    {item.poster && item.poster !== "N/A" ? (
                      <img src={item.poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Film size={32} /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                      <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/40">
                        <Play fill="currentColor" size={18} className="ml-0.5" />
                      </div>
                    </div>
                    {item.type === "series" && item.season && item.episode && (
                      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-[10px] font-bold text-white border border-white/10">
                        S{item.season.padStart(2,"0")} E{item.episode.padStart(2,"0")}
                      </div>
                    )}
                    <button onClick={(e) => handleRemove(e, item.imdbId)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-black transition-colors flex items-center justify-center opacity-0 group-hover/card:opacity-100">
                      <X size={10} />
                    </button>
                  </div>
                  <h3 className="text-white font-medium text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">{item.title}</h3>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{item.year}</p>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <FadeEdge />
      </div>
    </section>
  );
}

function RecommendationsRow() {
  const { t } = useLang();
  const history = getWatchHistory();
  const [recItems, setRecItems] = useState<MediaCardItem[]>([]);
  useEffect(() => {
    if (history.length === 0) return;
    const watchedIds = new Set(history.map((h) => h.imdbId));
    const genreIds: string[] = [];
    for (const genre of GENRES) {
      const unwatched = genre.imdbIds.filter((id) => !watchedIds.has(id));
      genreIds.push(...unwatched.slice(0, 4));
      if (genreIds.length >= 16) break;
    }
    const ids = genreIds.slice(0, 16);
    if (ids.length === 0) return;
    Promise.allSettled(ids.map((id) => fetch(`/api/media/${id}`).then((r) => r.json()))).then((results) => {
      const items: MediaCardItem[] = [];
      for (const r of results) { if (r.status === "fulfilled" && r.value?.imdbId) items.push(r.value as MediaCardItem); }
      setRecItems(items);
    });
  }, []);
  if (history.length === 0 || recItems.length === 0) return null;
  return (
    <section>
      <SectionHeader icon={<Sparkles size={20} className="text-primary" />} title={t("موصى به لك", "Recommended for You")} />
      <div className="relative">
        <div className="flex overflow-x-auto gap-5 pb-6 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {recItems.map((item, i) => <MediaCard key={item.imdbId} item={item} i={i} />)}
        </div>
        <FadeEdge />
      </div>
    </section>
  );
}

function GenresPreview() {
  const { t, isAr } = useLang();
  const preview = GENRES.slice(0, 8);
  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <SectionHeader icon={<Grid3X3 size={20} className="text-primary" />} title={t("تصفح حسب الفئة", "Browse by Genre")} inline />
        <Link href="/genres" className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium group">
          {t("الكل", "See all")}
          <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-3">
        {preview.map((genre, i) => (
          <motion.div key={genre.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link href={`/genre/${genre.id}`}>
              <div className="flex flex-col items-center gap-2.5 p-3 md:p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-primary/50 hover:bg-primary/[0.08] transition-all duration-300 cursor-pointer active:scale-95 group">
                <span className="text-2xl md:text-3xl leading-none">{genre.icon}</span>
                <span className="text-[11px] md:text-xs text-white/70 group-hover:text-primary transition-colors text-center leading-tight font-medium">{isAr ? genre.nameAr : genre.nameEn}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ icon, title, inline = false }: { icon: React.ReactNode; title: string; inline?: boolean }) {
  if (inline) return (
    <div className="flex items-center gap-2.5">
      {icon}
      <h2 className="text-xl md:text-2xl font-serif font-semibold text-white">{title}</h2>
    </div>
  );
  return (
    <div className="flex items-center gap-2.5 mb-6">
      {icon}
      <h2 className="text-xl md:text-2xl font-serif font-semibold text-white">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-2" />
    </div>
  );
}

function FadeEdge() {
  return <div className="absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent pointer-events-none hidden md:block" />;
}

function MediaCard({ item, i }: { item: MediaCardItem; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.4) }}
      className="snap-start flex-shrink-0 w-[150px] md:w-[200px]"
    >
      <Link href={`/watch/${item.imdbId}`} className="group block">
        <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/[0.04] shadow-2xl shadow-black/50 border border-white/[0.08] mb-3">
          {item.poster && item.poster !== "N/A" ? (
            <img src={item.poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              {item.type === "series" ? <Tv size={32} /> : <Film size={32} />}
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-5">
            <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/40 transform translate-y-3 group-hover:translate-y-0 transition-transform duration-300">
              <Play fill="currentColor" size={18} className="ml-0.5" />
            </div>
          </div>

          {item.imdbRating && item.imdbRating !== "N/A" && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-white/10 text-[10px] font-bold text-primary">
              <Star size={8} fill="currentColor" />
              {item.imdbRating}
            </div>
          )}
        </div>
        <h3 className="text-white/90 font-medium text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors duration-200">{item.title}</h3>
        <p className="text-xs text-muted-foreground/60 mt-0.5">{item.year}</p>
      </Link>
    </motion.div>
  );
}

export default function Home() {
  const { t } = useLang();
  const { data: trendingMovies, isLoading: isMoviesLoading } = useGetTrendingMovies();
  const { data: trendingSeries, isLoading: isSeriesLoading } = useGetTrendingSeries();

  const heroMovie = trendingMovies?.results?.[0];
  const heroGenres = heroMovie?.genre?.split(",").slice(0, 3).map((g: string) => g.trim()) ?? [];

  return (
    <div className="flex-1 flex flex-col pb-20">
      {/* ── Hero ── */}
      <section className="relative w-full h-[60vh] sm:h-[72vh] min-h-[440px] sm:min-h-[560px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-background">
          {heroMovie?.poster && heroMovie.poster !== "N/A" ? (
            <>
              <img
                src={heroMovie.poster}
                alt="Hero"
                className="w-full h-full object-cover object-top opacity-50 scale-105"
                style={{ filter: "blur(1px)" }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/40 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-background via-background to-primary/5" />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(var(--color-primary-raw,251,191,36),0.06)_0%,_transparent_60%)]" />
        </div>

        <div className="container max-w-7xl mx-auto px-4 md:px-8 relative z-10 w-full pb-14 md:pb-20">
          <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }} className="max-w-2xl">

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 backdrop-blur-md border border-primary/25 text-xs font-semibold text-primary mb-5 uppercase tracking-widest">
              <TrendingUp size={13} />
              <span>{t("الأكثر مشاهدة", "Trending Now")}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-serif font-bold text-white mb-3 md:mb-4 leading-[1.05] tracking-tight">
              {heroMovie ? heroMovie.title : t("تجربة سينمائية غامرة", "Immersive Cinematic Experience")}
            </h1>

            {/* Meta row */}
            {heroMovie && (
              <div className="flex flex-wrap items-center gap-3 mb-4 md:mb-5">
                {heroMovie.year && (
                  <span className="text-sm text-white/60 font-medium">{heroMovie.year}</span>
                )}
                {heroMovie.imdbRating && heroMovie.imdbRating !== "N/A" && (
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <Star size={13} fill="currentColor" />
                    <span>{heroMovie.imdbRating}</span>
                    <span className="text-white/30 font-normal">/10</span>
                  </div>
                )}
                {heroGenres.map((g) => (
                  <span key={g} className="text-xs px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-white/60 font-medium">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm sm:text-base md:text-lg text-white/60 mb-7 md:mb-9 max-w-xl leading-relaxed line-clamp-2 sm:line-clamp-3">
              {heroMovie?.plot ?? t("ادخل إلى عالم الأفلام واستمتع بأروع القصص السينمائية", "Step into a private screening room. Discover and stream the world's most captivating stories.")}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {heroMovie ? (
                <>
                  <Link
                    href={`/watch/${heroMovie.imdbId}`}
                    className="inline-flex items-center gap-3 px-7 py-3.5 bg-primary text-primary-foreground rounded-full font-semibold text-sm hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/25 active:scale-100"
                  >
                    <Play fill="currentColor" size={16} />
                    <span>{t("شاهد الآن", "Watch Now")}</span>
                  </Link>
                  <Link
                    href={`/watch/${heroMovie.imdbId}`}
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-white/8 hover:bg-white/14 border border-white/12 rounded-full text-white/80 hover:text-white font-medium text-sm transition-all backdrop-blur-sm"
                  >
                    <Info size={15} />
                    <span>{t("تفاصيل", "Details")}</span>
                  </Link>
                </>
              ) : (
                <div className="flex gap-3">
                  <div className="h-12 w-36 bg-white/8 rounded-full animate-pulse" />
                  <div className="h-12 w-28 bg-white/5 rounded-full animate-pulse" />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Content Sections ── */}
      <div className="container max-w-7xl mx-auto px-4 md:px-8 mt-10 md:mt-14 space-y-16 md:space-y-20 relative z-20">
        <ContinueWatchingRow />
        <RecommendationsRow />
        <GenresPreview />

        {/* Trending Movies */}
        <section>
          <SectionHeader icon={<Film size={20} className="text-primary" />} title={t("أفلام رائجة", "Trending Movies")} />
          <div className="relative">
            <div className="flex overflow-x-auto gap-5 pb-6 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
              {isMoviesLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                : trendingMovies?.results?.map((movie, i) => <MediaCard key={movie.imdbId} item={movie} i={i} />)
              }
            </div>
            <FadeEdge />
          </div>
        </section>

        {/* Trending Series */}
        <section>
          <SectionHeader icon={<Tv size={20} className="text-primary" />} title={t("مسلسلات رائجة", "Trending Series")} />
          <div className="relative">
            <div className="flex overflow-x-auto gap-5 pb-6 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
              {isSeriesLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                : trendingSeries?.results?.map((series, i) => <MediaCard key={series.imdbId} item={series} i={i} />)
              }
            </div>
            <FadeEdge />
          </div>
        </section>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="snap-start flex-shrink-0 w-[150px] md:w-[200px]">
      <div className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse mb-3 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/3 to-transparent skeleton-shimmer" />
      </div>
      <div className="h-3.5 bg-white/5 rounded-full animate-pulse mb-2 w-4/5" />
      <div className="h-2.5 bg-white/5 rounded-full animate-pulse w-1/2" />
    </div>
  );
}
