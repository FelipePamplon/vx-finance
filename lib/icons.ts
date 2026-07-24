import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Briefcase,
  CreditCard,
  Gift,
  Plane,
  Heart,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "shopping-cart": ShoppingCart,
  home: Home,
  car: Car,
  utensils: Utensils,
  briefcase: Briefcase,
  "credit-card": CreditCard,
  gift: Gift,
  plane: Plane,
  heart: Heart,
};

export const CATEGORY_ICON_OPTIONS = Object.keys(CATEGORY_ICONS);
