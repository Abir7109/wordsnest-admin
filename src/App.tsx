import { useState } from 'react';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Words from './pages/Words';
import Searches from './pages/Searches';
import Quizzes from './pages/Quizzes';
import AppControl from './pages/AppControl';
import Notifications from './pages/Notifications';
import Analytics from './pages/Analytics';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'words', label: 'Saved Words', icon: '📖' },
  { id: 'searches', label: 'Searches', icon: '🔍' },
  { id: 'quizzes', label: 'Quizzes', icon: '🧠' },
  { id: 'appcontrol', label: 'App Control', icon: '⚙️' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

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
