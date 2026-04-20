export interface LibraryItem {
  _id: string;
  _type: "generation" | "upload";
  originalName?: string;
  prompt?: string;
  audioUrl?: string;
  duration?: number;
  isFavorited: boolean;
  createdAt: string;
  status?: string;
}

export interface Collection {
  _id: string;
  name: string;
  items: { refId: string; refModel: string; addedAt: string }[];
}

export type TypeFilter   = "all" | "generation" | "upload";
export type SortBy       = "newest" | "oldest" | "longest" | "shortest";
export type StatusFilter = "all" | "done" | "failed" | "processing";
