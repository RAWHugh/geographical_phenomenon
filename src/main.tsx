import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './topics/topics.css';
import { topicIconUrl, topicIds, topicNames } from './topics/topic-data';
import type { TopicPage } from './topics/topic-data';

const Topics = lazy(() => import('./topics/Topics'));
const SeasonalComparison = lazy(() => import('./topics/SeasonalComparison'));
const siteTitle = '自然地理可视化';
const pageIcon = document.querySelector<HTMLLinkElement>('#page-icon');
const homeIcon = pageIcon && { href: pageIcon.href, type: pageIcon.type, sizes: pageIcon.sizes.value };
const getTopic = (): TopicPage | 'solar' => topicIds.find(topic => location.hash === `#${topic}`) ?? 'solar';

function Explorer() {
  const [topic, setTopic] = useState(getTopic);
  const [solarVisited, setSolarVisited] = useState(() => getTopic() === 'solar');
  useEffect(() => {
    const change = () => {
      const next = getTopic();
      setTopic(next);
      if (next === 'solar') setSolarVisited(true);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = topic === 'solar' ? siteTitle : `${topicNames[topic]} · ${siteTitle}`;
    if (pageIcon && homeIcon) {
      const icon = topic === 'solar' ? homeIcon : { href: topicIconUrl(topic), type: 'image/svg+xml', sizes: 'any' };
      pageIcon.type = icon.type;
      pageIcon.sizes.value = icon.sizes;
      pageIcon.href = icon.href;
    }
    if (topic !== 'solar' || location.hash === '' || location.hash === '#') {
      window.scrollTo(0, 0);
    }
  }, [topic]);
  return <>
    {(solarVisited || topic === 'solar') && <App active={topic === 'solar'} />}
    {topic !== 'solar' && <Suspense fallback={<p className="shell topic-status" role="status">正在打开专题…</p>}>
      {topic === 'compare' ? <SeasonalComparison /> : <Topics key={topic} topic={topic} />}
    </Suspense>}
  </>;
}

createRoot(document.getElementById('root')!).render(<Explorer />);
