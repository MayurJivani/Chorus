import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SessionProvider } from './hooks/useSession';
import { RootLayout } from './routes/RootLayout';
import { HomePage } from './routes/HomePage';
import { PlayPage } from './routes/PlayPage';
import { StatsPage } from './routes/StatsPage';
import { LoginPage } from './routes/LoginPage';
import { RegisterPage } from './routes/RegisterPage';
import { AboutPage } from './routes/AboutPage';
import { ArtistSearchPage } from './routes/ArtistSearchPage';
import { ArtistPlayPage } from './routes/ArtistPlayPage';

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/play', element: <PlayPage /> },
      { path: '/stats', element: <StatsPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '/artist', element: <ArtistSearchPage /> },
      { path: '/artist/:artistId/play', element: <ArtistPlayPage /> },
    ],
  },
]);

function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}

export default App;
