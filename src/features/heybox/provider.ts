import type { PageResult } from '../../shared/lib/resource';
export type Post = {
  id: string;
  title: string;
  author: string;
  cover?: string;
  excerpt: string;
  publishedAt: string;
  commentCount: number;
};
export type Comment = { id: string; author: string; text: string; publishedAt: string };
export type PostDetail = Post & { body: string; images: string[]; comments: Comment[] };
export interface HeyBoxProvider {
  recommend(signal: AbortSignal): Promise<PageResult<Post>>;
  discussion(signal: AbortSignal): Promise<PageResult<Post>>;
  search(query: string, page: number, signal: AbortSignal): Promise<PageResult<Post>>;
  detail(id: string, signal: AbortSignal): Promise<PostDetail>;
}
