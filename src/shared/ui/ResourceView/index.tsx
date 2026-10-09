import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Resource } from '../../lib/resource';
import { EmptyState } from '../EmptyState';
import { Button } from '../Button';

export function ResourceView<T>({
  state,
  children,
  retry,
  label = '服务',
  empty,
}: {
  state: Resource<T>;
  children: (data: T) => ReactNode;
  retry?: () => void;
  label?: string;
  empty?: string;
}) {
  if (state.status === 'unconfigured')
    return (
      <EmptyState title={`${label}尚未接入`} description={empty ?? '接入后，内容会显示在这里。'} />
    );
  if (state.status === 'loading')
    return (
      <div className="ui-resource-loading" role="status">
        <LoaderCircle className="ui-spin" />
        正在加载…
        <div className="ui-skeleton" />
        <div className="ui-skeleton" />
        <div className="ui-skeleton" />
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="ui-resource-error" role="alert">
        <p>暂时无法获取内容</p>
        <small>{state.message}</small>
        {retry && <Button onClick={retry}>重试</Button>}
      </div>
    );
  return children(state.data);
}
