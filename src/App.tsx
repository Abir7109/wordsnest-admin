import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Words from './pages/Words';
import Searches from './pages/Searches';
import Quizzes from './pages/Quizzes';
import AppControl from './pages/AppControl';
import Notifications from './pages/Notifications';
import Analytics from './pages/Analytics';
import { LayoutDashboard, Users as UsersIcon, BookOpen, Search, Brain, Settings, Bell, BarChart3 } from 'lucide-react';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'words', label: 'Saved Words', icon: BookOpen },
  { id: 'searches', label: 'Searches', icon: Search },
  { id: 'quizzes', label: 'Quizzes', icon: Brain },
  { id: 'appcontrol', label: 'App Control', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

function getTabFromHash() {
  const hash = window.location.hash.replace('#', '');
  const match = tabs.find(t => t.id === hash);
  return match ? match.id : null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState(getTabFromHash() || 'dashboard');

  useEffect(() => {
    const onHashChange = () => {
      const id = getTabFromHash();
      if (id) setActiveTab(id);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'users': return <Users />;
      case 'words': return <Words />;
      case 'searches': return <Searches />;
      case 'quizzes': return <Quizzes />;
      case 'appcontrol': return <AppControl />;
      case 'notifications': return <Notifications />;
      case 'analytics': return <Analytics />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      {renderPage()}
    </Layout>
  );
}
