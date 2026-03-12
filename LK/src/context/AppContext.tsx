import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface PlaylistItem {
  id: number;
  name: string;
  description?: string;
  trackCount: number;
  likes: number;
  pinned: boolean;
  covers: string[];
  isPublic?: boolean;
}

export type ModalType =
  | "create-playlist"
  | "listen-together"
  | "share"
  | "playlist-detail"
  | null;

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "info";
}

interface AppContextType {
  activeModal: ModalType;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  toasts: ToastItem[];
  addToast: (message: string, type?: "success" | "info") => void;
  isSubscribed: boolean;
  toggleSubscribe: () => void;
  isListeningTogether: boolean;
  setListeningTogether: (v: boolean) => void;
  selectedPlaylist: PlaylistItem | null;
  setSelectedPlaylist: (pl: PlaylistItem | null) => void;
  allPlaylists: PlaylistItem[];
  createPlaylist: (name: string, desc: string, isPublic: boolean) => void;
  joinedLiveRoom: boolean;
  setJoinedLiveRoom: (v: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

let tid = 0;

const defaultPlaylists: PlaylistItem[] = [
  {
    id: 1,
    name: "Ночной драйв",
    description: "Треки для ночных поездок по городу",
    trackCount: 47,
    likes: 312,
    pinned: true,
    isPublic: true,
    covers: [
      "https://picsum.photos/seed/p1a/150/150",
      "https://picsum.photos/seed/p1b/150/150",
      "https://picsum.photos/seed/p1c/150/150",
      "https://picsum.photos/seed/p1d/150/150",
    ],
  },
  {
    id: 2,
    name: "Утренний кофе",
    description: "Лёгкая музыка для начала дня",
    trackCount: 32,
    likes: 189,
    pinned: true,
    isPublic: true,
    covers: [
      "https://picsum.photos/seed/p2a/150/150",
      "https://picsum.photos/seed/p2b/150/150",
      "https://picsum.photos/seed/p2c/150/150",
      "https://picsum.photos/seed/p2d/150/150",
    ],
  },
  {
    id: 3,
    name: "Deep Focus",
    description: "Для глубокой концентрации",
    trackCount: 56,
    likes: 94,
    pinned: false,
    isPublic: true,
    covers: [
      "https://picsum.photos/seed/p3a/150/150",
      "https://picsum.photos/seed/p3b/150/150",
      "https://picsum.photos/seed/p3c/150/150",
      "https://picsum.photos/seed/p3d/150/150",
    ],
  },
  {
    id: 4,
    name: "Melancholy Mix",
    description: "Меланхоличные мелодии",
    trackCount: 28,
    likes: 67,
    pinned: false,
    isPublic: true,
    covers: [
      "https://picsum.photos/seed/p4a/150/150",
      "https://picsum.photos/seed/p4b/150/150",
      "https://picsum.photos/seed/p4c/150/150",
      "https://picsum.photos/seed/p4d/150/150",
    ],
  },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isListeningTogether, setListeningTogether] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] =
    useState<PlaylistItem | null>(null);
  const [allPlaylists, setAllPlaylists] =
    useState<PlaylistItem[]>(defaultPlaylists);
  const [joinedLiveRoom, setJoinedLiveRoom] = useState(false);

  const openModal = useCallback(
    (m: ModalType) => setActiveModal(m),
    [],
  );
  const closeModal = useCallback(() => setActiveModal(null), []);

  const addToast = useCallback(
    (message: string, type: "success" | "info" = "success") => {
      const id = ++tid;
      setToasts((p) => [...p, { id, message, type }]);
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
    },
    [],
  );

  const toggleSubscribe = useCallback(
    () => setIsSubscribed((p) => !p),
    [],
  );

  const createPlaylist = useCallback(
    (name: string, description: string, isPublic: boolean) => {
      const id = Date.now();
      setAllPlaylists((p) => [
        {
          id,
          name,
          description,
          trackCount: 0,
          likes: 0,
          pinned: false,
          isPublic,
          covers: [
            `https://picsum.photos/seed/n${id}a/150/150`,
            `https://picsum.photos/seed/n${id}b/150/150`,
            `https://picsum.photos/seed/n${id}c/150/150`,
            `https://picsum.photos/seed/n${id}d/150/150`,
          ],
        },
        ...p,
      ]);
      setActiveModal(null);
    },
    [],
  );

  return (
    <AppContext.Provider
      value={{
        activeModal,
        openModal,
        closeModal,
        toasts,
        addToast,
        isSubscribed,
        toggleSubscribe,
        isListeningTogether,
        setListeningTogether,
        selectedPlaylist,
        setSelectedPlaylist,
        allPlaylists,
        createPlaylist,
        joinedLiveRoom,
        setJoinedLiveRoom,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
