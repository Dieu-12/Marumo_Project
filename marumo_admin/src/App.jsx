import { BrowserRouter } from 'react-router-dom';
import { AdminStoreProvider } from './hooks/useAdminStore.jsx';
import { AppRoutes } from './routes/AppRoutes.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AdminStoreProvider>
        <AppRoutes />
      </AdminStoreProvider>
    </BrowserRouter>
  );
}
