import { Button, EmptyState, PageHeader } from '../components/ProductUI';

export default function NotFound({navigate}){
  return <div className="module">
    <PageHeader eyebrow="JakeOS" title="Page not found" subtitle="This route does not point to a current JakeOS workspace or record."/>
    <EmptyState icon="search" title="Nothing lives at this address" body="Return to Executive or use Search to find the work, project, opportunity or relationship you were looking for." action={<div className="px-row"><Button onClick={()=>navigate('dashboard')}>Executive</Button><Button variant="secondary" icon="search" onClick={()=>navigate('ai-search')}>Search JakeOS</Button></div>}/>
  </div>;
}
