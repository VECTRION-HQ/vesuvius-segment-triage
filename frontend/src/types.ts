export interface SegmentRecord {
  id: string;
  statuses: string[];
  display_statuses: string[];
  is_untagged: boolean;
  tag_users: Record<string, string>;
  tag_dates: Record<string, string>;
  area_cm2: number | null;
  author: string | null;
  layer_count: number | null;
  has_ink_prediction: boolean;
  rendered: boolean;
  volume: string | null;
  created: string | null;
  superseded: boolean;
  date_last_modified: string | null;
  vc_gsfs_mode: string | null;
  avg_cost: number | null;
  uuid: string | null;
  meta_format: string;
  source: string;
  warnings: string[];
}

export interface FilterPreset {
  key: string;
  label: string;
  help: string;
}

export interface Summary {
  total: number;
  tagged: number;
  rendered: number;
  superseded: number;
  by_status: Record<string, number>;
  total_area_cm2: number;
  area_known: number;
  pct_approved: number;
}

export interface Manifest {
  tool: string;
  version: string;
  source: string;
  is_demo: boolean;
  summary: Summary;
  config: {
    statuses: string[];
    untagged: string;
    labels: Record<string, string>;
    filters: FilterPreset[];
  };
  segments: SegmentRecord[];
}
