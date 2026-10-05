import { useCallback, useState } from 'react';
import { MessageCircle, MessagesSquare, Image as ImageIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  Dialog,
  EmptyState,
  PageHeader,
  Panel,
  ResourceView,
  SearchBox,
  Tabs,
} from '../../shared/ui';
import { Clock } from '../home/HomePage';
import { useServices } from '../../app/services';
import { useResource } from '../../shared/lib/useResource';

const tabs = [
  { value: 'recommend', label: '推荐' },
  { value: 'discussion', label: '游戏讨论' },
  { value: 'recent', label: '最近浏览' },
];
export function HeyBoxPage() {
  const { heybox } = useServices();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((item) => item.value === params.get('tab'))
    ? params.get('tab')!
    : 'recommend';
  const query = params.get('q') ?? '';
  const id = params.get('post');
  const [draft, setDraft] = useState(query);
  const [image, setImage] = useState<string | null>(null);
  const loadFeed = useCallback(
    (signal: AbortSignal) =>
      query
        ? heybox!.search(query, 1, signal)
        : tab === 'discussion'
          ? heybox!.discussion(signal)
          : heybox!.recommend(signal),
    [heybox, query, tab],
  );
  const feed = useResource(heybox && tab !== 'recent' ? loadFeed : undefined);
  const loadPost = useCallback((signal: AbortSignal) => heybox!.detail(id!, signal), [heybox, id]);
  const detail = useResource(heybox && id ? loadPost : undefined);
  return (
    <>
      <PageHeader title="小黑盒" subtitle={heybox ? undefined : '尚未连接'} right={<Clock />} />
      <div className="heybox-layout">
        <Panel className="post-feed">
          <Tabs items={tabs} value={tab} onChange={(value) => setParams({ tab: value })} />
          <ResourceView
            state={feed.state}
            label={tab === 'recent' ? '浏览记录' : '小黑盒'}
            retry={feed.retry}
          >
            {(data) =>
              data.items.length ? (
                data.items.map((post) => (
                  <button
                    className={`post-row ${post.id === id ? 'active' : ''}`}
                    key={post.id}
                    onClick={() => setParams({ tab, q: query, post: post.id })}
                  >
                    {post.cover ? (
                      <img className="cover" src={post.cover} alt="" />
                    ) : (
                      <div className="cover empty-art">
                        <MessagesSquare />
                      </div>
                    )}
                    <div className="grow">
                      <h3>{post.title}</h3>
                      <small>
                        {post.author} · {new Date(post.publishedAt).toLocaleString()}
                      </small>
                      <p className="excerpt">{post.excerpt}</p>
                      <small>
                        <MessageCircle />
                        {post.commentCount}
                      </small>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState title="暂无帖子" icon={MessagesSquare} />
              )
            }
          </ResourceView>
        </Panel>
        <Panel className="post-detail">
          <SearchBox
            placeholder="搜索帖子"
            value={draft}
            onChange={setDraft}
            onSubmit={() => setParams({ tab: 'recommend', q: draft.trim() })}
          />
          <ResourceView
            state={detail.state}
            label="帖子详情"
            retry={detail.retry}
            empty="选择帖子后，在这里查看正文、图片和评论。"
          >
            {(post) => (
              <>
                <h2>{post.title}</h2>
                <small>
                  {post.author} · {new Date(post.publishedAt).toLocaleString()}
                </small>
                {post.images.map((url) => (
                  <button
                    className="post-image"
                    key={url}
                    onClick={() => setImage(url)}
                    aria-label="查看帖子大图"
                  >
                    <img className="cover" src={url} alt="帖子图片" />
                  </button>
                ))}
                <p className="plain-text">{post.body}</p>
                <h3 className="comments-head">评论（{post.comments.length}）</h3>
                {post.comments.map((comment) => (
                  <div className="comment" key={comment.id}>
                    <strong>{comment.author}</strong>
                    <small>{new Date(comment.publishedAt).toLocaleString()}</small>
                    <p>{comment.text}</p>
                  </div>
                ))}
                {!post.comments.length && (
                  <EmptyState compact title="还没有评论" icon={MessageCircle} />
                )}
              </>
            )}
          </ResourceView>
          {detail.state.status === 'unconfigured' && (
            <>
              <div className="media-well">
                <ImageIcon />
                <small>帖子图片</small>
              </div>
              <h3 className="comments-head">评论</h3>
              <EmptyState compact title="暂无评论内容" icon={MessageCircle} />
            </>
          )}
        </Panel>
      </div>
      <Dialog title="帖子图片" open={!!image} onClose={() => setImage(null)} wide>
        {image && <img className="lightbox-image" src={image} alt="帖子大图" />}
      </Dialog>
    </>
  );
}
