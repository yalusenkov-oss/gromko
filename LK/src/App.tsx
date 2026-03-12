import { AppProvider } from "./context/AppContext";
import { Header } from "./components/Header";
import { ProfileCard, MusicTaste, LeftColumn } from "./components/LeftColumn";
import { NowPlaying, Playlists, Recommendations, ActivityFeed, RecentlyListened, CenterColumn } from "./components/CenterColumn";
import { LiveRoomWidget, FriendsList, AchievementsSection, RightColumn } from "./components/RightColumn";
import { Modals } from "./components/Modals";
import { ToastContainer } from "./components/Toast";
import { MobileBottomNav } from "./components/MobileBottomNav";

export function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-gromq-bg text-gromq-text pb-16 lg:pb-0">
        <Header />
        <main className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          {/* ── Desktop: 3-column layout ── */}
          <div className="hidden lg:flex gap-5">
            <LeftColumn />
            <CenterColumn />
            <RightColumn />
          </div>

          {/* ── Mobile: optimized single-column order ── */}
          <div className="lg:hidden space-y-3 sm:space-y-4">
            {/* 1. Identity — who is this person */}
            <ProfileCard />
            {/* 2. What's playing RIGHT NOW — the core feature */}
            <NowPlaying />
            {/* 3. Live room — social listening entry point */}
            <LiveRoomWidget />
            {/* 4. Playlists — what they created */}
            <Playlists />
            {/* 5. Their curated picks */}
            <Recommendations />
            {/* 6. Recent listens — visual, swipeable */}
            <RecentlyListened />
            {/* 7. Friends with status — social context */}
            <FriendsList />
            {/* 8. Activity feed — scrollable timeline */}
            <ActivityFeed />
            {/* 9. Music taste — identity deep dive (not primary) */}
            <MusicTaste />
            {/* 10. Achievements — bonus info */}
            <AchievementsSection />
          </div>
        </main>
        <Modals />
        <ToastContainer />
        <MobileBottomNav />
      </div>
    </AppProvider>
  );
}
