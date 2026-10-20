import {
  Activity, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowLeftRight, ArrowUp, ArrowUpRight,
  Bell, Building2, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  ChevronsUpDown, CircleHelp, Cpu, CreditCard, Database, Download, EllipsisVertical, Eye,
  EyeOff, FileText, Gauge, GripVertical, House, Inbox, Info, Layers, LayoutDashboard, Link,
  ListChecks, Mail, Menu, Mic, Square, Minus, Moon, Network, Palette, Paperclip, Pencil, Pentagon, Plus,
  Package, Receipt, Repeat, RotateCcw, ScanLine, Search, Settings, ShieldCheck, ShoppingCart, SlidersHorizontal,
  Smartphone, Smile, Sparkles, Sun, Target, Trash2, TrendingDown, TrendingUp, TriangleAlert, Upload,
  User, Users, Workflow, X, Camera, ScanFace, Glasses, Lock, Landmark, Coins, type LucideIcon,
} from "lucide-react";

/**
 * O conjunto de ícones do sistema — **Lucide** (lucide.dev, `lucide-react`).
 *
 * ⚠️ As CHAVES são do sistema, não do Lucide: as telas pedem `"house"`,
 * `"trash-2"`, `"edit"`… e este mapa diz qual glifo responde. Trocar de set é
 * reescrever este mapa, não as telas. Import por nome, um a um: o bundle leva
 * só os glifos listados aqui.
 *
 * Chave que não está aqui não renderiza nada — `npm run home-sugestoes` e o
 * `engine-audit` cobram que os ícones pedidos existam.
 */
export const LUCIDE_ICONS = {
  activity: Activity,
  camera: Camera,
  "scan-face": ScanFace,
  glasses: Glasses,
  lock: Lock,
  landmark: Landmark,
  coins: Coins,
  "arrow-down": ArrowDown,
  "arrow-down-to-line": ArrowDownToLine,
  "arrow-left": ArrowLeft,
  "arrow-left-right": ArrowLeftRight,
  "arrow-up": ArrowUp,
  "arrow-up-right": ArrowUpRight,
  bell: Bell,
  building: Building2,
  calendar: Calendar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "chevrons-up-down": ChevronsUpDown,
  cpu: Cpu,
  "credit-card": CreditCard,
  database: Database,
  download: Download,
  edit: Pencil,
  eye: Eye,
  "eye-off": EyeOff,
  "file-text": FileText,
  gauge: Gauge,
  "grip-vertical": GripVertical,
  "help-circle": CircleHelp,
  house: House,
  inbox: Inbox,
  inicio: Pentagon,
  info: Info,
  layers: Layers,
  "layout-dashboard": LayoutDashboard,
  link: Link,
  "list-checks": ListChecks,
  mail: Mail,
  menu: Menu,
  minus: Minus,
  moon: Moon,
  "more-vertical": EllipsisVertical,
  network: Network,
  package: Package,
  palette: Palette,
  paperclip: Paperclip,
  plus: Plus,
  receipt: Receipt,
  repeat: Repeat,
  "rotate-ccw": RotateCcw,
  "scan-line": ScanLine,
  search: Search,
  settings: Settings,
  "sliders-horizontal": SlidersHorizontal,
  "shield-check": ShieldCheck,
  "shopping-cart": ShoppingCart,
  smartphone: Smartphone,
  smile: Smile,
  sparkles: Sparkles,
  sun: Sun,
  target: Target,
  "trash-2": Trash2,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  "triangle-alert": TriangleAlert,
  upload: Upload,
  user: User,
  users: Users,
  workflow: Workflow,
  x: X,
  mic: Mic,
  square: Square,
} satisfies Record<string, LucideIcon>;

export type LucideIconKey = keyof typeof LUCIDE_ICONS;

/** O ícone existe no conjunto? (para as guardas e para quem recebe chave de fora) */
export const iconeExiste = (nome: string): nome is LucideIconKey =>
  Object.prototype.hasOwnProperty.call(LUCIDE_ICONS, nome);
