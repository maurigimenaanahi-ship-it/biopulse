export type NewsItem = {
  id: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  language: string | null;
  publishedAt: string | null;
  sourceCountry: string | null;
  image: string | null;
  summary: string | null;
};

export type NewsResponse = {
  query: string;
  count: number;
  items: NewsItem[];
  range?: { days: number; start: string; end: string };
  gdelt?: { ok?: boolean; status?: number | string; [key: string]: unknown } | null;
  fetched_at?: string;
};
