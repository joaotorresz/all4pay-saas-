import * as React from "react";
import {
  House,
  ArrowLeftRight,
  Repeat,
  TrendingUp,
  FileText,
  CreditCard,
  Settings,
  LifeBuoy,
  Plus,
  Search,
  ChevronsUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ArrowUp,
  ArrowDownToLine,
  X,
  Check,
  Workflow,
  ListChecks,
  Gauge,
  AlertTriangle,
  Users,
  ShieldCheck,
  Activity,
  Network,
  Layers,
  Target,
  Database,
  Building2,
  Cpu,
  Receipt,
  CircleHelp,
  UploadCloud,
  GripVertical,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";

/**
 * all4pay DS — Icon
 * Thin linear / outline icons (Lucide), monochrome, ~1.75 stroke.
 * Color inherits via currentColor. Substitution for the product's icon
 * set — swap the registry when the real set is available.
 */
const registry: Record<string, LucideIcon> = {
  house: House,
  "arrow-left-right": ArrowLeftRight,
  repeat: Repeat,
  "trending-up": TrendingUp,
  "file-text": FileText,
  "credit-card": CreditCard,
  settings: Settings,
  "life-buoy": LifeBuoy,
  plus: Plus,
  search: Search,
  "chevrons-up-down": ChevronsUpDown,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  sparkles: Sparkles,
  "arrow-up-right": ArrowUpRight,
  "arrow-up": ArrowUp,
  "arrow-down-to-line": ArrowDownToLine,
  x: X,
  check: Check,
  workflow: Workflow,
  "list-checks": ListChecks,
  gauge: Gauge,
  "triangle-alert": AlertTriangle,
  users: Users,
  "shield-check": ShieldCheck,
  activity: Activity,
  network: Network,
  layers: Layers,
  target: Target,
  database: Database,
  building: Building2,
  cpu: Cpu,
  receipt: Receipt,
  "help-circle": CircleHelp,
  upload: UploadCloud,
  "grip-vertical": GripVertical,
  sun: Sun,
  moon: Moon,
};

export type IconName = keyof typeof registry;

export interface IconProps {
  name: IconName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  strokeWidth = 1.75,
  className,
}: IconProps) {
  const Glyph = registry[name];
  if (!Glyph) return null;
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}
